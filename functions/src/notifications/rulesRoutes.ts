// Admin API for the configurable notification engine.
//
//   GET  /api/notifications/catalog       → trigger catalog + audiences + default flows
//   POST /api/notifications/rules/init     → seed settings/notificationRules with defaults (idempotent)
//   POST /api/notifications/test           → fire a trigger as a live test to the requesting admin
//
// The config UI reads/writes settings/notificationRules directly via Firestore
// (admin-gated by rules); these routes provide the code-owned catalog + a real
// end-to-end test send through the same engine production uses.

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { TRIGGER_CATALOG, AUDIENCES, defaultFlow, getTrigger, Audience } from './triggerCatalog';
import { fireTrigger } from './fireTrigger';

async function requireAdmin(req: any, res: any): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sign in required' });
    return null;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
    const snap = await admin.firestore().collection('users').doc(decoded.uid).get();
    const role = snap.exists ? (snap.data() as any)?.role : null;
    if (role !== 'admin' && role !== 'gc') {
      res.status(403).json({ error: 'Admin only' });
      return null;
    }
    return decoded.uid;
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return null;
  }
}

function buildDefaults(): Record<string, Partial<Record<Audience, ReturnType<typeof defaultFlow>>>> {
  const out: Record<string, Partial<Record<Audience, ReturnType<typeof defaultFlow>>>> = {};
  for (const t of TRIGGER_CATALOG) {
    out[t.key] = {};
    for (const aud of t.audiences) {
      out[t.key][aud] = defaultFlow(t.key, aud);
    }
  }
  return out;
}

// Sample values so a test send renders realistically.
const SAMPLE_VARS: Record<string, string> = {
  leadName: 'Jane Smith',
  source: 'Website',
  city: 'Mapleton',
  phone: '+18015551234',
  email: 'jane@example.com',
  projectName: 'Maple Ridge Custom Home',
  trade: 'Framing',
  dueDate: new Date(Date.now() + 3 * 86400000).toLocaleDateString(),
  requesterName: 'Skyeline Homes',
  magicLink: 'https://skyelineos.web.app/bid/respond/SAMPLE',
  taskName: 'Foundation inspection',
  link: '/dashboard',
};

export function registerNotificationRulesRoutes(app: Express, db: admin.firestore.Firestore) {
  // Catalog + defaults (code-owned source of truth for the UI).
  app.get('/api/notifications/catalog', async (req: any, res: any) => {
    if (!(await requireAdmin(req, res))) return;
    return res.json({
      triggers: TRIGGER_CATALOG,
      audiences: AUDIENCES,
      defaults: buildDefaults(),
    });
  });

  // Idempotently seed the rules doc with defaults for any missing trigger/audience.
  app.post('/api/notifications/rules/init', async (req: any, res: any) => {
    const uid = await requireAdmin(req, res);
    if (!uid) return;
    const ref = db.doc('settings/notificationRules');
    const snap = await ref.get();
    const existing = (snap.exists ? (snap.data() as any) : {})?.flows || {};
    const defaults = buildDefaults();
    const flows: any = { ...defaults };
    // Preserve anything the admin already customized.
    for (const tk of Object.keys(existing)) {
      flows[tk] = { ...(flows[tk] || {}), ...existing[tk] };
    }
    await ref.set({
      flows,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: uid,
    }, { merge: true });
    return res.json({ ok: true, flows });
  });

  // Live test: fire the trigger through the real engine to the requesting admin.
  app.post('/api/notifications/test', async (req: any, res: any) => {
    const uid = await requireAdmin(req, res);
    if (!uid) return;
    const { triggerKey, audience } = (req.body || {}) as { triggerKey?: string; audience?: Audience };
    if (!triggerKey || !getTrigger(triggerKey)) {
      return res.status(400).json({ error: 'Unknown triggerKey' });
    }
    try {
      await fireTrigger({
        db,
        triggerKey,
        recipientUserId: uid,
        audience: (audience as Audience) || 'team',
        variables: { ...SAMPLE_VARS, link: '/dashboard' },
        fromUserName: 'Skyeline OS (test)',
      });
      return res.json({ ok: true, sentTo: uid });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Test failed' });
    }
  });
}
