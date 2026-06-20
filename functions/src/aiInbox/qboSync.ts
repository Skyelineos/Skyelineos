// AI Inbox → QuickBooks Online sync.
//
// Runs ONLY after a human approves an item. Per Tyler's decision:
//   - vendor_invoice  → A/P Bill   (Skyeline owes it, pays later)
//   - receipt / home_depot_receipt / bank_alert → Purchase/Expense (already paid)
//   - everything else → no QBO entity (skipped)
//
// Writes to whatever company is connected at qboConnections/global (sandbox or
// production — never hardcoded). Idempotent: the created entity's id is cached
// on the inbox item, so a repeat approve does not double-post.

import type { firestore as adminFirestore } from 'firebase-admin';
import { getValidToken, qbo, qboEsc, QboToken } from '../qbo/client';
import { AiInboxExtraction, qboEntityForCategory, QboEntityType } from './types';

export interface QboSyncResult {
  entityType: QboEntityType;
  entityId?: string;
  skipped?: boolean;
  reason?: string;
}

// Find or create a Vendor by display name.
async function ensureVendor(token: QboToken, name: string): Promise<string> {
  const display = (name || '').trim() || 'Unknown Vendor';
  const found = await qbo(token, 'query', {
    query: `select Id from Vendor where DisplayName = '${qboEsc(display)}'`,
  });
  const existing = found?.QueryResponse?.Vendor?.[0]?.Id;
  if (existing) return existing;
  const created = await qbo(token, 'vendor', { method: 'POST', body: { DisplayName: display } });
  return created?.Vendor?.Id;
}

// Resolve an expense account id from a suggested name; fall back to the first
// active expense/COGS account on file.
async function resolveExpenseAccount(token: QboToken, suggestion: string | null): Promise<string> {
  if (suggestion && suggestion.trim()) {
    const byName = await qbo(token, 'query', {
      query: `select Id, AccountType from Account where Name = '${qboEsc(suggestion.trim())}' and Active = true maxresults 1`,
    });
    const hit = byName?.QueryResponse?.Account?.[0]?.Id;
    if (hit) return hit;
  }
  const found = await qbo(token, 'query', {
    query:
      "select Id from Account where AccountType in ('Expense','Cost of Goods Sold','Other Expense') and Active = true maxresults 1",
  });
  const id = found?.QueryResponse?.Account?.[0]?.Id;
  if (!id) {
    throw Object.assign(new Error('No expense account exists in QuickBooks to book this to.'), { code: 'qbo_setup' });
  }
  return id;
}

// First active bank (or credit-card) account — the "paid from" account for a
// Purchase/Expense.
async function firstPaymentAccount(token: QboToken): Promise<string> {
  const bank = await qbo(token, 'query', {
    query: "select Id from Account where AccountType = 'Bank' and Active = true maxresults 1",
  });
  const bankId = bank?.QueryResponse?.Account?.[0]?.Id;
  if (bankId) return bankId;
  const card = await qbo(token, 'query', {
    query: "select Id from Account where AccountType = 'Credit Card' and Active = true maxresults 1",
  });
  const cardId = card?.QueryResponse?.Account?.[0]?.Id;
  if (!cardId) {
    throw Object.assign(new Error('No bank or credit-card account exists in QuickBooks to pay this from.'), { code: 'qbo_setup' });
  }
  return cardId;
}

export async function syncApprovedItemToQbo(
  db: adminFirestore.Firestore,
  extraction: AiInboxExtraction,
): Promise<QboSyncResult> {
  const entityType = qboEntityForCategory(extraction.category);
  if (entityType === 'none') {
    return { entityType: 'none', skipped: true, reason: 'Not a financial category' };
  }
  const amount = Number(extraction.amountUsd);
  if (!amount || amount <= 0) {
    return { entityType, skipped: true, reason: 'No positive amount to post' };
  }

  const token = await getValidToken(db);
  const expenseAccountId = await resolveExpenseAccount(token, extraction.qboAccountSuggestion);
  const memo = [extraction.summary, extraction.invoiceNumber ? `Inv ${extraction.invoiceNumber}` : '', extraction.projectName || '']
    .filter(Boolean)
    .join(' · ')
    .slice(0, 1000);

  if (entityType === 'Bill') {
    const vendorId = await ensureVendor(token, extraction.vendorName || 'Unknown Vendor');
    const created = await qbo(token, 'bill', {
      method: 'POST',
      body: {
        VendorRef: { value: vendorId },
        ...(extraction.dueDate ? { DueDate: extraction.dueDate } : {}),
        ...(extraction.documentDate ? { TxnDate: extraction.documentDate } : {}),
        ...(extraction.invoiceNumber ? { DocNumber: String(extraction.invoiceNumber).slice(0, 21) } : {}),
        PrivateNote: memo,
        Line: [{
          Amount: amount,
          DetailType: 'AccountBasedExpenseLineDetail',
          Description: memo,
          AccountBasedExpenseLineDetail: { AccountRef: { value: expenseAccountId } },
        }],
      },
    });
    return { entityType, entityId: created?.Bill?.Id };
  }

  // Purchase / Expense (already paid).
  const paymentAccountId = await firstPaymentAccount(token);
  let entityRef: any = undefined;
  if (extraction.vendorName) {
    const vendorId = await ensureVendor(token, extraction.vendorName);
    entityRef = { EntityRef: { value: vendorId, type: 'Vendor' } };
  }
  const created = await qbo(token, 'purchase', {
    method: 'POST',
    body: {
      PaymentType: 'Cash',
      AccountRef: { value: paymentAccountId },
      ...(extraction.documentDate ? { TxnDate: extraction.documentDate } : {}),
      PrivateNote: memo,
      Line: [{
        Amount: amount,
        DetailType: 'AccountBasedExpenseLineDetail',
        Description: memo,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: expenseAccountId },
          ...(entityRef ? entityRef : {}),
        },
      }],
    },
  });
  return { entityType, entityId: created?.Purchase?.Id };
}
