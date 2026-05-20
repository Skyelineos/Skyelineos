// Smoke test for the Lumber Takeoff wizard.
// - Signs in with a test account against the deployed Skyeline app
// - Navigates through Tools → Lumber → Project Picker → first project → first/new takeoff
// - Asserts no console errors / no uncaught page errors at any step
//
// Run BEFORE every deploy that touches the lumber wizard / Tools section.
// Usage:  node scripts/smoke-lumber.mjs [--url <baseUrl>] [--headed]
//
// Catches the kind of bug that slipped through on 2026-05-13: a `void StageTool;`
// statement that referenced a type-only import, which crashed the wizard's JS
// module at load with a ReferenceError. tsc + vite build both passed.

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const BASE_URL = urlIndex >= 0 ? args[urlIndex + 1] : 'https://skyelineos.web.app';
const HEADED = args.includes('--headed');

const EMAIL = process.env.SMOKE_EMAIL    || 'testgc@skyelineos.com';
const PASS  = process.env.SMOKE_PASSWORD || 'SkyeTest2024!';

const errors = [];
const warnings = [];

function recordError(label, msg) {
  errors.push(`[${label}] ${msg}`);
  // Truncate long stack traces so the console output stays readable
  const display = msg.length > 200 ? msg.slice(0, 200) + '…' : msg;
  process.stderr.write(`  ✗ ${label}: ${display}\n`);
}
function recordWarning(label, msg) {
  warnings.push(`[${label}] ${msg}`);
}

const browser = await chromium.launch({ headless: !HEADED });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

// Listen for console errors + uncaught page errors throughout the run.
page.on('pageerror', e => {
  if (KNOWN_NOISE.some(rx => rx.test(e.message))) return;
  recordError('PAGEERR', e.message);
});
// Known pre-existing production noise unrelated to the lumber takeoff —
// keep this list short and well-justified. Each entry should reference the
// component that emits it so future cleanup is easy.
const KNOWN_NOISE = [
  /Failed to load resource.*404/,                            // expected 404s on optional assets
  /Firebase production error - failing fast/,                // progressUtils.ts wrapper noise
  /Error calculating live progress/,                         // progressUtils.ts (Express endpoint missing in prod)
  /Firebase API returned non-JSON/,                          // progressUtils.ts (HTML fallback when API not deployed)
  /FIRESTORE.*INTERNAL ASSERTION FAILED/,                    // pdfjs/Firestore race after sign-in — transient
  /\[firebase\/firestore\].*Could not reach Cloud Firestore/, // transient connectivity
];

page.on('console', msg => {
  if (msg.type() === 'error') {
    const text = msg.text();
    if (KNOWN_NOISE.some(rx => rx.test(text))) return;
    recordError('CONSOLE', text);
  } else if (msg.type() === 'warning') {
    recordWarning('CONSOLE', msg.text());
  }
});

