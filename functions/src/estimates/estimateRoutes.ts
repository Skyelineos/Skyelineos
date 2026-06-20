// Estimate sending + client-response routes.
//
//   POST /api/estimates/:id/send-to-client
//     GC/PM/admin sends an estimate to the homeowner. Updates the estimate
//     doc to status='sent' + sentAt/sentTo/sentBy/sentByName, optionally
//     attaches a generated PDF (downloaded from Storage by storagePath, then
//     base64-encoded for SendGrid), and fires the 'estimate_sent' notification.
//
//   POST /api/estimates/:id/client-response
//     The project's homeowner responds to a sent estimate (approve / decline
//     / request changes). estimates/{id} has a GC-only Firestore write rule,
//     so the homeowner cannot write directly — this server endpoint
//     verifies the caller is on the client_of_project audience and writes
//     status + clientResponseAt + clientResponseMessage on their behalf.
//
// Both routes inherit the /api authMiddleware gate in functions/src/index.ts
// (Stream 1) — req.user is a verified Firebase ID token before we run.
//
// Modeled on functions/src/bids/bidPackageDispatchRoute.ts (SendGrid pattern)
// and functions/src/tasks/signoffRoute.ts (transactional update + audit row).

/* eslint-disable import/namespace */
// ^ firebase-admin's `admin.storage` / `admin.firestore` namespaces don't resolve
//   under the root eslint import-plugin config (false positive); tsc validates them.
import type { Express } from 'express';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { fireTriggerForMany } from '../notifications/fireTrigger';
import { resolveClientOfProject } from '../notifications/audienceResolvers';

const STAFF_ROLES = new Set(['admin', 'gc', 'projectManager']);
// Estimates carry internal cost/margin data, so the Firestore read rule is
// GC-only. The Designer Portal needs allowance amounts to set selection
// budgets — but designers must NOT see subCost/margins. This server endpoint
// reads via the Admin SDK and returns ONLY the client-facing allowance lines.
const DESIGN_READ_ROLES = new Set([
  'admin',
  'gc',
  'projectManager',
  'designer',
]);

function normalizeRole(raw: any): string {
  const r = String(raw || '')
    .toLowerCase()
    .replace(/_/g, '');
  if (r === 'admin') return 'admin';
  if (r === 'gc') return 'gc';
  if (r === 'projectmanager' || r === 'pm') return 'projectManager';
  return r;
}

