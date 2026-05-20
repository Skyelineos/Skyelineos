import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errs = [];
const warns = [];
page.on('pageerror', e => errs.push('PAGEERR: ' + e.message));
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error') errs.push('CONSOLE: ' + t.slice(0, 300));
  else if (m.type() === 'warning') warns.push('WARN: ' + t.slice(0, 200));
});
page.on('requestfailed', req => errs.push(`REQFAIL: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
console.log('→ Loading /sign-in');
const t0 = Date.now();
await page.goto('https://skyelineos.web.app/sign-in', { waitUntil: 'domcontentloaded' });
console.log('  domcontentloaded at', Date.now() - t0, 'ms');
await page.waitForTimeout(3000);
await page.locator('input[type=email]').first().fill('testgc@skyelineos.com');
await page.locator('input[type=password]').first().fill('SkyeTest2024!');
console.log('  clicking Sign In at', Date.now() - t0, 'ms');
await page.getByRole('button', { name: /sign in/i }).click();
console.log('  waiting for redirect…');
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(1000);
  console.log(`    +${i+1}s: url =`, page.url());
  if (!page.url().includes('/sign-in')) break;
}
const visibleText = await page.evaluate(() => document.body.innerText.slice(0, 800));
console.log('--- visible text after sign-in ---');
console.log(visibleText);
console.log('--- errors ---');
errs.forEach(e => console.log(e));
console.log('--- warnings (first 10) ---');
warns.slice(0, 10).forEach(w => console.log(w));
await browser.close();
