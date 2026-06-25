// TASK-0003 — end-to-end test-send harness.
//
// Goal: exercise the REAL bid-package send path against prod so a styled email
// actually lands in the test sub's inbox AND a bidRequest doc is created with
// the production-shaped `invitedSubIds`. Tyler then clicks the magic link,
// signs into the sub portal, and confirms the bid request is visible.
//
// What it does (all __e2e-tagged so it self-cleans):
//   1. Signs in as the GC test account (Playwright → Firebase ID token).
//   2. Finds-or-creates an __e2e project.
//   3. Creates an __e2e "Test Sub" contact at the target email.
//   4. (best-effort) Uploads a tiny placeholder PDF to Storage so the email
//      has a working "Plans / Documents" download button.
//   5. Calls POST /api/bid-requests/send (the canonical route) WITHOUT
//      skipDispatch, so SendGrid sends the real email. The server writes
//      invitedSubIds = [contactId, (linkedUserId?), lowercased email].
//   6. Prints the bidRequestId, the magic link, and the recipient email.
//
// Cleanup after Tyler verifies:
//   node scripts/delete-test-bid-request.mjs <projectId> <bidRequestId>
//   (delete the __e2e project + contact from Firestore console if desired —
//    both carry the `__e2e: true` marker for a filtered sweep.)
//
// Credentials (set in .env.local or the environment):
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD   (a GC/admin test account)
//   — falls back to SMOKE_EMAIL / SMOKE_PASSWORD for compatibility with the
//     older scripts.
//   TARGET_EMAIL   (optional, defaults to tyjorho@gmail.com)
//
// NOTE: this script was authored but NOT executed during TASK-0003 — the test
// GC credentials available in the build environment returned HTTP 400
// (invalid login) at sign-in, so a live send could not be performed. Run it
// once valid creds are configured.

import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL || 'https://skyelineos.web.app';
const FS = 'https://firestore.googleapis.com/v1/projects/skyelineos/databases/(default)/documents';
// Creds come from the environment / .env.local — never hardcoded. See
// scripts/e2e/README.md. Set E2E_ADMIN_EMAIL/PASSWORD (or SMOKE_EMAIL/PASSWORD).
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.SMOKE_EMAIL || '';
const PASS = process.env.E2E_ADMIN_PASSWORD || process.env.SMOKE_PASSWORD || '';
const TARGET_EMAIL = (process.env.TARGET_EMAIL || 'tyjorho@gmail.com').toLowerCase().trim();
const E2E_TAG = '__e2e';

const die = async (browser, ...m) => { console.error('✗', ...m); if (browser) await browser.close(); process.exit(1); };

