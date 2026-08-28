// Express route version of sendBidRequest — folded into the api app
// to avoid the org IAM block that prevents new standalone functions from
// being made publicly invokable.
//
// Auth: Bearer token (Firebase ID token) verified against admin SDK.
// Email: SendGrid via process.env SENDGRID_API_KEY + SENDGRID_FROM_EMAIL
// SMS:   Twilio  via process.env TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER
// Magic link base: process.env APP_BASE_URL (e.g., https://skyelineos.web.app)
//
// Both email + SMS are optional — if a credential isn't set, that channel is
// skipped gracefully. The client falls back to mailto: when nothing was sent.
//
// Per D-012 (Phase 1D Slice 1), each vendor in a bid request gets a unique
// `inviteToken` baked into the magic link. The token routes the sub to
// /bid/respond/:token in the portal, where they sign in or sign up, then land
// on the bid response form.

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import twilio from 'twilio';
import crypto from 'crypto';
import { toE164, isSmsOptedOut } from '../notifications/sms';
import { loadFlowFor, renderTemplate } from '../notifications/fireTrigger';

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

interface VendorRecipientInput {
  contactId?: string;
  vendorName: string;
  email?: string;
  phone?: string;
  linkedUserId?: string;       // Firebase Auth UID of the sub's portal account, if linked
}

interface VendorRecipientStored extends VendorRecipientInput {
  inviteToken: string;
  inviteTokenExpiresAt: admin.firestore.Timestamp;
  bidStatus: 'pending' | 'viewed' | 'submitted' | 'declined' | 'expired';
  viewedAt?: admin.firestore.Timestamp;
  respondedAt?: admin.firestore.Timestamp;
  bidResponseId?: string;
}

type BidRequestType = 'general' | 'item';
type BidStage = 'rough' | 'final' | 'preselection';

interface TierGuidance {
  parade: string;
  midLuxury: string;
  lowLuxury: string;
}

interface RequestPayload {
  projectId: string;
  projectName?: string;

  // Bid type
  type?: BidRequestType;       // defaults to 'item' for backward compatibility
  trade?: string;              // required for type='general'; useful for type='item' too

  // type='item' fields (existing flow)
  selectionId?: string;
  selectionTitle?: string;
  selectionSpecs?: string;
  selectedOptionId?: string;

  // type='general' fields (new)
  tierGuidance?: TierGuidance;

  stage?: BidStage;
  vendors: VendorRecipientInput[];
  customMessage?: string;
  dueDays?: number;
  dueDate?: string;            // ISO or YYYY-MM-DD string; overrides dueDays if present
  requesterName?: string;

  // Follow-up linkage
  parentBidRequestId?: string;

  // ── Bid package consolidation (SendBidPackageModal flow) ─────────────────
  // When sent as part of a multi-trade package, these fields preserve the
  // existing GC dashboard contract so the legacy bidPackages view + queries
  // keep working unchanged.
  bidPackageId?: string;       // pointer to projects/{p}/bidPackages/{id} parent
  scope?: string;              // scope of work narrative for this trade
  callouts?: string;           // common notes from the package
  plans?: Array<{ name?: string; url: string; storagePath?: string; size?: number }>;
  // IA-audit gap #1 + #3: per-trade attachments. Tyler picks docs already on
  // the project (no re-upload) + selections the client made. The dispatch +
  // public token endpoint use these IDs to render attachments per trade.
  attachedPlanIds?: string[];
  attachedSelectionIds?: string[];

  // When true: persist the bidRequest doc and mint tokens, but DO NOT send
  // email or SMS from this endpoint. Used by the bid-package flow which
  // batches trades, then fires a single consolidated email per vendor via
  // /api/bid-packages/dispatch.
  skipDispatch?: boolean;
}

// ───────────────────────────────────────────────────────────────────────────
// Token generation
// ───────────────────────────────────────────────────────────────────────────

/**
 * Generate a 24-char URL-safe random token for a magic link.
 * Uses base64url (RFC 4648), so no `+`, `/`, or `=` chars.
 */
function generateInviteToken(): string {
  return crypto.randomBytes(18).toString('base64url');
}

// Tier descriptions baked from docs/decisions.md D-012-f. Shown in the
// general-bid email body so subs have a shared vocabulary.
const DEFAULT_TIER_GUIDANCE: TierGuidance = {
  parade: 'Showcase / showroom quality. Top-tier brands and detailing. Target: parade-home submission or feature property.',
  midLuxury: 'Standard luxury benchmark. Recognized luxury brands, semi-to-full custom finishes. Target: typical Skyeline home.',
  lowLuxury: 'Step above builder grade. Quality fittings, mid-market premium brands, durable finishes. Distinctly above contractor-standard.',
};

