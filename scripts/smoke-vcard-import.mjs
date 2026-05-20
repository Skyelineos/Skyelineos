// Smoke test: vCard import on the /sales page.
// Signs in, navigates to Sales, drops a multi-card vCard via a synthetic
// File on the hidden input, confirms the review dialog renders with the
// inline FieldChip buttons for missing data, then closes — checking the
// page logs no errors throughout.

import { chromium } from 'playwright';

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const BASE_URL = urlIndex >= 0 ? args[urlIndex + 1] : 'https://skyelineos.web.app';
const HEADED = args.includes('--headed');

const EMAIL = process.env.SMOKE_EMAIL    || 'testgc@skyelineos.com';
const PASS  = process.env.SMOKE_PASSWORD || 'SkyeTest2024!';

const errors = [];
const KNOWN_NOISE = [
  /Failed to load resource.*404/,
  /Firebase production error - failing fast/,
  /Error calculating live progress/,
  /Firebase API returned non-JSON/,
  /FIRESTORE.*INTERNAL ASSERTION FAILED/,
  /\[firebase\/firestore\].*Could not reach Cloud Firestore/,
  /@firebase\/firestore.*permission-denied.*Missing or insufficient permissions/, // pre-existing snapshot listener noise
];

const browser = await chromium.launch({ headless: !HEADED });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

page.on('pageerror', e => {
  if (KNOWN_NOISE.some(rx => rx.test(e.message))) return;
  errors.push(`PAGEERR: ${e.message}`);
  process.stderr.write(`  ✗ PAGEERR: ${e.message.slice(0, 200)}\n`);
});
page.on('console', msg => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  if (KNOWN_NOISE.some(rx => rx.test(text))) return;
  errors.push(`CONSOLE: ${text}`);
  process.stderr.write(`  ✗ CONSOLE: ${text.slice(0, 200)}\n`);
});

try {
  console.log(`→ ${BASE_URL}`);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Sign in
  await page.locator('input[type=email]').first().fill(EMAIL);
  await page.locator('input[type=password]').first().fill(PASS);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForTimeout(5000);
  console.log('  ✓ signed in');

  // Navigate to /sales
  await page.goto(`${BASE_URL}/sales`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  console.log('  ✓ Sales page loaded');

  // Confirm the new Import .vcf button is present
  const importBtn = page.getByRole('button', { name: /import contacts/i });
  await importBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log('  ✓ Import .vcf button rendered');

  // Synthesize a multi-vCard file and feed it via the hidden input
  const vcardText = `BEGIN:VCARD
VERSION:3.0
N:Doe;John;;;
FN:John Doe
TEL;TYPE=CELL:801-555-1111
EMAIL:john@example.com
END:VCARD
BEGIN:VCARD
VERSION:3.0
N:Smith;Jane;;;
FN:Jane Smith
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Acme Plumbing
ORG:Acme Plumbing
END:VCARD
`;
  const input = page.locator('input[type=file][accept*=vcf]');
  await input.setInputFiles({
    name: 'test.vcf',
    mimeType: 'text/vcard',
    buffer: Buffer.from(vcardText, 'utf-8'),
  });
  console.log('  ✓ multi-vCard injected');

  // Wait for the review dialog (3 contacts → bulk mode)
  await page.getByText(/Import 3 contacts/i).waitFor({ state: 'visible', timeout: 5000 });
  console.log('  ✓ review dialog opened with 3 contacts');

  // Confirm the missing-info banner appears (Jane has no phone/email; Acme has no phone)
  const banner = page.getByText(/missing name, phone, or email/i);
  await banner.waitFor({ state: 'visible', timeout: 3000 });
  console.log('  ✓ missing-info banner present');

  // Confirm "+ phone" / "+ email" inline chips render for incomplete rows
  const addEmailChip = page.getByRole('button', { name: /^\+ email$/i }).first();
  await addEmailChip.waitFor({ state: 'visible', timeout: 3000 });
  console.log('  ✓ inline "+ email" chip rendered for missing fields');

  // Cancel out — we're not actually writing test data to prod
  await page.getByRole('button', { name: /^cancel$/i }).click();
  await page.waitForTimeout(500);
  console.log('  ✓ cancelled cleanly');

  console.log(`\n${errors.length === 0 ? '✅ all checks passed' : `❌ ${errors.length} error(s)`}`);
} catch (e) {
  console.error(`\n✗ flow failed: ${e.message}`);
  errors.push(`FLOW: ${e.message}`);
} finally {
  await browser.close();
}

process.exit(errors.length === 0 ? 0 : 1);
