/**
 * Run this ONCE after deploying to Firebase to create your admin user profile.
 *
 * Usage:
 *   1. Install firebase-admin: npm install -g firebase-admin (or use project devDeps)
 *   2. Download your service account key from Firebase Console →
 *      Project Settings → Service Accounts → Generate new private key
 *   3. Run:
 *        GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json \
 *        ADMIN_EMAIL=info@skyelinehomes.com \
 *        ADMIN_NAME="Tyler Rhoton" \
 *        node scripts/setup-admin.js
 */

import admin from 'firebase-admin';

const adminEmail = process.env.ADMIN_EMAIL;
const adminName = process.env.ADMIN_NAME || 'Tyler Rhoton';

if (!adminEmail) {
  console.error('Set ADMIN_EMAIL environment variable');
  process.exit(1);
}

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();

async function run() {
  // Find the Firebase Auth user by email
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(adminEmail);
    console.log(`✅ Found Firebase Auth user: ${userRecord.uid}`);
  } catch (e) {
    console.error(`❌ No Firebase Auth user found for ${adminEmail}`);
    console.error('Create the user in Firebase Console → Authentication → Add User first');
    process.exit(1);
  }

  const uid = userRecord.uid;
  const userRef = db.collection('users').doc(uid);
  const existing = await userRef.get();

  if (existing.exists) {
    console.log(`ℹ️  User profile already exists for ${adminEmail} — updating role to admin`);
    await userRef.update({ role: 'admin', permissions: ['all'], name: adminName });
  } else {
    await userRef.set({
      email: adminEmail,
      name: adminName,
      role: 'admin',
      permissions: ['all'],
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ Created admin profile for ${adminEmail} (uid: ${uid})`);
  }

  // Set custom claims so Firestore rules can also check token
  await auth.setCustomUserClaims(uid, { admin: true, role: 'admin' });
  console.log(`✅ Custom claims set on Firebase Auth token`);
  console.log('Done! Sign out and back in on the app to get the new token.');
}

run().catch(console.error);