// ───────────────────────────────────────────────────────────────────────────
// Body builders
// ───────────────────────────────────────────────────────────────────────────

interface BuildBodyArgs {
  vendorName: string;
  link: string;
  data: RequestPayload;
  replyByDate: Date;
  type: BidRequestType;
}

function buildGeneralEmailBody({ vendorName, link, data, replyByDate }: BuildBodyArgs): string {
  const projectName = data.projectName || 'a Skyeline project';
  const guidance = data.tierGuidance || DEFAULT_TIER_GUIDANCE;
  const en = [
    `Hi ${vendorName},`,
    '',
    `We're prepping bids for ${projectName} — a new build by Skyeline Homes. Since we're early in the selection process, we'd like a general bid from you at our three quality tiers, so we have working numbers as the homeowner finalizes selections.`,
    '',
    `Every Skyeline home is built a step above standard builder grade, so all three of our tiers reflect that:`,
    '',
    `• Parade Home Level — ${guidance.parade}`,
    `• Mid Luxury Level — ${guidance.midLuxury}`,
    `• Low Luxury Level — ${guidance.lowLuxury}`,
    '',
    `You'll respond through your Skyeline Subcontractor Portal. If you don't have an account yet, the link below walks you through a quick sign-up and document upload.`,
    '',
    `→ Submit your bid: ${link}`,
    '',
    data.customMessage ? `Notes: ${data.customMessage}` : '',
    '',
    `Please respond by ${replyByDate.toLocaleDateString()}. Reply to this email with any questions.`,
    '',
    `Thanks,`,
    data.requesterName || 'The Skyeline Homes Team',
  ].filter(Boolean).join('\n');

  const es = [
    `Hola ${vendorName},`,
    '',
    `Estamos preparando ofertas para ${projectName} — una casa nueva de Skyeline Homes. Como estamos al inicio del proceso de selección, nos gustaría una oferta general en nuestros tres niveles de calidad, para tener números de referencia mientras el propietario finaliza sus selecciones.`,
    '',
    `Cada casa de Skyeline se construye un nivel por encima del estándar, y los tres niveles reflejan eso:`,
    '',
    `• Nivel Parade Home — ${guidance.parade}`,
    `• Nivel Lujo Medio — ${guidance.midLuxury}`,
    `• Nivel Lujo Básico — ${guidance.lowLuxury}`,
    '',
    `Usted responderá a través de su Portal de Subcontratistas de Skyeline. Si aún no tiene una cuenta, el enlace de abajo lo guiará para registrarse y subir sus documentos.`,
    '',
    `→ Enviar su oferta: ${link}`,
    '',
    data.customMessage ? `Notas: ${data.customMessage}` : '',
    '',
    `Por favor responda antes del ${replyByDate.toLocaleDateString()}. Responda a este correo si tiene preguntas.`,
    '',
    `Gracias,`,
    data.requesterName || 'El equipo de Skyeline Homes',
  ].filter(Boolean).join('\n');

  return `${en}\n\n— — — — — — — — — — Español — — — — — — — — — —\n\n${es}`;
}

// ── HTML email assembly ─────────────────────────────────────────────────
//
// Matches the look of the existing notification dispatcher template
// (functions/src/notifications/dispatch.ts:264 buildEmailHtml) so subs see
// a consistent Skyeline-branded email regardless of which path sent it.
// Gold accent: #C9A96E. Header underline + button color + footer all match.

