// One-off: signs in as testgc, grabs an ID token, and drives the REAL bid
// send path by POSTing to /api/bid-requests/send (the same endpoint
// SendBidPackageModal calls). Unlike send-test-bid-request.mjs — which writes
// a bidRequest doc straight to Firestore and therefore never triggers an
// email — this exercises the server route that mints the magic-link invite
// token AND sends the branded SendGrid email. Use it to verify the sub bid
// invitation email actually lands.
//
// Invites tyjorho@gmail.com for the "Tile" trade on the first project found.
// The created bidRequest is marked so it can be cleaned up afterward; the
// script prints the projectId + bidRequestId for delete-test-bid-request.mjs.

import { chromium } from 'playwright';

const EMAIL = process.env.SMOKE_EMAIL    || 'testgc@skyelineos.com';
const PASS  = process.env.SMOKE_PASSWORD || 'SkyeTest2024!';
const TARGET_EMAIL = process.env.TARGET_EMAIL || 'tyjorho@gmail.com';
const BASE = 'https://skyelineos.web.app';
const FS = `https://firestore.googleapis.com/v1/projects/skyelineos/databases/(default)/documents`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

console.log('→ Signing in as', EMAIL);
await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.locator('input[type=email]').first().fill(EMAIL);
await page.locator('input[type=password]').first().fill(PASS);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForTimeout(6000);
console.log('  ✓ signed in');

const idToken = await page.evaluate(() => new Promise(resolve => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => {
    const tx = req.result.transaction('firebaseLocalStorage', 'readonly');
    const getAll = tx.objectStore('firebaseLocalStorage').getAll();
    getAll.onsuccess = () => {
      const user = getAll.result.find(r => (r.fbase_key || '').startsWith('firebase:authUser:'));
      resolve(user?.value?.stsTokenManager?.accessToken || null);
    };
    getAll.onerror = () => resolve(null);
  };
  req.onerror = () => resolve(null);
}));

if (!idToken) { console.error('✗ Could not retrieve ID token. Aborting.'); await browser.close(); process.exit(1); }
console.log('  ✓ got ID token (length', idToken.length, ')');
const auth = { Authorization: `Bearer ${idToken}` };

// Find a project.
const projResp = await fetch(`${FS}/projects?pageSize=20`, { headers: auth });
const projJson = await projResp.json();
const docs = projJson.documents || [];
if (!projResp.ok || docs.length === 0) {
  console.error('✗ No projects available:', projJson);
  await browser.close(); process.exit(1);
}
const projectPath = docs[0].name;
const projectId = projectPath.split('/').pop();
const projectName = docs[0].fields?.name?.stringValue || '(unnamed)';
console.log('  ✓ using project:', projectName, projectId);

const dueDate = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();

// Drive the REAL send route. No skipDispatch → the route sends the email itself.
const body = {
  projectId,
  projectName,
  type: 'item',
  stage: 'rough',
  trade: 'Tile',
  scope: 'TEST BID EMAIL — please ignore. Verifying the sub bid invitation email. Will be deleted.',
  callouts: '',
  plans: [],
  dueDate,
  requesterName: 'Skyeline Homes (test)',
  vendors: [
    { vendorName: 'Test Vendor', email: TARGET_EMAIL },
  ],
};

console.log('→ POST /api/bid-requests/send (real email path) inviting', TARGET_EMAIL);
const sendResp = await fetch(`${BASE}/api/bid-requests/send`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const sendJson = await sendResp.json().catch(() => ({}));
if (!sendResp.ok || !sendJson.ok) {
  console.error('✗ send failed:', sendResp.status, sendJson);
  await browser.close(); process.exit(1);
}

console.log('\n✅ REAL BID INVITATION SENT');
console.log('   bidRequestId:', sendJson.bidRequestId);
console.log('   sentEmails:  ', sendJson.sentEmails);
console.log('   sentSms:     ', sendJson.sentSms);
console.log('   total:       ', sendJson.total);
console.log('   vendorLinks: ', JSON.stringify(sendJson.vendorLinks, null, 2));
console.log('\nTo delete after verification, run:');
console.log(`   node scripts/delete-test-bid-request.mjs ${projectId} ${sendJson.bidRequestId}`);

await browser.close();
