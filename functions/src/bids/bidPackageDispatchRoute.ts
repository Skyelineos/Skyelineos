// POST /api/bid-packages/dispatch
//
// Sends ONE consolidated bid invitation email per vendor for a bid package
// that spans multiple trades. Replaces the previous per-trade fan-out which
// produced multiple emails to the same sub when they were invited to >1 trade.
//
// Flow (called from SendBidPackageModal):
//   1. Modal creates the bidPackages/{id} parent doc client-side
//   2. Modal calls /api/bid-requests/send per trade with skipDispatch=true
//      → that creates the bidRequest docs + invite tokens but does NOT email
//   3. Modal calls THIS endpoint with the bidPackageId
//      → server reads every bidRequest under that package, groups vendors
//      → sends one styled HTML email per unique vendor listing the trades
//      → sends one SMS per unique vendor with the trade list
//
// The email button URL points at /bid/respond/<one of the vendor's tokens>.
// Any of their tokens works — after sign-in / verification, the portal
// surfaces all bids the vendor is invited to, not just the one matching the
// token.
//
// Authorized: gc / projectManager / admin.

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import twilio from 'twilio';
import { randomBytes } from 'crypto';
import { toE164, isSmsOptedOut } from '../notifications/sms';
import { loadFlowFor, renderTemplate } from '../notifications/fireTrigger';

interface DispatchPayload {
  projectId: string;
  bidPackageId: string;
  requesterName?: string;
}

interface VendorEntry {
  contactId?: string;
  vendorName: string;
  email?: string;
  phone?: string;
  inviteToken: string;
  bidStatus?: string;
}

interface TradeDetail {
  trade: string;
  scope?: string;
  callouts?: string;
  plans?: PlanRef[];
  selections?: SelectionRef[];
}

interface PlanRef {
  name: string;
  url: string;
  storagePath?: string;
  size?: number;
}

// Public-safe shape of a client selection — what the sub sees inline in the
// email + on BidRespond. Pulled from projects/{id}/selections/{id}.items[0].
interface SelectionRef {
  id: string;
  category?: string;
  area?: string;
  room?: string;
  productName?: string;
  vendor?: string;       // brand
  description?: string;  // size / layout / grout summary
  imageUrl?: string;
  productUrl?: string;
}

interface VendorBundle {
  key: string;                     // dedupe key (contactId or email)
  vendorName: string;
  email?: string;
  phone?: string;
  trades: string[];                // unique trade names invited to
  tradeDetails: TradeDetail[];     // per-trade scope/callouts/plans for email body
  primaryToken: string;            // any one of the vendor's tokens
  bidRequestIds: string[];
}

const STAFF_ROLES = new Set(['gc', 'admin', 'projectManager']);

// base64url token (no +, /, =), matching sendBidRequestRoute.
function generateInviteToken(): string {
  return randomBytes(18).toString('base64url');
}

