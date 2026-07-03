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

import { writeFileSync } from 'node:fs';
import { createHarness, BASE_URL, API_BASE, RUN_ID } from './lib/harness.mjs';
import { run as runTaskLibrary } from './suites/taskLibrary.suite.mjs';
import { run as runUiSmoke } from './suites/uiSmoke.suite.mjs';
import { run as runCriticalPath } from './suites/criticalPath.suite.mjs';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const suiteArg = (() => {
  const i = args.indexOf('--suite');
  return i >= 0 ? args[i + 1] : null;
})();
const keep = has('--keep');
const yes = has('--yes') || process.env.E2E_CONFIRM === '1';

// ── Optional reporting layer ────────────────────────────────────────────────
// When triggered by the dashboard "Test app" button, the qa-suite workflow sets
// E2E_RUN_ID + E2E_REPORT_URL + E2E_REPORT_TOKEN so we can stream results into
// qa_runs/{id} (the dashboard QA panel reads them live) and clear the deploy
// lock on the final report. Absent these, this is a no-op — local runs are
// unaffected.
const REPORT_RUN_ID = process.env.E2E_RUN_ID || '';
const REPORT_URL = process.env.E2E_REPORT_URL || '';
const REPORT_TOKEN = process.env.E2E_REPORT_TOKEN || '';

function buildChecks(h) {
  return (h.results || []).map((r) => ({
    name: r.name,
    status: r.ok ? 'ok' : 'failed',
    ms: r.ms,
    error: r.err || null,
  }));
}

async function report(phase, patch) {
  if (!REPORT_RUN_ID || !REPORT_URL || !REPORT_TOKEN) return;
  try {
    await fetch(REPORT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REPORT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: REPORT_RUN_ID, phase, patch }),
    });
  } catch (e) {
    console.error('report failed:', e.message);
  }
}

// Which suites to run.
const runData = suiteArg ? suiteArg === 'taskLibrary' : true;
const runUi = suiteArg ? suiteArg === 'ui' : has('--ui');
// Critical-path suite: opt-in via --suite critical OR --critical flag.
// Skipped by default so a plain `npm run test:e2e` stays fast; add it to
// CI's parallel matrix as a separate job.
const runCritical = suiteArg ? suiteArg === 'critical' : has('--critical');

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
  await report('running', { status: 'running' });

  let hadError = false;
  let fatalError = null;
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
    if (runCritical) {
      console.log('\n▶ Suite: Critical path');
      await runCriticalPath(h);
    }
  } catch (e) {
    hadError = true;
    fatalError = e?.message || String(e);
    console.error('\n💥 Fatal error during run:', fatalError);
  } finally {
    await h.teardown({ keep });
    const { passed, failed } = h.summary();
    const checks = buildChecks(h);
    const status = hadError ? 'error' : failed > 0 ? 'failed' : 'passed';
    const reportDoc = {
      runId: REPORT_RUN_ID || RUN_ID,
      status,
      error: fatalError || null,
      summary: { total: checks.length, passed, failed, errored: hadError ? 1 : 0 },
      checks,
    };
    try { writeFileSync('qa-report.json', JSON.stringify(reportDoc, null, 2)); } catch { /* ignore */ }
    // Final report clears the deploy lock (the /api/qa/report handler does it).
    await report('final', { status, error: fatalError || null, summary: reportDoc.summary, checks });
    try {
      await h.signOut();
    } catch {
      /* ignore */
    }
    process.exit(hadError || failed > 0 ? 1 : 0);
  }
})();
