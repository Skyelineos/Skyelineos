// expenseSync.ts — Push Skyeline expenses + draws into QuickBooks Online.
//
// Two entry points used by Express route handlers AFTER the underlying
// Firestore doc has already been written (so a QBO outage never blocks the
// Skyeline write):
//
//   pushExpenseToQbo(db, expense)
//     → creates a QBO Purchase (PaymentType: "CreditCard") for the expense.
//       Stores the returned Id back on the expense doc as `qboTransactionId`
//       plus `qboSynced: true`. On error sets `qboSyncError` and never throws.
//
//   pushDrawToQbo(db, draw, projectName, clientEmail)
//     → creates a QBO Invoice for a submitted draw period, one Line per
//       trade in `draw.tradeLineItems`. Stores Id as `qboInvoiceId` on the
//       projects/{projectId}/drawPeriods/{periodId} doc.
//
// Both functions are safe to call non-blocking from a request handler:
//
//     pushExpenseToQbo(db, expense).catch(err =>
//       console.error('[qbo] expense sync failed', err));
//
// They never throw — internal failures are caught, logged, and persisted on
// the source doc as `qboSyncError` so the UI can show a retry chip.

import type { firestore as adminFirestore } from 'firebase-admin';
import * as admin from 'firebase-admin';
import { qboRequest } from './qboClient';

// ── Types we only need shape from (mirrors expenseRoutes / drawRoutes) ──────

export interface SkyelineExpense {
  id: string;
  projectId: string;
  vendor: string;
  amount: number;
  date: string;          // YYYY-MM-DD
  description: string;
  tradeCategory: string;
  category: string;
}

export interface DrawTradeItem {
  trade: string;
  thisDrawAmount: number;
  percentComplete: number;
}

