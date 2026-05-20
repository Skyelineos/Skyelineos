// One-off: signs in as testgc, finds a project, and creates a test bid
// request inviting tyjorho@gmail.com via the Firestore REST API. Prints
// the resulting bidRequest doc path so we can delete it after Tyler verifies.

import { chromium } from 'playwright';

const EMAIL = process.env.SMOKE_EMAIL    || 'testgc@skyelineos.com';
const PASS  = process.env.SMOKE_PASSWORD || 'SkyeTest2024!';
const TARGET_EMAIL = 'tyjorho@gmail.com';
const FS = 'https://firestore.googleapis.com/v1/projects/skyelineos/databases/(default)/documents';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

console.log('→ Signing in as', EMAIL);
await page.goto('https://skyelineos.web.app/sign-in', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.locator('input[type=email]').first().fill(EMAIL);
await page.locator('input[type=password]').first().fill(PASS);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForTimeout(6000);
console.log('  ✓ signed in');

// Pull a fresh ID token out of Firebase Auth's IndexedDB.
const idToken = await page.evaluate(() => new Promise(resolve => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => {
    const tx = req.result.transaction('firebaseLocalStorage', 'readonly');
    const store = tx.objectStore('firebaseLocalStorage');
    const getAll = store.getAll();
    getAll.onsuccess = () => {
      const recs = getAll.result;
      const user = recs.find(r => (r.fbase_key || '').startsWith('firebase:authUser:'));
      if (user?.value?.stsTokenManager?.accessToken) {
        resolve(user.value.stsTokenManager.accessToken);
      } else {
        resolve(null);
      }
    };
    getAll.onerror = () => resolve(null);
  };
  req.onerror = () => resolve(null);
}));

if (!idToken) {
  console.error('✗ Could not retrieve ID token. Aborting.');
  await browser.close();
  process.exit(1);
}
console.log('  ✓ got ID token (length', idToken.length, ')');

const auth = { Authorization: `Bearer ${idToken}` };

// Find a project for testgc.
const projResp = await fetch(`${FS}/projects?pageSize=20`, { headers: auth });
const projJson = await projResp.json();
if (!projResp.ok) {
  console.error('✗ Projects fetch failed:', projJson);
  await browser.close();
  process.exit(1);
}
const docs = projJson.documents || [];
console.log(`  ✓ found ${docs.length} project(s)`);
if (docs.length === 0) {
  console.error('✗ No projects available to attach a bidRequest to.');
  await browser.close();
  process.exit(1);
}
// Pick the first project.
const firstProject = docs[0];
const projectPath = firstProject.name; // ".../projects/{id}"
const projectId = projectPath.split('/').pop();
const projectName = firstProject.fields?.name?.stringValue || '(unnamed)';
console.log('  ✓ using project:', projectName, projectId);

// Build the bidRequest doc body.
const dueDate = (() => {
  const d = new Date(); d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
})();
const nowIso = new Date().toISOString();

const body = {
  fields: {
    projectId:       { stringValue: projectId },
    projectName:     { stringValue: projectName },
    trade:           { stringValue: 'Tile' },
    scope:           { stringValue: 'TEST BID REQUEST — please ignore. Verifying sub portal delivery. Will be deleted.' },
    callouts:        { stringValue: '' },
    plans:           { arrayValue: { values: [] } },
    dueDate:         { stringValue: dueDate },
    invitedSubIds:   { arrayValue: { values: [
      { stringValue: TARGET_EMAIL.toLowerCase() },
    ]}},
    invitedSubContactIds: { arrayValue: { values: [] } },
    invitedByUserId: { stringValue: 'test-script' },
    invitedByName:   { stringValue: 'Test Script' },
    status:          { stringValue: 'open' },
    createdAt:       { timestampValue: nowIso },
    updatedAt:       { timestampValue: nowIso },
    _test:           { booleanValue: true }, // marker for easy cleanup
  },
};

const createResp = await fetch(
  `${FS}/projects/${projectId}/bidRequests`,
  {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  },
);
const createJson = await createResp.json();
if (!createResp.ok) {
  console.error('✗ bidRequest create failed:', createJson);
  await browser.close();
  process.exit(1);
}
const requestPath = createJson.name; // full document name
const requestId = requestPath.split('/').pop();
console.log('\n✅ TEST BID REQUEST CREATED');
console.log('   ID:        ', requestId);
console.log('   Path:      ', requestPath);
console.log('   Project:   ', projectName, `(${projectId})`);
console.log('   Trade:     ', 'Tile');
console.log('   Invited:   ', TARGET_EMAIL);
console.log('\nTo delete after verification, run:');
console.log(`   node scripts/delete-test-bid-request.mjs ${projectId} ${requestId}`);

await browser.close();
