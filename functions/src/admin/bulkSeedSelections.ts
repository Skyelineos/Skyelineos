/**
 * Admin-only callable function — seeds the 1,195-item selection template
 * into every active project at once (or a filtered subset).
 *
 * Calling client (admin only):
 *   import { getFunctions, httpsCallable } from 'firebase/functions';
 *   const fn = httpsCallable(getFunctions(), 'bulkSeedSelections');
 *   const result = await fn({ projectIds: ['proj_abc','proj_def'] });
 *
 * If `projectIds` is omitted, every project with status ∈
 * {active, in-progress, design, construction} is seeded.
 *
 * Idempotent: existing selections are skipped (matched by templateItemId).
 */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
// NOTE: this import path matches what SeedSelectionsFromTemplate.tsx already uses.
// The template ships in client/src/data/selectionsTemplate.ts but is duplicated
// here as functions/src/data/selectionsTemplate.ts (auto-generated build step,
// see scripts/syncSelectionsTemplate.ts).
import { SELECTIONS_TEMPLATE, TEMPLATE_VERSION } from '../data/selectionsTemplate';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const BATCH_SIZE = 400; // Firestore limit is 500

export const bulkSeedSelections = functions
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (data: { projectIds?: string[]; dryRun?: boolean }, context) => {
    // Admin gate
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
    }
    const userSnap = await db.collection('users').doc(context.auth.uid).get();
    const role = userSnap.data()?.role;
    if (role !== 'admin' && role !== 'gc') {
      throw new functions.https.HttpsError('permission-denied', 'Admin or GC role required');
    }

    let projectIds = data.projectIds;
    if (!projectIds || projectIds.length === 0) {
      const snap = await db.collection('projects')
        .where('status', 'in', ['active', 'in-progress', 'design', 'construction'])
        .get();
      projectIds = snap.docs.map(d => d.id);
    }

    const report = {
      templateVersion: TEMPLATE_VERSION,
      templateItemCount: SELECTIONS_TEMPLATE.length,
      projectsProcessed: 0,
      projectsSeeded: 0,
      itemsCreated: 0,
      itemsSkipped: 0,
      dryRun: !!data.dryRun,
      errors: [] as string[],
    };

    for (const projectId of projectIds) {
      try {
        const existingSnap = await db.collection(`projects/${projectId}/selections`).get();
        const existingTemplateIds = new Set(
          existingSnap.docs
            .map(d => (d.data().templateItemId || d.data().id) as string | undefined)
            .filter(Boolean)
        );

        const toCreate = SELECTIONS_TEMPLATE.filter(
          t => !existingTemplateIds.has(t.id)
        );

        if (data.dryRun) {
          report.itemsCreated += toCreate.length;
          report.projectsProcessed += 1;
          if (toCreate.length > 0) report.projectsSeeded += 1;
          continue;
        }

        // Chunk into batches
        for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
          const chunk = toCreate.slice(i, i + BATCH_SIZE);
          const batch = db.batch();
          for (const tpl of chunk) {
            const ref = db.collection(`projects/${projectId}/selections`).doc();
            const { id: tplId, owner, ...rest } = tpl;
            batch.set(ref, {
              ...rest,
              templateItemId: tplId,
              templateVersion: TEMPLATE_VERSION,
              decisionOwner: owner,
              status: 'Not Started',
              clientApprovalStatus: 'Pending Options',
              orderStatus: 'Not Ordered',
              items: [],
              designerFiles: [],
              seededBy: context.auth!.uid,
              seededAt: admin.firestore.FieldValue.serverTimestamp(),
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
          await batch.commit();
          report.itemsCreated += chunk.length;
        }
        report.itemsSkipped += existingTemplateIds.size;
        report.projectsProcessed += 1;
        if (toCreate.length > 0) report.projectsSeeded += 1;
      } catch (err: any) {
        report.errors.push(`${projectId}: ${err.message || err}`);
      }
    }

    functions.logger.info('Bulk seed complete', report);
    return report;
  });
