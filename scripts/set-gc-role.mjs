/**
 * Creates or updates a user's Firestore profile with role: 'gc'.
 *
 * Usage:
 *   1. Firebase Console → Project Settings → Service Accounts → Generate new private key
 *   2. Save the downloaded JSON as ./serviceAccountKey.json in the project root
 *   3. Run:
 *        GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
 *        GC_EMAIL=tyler@skyelinehomes.com \
 *        node scripts/set-gc-role.mjs
 */

import admin from 'firebase-admin';

const gcEmail = process.env.GC_EMAIL;
const gcName = process.env.GC_NAME || 'Tyler Rhoton';

if (!gcEmail) {
  console.error('Set GC_EMAIL environment variable');
  process.exit(1);
}

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

async function run() {
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(gcEmail);
    console.log(`✅ Found Firebase Auth user: ${userRecord.uid}`);
  } catch (e) {
    console.error(`❌ No Firebase Auth user found for ${gcEmail}`);
    process.exit(1);
  }

  const uid = userRecord.uid;
  const userRef = db.collection('users').doc(uid);
  const existing = await userRef.get();

  if (existing.exists) {
    await userRef.update({ role: 'gc', name: gcName, email: gcEmail });
    console.log(`✅ Updated ${gcEmail} → role: gc`);
  } else {
    await userRef.set({
      email: gcEmail,
      name: gcName,
      role: 'gc',
      permissions: [],
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Created GC profile for ${gcEmail} (uid: ${uid})`);
  }

  console.log('Done — sign out and back in on the app to refresh.');
}

run().catch(console.error);
