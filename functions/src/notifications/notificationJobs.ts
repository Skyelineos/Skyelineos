// Scheduled executor for delayed automation steps.
//
// fireTrigger enqueues a notificationJobs/{id} doc (status 'pending', runAt) for
// any step with delayMinutes > 0. This sweep runs every 5 minutes, picks up due
// jobs, re-evaluates the step's condition (including an optional live re-read of
// a referenced doc — so "if the bid STILL isn't submitted after 2 days, text
// them" works), and either creates the notification or marks the job skipped.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { buildNotificationDoc, evalCondition } from './fireTrigger';
import { FlowStep, FlowCondition } from './triggerCatalog';

if (!admin.apps.length) admin.initializeApp();

// Collections the recheck is allowed to read. Keeps a misconfigured rule from
// reading arbitrary paths.
const RECHECK_COLLECTIONS = new Set([
  'projects', 'bids', 'bidRequests', 'tasks', 'clients', 'contacts', 'estimates', 'invoices',
]);

async function conditionPasses(
  db: admin.firestore.Firestore,
  condition: FlowCondition | undefined,
  variables: Record<string, any>,
): Promise<boolean> {
  // Live re-read path: re-pull a doc field and test against it.
  if (condition?.recheck && condition.type !== 'always') {
    const { collection, docIdVar, field } = condition.recheck;
    const docId = variables[docIdVar];
    if (RECHECK_COLLECTIONS.has(collection) && docId) {
      try {
        const snap = await db.collection(collection).doc(String(docId)).get();
        const fresh = snap.exists ? (snap.data() as any)?.[field] : undefined;
        return evalCondition(condition, { ...variables, [field]: fresh, [condition.field || field]: fresh });
      } catch (e) {
        console.warn('[notificationJobs] recheck read failed, falling back to snapshot', e);
      }
    }
  }
  return evalCondition(condition, variables);
}

export const notificationJobSweep = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'America/Denver' },
  async () => {
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    const dueSnap = await db
      .collection('notificationJobs')
      .where('status', '==', 'pending')
      .where('runAt', '<=', now)
      .limit(200)
      .get();

    if (dueSnap.empty) return;

    let created = 0;
    let skipped = 0;
    const batch = db.batch();

    for (const jobDoc of dueSnap.docs) {
      const job = jobDoc.data() as any;
      const step = job.step as FlowStep;
      const variables = (job.variables || {}) as Record<string, any>;

      const pass = await conditionPasses(db, step?.condition, variables);
      if (pass && step) {
        const ref = db.collection('notifications').doc();
        batch.set(ref, buildNotificationDoc(job.triggerKey, step, {
          recipientUserId: job.recipientUserId,
          variables,
          projectId: job.projectId || undefined,
          fromUserName: job.fromUserName || undefined,
        }));
        created += 1;
        batch.update(jobDoc.ref, {
          status: 'done',
          executedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        skipped += 1;
        batch.update(jobDoc.ref, {
          status: 'skipped',
          executedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }

    await batch.commit();
    console.log(`[notificationJobSweep] processed ${dueSnap.size} jobs — ${created} sent, ${skipped} skipped`);
  },
);
