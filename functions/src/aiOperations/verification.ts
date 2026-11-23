import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const aiOperationsVerifyGoal = onCall(
  { region: 'us-central1', enforceAppCheck: true },
  async request => {
    const uid = request.auth?.uid;
    const email = String(request.auth?.token.email || '').toLowerCase();
    const emailVerified = request.auth?.token.email_verified === true;
    if (!uid || !emailVerified || !['tyler@skyelinehomes.com', 'info@skyelinehomes.com'].includes(email)) {
      throw new HttpsError('permission-denied', 'Verified SkyelineOS owner login required.');
    }
    const user = await db.collection('users').doc(uid).get();
    if (!user.exists || user.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'SkyelineOS admin role required.');
    }
    const goalId = String(request.data?.goalId || '');
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(goalId)) {
      throw new HttpsError('invalid-argument', 'Invalid goal ID.');
    }
    const ref = db.collection('ownerGoals').doc(goalId);
    const goal = await ref.get();
    if (!goal.exists) throw new HttpsError('not-found', 'Goal not found.');
    const status = goal.data()?.status;
    if (status === 'verified_done') return { verified: true, alreadyVerified: true };
    if (status === 'canceled' || status === 'planned' || status === 'queued' || status === 'running') {
      throw new HttpsError('failed-precondition', 'Goal is not ready for owner verification.');
    }
    const evidenceUrl = goal.data()?.evidenceUrl;
    if (typeof evidenceUrl !== 'string' || !/^https:\/\/[^ ]+$/i.test(evidenceUrl)) {
      throw new HttpsError('failed-precondition', 'Source evidence link required.');
    }
    await db.runTransaction(async txn => {
      const latest = await txn.get(ref);
      if (!latest.exists) throw new HttpsError('not-found', 'Goal not found.');
      if (latest.data()?.status === 'verified_done') return;
      txn.update(ref, {
        status: 'verified_done',
        verifiedByUid: uid,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        nextAction: 'Complete — owner verified the source evidence.',
        nextCheckAt: null,
      });
      const event = db.collection('ownerGoalEvents').doc('verified-' + goalId);
      txn.set(event, {
        title: 'Owner verified goal completion',
        detail: 'Confirmed via SkyelineOS owner action. Evidence: ' + evidenceUrl,
        source: 'SkyelineOS', goalId,
        evidenceUrl,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    return { verified: true };
  },
);
