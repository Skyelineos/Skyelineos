// Page tour — signs in once, visits every authenticated route, measures load
// time + console errors per page, and prints a table at the end. Run before
// any sweeping change to catch silent regressions.
//
// Usage:
//   node scripts/page-tour.mjs                    # production
//   node scripts/page-tour.mjs --url <baseUrl>    # any host
//   node scripts/page-tour.mjs --slow             # 5s per page (uncover lazy issues)

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const BASE_URL = urlIndex >= 0 ? args[urlIndex + 1] : 'https://skyelineos.web.app';
const SETTLE_MS = args.includes('--slow') ? 5000 : 2000;

const EMAIL = process.env.SMOKE_EMAIL    || 'testgc@skyelineos.com';
const PASS  = process.env.SMOKE_PASSWORD || 'SkyeTest2024!';

// Routes to tour. Project-scoped routes use a placeholder {projectId} that
// gets filled in with the first project we find after sign-in.
const ROUTES = [
  // ─── Global ─────────────────────────────────────────────────────────────
  { path: '/dashboard',         category: 'Global' },
  { path: '/sales',             category: 'Global' },
  { path: '/estimates',         category: 'Global' },
  { path: '/contracts',         category: 'Global' },
  { path: '/contacts',          category: 'Global' },
  { path: '/projects',          category: 'Global' },
  { path: '/schedule',          category: 'Global' },
  { path: '/tasks',             category: 'Global' },
  { path: '/change-orders',     category: 'Global' },
  { path: '/documents',         category: 'Global' },
  { path: '/site-log',          category: 'Global' },
  { path: '/timesheet',         category: 'Global' },
  { path: '/safety',            category: 'Global' },
  { path: '/catalogs',          category: 'Global' },
  { path: '/financials',        category: 'Global' },
  { path: '/bills',             category: 'Global' },
  { path: '/reports',           category: 'Global' },
  { path: '/messages',          category: 'Global' },
  { path: '/comms-log',         category: 'Global' },
  { path: '/design-board',      category: 'Global' },
  { path: '/content-studio',    category: 'Global' },
  { path: '/social-media',      category: 'Global' },
  { path: '/templates',         category: 'Global' },
  { path: '/playbook',          category: 'Global' },
  { path: '/automations',       category: 'Global' },
  { path: '/import-center',     category: 'Global' },
  { path: '/settings',          category: 'Global' },
  // Tools section
  { path: '/tools',             category: 'Tools' },
  { path: '/tools/lumber',      category: 'Tools' },
  // Portals
  { path: '/designer-portal',   category: 'Portals' },
  { path: '/subcontractor-portal', category: 'Portals' },
  // Per-project — {projectId} substituted at runtime
  { path: '/projects/{projectId}',                  category: 'Project' },
  { path: '/projects/{projectId}/overview',         category: 'Project' },
  { path: '/projects/{projectId}/estimates',        category: 'Project' },
  { path: '/projects/{projectId}/bids',             category: 'Project' },
  { path: '/projects/{projectId}/schedule',         category: 'Project' },
  { path: '/projects/{projectId}/budget',           category: 'Project' },
  { path: '/projects/{projectId}/documents',        category: 'Project' },
  { path: '/projects/{projectId}/photos',           category: 'Project' },
  { path: '/projects/{projectId}/tasks',            category: 'Project' },
  { path: '/projects/{projectId}/change-orders',    category: 'Project' },
  { path: '/projects/{projectId}/site-log',         category: 'Project' },
  { path: '/projects/{projectId}/bills',            category: 'Project' },
  { path: '/projects/{projectId}/walkthroughs',     category: 'Project' },
  { path: '/projects/{projectId}/design',           category: 'Project' },
  { path: '/projects/{projectId}/move-in-binder',   category: 'Project' },
  { path: '/projects/{projectId}/takeoff',          category: 'Project' },
];

// Known noise we filter out — same list as the lumber smoke test.
const KNOWN_NOISE = [
  /Failed to load resource.*404/,
  /Firebase production error - failing fast/,
  /Error calculating live progress/,
  /Firebase API returned non-JSON/,
  /FIRESTORE.*INTERNAL ASSERTION FAILED/,
  /\[firebase\/firestore\].*Could not reach Cloud Firestore/,
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

// Capture console errors / page errors per route
let currentErrors = [];
page.on('pageerror', e => {
  if (KNOWN_NOISE.some(rx => rx.test(e.message))) return;
  currentErrors.push(`PAGEERR: ${e.message.slice(0, 200)}`);
});
page.on('console', m => {
  if (m.type() !== 'error') return;
  if (KNOWN_NOISE.some(rx => rx.test(m.text()))) return;
  currentErrors.push(`CONSOLE: ${m.text().slice(0, 200)}`);
});

console.log(`\nPage tour — ${BASE_URL}`);
console.log('─'.repeat(96));

// ─── Sign in ─────────────────────────────────────────────────────────────────
await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 15000 });
await page.fill('#email', EMAIL);
await page.fill('#password', PASS);
await page.getByRole('button', { name: /^Sign In$/ }).click();
await page.waitForFunction(() => !location.pathname.startsWith('/sign-in'), { timeout: 20000 });
await page.waitForTimeout(1500);
console.log('✓ Signed in');