// Guarantee an absolute https:// URL with no trailing slash. A scheme-less or
// empty base URL produces a relative href that email clients won't open — one
// cause of a "dead" View-in-Skyeline-OS button.
function normalizeBaseUrl(raw?: string): string {
  let u = (raw || '').trim();
  if (!u) u = 'https://skyelineos.web.app';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPackageEmailHtml(args: {
  vendorName: string;
  projectName: string;
  trades: string[];
  tradeDetails: TradeDetail[];
  link: string;
  requesterName?: string;
  packageName: string;
}): string {
  const { vendorName, projectName, trades, tradeDetails, link, requesterName } = args;
  const fromLine = requesterName
    ? `<p style="color:#666;font-size:13px;margin:0 0 16px 0;">From: ${escapeHtml(requesterName)}</p>`
    : '';

  // Per-trade sections — scope of work + per-trade callouts + plan download
  // links. Scope is where Tyler writes "use SIPs / IceWatershield 6 inches up
  // the eaves / schluter on tile transitions" style direction. Plans are
  // surfaced as download CTAs (no email attachments — keeps SendGrid's 30MB
  // cap from biting; Firebase Storage URLs are long-lived, gated by the
  // invite-token landing page).
  const tradeSections = tradeDetails.map(td => {
    const scopeHtml = td.scope
      ? `<div style="margin:8px 0 4px 0;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#8a6a2c;margin-bottom:4px;">Scope of Work</div><div style="font-size:14px;line-height:1.55;white-space:pre-wrap;color:#222;">${escapeHtml(td.scope)}</div></div>`
      : '';
    const noteHtml = td.callouts
      ? `<div style="margin:10px 0 4px 0;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#8a6a2c;margin-bottom:4px;">Notes from Skyeline</div><div style="font-size:14px;line-height:1.55;white-space:pre-wrap;color:#222;">${escapeHtml(td.callouts)}</div></div>`
      : '';
    const plansHtml = td.plans && td.plans.length > 0
      ? `<div style="margin:12px 0 4px 0;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#8a6a2c;margin-bottom:6px;">Plans / Documents (${td.plans.length})</div>
          ${td.plans.map(p => `<div style="margin:0 0 6px 0;"><a href="${p.url}" style="display:inline-block;background:#ffffff;border:1px solid #C9A96E;color:#141414;text-decoration:none;padding:8px 14px;border-radius:4px;font-size:13px;font-weight:500;">⬇ ${escapeHtml(p.name)}${typeof p.size === 'number' && p.size > 0 ? ` <span style="color:#888;font-weight:400;">(${formatBytes(p.size)})</span>` : ''}</a></div>`).join('')}
        </div>`
      : '';
    // Selections table — surfaces what the client picked so subs bid against
    // a known product/finish/brand rather than guessing. Renders a small
    // thumbnail + product name + brand + spec line + optional "View product"
    // link. Heading: "Selections for {trade}".
    const selectionsHtml = td.selections && td.selections.length > 0
      ? `<div style="margin:12px 0 4px 0;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:#8a6a2c;margin-bottom:6px;">Selections for ${escapeHtml(td.trade)} (${td.selections.length})</div>
          <table style="border-collapse:collapse;width:100%;">
            <tbody>
              ${td.selections.map(s => `
                <tr>
                  <td style="vertical-align:top;padding:6px 8px 6px 0;width:64px;">
                    ${s.imageUrl ? `<img src="${s.imageUrl}" alt="${escapeHtml(s.productName || s.category || 'Selection')}" style="width:56px;height:56px;object-fit:cover;border-radius:4px;border:1px solid #e5e3da;display:block;" />` : `<div style="width:56px;height:56px;border-radius:4px;border:1px solid #e5e3da;background:#FAFAF6;"></div>`}
                  </td>
                  <td style="vertical-align:top;padding:6px 0;">
                    <div style="font-size:13px;font-weight:600;color:#141414;">${escapeHtml(s.productName || s.category || 'Selection')}</div>
                    <div style="font-size:12px;color:#666;margin-top:2px;">
                      ${s.vendor ? `<span>${escapeHtml(s.vendor)}</span>` : ''}
                      ${s.vendor && (s.category || s.description) ? ' · ' : ''}
                      ${s.category ? `<span>${escapeHtml(s.category)}</span>` : ''}
                      ${s.category && s.description ? ' · ' : ''}
                      ${s.description ? `<span>${escapeHtml(s.description)}</span>` : ''}
                    </div>
                    ${s.productUrl ? `<div style="margin-top:4px;"><a href="${s.productUrl}" style="font-size:12px;color:#8a6a2c;text-decoration:underline;">View product</a></div>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`
      : '';
    const body = scopeHtml + noteHtml + plansHtml + selectionsHtml;
    return `
      <div style="background:#FAFAF6;border-left:3px solid #C9A96E;padding:14px 18px;margin:12px 0;border-radius:0 4px 4px 0;">
        <div style="font-weight:600;font-size:15px;color:#141414;margin-bottom:4px;">${escapeHtml(td.trade)}</div>
        ${body || '<div style="font-size:13px;color:#666;">See full scope in your portal.</div>'}
      </div>
    `;
  }).join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #222;">
      <div style="border-bottom: 3px solid #C9A96E; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin:0;color:#141414;font-size:18px;">New bid request — ${escapeHtml(projectName)}</h2>
      </div>
      ${fromLine}
      <p style="font-size:15px;line-height:1.55;">Hi ${escapeHtml(vendorName)},</p>
      <p style="font-size:15px;line-height:1.55;">Skyeline Homes is requesting bids on the following trade${trades.length === 1 ? '' : 's'} for <strong>${escapeHtml(projectName)}</strong>. The scope, instructions, and plans for each are below — open the portal to submit your bid.</p>
      ${tradeSections}
      <p style="margin:28px 0;">
        <a href="${link}" style="background:#C9A96E;color:#141414;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:600;display:inline-block;font-size:15px;">Submit your bid / Enviar su oferta</a>
      </p>
      <p style="color:#777;font-size:13px;margin:0 0 4px 0;">First time bidding with Skyeline? The button above will walk you through a quick sign-up and required document upload (W-9, Certificate of Insurance, Subcontractor Agreement).</p>
      <p style="color:#777;font-size:13px;margin:0 0 24px 0;">Español: Skyeline Homes solicita ofertas para ${trades.length === 1 ? 'el siguiente oficio' : 'los siguientes oficios'} de <strong>${escapeHtml(projectName)}</strong>. El alcance, las instrucciones y los planos de cada uno aparecen arriba. ¿Primera vez ofertando con Skyeline? El botón lo guiará para registrarse y subir sus documentos (W-9, Certificado de Seguro, Acuerdo de Subcontratista).</p>
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0 12px 0;">
      <p style="font-size:11px;color:#999;text-align:center;margin:0;">Skyeline Homes · This is an automated notification. / Esta es una notificación automática.</p>
    </div>
  `;
}

function buildPackageEmailText(args: {
  vendorName: string;
  projectName: string;
  trades: string[];
  tradeDetails: TradeDetail[];
  link: string;
  requesterName?: string;
}): string {
  const { vendorName, projectName, trades, tradeDetails, link, requesterName } = args;
  const tradeBlocks: string[] = [];
  for (const td of tradeDetails) {
    tradeBlocks.push(`--- ${td.trade} ---`);
    if (td.scope) {
      tradeBlocks.push(`Scope of Work:`);
      tradeBlocks.push(td.scope);
    }
    if (td.callouts) {
      tradeBlocks.push(`Notes:`);
      tradeBlocks.push(td.callouts);
    }
    if (td.plans && td.plans.length > 0) {
      tradeBlocks.push(`Plans / Documents:`);
      for (const p of td.plans) {
        tradeBlocks.push(`  • ${p.name} — ${p.url}`);
      }
    }
    if (td.selections && td.selections.length > 0) {
      tradeBlocks.push(`Selections for ${td.trade}:`);
      for (const s of td.selections) {
        const bits = [s.productName || s.category || 'Selection'];
        if (s.vendor) bits.push(s.vendor);
        if (s.description) bits.push(s.description);
        const line = bits.join(' — ');
        tradeBlocks.push(`  • ${line}${s.productUrl ? ` (${s.productUrl})` : ''}`);
      }
    }
    tradeBlocks.push('');
  }
  return [
    `Hi ${vendorName},`,
    '',
    `Skyeline Homes is requesting bids on the following trade${trades.length === 1 ? '' : 's'} for ${projectName}:`,
    ...trades.map(t => `  • ${t}`),
    '',
    ...tradeBlocks,
    `Open the full scope and submit your bid through your Skyeline Subcontractor Portal:`,
    `→ ${link}`,
    '',
    `First time bidding with Skyeline? The link above will walk you through a quick sign-up and required document upload (W-9, Certificate of Insurance, Subcontractor Agreement).`,
    '',
    `Thanks,`,
    requesterName || 'The Skyeline Homes Team',
    '',
    '— — — — — — — — — — Español — — — — — — — — — —',
    '',
    `Hola ${vendorName},`,
    '',
    `Skyeline Homes solicita ofertas para ${trades.length === 1 ? 'el siguiente oficio' : 'los siguientes oficios'} de ${projectName}: ${trades.join(', ')}. El alcance, las notas y los planos de cada oficio aparecen arriba.`,
    '',
    `Abra el alcance completo y envíe su oferta a través de su Portal de Subcontratistas de Skyeline:`,
    `→ ${link}`,
    '',
    `¿Primera vez ofertando con Skyeline? El enlace de arriba lo guiará para registrarse y subir sus documentos (W-9, Certificado de Seguro, Acuerdo de Subcontratista).`,
    '',
    `Gracias,`,
    requesterName || 'El equipo de Skyeline Homes',
  ].join('\n');
}

// Bytes → human-readable size for plan download buttons.
function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function buildPackageSms(args: {
  vendorName: string;
  projectName: string;
  trades: string[];
  link: string;
}): string {
  const { projectName, trades, link } = args;
  const tradeList = trades.length === 1 ? trades[0] : `${trades.length} trades (${trades.join(', ')})`;
  return `Skyeline Homes bid request — ${tradeList} on ${projectName}. Submit in your portal: ${link} · Solicitud de oferta de Skyeline — ${tradeList} en ${projectName}. Envíe en su portal.`;
}

export function registerBidPackageDispatchRoute(
  app: Express,
  db: admin.firestore.Firestore,
) {
  app.post('/api/bid-packages/dispatch', async (req: any, res: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sign in required' });
      }
      const decoded = await admin.auth().verifyIdToken(authHeader.substring(7));
      const senderUid = decoded.uid;

      const userSnap = await db.collection('users').doc(senderUid).get();
      const role = userSnap.exists ? (userSnap.data() as any).role : null;
      if (!role || !STAFF_ROLES.has(String(role))) {
        return res.status(403).json({ error: 'Only staff can dispatch bid packages' });
      }

      const data = (req.body || {}) as DispatchPayload;
      if (!data.projectId || !data.bidPackageId) {
        return res.status(400).json({ error: 'Missing projectId or bidPackageId' });
      }

      // Load the bidPackage parent
      const pkgRef = db.collection('projects').doc(data.projectId).collection('bidPackages').doc(data.bidPackageId);
      const pkgSnap = await pkgRef.get();
      if (!pkgSnap.exists) {
        return res.status(404).json({ error: 'Bid package not found' });
      }
      const pkg = pkgSnap.data() as any;

      // Load every bidRequest under this package
      const reqSnap = await db
        .collection('projects')
        .doc(data.projectId)
        .collection('bidRequests')
        .where('bidPackageId', '==', data.bidPackageId)
        .get();

      if (reqSnap.empty) {
        return res.status(404).json({ error: 'No bid requests found for this package' });
      }

      // Group vendors across trades. Dedup by contactId (preferred) or email.
      // The package's bidRequests are written client-side and don't always
      // carry an inviteToken — without one the magic link is dead. Mint and
      // persist a token (+ its public lookup doc) whenever it's missing.
      const tokenExpiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 90 * 86_400_000));
      const tokenWrites: Promise<any>[] = [];
      const bundles = new Map<string, VendorBundle>();
      for (const doc of reqSnap.docs) {
        const br = doc.data() as any;
        const trade = String(br.trade || '').trim();
        if (!trade) continue;
        const vendors = (br.vendors as VendorEntry[]) || [];
        let vendorsMutated = false;
        for (let i = 0; i < vendors.length; i++) {
          const v = vendors[i];
          let token = String(v.inviteToken || '').trim();
          if (!token) {
            token = generateInviteToken();
            v.inviteToken = token;
            vendorsMutated = true;
            tokenWrites.push(
              db.collection('bidInviteTokens').doc(token).set({
                token,
                projectId: data.projectId,
                bidRequestId: doc.id,
                vendorIndex: i,
                vendorName: v.vendorName,
                contactId: v.contactId || null,
                vendorEmail: v.email || null,
                expiresAt: tokenExpiresAt,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
              }),
            );
          }
          const key = v.contactId || (v.email ? v.email.toLowerCase().trim() : `${v.vendorName}|${token}`);
          let bundle = bundles.get(key);
          if (!bundle) {
            bundle = {
              key,
              vendorName: v.vendorName,
              email: v.email,
              phone: v.phone,
              trades: [],
              tradeDetails: [],
              primaryToken: token,
              bidRequestIds: [],
            };
            bundles.set(key, bundle);
          }
          if (!bundle.primaryToken) bundle.primaryToken = token;
          if (!bundle.trades.includes(trade)) {
            bundle.trades.push(trade);
            // Capture scope + callouts + plans for THIS trade so the email
            // can render per-trade specifics (Tyler's "use SIPs, IceWatershield
            // up 6 inches" style instructions live in scope or callouts).
            const planArr = Array.isArray(br.plans) ? (br.plans as any[]) : [];
            const cleanPlans: PlanRef[] = planArr
              .filter(p => p && typeof p.url === 'string' && p.url)
              .map(p => ({
                name: typeof p.name === 'string' && p.name ? p.name : 'Plan',
                url: String(p.url),
                storagePath: typeof p.storagePath === 'string' ? p.storagePath : undefined,
                size: typeof p.size === 'number' ? p.size : undefined,
              }));
            const attachedSelIds: string[] = Array.isArray(br.attachedSelectionIds)
              ? (br.attachedSelectionIds as any[]).filter(x => typeof x === 'string') as string[]
              : [];
            // Stash IDs onto the TradeDetail so we can resolve them in one
            // pass after the bundling loop. We swap them out for SelectionRef
            // objects before the email build.
            bundle.tradeDetails.push({
              trade,
              scope: typeof br.scope === 'string' && br.scope.trim() ? br.scope.trim() : undefined,
              callouts: typeof br.callouts === 'string' && br.callouts.trim() ? br.callouts.trim() : undefined,
              plans: cleanPlans.length > 0 ? cleanPlans : undefined,
              selections: attachedSelIds.length > 0
                ? attachedSelIds.map(id => ({ id })) // placeholder, resolved below
                : undefined,
            });
          }
          if (!bundle.bidRequestIds.includes(doc.id)) bundle.bidRequestIds.push(doc.id);
        }
        // Persist newly-minted tokens back onto the bidRequest's vendors array.
        if (vendorsMutated) tokenWrites.push(doc.ref.update({ vendors }));
      }
      // Tokens must be resolvable before we email their links.
      if (tokenWrites.length) {
        try {
          await Promise.all(tokenWrites);
        } catch (e: any) {
          console.error('[bidPackageDispatch] token persistence failed:', e?.message || e);
        }
      }

      // Resolve attached selection IDs → public-safe SelectionRef objects.
      // We collect all unique IDs across every bundle's tradeDetails so we
      // hit Firestore once per ID instead of once per (vendor, trade).
      const allSelIds = new Set<string>();
      for (const bundle of bundles.values()) {
        for (const td of bundle.tradeDetails) {
          for (const s of td.selections || []) {
            if (s.id) allSelIds.add(s.id);
          }
        }
      }
      const selectionMap = new Map<string, SelectionRef>();
      if (allSelIds.size > 0) {
        const fetches = Array.from(allSelIds).map(async id => {
          try {
            const snap = await db
              .collection('projects').doc(data.projectId)
              .collection('selections').doc(id)
              .get();
            if (!snap.exists) return;
            const d = snap.data() as any;
            const items: any[] = Array.isArray(d.items) ? d.items : [];
            const firstItem = items.find(i => i && i.status !== 'removed') || items[0] || {};
            const parts: string[] = [];
            if (firstItem.size) parts.push(String(firstItem.size));
            if (firstItem.tileLayout) parts.push(`Layout: ${firstItem.tileLayout}`);
            if (firstItem.grout) parts.push(`Grout: ${firstItem.grout}`);
            if (d.area) parts.push(String(d.area));
            if (d.room) parts.push(String(d.room));
            selectionMap.set(id, {
              id,
              category: typeof d.category === 'string' ? d.category : undefined,
              area: typeof d.area === 'string' ? d.area : undefined,
              room: typeof d.room === 'string' ? d.room : undefined,
              productName: typeof firstItem.productName === 'string' ? firstItem.productName : undefined,
              vendor: typeof firstItem.vendor === 'string' ? firstItem.vendor : undefined,
              description: parts.length > 0 ? parts.join(' · ') : undefined,
              imageUrl: Array.isArray(firstItem.imageUrls) && firstItem.imageUrls[0]
                ? String(firstItem.imageUrls[0])
                : undefined,
              productUrl: typeof firstItem.productUrl === 'string' ? firstItem.productUrl : undefined,
            });
          } catch (e: any) {
            console.warn('[bidPackageDispatch] selection fetch failed', id, e?.message || e);
          }
        });
        await Promise.all(fetches);
      }
      // Replace each TradeDetail.selections placeholder with resolved refs.
      for (const bundle of bundles.values()) {
        for (const td of bundle.tradeDetails) {
          if (!td.selections || td.selections.length === 0) continue;
          const resolved = td.selections
            .map(s => selectionMap.get(s.id))
            .filter((s): s is SelectionRef => !!s);
          td.selections = resolved.length > 0 ? resolved : undefined;
        }
      }

      const projectName = pkg.projectName || 'Skyeline project';
      const packageName = pkg.name || `Bid Package — ${projectName}`;
      const requesterName = data.requesterName || pkg.createdByName || undefined;

      // Resend + Twilio init (isolate Twilio init so a bad SID doesn't kill email).
      const appBaseUrl = normalizeBaseUrl(process.env.APP_BASE_URL);
      const resendKey = process.env.RESEND_API_KEY;
      const resendReady = !!resendKey;

      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_FROM_NUMBER;
      let twilioClient: ReturnType<typeof twilio> | null = null;
      if (twilioSid && twilioAuthToken && twilioFrom) {
        try {
          twilioClient = twilio(twilioSid, twilioAuthToken);
        } catch (e: any) {
          console.error('[bidPackageDispatch] Twilio init failed — SMS disabled:', e?.message || e);
          twilioClient = null;
        }
      }

      let sentEmails = 0;
      let sentSms = 0;
      const droppedNoContact: string[] = [];
      const perVendorResults: Array<any> = [];

      // Channel governance: honor the admin's 'bid_invitation' (audience: sub)
      // config — whether email/SMS are enabled and the SMS template. The branded
      // magic-link email HTML is preserved; config only gates it on/off.
      const inviteFlow = await loadFlowFor(db, 'bid_invitation', 'sub');
      const inviteStep = inviteFlow.steps?.[0];
      const allowInviteEmail = inviteFlow.enabled !== false && inviteStep?.channels?.email !== false;
      const allowInviteSms = inviteFlow.enabled !== false && inviteStep?.channels?.sms === true;

      for (const bundle of bundles.values()) {
        const link = `${appBaseUrl}/bid/respond/${bundle.primaryToken}`;
        const result: any = { vendorName: bundle.vendorName, trades: bundle.trades };

        if (!bundle.email && !bundle.phone) {
          droppedNoContact.push(`${bundle.vendorName} (${bundle.trades.join(', ')})`);
          result.skipped = 'no contact info';
          perVendorResults.push(result);
          continue;
        }

        if (bundle.email && resendReady && allowInviteEmail) {
          try {
            const resend = new Resend(resendKey);
            const { error: resendError } = await resend.emails.send({
              from: 'Skyeline Homes <tyler@skyelinehomes.com>',
              to: bundle.email,
              subject: `New bid request / Nueva solicitud de oferta — ${projectName}`,
              text: buildPackageEmailText({
                vendorName: bundle.vendorName,
                projectName,
                trades: bundle.trades,
                tradeDetails: bundle.tradeDetails,
                link,
                requesterName,
              }),
              html: buildPackageEmailHtml({
                vendorName: bundle.vendorName,
                projectName,
                trades: bundle.trades,
                tradeDetails: bundle.tradeDetails,
                link,
                requesterName,
                packageName,
              }),
            });
            if (resendError) {
              result.email = { sent: false, error: resendError.message };
            } else {
              result.email = { sent: true };
              sentEmails += 1;
            }
          } catch (e: any) {
            result.email = { sent: false, error: e?.message || String(e) };
          }
        } else if (bundle.email && !resendReady) {
          result.email = { sent: false, error: 'Resend not configured' };
        }

        if (bundle.phone && twilioClient && allowInviteSms) {
          const toNumber = toE164(bundle.phone);
          if (!toNumber) {
            result.sms = { sent: false, error: `Invalid phone "${bundle.phone}" (not E.164)` };
          } else if (await isSmsOptedOut(db, toNumber)) {
            result.sms = { sent: false, error: 'Recipient opted out (STOP)' };
          } else {
            try {
              // Use the admin's SMS template when set, else the built-in copy.
              const tpl = inviteStep?.smsBody?.trim();
              const body = tpl
                ? renderTemplate(tpl, {
                    vendorName: bundle.vendorName,
                    projectName,
                    trade: bundle.trades.join(', '),
                    magicLink: link,
                    link,
                  })
                : buildPackageSms({ vendorName: bundle.vendorName, projectName, trades: bundle.trades, link });
              await twilioClient.messages.create({ from: twilioFrom!, to: toNumber, body });
              result.sms = { sent: true };
              sentSms += 1;
            } catch (e: any) {
              result.sms = { sent: false, error: e?.message || String(e) };
            }
          }
        } else if (bundle.phone && twilioClient && !allowInviteSms) {
          result.sms = { sent: false, error: 'Bid-invite SMS disabled in Settings → Triggers' };
        }
        perVendorResults.push(result);
      }

      // Persist dispatch summary on the bidPackage doc for audit / dashboard.
      await pkgRef.set({
        dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
        dispatchedBy: senderUid,
        dispatchSummary: {
          uniqueVendors: bundles.size,
          sentEmails,
          sentSms,
          droppedNoContact,
        },
      }, { merge: true });

      return res.json({
        ok: true,
        uniqueVendors: bundles.size,
        sentEmails,
        sentSms,
        droppedNoContact,
        results: perVendorResults,
      });
    } catch (e: any) {
      console.error('bid-packages dispatch error:', e);
      return res.status(500).json({ error: e?.message || 'Internal error' });
    }
  });
}
