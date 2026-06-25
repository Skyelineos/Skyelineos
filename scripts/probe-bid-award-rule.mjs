// Rule-layer probe for the D-016 bid-award compliance tripwire (TASK-0001).
//
// tsc + vite build never exercise firestore.rules, so this asserts the rule
// behavior directly against the Firestore emulator. It covers two cases:
//
//   NEGATIVE — a privileged GC/admin doing a *direct* browser write that flips
//              status -> 'awarded' WITHOUT complianceVerifiedAt must be DENIED.
//   POSITIVE — the endpoint-style write (status 'awarded' + complianceVerifiedAt
//              set in the same write, the stamp /api/bids/award applies) is ALLOWED.
//
// Uses only the already-installed `firebase` (client SDK, subject to rules) and
// `firebase-admin` (Admin SDK, bypasses rules — used purely to seed fixtures).
// No new deps, no prod access — everything runs against local emulators.
//
// Run:
//   firebase emulators:start --only firestore,auth          # terminal 1
//   node scripts/probe-bid-award-rule.mjs                   # terminal 2
//
// Env overrides (defaults match the emulator suite defaults):
//   FIRESTORE_EMULATOR_HOST   (default 127.0.0.1:8080)
//   FIREBASE_AUTH_EMULATOR_HOST (default 127.0.0.1:9099)
//   GCLOUD_PROJECT            (default skyelineos)

import admin from 'firebase-admin';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCustomToken } from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'skyelineos';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

// Make sure the Admin SDK targets the emulators too (it reads these env vars).
process.env.FIRESTORE_EMULATOR_HOST = FS_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const GC_UID = 'probe-gc-user';
const BID_NEG = 'probe-bid-negative';
const BID_POS = 'probe-bid-positive';

function fail(msg) {
  console.error(`[probe] FAIL: ${msg}`);
  process.exitCode = 1;
}

// ---- Admin SDK: seed fixtures (bypasses rules) ----------------------------
admin.initializeApp({ projectId: PROJECT_ID });
const adminDb = admin.firestore();
const adminAuth = admin.auth();

// A real GC profile so getUserRole() in the rules resolves to 'gc'.
await adminDb.doc(`users/${GC_UID}`).set({ role: 'gc', name: 'Probe GC' });

// Two not-yet-awarded bids to mutate from the client.
const baseBid = { status: 'submitted', subContactId: 'some-sub', amount: 1000 };
await adminDb.doc(`bids/${BID_NEG}`).set({ ...baseBid });
await adminDb.doc(`bids/${BID_POS}`).set({ ...baseBid });

const customToken = await adminAuth.createCustomToken(GC_UID);

// ---- Client SDK: writes subject to firestore.rules ------------------------
const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key' });
const auth = getAuth(app);
connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
const db = getFirestore(app);
const [fsHostName, fsPort] = FS_HOST.split(':');
connectFirestoreEmulator(db, fsHostName, Number(fsPort));

await signInWithCustomToken(auth, customToken);

// NEGATIVE: self-award without the compliance stamp -> must be DENIED.
let negDenied = false;
try {
  await updateDoc(doc(db, 'bids', BID_NEG), {
    status: 'awarded',
    awardedAt: serverTimestamp(),
  });
} catch (e) {
  if (e?.code === 'permission-denied') negDenied = true;
  else fail(`negative case threw an unexpected error: ${e?.code || e}`);
}
if (negDenied) {
  console.log("[probe] PASS (negative): direct GC award without complianceVerifiedAt was DENIED");
} else {
  fail("negative case was ALLOWED — direct GC self-award bypassed the gate");
}

// POSITIVE: endpoint-style award carrying the compliance stamp -> ALLOWED.
let posAllowed = false;
try {
  await updateDoc(doc(db, 'bids', BID_POS), {
    status: 'awarded',
    awardedAt: serverTimestamp(),
    complianceVerifiedAt: serverTimestamp(),
  });
  posAllowed = true;
} catch (e) {
  fail(`positive case was DENIED (${e?.code || e}) — award with complianceVerifiedAt should be allowed`);
}
if (posAllowed) {
  console.log("[probe] PASS (positive): award with complianceVerifiedAt was ALLOWED");
}

// ---- Cleanup --------------------------------------------------------------
await adminDb.doc(`users/${GC_UID}`).delete().catch(() => {});
await adminDb.doc(`bids/${BID_NEG}`).delete().catch(() => {});
await adminDb.doc(`bids/${BID_POS}`).delete().catch(() => {});

if (process.exitCode === 1) {
  console.error('[probe] FAIL — D-016 tripwire did not behave as expected');
} else {
  console.log('[probe] PASS — D-016 bid-award rule tripwire holds');
}
process.exit(process.exitCode || 0);