// Find the first project for {projectId} substitution
let projectId = '';
try {
  await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  // Try to find a project link — most project list cards link to /projects/<id>
  projectId = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/projects/"]'));
    for (const a of links) {
      const m = a.getAttribute('href').match(/^\/projects\/([^/]+)(?:\/.*)?$/);
      if (m && m[1] !== '' && m[1] !== undefined) return m[1];
    }
    return '';
  });
  if (projectId) console.log(`✓ Using project ${projectId} for {projectId} substitution`);
  else console.log('⚠ No project found — project routes will be skipped');
} catch { /* */ }

const results = [];

for (const route of ROUTES) {
  const path = route.path.replace('{projectId}', projectId);
  if (path.includes('{projectId}') && !projectId) {
    results.push({ ...route, path, status: 'skip', loadMs: 0, errors: ['no project available'] });
    continue;
  }
  currentErrors = [];
  const start = Date.now();
  let status = 'ok';
  let finalUrl = '';
  try {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(SETTLE_MS);
    finalUrl = page.url();
    if (/\/not-authorized|\/unauthorized/.test(finalUrl)) status = 'denied';
    else if (/\/sign-in/.test(finalUrl)) status = 'auth-lost';
  } catch (e) {
    status = 'load-error';
    currentErrors.unshift(`NAVERR: ${e.message.slice(0, 200)}`);
  }
  const loadMs = Date.now() - start;
  results.push({ ...route, path, status, loadMs, errors: [...currentErrors], finalUrl });

  // Inline progress
  const icon = status === 'ok' && currentErrors.length === 0 ? '✓'
             : status === 'denied' ? '⛔'
             : status === 'auth-lost' ? '🔑'
             : status === 'skip' ? '·'
             : '✗';
  const slow = loadMs > 4000 ? ` ⚠ ${loadMs}ms` : ` ${loadMs}ms`;
  process.stdout.write(`${icon} ${path.padEnd(48)}${slow}${currentErrors.length ? ` · ${currentErrors.length} errors` : ''}\n`);
}

await browser.close();

// ─── Summary table ─────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(96));
console.log('SUMMARY');
console.log('─'.repeat(96));
const ok        = results.filter(r => r.status === 'ok' && r.errors.length === 0);
const errored   = results.filter(r => r.status === 'ok' && r.errors.length > 0);
const denied    = results.filter(r => r.status === 'denied');
const authLost  = results.filter(r => r.status === 'auth-lost');
const loadError = results.filter(r => r.status === 'load-error');
const skipped   = results.filter(r => r.status === 'skip');
const slow      = results.filter(r => r.loadMs > 4000);

console.log(`✓  Clean:        ${ok.length}`);
console.log(`✗  Console err:  ${errored.length}`);
console.log(`⛔ Denied:       ${denied.length}`);
console.log(`🔑 Auth lost:    ${authLost.length}`);
console.log(`✗  Load error:   ${loadError.length}`);
console.log(`·  Skipped:      ${skipped.length}`);
console.log(`⚠  Slow (>4s):   ${slow.length}`);

if (errored.length) {
  console.log('\nPAGES WITH CONSOLE ERRORS:');
  for (const r of errored) {
    console.log(`  ${r.path}`);
    for (const e of r.errors.slice(0, 3)) console.log(`    ${e}`);
    if (r.errors.length > 3) console.log(`    …and ${r.errors.length - 3} more`);
  }
}
if (denied.length) {
  console.log('\nPAGES DENIED (role-guard rejected — may indicate misconfigured access):');
  for (const r of denied) console.log(`  ${r.path}`);
}
if (loadError.length) {
  console.log('\nPAGES THAT FAILED TO LOAD:');
  for (const r of loadError) {
    console.log(`  ${r.path}`);
    for (const e of r.errors.slice(0, 2)) console.log(`    ${e}`);
  }
}
if (slow.length) {
  console.log('\nSLOW PAGES (>4s to settle):');
  for (const r of slow.sort((a, b) => b.loadMs - a.loadMs)) {
    console.log(`  ${r.loadMs}ms  ${r.path}`);
  }
}

const hardFail = loadError.length > 0 || authLost.length > 0;
process.exit(hardFail ? 1 : 0);