// Bytes → human-readable size for plan download buttons in email bodies.
function formatBytesLocal(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface EmailBodyResult {
  text: string;     // plaintext fallback
  html: string;     // styled body
}

// Visual separator between the English and Spanish halves of a bilingual
// email body. Bilingual is non-negotiable for Skyeline's subs (mixed EN/ES),
// so every invitation carries both languages rather than guessing preference.
const langDivider =
  '<div style="display:flex;align-items:center;gap:10px;margin:26px 0 18px 0;color:#8a6a2c;font-size:11px;text-transform:uppercase;letter-spacing:1px;"><span style="flex:1;height:1px;background:#EAE5DC;"></span>Español<span style="flex:1;height:1px;background:#EAE5DC;"></span></div>';

function wrapEmailHtml(args: {
  title: string;
  requesterName?: string;
  bodyHtml: string;
  link: string;
  replyByDate: Date;
}): string {
  const { title, requesterName, bodyHtml, link, replyByDate } = args;
  const fromLine = requesterName
    ? `<p style="color:#666;font-size:13px;margin:0 0 16px 0;">From: ${escapeHtml(requesterName)}</p>`
    : '';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #222;">
      <div style="border-bottom: 3px solid #C9A96E; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin:0;color:#141414;font-size:18px;">${escapeHtml(title)}</h2>
      </div>
      ${fromLine}
      <div style="color:#222;font-size:15px;line-height:1.55;">${bodyHtml}</div>
      <p style="margin:28px 0;">
        <a href="${link}" style="background:#C9A96E;color:#141414;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:600;display:inline-block;font-size:15px;">Submit your bid / Enviar su oferta</a>
      </p>
      <p style="color:#777;font-size:13px;margin:0 0 6px 0;">Please respond by ${escapeHtml(replyByDate.toLocaleDateString())}. If you don't have a portal account yet, the button above walks you through sign-up and document upload (W-9, Certificate of Insurance, Subcontractor Agreement).</p>
      <p style="color:#777;font-size:13px;margin:0 0 24px 0;">Por favor responda antes del ${escapeHtml(replyByDate.toLocaleDateString())}. Si aún no tiene una cuenta en el portal, el botón de arriba lo guiará para registrarse y subir sus documentos (W-9, Certificado de Seguro, Acuerdo de Subcontratista).</p>
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0 12px 0;">
      <p style="font-size:11px;color:#999;text-align:center;margin:0;">Skyeline Homes · This is an automated notification. / Esta es una notificación automática.</p>
    </div>
  `;
}

function buildItemEmailBody({ vendorName, link, data, replyByDate }: BuildBodyArgs): string {
  const projectName = data.projectName || 'a Skyeline project';
  const stage = data.stage ?? 'rough';

  // Two shapes share this builder:
  //  - Selection-specific bid (has selectionTitle/specs) → from RequestBidUpdate.tsx
  //  - Trade-scope bid package (has trade + scope, no selection) → from SendBidPackageModal.tsx
  const isPackageScope = !data.selectionTitle && !!(data.trade && data.scope);

  let opener: string;
  let openerEs: string;
  if (isPackageScope) {
    opener = `We're putting together bids on ${data.trade} for ${projectName} and would like your number. Scope and timeline are below.`;
    openerEs = `Estamos reuniendo ofertas de ${data.trade} para ${projectName} y nos gustaría su precio. El alcance y el plazo están abajo.`;
  } else if (stage === 'rough') {
    opener = `We're working up early numbers for ${projectName}. Could you send a rough bid based on the plans?`;
    openerEs = `Estamos calculando números preliminares para ${projectName}. ¿Podría enviarnos una oferta preliminar basada en los planos?`;
  } else {
    opener = `The specs on ${data.selectionTitle} are now locked. Could you update your previous bid with final pricing?`;
    openerEs = `Las especificaciones de ${data.selectionTitle} ya están definidas. ¿Podría actualizar su oferta anterior con el precio final?`;
  }

  const plansBlock = (langLabel: string) =>
    (Array.isArray(data.plans) && data.plans.length > 0)
      ? `\n${langLabel}:\n${data.plans.map(p => `  • ${p.name || 'Plan'} — ${p.url}`).join('\n')}`
      : '';

  const en = [
    `Hi ${vendorName},`,
    '',
    opener,
    '',
    isPackageScope ? `Trade: ${data.trade}` : '',
    isPackageScope ? `Scope of work:\n${data.scope}` : '',
    data.selectionTitle ? `Item: ${data.selectionTitle}` : '',
    data.selectionSpecs ? `Specs:\n${data.selectionSpecs}` : '',
    data.callouts ? `\nNotes: ${data.callouts}` : (data.customMessage ? `\nNotes: ${data.customMessage}` : ''),
    plansBlock('Plans / Documents'),
    '',
    `Submit your bid through your Skyeline Subcontractor Portal:`,
    `→ ${link}`,
    '',
    `Please respond by ${replyByDate.toLocaleDateString()}. If you don't have a portal account yet, the link will walk you through sign-up + document upload (W-9, Certificate of Insurance, Subcontractor Agreement).`,
    '',
    `Thanks,`,
    data.requesterName || 'The Skyeline Homes Team',
  ].filter(Boolean).join('\n');

  const es = [
    `Hola ${vendorName},`,
    '',
    openerEs,
    '',
    isPackageScope ? `Oficio: ${data.trade}` : '',
    isPackageScope ? `Alcance del trabajo:\n${data.scope}` : '',
    data.selectionTitle ? `Artículo: ${data.selectionTitle}` : '',
    data.selectionSpecs ? `Especificaciones:\n${data.selectionSpecs}` : '',
    data.callouts ? `\nNotas: ${data.callouts}` : (data.customMessage ? `\nNotas: ${data.customMessage}` : ''),
    plansBlock('Planos / Documentos'),
    '',
    `Envíe su oferta a través de su Portal de Subcontratistas de Skyeline:`,
    `→ ${link}`,
    '',
    `Por favor responda antes del ${replyByDate.toLocaleDateString()}. Si aún no tiene una cuenta en el portal, el enlace lo guiará para registrarse y subir sus documentos (W-9, Certificado de Seguro, Acuerdo de Subcontratista).`,
    '',
    `Gracias,`,
    data.requesterName || 'El equipo de Skyeline Homes',
  ].filter(Boolean).join('\n');

  return `${en}\n\n— — — — — — — — — — Español — — — — — — — — — —\n\n${es}`;
}

