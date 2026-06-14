// One-shot migration: remap each project's `currentPhase` from the legacy
// 10-phase list to the client-facing major milestones (Foundation, Framing,
// 4-Way, Sheet Rock, Hard Floors, Finish Work, Punch List, Complete) so the
// homeowner progress track lights up correctly for projects created before the
// milestone change.
//
// Runs on a 5-minute schedule, writes a marker doc to
// `_admin/projectPhaseMigration` after a clean run, and exits early thereafter.
// Same pattern as oneShotContactAuthBackfill (scheduled, not callable, because
// the org policy blocks the public invoker grant callables need). Idempotent:
// only writes when a project's phase actually changes.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Legacy / variant phase name → new milestone. Keys are normalized
// (lowercased, trimmed). New milestone names map to themselves so already-
// migrated projects are left unchanged. Anything not listed is left untouched.
const PHASE_MAP: Record<string, string> = {
  'pre-construction': 'Foundation',
  'preconstruction': 'Foundation',
  'pre construction': 'Foundation',
  'planning': 'Foundation',
  'site prep': 'Foundation',
  'site preparation': 'Foundation',
  'sitework': 'Foundation',
  'excavation': 'Foundation',
  'foundation': 'Foundation',
  'framing': 'Framing',
  'rough mep': '4-Way',
  'rough-in': '4-Way',
  'rough in': '4-Way',
  'roughin': '4-Way',
  'mechanicals': '4-Way',
  '4-way': '4-Way',
  '4 way': '4-Way',
  'four way': '4-Way',
  'insulation': '4-Way',
  'drywall': 'Sheet Rock',
  'sheetrock': 'Sheet Rock',
  'sheet rock': 'Sheet Rock',
  'flooring': 'Hard Floors',
  'hard floors': 'Hard Floors',
  'hardfloors': 'Hard Floors',
  'finish work': 'Finish Work',
  'finishes': 'Finish Work',
  'finish': 'Finish Work',
  'punch list': 'Punch List',
  'punchlist': 'Punch List',
  'punch': 'Punch List',
  'complete': 'Complete',
  'completed': 'Complete',
  'closeout': 'Complete',
};

export const oneShotPhaseMigration = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/Denver',
  },
  async () => {
    const markerRef = db.collection('_admin').doc('projectPhaseMigration');
    const marker = await markerRef.get();
    if (marker.exists) {
      const m = marker.data() as any;
      if (m.completed === true && (m.errors ?? 0) === 0) return;
    }

    console.log('[phaseMigration] starting…');
    const snap = await db.collection('projects').get();

    let updated = 0;
    let unchanged = 0;
    let skipped = 0;
    let errors = 0;

    for (const docSnap of snap.docs) {
      try {
        const data = docSnap.data() as any;
        const current = data.currentPhase;
        if (!current || typeof current !== 'string') { skipped += 1; continue; }
        const key = current.trim().toLowerCase();
        const mapped = PHASE_MAP[key];
        if (!mapped) { skipped += 1; continue; }      // unknown value — leave it
        if (mapped === current) { unchanged += 1; continue; } // already correct
        await docSnap.ref.update({
          currentPhase: mapped,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        updated += 1;
      } catch (e) {
        console.error('[phaseMigration] update failed for', docSnap.id, e);
        errors += 1;
      }
    }

    await markerRef.set({
      completed: errors === 0,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      processed: snap.size,
      updated,
      unchanged,
      skipped,
      errors,
    });

    console.log(`[phaseMigration] done — processed=${snap.size} updated=${updated} unchanged=${unchanged} skipped=${skipped} errors=${errors}`);
  },
);
