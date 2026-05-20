/**
 * Refresh the Ingestion Lab contacts cache.
 *
 * Reads the live /contacts collection, finds contacts associated with either
 * the Giboney or Christensen project (by live project doc ID), and writes a
 * snapshot to ingestion_lab/data/contacts_cache/{contactId}. The brain pass
 * reads this snapshot at runtime — the lab never touches /contacts directly.
 *
 * Re-run any time the contacts list changes. Doc IDs are stable (mirroring
 * the original /contacts/{id}), so re-running overwrites in place; entries
 * that have dropped off either project since the last run are deleted.
 *
 * Usage:
 *   1. Download a service account key from Firebase Console →
 *      Project Settings → Service Accounts → Generate new private key.
 *   2. Grab the two live project doc IDs (Firebase Console → Firestore →
 *      projects collection → click each doc → copy ID).
 *   3. Run from project root:
 *        GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
 *        GIBONEY_PROJECT_ID=<live id> \
 *        CHRISTENSEN_PROJECT_ID=<live id> \
 *        node scripts/refresh-ingestion-contacts-cache.mjs
 *
 * Discovery mode — if you don't know the project IDs yet:
 *        GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
 *        node scripts/refresh-ingestion-contacts-cache.mjs --list-projects
 */

import admin from 'firebase-admin';

const args = process.argv.slice(2);
const listProjects = args.includes('--list-projects');

const giboneyId = process.env.GIBONEY_PROJECT_ID;
const christensenId = process.env.CHRISTENSEN_PROJECT_ID;

admin.initializeApp();
const db = admin.firestore();

async function listProjectsAndExit() {
  const snap = await db.collection('projects').get();
  console.log(`Found ${snap.size} project(s):\n`);
  for (const doc of snap.docs) {
    const d = doc.data();
    console.log(`  ${doc.id}`);
    console.log(`    name:        ${d.name ?? '(no name)'}`);
    console.log(`    clientName:  ${d.clientName ?? ''}`);
    console.log(`    address:     ${d.address ?? ''}`);
    console.log('');
  }
  console.log(
    'Set GIBONEY_PROJECT_ID and CHRISTENSEN_PROJECT_ID, then re-run without --list-projects.'
  );
}

async function refresh() {
  if (!giboneyId || !christensenId) {
    console.error('[error] Both GIBONEY_PROJECT_ID and CHRISTENSEN_PROJECT_ID must be set.');
    console.error('        Run with --list-projects to discover the IDs.');
    process.exit(1);
  }

  // Verify the projects exist before doing anything else — catches typo'd
  // IDs instead of silently caching zero contacts.
  const [giboneySnap, christensenSnap] = await Promise.all([
    db.collection('projects').doc(giboneyId).get(),
    db.collection('projects').doc(christensenId).get(),
  ]);
  if (!giboneySnap.exists) {
    console.error(`[error] Giboney project ID ${giboneyId} not found in /projects.`);
    process.exit(1);
  }
  if (!christensenSnap.exists) {
    console.error(`[error] Christensen project ID ${christensenId} not found in /projects.`);
    process.exit(1);
  }
  console.log(`[ok] Resolved Giboney     → ${giboneySnap.data().name ?? giboneyId}`);
  console.log(`[ok] Resolved Christensen → ${christensenSnap.data().name ?? christensenId}`);

  // Pull all contacts linked to either project.
  // array-contains-any supports up to 30 values — two is well within limits.
  const contactsSnap = await db
    .collection('contacts')
    .where('associatedProjects', 'array-contains-any', [giboneyId, christensenId])
    .get();

  console.log(`[ok] Found ${contactsSnap.size} contact(s) linked to either project.`);

  const cacheRef = db.collection('ingestion_lab').doc('data').collection('contacts_cache');
  const freshIds = new Set();
  const summaryRows = [];

  // Firestore batched writes cap at 500 ops; chunk defensively.
  const writeChunks = [];
  let chunk = db.batch();
  let chunkOps = 0;
  const flushWrites = () => {
    if (chunkOps > 0) {
      writeChunks.push(chunk);
      chunk = db.batch();
      chunkOps = 0;
    }
  };

  for (const contact of contactsSnap.docs) {
    const c = contact.data();
    const associated = Array.isArray(c.associatedProjects) ? c.associatedProjects : [];
    const labProjectSlugs = [];
    if (associated.includes(giboneyId)) labProjectSlugs.push('giboney');
    if (associated.includes(christensenId)) labProjectSlugs.push('christensen');

    const cacheDoc = {
      contactId: contact.id,
      name: c.name ?? '(unnamed)',
      email: c.email ?? null,
      phone: c.phone ?? null,
      address: c.address ?? null,
      associatedProjects: associated,
      labProjectSlugs,
      cachedAt: admin.firestore.FieldValue.serverTimestamp(),
      cachedByUid: 'probe-script',
    };

    chunk.set(cacheRef.doc(contact.id), cacheDoc);
    chunkOps += 1;
    freshIds.add(contact.id);
    summaryRows.push({ name: cacheDoc.name, slugs: labProjectSlugs });

    if (chunkOps >= 400) flushWrites();
  }
  flushWrites();

  for (const batch of writeChunks) await batch.commit();
  console.log(`[ok] Wrote ${freshIds.size} cache entry/entries.`);

  // Delete entries from previous runs that no longer belong (contacts removed
  // from either project since the last refresh).
  const existing = await cacheRef.select().get();
  const stale = existing.docs.filter((d) => !freshIds.has(d.id));
  if (stale.length) {
    const delChunks = [];
    let delChunk = db.batch();
    let delOps = 0;
    const flushDeletes = () => {
      if (delOps > 0) {
        delChunks.push(delChunk);
        delChunk = db.batch();
        delOps = 0;
      }
    };
    for (const d of stale) {
      delChunk.delete(d.ref);
      delOps += 1;
      if (delOps >= 400) flushDeletes();
    }
    flushDeletes();
    for (const batch of delChunks) await batch.commit();
    console.log(`[ok] Removed ${stale.length} stale cache entry/entries.`);
  } else {
    console.log('[ok] No stale cache entries to remove.');
  }

  console.log('');
  console.log('Cached contacts:');
  console.log('  ' + 'name'.padEnd(34) + 'projects');
  console.log('  ' + '-'.repeat(34) + '--------');
  for (const r of summaryRows.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log('  ' + r.name.padEnd(34) + r.slugs.join(', '));
  }
  console.log('');
  console.log('Done.');
}

async function main() {
  if (listProjects) {
    await listProjectsAndExit();
  } else {
    await refresh();
  }
}

main().catch((e) => {
  console.error('[error]', e);
  process.exit(1);
});
