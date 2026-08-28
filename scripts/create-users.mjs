#!/usr/bin/env node
// create-users.mjs — programmatically create Firebase Auth accounts for
// Brandon Rhoton (CFO / admin) and Easton Foster (Office staff / office_staff).
//
// Run: node scripts/create-users.mjs
//
// Requirements:
//   • GOOGLE_APPLICATION_CREDENTIALS must point to a service-account.json
//     with Firebase Auth admin rights (or set the path below).
//
// The script is idempotent — if an account with that email already exists it
// just updates the display name / password rather than failing.

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

process.env.GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  new URL('../service-account.json', import.meta.url).pathname;

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const authClient = admin.auth();

const TEMP_PASSWORD = 'Skyeline2026!';

const USERS_TO_CREATE = [
  {
    email: 'brandon@skyelinehomes.com',
    displayName: 'Brandon Rhoton',
    role: 'admin',
    title: 'CFO',
  },
  {
    email: 'easton@skyelinehomes.com',
    displayName: 'Easton Foster',
    role: 'office_staff',
    title: 'Office Staff',
  },
  {
    email: 'nicole@skyelinehomes.com',
    displayName: 'Nicole Rhoton',
    role: 'designer',
    title: 'Designer',
  },
];

async function upsertUser({ email, displayName, role, title }) {
  let uid;

  try {
    // Try to look up existing account first
    const existing = await authClient.getUserByEmail(email);
    uid = existing.uid;
    console.log(`[existing] ${email} → uid=${uid}`);

    // Update display name + password
    await authClient.updateUser(uid, { displayName, password: TEMP_PASSWORD });
    console.log(`  ✓ Updated displayName + password`);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;

    // Create new Auth account
    const created = await authClient.createUser({
      email,
      displayName,
      password: TEMP_PASSWORD,
      emailVerified: false,
    });
    uid = created.uid;
    console.log(`[created]  ${email} → uid=${uid}`);
  }

  // Upsert Firestore profile so resolveUserProfile() picks it up
  await db.collection('users').doc(uid).set(
    {
      email,
      name: displayName,
      role,
      title,
      permissions: role === 'admin' ? ['all'] : ['read', 'write'],
      firebaseUid: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`  ✓ Firestore users/${uid} set  (role: ${role})`);

  return { uid, email, displayName, role };
}

console.log('━━━ Skyeline User Creation Script ━━━');
console.log('Service account:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
console.log('');

const results = [];
for (const user of USERS_TO_CREATE) {
  try {
    const result = await upsertUser(user);
    results.push({ ...result, status: 'ok' });
  } catch (err) {
    console.error(`  ✗ Failed for ${user.email}:`, err.message);
    results.push({ email: user.email, status: 'error', error: err.message });
  }
  console.log('');
}

console.log('━━━ Summary ━━━');
for (const r of results) {
  if (r.status === 'ok') {
    console.log(`✅ ${r.displayName} <${r.email}> — uid=${r.uid}, role=${r.role}`);
  } else {
    console.log(`❌ ${r.email} — ${r.error}`);
  }
}

console.log('');
console.log(`Temporary password: ${TEMP_PASSWORD}`);
console.log('Users should change this on first login via Settings → Account → Change Password.');

process.exit(0);
