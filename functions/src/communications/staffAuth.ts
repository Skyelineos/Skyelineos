// Staff-auth middleware for Communication Center AI routes.
//
// Verifies the Firebase ID token, then confirms users/{uid}.role is staff
// (admin | gc | projectManager). Mirrors ingestionLab/adminAuth.ts but widens
// the allowed roles to the GC team, since the Communication Center is a
// staff-operational surface (not admin-only like the Ingestion Lab).
//
// On success, sets req.user = decoded token and calls next().

import * as admin from 'firebase-admin';

const STAFF_ROLES = new Set(['admin', 'gc', 'projectManager']);

export async function staffOnly(req: any, res: any, next: any): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token' });
    return;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
    const profile = await admin.firestore().collection('users').doc(decoded.uid).get();
    const role = profile.exists ? (profile.data() || {}).role : null;
    if (!STAFF_ROLES.has(role)) {
      res.status(403).json({ error: 'Staff only' });
      return;
    }
    req.user = decoded;
    req.userRole = role;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
