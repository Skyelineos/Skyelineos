// Seeds a test SMS contact so the webhook can match inbound texts
// Run: node seed-test-contact.mjs
// Requires GOOGLE_APPLICATION_CREDENTIALS or Firebase emulator running

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env
const envLines = readFileSync(resolve(__dirname, '../.env'), 'utf8').split('\n');
for (const line of envLines) {
  const [key, ...vals] = line.split('=');
  if (key && !key.startsWith('#') && vals.length) process.env[key.trim()] = vals.join('=').trim();
}

// Point at Firestore emulator if running
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

const { initializeApp, cert } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');

initializeApp({ projectId: 'skyelineos' });
const db = getFirestore();

// Tyler's personal cell — change this to your actual number
const TYLER_CELL = process.argv[2] || '+18016351245'; // pass your number as arg

const contact = {
  name: 'Tyler Rhoton (test)',
  phoneNumber: TYLER_CELL,
  role: 'INTERNAL',
  preferredLanguage: 'en',
  projectIds: [],
  createdAt: new Date().toISOString(),
};

await db.collection('sms_contacts').add(contact);
console.log(`✅ Contact added: ${contact.name} — ${contact.phoneNumber}`);
