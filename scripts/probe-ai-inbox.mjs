// Smoke probe for the AI Inbox admin page (/admin/ai-inbox).
//
// Catches runtime render errors that tsc + vite build miss. Uses the
// AuthContext test-mode bypass (localStorage.testMode = 'true' injects a fake
// admin user — see SESSION_NOTES.md "Test-mode bypass") so we don't need real
// credentials. Firestore listeners will be permission-denied without a real
// session; those console errors are filtered — we only assert the page SHELL
// renders (heading, tabs, the n8n setup instructions).
//
// IMPORTANT: the test-mode bypass only works on a DEV build (it's gated behind
// import.meta.env.DEV and is a no-op in `vite build`/`vite preview`). So for a
// local render check, run the Vite DEV server:
//
//   npx vite --port 5173            # terminal 1 (dev server)
//   BASE_URL=http://localhost:5173 node scripts/probe-ai-inbox.mjs
//
// Against the deployed site (https://skyelineos.web.app) test-mode is disabled,
// so a live run needs a real admin session — use it only as a post-deploy
// shell check after signing in, or rely on the local dev run for CI-style smoke.

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR: ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  // Expected without a real session — ignore.
  if (/Failed to load resource.*40[0-9]|FIRESTORE.*INTERNAL|permission-denied|Missing or insufficient permissions|Could not reach Cloud Firestore|net::ERR/i.test(t)) return;
  if (m.type() === 'error') errs.push('CONSOLE: ' + t.slice(0, 300));
});

// Inject the test-mode admin bypass before any app script runs. AuthContext
// reads BOTH testMode and testUser (with a role) at module load — set both.
await page.addInitScript(() => {
  try {
    window.localStorage.setItem('testMode', 'true');
    window.localStorage.setItem('testUser', JSON.stringify({ role: 'admin', email: 'probe@dev.local', uid: 'probe-admin' }));
  } catch {}
});

let pass = true;
try {
  await page.goto(`${BASE_URL}/admin/ai-inbox`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const body = await page.evaluate(() => document.body.innerText);

  const checks = [
    ['AI Inbox heading', /AI Inbox/i.test(body)],
    ['Needs Review tab', /Needs Review/i.test(body)],
    ['Ignored tab', /Ignored/i.test(body)],
    ['QuickBooks status pill', /QuickBooks/i.test(body)],
  ];

  console.log(`--- AI Inbox probe @ ${BASE_URL} ---`);
  for (const [label, ok] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${label}`);
    if (!ok) pass = false;
  }

  // Click into the Setup tab and confirm the n8n endpoint contract is shown.
  try {
    await page.getByRole('tab', { name: /setup/i }).click();
    await page.waitForTimeout(800);
    const setupText = await page.evaluate(() => document.body.innerText);
    const setupOk = /\/api\/ai-inbox\/ingest/i.test(setupText) && /N8N_INGEST_SECRET/i.test(setupText);
    console.log(`${setupOk ? '✅' : '❌'} Setup tab shows ingest endpoint + secret name`);
    if (!setupOk) pass = false;
    const mailboxOk = /Intake mailboxes/i.test(setupText) && /Add mailbox/i.test(setupText);
    console.log(`${mailboxOk ? '✅' : '❌'} Setup tab shows intake-mailbox editor`);
    if (!mailboxOk) pass = false;
  } catch (e) {
    console.log('⚠️  Could not open Setup tab:', e.message);
    pass = false;
  }

  console.log('--- unexpected errors ---');
  if (errs.length === 0) console.log('(none)');
  errs.forEach((e) => console.log(e));
  if (errs.length) pass = false;

  await page.screenshot({ path: '/tmp/ai-inbox.png', fullPage: false });
  console.log('Screenshot: /tmp/ai-inbox.png');
} catch (e) {
  console.error('Probe failed to run:', e.message);
  pass = false;
} finally {
  await browser.close();
}

console.log(pass ? '\nPROBE PASS' : '\nPROBE FAIL');
process.exit(pass ? 0 : 1);
