// Quick Expense Capture — Express routes for capturing, listing, updating, and
// reconciling expense records on a project. Mirrors the bills/analyzeBill.ts
// Claude vision OCR pattern so receipt photos snapped from the QuickExpenseFAB
// get auto-extracted (vendor / amount / date / line items) before the user
// confirms.
//
// All routes mount AFTER the /api authMiddleware gate in functions/src/index.ts,
// so req.user is always a verified Firebase ID token.
//
// Firestore layout: projects/{projectId}/expenses/{expenseId}
//
//   POST   /api/expenses/capture                     — extract + create
//   GET    /api/projects/:projectId/expenses         — list for a project
//   PATCH  /api/expenses/:expenseId                  — update / confirm / void
//   POST   /api/expenses/:expenseId/reconcile        — mark reconciled w/ QBO id

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { assignExpenseToDrawPeriod } from './drawRoutes';
import { pushExpenseToQbo } from '../qbo/expenseSync';
import { requireFinance } from '../middleware/rbac';
import {
  requireProjectAccess,
  requireExpenseProjectAccess,
} from '../middleware/requireProjectAccess';

// ── Types ────────────────────────────────────────────────────────────────────

type ExpenseCategory =
  | 'materials'
  | 'labor'
  | 'equipment'
  | 'fees'
  | 'subcontractor'
  | 'other';

type ExpenseStatus = 'pending' | 'reconciled' | 'void';

interface ExpenseLineItem {
  description: string;
  amount: number;
}

interface ExpenseRecord {
  id: string;
  projectId: string;
  projectName: string;
  vendor: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  description: string;
  drawNumber: number | null;
  tradeCategory: string;
  receiptImageUrl: string | null;
  receiptStoragePath: string | null;
  status: ExpenseStatus;
  qboTransactionId: string | null;
  qboMatchedAt: admin.firestore.Timestamp | null;
  qboSynced: boolean;
  qboSyncError: string | null;
  capturedBy: string;
  capturedAt: admin.firestore.Timestamp;
  notes: string;
  lineItems: ExpenseLineItem[];
}

interface ReceiptExtraction {
  vendor: string | null;
  amount: number | null;
  date: string | null; // YYYY-MM-DD
  description: string | null;
  category: ExpenseCategory | null;
  lineItems: ExpenseLineItem[];
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
}

interface CaptureRequestBody {
  projectId: string;
  projectName?: string;
  // Either provide an inline base64 image OR a pre-uploaded storage path.
  imageBase64?: string | null;
  imageMimeType?: string | null; // 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  storagePath?: string | null;
  // Optional manual overrides if the user typed the field before submitting.
  vendor?: string | null;
  amount?: number | null;
  date?: string | null;
  category?: ExpenseCategory | null;
  description?: string | null;
  drawNumber?: number | null;
  tradeCategory?: string | null;
  notes?: string | null;
}

// ── Claude vision OCR (same approach as bills/analyzeBill.ts) ────────────────

const SYSTEM_PROMPT = `You are an expert at extracting structured data from construction industry receipts and expense vouchers.

You will receive an image (photo) of a receipt. Extract the data into the provided JSON schema.

Rules:
- For dates, return YYYY-MM-DD format. If the year isn't visible, infer the most likely year based on context (current year if ambiguous).
- For amounts, return numbers only (no $ or commas). Decimals OK. The "amount" is the receipt total.
- For category, pick the closest match from: materials, labor, equipment, fees, subcontractor, other. Most home-store receipts are materials.
- If a field isn't visible or ambiguous, return null. Don't guess.
- For lineItems, include rows with a clear description and amount. Skip subtotals, tax, total rows.
- For confidence: "high" if image is clear and most fields confident; "medium" if some ambiguity; "low" if image is blurry or partially obscured.
- Return ONLY valid JSON matching the schema. No prose, no markdown.`;

const SCHEMA_HINT = `{
  "vendor": "string or null",
  "amount": "number or null",
  "date": "YYYY-MM-DD or null",
  "description": "string or null",
  "category": "materials|labor|equipment|fees|subcontractor|other or null",
  "lineItems": [{"description": "string", "amount": "number"}],
  "rawText": "string (raw OCR text)",
  "confidence": "high|medium|low"
}`;

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const CATEGORIES: ExpenseCategory[] = [
  'materials',
  'labor',
  'equipment',
  'fees',
  'subcontractor',
  'other',
];

