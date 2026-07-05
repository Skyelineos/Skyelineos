// Bi-monthly Draw Schedule — Express routes for managing the GC's twice-monthly
// draw requests. Tyler packages all expenses + invoices into a single draw and
// bills the client or bank on a fixed cadence:
//   Period A: expenses dated 1st–15th  → closes on the 16th  → draw sent
//   Period B: expenses dated 16th–EOM  → closes on the 1st of next month
//
// Routes mount AFTER the /api authMiddleware gate in functions/src/index.ts,
// so req.user is always a verified Firebase ID token.
//
// Firestore layout:
//   projects/{projectId}/drawPeriods/{periodId}
//
//   GET    /api/projects/:projectId/draw-periods                       — list
//   GET    /api/projects/:projectId/draw-periods/current               — current/open
//   POST   /api/projects/:projectId/draw-periods/:periodId/submit      — open → submitted (emails client)
//   POST   /api/projects/:projectId/draw-periods/:periodId/mark-paid   — submitted → paid
//   POST   /api/projects/:projectId/draw-periods/:periodId/reconcile   — paid → reconciled
//
// Also exports `assignExpenseToDrawPeriod` for expenseRoutes.ts to call after
// every expense is created so the right period auto-tallies in real time.

import type { Express } from 'express';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import { pushDrawToQbo } from '../qbo/expenseSync';
import { requireFinance } from '../middleware/rbac';
import { requireProjectAccess } from '../middleware/requireProjectAccess';

// ── Types ────────────────────────────────────────────────────────────────────

export type DrawPeriodStatus = 'open' | 'submitted' | 'paid' | 'reconciled';

export interface DrawTradeItem {
  trade: string;              // e.g. "Framing", "Plumbing Finish"
  contractAmount: number;     // total budgeted for this trade
  previouslyDrawn: number;    // sum of all prior draws for this trade
  thisDrawAmount: number;     // amount in THIS draw
  percentComplete: number;    // 0-100
  balance: number;            // contractAmount - previouslyDrawn - thisDrawAmount
}

export interface DrawPeriod {
  id: string;
  projectId: string;
  projectName: string;
  drawNumber: number;     // sequential: 1, 2, 3... per project
  periodLabel: string;    // e.g. "June 1–15, 2026"
  periodStart: string;    // YYYY-MM-DD
  periodEnd: string;      // YYYY-MM-DD
  processDate: string;    // YYYY-MM-DD — the 16th or the 1st of next month
  status: DrawPeriodStatus;
  totalExpenses: number;
  totalInvoices: number;
  totalDraw: number;
  expenseIds: string[];
  invoiceIds: string[];
  tradeLineItems: DrawTradeItem[];
  submittedAt: admin.firestore.Timestamp | null;
  paidAt: admin.firestore.Timestamp | null;
  paidAmount: number | null;
  qboInvoiceId: string | null;
  reconciledAt: admin.firestore.Timestamp | null;
  notes: string;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year: number, monthIdx0: number): number {
  // monthIdx0 is 0-based (0 = January). Day 0 of next month = last day of this month.
  return new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
}

function parseYmd(date: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim());
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const dd = parseInt(m[3], 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return { y, m: mm, d: dd };
}

/**
 * Given a date, derive the draw period it belongs to.
 *   Day 1–15  → A (closes on the 16th of the same month)
 *   Day 16–EOM → B (closes on the 1st of next month)
 */
