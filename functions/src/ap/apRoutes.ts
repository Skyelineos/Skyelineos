// AP (Accounts Payable) Routes
// =============================
//
// Express routes for the AP email invoice scanning system.
//
// Two registration functions:
//
//   registerApPublicRoutes(app, db)
//     — POST /api/ap/telegram-callback   (no auth — Telegram webhook)
//     Must be registered BEFORE the /api auth middleware gate in index.ts.
//
//   registerApRoutes(app, db)
//     — POST /api/ap/scan                admin-only manual scan trigger
//     — GET  /api/ap/invoices            paginated invoice list with filters
//     — PATCH /api/ap/invoices/:id       update job / trade / status
//     — GET  /api/ap/summary             aggregate totals by job and trade
//     Registered AFTER the /api auth middleware gate.

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import { scanInvoices } from './invoiceEmailScanner';
import { extractInvoiceFromStoragePath } from './pdfExtractor';
import { handleTelegramCallback } from './telegramCallbackHandler';

// ── Types ────────────────────────────────────────────────────────────────────

interface InvoiceFilter {
  status?: string;
  jobName?: string;
  trade?: string;
  confidence?: string;
  page?: number;
  limit?: number;
}

// ── Public routes (no auth) ──────────────────────────────────────────────────

export function registerApPublicRoutes(
  app: Express,
  _db: FirebaseFirestore.Firestore,
): void {
  // Telegram inline keyboard callback webhook
  // The bot must have this URL registered via setWebhook.
  // No auth required — Telegram POSTs directly; we respond 200 immediately.
  app.post('/api/ap/telegram-callback', (req: any, res: any) =>
    handleTelegramCallback(req, res),
  );
}

// ── Authenticated routes ─────────────────────────────────────────────────────