if (!EMAIL || !PASS) {
  await die(null, 'Set E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD (a GC/admin test account) in the environment / .env.local.');
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

console.log('→ Signing in as', EMAIL);
await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.locator('input[type=email]').first().fill(EMAIL);
await page.locator('input[type=password]').first().fill(PASS);
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForTimeout(6000);

const idToken = await page.evaluate(() => new Promise(resolve => {
  const req = indexedDB.open('firebaseLocalStorageDb');
  req.onsuccess = () => {
    const getAll = req.result.transaction('firebaseLocalStorage', 'readonly')
      .objectStore('firebaseLocalStorage').getAll();
    getAll.onsuccess = () => {
      const u = getAll.result.find(r => (r.fbase_key || '').startsWith('firebase:authUser:'));
      resolve(u?.value?.stsTokenManager?.accessToken || null);
    };
    getAll.onerror = () => resolve(null);
  };
  req.onerror = () => resolve(null);
}));
if (!idToken) await die(browser, 'Could not retrieve ID token (sign-in failed — check creds / App Check).');
console.log('  ✓ signed in (token len', idToken.length, ')');
const auth = { Authorization: `Bearer ${idToken}` };
const jsonAuth = { ...auth, 'Content-Type': 'application/json' };
const nowIso = new Date().toISOString();

// ── 2) Find-or-create an __e2e project ──────────────────────────────────────
let projectId = '';
let projectName = `__e2e Bid Visibility Test`;
{
  const r = await fetch(`${FS}/projects?pageSize=50`, { headers: auth });
  const j = await r.json();
  if (r.ok) {
    const existing = (j.documents || []).find(d => d.fields?.[E2E_TAG]?.booleanValue === true
      && (d.fields?.name?.stringValue || '').startsWith('__e2e Bid Visibility'));
    if (existing) { projectId = existing.name.split('/').pop(); projectName = existing.fields.name.stringValue; }
  }
  if (!projectId) {
    const body = { fields: {
      name: { stringValue: projectName },
      status: { stringValue: 'active' },
      assignedUserIds: { arrayValue: { values: [] } },
      [E2E_TAG]: { booleanValue: true },
      createdAt: { timestampValue: nowIso },
      updatedAt: { timestampValue: nowIso },
    }};
    const cr = await fetch(`${FS}/projects`, { method: 'POST', headers: jsonAuth, body: JSON.stringify(body) });
    const cj = await cr.json();
    if (!cr.ok) await die(browser, 'project create failed:', JSON.stringify(cj));
    projectId = cj.name.split('/').pop();
  }
}
console.log('  ✓ project:', projectName, `(${projectId})`);

// ── 3) Create an __e2e Test Sub contact at the target email ─────────────────
let contactId = '';
{
  const body = { fields: {
    name: { stringValue: 'Test Sub (__e2e)' },
    company: { stringValue: 'E2E Test Co' },
    email: { stringValue: TARGET_EMAIL },
    role: { stringValue: 'subcontractor' },
    trade: { stringValue: 'Tile' },
    trades: { arrayValue: { values: [{ stringValue: 'Tile' }] } },
    [E2E_TAG]: { booleanValue: true },
    createdAt: { timestampValue: nowIso },
    updatedAt: { timestampValue: nowIso },
  }};
  const cr = await fetch(`${FS}/contacts`, { method: 'POST', headers: jsonAuth, body: JSON.stringify(body) });
  const cj = await cr.json();
  if (!cr.ok) await die(browser, 'contact create failed:', JSON.stringify(cj));
  contactId = cj.name.split('/').pop();
}
console.log('  ✓ contact:', contactId, `(${TARGET_EMAIL})`);

// ── 4) (best-effort) upload a tiny placeholder PDF to Storage ───────────────
// A minimal valid one-page PDF. Uploaded via the Storage upload REST API using
// the GC token. If this fails (rules/quota), we still send with no plans.
let plans = [];
try {
  const pdf = Buffer.from(
    '%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n' +
    '0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n' +
    'trailer<</Size 4/Root 1 0 R>>\nstartxref\n164\n%%EOF\n', 'utf-8');
  const objectPath = encodeURIComponent(`projects/${projectId}/bid-packages/__e2e-placeholder.pdf`);
  const up = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/skyelineos.firebasestorage.app/o?uploadType=media&name=${objectPath}`,
    { method: 'POST', headers: { ...auth, 'Content-Type': 'application/pdf' }, body: pdf },
  );
  const uj = await up.json();
  if (up.ok && uj.downloadTokens) {
    const url = `https://firebasestorage.googleapis.com/v0/b/skyelineos.firebasestorage.app/o/${objectPath}?alt=media&token=${uj.downloadTokens}`;
    plans = [{ name: '__e2e Placeholder Plan.pdf', url, size: pdf.length }];
    console.log('  ✓ placeholder PDF uploaded');
  } else {
    console.warn('  ! PDF upload skipped (sending with no plan attachment):', JSON.stringify(uj).slice(0, 160));
  }
} catch (e) {
  console.warn('  ! PDF upload threw — continuing without a plan:', e?.message || e);
}

// ── 5) Send via the canonical endpoint (real email, no skipDispatch) ────────
const dueDate = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();
const sendBody = {
  projectId,
  projectName,
  type: 'item',
  stage: 'rough',
  trade: 'Tile',
  scope: '__e2e TEST — Tile scope. Verifying sub-portal bid visibility end-to-end. Safe to ignore/delete.',
  callouts: '__e2e test send',
  plans,
  attachedPlanIds: [],
  attachedSelectionIds: [],
  dueDate,
  requesterName: 'Skyeline Homes (__e2e test)',
  vendors: [{ contactId, vendorName: 'Test Sub (__e2e)', email: TARGET_EMAIL }],
  // NOTE: skipDispatch omitted → /api/bid-requests/send sends the email itself.
};
const sr = await fetch(`${BASE}/api/bid-requests/send`, { method: 'POST', headers: jsonAuth, body: JSON.stringify(sendBody) });
const sj = await sr.json();
if (!sr.ok || !sj.ok) await die(browser, 'send failed:', JSON.stringify(sj));

const link = sj.vendorLinks?.[0]?.magicLink || `${BASE}/bid/respond/${sj.vendorLinks?.[0]?.inviteToken || '?'}`;
console.log('\n✅ TEST BID PACKAGE SENT');
console.log('   bidRequestId : ', sj.bidRequestId);
console.log('   projectId    : ', projectId);
console.log('   contactId    : ', contactId);
console.log('   recipient    : ', TARGET_EMAIL);
console.log('   emails sent  : ', sj.sentEmails, ' sms sent:', sj.sentSms);
console.log('   magic link   : ', link);
console.log('\nCleanup after verification:');
console.log(`   node scripts/delete-test-bid-request.mjs ${projectId} ${sj.bidRequestId}`);
console.log(`   (project ${projectId} + contact ${contactId} carry __e2e:true for a filtered sweep)`);

await browser.close();
