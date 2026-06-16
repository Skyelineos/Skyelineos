// Audience resolvers for the new wave-2 trigger kinds defined in
// shared/notifications-catalog.ts. Each resolver returns the list of Firebase
// Auth uids that should receive a notification for the given (kind, projectId).
//
// The resolver runs inside fireTriggerRoute (server-side) so a caller can never
// spoof who gets a notification — they pass kind+projectId and the server
// computes the audience.

import * as admin from 'firebase-admin';

export type AudienceKind =
  | 'staff_on_project'
  | 'client_of_project'
  | 'sub_on_project'
  | 'single_uid'
  | 'project_team';

// Parse `clientIds` (stored as JSON string per shared/schema.ts) into a list.
function parseClientIds(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      // Comma-separated fallback
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

async function listAdminAndGcUids(db: admin.firestore.Firestore): Promise<string[]> {
  const out = new Set<string>();
  for (const role of ['admin', 'gc']) {
    const snap = await db.collection('users').where('role', '==', role).get();
    snap.docs.forEach(d => out.add(d.id));
  }
  return Array.from(out);
}

/** staff_on_project = admins + gcs + the project's PM user. */
export async function resolveStaffOnProject(
  db: admin.firestore.Firestore,
  projectId: string | undefined,
): Promise<string[]> {
  const baseStaff = await listAdminAndGcUids(db);
  const out = new Set(baseStaff);
  if (projectId) {
    try {
      const proj = await db.collection('projects').doc(projectId).get();
      const data = proj.exists ? proj.data() as any : null;
      const pmUid = data?.projectManagerUid || data?.pmUid || data?.assignedPMUid;
      if (pmUid) out.add(String(pmUid));
    } catch (e) {
      console.warn('[audience] staff_on_project project read failed', e);
    }
  }
  return Array.from(out).filter(Boolean);
}

/** client_of_project = the project's linked client uids (homeowners). */
export async function resolveClientOfProject(
  db: admin.firestore.Firestore,
  projectId: string | undefined,
): Promise<string[]> {
  if (!projectId) return [];
  const out = new Set<string>();
  try {
    const proj = await db.collection('projects').doc(projectId).get();
    if (!proj.exists) return [];
    const data = proj.data() as any;
    // Direct uid mapping on the project (rare path).
    if (data.clientUserId) out.add(String(data.clientUserId));
    // Indirect: contact ids → contacts/{id}.linkedUserId.
    const contactIds = parseClientIds(data.clientIds);
    // legacy single field
    if (data.clientContactId) contactIds.push(String(data.clientContactId));
    for (const cid of contactIds) {
      try {
        const c = await db.collection('contacts').doc(cid).get();
        if (!c.exists) continue;
        const linkedUid = (c.data() as any)?.linkedUserId;
        if (linkedUid) out.add(String(linkedUid));
      } catch { /* skip */ }
    }
  } catch (e) {
    console.warn('[audience] client_of_project read failed', e);
  }
  return Array.from(out).filter(Boolean);
}

/** sub_on_project = awarded subs on the project's bid requests. */
export async function resolveSubsOnProject(
  db: admin.firestore.Firestore,
  projectId: string | undefined,
): Promise<string[]> {
  if (!projectId) return [];
  const out = new Set<string>();
  try {
    const bids = await db.collection('bids')
      .where('projectId', '==', projectId)
      .where('status', '==', 'awarded')
      .get();
    bids.docs.forEach(d => {
      const b = d.data() as any;
      if (b.subUid) out.add(String(b.subUid));
      else if (b.linkedUserId) out.add(String(b.linkedUserId));
    });
  } catch (e) {
    console.warn('[audience] sub_on_project read failed', e);
  }
  return Array.from(out).filter(Boolean);
}

/** Single uid pass-through. Caller specifies the recipient explicitly. */
export function resolveSingleUid(uid: string | undefined): string[] {
  return uid ? [uid] : [];
}

export async function resolveAudience(
  db: admin.firestore.Firestore,
  audience: AudienceKind,
  ctx: { projectId?: string; singleUid?: string },
): Promise<string[]> {
  switch (audience) {
    case 'staff_on_project':
      return resolveStaffOnProject(db, ctx.projectId);
    case 'client_of_project':
      return resolveClientOfProject(db, ctx.projectId);
    case 'sub_on_project':
      return resolveSubsOnProject(db, ctx.projectId);
    case 'single_uid':
      return resolveSingleUid(ctx.singleUid);
    case 'project_team': {
      const [a, b, c] = await Promise.all([
        resolveStaffOnProject(db, ctx.projectId),
        resolveClientOfProject(db, ctx.projectId),
        resolveSubsOnProject(db, ctx.projectId),
      ]);
      return Array.from(new Set([...a, ...b, ...c]));
    }
    default:
      return [];
  }
}