const STEPS = [];
let stepCounter = 0;
async function step(label, fn) {
  stepCounter++;
  process.stdout.write(`→ ${label}…`);
  const start = Date.now();
  try {
    await fn();
    process.stdout.write(` ✓ ${(Date.now() - start)}ms\n`);
    STEPS.push({ label, ok: true });
  } catch (e) {
    process.stdout.write(` ✗\n`);
    // Capture diagnostic on failure
    try {
      const url = page.url();
      const title = await page.title().catch(() => '?');
      const visibleText = (await page.locator('body').innerText().catch(() => '')).slice(0, 400);
      const screenshotPath = `/tmp/smoke-fail-${stepCounter}-${label.replace(/[^a-z0-9]/gi, '_')}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      process.stderr.write(`     url:    ${url}\n`);
      process.stderr.write(`     title:  ${title}\n`);
      process.stderr.write(`     screenshot: ${screenshotPath}\n`);
      process.stderr.write(`     visible (excerpt): ${visibleText.replace(/\s+/g, ' ').slice(0, 200)}\n`);
    } catch { /* */ }
    recordError(`STEP:${label}`, e.message);
    STEPS.push({ label, ok: false, error: e.message });
  }
}

console.log(`\nSmoke test — ${BASE_URL}`);
console.log('─'.repeat(60));

await step('Open sign-in page', async () => {
  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#email', { timeout: 15000 });
});

await step('Sign in', async () => {
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASS);
  await page.getByRole('button', { name: /^Sign In$/ }).click();
  // Wait until URL is no longer /sign-in (or any post-auth route renders)
  await page.waitForFunction(
    () => !location.pathname.startsWith('/sign-in'),
    { timeout: 20000 },
  );
  // Brief pause to let auth state + Firestore role doc resolve. We don't use
  // networkidle here — Firebase keeps long-poll connections open, so it never
  // settles. 1.5s after the redirect is enough for the RoleBasedRedirect to
  // run and the post-auth UI shell to mount.
  await page.waitForTimeout(1500);
});

await step('Open Tools page', async () => {
  await page.goto(`${BASE_URL}/tools`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Lumber Takeoff Calculator', { timeout: 10000 });
});

await step('Open Lumber Takeoff (project picker)', async () => {
  await page.goto(`${BASE_URL}/tools/lumber`, { waitUntil: 'domcontentloaded' });
  // Should land on the project picker
  await page.waitForSelector('h1:has-text("Pick a project")', { timeout: 10000 });
});

await step('Pick first project', async () => {
  // Project cards live inside the picker grid. Target buttons under .grid that are visible.
  // Use a generous wait so Firestore project query has time to resolve.
  const card = page.locator('div.grid > button:visible').first();
  await card.waitFor({ timeout: 10000 });
  await card.click();
  await page.waitForURL(/\/tools\/lumber\/[^\/]+$/, { timeout: 10000 });
});

await step('Open/create a takeoff (wizard mount)', async () => {
  // Click any button matching /takeoff/i — works for both "New takeoff" (top right)
  // and "Start a takeoff" (empty-state CTA) and for an existing takeoff card.
  const btn = page.getByRole('button', { name: /takeoff/i }).first();
  await btn.waitFor({ timeout: 8000 });
  await btn.click();
  await page.waitForURL(/\/tools\/lumber\/[^\/]+\/[^\/]+$/, { timeout: 15000 });
  await page.waitForSelector('h2:has-text("Setup")', { timeout: 10000 });
});

await step('Verify stepper is rendered', async () => {
  // The stepper has labels for each step. Check that "Walls" is in the DOM —
  // a strong signal the wizard module fully evaluated.
  await page.waitForSelector('text=Walls', { timeout: 5000 });
  await page.waitForSelector('text=Headers', { timeout: 5000 });
  await page.waitForSelector('text=Results', { timeout: 5000 });
});

await step('Open Estimates page (verifies Costings tab module loads)', async () => {
  await page.goto(`${BASE_URL}/estimates`, { waitUntil: 'domcontentloaded' });
  // Either the heading "Estimates" appears, or the page is empty-state for this account.
  // Either way, the bundle should load without ReferenceError. Wait 2s for any chunk-load errors.
  await page.waitForSelector('h1', { timeout: 10000 });
  await page.waitForTimeout(2000);
});

await browser.close();

console.log('─'.repeat(60));
console.log(`Steps: ${STEPS.filter(s => s.ok).length} ✓ / ${STEPS.filter(s => !s.ok).length} ✗`);
console.log(`Errors: ${errors.length}   Warnings: ${warnings.length}`);

if (errors.length) {
  console.error('\nFAIL — errors detected:');
  errors.slice(0, 25).forEach(e => console.error(' ', e));
  if (errors.length > 25) console.error(` …and ${errors.length - 25} more`);
  process.exit(1);
}

console.log('\nOK — wizard mounted without runtime errors.');
process.exit(0);
