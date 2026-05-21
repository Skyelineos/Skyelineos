// Ingestion Lab — Gmail + Drive OAuth flows.
//
// Routes register onto the shared Express app (the api Cloud Function) via
// registerIngestionLabOAuth(app, db). They do NOT export their own onRequest
// function — new standalone Cloud Run services are blocked by org IAM policy.
//
// Flow:
//   1. Client POSTs to /api/ingestionLab/oauth/{provider}/start with an admin
//      Firebase ID token. Server mints a state nonce, persists it under
//      ingestion_lab/data/oauth_states/{state}, returns the Google authorize
//      URL. Client navigates to it.
//   2. Google redirects to /api/ingestionLab/oauth/{provider}/callback with
//      a code + state. Server verifies + consumes the state, exchanges code
//      for tokens, resolves the connected account email via userinfo, and
//      writes the connection record to ingestion_lab/config under the
//      provider key (gmail or drive).
//
// Secrets required (Secret Manager): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.
// Add the matching redirect URIs to the Google Cloud OAuth client:
//   https://skyelineos.web.app/api/ingestionLab/oauth/gmail/callback
//   https://skyelineos.web.app/api/ingestionLab/oauth/drive/callback

import * as admin from 'firebase-admin';
import type { Express } from 'express';
import { adminOnly } from './adminAuth';

const APP_BASE = 'https://skyelineos.web.app';

type Provider = 'gmail' | 'drive';

// openid + email are included so we can resolve the connected account email
// via the userinfo endpoint after token exchange — without surfacing email
// on the connection card the UI can't say which account is linked.
const SCOPES: Record<Provider, string> = {
  gmail: 'https://www.googleapis.com/auth/gmail.readonly openid email',
  drive: 'https://www.googleapis.com/auth/drive.readonly openid email',
};

function redirectUri(provider: Provider): string {
  return `${APP_BASE}/api/ingestionLab/oauth/${provider}/callback`;
}

// .trim() the Secret Manager values — they often carry a trailing newline
// that breaks both authorize URL params and token exchange form bodies.
// Same lesson learned in the QBO OAuth flow (index.ts:1922 comment).
function googleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID || '').trim();
}
function googleClientSecret(): string {
  return (process.env.GOOGLE_CLIENT_SECRET || '').trim();
}

function statesRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('data').collection('oauth_states');
}
function configRef(db: FirebaseFirestore.Firestore) {
  return db.collection('ingestion_lab').doc('config');
}

// Public registration entry — called from index.ts after the Express app is
// constructed. Wires up start + callback pairs for both providers.
export function registerIngestionLabOAuth(app: Express, db: FirebaseFirestore.Firestore): void {
  for (const provider of ['gmail', 'drive'] as Provider[]) {
    registerProviderRoutes(app, db, provider);
  }
}

