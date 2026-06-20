// Shared QuickBooks Online REST client.
//
// Extracted so multiple features (draw payment links, the AI Inbox bill/expense
// sync) share one token-refresh + request helper instead of each re-implementing
// it. The existing qbo/paymentLink.ts keeps its own private copy on purpose —
// this module is additive and does not touch it, so nothing already live breaks.
//
// Tokens live at qboConnections/global (shared company connection, written by
// the OAuth callback in index.ts). Access tokens last ~1h and are refreshed
// here on demand using the rotating refresh token. The connected company can be
// sandbox or production — whatever Tyler linked in Settings; we never hardcode.

import type { firestore as adminFirestore } from 'firebase-admin';
import * as admin from 'firebase-admin';

const TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

export function qboApiBase(env: string): string {
  return env === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

export interface QboToken {
  accessToken: string;
  realmId: string;
  env: string;
}

// Read the shared connection, refreshing the access token if it's within 60s of
// expiry. Throws { code: 'not_connected' } when QBO has never been linked.
export async function getValidToken(db: adminFirestore.Firestore): Promise<QboToken> {
  const ref = db.collection('qboConnections').doc('global');
  const snap = await ref.get();
  if (!snap.exists) {
    throw Object.assign(new Error('QuickBooks is not connected'), { code: 'not_connected' });
  }
  const data = snap.data() as any;
  const env = data.env || process.env.QBO_ENV || 'sandbox';
  const now = Date.now();

  if (data.accessToken && (data.accessTokenExpiresAt || 0) > now + 60_000) {
    return { accessToken: data.accessToken, realmId: data.realmId, env };
  }

  if (!data.refreshToken) {
    throw Object.assign(new Error('QuickBooks connection is missing a refresh token'), { code: 'not_connected' });
  }
  if ((data.refreshTokenExpiresAt || 0) < now) {
    throw Object.assign(new Error('QuickBooks connection expired — reconnect in Settings'), { code: 'not_connected' });
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
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refreshToken }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`QuickBooks token refresh failed: ${res.status} ${text}`), { code: 'refresh_failed' });
  }
  const tokens: any = await res.json();
  await ref.set({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || data.refreshToken,
    accessTokenExpiresAt: now + tokens.expires_in * 1000,
    refreshTokenExpiresAt: now + (tokens.x_refresh_token_expires_in || 8640000) * 1000,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { accessToken: tokens.access_token, realmId: data.realmId, env };
}

// Thin QBO REST helper. Throws on non-2xx with the QBO error body attached.
export async function qbo(
  token: QboToken,
  path: string,
  init: { method?: string; body?: any; query?: string } = {},
): Promise<any> {
  const url = `${qboApiBase(token.env)}/v3/company/${token.realmId}/${path}${init.query ? `?${init.query}` : ''}`;
  const res = await fetch(url, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* leave json empty */ }
  if (!res.ok) {
    throw Object.assign(new Error(`QBO ${path} → ${res.status}`), { code: 'qbo_error', status: res.status, body: json || text });
  }
  return json;
}

// QBO SQL-ish query endpoint string escaping.
export function qboEsc(s: string): string {
  return String(s).replace(/'/g, "\\'");
}

// Is QBO connected right now (used by the UI to show/hide sync controls)?
export async function qboConnectionStatus(
  db: adminFirestore.Firestore,
): Promise<{ connected: boolean; env: string }> {
  try {
    const snap = await db.collection('qboConnections').doc('global').get();
    const data = snap.exists ? (snap.data() as any) : null;
    const connected = !!(data && data.refreshToken && (data.refreshTokenExpiresAt || 0) > Date.now());
    return { connected, env: data?.env || process.env.QBO_ENV || 'sandbox' };
  } catch {
    return { connected: false, env: process.env.QBO_ENV || 'sandbox' };
  }
}
