// Runtime smoke test for the Bid Leveling tool — tsc + vite build do NOT catch
// render-time crashes (CLAUDE.md "Test before shipping"). Loads /tools/bid-compare
// and fails on any uncaught error or React error boundary.
//
//   node scripts/probe-bid-compare.mjs            # against the dev server
//   BASE=https://skyelineos.web.app node scripts/probe-bid-compare.mjs
//
// Requires: npm i -D playwright  (or `npx playwright install chromium` once).
// If the route is auth-gated, set STORAGE_STATE to a saved Playwright auth state
// file (see other scripts/screenshot-*.mjs in this repo for the login pattern).

import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const STORAGE_STATE = process.env.STORAGE_STATE || undefined;

const browser = await chromium.launch();
const context = await browser.newContext(STORAGE_STATE ? { storageState: STORAGE_STATE } : {});
const page = await context.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const url = `${BASE}/tools/bid-compare`;
console.log(`[probe] loading ${url}`);
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

const heading = await page.getByText('Bid Leveling', { exact: false }).first().count();
const btn = await page.getByRole('button', { name: /Compare/i }).count();

const appErrors = errors.filter((e) =>
  /react|render|undefined is not|cannot read|Minified React error|TypeError|bid-compare/i.test(e),
);

let ok = true;
if (!heading) { console.error('[probe] FAIL: heading not found'); ok = false; }
if (!btn) { console.error('[probe] FAIL: Compare button not found'); ok = false; }
if (appErrors.length) { console.error('[probe] FAIL: console errors:\n' + appErrors.join('\n')); ok = false; }

await browser.close();
if (ok) { console.log('[probe] PASS — /tools/bid-compare renders cleanly'); process.exit(0); }
process.exit(1);
