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
import { fireTriggerForMany } from '../notifications/fireTrigger';

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

  // Route through the configurable engine: the admin can edit channels/templates
  // for the 'lead_created' trigger (audience: team) in Settings → Notifications.
  // Defaults mirror the prior behavior (in-app + email + forced SMS + push).
  const variables = {
    leadName: name,
    source: where,
    city: lead.city || '',
    phone: lead.phone || '',
    email: lead.email || '',
    link: '/sales',
    leadId: event.params.clientId,
  };
  await fireTriggerForMany(
    { db, triggerKey: 'lead_created', audience: 'team', variables, projectId: undefined },
    adminsSnap.docs.map(d => d.id),
  );
  console.log(`[newLeadAlert] lead ${event.params.clientId} (${where}) → ${adminsSnap.size} admin(s) via fireTrigger`);
});