function registerProviderRoutes(
  app: Express,
  db: FirebaseFirestore.Firestore,
  provider: Provider,
): void {
  // POST /api/ingestionLab/oauth/{provider}/start — admin-only.
  // Returns { url } — the client does window.location.href = url to navigate.
  // We deliberately use POST (not a redirect from /start itself) so we can
  // require a Bearer token; a browser top-level GET navigation cannot carry
  // custom headers.
  app.post(`/api/ingestionLab/oauth/${provider}/start`, adminOnly, async (req: any, res: any) => {
    try {
      const state = randomState();
      await statesRef(db).doc(state).set({
        state,
        provider,
        adminUid: req.user.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const params = new URLSearchParams({
        client_id: googleClientId(),
        response_type: 'code',
        scope: SCOPES[provider],
        redirect_uri: redirectUri(provider),
        access_type: 'offline',       // ask for a refresh token
        include_granted_scopes: 'true',
        prompt: 'consent',            // force consent so we always get refresh_token
        state,
      });
      res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
    } catch (e: any) {
      console.error(`[ingestionLab/oauth/${provider}/start] failed:`, e);
      res.status(500).json({ error: e?.message || 'unknown' });
    }
  });

  // GET /api/ingestionLab/oauth/{provider}/callback — Google redirects here.
  // No Bearer auth possible (top-level browser nav). The state nonce, which
  // was minted by an admin-authed POST /start, is the gate.
  app.get(`/api/ingestionLab/oauth/${provider}/callback`, async (req: any, res: any) => {
    const { code, state, error: oauthError, error_description } = req.query;
    if (oauthError) {
      res.status(400).send(errorPage(`${oauthError}: ${error_description || ''}`));
      return;
    }
    if (!code || !state) {
      res.status(400).send(errorPage('Missing code or state'));
      return;
    }
    try {
      const stateDocRef = statesRef(db).doc(String(state));
      const stateDoc = await stateDocRef.get();
      if (!stateDoc.exists) {
        res.status(400).send(errorPage('Invalid or expired state. Restart the connection.'));
        return;
      }
      const stateData = stateDoc.data() || {};
      if (stateData.provider !== provider) {
        res.status(400).send(errorPage('State / provider mismatch.'));
        return;
      }
      await stateDocRef.delete();

      // Exchange code for tokens.
      const tokenBody = new URLSearchParams({
        code: String(code),
        client_id: googleClientId(),
        client_secret: googleClientSecret(),
        redirect_uri: redirectUri(provider),
        grant_type: 'authorization_code',
      });
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      });
      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        console.error(
          `[ingestionLab/oauth/${provider}/callback] token exchange failed:`,
          tokenRes.status,
          text,
        );
        res.status(500).send(errorPage(`Token exchange failed: ${tokenRes.status}`));
        return;
      }
      const tokens: any = await tokenRes.json();
      // tokens shape: { access_token, refresh_token, scope, expires_in, token_type, id_token? }

      // Resolve the connected Google account email so the UI can show
      // which inbox / drive the lab is now reading from.
      let connectedEmail = 'unknown';
      try {
        const ui = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (ui.ok) {
          const profile: any = await ui.json();
          if (profile && profile.email) connectedEmail = profile.email;
        }
      } catch (_) {
        // Non-fatal — connection still works without an email label.
      }

      const expiresAtMs = Date.now() + ((tokens.expires_in ?? 3600) * 1000);
      let refreshToken: string | null = tokens.refresh_token ?? null;

      // Preserve the existing refresh token if Google didn't return one
      // (shouldn't happen given prompt=consent, but losing it would orphan
      // background access). Mirror the qboConnections preservation logic.
      if (!refreshToken) {
        const existing = await configRef(db).get();
        const prev = existing.data()?.[provider]?.refreshToken;
        if (prev) refreshToken = prev;
      }

      await configRef(db).set(
        {
          [provider]: {
            refreshToken,
            accessToken: tokens.access_token,
            expiresAt: admin.firestore.Timestamp.fromMillis(expiresAtMs),
            email: connectedEmail,
            scope: tokens.scope || SCOPES[provider],
            connectedAt: admin.firestore.FieldValue.serverTimestamp(),
            connectedByUid: stateData.adminUid || null,
          },
        },
        { merge: true },
      );

      res.send(successPage(provider, connectedEmail));
    } catch (e: any) {
      console.error(`[ingestionLab/oauth/${provider}/callback] failed:`, e);
      res.status(500).send(errorPage(e?.message || 'unknown'));
    }
  });
}

function randomState(): string {
  return (
    Math.random().toString(36).slice(2) +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}

function successPage(provider: Provider, email: string): string {
  const title = provider === 'gmail' ? 'Gmail connected' : 'Drive connected';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 480px; margin: 80px auto; text-align: center; }
  .check { font-size: 64px; color: #22c55e; }
  a { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #C9A96E; color: #141414; text-decoration: none; border-radius: 6px; font-weight: 600; }
  code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
</style></head><body>
  <div class="check">${'✓'}</div>
  <h2>${title}</h2>
  <p>Ingestion Lab is now linked to <code>${escapeHtml(email)}</code>.</p>
  <a href="${APP_BASE}/admin/ingestion-lab">Back to the Lab</a>
</body></html>`;
}

function errorPage(msg: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Connection failed</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 480px; margin: 80px auto; text-align: center; }
  .x { font-size: 64px; color: #ef4444; }
  a { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #C9A96E; color: #141414; text-decoration: none; border-radius: 6px; font-weight: 600; }
</style></head><body>
  <div class="x">${'✗'}</div>
  <h2>Connection failed</h2>
  <p>${escapeHtml(msg)}</p>
  <a href="${APP_BASE}/admin/ingestion-lab">Back to the Lab</a>
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
