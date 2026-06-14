// QuickBooks Online — draw payment links.
//
// Folds onto the shared `api` Express app (org IAM blocks new standalone Cloud
// Run services). Exposes:
//
//   POST /api/qbo/draw-payment-link   body: { projectId, drawId }
//     → ensures a QBO Customer + Invoice exist for the draw, returns the
//       online payment link (Invoice.InvoiceLink). Idempotent: the QBO invoice
//       id is cached on the draw doc, so repeat clicks re-use the same invoice.
//
//   GET  /api/qbo/status
//     → { connected: boolean, env } so the portal can show a "Pay now" button
//       only when QuickBooks is actually linked.
//
// Auth: caller must present a Firebase ID token (Bearer). Either project staff
// (admin/gc/projectManager) or the project's own client may mint a link.
//
// Tokens live at qboConnections/global (shared company connection, written by
// the OAuth callback in index.ts). Access tokens last ~1h and are refreshed
// here on demand using the rotating refresh token.

import type { Express, Request, Response } from 'express';
import type { firestore as adminFirestore } from 'firebase-admin';
import * as admin from 'firebase-admin';

const TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

function apiBase(env: string): string {
  return env === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

interface QboToken {
  accessToken: string;
  realmId: string;
  env: string;
}

// Read the shared connection, refreshing the access token if it's within 60s of
// expiry. Throws { code: 'not_connected' } when QBO has never been linked.
async function getValidToken(db: adminFirestore.Firestore): Promise<QboToken> {
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

  // Refresh.
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
async function qbo(token: QboToken, path: string, init: { method?: string; body?: any; query?: string } = {}) {
  const url = `${apiBase(token.env)}/v3/company/${token.realmId}/${path}${init.query ? `?${init.query}` : ''}`;
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

// QBO SQL-ish query endpoint escaping.
function esc(s: string) { return s.replace(/'/g, "\\'"); }

// Find-or-create the customer for this homeowner.
async function ensureCustomer(token: QboToken, name: string, email?: string): Promise<string> {
  const display = name?.trim() || 'Homeowner';
  const found = await qbo(token, 'query', { query: `select Id from Customer where DisplayName = '${esc(display)}'` });
  const existing = found?.QueryResponse?.Customer?.[0]?.Id;
  if (existing) return existing;
  const created = await qbo(token, 'customer', {
    method: 'POST',
    body: { DisplayName: display, ...(email ? { PrimaryEmailAddr: { Address: email } } : {}) },
  });
  return created?.Customer?.Id;
}

// Find-or-create a generic Service item to hang the draw line off of. New items
// need an income account, so we grab the first active Income account.
async function ensureItem(token: QboToken): Promise<string> {
  const found = await qbo(token, 'query', { query: "select Id from Item where Type = 'Service' and Active = true maxresults 1" });
  const existing = found?.QueryResponse?.Item?.[0]?.Id;
  if (existing) return existing;
  const acct = await qbo(token, 'query', { query: "select Id from Account where AccountType = 'Income' and Active = true maxresults 1" });
  const incomeAccountId = acct?.QueryResponse?.Account?.[0]?.Id;
  if (!incomeAccountId) {
    throw Object.assign(new Error('No income account in QuickBooks to attach a service item to'), { code: 'qbo_setup' });
  }
  const created = await qbo(token, 'item', {
    method: 'POST',
    body: {
      Name: 'Construction Draw',
      Type: 'Service',
      IncomeAccountRef: { value: incomeAccountId },
    },
  });
  return created?.Item?.Id;
}

// Read an invoice with its sharable online-payment link included.
async function getInvoiceLink(token: QboToken, invoiceId: string): Promise<{ link?: string; balance?: number }> {
  const inv = await qbo(token, `invoice/${invoiceId}`, { query: 'include=invoiceLink' });
  return { link: inv?.Invoice?.InvoiceLink, balance: inv?.Invoice?.Balance };
}

// Replicate the firestore clientOwns() check server-side: a client owns a
// project when its clientId/clientIds matches their uid or linked contact id.
async function callerMayPay(
  db: adminFirestore.Firestore,
  uid: string,
  project: any,
): Promise<boolean> {
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data() as any || {};
  const role = String(user.role || '').toLowerCase().replace(/_/g, '');
  if (['admin', 'gc', 'projectmanager', 'pm'].includes(role)) return true;
  const linkedContactId = user.linkedContactId;
  const ids = [uid, linkedContactId].filter(Boolean);
  if (ids.includes(project.clientId)) return true;
  if (Array.isArray(project.clientIds) && project.clientIds.some((c: string) => ids.includes(c))) return true;
  return false;
}

export function registerQboPaymentLink(app: Express, db: adminFirestore.Firestore) {
  // Lightweight connection probe for the UI.
  app.get('/api/qbo/status', async (_req: Request, res: Response) => {
    try {
      const snap = await db.collection('qboConnections').doc('global').get();
      const data = snap.exists ? (snap.data() as any) : null;
      const connected = !!(data && data.refreshToken && (data.refreshTokenExpiresAt || 0) > Date.now());
      res.json({ connected, env: data?.env || process.env.QBO_ENV || 'sandbox' });
    } catch (e: any) {
      res.json({ connected: false });
    }
  });

  app.post('/api/qbo/draw-payment-link', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));

      const { projectId, drawId } = req.body || {};
      if (!projectId || !drawId) return res.status(400).json({ error: 'projectId and drawId required' });

      const projectSnap = await db.collection('projects').doc(projectId).get();
      if (!projectSnap.exists) return res.status(404).json({ error: 'Project not found' });
      const project = projectSnap.data() as any;

      if (!(await callerMayPay(db, decoded.uid, project))) {
        return res.status(403).json({ error: 'Not authorized for this project' });
      }

      const drawRef = db.collection('projects').doc(projectId).collection('draws').doc(drawId);
      const drawSnap = await drawRef.get();
      if (!drawSnap.exists) return res.status(404).json({ error: 'Draw not found' });
      const draw = drawSnap.data() as any;
      const amount = Number(draw.amount) || 0;
      if (amount <= 0) return res.status(400).json({ error: 'Draw has no amount to bill' });
      if (draw.status === 'paid') return res.status(400).json({ error: 'This draw is already paid' });

      const token = await getValidToken(db);

      // Idempotent: reuse the cached QBO invoice if we already minted one.
      if (draw.qboInvoiceId) {
        const { link: cached } = await getInvoiceLink(token, draw.qboInvoiceId);
        if (cached) {
          await drawRef.set({ paymentLinkUrl: cached, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          return res.json({ url: cached, reused: true });
        }
      }

      const clientName = project.clientName || project.name || 'Homeowner';
      const clientEmail = project.clientEmail || undefined;
      const customerId = await ensureCustomer(token, clientName, clientEmail);
      const itemId = await ensureItem(token);

      const created = await qbo(token, 'invoice', {
        method: 'POST',
        body: {
          CustomerRef: { value: customerId },
          AllowOnlineCreditCardPayment: true,
          AllowOnlineACHPayment: true,
          ...(clientEmail ? { BillEmail: { Address: clientEmail } } : {}),
          Line: [{
            Amount: amount,
            DetailType: 'SalesItemLineDetail',
            Description: `${project.name || 'Project'} — Draw ${draw.number || ''}: ${draw.title || ''}`.trim(),
            SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: 1, UnitPrice: amount },
          }],
        },
      });
      const invoiceId = created?.Invoice?.Id;
      const { link } = await getInvoiceLink(token, invoiceId);

      await drawRef.set({
        qboInvoiceId: invoiceId,
        paymentLinkUrl: link || null,
        paymentLinkCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      if (!link) {
        // Invoice created but no online link — usually QuickBooks Payments isn't
        // enabled on the company. Surface a clear, actionable message.
        return res.status(409).json({
          error: 'QuickBooks created the invoice but online payments are not enabled on this company. Turn on QuickBooks Payments to give clients a Pay-now link.',
          code: 'payments_not_enabled',
          invoiceId,
        });
      }
      return res.json({ url: link, invoiceId });
    } catch (e: any) {
      const code = e?.code;
      if (code === 'not_connected') return res.status(409).json({ error: e.message, code });
      console.error('[qbo/draw-payment-link] failed:', e?.message, e?.body || '');
      return res.status(500).json({ error: e?.message || 'Failed to create payment link', code, body: e?.body });
    }
  });
}
