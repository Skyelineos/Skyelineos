// AP Invoice Email Scanner
// ========================
//
// Scans the connected Gmail account for emails from the last 48 hours that
// look like invoices / bills. For each unprocessed candidate:
//   1. Extracts sender, subject, body text, and any PDF/image attachments.
//   2. Uploads attachments to Firebase Storage at ap-invoices/{YYYY-MM}/{msgId}/{filename}.
//   3. Calls Claude Haiku to classify vendor, amount, dates, job, trade, and confidence.
//   4. Writes a record to the `ap_invoices` Firestore collection.
//   5. Sends a Telegram review prompt for medium/low confidence invoices.
//
// Exports:
//   scanInvoices(db)   — shared async logic (used by both route + scheduled fn)
//   scheduledApScan    — Firebase onSchedule function (every 30 min)

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { google } from 'googleapis';
// Anthropic import removed — scanner is now zero-token (uses deterministic classifyInvoice)
import { getAuthorizedClient } from '../ingestionLab/googleClient';
import { extractInvoiceFromStoragePath } from './pdfExtractor';
import { classifyInvoice } from './invoiceClassifier';

// admin.initializeApp() is called in index.ts — do not call here

// ── Secret refs ──────────────────────────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = defineSecret('TELEGRAM_CHAT_ID');
const GOOGLE_CLIENT_ID_SECRET = defineSecret('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET_SECRET = defineSecret('GOOGLE_CLIENT_SECRET');

// ── Constants ─────────────────────────────────────────────────────────────────
export const KNOWN_PROJECTS = [
  'Maple Manor',
  'Maple Lakes',
  'Rosecroft',
  'Crestview Solace',
  'Belmont',
  'Montclair',
  'Carrington',
  'Cascade',
  'Ashford',
];

export const VALID_TRADES = [
  'Framing',
  'Concrete',
  'Electrical',
  'Plumbing',
  'HVAC',
  'Roofing',
  'Drywall',
  'Flooring',
  'Painting',
  'Landscaping',
  'Cabinets',
  'Countertops',
  'Windows',
  'Doors',
  'Insulation',
  'Excavation',
  'Foundation',
  'Masonry',
  'Tile',
  'Hardware',
  'Materials',
  'Subcontractor',
  'Professional Services',
  'Other',
];

const INVOICE_SUBJECT_KEYWORDS = [
  'invoice',
  'bill',
  'statement',
  'receipt',
  'payment due',
  'amount due',
  'please remit',
  'remittance',
  'purchase order',
];

const SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

// ── AP Invoice document shape ─────────────────────────────────────────────────
export interface ApInvoice {
  gmailMessageId: string;
  gmailThreadId: string;
  source: 'gmail_scan';
  vendor: string;
  amount: number | null;
  invoiceDate: string | null;
  dueDate: string | null;
  jobName: string | null;
  trade: string;
  confidence: 'high' | 'medium' | 'low';
  status: 'auto_approved' | 'pending_review' | 'approved' | 'rejected';
  paymentStatus: 'unpaid' | 'paid' | 'partial';
  paidDate: string | null;
  paidAmount: number | null;
  aiNotes: string;
  subject: string;
  fromEmail: string;
  fromName: string;
  attachmentPaths: string[];
  rawBodySnippet: string;
  createdAt: admin.firestore.FieldValue;
  updatedAt: admin.firestore.FieldValue;
  reviewedBy: string | null;
  reviewedAt: admin.firestore.Timestamp | null;
  telegramMessageId: number | null;
}

// ── Claude AI classification ──────────────────────────────────────────────────
interface AiClassification {
  vendor: string;
  amount: number | null;
  invoiceDate: string | null;
  dueDate: string | null;
  jobName: string | null;
  trade: string;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

// classifyWithClaude removed — replaced by deterministic classifyInvoice (zero tokens)

// ── Telegram notification ─────────────────────────────────────────────────────
async function sendTelegramInvoicePrompt(
  botToken: string,
  chatId: string,
  docId: string,
  invoice: Partial<ApInvoice> & { vendor: string },
): Promise<number | null> {
  const amt = invoice.amount != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(invoice.amount)
    : 'Unknown amount';

  const confidenceEmoji =
    invoice.confidence === 'high' ? '🟢' :
    invoice.confidence === 'medium' ? '🟡' : '🔴';

  const text =
    `📨 <b>AP Invoice — Needs Review</b>\n\n` +
    `<b>Vendor:</b> ${escHtml(invoice.vendor)}\n` +
    `<b>Amount:</b> ${amt}\n` +
    `<b>Job:</b> ${escHtml(invoice.jobName || 'Unknown')}\n` +
    `<b>Trade:</b> ${escHtml(invoice.trade || 'Other')}\n` +
    `<b>Confidence:</b> ${confidenceEmoji} ${invoice.confidence}\n` +
    `<b>Subject:</b> ${escHtml(invoice.subject || '')}\n` +
    `<b>From:</b> ${escHtml(invoice.fromName || '')} &lt;${escHtml(invoice.fromEmail || '')}&gt;\n` +
    `<b>Invoice Date:</b> ${invoice.invoiceDate || 'N/A'}\n` +
    `<b>Due Date:</b> ${invoice.dueDate || 'N/A'}\n\n` +
    `<i>${escHtml(invoice.aiNotes || '')}</i>`;

  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `ap_approve:${docId}` },
          { text: '❌ Reject', callback_data: `ap_reject:${docId}` },
        ],
        [
          { text: '✏️ Edit Job', callback_data: `ap_edit_job:${docId}` },
          { text: '🔧 Edit Trade', callback_data: `ap_edit_trade:${docId}` },
        ],
      ],
    },
  };

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data: any = await res.json();
    if (data.ok) return data.result?.message_id ?? null;
    console.error('[apScan] Telegram sendMessage failed:', data);
    return null;
  } catch (e: any) {
    console.error('[apScan] Telegram fetch error:', e?.message);
    return null;
  }
}

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Gmail helpers ─────────────────────────────────────────────────────────────

