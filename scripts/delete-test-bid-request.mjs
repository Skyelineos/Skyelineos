// Companion to send-test-bid-request.mjs — deletes the test bidRequest after
// Tyler confirms it showed up on the sub portal.
//
// Usage:  node scripts/delete-test-bid-request.mjs <projectId> <requestId>

import { chromium } from 'playwright';

const [,, projectId, requestId] = process.argv;
if (!projectId || !requestId) {
  console.error('Usage: node scripts/delete-test-bid-request.mjs <projectId> <requestId>');
  process.exit(1);
}

const EMAIL = process.env.SMOKE_EMAIL    || 'testgc@skyelineos.com';
const PASS  = process.env.SMOKE_PASSWORD || 'SkyeTest2024!';
const FS = 'https://firestore.googleapis.com/v1/projects/skyelineos/databases/(default)/documents';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
await page.goto('https://skyelineos.web.app/sign-in', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.locator('input[type=email]').first().fill(EMAIL);
await page.locator('input[type=password]').first().fill(PASS);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForTimeout(6000);

const idToken = await page.evaluate(() => new Promise(resolve => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => {
    const tx = req.result.transaction('firebaseLocalStorage', 'readonly');
    const store = tx.objectStore('firebaseLocalStorage');
    const getAll = store.getAll();
    getAll.onsuccess = () => {
      const user = getAll.result.find(r => (r.fbase_key || '').startsWith('firebase:authUser:'));
      resolve(user?.value?.stsTokenManager?.accessToken || null);
    };
    getAll.onerror = () => resolve(null);
  };
  req.onerror = () => resolve(null);
}));

if (!idToken) { console.error('✗ no token'); await browser.close(); process.exit(1); }

const resp = await fetch(
  `${FS}/projects/${projectId}/bidRequests/${requestId}`,
  { method: 'DELETE', headers: { Authorization: `Bearer ${idToken}` } },
);
if (resp.ok) {
  console.log(`✅ Deleted /projects/${projectId}/bidRequests/${requestId}`);
} else {
  console.error('✗ Delete failed:', resp.status, await resp.text());
}
await browser.close();