function normalizeBaseUrl(raw?: string): string {
  let u = (raw || '').trim();
  if (!u) u = 'https://skyelineos.web.app';
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtCurrency(amount: number | undefined | null): string {
  const n = typeof amount === 'number' ? amount : Number(amount || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

interface SendBody {
  pdfStoragePath?: string;
  pdfDownloadUrl?: string;
  recipientEmail?: string;
  message?: string;
}

interface ClientResponseBody {
  action?: 'approve' | 'decline' | 'request_changes';
  message?: string;
}

// SendGrid attachment cap: 30 MB total per email. Our generated estimate PDFs
// are tiny (single-digit KB), but we still guard against an unexpectedly large
// file by falling back to a download-link email.
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB safety cap

export function registerEstimateRoutes(
  app: Express,
  db: admin.firestore.Firestore
): void {
  // POST /api/estimates/:id/send-to-client
  app.post('/api/estimates/:id/send-to-client', async (req: any, res: any) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'estimate id required' });

      const uid: string | undefined = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'No uid' });

      const profile = req.userProfile || {};
      const role = normalizeRole(profile.role);
      if (!STAFF_ROLES.has(role)) {
        return res
          .status(403)
          .json({ error: 'Only GC, PM, or admin can send estimates.' });
      }
      const byName: string =
        profile.name ||
        profile.displayName ||
        req.user?.name ||
        req.user?.email ||
        'Skyeline OS';

      const body: SendBody = req.body || {};
      const pdfStoragePath =
        typeof body.pdfStoragePath === 'string'
          ? body.pdfStoragePath.trim()
          : '';
      const pdfDownloadUrl =
        typeof body.pdfDownloadUrl === 'string'
          ? body.pdfDownloadUrl.trim()
          : '';
      const messageNote =
        typeof body.message === 'string' ? body.message.trim() : '';

      const estRef = db.collection('estimates').doc(id);
      const estSnap = await estRef.get();
      if (!estSnap.exists)
        return res.status(404).json({ error: 'Estimate not found' });
      const estimate = estSnap.data() as any;
      const projectId: string = String(estimate.projectId || '');
      const title: string = String(estimate.title || 'Estimate');
      const totalAmount: number = Number(estimate.totalAmount || 0);

      // Load project for recipient fallback + display name.
      let project: any = null;
      if (projectId) {
        const projSnap = await db.collection('projects').doc(projectId).get();
        if (projSnap.exists) project = projSnap.data();
      }
      const projectName: string = String(
        project?.name || estimate.projectName || 'your project'
      );

      // Recipient resolution: explicit body.recipientEmail > project.clientEmail >
      // first project clientId -> contacts/{id}.email.
      let recipientEmail =
        typeof body.recipientEmail === 'string'
          ? body.recipientEmail.trim()
          : '';
      if (!recipientEmail && project?.clientEmail)
        recipientEmail = String(project.clientEmail);
      if (!recipientEmail && estimate.clientEmail)
        recipientEmail = String(estimate.clientEmail);
      if (!recipientEmail) {
        const ids: string[] = [];
        const raw = project?.clientIds;
        if (Array.isArray(raw))
          raw.forEach((v: any) => {
            if (v) ids.push(String(v));
          });
        else if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed))
              parsed.forEach((v: any) => {
                if (v) ids.push(String(v));
              });
          } catch {
            /* not JSON */
          }
        }
        if (project?.clientContactId) ids.push(String(project.clientContactId));
        if (estimate.clientId) ids.push(String(estimate.clientId));
        for (const cid of ids) {
          try {
            const c = await db.collection('contacts').doc(cid).get();
            if (c.exists) {
              const ce = (c.data() as any)?.email;
              if (ce) {
                recipientEmail = String(ce);
                break;
              }
            }
          } catch {
            /* skip */
          }
        }
      }
      if (!recipientEmail) {
        return res
          .status(400)
          .json({
            error:
              'No recipient email — set the project client email or pass recipientEmail in the request.',
          });
      }

      // SendGrid init (mirror bidPackageDispatchRoute).
      const sendgridKey = process.env.SENDGRID_API_KEY;
      const sendgridFrom = process.env.SENDGRID_FROM_EMAIL;
      const sendgridReady = !!(sendgridKey && sendgridFrom);
      if (sendgridReady) sgMail.setApiKey(sendgridKey!);

      // Optionally fetch the PDF from Storage so we can attach it directly.
      let attachment:
        | {
            content: string;
            filename: string;
            type: string;
            disposition: string;
          }
        | undefined;
      let attachmentSkippedReason: string | undefined;
      if (pdfStoragePath) {
        try {
          const bucket = admin.storage().bucket();
          const file = bucket.file(pdfStoragePath);
          const [exists] = await file.exists();
          if (!exists) {
            attachmentSkippedReason = `Storage object not found: ${pdfStoragePath}`;
          } else {
            const [meta] = await file.getMetadata();
            const size = Number(meta.size || 0);
            if (size > MAX_ATTACHMENT_BYTES) {
              attachmentSkippedReason = `PDF too large to attach (${size} bytes) — using download link instead.`;
            } else {
              const [buf] = await file.download();
              attachment = {
                content: buf.toString('base64'),
                filename: `${(title || 'estimate').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 60)}.pdf`,
                type: 'application/pdf',
                disposition: 'attachment',
              };
            }
          }
        } catch (e: any) {
          attachmentSkippedReason =
            e?.message || 'Failed to fetch PDF for attachment';
          console.warn(
            '[sendEstimate] attachment fetch failed:',
            attachmentSkippedReason
          );
        }
      }

      const appBaseUrl = normalizeBaseUrl(process.env.APP_BASE_URL);
      // Deep-link directly to the Estimates tab inside the client portal,
      // with the estimate id as a query so the tab can scroll/open the specific
      // card. The mounted SPA route is `/client-portal/:tab*` — `/client` was a
      // wrong-path link that produced a blank screen in earlier sends.
      const portalLink = `${appBaseUrl}/client-portal/estimates?estimateId=${encodeURIComponent(id)}`;

      const subject = `Estimate from Skyeline Homes — ${projectName}`;
      const noteBlock = messageNote
        ? `\n\nA note from ${byName}:\n${messageNote}\n`
        : '';
      const linkLine =
        !attachment && pdfDownloadUrl
          ? `\n\nDownload PDF: ${pdfDownloadUrl}`
          : '';
      const text =
        `Hi,\n\n${byName} prepared an estimate for ${projectName}.\n\n` +
        `Estimate: ${title}\nTotal: ${fmtCurrency(totalAmount)}` +
        noteBlock +
        `\n\nReview, approve, or request changes in your Skyeline portal:\n${portalLink}` +
        linkLine +
        `\n\n— Skyeline Homes`;
      const htmlNoteBlock = messageNote
        ? `<p style="margin:16px 0;color:#374151;white-space:pre-line">${escapeHtml(messageNote)}</p>`
        : '';
      const htmlAttachLine =
        !attachment && pdfDownloadUrl
          ? `<p style="margin:12px 0"><a href="${escapeHtml(pdfDownloadUrl)}" style="color:#C9A96E;font-weight:600">Download PDF</a></p>`
          : '';
      const html = `
<div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#141414">
  <h1 style="font-size:22px;margin:0 0 8px 0;color:#141414">Your estimate is ready</h1>
  <p style="margin:0 0 16px 0;color:#374151">${escapeHtml(byName)} prepared an estimate for <strong>${escapeHtml(projectName)}</strong>.</p>
  <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:16px 0;background:#fafafa">
    <div style="font-weight:600;font-size:16px;color:#141414">${escapeHtml(title)}</div>
    <div style="margin-top:6px;color:#6b7280;font-size:14px">Total: <strong style="color:#141414">${escapeHtml(fmtCurrency(totalAmount))}</strong></div>
  </div>
  ${htmlNoteBlock}
  ${htmlAttachLine}
  <p style="margin:24px 0 8px 0">Review, approve, or request changes in your portal:</p>
  <p style="margin:0 0 24px 0">
    <a href="${escapeHtml(portalLink)}"
       style="display:inline-block;background:#C9A96E;color:#141414;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:8px">
      Open Skyeline portal
    </a>
  </p>
  <p style="color:#6b7280;font-size:12px;margin-top:32px">Skyeline Homes</p>
</div>`;

      let emailSent = false;
      let emailError: string | undefined;
      if (sendgridReady) {
        try {
          await sgMail.send({
            to: recipientEmail,
            from: sendgridFrom!,
            subject,
            text,
            html,
            ...(attachment ? { attachments: [attachment] } : {}),
          });
          emailSent = true;
        } catch (e: any) {
          emailError = e?.message || String(e);
          console.error('[sendEstimate] sendgrid error:', emailError);
        }
      } else {
        emailError =
          'SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL missing).';
      }

      // Update estimate doc.
      const now = admin.firestore.FieldValue.serverTimestamp();
      const update: Record<string, any> = {
        status: 'sent',
        sentAt: now,
        sentTo: recipientEmail,
        sentBy: uid,
        sentByName: byName,
        updatedAt: now,
      };
      if (pdfStoragePath) update.pdfStoragePath = pdfStoragePath;
      if (pdfDownloadUrl) update.pdfDownloadUrl = pdfDownloadUrl;
      if (messageNote) update.lastSendMessage = messageNote;
      await estRef.update(update);

      // Audit row.
      try {
        await estRef.collection('estimateSends').add({
          recipientEmail,
          sentBy: uid,
          sentByName: byName,
          pdfStoragePath: pdfStoragePath || null,
          pdfDownloadUrl: pdfDownloadUrl || null,
          message: messageNote || null,
          emailSent,
          emailError: emailError || null,
          attachmentSkippedReason: attachmentSkippedReason || null,
          createdAt: now,
        });
      } catch (e: any) {
        console.warn('[sendEstimate] audit row write failed:', e?.message || e);
      }

      // Fire the 'estimate_sent' in-app notification to the project's clients.
      if (projectId) {
        try {
          const recipients = await resolveClientOfProject(db, projectId);
          if (recipients.length > 0) {
            await fireTriggerForMany(
              {
                db,
                triggerKey: 'estimate_sent',
                audience: 'client',
                variables: {
                  projectName,
                  title,
                  amount: fmtCurrency(totalAmount),
                  link: portalLink,
                },
                projectId,
                fromUserName: byName,
              },
              recipients
            );
          }
        } catch (e: any) {
          console.warn('[sendEstimate] fireTrigger failed:', e?.message || e);
        }
      }

      return res.json({
        ok: true,
        estimateId: id,
        status: 'sent',
        sentTo: recipientEmail,
        emailSent,
        emailError: emailError || null,
        attachmentSkippedReason: attachmentSkippedReason || null,
      });
    } catch (e: any) {
      console.error('[sendEstimate] route error:', e?.message || e, e?.stack);
      return res.status(500).json({ error: e?.message || 'Send failed' });
    }
  });

  // POST /api/estimates/:id/client-response
  app.post('/api/estimates/:id/client-response', async (req: any, res: any) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'estimate id required' });

      const uid: string | undefined = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'No uid' });
      const profile = req.userProfile || {};
      const byName: string =
        profile.name ||
        profile.displayName ||
        req.user?.name ||
        req.user?.email ||
        'Client';

      const body: ClientResponseBody = req.body || {};
      const action = body.action;
      if (
        action !== 'approve' &&
        action !== 'decline' &&
        action !== 'request_changes'
      ) {
        return res
          .status(400)
          .json({
            error: "action must be 'approve', 'decline', or 'request_changes'",
          });
      }
      const message =
        typeof body.message === 'string' ? body.message.trim() : '';
      if (action === 'request_changes' && message.length === 0) {
        return res
          .status(400)
          .json({
            error: 'A message describing the requested changes is required.',
          });
      }

      const estRef = db.collection('estimates').doc(id);
      const estSnap = await estRef.get();
      if (!estSnap.exists)
        return res.status(404).json({ error: 'Estimate not found' });
      const estimate = estSnap.data() as any;
      const projectId: string = String(estimate.projectId || '');
      if (!projectId) {
        return res
          .status(400)
          .json({
            error: 'Estimate has no projectId — cannot verify membership.',
          });
      }
      const currentStatus = String(estimate.status || '');
      if (currentStatus !== 'sent') {
        return res
          .status(409)
          .json({
            error: `Estimate is not awaiting a response (current: ${currentStatus}).`,
          });
      }

      // Verify caller is on this project's client audience (or is staff
      // acting on behalf — staff also get the read pass to test the flow).
      const role = normalizeRole(profile.role);
      let allowed = STAFF_ROLES.has(role);
      if (!allowed) {
        try {
          const clientUids = await resolveClientOfProject(db, projectId);
          allowed = clientUids.includes(uid);
        } catch (e: any) {
          console.warn(
            '[clientResponse] resolveClientOfProject failed:',
            e?.message || e
          );
        }
      }
      if (!allowed) {
        return res
          .status(403)
          .json({
            error: 'You are not authorized to respond to this estimate.',
          });
      }

      const newStatus =
        action === 'approve'
          ? 'accepted'
          : action === 'decline'
            ? 'rejected'
            : 'revised';

      const now = admin.firestore.FieldValue.serverTimestamp();
      const update: Record<string, any> = {
        status: newStatus,
        clientResponseAt: now,
        clientResponseBy: uid,
        clientResponseByName: byName,
        clientResponseAction: action,
        updatedAt: now,
      };
      if (message) update.clientResponseMessage = message;
      await estRef.update(update);

      // Audit row.
      try {
        await estRef.collection('estimateClientResponses').add({
          action,
          newStatus,
          by: uid,
          byName,
          message: message || null,
          createdAt: now,
        });
      } catch (e: any) {
        console.warn(
          '[clientResponse] audit row write failed:',
          e?.message || e
        );
      }

      return res.json({
        ok: true,
        estimateId: id,
        status: newStatus,
        action,
      });
    } catch (e: any) {
      console.error('[clientResponse] route error:', e?.message || e, e?.stack);
      return res.status(500).json({ error: e?.message || 'Response failed' });
    }
  });

  // GET /api/projects/:projectId/allowances
  // Designer Portal budget link: the project's estimate "allowance" lines
  // (LineItem.lineStatus === 'allow'), stripped to client-facing fields only.
  // Internal subCost / markup / margins are intentionally NOT returned, so a
  // designer can set a selection's allowance without seeing builder costs.
  app.get('/api/projects/:projectId/allowances', async (req: any, res: any) => {
    try {
      const projectId = String(req.params.projectId || '').trim();
      if (!projectId)
        return res.status(400).json({ error: 'projectId required' });

      const uid: string | undefined = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'No uid' });
      const role = normalizeRole((req.userProfile || {}).role);
      if (!DESIGN_READ_ROLES.has(role)) {
        return res
          .status(403)
          .json({ error: 'Not authorized to read allowances.' });
      }

      const snap = await db
        .collection('estimates')
        .where('projectId', '==', projectId)
        .get();

      const allowances: Array<{
        estimateId: string;
        estimateTitle: string;
        lineId: string;
        trade: string;
        description: string;
        amount: number;
      }> = [];

      snap.forEach((docSnap) => {
        const est = docSnap.data() as any;
        // Skip rejected/archived estimates — only live ones inform allowances.
        if (est.status === 'rejected') return;
        const items = Array.isArray(est.lineItems) ? est.lineItems : [];
        for (const li of items) {
          if (li && li.lineStatus === 'allow') {
            allowances.push({
              estimateId: docSnap.id,
              estimateTitle: String(est.title || 'Estimate'),
              lineId: String(li.id || ''),
              trade: String(li.trade || ''),
              description: String(li.description || ''),
              amount: Number(li.total) || 0, // client-facing total only
            });
          }
        }
      });

      return res.json({ ok: true, allowances });
    } catch (e: any) {
      console.error('[allowances] route error:', e?.message || e);
      return res
        .status(500)
        .json({ error: e?.message || 'Failed to load allowances' });
    }
  });
}
