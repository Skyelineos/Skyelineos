// bidSolicitation.ts
// -----------------------------------------------------------------------------
// Automated Bid Solicitation Engine
//
// Purpose: Gather bids for a Skyeline project from local Utah County
// contractors *without* Tyler having to hand-source and hand-email every
// trade. This is intentionally lower-friction than the full magic-link portal
// flow in sendBidRequestRoute.ts — it fires warm-builder outreach emails to a
// curated seed list, tracks status in `bid_solicitations`, and lets Tyler
// send/resend/remind/delete individual entries from the UI.
//
// Data model — Firestore collection `bid_solicitations`:
//   {
//     id: string,                 // Firestore doc id (same as .id field)
//     projectId: string,
//     projectAddress?: string,
//     trade: string,              // trade slug (from utahCountyContractors)
//     contractorName: string,
//     contractorEmail: string,
//     contractorPhone?: string,
//     contractorCity?: string,
//     status: 'queued' | 'sent' | 'opened' | 'responded' | 'declined',
//     sentAt?: Timestamp,
//     lastRemindedAt?: Timestamp,
//     respondedAt?: Timestamp,
//     bidAmount?: number,
//     notes?: string,
//     createdAt: Timestamp,
//     updatedAt: Timestamp,
//     createdBy?: string,         // uid of the staff member who queued it
//   }
//
// Auth: routes are gated by the top-level /api authMiddleware in index.ts.

import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import {
  UTAH_COUNTY_CONTRACTORS,
  TRADES,
  getSeedContractors,
  getTradeMeta,
  type TradeSlug,
  type SeedContractor,
} from './utahCountyContractors';

// Signature Tyler wants at the bottom of every solicitation email.
const TYLER_SIGNATURE = [
  'Tyler Rhoton',
  'Skyeline Homes',
  '(208) 403-5905',
  'tyler@skyelinehomes.com',
].join('\n');

const TYLER_SIGNATURE_HTML = `
  <p style="margin:22px 0 4px 0;color:#141414;font-weight:600;">Tyler Rhoton</p>
  <p style="margin:0;color:#333;font-size:14px;">Skyeline Homes</p>
  <p style="margin:0;color:#666;font-size:13px;">(208) 403-5905 &nbsp;·&nbsp; <a href="mailto:tyler@skyelinehomes.com" style="color:#8a6a2c;text-decoration:none;">tyler@skyelinehomes.com</a></p>
`;

// From-address preference:
//   1. explicit tyler@skyelinehomes.com (the address the task requires)
//   2. SENDGRID_FROM_EMAIL fallback (matches other routes)
// SendGrid requires the from address be a verified sender in the account, so
// tyler@skyelinehomes.com must be verified before real dispatch. Prior to
// verification, exports.sendSolicitationEmail() will surface SendGrid's
// error verbatim on the solicitation record.
const DEFAULT_FROM_EMAIL = 'tyler@skyelinehomes.com';

// ── Types ────────────────────────────────────────────────────────────────────

export type SolicitationStatus =
  | 'queued'
  | 'sent'
  | 'opened'
  | 'responded'
  | 'declined';

export interface BidSolicitation {
  id: string;
  projectId: string;
  projectAddress?: string;
  projectName?: string;
  trade: TradeSlug | string;
  tradeLabel?: string;
  contractorName: string;
  contractorEmail: string;
  contractorPhone?: string;
  contractorCity?: string;
  status: SolicitationStatus;
  sentAt?: admin.firestore.Timestamp;
  lastRemindedAt?: admin.firestore.Timestamp;
  respondedAt?: admin.firestore.Timestamp;
  bidAmount?: number;
  notes?: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  createdBy?: string;
}

export interface ProjectContext {
  id: string;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  timelineStart?: string;    // ISO or human "Spring 2026"
  timelineEnd?: string;
  scopeSummary?: string;
}

// ── Project lookup ───────────────────────────────────────────────────────────

/**
 * Load a project doc + derive a display address string. Returns undefined if
 * the project doesn't exist so callers can 404 cleanly.
 */
export async function loadProjectContext(
  db: admin.firestore.Firestore,
  projectId: string,
): Promise<ProjectContext | undefined> {
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) return undefined;
  const data = snap.data() || {};
  const address =
    data.jobsiteAddress ||
    data.address ||
    data.projectAddress ||
    [data.street, data.city, data.state, data.zip].filter(Boolean).join(', ');
  return {
    id: snap.id,
    name: data.name || data.projectName,
    address: typeof address === 'string' ? address : undefined,
    city: data.city,
    state: data.state,
    zip: data.zip,
    timelineStart: data.timelineStart || data.startDate || data.groundbreakDate,
    timelineEnd: data.timelineEnd || data.completionDate || data.moveInDate,
    scopeSummary: data.scopeSummary || data.description,
  };
}

