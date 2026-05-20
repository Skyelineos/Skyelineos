// QuickBooks Online OAuth handler.
//
// Two endpoints under one HTTP function `qboOAuth`:
//   GET /start    — generates a state token + redirects to Intuit's authorize URL
//   GET /callback — receives ?code & ?realmId, exchanges for tokens, stores them
//
// Tokens land in Firestore at `qboConnections/global` so the whole company
// shares one QBO connection (Tyler's). Access tokens last 1 hour; refresh
// tokens last 100 days and rotate on every refresh.

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import express from 'express';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const QBO_CLIENT_ID     = defineSecret('QBO_CLIENT_ID');
const QBO_CLIENT_SECRET = defineSecret('QBO_CLIENT_SECRET');
const QBO_ENV           = defineSecret('QBO_ENV'); // "sandbox" | "production"

const APP_BASE_URL = 'https://skyelineos.web.app';
const REDIRECT_URI = 'https://us-central1-skyelineos.cloudfunctions.net/qboOAuth/callback';

function authorizeUrlBase(env: string): string {
  // QBO uses the same auth host for both sandbox and production; the
  // difference is which company you can connect to.
  return 'https://appcenter.intuit.com/connect/oauth2';
}
function tokenEndpoint(): string {
  return 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
}

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// GET /start — Tyler hits this from the app's "Connect to QuickBooks" button.
// We make a state token (random nonce) so the callback can verify it later.
app.get('/start', async (req: any, res: any) => {
  try {
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    // Store the state ephemerally so the callback can verify it. 10-minute window.
    await db.collection('qboOAuthStates').doc(state).set({
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      origin: req.query.origin || APP_BASE_URL,
    });
    const params = new URLSearchParams({
      client_id: QBO_CLIENT_ID.value(),
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: REDIRECT_URI,
      state,
    });
    res.redirect(`${authorizeUrlBase(QBO_ENV.value())}?${params.toString()}`);
  } catch (e: any) {
    console.error('[qboOAuth/start] failed:', e);
    res.status(500).send(`Failed to start OAuth: ${e?.message || 'unknown'}`);
  }
});

// GET /callback — Intuit redirects here after the user grants access.
// Query params we care about: code, state, realmId.
app.get('/callback', async (req: any, res: any) => {
  const { code, state, realmId, error: oauthError, error_description } = req.query;
  if (oauthError) {
    return res.status(400).send(`<h2>Connection cancelled</h2><p>${oauthError}: ${error_description || ''}</p><p><a href="${APP_BASE_URL}/settings">Back to Skyeline OS</a></p>`);
  }
  if (!code || !state || !realmId) {
    return res.status(400).send('Missing code / state / realmId');
  }
  try {
    // Verify state token
    const stateDoc = await db.collection('qboOAuthStates').doc(String(state)).get();
    if (!stateDoc.exists) {
      return res.status(400).send('Invalid state token (might be expired). Restart the connection from Skyeline OS.');
    }
    await stateDoc.ref.delete();

    // Exchange code for tokens
    const basic = Buffer.from(`${QBO_CLIENT_ID.value()}:${QBO_CLIENT_SECRET.value()}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: REDIRECT_URI,
    });
    const tokenRes = await fetch(tokenEndpoint(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body: body.toString(),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('[qboOAuth/callback] token exchange failed:', tokenRes.status, text);
      return res.status(500).send(`Token exchange failed: ${tokenRes.status} ${text}`);
    }
    const tokens: any = await tokenRes.json();
    // tokens: { access_token, refresh_token, x_refresh_token_expires_in, expires_in, token_type }
    const accessExpiresAt = Date.now() + (tokens.expires_in * 1000);
    const refreshExpiresAt = Date.now() + (tokens.x_refresh_token_expires_in * 1000);

    await db.collection('qboConnections').doc('global').set({
      realmId: String(realmId),
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: accessExpiresAt,
      refreshTokenExpiresAt: refreshExpiresAt,
      tokenType: tokens.token_type,
      env: QBO_ENV.value(),
      scope: 'com.intuit.quickbooks.accounting',
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.send(`
      <!doctype html>
      <html><head><meta charset="utf-8"><title>QuickBooks connected</title>
      <style>
        body { font-family: -apple-system, sans-serif; max-width: 480px; margin: 80px auto; text-align: center; }
        .check { font-size: 64px; color: #22c55e; }
        a { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #C9A96E; color: #141414; text-decoration: none; border-radius: 6px; font-weight: 600; }
      </style>
      </head><body>
        <div class="check">✓</div>
        <h2>QuickBooks connected</h2>
        <p>Skyeline OS is now linked to your QuickBooks <strong>${QBO_ENV.value()}</strong> company (realm <code>${realmId}</code>).</p>
        <a href="${APP_BASE_URL}/settings">Back to Skyeline OS</a>
      </body></html>
    `);
  } catch (e: any) {
    console.error('[qboOAuth/callback] failed:', e);
    res.status(500).send(`Callback failed: ${e?.message || 'unknown'}`);
  }
});

export const qboOAuth = onRequest(
  {
    secrets: [QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_ENV],
    cors: false,
  },
  app,
);
