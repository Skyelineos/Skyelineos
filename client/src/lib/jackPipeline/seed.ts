// One-time import of Tyler's Jack pipeline + client roster. Sourced from
// screenshots of skyelinehomes.us-app.jackapp.io taken 2026-05-12.
// Idempotent: skips contacts/clients whose name+email already exists.

import {
  addDoc, collection, getDocs, query, serverTimestamp, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface JackClient {
  name: string;
  email?: string;
  phone?: string;
}

interface JackLead {
  name: string;
  stage: 'new_lead' | 'meeting_booked' | 'design_phase' | 'in_estimating' | 'close_to_sign' | 'won' | 'lost';
  budget?: number;
  email?: string;
  phone?: string;
}

interface JackEstimate {
  title: string;
  total: number;
  status: 'pending' | 'in_progress' | 'waiting_for_quotes' | 'internal_approval' | 'archived';
}

// ─── Clients (from Jack /contacts/clients) ──────────────────────────────────
const JACK_CLIENTS: JackClient[] = [
  { name: 'Ellen Lingwall' },
  { name: 'Heather Watkins', phone: '801-859-8922' },
  { name: 'Jake Lingwall',   phone: '801-919-4921', email: 'jakelingvall@gmail.com' },
  { name: 'Jessica Christensen', phone: '435-489-0508', email: 'jessicachristensen8@gmail.com' },
  { name: 'Jill Labarge' },
  { name: 'Jordan Christensen', phone: '435-979-0461', email: 'jordanchristensen2112@gmail.com' },
  { name: 'Laura Gardanier', phone: '801-310-8180', email: 'lgardanier@gmail.com' },
  { name: 'Michael Labarge', phone: '714-664-1588', email: 'mlabarge@scs-ca.com' },
  { name: 'Sean Watkins',    phone: '435-830-0722', email: 'wattyncs@gmail.com' },
  { name: 'Steve Gardanier', phone: '801-310-5321', email: 'sgardanier@gmail.com' },
  { name: 'Steve Keiser',                              email: 'me@stevekeiser.com' },
  { name: 'Vanae Keiser',    phone: '801-494-3293', email: 'me@vanae.com' },
];

// ─── Sales pipeline (from Jack /leads) ──────────────────────────────────────
const JACK_LEADS: JackLead[] = [
  { name: 'Steve Keiser',           stage: 'new_lead',     email: 'me@stevekeiser.com' },
  { name: 'Jake Lingwall',          stage: 'new_lead',     budget: 2_000_000, phone: '801-919-4921', email: 'jakelingvall@gmail.com' },
  { name: 'Sean Watkins',           stage: 'design_phase', phone: '435-830-0722', email: 'wattyncs@gmail.com' },
  { name: 'Mike Labarge',           stage: 'in_estimating', budget: 2_200_000, phone: '714-664-1588', email: 'mlabarge@scs-ca.com' },
  { name: 'Steve and Laura Gardanier', stage: 'in_estimating', budget: 2_700_000, email: 'sgardanier@gmail.com' },
  { name: 'Jordan Christensen',     stage: 'won',          phone: '435-979-0461', email: 'jordanchristensen2112@gmail.com' },
];

// ─── Estimates (from Jack /estimates) ───────────────────────────────────────
const JACK_ESTIMATES: JackEstimate[] = [
  { title: 'Jordan and Jessica Christensen', total: 1_939_500,    status: 'pending' },
  { title: 'Steve and Laura Gardanier',      total: 2_046_343.95, status: 'pending' },
];

export interface JackImportResult {
  contacts: { added: number; skipped: number };
  leads:    { added: number; skipped: number };
  estimates:{ added: number; skipped: number };
  errors:   number;
}

export async function importJackPipeline(createdBy: string): Promise<JackImportResult> {
  const result: JackImportResult = {
    contacts:  { added: 0, skipped: 0 },
    leads:     { added: 0, skipped: 0 },
    estimates: { added: 0, skipped: 0 },
    errors: 0,
  };

  // Pre-fetch existing contacts and clients so we can dedupe by name/email.
  const existingContacts = new Set<string>();
  try {
    const snap = await getDocs(collection(db, 'contacts'));
    snap.forEach(d => {
      const data = d.data() as any;
      const key = `${(data.name || '').trim().toLowerCase()}|${(data.email || '').trim().toLowerCase()}`;
      if (key !== '|') existingContacts.add(key);
    });
  } catch (e) { /* will create */ }

  const existingClients = new Set<string>();
  try {
    const snap = await getDocs(collection(db, 'clients'));
    snap.forEach(d => {
      const data = d.data() as any;
      const key = `${(data.name || '').trim().toLowerCase()}|${(data.stage || '').trim()}`;
      if (key !== '|') existingClients.add(key);
    });
  } catch (e) { /* will create */ }

  const existingEstimateTitles = new Set<string>();
  try {
    const snap = await getDocs(collection(db, 'estimates'));
    snap.forEach(d => {
      const data = d.data() as any;
      existingEstimateTitles.add((data.title || data.name || '').trim().toLowerCase());
    });
  } catch (e) { /* will create */ }

  // 1) Contacts
  for (const c of JACK_CLIENTS) {
    const key = `${c.name.trim().toLowerCase()}|${(c.email || '').trim().toLowerCase()}`;
    if (existingContacts.has(key)) { result.contacts.skipped += 1; continue; }
    try {
      await addDoc(collection(db, 'contacts'), {
        name: c.name,
        email: c.email || '',
        phone: c.phone || '',
        role: 'client',
        type: 'client',
        isActive: true,
        hasPortalAccess: false,
        notes: 'Imported from Jack pipeline migration',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy,
      });
      existingContacts.add(key);
      result.contacts.added += 1;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Jack contact import failed:', c.name, e);
      result.errors += 1;
    }
  }

  // 2) Sales leads — written to `clients` collection (Sales/CRM table)
  for (const l of JACK_LEADS) {
    const key = `${l.name.trim().toLowerCase()}|${l.stage}`;
    if (existingClients.has(key)) { result.leads.skipped += 1; continue; }
    try {
      await addDoc(collection(db, 'clients'), {
        name: l.name,
        stage: l.stage,
        budget: l.budget || 0,
        email: l.email || '',
        phone: l.phone || '',
        priority: 'medium',
        projectType: 'custom_home',
        leadSource: 'other',
        assignedToName: 'Tyler Rhoton',
        notes: 'Imported from Jack pipeline migration',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy,
      });
      existingClients.add(key);
      result.leads.added += 1;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Jack lead import failed:', l.name, e);
      result.errors += 1;
    }
  }

  // 3) Estimates
  for (const e of JACK_ESTIMATES) {
    const key = e.title.trim().toLowerCase();
    if (existingEstimateTitles.has(key)) { result.estimates.skipped += 1; continue; }
    try {
      await addDoc(collection(db, 'estimates'), {
        title: e.title,
        name: e.title,
        total: e.total,
        status: e.status,
        pipelineStage: e.status,
        notes: 'Imported from Jack pipeline migration',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy,
      });
      existingEstimateTitles.add(key);
      result.estimates.added += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Jack estimate import failed:', e.title, err);
      result.errors += 1;
    }
  }

  return result;
}

export const JACK_PIPELINE_TOTALS = {
  clients: JACK_CLIENTS.length,
  leads: JACK_LEADS.length,
  estimates: JACK_ESTIMATES.length,
  pipelineValue: JACK_LEADS.reduce((s, l) => s + (l.budget || 0), 0),
};
