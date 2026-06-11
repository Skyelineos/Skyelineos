// Public lead-intake endpoint for the Crestview Solace QR / model-home Google
// Form (and any future external lead form). The Google Apps Script attached to
// the form POSTs each submission here on form-submit; this writes a new lead
// into the `clients` collection so it shows up in Sales + the dashboard "Hot
// leads" feed exactly like a manually-added lead.
//
// Public route (no Firebase auth) — the form has no signed-in user. Instead it
// is gated by a shared secret in the `x-skyeline-intake-secret` header, matched
// against the LEAD_INTAKE_SECRET Secret Manager value. Firestore rules block
// anonymous writes to `clients` (allow create: if isGC()), so this Cloud
// Function uses the Admin SDK to write on the form's behalf after the secret
// check passes.
//
// Idempotent: Google's onFormSubmit trigger can fire more than once for a
// single submission (Apps Script retries). We key a marker doc on the form's
// response id so a retry returns the already-created lead instead of duplicating.

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
  source?: string;
  tags?: string[];
}

// Map the form's budget band to an approximate numeric value so the lead's
// `budget` (a number in the Lead schema) drives sorting/filters. The exact band
// is preserved verbatim in notes + tags.
function budgetBandToNumber(band?: string): number | null {
  if (!band) return null;
  const b = band.toLowerCase();
  if (b.includes('under')) return 900000;
  if (b.includes('1 million') && b.includes('1.5')) return 1250000;
  if (b.includes('1.5') && b.includes('2 million')) return 1750000;
  if (b.includes('2 million')) return 2250000;
  return null;
}

// high/medium/low priority drives the dashboard "Hot leads" card (priority ==
// 'high'). Derived from the lead score the form computes, with a budget-band
// floor so a clearly high-budget buyer is never filed as low priority.
function priorityFromScore(score: number | undefined, budget: number | null): 'low' | 'medium' | 'high' {
  const s = typeof score === 'number' ? score : 0;
  if (s >= 70 || (budget !== null && budget >= 1750000)) return 'high';
  if (s >= 40 || (budget !== null && budget >= 1000000)) return 'medium';
  return 'low';
}

function buildNotes(p: LeadIntakePayload): string {
  const lines: string[] = [];
  lines.push('— Lead from Crestview Solace (Build #27) model-home QR form —');
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

export function registerLeadIntakeRoute(app: Express, db: admin.firestore.Firestore) {
  app.post('/api/leads/intake', async (req: any, res: any) => {
    try {
      // Fail closed: if the secret isn't configured, never accept writes.
      const expected = process.env.LEAD_INTAKE_SECRET;
      if (!expected) {
        console.error('[leadIntake] LEAD_INTAKE_SECRET not set — rejecting');
        return res.status(503).json({ error: 'Lead intake not configured' });
      }
      const provided = req.get('x-skyeline-intake-secret');
      if (!provided || provided !== expected) {
        console.warn('[leadIntake] Bad or missing intake secret');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const p = (req.body || {}) as LeadIntakePayload;

      const fullName = (p.fullName || `${p.firstName || ''} ${p.lastName || ''}`).trim();
      if (!fullName) return res.status(400).json({ error: 'Missing name' });
      if (!p.email && !p.phone) {
        return res.status(400).json({ error: 'Need at least an email or phone' });
      }

      // Idempotency guard keyed on the form's response id.
      const responseId = (p.formResponseId || '').toString().trim();
      if (responseId) {
        const markerRef = db.collection('lead_intake_dedupe').doc(responseId);
        const existing = await markerRef.get();
        if (existing.exists) {
          const prior = existing.data() as any;
          console.log(`[leadIntake] Duplicate submit ${responseId} → ${prior?.clientId}`);
          return res.json({ ok: true, id: prior?.clientId, duplicate: true });
        }
      }

      const firstName = p.firstName || fullName.split(' ')[0] || null;
      const lastName = p.lastName || fullName.split(' ').slice(1).join(' ') || null;
      const budget = budgetBandToNumber(p.budgetRange);

      const baseTags = ['Crestview Solace', 'Build #27', 'Model Home QR'];
      const tags = Array.from(new Set([...baseTags, ...(p.tags || [])])).slice(0, 25);

      const now = admin.firestore.FieldValue.serverTimestamp();
      const clientDoc = {
        name: fullName,
        firstName,
        lastName,
        email: p.email || null,
        phone: p.phone || null,
        company: null,
        stage: 'new_lead',
        source: 'website', // valid LeadSource; specificity captured in tags/notes
        city: p.city || null,
        state: 'UT',
        budget,
        priority: priorityFromScore(p.leadScore, budget),
        notes: buildNotes(p),
        tags,
        assignedTo: null,
        assignedToName: null,
        // Intake provenance (non-schema extras, safe to carry)
        intakeSource: 'crestview_qr_form',
        intakeResponseId: responseId || null,
        intakeLeadScore: typeof p.leadScore === 'number' ? p.leadScore : null,
        intakeConsent: p.consent === true,
        preferredContact: p.preferredContact || null,
        createdAt: now,
        updatedAt: now,
      };

      const ref = await db.collection('clients').add(clientDoc);

      if (responseId) {
        await db.collection('lead_intake_dedupe').doc(responseId).set({
          clientId: ref.id,
          createdAt: now,
        });
      }

      console.log(`[leadIntake] Created lead ${ref.id} (${fullName}, priority=${clientDoc.priority})`);
      return res.json({ ok: true, id: ref.id });
    } catch (e: any) {
      console.error('[leadIntake] error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
