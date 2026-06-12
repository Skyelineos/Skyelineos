// New-lead alerting.
//
// Fires on every new doc in `clients/{clientId}` — the single collection that
// ALL lead-gen avenues land in (manual Sales entry, the public web form, the
// Crestview QR / model-home Google Form, event QR codes, ad-campaign landing
// pages, etc.). Because every avenue writes here, one trigger guarantees the
// admin gets alerted no matter how the lead arrived.
//
// For each new lead it writes a `notifications/{id}` doc per admin user. The
// existing dispatchNotification trigger then fans that out to in-app + web push
// + SMS. We stamp `forceSms: true` so the text goes out even though SMS is
// normally opt-in — the operator explicitly wants a text on every new lead.
//
// Bulk imports (vCard drag-drop, ImportCenter) are skipped so a 200-contact
// import doesn't fire 200 texts. They're flagged with `importedAt` / the
// `imported-vcf` tag and reviewed in bulk via the Sales "Review Imported Leads"
// wizard instead.

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();

// Human-readable label for each lead-gen source. Mirrors the LEAD_SOURCES list
// in client/src/pages/Sales.tsx — keep the two in sync when adding avenues.
const SOURCE_LABELS: Record<string, string> = {
  website: 'Website',
  event: 'Event / Open House',
  ad_campaign: 'Ad Campaign',
  referral: 'Referral',
  instagram: 'Instagram / Social',
  parade_of_homes: 'Parade of Homes',
  email: 'Email',
  phone: 'Phone / Walk-in',
  other: 'Other',
};

function sourceLabel(source?: string, detail?: string): string {
  const base = (source && SOURCE_LABELS[source]) || 'Unknown source';
  return detail ? `${base} — ${detail}` : base;
}

export const newLeadAlert = onDocumentCreated('clients/{clientId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const lead = snap.data() as any;
  if (!lead) return;

  // Skip bulk imports — they'd storm the admin with one text per contact.
  const tags: string[] = Array.isArray(lead.tags) ? lead.tags : [];
  if (lead.importedAt || lead.importReviewNeeded || tags.includes('imported-vcf')) {
    console.log(`[newLeadAlert] skipping bulk-import lead ${event.params.clientId}`);
    return;
  }

  const db = admin.firestore();

  // Recipients: every admin. (The user asked for the text to go to them only,
  // not the whole team.) In-app + push + SMS all reach these accounts.
  const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
  if (adminsSnap.empty) {
    console.warn('[newLeadAlert] no admin users found — nobody to notify');
    return;
  }

  const name = (lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`).trim() || 'New lead';
  const where = sourceLabel(lead.source, lead.sourceDetail);
  const contactBits = [lead.phone, lead.email].filter(Boolean).join(' · ');

  const bodyParts = [`Source: ${where}`];
  if (lead.city) bodyParts.push(lead.city);
  if (contactBits) bodyParts.push(contactBits);
  const body = bodyParts.join(' · ');

  const batch = db.batch();
  const col = db.collection('notifications');
  for (const adminDoc of adminsSnap.docs) {
    const ref = col.doc();
    batch.set(ref, {
      userId: adminDoc.id,
      kind: 'lead_created',
      title: `New lead: ${name}`,
      body,
      link: '/sales',
      // Force the SMS even though SMS is opt-in by default — the operator wants
      // a text on every lead. Honored by dispatchNotification.
      forceSms: true,
      leadId: event.params.clientId,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`[newLeadAlert] lead ${event.params.clientId} (${where}) → ${adminsSnap.size} admin(s) notified`);
});
