import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(`PAGEERR: ${e.message}`));
page.on('console', m => {
  if (m.type() === 'error') {
    const t = m.text();
    if (/Failed to load resource.*404|FIRESTORE.*INTERNAL|permission-denied/.test(t)) return;
    errors.push(`CONSOLE: ${t.slice(0, 200)}`);
  }
});
await page.goto('https://skyelineos.web.app/sign-in', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
// Check that the new bundle is loaded by looking at the JS hash
const html = await page.content();
const scripts = [...html.matchAll(/src="(\/assets\/index-[^"]+\.js)"/g)].map(m => m[1]);
console.log('Main JS bundle(s):', scripts);
// Try sub portal directly (will hit /not-authorized which should auto-redirect now)
await page.goto('https://skyelineos.web.app/not-authorized', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
console.log('After /not-authorized landed on:', page.url());
await page.screenshot({ path: '/tmp/sub-portal-state.png' });
console.log('errors:', errors);
await browser.close();