/**
 * Find the Gardanier project by matching the known jobsite address. Returns
 * the doc id, or undefined if the project hasn't been created yet.
 */
export async function findGardanierProjectId(
  db: admin.firestore.Firestore,
): Promise<string | undefined> {
  const needleAddress = '703 W 930 N';
  const snapshot = await db.collection('projects').get();
  for (const doc of snapshot.docs) {
    const d = doc.data() || {};
    const haystacks: string[] = [
      String(d.jobsiteAddress || ''),
      String(d.address || ''),
      String(d.projectAddress || ''),
      String(d.street || ''),
      String(d.name || ''),
      String(d.clientName || ''),
    ];
    if (
      haystacks.some((h) => h.toLowerCase().includes(needleAddress.toLowerCase())) ||
      haystacks.some((h) => h.toLowerCase().includes('gardanier'))
    ) {
      return doc.id;
    }
  }
  return undefined;
}

// ── Email body builders (Tyler's voice) ──────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstNameOf(contractorName: string): string {
  // For company names ("Alpine Concrete LLC") there's no first name — fall
  // back to "team". For seeded human names it grabs the first token.
  const trimmed = (contractorName || '').trim();
  if (!trimmed) return 'team';
  const looksLikeCompany = /\b(LLC|Inc|Co|Corp|Company|Services|Group|Partners)\b/i.test(trimmed);
  if (looksLikeCompany) return 'team';
  return trimmed.split(/\s+/)[0];
}

function formatAddress(ctx: ProjectContext): string {
  return ctx.address || [ctx.city, ctx.state, ctx.zip].filter(Boolean).join(', ') || 'a Skyeline jobsite';
}

function formatTimeline(ctx: ProjectContext): string {
  if (ctx.timelineStart && ctx.timelineEnd) {
    return `${ctx.timelineStart} → ${ctx.timelineEnd}`;
  }
  if (ctx.timelineStart) return `Starting around ${ctx.timelineStart}`;
  if (ctx.timelineEnd) return `Target completion ${ctx.timelineEnd}`;
  return 'Timeline TBD — happy to walk you through the schedule on the phone.';
}

export function buildSolicitationSubject(trade: string, address: string): string {
  const tradeLabel = getTradeMeta(trade as TradeSlug)?.label || trade;
  return `Bid Request — ${tradeLabel} | ${address} | Skyeline Homes`;
}

export interface EmailBuildArgs {
  contractorName: string;
  trade: string;
  project: ProjectContext;
  isReminder?: boolean;
  customIntro?: string;
}

export function buildSolicitationText(args: EmailBuildArgs): string {
  const { contractorName, trade, project, isReminder, customIntro } = args;
  const tradeMeta = getTradeMeta(trade as TradeSlug);
  const tradeLabel = tradeMeta?.label || trade;
  const scope = tradeMeta?.scope || 'Full scope per plans — happy to send drawings once you confirm interest.';
  const address = formatAddress(project);
  const timeline = formatTimeline(project);

  const opener = isReminder
    ? `Hey ${firstNameOf(contractorName)}, just circling back on the bid request I sent for ${tradeLabel}.`
    : `Hey ${firstNameOf(contractorName)},`;

  return [
    opener,
    '',
    customIntro || `I'm putting together bids on a new build we've got going in American Fork and would love to get your number on ${tradeLabel.toLowerCase()}.`,
    '',
    `Project: ${project.name || 'New Skyeline build'}`,
    `Address: ${address}`,
    `Timeline: ${timeline}`,
    '',
    `Scope (${tradeLabel}):`,
    scope,
    project.scopeSummary ? `\nProject notes: ${project.scopeSummary}` : '',
    '',
    `If you're interested, just reply to this email with a ballpark number or your questions. Plans available on request — I'll shoot them over as soon as you confirm you want to bid it.`,
    '',
    `Appreciate you taking a look.`,
    '',
    TYLER_SIGNATURE,
  ].filter((line) => line !== undefined && line !== null).join('\n');
}

