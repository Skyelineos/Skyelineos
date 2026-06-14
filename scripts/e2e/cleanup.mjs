// ─────────────────────────────────────────────────────────────────────────────
// E2E cleanup sweeper — safety net
//
// If a run was killed mid-flight, leftover test data may remain. This sweeps
// every doc tagged { __e2e: true } across the known test collections, plus any
// projectTasks/taskImprovements belonging to a swept test project. It NEVER
// deletes anything without the __e2e tag.
//
// Usage:
//   node scripts/e2e/cleanup.mjs            # report what it would delete
//   node scripts/e2e/cleanup.mjs --apply    # actually delete
// ─────────────────────────────────────────────────────────────────────────────

import { createHarness } from './lib/harness.mjs';

const APPLY = process.argv.includes('--apply');

(async () => {
  const h = createHarness();
  const { db, fs } = h;
  const { collection, getDocs, query, where, deleteDoc } = fs;

  await h.signIn();
  console.log(`\n🧹 E2E cleanup (${APPLY ? 'APPLY' : 'dry-run'})\n`);

  let total = 0;
  const e2eProjectIds = [];

  // Projects are tagged __e2e by the harness.
  {
    const snap = await getDocs(query(collection(db, 'projects'), where('__e2e', '==', true)));
    for (const d of snap.docs) {
      e2eProjectIds.push(d.id);
      console.log(`  projects/${d.id}  ${d.data().name || ''}`);
      total++;
      if (APPLY) await deleteDoc(d.ref);
    }
  }

  // Master tasks: API-created e2e tasks aren't __e2e-tagged, so also match the
  // E2E- code prefix. Fetch all (small collection) and filter in JS.
  {
    const snap = await getDocs(collection(db, 'masterTasks'));
    for (const d of snap.docs) {
      const data = d.data();
      const isE2E = data.__e2e === true || (data.taskCode || '').startsWith('E2E-');
      if (!isE2E) continue;
      console.log(`  masterTasks/${d.id}  ${data.taskCode || ''} ${data.title || ''}`);
      total++;
      if (APPLY) await deleteDoc(d.ref);
    }
  }

  // Sweep function-created docs scoped to swept test projects.
  for (const projectId of e2eProjectIds) {
    for (const coll of ['projectTasks', 'taskImprovements']) {
      const snap = await getDocs(query(collection(db, coll), where('projectId', '==', projectId)));
      for (const d of snap.docs) {
        console.log(`  ${coll}/${d.id}  (project ${projectId})`);
        total++;
        if (APPLY) await deleteDoc(d.ref);
      }
    }
  }

  console.log(`\n${APPLY ? 'Deleted' : 'Would delete'} ${total} doc(s).`);
  if (!APPLY && total > 0) console.log('Re-run with --apply to delete.');
  await h.signOut().catch(() => {});
  process.exit(0);
})();
