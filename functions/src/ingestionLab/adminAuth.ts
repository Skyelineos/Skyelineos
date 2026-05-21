// Shared admin-auth middleware for Ingestion Lab routes.
//
// Verifies the Firebase ID token, then confirms users/{uid}.role === 'admin'.
// Mirrors the pattern at /api/admin/users in index.ts:1064 — Firestore role
// is the single source of truth, not custom claims (claims can drift if a
// session is stale).
//
// On success, sets req.user = decoded token and calls next().

import * as admin from 'firebase-admin';

export async function adminOnly(req: any, res: any, next: any): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token' });
    return;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
    const profile = await admin.firestore().collection('users').doc(decoded.uid).get();
    const role = profile.exists ? (profile.data() || {}).role : null;
    if (role !== 'admin') {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    req.user = decoded;
    next();
  } catch (e: any) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