export function registerApRoutes(
  app: Express,
  db: FirebaseFirestore.Firestore,
): void {
  // ── POST /api/ap/ocr-backfill — re-extract amounts from existing PDF attachments ──
  // Uses deterministic PDF text-layer extraction (pdf-parse). No AI calls.
  // Falls back to null when PDF has no text layer (image-only scans).
  app.post('/api/ap/ocr-backfill', requireApAdmin, async (req: any, res: any) => {
    try {
      const snap = await db.collection('ap_invoices').get();
      const candidates = snap.docs.filter((d) => {
        const inv = d.data();
        const amt = Number(inv.amount);
        return (amt === 0 || !inv.amount) && (inv.attachmentPaths || []).length > 0;
      });

      let updated = 0;
      let failed  = 0;
      const errors: string[] = [];

      for (const doc of candidates) {
        const inv = doc.data();
        const paths: string[] = inv.attachmentPaths || [];
        const pdfPath = paths.find((p: string) => /\.(pdf|jpg|jpeg|png)$/i.test(p));
        if (!pdfPath) { failed += 1; continue; }

        try {
          const extracted = await extractInvoiceFromStoragePath(pdfPath, admin.storage());
          if (!extracted || !extracted.amount) { failed += 1; continue; }

          const patch: Record<string, any> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
          patch.amount = extracted.amount;
          if (extracted.invoiceDate && !inv.invoiceDate) patch.invoiceDate = extracted.invoiceDate;
          if (extracted.dueDate     && !inv.dueDate)     patch.dueDate     = extracted.dueDate;
          if (extracted.vendor      && extracted.vendor !== inv.vendor) patch.vendor = extracted.vendor;

          await doc.ref.update(patch);
          updated += 1;
        } catch (err: any) {
          errors.push(`${doc.id}: ${err?.message}`);
          failed += 1;
        }
      }

      return res.json({ ok: true, candidates: candidates.length, updated, failed, errors });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ── POST /api/ap/scan — manual trigger ────────────────────────────────────
  // Admin only. Triggers the same Gmail scan logic the scheduled function uses.
  app.post('/api/ap/scan', requireApAdmin, async (req: any, res: any) => {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    if (!anthropicKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }
    if (!telegramBotToken || !telegramChatId) {
      return res.status(500).json({ error: 'Telegram credentials not configured' });
    }

    try {
      const result = await scanInvoices(db, {
        anthropicKey,
        telegramBotToken,
        telegramChatId,
      });
      return res.json({ ok: true, ...result });
    } catch (e: any) {
      console.error('[apRoutes] scan error:', e?.message);
      return res.status(500).json({ error: e?.message || 'Scan failed' });
    }
  });

  // ── GET /api/ap/invoices — paginated list with filters ────────────────────
  app.get('/api/ap/invoices', requireApStaff, async (req: any, res: any) => {
    try {
      const { status, jobName, trade, confidence, page = '1', limit: limitStr = '50' } =
        req.query as Record<string, string>;
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.min(200, Math.max(1, parseInt(limitStr, 10) || 50));

      let q: FirebaseFirestore.Query = db
        .collection('ap_invoices')
        .orderBy('createdAt', 'desc');

      if (status) q = q.where('status', '==', status);
      if (jobName) q = q.where('jobName', '==', jobName);
      if (trade) q = q.where('trade', '==', trade);
      if (confidence) q = q.where('confidence', '==', confidence);

      // Firestore doesn't support true pagination with offset on filtered queries easily;
      // we pull with a reasonable limit and return the page slice.
      const snap = await q.limit(pageSize * pageNum + 1).get();
      const allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const total = snap.size < pageSize * pageNum + 1 ? allDocs.length : null; // null = "more exist"
      const start = (pageNum - 1) * pageSize;
      const paged = allDocs.slice(start, start + pageSize);

      return res.json({
        invoices: paged,
        page: pageNum,
        pageSize,
        hasMore: allDocs.length > start + pageSize,
        total: snap.size,
      });
    } catch (e: any) {
      console.error('[apRoutes] list invoices error:', e?.message);
      return res.status(500).json({ error: 'Failed to fetch invoices' });
    }
  });

  // ── PATCH /api/ap/invoices/:id — update job / trade / status ─────────────
  app.patch('/api/ap/invoices/:id', requireApStaff, async (req: any, res: any) => {
    const { id } = req.params;
    const { jobName, trade, status, notes, paymentStatus, paidDate, paidAmount } = req.body || {};

    const patch: Record<string, any> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

    if (jobName !== undefined) patch.jobName = jobName || null;
    if (trade !== undefined) patch.trade = trade;
    if (status !== undefined) {
      const validStatuses = ['auto_approved', 'pending_review', 'approved', 'rejected'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status: ${status}` });
      }
      patch.status = status;
      if (status === 'approved' || status === 'rejected') {
        patch.reviewedBy = req.user?.uid || 'web';
        patch.reviewedAt = admin.firestore.Timestamp.now();
      }
    }
    if (notes !== undefined) patch.aiNotes = notes;
    // Payment status (tracked separately from review status)
    if (paymentStatus !== undefined) {
      const validPayment = ['paid', 'unpaid', 'partial'];
      if (!validPayment.includes(paymentStatus)) {
        return res.status(400).json({ error: `Invalid paymentStatus: ${paymentStatus}` });
      }
      patch.paymentStatus = paymentStatus;
      patch.paidDate = paidDate || null;
      patch.paidAmount = paidAmount || null;
    }

    if (Object.keys(patch).length <= 1) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    try {
      const ref = db.collection('ap_invoices').doc(id);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: 'Invoice not found' });
      await ref.update(patch);

      // ── Auto-create expense record when marked paid ───────────────────────────
      // Writes to projects/{projectId}/expenses/{id} so it shows up in job financials.
      if (paymentStatus === 'paid') {
        const inv = snap.data() as any;
        const effectiveJobName = (jobName !== undefined ? jobName : inv.jobName) as string | null;
        if (effectiveJobName) {
          try {
            // Resolve project doc by name
            const projSnap = await db
              .collection('projects')
              .where('name', '==', effectiveJobName)
              .limit(1)
              .get();

            const projectDoc = projSnap.empty ? null : projSnap.docs[0];
            const projectId = projectDoc?.id || null;

            if (projectId) {
              const effectiveAmount = Number(paidAmount || inv.amount || 0);
              const effectiveTrade  = (trade !== undefined ? trade : inv.trade) as string || 'Other';
              // Map AP trade to expense category
              const tradeToCategory: Record<string, string> = {
                Framing: 'labor', Concrete: 'labor', Electrical: 'subcontractor',
                Plumbing: 'subcontractor', HVAC: 'subcontractor', Roofing: 'subcontractor',
                Drywall: 'labor', Flooring: 'subcontractor', Painting: 'subcontractor',
                Landscaping: 'subcontractor', Cabinets: 'subcontractor', Countertops: 'materials',
                Windows: 'materials', Doors: 'materials', Insulation: 'materials',
                Excavation: 'subcontractor', Foundation: 'labor', Masonry: 'labor',
                Tile: 'subcontractor', Hardware: 'materials', Materials: 'materials',
                Subcontractor: 'subcontractor', 'Professional Services': 'fees',
              };
              const category = tradeToCategory[effectiveTrade] || 'other';

              // Idempotency: don't create duplicate if already has an expense from this AP invoice
              const existingExpense = await db
                .collection('projects').doc(projectId)
                .collection('expenses')
                .where('apInvoiceId', '==', id)
                .limit(1)
                .get();

              if (existingExpense.empty) {
                await db.collection('projects').doc(projectId).collection('expenses').add({
                  apInvoiceId: id,               // link back to AP record
                  projectId,
                  projectName: effectiveJobName,
                  vendor: inv.vendor || 'Unknown',
                  amount: effectiveAmount,
                  date: paidDate || inv.invoiceDate || new Date().toISOString().slice(0, 10),
                  category,
                  tradeCategory: effectiveTrade,
                  description: `Invoice from ${inv.vendor || inv.fromName || 'vendor'} — ${effectiveTrade}`,
                  receiptStoragePath: (inv.attachmentPaths || [])[0] || null,
                  receiptImageUrl: null,
                  status: 'reconciled',           // already paid
                  qboTransactionId: null,
                  qboMatchedAt: null,
                  qboSynced: false,
                  qboSyncError: null,
                  capturedBy: req.user?.uid || 'ap_auto',
                  capturedAt: admin.firestore.Timestamp.now(),
                  notes: `Auto-created from AP invoice ${id}`,
                  lineItems: [],
                  source: 'ap_invoice',
                });
              }
            }
          } catch (expErr: any) {
            // Non-fatal — AP record is already updated, just log
            console.error('[apRoutes] auto-expense creation failed:', expErr?.message);
          }
        }
      }

      return res.json({ ok: true, id, patch });
    } catch (e: any) {
      console.error('[apRoutes] patch invoice error:', e?.message);
      return res.status(500).json({ error: 'Failed to update invoice' });
    }
  });

  // ── GET /api/ap/summary — aggregate totals by job and trade ──────────────
  app.get('/api/ap/summary', requireApStaff, async (_req: any, res: any) => {
    try {
      const snap = await db
        .collection('ap_invoices')
        .where('status', 'in', ['auto_approved', 'approved', 'pending_review'])
        .get();

      const byJob: Record<string, { total: number; unpaidTotal: number; paidTotal: number; count: number; unpaidCount: number; paidCount: number; byTrade: Record<string, number> }> = {};
      const byTrade: Record<string, { total: number; count: number }> = {};
      let grandTotal = 0;
      let outstandingTotal = 0;  // unpaid + partial
      let paidThisMonth = 0;
      let thisMonthTotal = 0;
      let pendingCount = 0;
      let unpaidCount = 0;
      let paidCount = 0;
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      for (const d of snap.docs) {
        const inv = d.data() as any;
        const amt = Number(inv.amount) || 0;
        const job = inv.jobName || 'Unassigned';
        const trade = inv.trade || 'Other';
        const paymentStatus = inv.paymentStatus || 'unpaid';

        grandTotal += amt;
        if (inv.invoiceDate?.startsWith(currentMonth)) thisMonthTotal += amt;
        if (inv.status === 'pending_review') pendingCount += 1;

        // Payment tracking
        if (paymentStatus === 'paid') {
          paidCount += 1;
          if (inv.paidDate?.startsWith(currentMonth)) paidThisMonth += amt;
        } else {
          unpaidCount += 1;
          outstandingTotal += amt;
        }

        // By job
        if (!byJob[job]) byJob[job] = { total: 0, unpaidTotal: 0, paidTotal: 0, count: 0, unpaidCount: 0, paidCount: 0, byTrade: {} };
        byJob[job].total += amt;
        byJob[job].count += 1;
        byJob[job].byTrade[trade] = (byJob[job].byTrade[trade] || 0) + amt;
        if (paymentStatus === 'paid') {
          byJob[job].paidTotal += amt;
          byJob[job].paidCount += 1;
        } else {
          byJob[job].unpaidTotal += amt;
          byJob[job].unpaidCount += 1;
        }

        // By trade
        if (!byTrade[trade]) byTrade[trade] = { total: 0, count: 0 };
        byTrade[trade].total += amt;
        byTrade[trade].count += 1;
      }

      const topTrade = Object.entries(byTrade).sort(([, a], [, b]) => b.total - a.total)[0];

      return res.json({
        grandTotal,
        outstandingTotal,
        paidThisMonth,
        thisMonthTotal,
        pendingCount,
        unpaidCount,
        paidCount,
        topTrade: topTrade ? { trade: topTrade[0], total: topTrade[1].total } : null,
        byJob: Object.entries(byJob)
          .map(([job, v]) => ({ job, ...v }))
          .sort((a, b) => b.unpaidTotal - a.unpaidTotal),
        byTrade: Object.entries(byTrade)
          .map(([trade, v]) => ({ trade, ...v }))
          .sort((a, b) => b.total - a.total),
      });
    } catch (e: any) {
      console.error('[apRoutes] summary error:', e?.message);
      return res.status(500).json({ error: 'Failed to compute summary' });
    }
  });
}

// ── Role middleware ───────────────────────────────────────────────────────────
// These run after the global /api authMiddleware gate (which sets req.userProfile).

function requireApAdmin(req: any, res: any, next: any): void {
  const role = req.userProfile?.role || req.user?.role;
  if (role !== 'admin') {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  next();
}

function requireApStaff(req: any, res: any, next: any): void {
  const role = req.userProfile?.role || req.user?.role;
  const allowed = ['admin', 'gc', 'projectManager'];
  if (!allowed.includes(role)) {
    res.status(403).json({ error: 'Staff access required' });
    return;
  }
  next();
}