export interface SkyelineDraw {
  id: string;
  projectId: string;
  drawNumber: number;
  periodLabel: string;
  processDate: string;   // YYYY-MM-DD
  tradeLineItems: DrawTradeItem[];
  totalDraw: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function safeStr(v: any): string {
  return String(v == null ? '' : v).trim();
}

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Mark an expense's sync state on its Firestore doc.
 * Lives at projects/{projectId}/expenses/{expenseId}.
 */
async function markExpenseSync(
  db: adminFirestore.Firestore,
  projectId: string,
  expenseId: string,
  patch: Record<string, any>,
): Promise<void> {
  try {
    await db
      .collection('projects')
      .doc(projectId)
      .collection('expenses')
      .doc(expenseId)
      .set(
        {
          ...patch,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (err: any) {
    console.error(
      '[qbo/expenseSync] failed to write sync state to expense doc:',
      err?.message || err,
    );
  }
}

/**
 * Mark a draw period's QBO sync state on its Firestore doc.
 * Lives at projects/{projectId}/drawPeriods/{periodId}.
 */
async function markDrawSync(
  db: adminFirestore.Firestore,
  projectId: string,
  drawId: string,
  patch: Record<string, any>,
): Promise<void> {
  try {
    await db
      .collection('projects')
      .doc(projectId)
      .collection('drawPeriods')
      .doc(drawId)
      .set(
        {
          ...patch,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (err: any) {
    console.error(
      '[qbo/expenseSync] failed to write sync state to draw doc:',
      err?.message || err,
    );
  }
}

// ── Public: push an expense as a QBO Purchase ───────────────────────────────

/**
 * Create a QBO Purchase (credit-card expense) for a Skyeline expense doc.
 * Never throws — failure is logged and persisted on the expense as
 * `qboSyncError`. Returns the QBO Purchase Id on success, null on failure.
 */
export async function pushExpenseToQbo(
  db: adminFirestore.Firestore,
  expense: SkyelineExpense,
): Promise<string | null> {
  if (!expense || !expense.id || !expense.projectId) {
    console.error('[qbo/pushExpenseToQbo] missing expense id/projectId');
    return null;
  }
  const amount = Number(expense.amount) || 0;
  if (amount <= 0) {
    // Nothing meaningful to sync; record a soft-skip on the doc so the UI
    // knows we deliberately didn't push.
    await markExpenseSync(db, expense.projectId, expense.id, {
      qboSynced: false,
      qboSyncError: 'Skipped: expense amount is zero',
    });
    return null;
  }
  const vendor = safeStr(expense.vendor) || 'Unknown Vendor';
  const trade = safeStr(expense.tradeCategory) || safeStr(expense.category) || 'Construction';
  const txnDate = safeStr(expense.date) || todayIsoDate();
  const privateNote = safeStr(expense.description);

  const body = {
    PaymentType: 'CreditCard',
    TotalAmt: amount,
    TxnDate: txnDate,
    PrivateNote: privateNote,
    Line: [
      {
        Amount: amount,
        DetailType: 'AccountBasedExpenseLineDetail',
        AccountBasedExpenseLineDetail: {
          AccountRef: { name: 'Construction Costs' },
        },
        Description: `${vendor} - ${trade}`,
      },
    ],
    EntityRef: { type: 'Vendor', name: vendor },
  };

  try {
    const resp = await qboRequest(db, 'POST', 'purchase', body);
    const qboTransactionId: string | undefined = resp?.Purchase?.Id;
    if (!qboTransactionId) {
      throw new Error(
        `QBO Purchase response missing Id: ${JSON.stringify(resp)?.slice(0, 200)}`,
      );
    }
    await markExpenseSync(db, expense.projectId, expense.id, {
      qboTransactionId,
      qboSynced: true,
      qboSyncError: null,
      qboSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return qboTransactionId;
  } catch (err: any) {
    const msg =
      err?.body && typeof err.body === 'object'
        ? `${err.message} :: ${JSON.stringify(err.body).slice(0, 500)}`
        : err?.message || String(err);
    console.error('[qbo/pushExpenseToQbo] failed:', msg);
    await markExpenseSync(db, expense.projectId, expense.id, {
      qboSynced: false,
      qboSyncError: msg,
    });
    return null;
  }
}

// ── Public: push a submitted draw as a QBO Invoice ──────────────────────────

/**
 * Create a QBO Invoice for a Skyeline draw period. Never throws.
 *
 * - One Line per `tradeLineItems` entry that has a positive thisDrawAmount.
 * - CustomerRef matched by `name = projectName` (find-or-create on QBO side
 *   is handled by qbo/paymentLink.ts in the live flow; here we trust QBO to
 *   match by name when possible. If the customer doesn't exist QBO will
 *   error, surfaced via qboSyncError on the draw doc).
 */
export async function pushDrawToQbo(
  db: adminFirestore.Firestore,
  draw: SkyelineDraw,
  projectName: string,
  clientEmail?: string,
): Promise<string | null> {
  if (!draw || !draw.id || !draw.projectId) {
    console.error('[qbo/pushDrawToQbo] missing draw id/projectId');
    return null;
  }
  const items: DrawTradeItem[] = Array.isArray(draw.tradeLineItems)
    ? draw.tradeLineItems.filter((it) => Number(it?.thisDrawAmount) > 0)
    : [];

  if (items.length === 0) {
    await markDrawSync(db, draw.projectId, draw.id, {
      qboInvoiceSynced: false,
      qboInvoiceSyncError: 'Skipped: no trade line items with positive amount',
    });
    return null;
  }

  const lines = items.map((item) => {
    const amt = Number(item.thisDrawAmount) || 0;
    const pct = Number(item.percentComplete) || 0;
    return {
      Amount: amt,
      DetailType: 'SalesItemLineDetail',
      Description: `${item.trade} - ${pct}% complete`,
      SalesItemLineDetail: {
        ItemRef: { name: 'Construction Services' },
        UnitPrice: amt,
        Qty: 1,
      },
    };
  });

  const body: any = {
    Line: lines,
    CustomerRef: { name: safeStr(projectName) || 'Skyeline Project' },
    DueDate: safeStr(draw.processDate) || todayIsoDate(),
    PrivateNote: `Draw #${draw.drawNumber} - ${safeStr(draw.periodLabel)}`,
  };
  const email = safeStr(clientEmail);
  if (email) {
    body.BillEmail = { Address: email };
  }

  try {
    const resp = await qboRequest(db, 'POST', 'invoice', body);
    const qboInvoiceId: string | undefined = resp?.Invoice?.Id;
    if (!qboInvoiceId) {
      throw new Error(
        `QBO Invoice response missing Id: ${JSON.stringify(resp)?.slice(0, 200)}`,
      );
    }
    await markDrawSync(db, draw.projectId, draw.id, {
      qboInvoiceId,
      qboInvoiceSynced: true,
      qboInvoiceSyncError: null,
      qboInvoiceSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return qboInvoiceId;
  } catch (err: any) {
    const msg =
      err?.body && typeof err.body === 'object'
        ? `${err.message} :: ${JSON.stringify(err.body).slice(0, 500)}`
        : err?.message || String(err);
    console.error('[qbo/pushDrawToQbo] failed:', msg);
    await markDrawSync(db, draw.projectId, draw.id, {
      qboInvoiceSynced: false,
      qboInvoiceSyncError: msg,
    });
    return null;
  }
}
