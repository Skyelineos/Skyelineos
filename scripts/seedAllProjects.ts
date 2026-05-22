/**
 * One-off script — call the bulkSeedSelections Cloud Function for ALL projects.
 *
 * Usage:
 *   # 1. Get yourself an ID token (must be admin/gc role):
 *   firebase login
 *   gcloud auth print-identity-token > /tmp/admin.token
 *
 *   # 2. Dry-run first to see what would change:
 *   npx tsx scripts/seedAllProjects.ts --dry-run
 *
 *   # 3. Real run:
 *   npx tsx scripts/seedAllProjects.ts
 *
 *   # Or seed specific projects:
 *   npx tsx scripts/seedAllProjects.ts --project=proj_abc --project=proj_def
 *
 * Requires environment vars:
 *   FIREBASE_PROJECT_ID  e.g. skyelineos
 *   GOOGLE_APPLICATION_CREDENTIALS path to service-account json (admin)
 */
import * as admin from 'firebase-admin';

const projectIds: string[] = [];
let dryRun = false;
for (const arg of process.argv.slice(2)) {
  if (arg === '--dry-run' || arg === '--dryrun') dryRun = true;
  else if (arg.startsWith('--project=')) projectIds.push(arg.slice('--project='.length));
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'skyelineos',
    });
  }
  const functions = await import('firebase-admin/functions');
  // Direct Firestore approach — replicates the callable's logic locally.
  const db = admin.firestore();

  // Import the template
  const { SELECTIONS_TEMPLATE, TEMPLATE_VERSION } = await import('../client/src/data/selectionsTemplate');

  let targets = projectIds;
  if (targets.length === 0) {
    const snap = await db.collection('projects')
      .where('status', 'in', ['active', 'in-progress', 'design', 'construction'])
      .get();
    targets = snap.docs.map(d => d.id);
  }
  console.log(`[seedAllProjects] template=${TEMPLATE_VERSION} items=${SELECTIONS_TEMPLATE.length} projects=${targets.length} dryRun=${dryRun}`);

  let totalCreated = 0;
  let totalSkipped = 0;
  for (const projectId of targets) {
    const existing = await db.collection(`projects/${projectId}/selections`).get();
    const existingIds = new Set(existing.docs.map(d => d.data().templateItemId).filter(Boolean));
    const toCreate = SELECTIONS_TEMPLATE.filter(t => !existingIds.has(t.templateItemId));
    console.log(`  ${projectId}: existing=${existingIds.size} toCreate=${toCreate.length}`);

    if (!dryRun && toCreate.length > 0) {
      for (let i = 0; i < toCreate.length; i += 400) {
        const batch = db.batch();
        for (const tpl of toCreate.slice(i, i + 400)) {
          const ref = db.collection(`projects/${projectId}/selections`).doc();
          batch.set(ref, {
            ...tpl,
            status: 'Not Started',
            clientApprovalStatus: 'Pending Options',
            orderStatus: 'Not Ordered',
            items: [],
            designerFiles: [],
            seededBy: 'script:seedAllProjects',
            seededAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }
    }
    totalCreated += toCreate.length;
    totalSkipped += existingIds.size;
  }
  console.log(`[seedAllProjects] DONE created=${totalCreated} skipped=${totalSkipped}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
