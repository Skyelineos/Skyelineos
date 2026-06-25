// qboClient.ts — Public QBO client helper matching the two-way sync spec.
//
// This is a thin spec-compatible facade over the lower-level helpers in
// `./client.ts` (getValidToken, qbo). The underlying token-refresh and REST
// plumbing already lives there and is shared with qbo/paymentLink.ts; this
// module just re-exports it with the names the expense/draw sync code uses:
//
//   qboRequest(db, method, path, body?)        → REST call w/ auto-refresh
//   getQboConnection(db)                       → read qboConnections/global
//   refreshQboToken(db, connection)            → force refresh (used internally)
//
// Tokens live at Firestore qboConnections/global. Access tokens last ~1h and
// are refreshed when within 60s of expiry. QBO env (sandbox|production) is
// stored on the connection doc and overridden by QBO_ENV env var if absent.

import type { firestore as adminFirestore } from 'firebase-admin';
import * as admin from 'firebase-admin';
import { getValidToken, qbo, qboApiBase, type QboToken } from './client';

const TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

export interface QboConnection {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  env: string;
  tokenType?: string;
  scope?: string;
  updatedAt?: any;
  connectedAt?: any;
}

/**
 * Read the QBO connection doc. Returns null if not yet linked.
 */
export async function getQboConnection(
  db: adminFirestore.Firestore,
): Promise<QboConnection | null> {
  const snap = await db.collection('qboConnections').doc('global').get();
  if (!snap.exists) return null;
  const data = snap.data() as any;
  if (!data) return null;
  return {
    realmId: data.realmId,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    accessTokenExpiresAt: Number(data.accessTokenExpiresAt) || 0,
    refreshTokenExpiresAt: Number(data.refreshTokenExpiresAt) || 0,
    env: data.env || process.env.QBO_ENV || 'sandbox',
    tokenType: data.tokenType,
    scope: data.scope,
    updatedAt: data.updatedAt,
    connectedAt: data.connectedAt,
  };
}

/**
 * Force-refresh the access token using the stored refresh token, writing the
 * rotated tokens back to qboConnections/global. Most callers should use
 * `qboRequest` instead — it lazily refreshes on the next call. Exposed for
 * tests and explicit refresh flows.
 */
export async function refreshQboToken(
  db: adminFirestore.Firestore,
  connection: QboConnection,
): Promise<QboConnection> {
  if (!connection.refreshToken) {
    throw Object.assign(new Error('Missing refresh token'), {
      code: 'not_connected',
    });
  }
  const clientId = (process.env.QBO_CLIENT_ID || '').trim();
  const clientSecret = (process.env.QBO_CLIENT_SECRET || '').trim();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(
      new Error(`QuickBooks token refresh failed: ${res.status} ${text}`),
      { code: 'refresh_failed' },
    );
  }
  const tokens: any = await res.json();
  const now = Date.now();
  const next: QboConnection = {
    ...connection,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || connection.refreshToken,
    accessTokenExpiresAt: now + tokens.expires_in * 1000,
    refreshTokenExpiresAt:
      now + (tokens.x_refresh_token_expires_in || 8640000) * 1000,
  };
  await db.collection('qboConnections').doc('global').set(
    {
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
      accessTokenExpiresAt: next.accessTokenExpiresAt,
      refreshTokenExpiresAt: next.refreshTokenExpiresAt,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return next;
}

/**
 * Generic QBO REST request with automatic access-token refresh.
 *
 *   const purchase = await qboRequest(db, 'POST', 'purchase', payload);
 *   const status   = await qboRequest(db, 'GET',  'companyinfo/<realmId>');
 *
 * Supports embedding a ?query=... by appending it to `path`.
 * Throws { code: 'not_connected' } when QBO isn't linked, or
 * { code: 'qbo_error', status, body } for non-2xx QBO responses.
 */
export async function qboRequest(
  db: adminFirestore.Firestore,
  method: string,
  path: string,
  body?: any,
): Promise<any> {
  const token: QboToken = await getValidToken(db);
  // Split optional ?query=... so we can pass it through `qbo()` cleanly.
  let pathOnly = path;
  let query: string | undefined;
  const qIdx = path.indexOf('?');
  if (qIdx >= 0) {
    pathOnly = path.slice(0, qIdx);
    query = path.slice(qIdx + 1);
  }
  return qbo(token, pathOnly, {
    method: method.toUpperCase(),
    body,
    query,
  });
}

// Re-export the underlying helpers so callers can drop into the lower-level API.
export { getValidToken, qbo, qboApiBase, type QboToken };