function getHeader(headers: any[], name: string): string {
  return (
    (headers || []).find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
  );
}

function extractEmail(rawFrom: string): string {
  const angle = rawFrom.match(/<([^>]+)>/);
  if (angle) return angle[1].trim();
  const bare = rawFrom.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return bare ? bare[0] : rawFrom;
}

function extractBodyText(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts && payload.parts.length) {
    const texts: string[] = [];
    for (const part of payload.parts) {
      const t = extractBodyText(part);
      if (t) texts.push(t);
    }
    if (texts.length) return texts.join('\n\n');
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return stripHtml(decodeBase64Url(payload.body.data));
  }
  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeBase64Url(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

interface AttachmentPart {
  filename: string;
  mimeType: string;
  attachmentId: string;
}

function findAttachmentParts(payload: any): AttachmentPart[] {
  const parts: AttachmentPart[] = [];
  function walk(p: any) {
    if (!p) return;
    if (p.filename && p.filename.length > 0 && p.body?.attachmentId) {
      const mime = p.mimeType || 'application/octet-stream';
      // Only download PDFs and supported images
      if (mime === 'application/pdf' || SUPPORTED_IMAGE_MIMES.has(mime)) {
        parts.push({ filename: p.filename, mimeType: mime, attachmentId: p.body.attachmentId });
      }
    }
    for (const child of p.parts || []) walk(child);
  }
  walk(payload);
  return parts;
}

function isLikelyInvoiceEmail(subject: string, attachmentFilenames: string[]): boolean {
  const subjectLower = subject.toLowerCase();
  if (INVOICE_SUBJECT_KEYWORDS.some((kw) => subjectLower.includes(kw))) return true;
  // Has a PDF attachment — could be an invoice even without a keyword subject
  if (attachmentFilenames.some((f) => f.toLowerCase().endsWith('.pdf'))) return true;
  return false;
}

// ── Main scanner function ─────────────────────────────────────────────────────
export interface ScanResult {
  newCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
  scannedCount: number;
}

export async function scanInvoices(
  db: FirebaseFirestore.Firestore,
  options: {
    telegramBotToken: string;
    telegramChatId: string;
    lookbackDays?: number; // default 2; pass 90 for historical backfill
  },
): Promise<ScanResult> {
  const result: ScanResult = { newCount: 0, skippedCount: 0, errorCount: 0, errors: [], scannedCount: 0 };

  // ── Authorize Gmail ───────────────────────────────────────────────────────
  let auth: any;
  try {
    auth = await getAuthorizedClient(db, 'gmail');
  } catch (e: any) {
    const msg = `Gmail auth failed: ${e?.message}`;
    console.error('[apScan]', msg);
    result.errors.push(msg);
    result.errorCount += 1;
    return result;
  }

  const gmail = google.gmail({ version: 'v1', auth });

  // ── Fetch live project names from Firestore ──────────────────────────
  let liveProjects: string[] = [];
  try {
    const projectsSnap = await db.collection('projects').get();
    liveProjects = projectsSnap.docs
      .map((d) => (d.data().name || d.data().projectName || '').trim())
      .filter(Boolean);
    if (liveProjects.length === 0) liveProjects = KNOWN_PROJECTS;
    console.log(`[apScan] Using ${liveProjects.length} projects for classification`);
  } catch {
    liveProjects = KNOWN_PROJECTS;
  }

  // ── Build query window (default 48h; configurable via lookbackDays) ──────────
  const lookbackMs = (options.lookbackDays ?? 2) * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - lookbackMs);
  const yyyy = cutoff.getFullYear();
  const mm = String(cutoff.getMonth() + 1).padStart(2, '0');
  const dd = String(cutoff.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}/${mm}/${dd}`;

  const keywordQuery = INVOICE_SUBJECT_KEYWORDS
    .map((kw) => (kw.includes(' ') ? `subject:"${kw}"` : `subject:${kw}`))
    .join(' OR ');
  const gmailQuery = `after:${dateStr} (${keywordQuery} OR filename:pdf)`;

  // ── List matching messages ─────────────────────────────────────────────────
  const messageIds: string[] = [];
  let pageToken: string | undefined = undefined;
  try {
    do {
      const listRes: any = await gmail.users.messages.list({
        userId: 'me',
        q: gmailQuery,
        maxResults: 100,
        ...(pageToken ? { pageToken } : {}),
      });
      for (const m of listRes.data.messages || []) {
        if (m.id) messageIds.push(m.id);
      }
      pageToken = listRes.data.nextPageToken || undefined;
    } while (pageToken);
  } catch (e: any) {
    const msg = `Gmail list failed: ${e?.message}`;
    console.error('[apScan]', msg);
    result.errors.push(msg);
    result.errorCount += 1;
    return result;
  }

  result.scannedCount = messageIds.length;
  console.log(`[apScan] Found ${messageIds.length} candidate messages`);

  const storage = admin.storage().bucket('skyelineos.firebasestorage.app');
  const nowYYYYMM = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  // ── Process each message ───────────────────────────────────────────────────
  for (const msgId of messageIds) {
    try {
      // Idempotency check
      const existing = await db
        .collection('ap_invoices')
        .where('gmailMessageId', '==', msgId)
        .limit(1)
        .get();
      if (!existing.empty) {
        result.skippedCount += 1;
        continue;
      }

      // Fetch full message
      const msg: any = await gmail.users.messages.get({
        userId: 'me',
        id: msgId,
        format: 'full',
      });

      const headers = msg.data.payload?.headers || [];
      const fromHeader = getHeader(headers, 'From');
      const subject = getHeader(headers, 'Subject');
      const dateHeader = getHeader(headers, 'Date');
      const fromEmail = extractEmail(fromHeader);
      const fromName = fromHeader.replace(/<[^>]+>/, '').trim().replace(/^"/, '').replace(/"$/, '').trim() || fromEmail;

      const bodyText = extractBodyText(msg.data.payload);
      const attachmentParts = findAttachmentParts(msg.data.payload);
      const attachmentFilenames = attachmentParts.map((p) => p.filename);

      // Filter: only process if it looks like an invoice
      if (!isLikelyInvoiceEmail(subject, attachmentFilenames)) {
        result.skippedCount += 1;
        continue;
      }

      // Download and store attachments
      const attachmentPaths: string[] = [];
      for (const part of attachmentParts) {
        try {
          const attRes: any = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: msgId,
            id: part.attachmentId,
          });
          if (attRes.data.data) {
            const buffer = Buffer.from(
              attRes.data.data.replace(/-/g, '+').replace(/_/g, '/'),
              'base64',
            );
            // Sanitize filename
            const safeFilename = part.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
            const safeMsgId = msgId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
            const storagePath = `ap-invoices/${nowYYYYMM}/${safeMsgId}/${safeFilename}`;
            const file = storage.file(storagePath);
            await file.save(buffer, {
              metadata: { contentType: part.mimeType },
              resumable: false,
            });
            attachmentPaths.push(storagePath);
          }
        } catch (attErr: any) {
          console.warn(`[apScan] attachment download failed for ${part.filename}:`, attErr?.message);
        }
      }

      // ── PDF text extraction — deterministic, no AI ───────────────────────────
      // Reads the PDF text layer directly (pdf-parse). No Claude vision call.
      // Only falls back to AI if text layer is empty (image-only PDF).
      let pdfOcr: { amount: number | null; invoiceDate: string | null; dueDate: string | null; vendor: string | null; confidence: 'high' | 'medium' | 'low' } | null = null;
      const firstPdf = attachmentPaths.find((p) =>
        /\.(pdf|jpg|jpeg|png|webp)$/i.test(p)
      );
      if (firstPdf) {
        const extracted = await extractInvoiceFromStoragePath(firstPdf, admin.storage());
        if (extracted) {
          pdfOcr = {
            amount: extracted.amount,
            invoiceDate: extracted.invoiceDate,
            dueDate: extracted.dueDate,
            vendor: extracted.vendor,
            confidence: extracted.confidence,
            rawText: extracted.rawText,  // passed to classifier for job matching
          } as any;
          if (extracted.amount) {
            console.warn(`[apScan] PDF text extracted amount $${extracted.amount} from ${firstPdf}`);
          }
        }
      }

      // ── Deterministic classification — zero tokens, zero AI cost ──────────────────
      const classified = classifyInvoice({
        fromName,
        fromEmail,
        subject,
        bodySnippet: bodyText.slice(0, 1500),
        attachmentFilenames,
        pdfText: pdfOcr ? (pdfOcr as any).rawText || '' : '',
        knownProjects: liveProjects,
      });

      // Merge: PDF extractor wins on amounts/dates; classifier wins on vendor/trade/job
      const classification: AiClassification = {
        vendor:      classified.vendor,
        amount:      pdfOcr?.amount      ?? null,
        invoiceDate: pdfOcr?.invoiceDate ?? null,
        dueDate:     pdfOcr?.dueDate     ?? null,
        jobName:     classified.jobName,
        trade:       classified.trade,
        confidence:  classified.confidence,
        notes:       classified.notes,
      };

      const status: ApInvoice['status'] =
        classification.confidence === 'high' ? 'auto_approved' : 'pending_review';

      // Write Firestore doc
      const docData: Omit<ApInvoice, 'telegramMessageId'> & { telegramMessageId: number | null } = {
        gmailMessageId: msgId,
        gmailThreadId: msg.data.threadId || '',
        source: 'gmail_scan',
        vendor: classification.vendor,
        amount: classification.amount,
        invoiceDate: classification.invoiceDate,
        dueDate: classification.dueDate,
        jobName: classification.jobName,
        trade: classification.trade,
        confidence: classification.confidence,
        status,
        paymentStatus: 'unpaid',   // tracked separately from review status
        paidDate: null,
        paidAmount: null,
        aiNotes: classification.notes,
        subject,
        fromEmail,
        fromName,
        attachmentPaths,
        rawBodySnippet: bodyText.slice(0, 500),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        reviewedBy: null,
        reviewedAt: null,
        telegramMessageId: null,
      };

      const docRef = await db.collection('ap_invoices').add(docData);
      result.newCount += 1;

      console.log(`[apScan] saved doc ${docRef.id} for msg ${msgId} — ${classification.vendor} / ${classification.trade} / ${status}`);

      // Send Telegram prompt for non-high-confidence invoices
      if (classification.confidence !== 'high') {
        const tgMsgId = await sendTelegramInvoicePrompt(
          options.telegramBotToken,
          options.telegramChatId,
          docRef.id,
          { ...docData } as any,
        );
        if (tgMsgId) {
          await docRef.update({ telegramMessageId: tgMsgId });
        }
      }
    } catch (e: any) {
      const errMsg = `${msgId}: ${e?.message || 'unknown'}`;
      console.error('[apScan] message processing error:', errMsg);
      result.errors.push(errMsg);
      result.errorCount += 1;
    }
  }

  console.log(
    `[apScan] done — scanned=${result.scannedCount} new=${result.newCount} skipped=${result.skippedCount} errors=${result.errorCount}`,
  );
  return result;
}

// ── Scheduled Cloud Function (every 30 minutes) ───────────────────────────────
export const scheduledApScan = onSchedule(
  {
    schedule: '*/30 * * * *',
    timeZone: 'America/Denver',
    secrets: [
      TELEGRAM_BOT_TOKEN,
      TELEGRAM_CHAT_ID,
      GOOGLE_CLIENT_ID_SECRET,
      GOOGLE_CLIENT_SECRET_SECRET,
    ],
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async () => {
    const db = admin.firestore();
    await scanInvoices(db, {
      telegramBotToken: TELEGRAM_BOT_TOKEN.value(),
      telegramChatId: TELEGRAM_CHAT_ID.value(),
    });
  },
);
