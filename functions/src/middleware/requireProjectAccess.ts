// Per-project ownership / membership check.
//
// Closes the IDOR gap called out in the 2026-07-05 security audit §5: any
// authenticated caller could read/write any project's data because the /api
// authMiddleware gate only verified "has a valid Firebase ID token", never
// "has any relationship to :projectId".
//
// This middleware runs AFTER authMiddleware (which populates req.user +
// req.userProfile from a verified Bearer token) and BEFORE the route handler.
// It resolves the target project from URL params / body / query, then applies
// the same membership rules that firestore.rules enforces for direct
// Firestore reads:
//
//   admin | gc                 → bypass  (isGCOnly() in the rules)
//   projectManager             → must be in projects.assignedUserIds
//   client                     → must own via clientUid / clientId / clientIds
//                                (through contact linkedUserId — same as
//                                 firestore.rules `clientOwns()`)
//   sub | designer             → must be in projects.assignedUserIds
//                                OR the designer of record (assignedDesignerId)
//
// On success:
//   - `req.project`     = { id, data }  — cached for the handler to reuse
//   - `req.projectRole` = 'admin' | 'gc' | ... (normalized)
//   - `req.projectId`   = resolved projectId string
//
// On failure:
//   - 400 if no projectId can be resolved
//   - 404 if the project doc doesn't exist
//   - 403 if the caller has no relationship to the project

import type { Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { normalizeRole } from './rbac';

// Roles that bypass per-project checks — same as firestore.rules `isGCOnly()`.
// Note: projectManager is NOT here. Even though PM is "GC's delegate" for
// project-operational work, the audit finding is that PMs on Project A must
// not be able to read Project B — the PM check re-uses assignedUserIds.
const BYPASS_ROLES = new Set(['admin', 'gc']);

// Roles that map to the assignedUserIds membership check.
const ASSIGNED_UID_ROLES = new Set(['projectManager', 'sub', 'designer']);

function parseIdList(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch {
      /* not JSON — treat as comma-separated fallback */
    }
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Resolve every contact id linked to a client uid, so we can compare it to
 * the project's clientId / clientIds fields. Same shape as
 * firestore.rules `clientLinkedContactId()`, except we look up ALL contacts
 * that point back to this uid instead of a single one.
 */
async function clientLinkedContactIds(
  db: admin.firestore.Firestore,
  uid: string,
): Promise<string[]> {
  const out = new Set<string>();
  // 1) users/{uid}.linkedContactId (fast path, matches firestore.rules).
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    const linked = userDoc.exists ? (userDoc.data() as any)?.linkedContactId : null;
    if (linked) out.add(String(linked));
  } catch {
    /* ignore */
  }
  // 2) Any contact whose linkedUserId points back to this uid. Handles the
  //    case where a user was linked to multiple contact records (e.g. one
  //    per project) — indexed by linkedUserId in firestore.
  try {
    const snap = await db
      .collection('contacts')
      .where('linkedUserId', '==', uid)
      .limit(50)
      .get();
    snap.docs.forEach((d) => out.add(d.id));
  } catch {
    /* index missing — safe to skip, users/{uid}.linkedContactId is the SSOT */
  }
  return Array.from(out);
}

/** True if the client-side of the project matches this uid or a linked contact. */
function clientOwnsProject(
  projectData: any,
  uid: string,
  linkedContactIds: string[],
): boolean {
  // Direct uid mapping (rare — some projects mirror the auth uid directly).
  if (projectData.clientUid && String(projectData.clientUid) === uid) return true;
  if (projectData.clientUserId && String(projectData.clientUserId) === uid) return true;
  if (projectData.clientId && String(projectData.clientId) === uid) return true;

  const contactSet = new Set(linkedContactIds);
  if (contactSet.size === 0) return false;

  if (projectData.clientId && contactSet.has(String(projectData.clientId))) return true;
  if (
    projectData.clientContactId &&
    contactSet.has(String(projectData.clientContactId))
  ) {
    return true;
  }
  const idList = parseIdList(projectData.clientIds);
  for (const cid of idList) {
    if (contactSet.has(cid)) return true;
  }
  return false;
}

/**
 * Extract the projectId from URL params / body / query. Route mounts vary
 * (`/:id`, `/:projectId`, `/:pid`) so we accept all common names. Returns
 * empty string when nothing matches — the caller decides how to 4xx.
 */
export function extractProjectId(req: any): string {
  const p = req.params || {};
  const b = req.body || {};
  const q = req.query || {};
  const raw =
    p.projectId ||
    p.id ||
    p.pid ||
    b.projectId ||
    q.projectId ||
    '';
  return String(raw || '').trim();
}

/**
 * Express middleware: verify the caller can access the target project.
 * See file header for the exact rules per role.
 */
export async function requireProjectAccess(
  req: any,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user || !req.user.uid) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const projectId = extractProjectId(req);
  if (!projectId) {
    res.status(400).json({ error: 'projectId required' });
    return;
  }

  try {
    const db = admin.firestore();
    const projRef = db.collection('projects').doc(projectId);
    const projSnap = await projRef.get();
    if (!projSnap.exists) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const projectData = (projSnap.data() as any) || {};
    const role = normalizeRole(req.userProfile?.role);
    const uid: string = req.user.uid;

    // Cache the project doc + normalized role for the downstream handler so
    // it doesn't have to re-fetch. Any handler can `req.project.data` and
    // skip its own projects/:id read.
    (req as any).projectId = projectId;
    (req as any).projectRole = role;
    (req as any).project = { id: projSnap.id, data: projectData };

    // Admin + GC always pass — matches firestore.rules `isGCOnly()`.
    if (BYPASS_ROLES.has(role)) {
      next();
      return;
    }

    // Client: verify ownership by uid OR any linked contact id.
    if (role === 'client') {
      const linkedContactIds = await clientLinkedContactIds(db, uid);
      if (clientOwnsProject(projectData, uid, linkedContactIds)) {
        next();
        return;
      }
      res.status(403).json({ error: 'No access to this project' });
      return;
    }

    // PM / Sub / Designer: must be in assignedUserIds, OR (designer only)
    // must match assignedDesignerId.
    if (ASSIGNED_UID_ROLES.has(role)) {
      const assigned = Array.isArray(projectData.assignedUserIds)
        ? projectData.assignedUserIds.map(String)
        : [];
      if (assigned.includes(uid)) {
        next();
        return;
      }
      if (role === 'designer' && projectData.assignedDesignerId === uid) {
        next();
        return;
      }
      res.status(403).json({ error: 'Not assigned to this project' });
      return;
    }

    // Any other role (pending_gc, unrecognized) has no access.
    res.status(403).json({ error: 'No access to this project' });
  } catch (err: any) {
    console.error('[requireProjectAccess] error:', err);
    res
      .status(500)
      .json({ error: 'Failed to verify project access' });
  }
}

