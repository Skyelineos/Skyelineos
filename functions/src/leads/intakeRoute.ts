// Lead intake for the Crestview Solace / model-home lead forms. Two entry points
// share one write path into the `clients` collection (so leads show up in
// Sales/CRM + the dashboard "Hot leads" feed exactly like a manual lead):
//
//   POST /api/leads/intake         — secret-gated (x-skyeline-intake-secret).
//                                     Used by the Google Form's Apps Script,
//                                     where the secret lives server-side.
//   POST /api/leads/public-intake  — public, NO secret. Used by the branded
//                                     form page hosted on skyelineos.web.app,
//                                     which can't hold a secret in browser JS.
//                                     Protected by a honeypot field + strict
//                                     validation. Spam here only creates review-
//                                     able client docs (no data exposure).
//
// Firestore rules block anonymous writes to `clients`, so both routes use the
// Admin SDK to write on the submitter's behalf. Both are idempotent via a
// per-response dedupe marker.

import type { Express } from 'express';
import * as admin from 'firebase-admin';

interface LeadIntakePayload {
  formResponseId?: string;
  submittedAt?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  preferredContact?: string;
  city?: string;
  interests?: string[];
  selections?: string[];
  crestviewQuestions?: string;
  timeline?: string;
  budgetRange?: string;
  ownsLot?: string;
  projectVision?: string;
  helpWith?: string[];
  consent?: boolean;
  leadScore?: number;
  // Lead-gen avenue this submission came from. Lets one shared form back many
  // entry points — a model-home QR (event), an ad landing page (ad_campaign),
  // the plain website form, etc. — and document each. Whitelisted server-side.
  source?: string;
  // Free-text label for the specific event / campaign (e.g. "Parade of Homes
  // 2026", "Meta Spring Reno campaign"). Stored so ROI can be traced per source.
  sourceDetail?: string;
  campaign?: string; // alias for sourceDetail
  tags?: string[];
  // Honeypot — a hidden field real users never fill. Bots that auto-fill every
  // input will populate it, letting us silently drop the submission.
  website?: string;
}

function budgetBandToNumber(band?: string): number | null {
  if (!band) return null;
  const b = band.toLowerCase();
  if (b.includes('under')) return 900000;
  if (b.includes('1 million') && b.includes('1.5')) return 1250000;
  if (b.includes('1.5') && b.includes('2 million')) return 1750000;
  if (b.includes('2 million')) return 2250000;
  return null;
}

function priorityFromScore(score: number | undefined, budget: number | null): 'low' | 'medium' | 'high' {
  const s = typeof score === 'number' ? score : 0;
  if (s >= 70 || (budget !== null && budget >= 1750000)) return 'high';
  if (s >= 40 || (budget !== null && budget >= 1000000)) return 'medium';
  return 'low';
}

// A lightweight server-side lead score so web-form leads get sensible priority
// even though the page doesn't compute one. Mirrors the Apps Script weighting.
function scoreFromPayload(p: LeadIntakePayload): number {
  let s = 0;
  const t = p.timeline || '';
  if (t === 'Within 3 Months') s += 30;
  else if (t === 'Within 6 Months') s += 24;
  else if (t === 'Within 12 Months') s += 18;
  else if (t === '1–2 Years' || t === '1-2 Years') s += 10;
  else if (t.startsWith('Just')) s += 4;
  const b = p.budgetRange || '';
  if (b.includes('2 Million+')) s += 30;
  else if (b.includes('1.5') && b.includes('2 Million')) s += 24;
  else if (b.includes('1 Million') && b.includes('1.5')) s += 18;
  else if (b.includes('Under')) s += 10;
  const lot = p.ownsLot || '';
  if (lot === 'Yes') s += 20;
  else if (lot === 'Currently Looking') s += 12;
  else if (lot === 'No') s += 6;
  if ((p.interests || []).includes('Building a Custom Home')) s += 10;
  if ((p.helpWith || []).some(h => h === 'Schedule a Consultation' || h === 'Speak With a Builder')) s += 10;
  return Math.min(100, s);
}

// Avenues a public submission is allowed to claim. Anything else falls back to
// 'website'. Mirrors the LEAD_SOURCES list in client/src/pages/Sales.tsx.
const ALLOWED_SOURCES = new Set([
  'website', 'event', 'ad_campaign', 'referral', 'instagram', 'parade_of_homes', 'email', 'phone', 'other',
]);

function resolveSource(p: LeadIntakePayload): { source: string; sourceDetail: string | null } {
  const raw = (p.source || '').toString().trim().toLowerCase().replace(/[\s-]+/g, '_');
  const source = ALLOWED_SOURCES.has(raw) ? raw : 'website';
  const detail = (p.sourceDetail || p.campaign || '').toString().trim().slice(0, 120) || null;
  return { source, sourceDetail: detail };
}