export function periodInfoForDate(
  projectId: string,
  date: string,
): {
  periodId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  processDate: string;
} {
  const parsed = parseYmd(date);
  const now = parsed || (() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  })();

  const { y, m, d } = now;
  const monthName = MONTH_NAMES[m - 1];

  if (d <= 15) {
    // Period A: 1st–15th, closes 16th
    return {
      periodId: `${projectId}-${y}-${pad2(m)}-A`,
      periodLabel: `${monthName} 1–15, ${y}`,
      periodStart: `${y}-${pad2(m)}-01`,
      periodEnd: `${y}-${pad2(m)}-15`,
      processDate: `${y}-${pad2(m)}-16`,
    };
  }

  // Period B: 16th–EOM, closes 1st of next month
  const eom = lastDayOfMonth(y, m - 1);
  const nextMonthIdx0 = m === 12 ? 0 : m;          // 0-based
  const nextYear = m === 12 ? y + 1 : y;
  const nextMonthNum = nextMonthIdx0 + 1;
  return {
    periodId: `${projectId}-${y}-${pad2(m)}-B`,
    periodLabel: `${monthName} 16–${eom}, ${y}`,
    periodStart: `${y}-${pad2(m)}-16`,
    periodEnd: `${y}-${pad2(m)}-${pad2(eom)}`,
    processDate: `${nextYear}-${pad2(nextMonthNum)}-01`,
  };
}

// ── Serialization ────────────────────────────────────────────────────────────