function normalizeCategory(value: unknown): ExpenseCategory {
  const v = String(value || '').toLowerCase().trim();
  return (CATEGORIES as string[]).includes(v) ? (v as ExpenseCategory) : 'other';
}

async function extractReceiptFromImage(
  buffer: Buffer,
  mimeType: string,
): Promise<ReceiptExtraction> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`Unsupported mime type: ${mimeType}`);
  }
  const client = new Anthropic({ apiKey });

  const userContent: any[] = [
    {
      type: 'text',
      text: `Extract the receipt data into this exact JSON schema:\n\n${SCHEMA_HINT}\n\nReturn only the JSON, nothing else.`,
    },
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mimeType,
        data: buffer.toString('base64'),
      },
    },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const textBlock = response.content.find((b: any) => b.type === 'text') as any;
  if (!textBlock) throw new Error('No text response from Claude');

  let raw = String(textBlock.text || '').trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Claude returned non-JSON: ${err.message}`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Claude returned non-object');
  }
  const extraction: ReceiptExtraction = {
    vendor: parsed.vendor ?? null,
    amount: typeof parsed.amount === 'number' ? parsed.amount : null,
    date: parsed.date ?? null,
    description: parsed.description ?? null,
    category: parsed.category ? normalizeCategory(parsed.category) : null,
    lineItems: Array.isArray(parsed.lineItems)
      ? parsed.lineItems
          .filter(
            (li: any) =>
              li && typeof li.description === 'string' && typeof li.amount === 'number',
          )
          .map((li: any) => ({ description: String(li.description), amount: Number(li.amount) }))
      : [],
    rawText: typeof parsed.rawText === 'string' ? parsed.rawText : '',
    confidence: ['high', 'medium', 'low'].includes(parsed.confidence)
      ? parsed.confidence
      : 'low',
  };
  return extraction;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function serializeExpense(id: string, data: any): any {
  if (!data) return { id };
  const capturedAt =
    data.capturedAt?.toDate?.()?.toISOString?.() ?? data.capturedAt ?? null;
  const qboMatchedAt =
    data.qboMatchedAt?.toDate?.()?.toISOString?.() ?? data.qboMatchedAt ?? null;
  return { id, ...data, capturedAt, qboMatchedAt };
}

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerExpenseRoutes(
  app: Express,
  db: admin.firestore.Firestore,
): void {
  // POST /api/expenses/capture — extract receipt + create expense doc
  //
  // Audit fix (2026-07-05): finance role (admin/gc/pm) AND project access.
  // Uses requireProjectAccess which reads req.body.projectId via extractProjectId.
  app.post('/api/expenses/capture', requireFinance, requireProjectAccess, async (req: any, res: any) => {
    try {
      const uid: string = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: 'No uid' });
        return;
      }
      const body = (req.body || {}) as CaptureRequestBody;
      const projectId = String(body.projectId || '').trim();
      if (!projectId) {
        res.status(400).json({ error: 'projectId is required' });
        return;
      }

      // Resolve project name (and validate the project exists).
      const projectSnap = await db.collection('projects').doc(projectId).get();
      if (!projectSnap.exists) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const projectName =
        body.projectName || (projectSnap.data() as any)?.name || '';

      // ── Image handling ──────────────────────────────────────────────────
      // The client may send either:
      //   (a) a pre-uploaded Storage path (storagePath), or
      //   (b) an inline base64 image we upload to Storage ourselves.
      // Either way we run Claude vision on the bytes.
      let receiptStoragePath: string | null = body.storagePath || null;
      let receiptImageUrl: string | null = null;
      let extraction: ReceiptExtraction | null = null;

      const bucket = admin.storage().bucket();

      if (receiptStoragePath) {
        const file = bucket.file(receiptStoragePath);
        const [exists] = await file.exists();
        if (!exists) {
          res
            .status(404)
            .json({ error: `Receipt file not found at ${receiptStoragePath}` });
          return;
        }
        const [buffer] = await file.download();
        const [metadata] = await file.getMetadata();
        const mimeType =
          body.imageMimeType || metadata.contentType || 'image/jpeg';
        try {
          extraction = await extractReceiptFromImage(buffer, mimeType);
        } catch (err: any) {
          console.error('[expenses/capture] OCR failed (storagePath):', err);
          // Non-fatal — we still create the expense with whatever fields the
          // user typed in, just without extraction.
        }
        try {
          const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
          });
          receiptImageUrl = signedUrl;
        } catch {
          receiptImageUrl = null;
        }
      } else if (body.imageBase64) {
        const mimeType = body.imageMimeType || 'image/jpeg';
        if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
          res.status(400).json({ error: `Unsupported mime type: ${mimeType}` });
          return;
        }
        // Strip any data: URL prefix if present.
        const cleaned = body.imageBase64.replace(/^data:[^;]+;base64,/, '');
        let buffer: Buffer;
        try {
          buffer = Buffer.from(cleaned, 'base64');
        } catch (err: any) {
          res.status(400).json({ error: 'Invalid base64 image' });
          return;
        }
        // Upload to Storage so we keep a permanent copy alongside the doc.
        const ext = mimeType.split('/')[1] || 'jpg';
        const ts = Date.now();
        receiptStoragePath = `expenses/${projectId}/${ts}-${uid}.${ext}`;
        try {
          await bucket
            .file(receiptStoragePath)
            .save(buffer, { contentType: mimeType, resumable: false });
          try {
            const [signedUrl] = await bucket
              .file(receiptStoragePath)
              .getSignedUrl({
                action: 'read',
                expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
              });
            receiptImageUrl = signedUrl;
          } catch {
            receiptImageUrl = null;
          }
        } catch (err: any) {
          console.error('[expenses/capture] Storage upload failed:', err);
          // Non-fatal — fall through, we'll still create the expense doc.
          receiptStoragePath = null;
        }
        try {
          extraction = await extractReceiptFromImage(buffer, mimeType);
        } catch (err: any) {
          console.error('[expenses/capture] OCR failed (inline):', err);
        }
      }

      // ── Build expense record ─────────────────────────────────────────────
      const vendor = String(
        body.vendor ?? extraction?.vendor ?? '',
      ).trim();
      const amount = Number(
        body.amount ?? extraction?.amount ?? 0,
      ) || 0;
      const date = String(
        body.date ?? extraction?.date ?? todayIsoDate(),
      );
      const category = normalizeCategory(
        body.category ?? extraction?.category ?? 'other',
      );
      const description = String(
        body.description ?? extraction?.description ?? '',
      );
      const drawNumber =
        typeof body.drawNumber === 'number' ? body.drawNumber : null;
      const tradeCategory = String(body.tradeCategory || '').trim();
      const notes = String(body.notes || '').trim();
      const lineItems: ExpenseLineItem[] =
        Array.isArray(extraction?.lineItems) && extraction.lineItems.length > 0
          ? extraction.lineItems
          : [];

      const docData: Omit<ExpenseRecord, 'id'> = {
        projectId,
        projectName,
        vendor,
        amount,
        date,
        category,
        description,
        drawNumber,
        tradeCategory,
        receiptImageUrl,
        receiptStoragePath,
        status: 'pending',
        qboTransactionId: null,
        qboMatchedAt: null,
        qboSynced: false,
        qboSyncError: null,
        capturedBy: uid,
        capturedAt: admin.firestore.FieldValue.serverTimestamp() as any,
        notes,
        lineItems,
      };

      const ref = await db
        .collection('projects')
        .doc(projectId)
        .collection('expenses')
        .add(docData);
      const created = await ref.get();

      // ── Push to QuickBooks Online (non-blocking) ────────────────────────
      // We deliberately don't await this — QBO outages or token-refresh
      // hiccups should never block the local capture flow. The sync helper
      // catches everything internally and writes qboSynced / qboSyncError
      // back to the expense doc so the UI can show a retry chip.
      pushExpenseToQbo(db, {
        id: ref.id,
        projectId,
        vendor,
        amount,
        date,
        description,
        tradeCategory,
        category,
      }).catch((err: any) => {
        console.error(
          '[expenses/capture] QBO push failed (non-blocking):',
          err?.message || err,
        );
      });

      // ── Auto-assign to bi-monthly draw period ──────────────────────────
      // Tyler packages all expenses into the current draw (period A: 1–15,
      // period B: 16–EOM). Failure here is non-fatal; we still return the
      // created expense, but log so we can backfill.
      let drawPeriodId: string | null = null;
      try {
        const result = await assignExpenseToDrawPeriod(
          db,
          projectId,
          ref.id,
          date,
          amount,
          projectName,
        );
        drawPeriodId = result.periodId;
      } catch (err: any) {
        console.error(
          '[expenses/capture] failed to assign draw period:',
          err?.message || err,
        );
      }

      res.status(201).json({
        expense: serializeExpense(created.id, created.data()),
        extraction,
        drawPeriodId,
      });
    } catch (err: any) {
      console.error('[expenses/capture] error:', err);
      res
        .status(500)
        .json({ error: err.message || 'Failed to capture expense' });
    }
  });

  // GET /api/projects/:projectId/expenses — list expenses for a project
  // Any project member can read — expenses show up in the client's draw statement.
  app.get('/api/projects/:projectId/expenses', requireProjectAccess, async (req: any, res: any) => {
    try {
      const projectId = String(req.params.projectId || '').trim();
      if (!projectId) {
        res.status(400).json({ error: 'projectId required' });
        return;
      }
      const snap = await db
        .collection('projects')
        .doc(projectId)
        .collection('expenses')
        .orderBy('capturedAt', 'desc')
        .get();
      const expenses = snap.docs.map((d) => serializeExpense(d.id, d.data()));
      res.json(expenses);
    } catch (err: any) {
      console.error('[expenses/list] error:', err);
      res
        .status(500)
        .json({ error: err.message || 'Failed to list expenses' });
    }
  });

  // PATCH /api/expenses/:expenseId — update fields (confirm, assign draw, void)
  //
  // Since the expense lives at projects/{projectId}/expenses/{expenseId} we
  // need to know the projectId. Accept it in either the body or as a query
  // param so the client can call this without re-fetching the project.
  //
  // Audit fix (2026-07-05): finance role AND resolved-project access. The
  // expense middleware handles the case where the client didn't hint the
  // projectId by looking it up via collectionGroup.
  app.patch('/api/expenses/:expenseId', requireFinance, requireExpenseProjectAccess, async (req: any, res: any) => {
    try {
      const uid: string = req.user?.uid;
      if (!uid) {
        res.status(401).json({ error: 'No uid' });
        return;
      }
      const expenseId = String(req.params.expenseId || '').trim();
      const projectId = String(
        req.body?.projectId || req.query?.projectId || '',
      ).trim();
      if (!expenseId || !projectId) {
        res
          .status(400)
          .json({ error: 'expenseId and projectId are required' });
        return;
      }

      // Whitelist editable fields — anything else gets dropped.
      const allowed: Array<keyof ExpenseRecord> = [
        'vendor',
        'amount',
        'date',
        'category',
        'description',
        'drawNumber',
        'tradeCategory',
        'notes',
        'lineItems',
        'status',
        'receiptImageUrl',
        'receiptStoragePath',
      ];
      const update: any = {};
      for (const key of allowed) {
        if (key in (req.body || {})) {
          update[key] = (req.body as any)[key];
        }
      }
      if (update.category) update.category = normalizeCategory(update.category);
      if (update.status && !['pending', 'reconciled', 'void'].includes(update.status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }
      update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
      update.updatedBy = uid;

      const ref = db
        .collection('projects')
        .doc(projectId)
        .collection('expenses')
        .doc(expenseId);
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ error: 'Expense not found' });
        return;
      }
      await ref.update(update);
      const after = await ref.get();
      res.json(serializeExpense(after.id, after.data()));
    } catch (err: any) {
      console.error('[expenses/patch] error:', err);
      res
        .status(500)
        .json({ error: err.message || 'Failed to update expense' });
    }
  });

  // POST /api/expenses/:expenseId/reconcile — mark reconciled + store QBO id
  app.post(
    '/api/expenses/:expenseId/reconcile',
    requireFinance,
    requireExpenseProjectAccess,
    async (req: any, res: any) => {
      try {
        const uid: string = req.user?.uid;
        if (!uid) {
          res.status(401).json({ error: 'No uid' });
          return;
        }
        const expenseId = String(req.params.expenseId || '').trim();
        const projectId = String(
          req.body?.projectId || req.query?.projectId || '',
        ).trim();
        const qboTransactionId = String(
          req.body?.qboTransactionId || '',
        ).trim();
        if (!expenseId || !projectId || !qboTransactionId) {
          res.status(400).json({
            error:
              'expenseId, projectId, and qboTransactionId are required',
          });
          return;
        }
        const ref = db
          .collection('projects')
          .doc(projectId)
          .collection('expenses')
          .doc(expenseId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Expense not found' });
          return;
        }
        await ref.update({
          status: 'reconciled',
          qboTransactionId,
          qboMatchedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: uid,
        });
        const after = await ref.get();
        res.json(serializeExpense(after.id, after.data()));
      } catch (err: any) {
        console.error('[expenses/reconcile] error:', err);
        res
          .status(500)
          .json({ error: err.message || 'Failed to reconcile expense' });
      }
    },
  );
}
