#!/usr/bin/env node
/**
 * Backfill: copy `projects/{id}/changeOrders/{coId}` → `changeOrders/{coId}` (with projectId field).
 *
 * Why this exists: T0-4 + co-migration-finish migrated all Cloud Function
 * CO writers from the deprecated subcollection to the top-level
 * `changeOrders/` collection. Any documents that were created in the
 * subcollection BEFORE the migration are now orphans — invisible to the
 * 6 client readers (ChangeOrders.tsx, ChangeOrdersTab.tsx, ClientDashboard,
 * ClientFinancials, SelectionsBoard, ProjectFinancialsCard). This script
 * walks every projects/*\/changeOrders/* doc and copies it to top-level,
 * stamping the projectId field that the new rules require.
 *
 * The script is idempotent — if a top-level CO with the same id already
 * exists, the subcollection copy is skipped (not overwritten). Safe to
 * re-run.
 *
 * ── Required setup ───────────────────────────────────────────────────────────
 *   Auth: Application Default Credentials. Either:
 *     gcloud auth application-default login
 *   …or set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path.
 *
 *   Env:
 *     FIREBASE_PROJECT_ID  defaults to 'skyelineos' (prod). To run against
 *                          dev/staging, set this to the other project id.
 *
 * ── Safety ───────────────────────────────────────────────────────────────────
 *   Refuses to run against FIREBASE_PROJECT_ID=skyelineos (prod) unless
 *   you also pass --confirm-prod. Defense against accidental dev→prod.
 *
 * ── Flags ────────────────────────────────────────────────────────────────────
 *   --dry-run        log what would be backfilled; write nothing.
 *   --confirm-prod   required to run against the prod project id.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   # Dry run against staging:
 *   FIREBASE_PROJECT_ID=skyelineos-staging node scripts/backfill-co-subcollection-to-toplevel.mjs --dry-run
 *
 *   # Real run against staging:
 *   FIREBASE_PROJECT_ID=skyelineos-staging node scripts/backfill-co-subcollection-to-toplevel.mjs
 *
 *   # Real run against prod (requires explicit confirmation):
 *   FIREBASE_PROJECT_ID=skyelineos node scripts/backfill-co-subcollection-to-toplevel.mjs --confirm-prod
 */

import admin from 'firebase-admin';

const DRY_RUN = process.argv.includes('--dry-run');
const CONFIRM_PROD = process.argv.includes('--confirm-prod');
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'skyelineos';

// ── Safety guard: refuse prod without --confirm-prod ────────────────────────
if (PROJECT_ID === 'skyelineos' && !CONFIRM_PROD) {
  console.error('Refusing to run against FIREBASE_PROJECT_ID=skyelineos (prod).');
  console.error('Pass --confirm-prod to proceed, or set FIREBASE_PROJECT_ID to a staging project.');
  process.exit(1);
}

console.log('── CO subcollection → top-level backfill ──');
console.log(`Project:  ${PROJECT_ID}`);
console.log(`Mode:     ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE (writes enabled)'}`);
if (PROJECT_ID === 'skyelineos') console.log('WARNING:  running against PRODUCTION');
console.log('');

admin.initializeApp({
  projectId: PROJECT_ID,
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

// ── Stats ───────────────────────────────────────────────────────────────────
let totalProjects = 0;
let totalScanned = 0;
let totalBackfilled = 0;
let totalSkipped = 0;
let totalErrored = 0;

async function run() {
  const projectsSnap = await db.collection('projects').get();
  totalProjects = projectsSnap.size;
  console.log(`Found ${totalProjects} project(s) to walk.\n`);

  for (const projDoc of projectsSnap.docs) {
    const projectId = projDoc.id;
    const subSnap = await projDoc.ref.collection('changeOrders').get();

    if (subSnap.empty) {
      // Don't log empties — projects without subcollection COs are the common case.
      continue;
    }

    let projFound = 0;
    let projBackfilled = 0;
    let projAlreadyAtTop = 0;
    let projErrored = 0;

    for (const subDoc of subSnap.docs) {
      projFound++;
      totalScanned++;
      const coId = subDoc.id;
      const topRef = db.collection('changeOrders').doc(coId);

      try {
        const topSnap = await topRef.get();
        if (topSnap.exists) {
          projAlreadyAtTop++;
          totalSkipped++;
          continue;
        }

        const data = subDoc.data();
        const payload = { ...data, projectId };

        if (DRY_RUN) {
          console.log(`  [dry-run] would backfill projects/${projectId}/changeOrders/${coId} → changeOrders/${coId}`);
        } else {
          await topRef.set(payload);
        }
        projBackfilled++;
        totalBackfilled++;
      } catch (err) {
        projErrored++;
        totalErrored++;
        console.error(`  ERROR projects/${projectId}/changeOrders/${coId}:`, err.message || err);
      }
    }

    console.log(
      `Project ${projectId}: ${projFound} CO(s) found, ` +
      `${projBackfilled} backfilled, ${projAlreadyAtTop} already at top-level` +
      (projErrored ? `, ${projErrored} errored` : '')
    );
  }
}

run()
  .then(() => {
    console.log('');
    console.log('── Summary ──');
    console.log(`Projects walked:        ${totalProjects}`);
    console.log(`Subcollection COs:      ${totalScanned}`);
    console.log(`Backfilled to top:      ${totalBackfilled}${DRY_RUN ? ' (would have)' : ''}`);
    console.log(`Skipped (already top):  ${totalSkipped}`);
    console.log(`Errored:                ${totalErrored}`);
    process.exit(totalErrored > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