function buildEmailBody(args: BuildBodyArgs): string {
  return args.type === 'general'
    ? buildGeneralEmailBody(args)
    : buildItemEmailBody(args);
}

// HTML versions of the email bodies. The text variants above remain the
// plaintext fallback for clients that don't render HTML, but the HTML version
// is what 99% of recipients actually see — with a styled "View in Skyeline OS"
// button instead of a raw URL.

function buildGeneralEmailHtml(args: BuildBodyArgs): string {
  const { data, link, replyByDate } = args;
  const projectName = data.projectName || 'a Skyeline project';
  const guidance = data.tierGuidance || DEFAULT_TIER_GUIDANCE;
  const inner = `
    <p>We're prepping bids for <strong>${escapeHtml(projectName)}</strong> — a new build by Skyeline Homes. Since we're early in the selection process, we'd like a general bid from you at our three quality tiers, so we have working numbers as the homeowner finalizes selections.</p>
    <p>Every Skyeline home is built a step above standard builder grade, so all three of our tiers reflect that:</p>
    <ul style="margin:12px 0 12px 18px;padding:0;">
      <li style="margin-bottom:6px;"><strong>Parade Home Level</strong> — ${escapeHtml(guidance.parade)}</li>
      <li style="margin-bottom:6px;"><strong>Mid Luxury Level</strong> — ${escapeHtml(guidance.midLuxury)}</li>
      <li style="margin-bottom:6px;"><strong>Low Luxury Level</strong> — ${escapeHtml(guidance.lowLuxury)}</li>
    </ul>
    ${data.customMessage ? `<p style="background:#FAFAF6;border-left:3px solid #C9A96E;padding:10px 14px;margin:16px 0;color:#444;">${escapeHtml(data.customMessage)}</p>` : ''}
    ${langDivider}
    <p>Estamos preparando ofertas para <strong>${escapeHtml(projectName)}</strong> — una casa nueva de Skyeline Homes. Como estamos al inicio del proceso de selección, nos gustaría una oferta general en nuestros tres niveles de calidad, para tener números de referencia mientras el propietario finaliza sus selecciones.</p>
    <p>Cada casa de Skyeline se construye un nivel por encima del estándar, y los tres niveles reflejan eso:</p>
    <ul style="margin:12px 0 12px 18px;padding:0;">
      <li style="margin-bottom:6px;"><strong>Nivel Parade Home</strong> — ${escapeHtml(guidance.parade)}</li>
      <li style="margin-bottom:6px;"><strong>Nivel Lujo Medio</strong> — ${escapeHtml(guidance.midLuxury)}</li>
      <li style="margin-bottom:6px;"><strong>Nivel Lujo Básico</strong> — ${escapeHtml(guidance.lowLuxury)}</li>
    </ul>
    ${data.customMessage ? `<p style="background:#FAFAF6;border-left:3px solid #C9A96E;padding:10px 14px;margin:16px 0;color:#444;">${escapeHtml(data.customMessage)}</p>` : ''}
  `;
  return wrapEmailHtml({
    title: `Bid request — ${data.trade || 'trade'} — ${projectName}`,
    requesterName: data.requesterName,
    bodyHtml: inner,
    link,
    replyByDate,
  });
}

