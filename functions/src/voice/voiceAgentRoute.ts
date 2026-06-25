// Skyeline Homes Voice AI Receptionist — staff API
//
// Staff routes for the call log UI. All endpoints gated by staffOnly (JWT).
//
//   GET /api/voice/calls                  — list recent calls
//   GET /api/voice/calls/:callSid         — single call (with transcript + turns)
//   GET /api/projects/:id/calls           — calls for a project
//
// Mirrors the SMS staff route shape so the UI can reuse the same patterns.

import type { Express, Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { staffOnly } from '../communications/staffAuth';
import { CALL_LOGS } from './callLogger';

export function registerVoiceAgentRoutes(app: Express, db: Firestore): void {
  // GET /api/voice/calls — recent calls, newest first
  app.get('/api/voice/calls', staffOnly, async (req: any, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const projectId = req.query.projectId ? String(req.query.projectId) : null;
      let q: FirebaseFirestore.Query = db.collection(CALL_LOGS);
      if (projectId) q = q.where('projectId', '==', projectId);
      q = q.orderBy('createdAt', 'desc').limit(limit);
      const snap = await q.get();
      const calls = snap.docs.map((d) => ({ id: d.id, ...serializeTimestamps(d.data()) }));
      return res.json({ calls });
    } catch (err: any) {
      console.error('[voice/calls GET] failed:', err?.message);
      return res.status(500).json({ error: err?.message || 'list_failed' });
    }
  });

  // GET /api/voice/calls/:callSid — single call detail
  app.get('/api/voice/calls/:callSid', staffOnly, async (req: any, res: Response) => {
    try {
      const callSid = String(req.params.callSid || '').trim();
      if (!callSid) return res.status(400).json({ error: 'callSid required' });
      const snap = await db.collection(CALL_LOGS).doc(callSid).get();
      if (!snap.exists) return res.status(404).json({ error: 'call not found' });
      return res.json({ call: { id: snap.id, ...serializeTimestamps(snap.data() as any) } });
    } catch (err: any) {
      console.error('[voice/calls/:callSid GET] failed:', err?.message);
      return res.status(500).json({ error: err?.message || 'load_failed' });
    }
  });

  // GET /api/projects/:id/calls — calls associated with a project
  app.get('/api/projects/:id/calls', staffOnly, async (req: any, res: Response) => {
    try {
      const projectId = String(req.params.id || '').trim();
      if (!projectId) return res.status(400).json({ error: 'projectId required' });
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const snap = await db.collection(CALL_LOGS)
        .where('projectId', '==', projectId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      const calls = snap.docs.map((d) => ({ id: d.id, ...serializeTimestamps(d.data()) }));
      return res.json({ calls });
    } catch (err: any) {
      console.error('[projects/:id/calls GET] failed:', err?.message);
      return res.status(500).json({ error: err?.message || 'list_failed' });
    }
  });
}

function serializeTimestamps(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const out: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof (v as any).toDate === 'function') {
      try { out[k] = (v as any).toDate().toISOString(); continue; } catch { /* fallthrough */ }
    }
    out[k] = v;
  }
  return out;
}
