import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const errs = [];
const warns = [];
page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
page.on('console', m => {
  const t = m.text();
  if (/Failed to load resource.*404|FIRESTORE.*INTERNAL|permission-denied|Could not reach Cloud Firestore/i.test(t)) return;
  if (m.type() === 'error') errs.push('CONSOLE: ' + t.slice(0, 300));
  else if (m.type() === 'warning') warns.push('WARN: ' + t.slice(0, 200));
});
page.on('requestfailed', r => {
  const u = r.url();
  if (/replit|cdn\.tailwindcss/.test(u)) return;
  errs.push(`REQFAIL: ${r.method()} ${u} — ${r.failure()?.errorText}`);
});

await page.goto('https://skyelineos.web.app/sign-in', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.locator('input[type=email]').first().fill('testgc@skyelineos.com');
await page.locator('input[type=password]').first().fill('SkyeTest2024!');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForTimeout(5000);

console.log('Pre-navigate URL:', page.url());
await page.goto('https://skyelineos.web.app/financials', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
console.log('Post-navigate URL:', page.url());

const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1200));
console.log('--- visible text ---');
console.log(bodyText);
console.log('--- errors ---');
errs.forEach(e => console.log(e));
console.log('--- warnings (first 5) ---');
warns.slice(0, 5).forEach(w => console.log(w));
await page.screenshot({ path: '/tmp/finance.png', fullPage: false });
await browser.close();