function buildItemEmailHtml(args: BuildBodyArgs): string {
  const { data, link, replyByDate } = args;
  const projectName = data.projectName || 'a Skyeline project';
  const isPackageScope = !data.selectionTitle && !!(data.trade && data.scope);
  const stage = data.stage ?? 'rough';

  let opener: string;
  let openerEs: string;
  if (isPackageScope) {
    opener = `<p>We're putting together bids on <strong>${escapeHtml(data.trade!)}</strong> for <strong>${escapeHtml(projectName)}</strong> and would like your number. Scope is below.</p>`;
    openerEs = `<p>Estamos reuniendo ofertas de <strong>${escapeHtml(data.trade!)}</strong> para <strong>${escapeHtml(projectName)}</strong> y nos gustaría su precio. El alcance está abajo.</p>`;
  } else if (stage === 'rough') {
    opener = `<p>We're working up early numbers for <strong>${escapeHtml(projectName)}</strong>. Could you send a rough bid based on the plans?</p>`;
    openerEs = `<p>Estamos calculando números preliminares para <strong>${escapeHtml(projectName)}</strong>. ¿Podría enviarnos una oferta preliminar basada en los planos?</p>`;
  } else {
    opener = `<p>The specs on <strong>${escapeHtml(data.selectionTitle || 'this item')}</strong> are now locked. Could you update your previous bid with final pricing?</p>`;
    openerEs = `<p>Las especificaciones de <strong>${escapeHtml(data.selectionTitle || 'este artículo')}</strong> ya están definidas. ¿Podría actualizar su oferta anterior con el precio final?</p>`;
  }

  // Build a detail table for a given (label-pair) language. rowLabels maps the
  // two possible rows to their localized headers.
  const detailTableFor = (labels: { trade: string; scope: string; item: string; specs: string }): string => {
    const rows: string[] = [];
    if (isPackageScope) {
      rows.push(`<tr><td style="padding:6px 14px 6px 0;color:#666;font-size:13px;width:90px;">${labels.trade}</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(data.trade!)}</td></tr>`);
      rows.push(`<tr><td style="padding:6px 14px 6px 0;color:#666;font-size:13px;vertical-align:top;">${labels.scope}</td><td style="padding:6px 0;font-size:14px;white-space:pre-wrap;">${escapeHtml(data.scope!)}</td></tr>`);
    } else {
      if (data.selectionTitle) rows.push(`<tr><td style="padding:6px 14px 6px 0;color:#666;font-size:13px;width:90px;">${labels.item}</td><td style="padding:6px 0;font-size:14px;">${escapeHtml(data.selectionTitle)}</td></tr>`);
      if (data.selectionSpecs) rows.push(`<tr><td style="padding:6px 14px 6px 0;color:#666;font-size:13px;vertical-align:top;">${labels.specs}</td><td style="padding:6px 0;font-size:14px;white-space:pre-wrap;">${escapeHtml(data.selectionSpecs)}</td></tr>`);
    }
    return rows.length > 0
      ? `<table style="border-collapse:collapse;margin:12px 0;"><tbody>${rows.join('')}</tbody></table>`
      : '';
  };
  const detailTable = detailTableFor({ trade: 'Trade', scope: 'Scope', item: 'Item', specs: 'Specs' });
  const detailTableEs = detailTableFor({ trade: 'Oficio', scope: 'Alcance', item: 'Artículo', specs: 'Especificaciones' });

  const note = data.callouts || data.customMessage;
  const noteHtml = note
    ? `<p style="background:#FAFAF6;border-left:3px solid #C9A96E;padding:10px 14px;margin:16px 0;color:#444;">${escapeHtml(note)}</p>`
    : '';

  // Plan download buttons — surfaced inline so subs can grab the PDFs without
  // opening the portal first. Storage URLs are long-lived here in the email;
  // the portal serves short-lived signed URLs, and the invite token remains
  // the auth on the response page.
  const plans = Array.isArray(data.plans) ? data.plans : [];
  const plansHtmlFor = (heading: string): string =>
    plans.length > 0
      ? `<div style="margin:14px 0 4px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#8a6a2c;margin-bottom:6px;">${heading} (${plans.length})</div>
        ${plans.map(p => `<div style="margin:0 0 6px 0;"><a href="${p.url}" style="display:inline-block;background:#ffffff;border:1px solid #C9A96E;color:#141414;text-decoration:none;padding:8px 14px;border-radius:4px;font-size:13px;font-weight:500;">⬇ ${escapeHtml(p.name || 'Plan')}${typeof p.size === 'number' && p.size > 0 ? ` <span style="color:#888;font-weight:400;">(${formatBytesLocal(p.size)})</span>` : ''}</a></div>`).join('')}
      </div>`
      : '';
  const plansHtml = plansHtmlFor('Plans / Documents');
  const plansHtmlEs = plansHtmlFor('Planos / Documentos');

  const inner =
    opener + detailTable + noteHtml + plansHtml +
    langDivider +
    openerEs + detailTableEs + plansHtmlEs;

  // Subject-style title for the header
  let title: string;
  if (isPackageScope) {
    title = `Bid request — ${data.trade} — ${projectName}`;
  } else if (stage === 'final') {
    title = `Updated bid request — ${data.selectionTitle} (specs locked) — ${projectName}`;
  } else {
    title = `Bid request — ${data.selectionTitle || 'item'} — ${projectName}`;
  }

  return wrapEmailHtml({
    title,
    requesterName: data.requesterName,
    bodyHtml: inner,
    link,
    replyByDate,
  });
}

