import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1000 } });
const page = await ctx.newPage();

await page.goto('https://skyelineos.web.app/sign-in', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 15000 });
await page.fill('#email', 'testgc@skyelineos.com');
await page.fill('#password', 'SkyeTest2024!');
await page.getByRole('button', { name: /^Sign In$/ }).click();
await page.waitForFunction(() => !location.pathname.startsWith('/sign-in'), { timeout: 20000 });
await page.waitForTimeout(2000);

await page.goto('https://skyelineos.web.app/estimates', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// Try to click into the first estimate
const firstCard = page.locator('button:has-text("Edit"), [role="button"]').filter({ hasText: /Gardanier|Edit/i }).first();
try { await firstCard.click({ timeout: 5000 }); } catch { /* */ }
await page.waitForTimeout(2000);

await page.screenshot({ path: '/tmp/estimate-after.png', fullPage: false });

await browser.close();
console.log('done — /tmp/estimate-after.png');