export function buildSolicitationHtml(args: EmailBuildArgs): string {
  const { contractorName, trade, project, isReminder, customIntro } = args;
  const tradeMeta = getTradeMeta(trade as TradeSlug);
  const tradeLabel = tradeMeta?.label || trade;
  const scope = tradeMeta?.scope || 'Full scope per plans — happy to send drawings once you confirm interest.';
  const address = formatAddress(project);
  const timeline = formatTimeline(project);

  const opener = isReminder
    ? `Hey ${escapeHtml(firstNameOf(contractorName))}, just circling back on the bid request I sent for <strong>${escapeHtml(tradeLabel)}</strong>.`
    : `Hey ${escapeHtml(firstNameOf(contractorName))},`;

  const intro = customIntro
    ? escapeHtml(customIntro)
    : `I'm putting together bids on a new build we've got going in American Fork and would love to get your number on <strong>${escapeHtml(tradeLabel.toLowerCase())}</strong>.`;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #222;">
      <div style="border-bottom: 3px solid #C9A96E; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin:0;color:#141414;font-size:18px;font-weight:600;">Bid Request — ${escapeHtml(tradeLabel)}</h2>
      </div>
      <p style="margin:0 0 14px 0;">${opener}</p>
      <p style="margin:0 0 14px 0;">${intro}</p>
      <table style="border-collapse:collapse;margin:12px 0 18px 0;font-size:14px;">
        <tbody>
          <tr>
            <td style="padding:4px 14px 4px 0;color:#666;font-size:13px;width:90px;">Project</td>
            <td style="padding:4px 0;">${escapeHtml(project.name || 'New Skyeline build')}</td>
          </tr>
          <tr>
            <td style="padding:4px 14px 4px 0;color:#666;font-size:13px;">Address</td>
            <td style="padding:4px 0;">${escapeHtml(address)}</td>
          </tr>
          <tr>
            <td style="padding:4px 14px 4px 0;color:#666;font-size:13px;">Timeline</td>
            <td style="padding:4px 0;">${escapeHtml(timeline)}</td>
          </tr>
        </tbody>
      </table>
      <div style="background:#FAFAF6;border-left:3px solid #C9A96E;padding:12px 14px;margin:16px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#8a6a2c;margin-bottom:6px;">Scope — ${escapeHtml(tradeLabel)}</div>
        <div style="font-size:14px;color:#333;">${escapeHtml(scope)}</div>
      </div>
      ${project.scopeSummary ? `<p style="margin:14px 0;color:#333;"><strong>Project notes:</strong> ${escapeHtml(project.scopeSummary)}</p>` : ''}
      <p style="margin:18px 0;">If you're interested, just reply to this email with a ballpark number or your questions. Plans available on request — I'll shoot them over as soon as you confirm you want to bid it.</p>
      <p style="margin:18px 0;">Appreciate you taking a look.</p>
      ${TYLER_SIGNATURE_HTML}
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px 0;">
      <p style="font-size:11px;color:#999;margin:0;">Skyeline Homes · Custom builds in Utah County.</p>
    </div>
  `;
}

// ── Core engine ──────────────────────────────────────────────────────────────

export interface SolicitationSeed {
  contractorName: string;
  contractorEmail: string;
  contractorPhone?: string;
  contractorCity?: string;
}

/**
 * Resolve the contractor pool for a trade. Default source is the curated
 * Utah County seed. Callers can also pass in an override list (e.g. from
 * Tyler's address book) which takes precedence when non-empty.
 */
export function resolveContractorsForTrade(
  trade: TradeSlug | string,
  override?: SolicitationSeed[],
): SolicitationSeed[] {
  if (override && override.length > 0) return override;
  const seeds = getSeedContractors(trade as TradeSlug);
  return seeds.map((s: SeedContractor) => ({
    contractorName: s.name,
    contractorEmail: s.email,
    contractorPhone: s.phone,
    contractorCity: s.city,
  }));
}

export interface QueueSolicitationsInput {
  projectId: string;
  trades: (TradeSlug | string)[];
  createdBy?: string;
  contractorsByTrade?: Partial<Record<string, SolicitationSeed[]>>;
  // If true, existing queued/sent entries with the same (projectId, trade, email)
  // are left in place instead of duplicated. Defaults to true.
  dedupe?: boolean;
}

export interface QueueSolicitationsResult {
  projectId: string;
  created: BidSolicitation[];
  skippedDuplicates: number;
  tradesProcessed: string[];
}

/**
 * Create queued (`status='queued'`) solicitation records for every contractor
 * in every requested trade. Does NOT send email — that's a separate step so
 * Tyler can review the list first.
 */
export async function queueSolicitationsForProject(
  db: admin.firestore.Firestore,
  input: QueueSolicitationsInput,
): Promise<QueueSolicitationsResult> {
  const project = await loadProjectContext(db, input.projectId);
  if (!project) {
    throw new Error(`Project ${input.projectId} not found`);
  }
  const dedupe = input.dedupe !== false;

  const created: BidSolicitation[] = [];
  let skippedDuplicates = 0;

  // Pre-load existing entries once per (project, trade) so dedupe is O(N)
  // instead of one round-trip per candidate.
  for (const trade of input.trades) {
    const contractors = resolveContractorsForTrade(trade, input.contractorsByTrade?.[trade]);
    if (contractors.length === 0) continue;

    let existingEmails = new Set<string>();
    if (dedupe) {
      const existingSnap = await db
        .collection('bid_solicitations')
        .where('projectId', '==', input.projectId)
        .where('trade', '==', trade)
        .get();
      existingEmails = new Set(existingSnap.docs.map((d) => String((d.data() || {}).contractorEmail || '').toLowerCase()));
    }

    const batch = db.batch();
    const nowTs = admin.firestore.FieldValue.serverTimestamp();
    const stagedDocs: Array<{ ref: FirebaseFirestore.DocumentReference; payload: any }> = [];

    for (const c of contractors) {
      const emailKey = (c.contractorEmail || '').toLowerCase();
      if (!emailKey) continue;
      if (existingEmails.has(emailKey)) {
        skippedDuplicates += 1;
        continue;
      }
      const ref = db.collection('bid_solicitations').doc();
      const tradeLabel = getTradeMeta(trade as TradeSlug)?.label;
      const payload: any = {
        id: ref.id,
        projectId: input.projectId,
        projectAddress: project.address,
        projectName: project.name,
        trade,
        tradeLabel,
        contractorName: c.contractorName,
        contractorEmail: c.contractorEmail,
        status: 'queued',
        createdAt: nowTs,
        updatedAt: nowTs,
      };
      if (c.contractorPhone) payload.contractorPhone = c.contractorPhone;
      if (c.contractorCity) payload.contractorCity = c.contractorCity;
      if (input.createdBy) payload.createdBy = input.createdBy;

      batch.set(ref, payload);
      stagedDocs.push({ ref, payload });
    }
    if (stagedDocs.length > 0) {
      await batch.commit();
      for (const { payload } of stagedDocs) {
        // Serialize the FieldValue.serverTimestamp() placeholder back to
        // something JSON-safe for the API response. The Firestore doc itself
        // will have real Timestamps once written.
        created.push({
          ...payload,
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
        } as BidSolicitation);
      }
    }
  }

  return {
    projectId: input.projectId,
    created,
    skippedDuplicates,
    tradesProcessed: input.trades.map(String),
  };
}

// ── Send / resend ────────────────────────────────────────────────────────────

export interface SendSolicitationOptions {
  isReminder?: boolean;
  customIntro?: string;
}

export interface SendSolicitationResult {
  id: string;
  sent: boolean;
  error?: string;
  skippedReason?: string;
  newStatus: SolicitationStatus;
}

/**
 * Send (or resend) the outreach email for a single solicitation document.
 * Idempotent-ish: on success it flips status → 'sent' and stamps sentAt. If
 * SendGrid isn't configured (SENDGRID_API_KEY missing) it returns a soft
 * error so the caller can surface it in the UI.
 */
export async function sendSolicitationEmail(
  db: admin.firestore.Firestore,
  solicitationId: string,
  options: SendSolicitationOptions = {},
): Promise<SendSolicitationResult> {
  const ref = db.collection('bid_solicitations').doc(solicitationId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { id: solicitationId, sent: false, error: 'Solicitation not found', newStatus: 'queued' };
  }
  const record = snap.data() as BidSolicitation;

  const project = await loadProjectContext(db, record.projectId);
  if (!project) {
    return {
      id: solicitationId,
      sent: false,
      error: `Project ${record.projectId} not found`,
      newStatus: record.status,
    };
  }

  const sendgridKey = process.env.SENDGRID_API_KEY;
  const fromEmail = DEFAULT_FROM_EMAIL || process.env.SENDGRID_FROM_EMAIL;
  if (!sendgridKey) {
    return {
      id: solicitationId,
      sent: false,
      error: 'SendGrid not configured (SENDGRID_API_KEY missing)',
      newStatus: record.status,
    };
  }
  if (!record.contractorEmail) {
    return {
      id: solicitationId,
      sent: false,
      error: 'Contractor has no email on file',
      newStatus: record.status,
    };
  }

  sgMail.setApiKey(sendgridKey);
  const address = project.address || record.projectAddress || 'a Skyeline jobsite';
  const args: EmailBuildArgs = {
    contractorName: record.contractorName,
    trade: String(record.trade),
    project: { ...project, address },
    isReminder: !!options.isReminder,
    customIntro: options.customIntro,
  };

  try {
    await sgMail.send({
      to: record.contractorEmail,
      from: {
        email: fromEmail || DEFAULT_FROM_EMAIL,
        name: 'Tyler Rhoton — Skyeline Homes',
      },
      replyTo: 'tyler@skyelinehomes.com',
      subject: buildSolicitationSubject(String(record.trade), address),
      text: buildSolicitationText(args),
      html: buildSolicitationHtml(args),
    });
  } catch (e: any) {
    return {
      id: solicitationId,
      sent: false,
      error: e?.message || String(e),
      newStatus: record.status,
    };
  }

  // Flip status → 'sent' and stamp sentAt (or lastRemindedAt on resend).
  const patch: any = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (options.isReminder) {
    patch.lastRemindedAt = admin.firestore.FieldValue.serverTimestamp();
    // Don't downgrade a 'responded' status to 'sent'.
    if (record.status !== 'responded' && record.status !== 'declined') {
      patch.status = 'sent';
    }
  } else {
    patch.status = 'sent';
    patch.sentAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await ref.update(patch);

  return {
    id: solicitationId,
    sent: true,
    newStatus: patch.status || record.status,
  };
}

// ── Batch operations ─────────────────────────────────────────────────────────

/**
 * Send every queued solicitation for a project. Returns a per-record result
 * array so the UI can update individual rows.
 */
export async function sendAllQueuedForProject(
  db: admin.firestore.Firestore,
  projectId: string,
): Promise<SendSolicitationResult[]> {
  const snap = await db
    .collection('bid_solicitations')
    .where('projectId', '==', projectId)
    .where('status', '==', 'queued')
    .get();
  const results: SendSolicitationResult[] = [];
  for (const doc of snap.docs) {
    // Sequential — SendGrid rate limits are lenient but we keep it
    // predictable to make failure isolation easy.
    // eslint-disable-next-line no-await-in-loop
    const r = await sendSolicitationEmail(db, doc.id);
    results.push(r);
  }
  return results;
}

// ── Gardanier preload utility ────────────────────────────────────────────────

/**
 * Queue solicitations across every canonical trade for the Gardanier project
 * (703 W 930 N, American Fork, UT 84003). Looks the project up by address /
 * client name, then hands the id to queueSolicitationsForProject. If the
 * project doesn't exist yet, throws — the caller should create it first.
 *
 * Idempotent: reruns skip duplicate (projectId, trade, email) combinations.
 */
export async function preloadGardanierSolicitations(
  db: admin.firestore.Firestore,
): Promise<QueueSolicitationsResult> {
  const projectId = await findGardanierProjectId(db);
  if (!projectId) {
    throw new Error(
      'Gardanier project not found in Firestore. Create the project with ' +
        'jobsiteAddress "703 W 930 N, American Fork, UT 84003" first, then rerun.',
    );
  }
  const trades: TradeSlug[] = TRADES.map((t) => t.slug);
  return queueSolicitationsForProject(db, { projectId, trades });
}

// ── Read helpers for the API layer ───────────────────────────────────────────

export async function listSolicitationsForProject(
  db: admin.firestore.Firestore,
  projectId: string,
): Promise<BidSolicitation[]> {
  const snap = await db
    .collection('bid_solicitations')
    .where('projectId', '==', projectId)
    .get();
  const rows = snap.docs.map((d) => {
    const data = d.data() as BidSolicitation;
    return { ...data, id: d.id };
  });
  // Sort in-memory (trade, then createdAt) so the client doesn't need a
  // composite index for the common read pattern.
  rows.sort((a, b) => {
    if (a.trade !== b.trade) return String(a.trade).localeCompare(String(b.trade));
    const at = (a.createdAt as any)?.toMillis?.() ?? 0;
    const bt = (b.createdAt as any)?.toMillis?.() ?? 0;
    return at - bt;
  });
  return rows;
}

export async function deleteSolicitation(
  db: admin.firestore.Firestore,
  solicitationId: string,
): Promise<{ id: string; deleted: boolean }> {
  const ref = db.collection('bid_solicitations').doc(solicitationId);
  const snap = await ref.get();
  if (!snap.exists) return { id: solicitationId, deleted: false };
  await ref.delete();
  return { id: solicitationId, deleted: true };
}

// Re-export the canonical trade list so the API layer doesn't have to reach
// into utahCountyContractors directly.
export { TRADES, UTAH_COUNTY_CONTRACTORS };
