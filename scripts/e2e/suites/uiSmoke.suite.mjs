// ─────────────────────────────────────────────────────────────────────────────
// Suite: UI smoke (Playwright)
//
// Signs in as the test admin via the real UI, then opens key pages — including
// the new Master Task Library — asserts they render without console/page errors,
// exercises a basic interaction (open the Add Task modal), and saves screenshots.
//
// Broad every-route load coverage already lives in scripts/page-tour.mjs; this
// suite focuses on the new feature plus a couple of anchors.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL } from '../lib/harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = resolve(__dirname, '../screenshots');

export async function run(h) {
  const { test, assert, log } = h;
  mkdirSync(SHOT_DIR, { recursive: true });

  const email = process.env.E2E_ADMIN_EMAIL;
  const pass = process.env.E2E_ADMIN_PASSWORD;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Per-page console/page error capture, reset before each navigation.
  let errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 240));
  });

  const shot = (name) => page.screenshot({ path: resolve(SHOT_DIR, `${name}.png`), fullPage: true }).catch(() => {});

  try {
    await test('sign in via UI', async () => {
      await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await page.locator('input[type=email]').first().fill(email);
      await page.locator('input[type=password]').first().fill(pass);
      await page.getByRole('button', { name: /sign in/i }).click();
      // Wait until we leave /sign-in.
      for (let i = 0; i < 15; i++) {
        await page.waitForTimeout(1000);
        if (!page.url().includes('/sign-in')) break;
      }
      assert(!page.url().includes('/sign-in'), 'still on /sign-in after login (check E2E_ADMIN_* creds / App Check)');
    });

    const visit = async (label, path, settle = 2500) => {
      errors = [];
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(settle);
      await shot(label);
      assert(errors.length === 0, `console/page errors on ${path}:\n      ${errors.slice(0, 5).join('\n      ')}`);
    };

    await test('Master Task Library renders', async () => {
      await visit('master-tasks', '/master-tasks');
      const heading = await page.getByText('Master Task Library').first().isVisible().catch(() => false);
      assert(heading, '"Master Task Library" heading not visible');
    });

    await test('Master Task Library — Add Task modal opens', async () => {
      const addBtn = page.getByRole('button', { name: /add task/i }).first();
      await addBtn.click();
      await page.waitForTimeout(800);
      const modal = await page.getByText(/Add Master Task/i).first().isVisible().catch(() => false);
      assert(modal, 'Add Master Task modal did not open');
      await shot('master-tasks-add-modal');
      await page.keyboard.press('Escape').catch(() => {});
    });

    await test('Projects page renders', async () => {
      await visit('projects', '/projects');
    });

    await test('Dashboard renders', async () => {
      await visit('dashboard', '/dashboard');
    });

    log(`    screenshots → ${SHOT_DIR}`);
  } finally {
    await browser.close();
  }
}
