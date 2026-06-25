// webhookRoute.ts — Intuit QuickBooks webhook receiver + admin manual sync.
//
// Two routes:
//
//   POST /api/qbo/webhook                (PUBLIC — Intuit can't send Bearer)
//     Receives Intuit webhook notifications. We verify the `intuit-signature`
//     header (HMAC-SHA256 of the raw body using the QBO_WEBHOOK_VERIFIER_TOKEN
//     secret, base64-encoded) and, for any Customer Create/Update event,
//     fetch that customer from QBO and upsert it as a Skyeline project.
//
//     Intuit retries on non-200 responses, so we always answer 200 quickly
//     and do the per-customer work in the background. The exception is when
//     the signature is missing or invalid — those return 401 so a misrouted
//     attacker doesn't get acks.
//
//   GET /api/qbo/sync-customers          (admin only)
//     Manual "Sync Customers → Projects" trigger from Settings. Calls
//     `syncQboCustomersToProjects(db)` and returns
//       { synced, created, updated, errors }
//     so the UI can render "✓ 12 projects synced (3 new, 9 updated)".
//
// The verifier token comes from the Intuit developer portal — paste it into
// the QBO_WEBHOOK_VERIFIER_TOKEN secret. The webhook URL to register over
// there is `https://<your-domain>/api/qbo/webhook`.

import type { Express, Response } from 'express';
import express from 'express';
import * as admin from 'firebase-admin';
import type { firestore as adminFirestore } from 'firebase-admin';
import * as crypto from 'crypto';
import { qboRequest } from './qboClient';
import {
  syncQboCustomersToProjects,
  upsertQboCustomerAsProject,
  type QboCustomer,
} from './customerSync';

// ── Intuit webhook payload shape (only fields we read) ──────────────────────

interface IntuitDataChangeEntity {
  name: string;          // "Customer", "Invoice", "Item", ...
  id: string;
  operation: string;     // "Create" | "Update" | "Delete" | "Merge" | "Void"
  lastUpdated?: string;
}

interface IntuitEventNotification {
  realmId: string;
  dataChangeEvent?: {
    entities?: IntuitDataChangeEntity[];
  };
}

interface IntuitWebhookPayload {
  eventNotifications?: IntuitEventNotification[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const STAFF_ROLES = new Set([
  'admin',
  'gc',
  'projectmanager',
  'pm',
  'owner',
  'superadmin',
]);

async function callerIsStaff(
  db: adminFirestore.Firestore,
  uid: string,
): Promise<boolean> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const data = (snap.data() as any) || {};
    const role = String(data.role || '')
      .toLowerCase()
      .replace(/_/g, '');
    return STAFF_ROLES.has(role);
  } catch {
    return false;
  }
}

/**
 * Verify Intuit's `intuit-signature` header against the raw request body.
 *
 * Intuit signs with HMAC-SHA256(verifierToken, rawBody) and base64-encodes
 * the digest. Constant-time compare so we don't leak signature bytes via
 * timing.
 */
function verifyIntuitSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  verifierToken: string,
): boolean {
  if (!signatureHeader || !verifierToken) return false;
  const bodyBuf = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(String(rawBody || ''), 'utf8');
  if (bodyBuf.length === 0) return false;
  const expected = crypto
    .createHmac('sha256', verifierToken)
    .update(bodyBuf)
    .digest('base64');
  try {
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Fetch a single customer from QBO by its Id. Returns null on 404 / missing.
 */
async function fetchQboCustomer(
  db: adminFirestore.Firestore,
  customerId: string,
): Promise<QboCustomer | null> {
  try {
    const resp = await qboRequest(db, 'GET', `customer/${encodeURIComponent(customerId)}`);
    const c = resp?.Customer || resp?.customer || null;
    return c || null;
  } catch (err: any) {
    console.error(
      '[qbo/webhook] failed to fetch customer',
      customerId,
      err?.message || err,
    );
    return null;
  }
}

/**
 * Walk the Intuit payload and, for every Customer Create/Update event, fetch
 * + upsert the matching project. Each customer is processed sequentially to
 * keep QBO request rate sane — a single webhook delivery is usually only a
 * handful of entities.
 */
async function processIntuitPayload(
  db: adminFirestore.Firestore,
  payload: IntuitWebhookPayload,
): Promise<void> {
  const notifications = Array.isArray(payload?.eventNotifications)
    ? payload.eventNotifications
    : [];
  for (const note of notifications) {
    const entities = Array.isArray(note?.dataChangeEvent?.entities)
      ? note.dataChangeEvent!.entities!
      : [];
    for (const entity of entities) {
      if (entity?.name !== 'Customer') continue;
      const op = String(entity.operation || '');
      if (op !== 'Create' && op !== 'Update') continue;
      if (!entity.id) continue;
      const customer = await fetchQboCustomer(db, String(entity.id));
      if (!customer) {
        console.warn(
          '[qbo/webhook] customer fetch returned null for id',
          entity.id,
        );
        continue;
      }
      const out = await upsertQboCustomerAsProject(db, customer);
      console.log(
        `[qbo/webhook] Customer ${op} ${entity.id} → ${out.result}` +
          (out.projectId ? ` (project ${out.projectId})` : '') +
          (out.error ? ` :: ${out.error}` : ''),
      );
    }
  }
}

// ── Route registration ──────────────────────────────────────────────────────

/**
 * Register the QBO webhook + admin manual-sync routes on the shared Express
 * app. Mount BEFORE the `/api` auth middleware in index.ts — the webhook is
 * a public Intuit callback and can't carry a Bearer token.
 *
 * Both the public POST and the admin GET are registered here. The GET handler
 * still needs an authenticated caller, but since the public-side registration
 * happens before `app.use('/api', authMiddleware)`, we verify the Firebase ID
 * token ourselves inside the GET handler (mirroring how the other public
 * routes that need an identity — like the QBO OAuth start — handle it).
 */
export function registerQboWebhookRoutes(
  app: Express,
  db: adminFirestore.Firestore,
): void {
  // POST /api/qbo/webhook — Intuit notification callback. Public.
  app.post(
    '/api/qbo/webhook',
    // Belt-and-suspenders: if the global json parser didn't capture rawBody
    // for some content-type, this route-level raw parser will. We only use
    // it when `req.rawBody` isn't already populated by the json verify hook.
    express.raw({ type: '*/*', limit: '2mb' }),
    async (req: any, res: Response) => {
      try {
        const verifier = (process.env.QBO_WEBHOOK_VERIFIER_TOKEN || '').trim();
        if (!verifier) {
          console.error(
            '[qbo/webhook] QBO_WEBHOOK_VERIFIER_TOKEN is not set; rejecting',
          );
          // 401 (not 500) so Intuit doesn't keep retrying a config gap.
          res.status(401).json({ error: 'webhook_not_configured' });
          return;
        }

        // Pick whichever raw representation we have. `req.rawBody` is set by
        // the index.ts json-verify hook for application/json bodies; the
        // route-level raw parser puts a Buffer on req.body when json didn't
        // claim the body.
        const rawBody: Buffer | string =
          (req.rawBody as Buffer | undefined) ||
          (Buffer.isBuffer(req.body) ? (req.body as Buffer) : '');

        const signature =
          (req.headers['intuit-signature'] as string | undefined) ||
          (req.headers['Intuit-Signature'] as unknown as string | undefined);

        if (!verifyIntuitSignature(rawBody, signature, verifier)) {
          console.warn(
            '[qbo/webhook] signature verification failed',
            { hasSig: !!signature, bodyLen: typeof rawBody === 'string' ? rawBody.length : rawBody.length },
          );
          res.status(401).json({ error: 'bad_signature' });
          return;
        }

        // Parse the verified body. If express.json already parsed it into an
        // object, prefer that; otherwise parse the raw bytes ourselves.
        let payload: IntuitWebhookPayload;
        if (
          req.body &&
          typeof req.body === 'object' &&
          !Buffer.isBuffer(req.body)
        ) {
          payload = req.body as IntuitWebhookPayload;
        } else {
          const text = Buffer.isBuffer(rawBody)
            ? rawBody.toString('utf8')
            : String(rawBody || '');
          payload = text ? (JSON.parse(text) as IntuitWebhookPayload) : {};
        }

        // Ack immediately — Intuit retries on slow / failed responses.
        res.status(200).json({ ok: true });

        // Process out-of-band so the ack isn't blocked on QBO API latency.
        processIntuitPayload(db, payload).catch((err) => {
          console.error('[qbo/webhook] payload processing failed:', err);
        });
      } catch (err: any) {
        console.error('[qbo/webhook] error:', err);
        // Already responded? Just log. Otherwise still 200 so Intuit moves on
        // (we've logged enough to debug; retries don't help bad payloads).
        if (!res.headersSent) {
          res.status(200).json({ ok: true, warning: 'handled with error' });
        }
      }
    },
  );

  // GET /api/qbo/sync-customers — admin-triggered bulk pull.
  //
  // This route sits in front of the global /api auth middleware (we're
  // mounted with the public routes so the webhook can land), so we verify
  // the caller's Firebase ID token ourselves here.
  app.get('/api/qbo/sync-customers', async (req: any, res: Response) => {
    try {
      const authHeader = String(req.headers.authorization || '');
      if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token' });
        return;
      }
      let uid: string;
      try {
        const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
        uid = decoded.uid;
      } catch {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }
      if (!(await callerIsStaff(db, uid))) {
        res.status(403).json({ error: 'Staff role required' });
        return;
      }
      const stats = await syncQboCustomersToProjects(db);
      res.json(stats);
    } catch (err: any) {
      if (err?.code === 'not_connected') {
        res.status(409).json({ error: err.message, code: 'not_connected' });
        return;
      }
      console.error('[qbo/sync-customers] error:', err);
      res.status(500).json({ error: err?.message || 'Sync failed' });
    }
  });
}
