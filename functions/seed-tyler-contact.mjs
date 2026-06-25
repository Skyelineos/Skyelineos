// Seeds Tyler's number as an INTERNAL contact in production Firestore
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Use Application Default Credentials (firebase login sets these up)
initializeApp({ projectId: 'skyelineos' });
const db = getFirestore();

const contact = {
  name: 'Tyler Rhoton',
  phoneNumber: '+12084035905',
  role: 'INTERNAL',
  preferredLanguage: 'en',
  projectIds: [],
  isOwner: true,
  createdAt: FieldValue.serverTimestamp(),
};

const ref = await db.collection('sms_contacts').add(contact);
console.log('✅ Contact added:', ref.id, '—', contact.name, contact.phoneNumber);
process.exit(0);
