// READ-ONLY diagnostic (TASK-0003). Signs in as the test GC, then:
//   1) Dumps the most-recent bidRequests across the project (collectionGroup,
//      ordered by createdAt desc) and prints each doc's invitedSubIds +
//      vendor emails — ground truth for what the send path ACTUALLY writes.
//   2) Runs the EXACT portal query (array-contains-any invitedSubIds + orderBy
//      createdAt desc) to confirm the composite collectionGroup index is live
//      in prod (a missing index returns FAILED_PRECONDITION).
// Writes nothing. Safe to run against prod.

import { chromium } from 'playwright';

// Creds come from the environment / .env.local — never hardcoded. See
// scripts/e2e/README.md. Set E2E_ADMIN_EMAIL/PASSWORD (or SMOKE_EMAIL/PASSWORD).
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.SMOKE_EMAIL || '';
const PASS = process.env.E2E_ADMIN_PASSWORD || process.env.SMOKE_PASSWORD || '';
const PROBE_EMAIL = process.env.PROBE_EMAIL || 'tyjorho@gmail.com';
if (!EMAIL || !PASS) {
  console.error('✗ Set E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD (a GC/admin test account) in the environment / .env.local.');
  process.exit(2);
}
const RUNQUERY = 'https://firestore.googleapis.com/v1/projects/skyelineos/databases/(default)/documents:runQuery';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

console.log('→ Signing in as', EMAIL);
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
    const getAll = tx.objectStore('firebaseLocalStorage').getAll();
    getAll.onsuccess = () => {
      const user = getAll.result.find(r => (r.fbase_key || '').startsWith('firebase:authUser:'));
      resolve(user?.value?.stsTokenManager?.accessToken || null);
    };
    getAll.onerror = () => resolve(null);
  };
  req.onerror = () => resolve(null);
}));
if (!idToken) { console.error('✗ no ID token'); await browser.close(); process.exit(1); }
console.log('  ✓ signed in, token len', idToken.length);
const auth = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };

function strArr(v) {
  if (!v?.arrayValue?.values) return [];
  return v.arrayValue.values.map(x => x.stringValue ?? JSON.stringify(x));
}

// ── 1) Recent bidRequests, ordered by createdAt desc ───────────────────────
console.log('\n=== Recent bidRequests (collectionGroup, createdAt desc, limit 8) ===');
const recentResp = await fetch(RUNQUERY, {
  method: 'POST', headers: auth,
  body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'bidRequests', allDescendants: true }],
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    limit: 8,
  }}),
});
const recentJson = await recentResp.json();
if (!recentResp.ok) {
  console.error('✗ recent query failed:', JSON.stringify(recentJson));
} else {
  const rows = (recentJson || []).filter(r => r.document);
  console.log(`  ${rows.length} doc(s)`);
  for (const r of rows) {
    const f = r.document.fields || {};
    const id = r.document.name.split('/').pop();
    const vendorsEmails = (f.vendors?.arrayValue?.values || [])
      .map(v => v.mapValue?.fields?.email?.stringValue).filter(Boolean);
    console.log(`\n  • ${id}  trade=${f.trade?.stringValue || '—'}  status=${f.status?.stringValue || '—'}`);
    console.log(`    createdAt=${f.createdAt?.timestampValue || '(missing!)'}`);
    console.log(`    invitedSubIds=${JSON.stringify(strArr(f.invitedSubIds))}`);
    console.log(`    invitedSubContactIds=${JSON.stringify(strArr(f.invitedSubContactIds))}`);
    console.log(`    vendor emails=${JSON.stringify(vendorsEmails)}`);
  }
}

// ── 2) Exact portal query: array-contains-any + orderBy → index probe ───────
console.log('\n=== Portal query probe (array-contains-any invitedSubIds + orderBy createdAt) ===');
console.log(`  searching invitedSubIds for: ${PROBE_EMAIL}`);
const idxResp = await fetch(RUNQUERY, {
  method: 'POST', headers: auth,
  body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'bidRequests', allDescendants: true }],
    where: { fieldFilter: {
      field: { fieldPath: 'invitedSubIds' },
      op: 'ARRAY_CONTAINS_ANY',
      value: { arrayValue: { values: [{ stringValue: PROBE_EMAIL.toLowerCase() }] } },
    }},
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    limit: 5,
  }}),
});
const idxJson = await idxResp.json();
if (!idxResp.ok) {
  console.error(`✗ INDEX/QUERY PROBE FAILED [${idxResp.status}]:`, JSON.stringify(idxJson));
  console.error('   ^ If this says FAILED_PRECONDITION, the collectionGroup index is NOT deployed.');
} else {
  const rows = (idxJson || []).filter(r => r.document);
  console.log(`  ✓ query succeeded (index is live). ${rows.length} doc(s) match ${PROBE_EMAIL}`);
  for (const r of rows) {
    const id = r.document.name.split('/').pop();
    console.log(`    • ${id}`);
  }
}

await browser.close();
console.log('\n(diagnostic complete — no writes performed)');