function buildEmailHtml(args: BuildBodyArgs): string {
  return args.type === 'general'
    ? buildGeneralEmailHtml(args)
    : buildItemEmailHtml(args);
}

function buildSms({ link, data, replyByDate, type }: BuildBodyArgs): string {
  const projectName = data.projectName || 'Skyeline project';
  const due = replyByDate.toLocaleDateString();
  // Bilingual, kept tight. Twilio concatenates past 160 chars — acceptable
  // for a mixed EN/ES subcontractor base where we can't rely on stored
  // language preference.
  if (type === 'general') {
    const trade = data.trade || 'trade';
    return `Skyeline Homes bid request — ${trade} for ${projectName}, due ${due}. Submit in your portal: ${link} · Solicitud de oferta de Skyeline — ${trade} para ${projectName}, antes del ${due}. Envíe en su portal.`;
  }
  const isPackageScope = !data.selectionTitle && !!(data.trade && data.scope);
  const subject = isPackageScope ? data.trade : (data.selectionTitle || 'item');
  return `Skyeline Homes bid request — ${subject} on ${projectName}, due ${due}. Submit in your portal: ${link} · Solicitud de oferta de Skyeline — ${subject} en ${projectName}, antes del ${due}. Envíe en su portal.`;
}

function buildEmailSubject(data: RequestPayload, type: BidRequestType): string {
  const projectName = data.projectName || 'Skyeline project';
  if (type === 'general') {
    return `Bid request / Solicitud de oferta — ${data.trade || 'trade'} — ${projectName}`;
  }
  // type='item': package-scope vs. selection-specific
  const isPackageScope = !data.selectionTitle && !!(data.trade && data.scope);
  if (isPackageScope) {
    return `Bid request / Solicitud de oferta — ${data.trade} — ${projectName}`;
  }
  return data.stage === 'final'
    ? `Updated bid request / Oferta actualizada — ${data.selectionTitle} — ${projectName}`
    : `Bid request / Solicitud de oferta — ${data.selectionTitle || 'item'} — ${projectName}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Route registration
// ───────────────────────────────────────────────────────────────────────────

export function registerBidRequestRoute(app: Express, db: admin.firestore.Firestore) {
  app.post('/api/bid-requests/send', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const idToken = authHeader.substring(7);
      const decoded = await admin.auth().verifyIdToken(idToken);
      const uid = decoded.uid;

      const data = req.body as RequestPayload;
      const type: BidRequestType = data.type === 'general' ? 'general' : 'item';

      // Validation
      if (!data?.projectId || !data?.vendors?.length) {
        return res.status(400).json({ error: 'Missing projectId or vendors' });
      }
      // For type='item', we want EITHER a selectionId (specific-selection bid
      // update flow used by RequestBidUpdate.tsx) OR a trade + scope (bid
      // package flow used by SendBidPackageModal.tsx — trade-scope bid with no
      // specific selection attached). Reject only if neither is present.
      if (type === 'item' && !data.selectionId && !(data.trade && data.scope)) {
        return res.status(400).json({
          error: 'Bid request requires either selectionId, or trade + scope',
        });
      }
      if (type === 'general' && !data.trade) {
        return res.status(400).json({ error: 'General bid request requires trade' });
      }

      // Default stage if not specified
      const stage: BidStage = data.stage ?? (type === 'general' ? 'preselection' : 'rough');

      // Reply-by date: explicit dueDate wins; otherwise dueDays from today
      let replyByDate: Date;
      if (data.dueDate) {
        const parsed = new Date(data.dueDate);
        if (!isNaN(parsed.getTime())) {
          replyByDate = parsed;
        } else {
          return res.status(400).json({ error: 'Invalid dueDate format' });
        }
      } else {
        const dueDays = data.dueDays ?? (
          stage === 'preselection' ? 10 :
          stage === 'rough' ? 7 :
          5
        );
        replyByDate = new Date(Date.now() + dueDays * 86400000);
      }

      // Token expiration: replyBy + 14 days grace (per D-012-e)
      const tokenExpiresAt = new Date(replyByDate.getTime() + 14 * 86400000);

      // Magic link base
      // .trim() is load-bearing: the APP_BASE_URL secret has carried a trailing
      // newline, which otherwise lands literally inside the magic link
      // ("https://host\n/bid/respond/…") and breaks the email CTA. Strip
      // surrounding whitespace + any trailing slashes. (The /api/bid-packages
      // dispatch route already normalizes via normalizeBaseUrl().)
      const appBaseUrl = (process.env.APP_BASE_URL || 'https://skyelineos.web.app').trim().replace(/\/+$/, '');

      // Augment vendor entries with invite tokens + status
      const augmentedVendors: VendorRecipientStored[] = data.vendors.map(v => ({
        ...v,
        inviteToken: generateInviteToken(),
        inviteTokenExpiresAt: admin.firestore.Timestamp.fromDate(tokenExpiresAt),
        bidStatus: 'pending',
      }));

      // External integrations
      const resendKey = process.env.RESEND_API_KEY;
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_FROM_NUMBER;

      const resendReady = !!resendKey;

      // Twilio init can THROW synchronously if accountSid doesn't start with 'AC'
      // (Twilio SDK validation). A bad secret value would crash the entire
      // bid send, blocking even the email path. Isolate the failure so SMS
      // degrades gracefully — log it and continue with email-only delivery.
      let twilioClient: ReturnType<typeof twilio> | null = null;
      const twilioConfigured = !!(twilioSid && twilioAuthToken && twilioFrom);
      if (twilioConfigured) {
        try {
          twilioClient = twilio(twilioSid!, twilioAuthToken!);
        } catch (e: any) {
          console.error('[sendBidRequest] Twilio init failed — SMS disabled for this send:', e?.message || e);
          twilioClient = null;
        }
      }

      const subject = buildEmailSubject(data, type);
      const results: Array<any> = [];
      const dispatchSuppressed = !!data.skipDispatch;

      // Channel governance for direct (non-batched) sends — honor the admin's
      // 'bid_invitation' (audience: sub) channel toggles from Settings → Triggers.
      const inviteFlow = await loadFlowFor(db, 'bid_invitation', 'sub');
      const inviteStep = inviteFlow.steps?.[0];
      const allowInviteEmail = inviteFlow.enabled !== false && inviteStep?.channels?.email !== false;
      const allowInviteSms = inviteFlow.enabled !== false && inviteStep?.channels?.sms === true;

      // Send to each vendor, with their unique token in the link
      for (const v of augmentedVendors) {
        if (dispatchSuppressed) {
          // Skip notification dispatch — caller will batch + send a
          // consolidated email per vendor via /api/bid-packages/dispatch.
          results.push({ vendorName: v.vendorName, contactId: v.contactId || null, skipped: true });
          continue;
        }
        const r: any = { vendorName: v.vendorName, contactId: v.contactId || null };
        const link = `${appBaseUrl}/bid/respond/${v.inviteToken}`;
        const builderArgs: BuildBodyArgs = {
          vendorName: v.vendorName,
          link,
          data,
          replyByDate,
          type,
        };

        if (v.email && allowInviteEmail) {
          if (!resendReady) {
            r.email = { sent: false, error: 'Resend not configured' };
          } else {
            try {
              const resend = new Resend(resendKey);
              const { error: resendError } = await resend.emails.send({
                from: 'Skyeline Homes <tyler@skyelinehomes.com>',
                to: v.email,
                subject,
                text: buildEmailBody(builderArgs),
                html: buildEmailHtml(builderArgs),
              });
              if (resendError) {
                r.email = { sent: false, error: resendError.message };
              } else {
                r.email = { sent: true };
              }
            } catch (e: any) {
              r.email = { sent: false, error: e?.message || String(e) };
            }
          }
        }
        if (v.phone && twilioClient && allowInviteSms) {
          const toNumber = toE164(v.phone);
          if (!toNumber) {
            r.sms = { sent: false, error: `Invalid phone "${v.phone}" (not E.164)` };
          } else if (await isSmsOptedOut(db, toNumber)) {
            r.sms = { sent: false, error: 'Recipient opted out (STOP)' };
          } else {
            try {
              const tpl = inviteStep?.smsBody?.trim();
              const body = tpl
                ? renderTemplate(tpl, {
                    vendorName: v.vendorName,
                    projectName: data.projectName || '',
                    trade: data.trade || '',
                    magicLink: link,
                    link,
                    dueDate: data.dueDate || '',
                  })
                : buildSms(builderArgs);
              await twilioClient.messages.create({ from: twilioFrom!, to: toNumber, body });
              r.sms = { sent: true };
            } catch (e: any) {
              r.sms = { sent: false, error: e?.message || String(e) };
            }
          }
        } else if (v.phone && twilioClient && !allowInviteSms) {
          r.sms = { sent: false, error: 'Bid-invite SMS disabled in Settings → Triggers' };
        }
        results.push(r);
      }

      // Build legacy `invitedSubIds` for backward compatibility with the
      // existing GC dashboard / PortalBidsPanel / SubBidRequestsTab queries.
      // The dashboard matches the sub by ANY of: contact-doc ID, linked Auth UID,
      // or email. We bake all three into a flat array so the old collectionGroup
      // query still resolves whether or not the sub has been linkedUserId-stamped
      // when the bid was sent.
      const invitedSubIds: string[] = [];
      const invitedSubContactIds: string[] = [];
      for (const v of augmentedVendors) {
        if (v.contactId) {
          invitedSubIds.push(v.contactId);
          invitedSubContactIds.push(v.contactId);
        }
        if (v.linkedUserId) invitedSubIds.push(v.linkedUserId);
        if (v.email) invitedSubIds.push(v.email.toLowerCase().trim());
      }

      // Persist the bid request with augmented vendor entries (tokens included)
      const docRef = await db
        .collection('projects')
        .doc(data.projectId)
        .collection('bidRequests')
        .add({
          // New magic-link flow fields
          type,
          trade: data.trade || null,
          selectionId: data.selectionId || null,
          selectionTitle: data.selectionTitle || null,
          selectionSpecs: data.selectionSpecs || null,
          selectedOptionId: data.selectedOptionId || null,
          tierGuidance: type === 'general' ? (data.tierGuidance || DEFAULT_TIER_GUIDANCE) : null,
          stage,
          vendors: augmentedVendors,
          customMessage: data.customMessage || null,
          dueByDate: admin.firestore.Timestamp.fromDate(replyByDate),
          requestedBy: uid,
          requestedAt: admin.firestore.FieldValue.serverTimestamp(),
          parentBidRequestId: data.parentBidRequestId || null,
          results,

          // ── Legacy bidPackage-flow fields (backward compat with existing
          //    GC dashboard, PortalBidsPanel, SubBidRequestsTab queries) ────
          projectId: data.projectId,
          projectName: data.projectName || null,
          bidPackageId: data.bidPackageId || null,
          scope: data.scope || null,
          callouts: data.callouts || null,
          plans: data.plans || [],
          attachedPlanIds: Array.isArray(data.attachedPlanIds) ? data.attachedPlanIds : [],
          attachedSelectionIds: Array.isArray(data.attachedSelectionIds) ? data.attachedSelectionIds : [],
          dueDate: data.dueDate || replyByDate.toISOString().slice(0, 10),
          invitedSubIds,
          invitedSubContactIds,
          invitedByUserId: uid,
          invitedByName: data.requesterName || null,
          status: 'open',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      // Write root-level token lookup docs for O(1) public resolution.
      // /bidInviteTokens/{token} → { projectId, bidRequestId, vendorIndex, expiresAt }
      // Used by GET /api/bid-requests/by-token/:token (public, no auth).
      const tokenWrites = augmentedVendors.map((v, i) =>
        db.collection('bidInviteTokens').doc(v.inviteToken).set({
          token: v.inviteToken,
          projectId: data.projectId,
          bidRequestId: docRef.id,
          vendorIndex: i,
          vendorName: v.vendorName,
          contactId: v.contactId || null,
          vendorEmail: v.email || null,
          expiresAt: admin.firestore.Timestamp.fromDate(tokenExpiresAt),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }),
      );
      try {
        await Promise.all(tokenWrites);
        // Diagnostic: log tokens written so any future 404 can be cross-referenced
        // against this log line. Tokens are the invitation key (not a user secret);
        // function logs are project-staff-only.
        console.log(
          `[sendBidRequest] bidRequestId=${docRef.id} wrote ${augmentedVendors.length} bidInviteTokens: ${augmentedVendors.map(v => v.inviteToken).join(', ')}`,
        );
      } catch (tokenErr: any) {
        // If the token writes fail, the bidRequest exists but every link will
        // 404 on lookup — log loudly so this isn't silent.
        console.error(
          `[sendBidRequest] bidRequestId=${docRef.id} TOKEN WRITES FAILED: ${tokenErr?.message || tokenErr}`,
        );
        throw tokenErr;
      }

      const sentEmails = results.filter(r => r.email?.sent).length;
      const sentSms = results.filter(r => r.sms?.sent).length;

      // Build per-vendor link map so the caller (e.g., SendBidPackageModal)
      // can use the magic links when fanning out in-app notifications.
      const vendorLinks = augmentedVendors.map(v => ({
        vendorName: v.vendorName,
        contactId: v.contactId || null,
        email: v.email || null,
        inviteToken: v.inviteToken,
        magicLink: `${appBaseUrl}/bid/respond/${v.inviteToken}`,
      }));

      res.json({
        ok: true,
        bidRequestId: docRef.id,
        type,
        sentEmails,
        sentSms,
        total: data.vendors.length,
        results,
        vendorLinks,
      });
    } catch (e: any) {
      console.error('sendBidRequest error:', e);
      res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