/**
 * Variant that reads the project id from the expense doc first (for routes
 * like PATCH /api/expenses/:expenseId where the project is only reachable via
 * the expense). Falls back to body/query so clients can still hint at the
 * project without a lookup.
 *
 * Usage:
 *   app.patch('/api/expenses/:expenseId', requireExpenseProjectAccess, handler)
 *
 * The wrapped handler still receives req.project + req.projectId, so it can
 * skip its own projects/:id lookup.
 */
export async function requireExpenseProjectAccess(
  req: any,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user || !req.user.uid) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  const expenseId = String(req.params?.expenseId || '').trim();
  const hinted = String(
    req.body?.projectId || req.query?.projectId || '',
  ).trim();

  let projectId = hinted;

  // If no hint, use collectionGroup to find the expense doc (expenses live at
  // projects/{projectId}/expenses/{expenseId}). Cheap because expenseId is
  // unique and Firestore fanout is bounded.
  if (!projectId && expenseId) {
    try {
      const db = admin.firestore();
      const cgSnap = await db
        .collectionGroup('expenses')
        .where(admin.firestore.FieldPath.documentId(), '==', expenseId)
        .limit(1)
        .get();
      if (!cgSnap.empty) {
        const parent = cgSnap.docs[0].ref.parent.parent;
        if (parent) projectId = parent.id;
      }
    } catch (err: any) {
      // collectionGroup without an index still works for documentId equality
      // in most cases; log and fall through to the 400 below if it fails.
      console.warn(
        '[requireExpenseProjectAccess] collectionGroup lookup failed:',
        err?.message || err,
      );
    }
  }

  if (!projectId) {
    res
      .status(400)
      .json({ error: 'projectId required (query, body, or resolvable expense)' });
    return;
  }

  // Reuse the main check by hoisting projectId onto the params.
  if (!req.params) req.params = {};
  req.params.projectId = projectId;
  return requireProjectAccess(req, res, next);
}
