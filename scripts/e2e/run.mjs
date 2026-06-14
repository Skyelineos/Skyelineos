// ─────────────────────────────────────────────────────────────────────────────
// E2E orchestrator
//
// Usage:
//   node scripts/e2e/run.mjs                 # data suites (taskLibrary), then teardown
//   node scripts/e2e/run.mjs --ui            # also run the Playwright UI suite
//   node scripts/e2e/run.mjs --suite ui      # only the UI suite
//   node scripts/e2e/run.mjs --keep          # DON'T auto-delete (debugging)
//   node scripts/e2e/run.mjs --yes           # skip the confirmation prompt
//
// Always tears down what it created (unless --keep). Exit code is non-zero if
// any test failed, so it's CI-friendly.
// ─────────────────────────────────────────────────────────────────────────────

import { createHarness, BASE_URL, API_BASE, RUN_ID } from './lib/harness.mjs';
import { run as runTaskLibrary } from './suites/taskLibrary.suite.mjs';
import { run as runUiSmoke } from './suites/uiSmoke.suite.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const suiteArg = (() => {
  const i = args.indexOf('--suite');
  return i >= 0 ? args[i + 1] : null;
})();
const keep = has('--keep');
const yes = has('--yes') || process.env.E2E_CONFIRM === '1';

// Which suites to run.
const runData = suiteArg ? suiteArg === 'taskLibrary' : true;
const runUi = suiteArg ? suiteArg === 'ui' : has('--ui');

async function confirm() {
  if (yes) return;
  const project = process.env.VITE_FIREBASE_PROJECT_ID;
  console.log('');
  console.log('⚠  This will CREATE and then DELETE throwaway test data on:');
  console.log(`     Firebase project : ${project}`);
  console.log(`     API base         : ${API_BASE}`);
  console.log(`     Run id           : ${RUN_ID}`);
  console.log('   All created docs are tagged __e2e and removed on teardown.');
  process.stdout.write('   Continue? (y/N) ');
  const answer = await new Promise((res) => {
    process.stdin.once('data', (d) => res(String(d).trim().toLowerCase()));
  });
  if (answer !== 'y' && answer !== 'yes') {
    console.log('Aborted.');
    process.exit(1);
  }
}

(async () => {
  await confirm();
  const h = createHarness();
  console.log(`\n🚀 E2E run ${RUN_ID} against ${BASE_URL}\n`);

  let hadError = false;
  try {
    await h.signIn();
    if (runData) {
      console.log('▶ Suite: Task Library lifecycle');
      await runTaskLibrary(h);
    }
    if (runUi) {
      console.log('\n▶ Suite: UI smoke');
      await runUiSmoke(h);
    }
  } catch (e) {
    hadError = true;
    console.error('\n💥 Fatal error during run:', e.message);
  } finally {
    await h.teardown({ keep });
    const { failed } = h.summary();
    try {
      await h.signOut();
    } catch {
      /* ignore */
    }
    process.exit(hadError || failed > 0 ? 1 : 0);
  }
})();