function buildNotes(p: LeadIntakePayload): string {
  const lines: string[] = [];
  const detail = (p.sourceDetail || p.campaign || '').toString().trim();
  lines.push(detail ? `— Lead from ${detail} —` : '— Lead from Skyeline lead form —');
  if (p.preferredContact) lines.push(`Preferred contact: ${p.preferredContact}`);
  if (p.timeline) lines.push(`Build timeline: ${p.timeline}`);
  if (p.budgetRange) lines.push(`Budget range: ${p.budgetRange}`);
  if (p.ownsLot) lines.push(`Owns a lot: ${p.ownsLot}`);
  if (p.interests?.length) lines.push(`Interested in: ${p.interests.join(', ')}`);
  if (p.selections?.length) lines.push(`Wants selection info: ${p.selections.join(', ')}`);
  if (p.helpWith?.length) lines.push(`Next steps requested: ${p.helpWith.join(', ')}`);
  if (p.crestviewQuestions) lines.push(`\nQuestions about Crestview Solace:\n${p.crestviewQuestions}`);
  if (p.projectVision) lines.push(`\nProject vision:\n${p.projectVision}`);
  if (typeof p.leadScore === 'number') lines.push(`\nAuto lead score: ${p.leadScore}/100`);
  return lines.join('\n');
}

// Shared write path. Returns the created (or pre-existing) client id.
async function createLead(
  db: admin.firestore.Firestore,
  p: LeadIntakePayload,
  intakeSource: string,
): Promise<{ id: string; duplicate?: boolean }> {
  const fullName = (p.fullName || `${p.firstName || ''} ${p.lastName || ''}`).trim();
  const responseId = (p.formResponseId || '').toString().trim();

  if (responseId) {
    const markerRef = db.collection('lead_intake_dedupe').doc(responseId);
    const existing = await markerRef.get();
    if (existing.exists) {
      return { id: (existing.data() as any)?.clientId, duplicate: true };
    }
  }

  const firstName = p.firstName || fullName.split(' ')[0] || null;
  const lastName = p.lastName || fullName.split(' ').slice(1).join(' ') || null;
  const budget = budgetBandToNumber(p.budgetRange);
  const leadScore = typeof p.leadScore === 'number' ? p.leadScore : scoreFromPayload(p);
  const { source, sourceDetail } = resolveSource(p);

  // Tag with the specific source detail (event/campaign name) when present, so
  // the lead is filterable by avenue in Sales/CRM.
  const baseTags = ['Lead Form', ...(sourceDetail ? [sourceDetail] : [])];
  const tags = Array.from(new Set([...baseTags, ...(p.tags || [])])).slice(0, 25);

  const now = admin.firestore.FieldValue.serverTimestamp();
  const ref = await db.collection('clients').add({
    name: fullName,
    firstName,
    lastName,
    email: p.email || null,
    phone: p.phone || null,
    company: null,
    stage: 'new_lead',
    source,
    sourceDetail,
    city: p.city || null,
    state: 'UT',
    budget,
    priority: priorityFromScore(leadScore, budget),
    notes: buildNotes({ ...p, leadScore }),
    tags,
    assignedTo: null,
    assignedToName: null,
    intakeSource,
    intakeResponseId: responseId || null,
    intakeLeadScore: leadScore,
    intakeConsent: p.consent === true,
    preferredContact: p.preferredContact || null,
    createdAt: now,
    updatedAt: now,
  });

  if (responseId) {
    await db.collection('lead_intake_dedupe').doc(responseId).set({ clientId: ref.id, createdAt: now });
  }
  return { id: ref.id };
}

export function registerLeadIntakeRoute(app: Express, db: admin.firestore.Firestore) {
  // Secret-gated route (Google Form / Apps Script).
  app.post('/api/leads/intake', async (req: any, res: any) => {
    try {
      const expected = process.env.LEAD_INTAKE_SECRET;
      if (!expected) {
        console.error('[leadIntake] LEAD_INTAKE_SECRET not set — rejecting');
        return res.status(503).json({ error: 'Lead intake not configured' });
      }
      if (req.get('x-skyeline-intake-secret') !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const p = (req.body || {}) as LeadIntakePayload;
      const fullName = (p.fullName || `${p.firstName || ''} ${p.lastName || ''}`).trim();
      if (!fullName) return res.status(400).json({ error: 'Missing name' });
      if (!p.email && !p.phone) return res.status(400).json({ error: 'Need at least an email or phone' });

      const out = await createLead(db, p, 'crestview_qr_form');
      console.log(`[leadIntake] (secret) lead ${out.id}${out.duplicate ? ' [dup]' : ''}`);
      return res.json({ ok: true, id: out.id, duplicate: out.duplicate });
    } catch (e: any) {
      console.error('[leadIntake] error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });

  // Public route (branded form page on skyelineos.web.app). No secret; honeypot
  // + validation gate it. Worst-case abuse is spam client docs an admin reviews.
  app.post('/api/leads/public-intake', async (req: any, res: any) => {
    try {
      const p = (req.body || {}) as LeadIntakePayload;

      // Honeypot: real users never see/fill `website`. If it's populated, treat
      // it as a bot — return a fake success so the bot doesn't retry.
      if (p.website && String(p.website).trim() !== '') {
        console.warn('[leadIntake] honeypot tripped — dropping submission');
        return res.json({ ok: true });
      }

      const fullName = (p.fullName || `${p.firstName || ''} ${p.lastName || ''}`).trim();
      if (!fullName || fullName.length < 2) return res.status(400).json({ error: 'Please enter your name.' });
      if (!p.email && !p.phone) return res.status(400).json({ error: 'Please enter an email or phone number.' });
      if (p.consent !== true) return res.status(400).json({ error: 'Please agree to be contacted.' });

      const out = await createLead(db, p, 'crestview_web_form');
      console.log(`[leadIntake] (public) lead ${out.id}${out.duplicate ? ' [dup]' : ''}`);
      return res.json({ ok: true, id: out.id });
    } catch (e: any) {
      console.error('[leadIntake] public error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