function serializePeriod(id: string, data: any): any {
  if (!data) return { id };
  const ts = (v: any) => v?.toDate?.()?.toISOString?.() ?? v ?? null;
  return {
    id,
    ...data,
    submittedAt: ts(data.submittedAt),
    paidAt: ts(data.paidAt),
    reconciledAt: ts(data.reconciledAt),
    createdAt: ts(data.createdAt),
    updatedAt: ts(data.updatedAt),
  };
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtCurrency(n: number): string {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Get-or-create the period doc ─────────────────────────────────────────────

/**
 * Resolve the draw period for (projectId, date), creating it lazily if needed.
 * Returns the Firestore doc ref and the period info.
 */
export async function getOrCreateDrawPeriod(
  db: admin.firestore.Firestore,
  projectId: string,
  date: string,
  projectName?: string,
): Promise<{
  ref: admin.firestore.DocumentReference;
  info: ReturnType<typeof periodInfoForDate>;
  created: boolean;
}> {
  const info = periodInfoForDate(projectId, date);
  const ref = db
    .collection('projects')
    .doc(projectId)
    .collection('drawPeriods')
    .doc(info.periodId);
  const snap = await ref.get();
  if (snap.exists) {
    return { ref, info, created: false };
  }
  // Resolve project name if caller didn't pass it.
  let resolvedName = projectName || '';
  if (!resolvedName) {
    try {
      const projSnap = await db.collection('projects').doc(projectId).get();
      resolvedName = (projSnap.data() as any)?.name || '';
    } catch {
      resolvedName = '';
    }
  }
  // Auto-assign drawNumber: count of existing draw periods for this project + 1.
  let drawNumber = 1;
  try {
    const priorSnap = await db
      .collection('projects')
      .doc(projectId)
      .collection('drawPeriods')
      .get();
    drawNumber = priorSnap.size + 1;
  } catch (e) {
    console.warn('[getOrCreateDrawPeriod] drawNumber count failed:', e);
  }
  const now = admin.firestore.FieldValue.serverTimestamp();
  const doc: Omit<DrawPeriod, 'id'> = {
    projectId,
    projectName: resolvedName,
    drawNumber,
    periodLabel: info.periodLabel,
    periodStart: info.periodStart,
    periodEnd: info.periodEnd,
    processDate: info.processDate,
    status: 'open',
    totalExpenses: 0,
    totalInvoices: 0,
    totalDraw: 0,
    expenseIds: [],
    invoiceIds: [],
    tradeLineItems: [],
    submittedAt: null,
    paidAt: null,
    paidAmount: null,
    qboInvoiceId: null,
    reconciledAt: null,
    notes: '',
    createdAt: now as any,
    updatedAt: now as any,
  };
  await ref.set(doc);
  return { ref, info, created: true };
}

// ── Trade line item builder ─────────────────────────────────────────────────

/**
 * Build the trade line items array for a draw period.
 *   - Groups current period expenses by tradeCategory → sum thisDrawAmount
 *   - Looks up contractAmount from budgetItems (matched by `trade` or
 *     `category` field, falling back to budgetedCost/budgetAmount)
 *   - Calculates previouslyDrawn from prior submitted/paid/reconciled draws
 *     for the same trade
 *   - percentComplete = (previouslyDrawn + thisDrawAmount) / contractAmount
 *   - balance = contractAmount - previouslyDrawn - thisDrawAmount
 */
export async function buildTradeLineItems(
  db: admin.firestore.Firestore,
  projectId: string,
  currentPeriodId: string,
  expenseDocs: admin.firestore.DocumentSnapshot[],
): Promise<DrawTradeItem[]> {
  // 1. Group current period expenses by tradeCategory.
  const thisDrawByTrade = new Map<string, number>();
  for (const ed of expenseDocs) {
    if (!ed.exists) continue;
    const ex = ed.data() as any;
    const trade = String(ex.tradeCategory || '').trim();
    if (!trade) continue;
    const amt = Number(ex.amount) || 0;
    thisDrawByTrade.set(trade, (thisDrawByTrade.get(trade) || 0) + amt);
  }

  // 2. Fetch budgetItems for this project (small N).
  const budgetSnap = await db
    .collection('projects')
    .doc(projectId)
    .collection('budgetItems')
    .get();
  const contractByTrade = new Map<string, number>();
  for (const bd of budgetSnap.docs) {
    const data = bd.data() as any;
    const trade = String(
      data.trade || data.category || bd.id || '',
    ).trim();
    const amount = Number(
      data.budgetedCost ?? data.budgetAmount ?? data.contractAmount ?? 0,
    ) || 0;
    if (!trade) continue;
    // Last write wins; budgetedCost via bid award is preferred.
    contractByTrade.set(trade, amount);
  }

  // 3. Fetch all prior submitted/paid/reconciled draws and sum tradeLineItems.
  const priorSnap = await db
    .collection('projects')
    .doc(projectId)
    .collection('drawPeriods')
    .where('status', 'in', ['submitted', 'paid', 'reconciled'])
    .get();
  const previouslyDrawnByTrade = new Map<string, number>();
  for (const pd of priorSnap.docs) {
    if (pd.id === currentPeriodId) continue;
    const data = pd.data() as any;
    const items: any[] = Array.isArray(data.tradeLineItems)
      ? data.tradeLineItems
      : [];
    for (const it of items) {
      const trade = String(it.trade || '').trim();
      if (!trade) continue;
      const amt = Number(it.thisDrawAmount) || 0;
      previouslyDrawnByTrade.set(
        trade,
        (previouslyDrawnByTrade.get(trade) || 0) + amt,
      );
    }
  }

  // 4. Build the array — include every trade that has either a contract,
  //    prior draws, or a current draw amount.
  const allTrades = new Set<string>([
    ...thisDrawByTrade.keys(),
    ...previouslyDrawnByTrade.keys(),
    // Only include budget items that participated in draws or have current activity.
    // Skip pure-budget trades with no expense activity to keep the list focused.
  ]);

  const items: DrawTradeItem[] = [];
  for (const trade of allTrades) {
    const contractAmount = contractByTrade.get(trade) || 0;
    const previouslyDrawn = previouslyDrawnByTrade.get(trade) || 0;
    const thisDrawAmount = thisDrawByTrade.get(trade) || 0;
    const drawnTotal = previouslyDrawn + thisDrawAmount;
    const percentComplete = contractAmount > 0
      ? Math.min(100, Math.round((drawnTotal / contractAmount) * 100))
      : 0;
    const balance = contractAmount - previouslyDrawn - thisDrawAmount;
    items.push({
      trade,
      contractAmount,
      previouslyDrawn,
      thisDrawAmount,
      percentComplete,
      balance,
    });
  }
  items.sort((a, b) => a.trade.localeCompare(b.trade));
  return items;
}

/**
 * Add an expense to its correct draw period and update running totals.
 * Idempotent: if the expense is already in the period.expenseIds array, the
 * totals aren't double-counted.
 *
 * Called from expenseRoutes.ts after every expense create.
 */
export async function assignExpenseToDrawPeriod(
  db: admin.firestore.Firestore,
  projectId: string,
  expenseId: string,
  expenseDate: string,
  expenseAmount: number,
  projectName?: string,
): Promise<{ periodId: string; alreadyAssigned: boolean }> {
  const { ref, info } = await getOrCreateDrawPeriod(
    db,
    projectId,
    expenseDate,
    projectName,
  );
  const amount = Number(expenseAmount) || 0;
  const alreadyAssigned = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() || {}) as Partial<DrawPeriod>;
    const ids: string[] = Array.isArray(data.expenseIds) ? data.expenseIds : [];
    if (ids.includes(expenseId)) {
      return true; // already counted
    }
    const newTotalExpenses = Number(data.totalExpenses || 0) + amount;
    const newTotalInvoices = Number(data.totalInvoices || 0);
    tx.update(ref, {
      expenseIds: admin.firestore.FieldValue.arrayUnion(expenseId),
      totalExpenses: newTotalExpenses,
      totalDraw: newTotalExpenses + newTotalInvoices,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return false;
  });
  return { periodId: info.periodId, alreadyAssigned };
}

// ── Route registration ──────────────────────────────────────────────────────

export function registerDrawRoutes(
  app: Express,
  db: admin.firestore.Firestore,
): void {
  // GET /api/projects/:projectId/draw-periods — list all periods, newest first
  // Any project member can view (clients see their own draw statements).
  app.get(
    '/api/projects/:projectId/draw-periods',
    requireProjectAccess,
    async (req: any, res: any) => {
      try {
        const projectId = String(req.params.projectId || '').trim();
        if (!projectId) {
          res.status(400).json({ error: 'projectId required' });
          return;
        }
        const snap = await db
          .collection('projects')
          .doc(projectId)
          .collection('drawPeriods')
          .orderBy('periodStart', 'desc')
          .get();
        const periods = snap.docs.map((d) => serializePeriod(d.id, d.data()));
        res.json(periods);
      } catch (err: any) {
        console.error('[draw-periods/list] error:', err);
        res
          .status(500)
          .json({ error: err.message || 'Failed to list draw periods' });
      }
    },
  );

  // GET /api/projects/:projectId/draw-periods/current — current open period
  app.get(
    '/api/projects/:projectId/draw-periods/current',
    requireProjectAccess,
    async (req: any, res: any) => {
      try {
        const projectId = String(req.params.projectId || '').trim();
        if (!projectId) {
          res.status(400).json({ error: 'projectId required' });
          return;
        }
        // Use server today as the reference date.
        const d = new Date();
        const ymd = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        const { ref } = await getOrCreateDrawPeriod(db, projectId, ymd);

        // Re-sum totalExpenses from the actual expenses for accuracy. The
        // assignExpenseToDrawPeriod path keeps totals in sync, but PATCH-edits
        // to expense amounts/dates can drift; recompute here.
        const snap = await ref.get();
        const data = (snap.data() || {}) as Partial<DrawPeriod>;
        const expenseIds: string[] = Array.isArray(data.expenseIds)
          ? data.expenseIds
          : [];

        let recomputedExpenses = 0;
        const expenses: any[] = [];
        let expenseDocs: admin.firestore.DocumentSnapshot[] = [];
        if (expenseIds.length > 0) {
          // Fetch each expense doc (small N — twice a month).
          const expensesCol = db
            .collection('projects')
            .doc(projectId)
            .collection('expenses');
          expenseDocs = await Promise.all(
            expenseIds.map((eid) => expensesCol.doc(eid).get()),
          );
          for (const ed of expenseDocs) {
            if (!ed.exists) continue;
            const ex = ed.data() as any;
            recomputedExpenses += Number(ex.amount) || 0;
            expenses.push({
              id: ed.id,
              vendor: ex.vendor || '',
              amount: Number(ex.amount) || 0,
              date: ex.date || '',
              category: ex.category || '',
              tradeCategory: ex.tradeCategory || '',
              description: ex.description || '',
              receiptImageUrl: ex.receiptImageUrl || null,
            });
          }
        }

        // Build trade line items for the current period.
        const tradeLineItems = await buildTradeLineItems(
          db,
          projectId,
          ref.id,
          expenseDocs,
        );

        // If the persisted total drifted, fix it; always refresh trade items.
        const totalDriftedExpenses =
          Math.abs(recomputedExpenses - Number(data.totalExpenses || 0)) >
          0.005;
        const totalInvoicesNum = Number(data.totalInvoices || 0);
        await ref.update({
          ...(totalDriftedExpenses
            ? {
              totalExpenses: recomputedExpenses,
              totalDraw: recomputedExpenses + totalInvoicesNum,
            }
            : {}),
          tradeLineItems,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const fresh = await ref.get();
        res.json({
          ...serializePeriod(fresh.id, fresh.data()),
          expenses,
        });
      } catch (err: any) {
        console.error('[draw-periods/current] error:', err);
        res
          .status(500)
          .json({ error: err.message || 'Failed to load current period' });
      }
    },
  );

  // POST /api/projects/:projectId/draw-periods/:periodId/submit
  // Mutates + sends email to client/bank — finance role only.
  app.post(
    '/api/projects/:projectId/draw-periods/:periodId/submit',
    requireFinance,
    requireProjectAccess,
    async (req: any, res: any) => {
      try {
        const uid: string = req.user?.uid;
        if (!uid) {
          res.status(401).json({ error: 'No uid' });
          return;
        }
        const projectId = String(req.params.projectId || '').trim();
        const periodId = String(req.params.periodId || '').trim();
        if (!projectId || !periodId) {
          res
            .status(400)
            .json({ error: 'projectId and periodId are required' });
          return;
        }

        const ref = db
          .collection('projects')
          .doc(projectId)
          .collection('drawPeriods')
          .doc(periodId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Draw period not found' });
          return;
        }
        const period = snap.data() as DrawPeriod;
        if (period.status !== 'open') {
          res.status(409).json({
            error: `Cannot submit: period status is '${period.status}'`,
          });
          return;
        }

        // Fetch project for client contact + name.
        const projSnap = await db.collection('projects').doc(projectId).get();
        const project = (projSnap.data() || {}) as any;
        const projectName = period.projectName || project.name || 'Project';

        // Build itemized expense list.
        const expenseIds: string[] = Array.isArray(period.expenseIds)
          ? period.expenseIds
          : [];
        const expensesCol = db
          .collection('projects')
          .doc(projectId)
          .collection('expenses');
        const expDocs = await Promise.all(
          expenseIds.map((eid) => expensesCol.doc(eid).get()),
        );
        const items = expDocs
          .filter((d) => d.exists)
          .map((d) => {
            const e = d.data() as any;
            return {
              date: e.date || '',
              vendor: e.vendor || '',
              category: e.category || '',
              description: e.description || '',
              amount: Number(e.amount) || 0,
            };
          })
          .sort((a, b) => a.date.localeCompare(b.date));

        const recomputedTotal = items.reduce((s, x) => s + x.amount, 0);
        const totalInvoices = Number(period.totalInvoices || 0);
        const totalDraw = recomputedTotal + totalInvoices;

        // Use the period's persisted drawNumber (assigned on creation). Fall
        // back to (count of prior submitted/paid/reconciled draws + 1) for
        // any legacy docs that pre-date the field.
        let drawNumber = Number(period.drawNumber) || 0;
        if (!drawNumber) {
          const priorSnap = await db
            .collection('projects')
            .doc(projectId)
            .collection('drawPeriods')
            .where('status', 'in', ['submitted', 'paid', 'reconciled'])
            .get();
          drawNumber = priorSnap.size + 1;
        }

        // Build trade line items so the email and persisted doc reflect a
        // breakdown by trade (Central Bank format).
        const tradeLineItems = await buildTradeLineItems(
          db,
          projectId,
          ref.id,
          expDocs,
        );

        // Recipients: client + bank/lender — send to both when on file.
        const clientEmail: string =
          req.body?.clientEmail ||
          req.body?.recipientEmail ||
          project.clientEmail ||
          project.client?.email ||
          project.contactEmail ||
          '';
        const bankEmail: string =
          req.body?.bankEmail ||
          project.lenderEmail ||
          project.bankEmail ||
          project.lender?.email ||
          '';
        const toList = [...new Set([clientEmail, bankEmail].filter(Boolean))];
        const recipientEmail = toList[0] || '';

        // Compose email
        const subject = `Draw Request #${drawNumber} — ${projectName} — ${period.periodLabel}`;

        // Central Bank-style trade breakdown table.
        const padR = (s: string, n: number) => s.padEnd(n).slice(0, n);
        const padL = (s: string, n: number) => s.padStart(n).slice(-n);
        const tradeTextHeader =
          'CAT | CATEGORY            | TOTAL COST   | PREV DRAWN   | THIS DRAW    | % COMP | BALANCE\n' +
          '----|---------------------|--------------|--------------|--------------|--------|--------------';
        const tradeTextRows = tradeLineItems
          .map((t) =>
            `    | ${padR(t.trade, 19)} | ${padL(fmtCurrency(t.contractAmount), 12)} | ${padL(fmtCurrency(t.previouslyDrawn), 12)} | ${padL(fmtCurrency(t.thisDrawAmount), 12)} | ${padL(`${t.percentComplete}%`, 6)} | ${padL(fmtCurrency(t.balance), 12)}`,
          )
          .join('\n');

        const textRows = items
          .map(
            (it) =>
              `${it.date}  ${it.vendor.padEnd(28).slice(0, 28)}  ${it.category.padEnd(14).slice(0, 14)}  ${fmtCurrency(it.amount).padStart(12)}`,
          )
          .join('\n');
        const text =
          `Draw Request #${drawNumber}\n` +
          `${projectName}\n` +
          `Period: ${period.periodLabel}\n` +
          `Process date: ${period.processDate}\n\n` +
          `TRADE BREAKDOWN\n` +
          `${tradeTextHeader}\n` +
          `${tradeLineItems.length > 0 ? tradeTextRows : '    | (no trade activity)'}\n\n` +
          `Itemized expenses (${items.length}):\n` +
          `${textRows || '  (no expenses recorded)'}\n\n` +
          `Total expenses: ${fmtCurrency(recomputedTotal)}\n` +
          (totalInvoices > 0
            ? `Total invoices: ${fmtCurrency(totalInvoices)}\n`
            : '') +
          `TOTAL DRAW: ${fmtCurrency(totalDraw)}\n\n` +
          `Payment is due per the contract terms.\n\n` +
          `— Skyeline Homes`;

        const htmlRows = items
          .map(
            (it) =>
              `<tr>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#374151">${escapeHtml(it.date)}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#141414">${escapeHtml(it.vendor)}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#6b7280">${escapeHtml(it.category)}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#141414;text-align:right;font-variant-numeric:tabular-nums">${escapeHtml(fmtCurrency(it.amount))}</td>
              </tr>`,
          )
          .join('');

        const tradeHtmlRows = tradeLineItems
          .map((t) =>
            `<tr>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#141414">${escapeHtml(t.trade)}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#374151;text-align:right;font-variant-numeric:tabular-nums">${escapeHtml(fmtCurrency(t.contractAmount))}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#6b7280;text-align:right;font-variant-numeric:tabular-nums">${escapeHtml(fmtCurrency(t.previouslyDrawn))}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#141414;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${escapeHtml(fmtCurrency(t.thisDrawAmount))}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#374151;text-align:right">${t.percentComplete}%</td>
                <td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#6b7280;text-align:right;font-variant-numeric:tabular-nums">${escapeHtml(fmtCurrency(t.balance))}</td>
              </tr>`,
          )
          .join('');

        const html = `
<div style="font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;max-width:680px;margin:0 auto;color:#141414">
  <h1 style="font-size:22px;margin:0 0 4px 0">Draw Request #${drawNumber}</h1>
  <p style="margin:0 0 4px 0;color:#374151"><strong>${escapeHtml(projectName)}</strong></p>
  <p style="margin:0 0 16px 0;color:#6b7280;font-size:14px">${escapeHtml(period.periodLabel)} &middot; Process date ${escapeHtml(period.processDate)}</p>

  <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:16px 0;background:#fafafa">
    <div style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.04em">Total Draw</div>
    <div style="font-size:28px;font-weight:700;color:#C9A96E;margin-top:4px">${escapeHtml(fmtCurrency(totalDraw))}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:8px">
      Expenses: ${escapeHtml(fmtCurrency(recomputedTotal))}
      ${totalInvoices > 0 ? ` &middot; Invoices: ${escapeHtml(fmtCurrency(totalInvoices))}` : ''}
    </div>
  </div>

  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;margin:24px 0 8px 0">Trade breakdown</h2>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <thead>
      <tr style="background:#f9fafb">
        <th style="padding:8px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Category</th>
        <th style="padding:8px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase">Total Cost</th>
        <th style="padding:8px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase">Prev Drawn</th>
        <th style="padding:8px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase">This Draw</th>
        <th style="padding:8px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase">% Comp</th>
        <th style="padding:8px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase">Balance</th>
      </tr>
    </thead>
    <tbody>
      ${tradeHtmlRows || `<tr><td colspan="6" style="padding:12px;text-align:center;color:#9ca3af;font-size:12px">No trade activity</td></tr>`}
    </tbody>
  </table>

  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;margin:24px 0 8px 0">Itemized expenses (${items.length})</h2>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
    <thead>
      <tr style="background:#f9fafb">
        <th style="padding:8px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Date</th>
        <th style="padding:8px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Vendor</th>
        <th style="padding:8px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Category</th>
        <th style="padding:8px;text-align:right;font-size:11px;color:#6b7280;text-transform:uppercase">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${htmlRows || `<tr><td colspan="4" style="padding:12px;text-align:center;color:#9ca3af;font-size:12px">No expenses recorded</td></tr>`}
    </tbody>
  </table>

  <p style="margin:24px 0 4px 0;color:#374151">Payment is due per the contract terms.</p>
  <p style="color:#6b7280;font-size:12px;margin-top:32px">Skyeline Homes</p>
</div>`;

        let emailSent = false;
        let emailError: string | undefined;
        const sendgridKey = process.env.SENDGRID_API_KEY;
        const sendgridFrom = process.env.SENDGRID_FROM_EMAIL;
        if (sendgridKey && sendgridFrom && toList.length > 0) {
          try {
            sgMail.setApiKey(sendgridKey);
            await sgMail.send({
              to: toList,
              from: sendgridFrom,
              subject,
              text,
              html,
            });
            emailSent = true;
          } catch (e: any) {
            emailError = e?.message || String(e);
            console.error('[draw-periods/submit] sendgrid error:', emailError);
          }
        } else if (toList.length === 0) {
          emailError =
            'No client or bank email on file — draw marked submitted, no email sent.';
        } else {
          emailError =
            'SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL missing).';
        }

        // Mark submitted regardless of email outcome — the period state advances
        // and the user can resend later if SendGrid was misconfigured.
        await ref.update({
          status: 'submitted',
          submittedAt: admin.firestore.FieldValue.serverTimestamp(),
          totalExpenses: recomputedTotal,
          totalDraw,
          drawNumber,
          tradeLineItems,
          notes:
            (period.notes || '') +
            (emailError ? `\n[submit] ${emailError}` : ''),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // ── Push to QuickBooks Online (non-blocking) ────────────────────────
        // Mirror the just-submitted draw as a QBO Invoice. We deliberately
        // don't await this — QBO outages should never block the submit
        // (which has already emailed the client). pushDrawToQbo catches all
        // errors internally and writes qboInvoiceSynced / qboInvoiceSyncError
        // back to the period doc.
        pushDrawToQbo(
          db,
          {
            id: ref.id,
            projectId,
            drawNumber,
            periodLabel: period.periodLabel,
            processDate: period.processDate,
            tradeLineItems,
            totalDraw,
          },
          projectName,
          clientEmail,
        ).catch((err: any) => {
          console.error(
            '[draw-periods/submit] QBO push failed (non-blocking):',
            err?.message || err,
          );
        });

        const after = await ref.get();
        res.json({
          period: serializePeriod(after.id, after.data()),
          drawNumber,
          emailSent,
          emailError: emailError || null,
          recipientEmail: recipientEmail || null,
          itemCount: items.length,
        });
      } catch (err: any) {
        console.error('[draw-periods/submit] error:', err);
        res
          .status(500)
          .json({ error: err.message || 'Failed to submit draw' });
      }
    },
  );

  // POST /api/projects/:projectId/draw-periods/:periodId/mark-paid
  app.post(
    '/api/projects/:projectId/draw-periods/:periodId/mark-paid',
    requireFinance,
    requireProjectAccess,
    async (req: any, res: any) => {
      try {
        const uid: string = req.user?.uid;
        if (!uid) {
          res.status(401).json({ error: 'No uid' });
          return;
        }
        const projectId = String(req.params.projectId || '').trim();
        const periodId = String(req.params.periodId || '').trim();
        if (!projectId || !periodId) {
          res
            .status(400)
            .json({ error: 'projectId and periodId are required' });
          return;
        }
        const paidAmount = Number(req.body?.paidAmount);
        const paidDate = String(req.body?.paidDate || '').trim();
        const notes = String(req.body?.notes || '').trim();
        if (!Number.isFinite(paidAmount) || paidAmount < 0) {
          res
            .status(400)
            .json({ error: 'paidAmount must be a non-negative number' });
          return;
        }
        if (!paidDate || !parseYmd(paidDate)) {
          res
            .status(400)
            .json({ error: 'paidDate must be YYYY-MM-DD' });
          return;
        }

        const ref = db
          .collection('projects')
          .doc(projectId)
          .collection('drawPeriods')
          .doc(periodId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Draw period not found' });
          return;
        }
        const period = snap.data() as DrawPeriod;
        if (period.status !== 'submitted' && period.status !== 'open') {
          res.status(409).json({
            error: `Cannot mark paid: period status is '${period.status}'`,
          });
          return;
        }

        const update: Record<string, any> = {
          status: 'paid',
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          paidAmount,
          paidDate,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (notes) {
          update.notes = (period.notes || '') + `\n[mark-paid] ${notes}`;
        }
        await ref.update(update);
        const after = await ref.get();
        res.json(serializePeriod(after.id, after.data()));
      } catch (err: any) {
        console.error('[draw-periods/mark-paid] error:', err);
        res
          .status(500)
          .json({ error: err.message || 'Failed to mark paid' });
      }
    },
  );

  // POST /api/projects/:projectId/draw-periods/:periodId/reconcile
  app.post(
    '/api/projects/:projectId/draw-periods/:periodId/reconcile',
    requireFinance,
    requireProjectAccess,
    async (req: any, res: any) => {
      try {
        const uid: string = req.user?.uid;
        if (!uid) {
          res.status(401).json({ error: 'No uid' });
          return;
        }
        const projectId = String(req.params.projectId || '').trim();
        const periodId = String(req.params.periodId || '').trim();
        if (!projectId || !periodId) {
          res
            .status(400)
            .json({ error: 'projectId and periodId are required' });
          return;
        }
        const qboInvoiceId = String(req.body?.qboInvoiceId || '').trim() || null;

        const ref = db
          .collection('projects')
          .doc(projectId)
          .collection('drawPeriods')
          .doc(periodId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ error: 'Draw period not found' });
          return;
        }
        const period = snap.data() as DrawPeriod;
        if (period.status !== 'paid') {
          res.status(409).json({
            error: `Cannot reconcile: period status is '${period.status}' (must be 'paid')`,
          });
          return;
        }

        await ref.update({
          status: 'reconciled',
          reconciledAt: admin.firestore.FieldValue.serverTimestamp(),
          qboInvoiceId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const after = await ref.get();
        res.json(serializePeriod(after.id, after.data()));
      } catch (err: any) {
        console.error('[draw-periods/reconcile] error:', err);
        res
          .status(500)
          .json({ error: err.message || 'Failed to reconcile' });
      }
    },
  );
}
