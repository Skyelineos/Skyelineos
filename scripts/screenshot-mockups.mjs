import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1800 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.goto(`file:///tmp/skyeline-jack-mockups.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(200);

// Full-page screenshot of both variants stacked
await page.screenshot({ path: '/tmp/mockup-both.png', fullPage: true });

// Crop to each panel individually for clarity
const panels = await page.$$('h2 + .panel');
for (let i = 0; i < panels.length; i++) {
  // include the h2 heading above each panel
  await page.evaluate((idx) => {
    document.querySelectorAll('h1, .lede, .legend').forEach(el => el.style.display = 'none');
    document.querySelectorAll('h2 + .panel').forEach((el, j) => {
      if (j !== idx) {
        el.style.display = 'none';
        el.previousElementSibling.style.display = 'none';
      }
    });
  }, i);
  await page.screenshot({ path: `/tmp/mockup-variant-${i === 0 ? 'a-i' : 'a-ii'}.png`, fullPage: true });
  // restore
  await page.evaluate(() => {
    document.querySelectorAll('h1, .lede, .legend, h2, .panel').forEach(el => el.style.display = '');
  });
}

await browser.close();
console.log('done — files at /tmp/mockup-both.png, /tmp/mockup-variant-a-i.png, /tmp/mockup-variant-a-ii.png');
