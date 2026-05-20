import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
const page = await ctx.newPage();

await page.goto('https://skyelineos.web.app/sign-in', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#email', { timeout: 15000 });
await page.fill('#email', 'testgc@skyelineos.com');
await page.fill('#password', 'SkyeTest2024!');
await page.getByRole('button', { name: /^Sign In$/ }).click();
await page.waitForFunction(() => !location.pathname.startsWith('/sign-in'), { timeout: 20000 });
await page.waitForTimeout(2000);

await page.goto('https://skyelineos.web.app/sales', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/sales-current.png', fullPage: true });

await browser.close();
console.log('done — /tmp/sales-current.png');
