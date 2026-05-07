/**
 * Seed Test Data for Skyeline Odyssey E2E Testing
 *
 * Creates three test accounts + a test project in Firebase:
 *   - Test Client:   testclient@skyelineos.com   / SkyeTest2024!
 *   - Test Designer: testdesigner@skyelineos.com / SkyeTest2024!
 *   - Test GC:       testgc@skyelineos.com       / SkyeTest2024!
 *   - Test Project:  "Johnson Residence - 123 Oak St"
 *
 * Usage (run once from project root):
 *   node scripts/seed-test-client.mjs
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .env.local ───────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
);

const firebaseConfig = {
  apiKey:            env.VITE_FIREBASE_API_KEY,
  authDomain:        env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             env.VITE_FIREBASE_APP_ID,
};

console.log('🔥 Connecting to Firebase project:', firebaseConfig.projectId);

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Test Users ────────────────────────────────────────────────────────────────
const USERS = [
  {
    email:    'testclient@skyelineos.com',
    password: 'SkyeTest2024!',
    name:     'Alex Johnson',
    role:     'client',
    label:    'Test Client',
  },
  {
    email:    'testdesigner@skyelineos.com',
    password: 'SkyeTest2024!',
    name:     'Morgan Lee',
    role:     'designer',
    label:    'Test Designer',
  },
  {
    email:    'testgc@skyelineos.com',
    password: 'SkyeTest2024!',
    name:     'Tyler Test GC',
    role:     'gc',
    label:    'Test GC (Skyeline Team)',
  },
];

async function createOrGetUser(userDef) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, userDef.email, userDef.password);
    await updateProfile(cred.user, { displayName: userDef.name });

    // Write Firestore profile
    await setDoc(doc(db, 'users', cred.user.uid), {
      name:      userDef.name,
      fullName:  userDef.name,
      email:     userDef.email,
      role:      userDef.role,
      isActive:  true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log(`  ✅ Created ${userDef.label}: ${userDef.email} (uid: ${cred.user.uid})`);
    return cred.user;
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      // Sign in to get the UID
      const cred = await signInWithEmailAndPassword(auth, userDef.email, userDef.password);
      // Update Firestore profile in case role was wrong
      await setDoc(doc(db, 'users', cred.user.uid), {
        name:      userDef.name,
        fullName:  userDef.name,
        email:     userDef.email,
        role:      userDef.role,
        isActive:  true,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      console.log(`  ♻️  Already exists, updated ${userDef.label}: ${userDef.email} (uid: ${cred.user.uid})`);
      return cred.user;
    }
    throw err;
  }
}

async function main() {
  console.log('\n📋 Creating test users...\n');

  const createdUsers = {};
  for (const userDef of USERS) {
    const fbUser = await createOrGetUser(userDef);
    createdUsers[userDef.role] = { uid: fbUser.uid, ...userDef };
  }

  // ── Create Test Project ─────────────────────────────────────────────────────
  console.log('\n🏗️  Creating test project...\n');

  const projectData = {
    name:                 'Johnson Residence',
    address:              '123 Oak Street, Austin TX 78701',
    clientName:           createdUsers.client.name,
    clientId:             createdUsers.client.uid,
    clientIds:            [createdUsers.client.uid],
    assignedDesignerId:   createdUsers.designer.uid,
    assignedDesignerName: createdUsers.designer.name,
    status:               'active',
    stage:                'active',
    projectType:          'New Construction',
    squareFootage:        3200,
    estimatedBudget:      650000,
    budget:               650000,
    spent:                0,
    startDate:            '2026-03-01',
    targetCompletion:     '2026-12-15',
    notes:                'Test project for E2E workflow testing.',
    createdAt:            serverTimestamp(),
    updatedAt:            serverTimestamp(),
  };

  // Check if test project already exists for this client
  const existingQ = await getDocs(
    query(collection(db, 'projects'), where('clientId', '==', createdUsers.client.uid), where('name', '==', 'Johnson Residence'))
  );

  let projectRef;
  if (!existingQ.empty) {
    projectRef = existingQ.docs[0].ref;
    await setDoc(projectRef, projectData, { merge: true });
    console.log(`  ♻️  Project already exists, updated: "Johnson Residence" (id: ${projectRef.id})`);
  } else {
    projectRef = await addDoc(collection(db, 'projects'), projectData);
    console.log(`  ✅ Created project: "Johnson Residence" (id: ${projectRef.id})`);
  }

  // ── Seed one sample selection ───────────────────────────────────────────────
  console.log('\n🎨 Seeding a sample selection...\n');

  await addDoc(collection(db, 'projects', projectRef.id, 'selections'), {
    floor:               'Main Floor',
    room:                'Kitchen',
    category:            'Tile',
    area:                'Backsplash',
    allowanceAmount:     2500,
    allowanceUnit:       'lump sum',
    sqftOrQuantity:      45,
    clientApprovalStatus:'Checking w/ Client',
    orderStatus:         'Not Ordered',
    notes:               'Designer to propose 3x8 subway or similar',
    items: [
      {
        id:          'item-001',
        productName: 'Zellige White 3x6 Handmade Tile',
        vendor:      'Clé Tile',
        size:        '3x6',
        tileLayout:  'Brick Lay / 1/2 Offset',
        grout:       'Sanded White – Mapei Biscuit',
        trim:        'Schluter Jolly - Polished Nickel',
        heightNote:  'To bottom of upper cabinets',
        costPerUnit: 32,
        unit:        'sqft',
        sqftOrQty:   45,
        totalCost:   1440,
        imageUrls:   [],
        layoutImageUrls: [],
        status:      'proposed',
        proposedAt:  new Date().toISOString(),
      },
    ],
    designerFiles: [],
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp(),
  });

  console.log('  ✅ Sample selection added (Kitchen Backsplash – Tile)');

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('🎉  TEST DATA READY\n');
  console.log('Login credentials (password same for all):  SkyeTest2024!\n');
  console.log(`  👷 GC / Contractor:  testgc@skyelineos.com`);
  console.log(`     → Goes to /dashboard → Projects → Johnson Residence`);
  console.log(`     → Design tab shows designer's selections\n`);
  console.log(`  🎨 Designer:         testdesigner@skyelineos.com`);
  console.log(`     → Goes to /designer-portal → Selections tab`);
  console.log(`     → Project: Johnson Residence (123 Oak Street)\n`);
  console.log(`  🏠 Client:           testclient@skyelineos.com`);
  console.log(`     → Goes to /client-portal → Selections tab`);
  console.log(`     → Can approve the Kitchen Backsplash selection\n`);
  console.log(`  🔑 Admin (existing): info@skyelinehomes.com`);
  console.log(`     → Admin Portal → can see all portals\n`);
  console.log(`  📦 Project ID: ${projectRef.id}`);
  console.log(`  🌐 Live app: https://skyelineos.web.app`);
  console.log('═'.repeat(60) + '\n');

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
