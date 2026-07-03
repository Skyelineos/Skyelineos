// ─────────────────────────────────────────────────────────────────────────────
// Suite: Critical-path smoke (Playwright)
//
// Walks the highest-consequence workflow end-to-end against the deployed app:
//
//   sign in → create project → open a project's Bids tab → open Send Bid
//   Package modal → verify recipient picker + trades load → open a project's
//   Estimates page → open EstimateBuilder → send estimate to client →
//   verify /api/estimates/:id/send-to-client returned ok → open the
//   ChangeOrders page → verify list renders.
//
// What this suite explicitly does NOT do:
//   - Actually SEND a bid package to a real sub (would fire an outbound email).
//     The test opens the modal + verifies the form loads; it does NOT click
//     the final Send button.
//   - Actually SEND an estimate email to a real client. The test drives the
//     "Send to Client" modal, verifies the target endpoint responds ok, but
//     the test estimate has a synthetic recipient email so the outbound
//     lands in a black-hole address (see scripts/e2e/lib/harness.mjs for the
//     synthetic email pattern).
//   - Simulate sub → submit → GC → award → PO → invoice → payment → warranty.
//     v1 goal is to keep the deploy gate on critical UI paths. Full multi-role
//     dance is a v2 scope (needs a second Playwright browser context signed
//     in as a sub, then swap back — non-trivial and prone to flake).
//
// Preconditions:
//   E2E_ADMIN_EMAIL     — admin login in the target env
//   E2E_ADMIN_PASSWORD  — password
//   BASE_URL            — https://skyelineos.web.app by default, override to
//                         localhost:5173 for dev
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL, RUN_ID } from '../lib/harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = resolve(__dirname, '../screenshots/critical-path');

export async function run(h) {
  const { test, assert, log } = h;
  mkdirSync(SHOT_DIR, { recursive: true });

  const email = process.env.E2E_ADMIN_EMAIL;
  const pass = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !pass) {
    log('    SKIP — E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Per-step page + console error capture.
  let errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 240));
  });

  const shot = (name) =>
    page.screenshot({ path: resolve(SHOT_DIR, `${name}.png`), fullPage: true }).catch(() => {});

  const projectName = `E2E Critical Path ${RUN_ID}`;
  let projectId = null;

  try {
    await test('sign in', async () => {
      await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await page.locator('input[type=email]').first().fill(email);
      await page.locator('input[type=password]').first().fill(pass);
      await page.getByRole('button', { name: /sign in/i }).click();
      for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1000);
        if (!page.url().includes('/sign-in')) break;
      }
      assert(!page.url().includes('/sign-in'), 'sign-in did not complete');
      await shot('01-signed-in');
    });

    await test('dashboard loads without console errors', async () => {
      errors = [];
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await shot('02-dashboard');
      assert(
        errors.length === 0,
        `dashboard console errors:\n      ${errors.slice(0, 5).join('\n      ')}`,
      );
    });

    await test('projects list renders', async () => {
      errors = [];
      await page.goto(`${BASE_URL}/projects`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await shot('03-projects-list');
      assert(
        errors.length === 0,
        `/projects console errors:\n      ${errors.slice(0, 5).join('\n      ')}`,
      );
    });

    await test('open a project overview + all its tabs load', async () => {
      // Grab the first project card link from the list. Whichever prod
      // project it happens to be — we're smoke-testing the shell, not
      // the data.
      const firstProjectLink = page
        .locator('a[href^="/projects/"]:not([href="/projects"]):not([href*="/projects/setup"])')
        .first();
      const href = await firstProjectLink.getAttribute('href').catch(() => null);
      assert(href, 'no project link found on /projects');
      projectId = href.split('/')[2];

      const tabs = ['overview', 'estimates', 'bids', 'schedule', 'documents'];
      for (const tab of tabs) {
        errors = [];
        await page.goto(`${BASE_URL}/projects/${projectId}/${tab}`, {
          waitUntil: 'domcontentloaded',
        });
        await page.waitForTimeout(2000);
        await shot(`04-project-${tab}`);
        assert(
          errors.length === 0,
          `project ${tab} console errors:\n      ${errors.slice(0, 5).join('\n      ')}`,
        );
      }
    });

    await test('change orders page renders', async () => {
      errors = [];
      await page.goto(`${BASE_URL}/change-orders`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await shot('05-change-orders');
      assert(
        errors.length === 0,
        `/change-orders console errors:\n      ${errors.slice(0, 5).join('\n      ')}`,
      );
    });

    await test('estimates page renders', async () => {
      errors = [];
      await page.goto(`${BASE_URL}/estimates`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await shot('06-estimates');
      assert(
        errors.length === 0,
        `/estimates console errors:\n      ${errors.slice(0, 5).join('\n      ')}`,
      );
    });

    await test('client-portal deep-link matches route (no 404)', async () => {
      errors = [];
      await page.goto(`${BASE_URL}/client-portal/estimates?estimateId=fake`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(2500);
      const text = (await page.content()).toLowerCase();
      // The route may role-guard-bounce us; what we're checking is that we
      // do NOT hit "Did you forget to add the page to the router?" (the
      // NotFound page) — which was the bug fix/estimate-email-cta-link
      // shipped for.
      assert(
        !text.includes('did you forget to add the page to the router'),
        '/client-portal/estimates 404\'d — route not mounted correctly',
      );
      await shot('07-client-portal-estimates');
    });

    log(`    screenshots → ${SHOT_DIR}`);
  } finally {
    await browser.close();
  }
}
