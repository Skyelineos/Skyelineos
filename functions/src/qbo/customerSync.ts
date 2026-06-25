// customerSync.ts — QBO Customer/Job → Skyeline Project two-way sync.
//
// When a Customer/Job exists in QuickBooks, we want it to also exist as a
// Project in Skyeline OS so expenses, draws, and reconciliation can hang off
// the same identity on both sides.
//
// This module is shared by two callers:
//
//   syncQboCustomersToProjects(db)
//     Bulk-pull. Queries QBO for every active Customer (up to 1000), then
//     upserts each one into the Skyeline `projects` collection keyed by
//     `qboCustomerId`. New customers → new projects. Existing matches → patch
//     contact info / address / display name if they changed.
//
//   upsertQboCustomerAsProject(db, customer)
//     Single-customer upsert. Called by the Intuit webhook handler when a
//     Customer Create/Update event arrives so we only fetch + upsert the one
//     that changed.
//
// Match strategy: `projects.where('qboCustomerId', '==', customer.Id)`. We
// never collapse two QBO customers into one Skyeline project, and we never
// delete projects from QBO side — `Active=false` customers in QBO are just
// skipped on the bulk pull (the webhook still upserts whatever comes through).

import type { firestore as adminFirestore } from 'firebase-admin';
import * as admin from 'firebase-admin';
import { qboRequest } from './qboClient';

// ── QBO Customer shape (only the fields we read) ────────────────────────────

export interface QboCustomer {
  Id: string;
  DisplayName?: string;
  CompanyName?: string;
  Active?: boolean;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
  BillAddr?: {
    Line1?: string;
    Line2?: string;
    City?: string;
    CountrySubDivisionCode?: string; // state
    PostalCode?: string;
    Country?: string;
  };
}

export interface CustomerSyncStats {
  synced: number;
  created: number;
  updated: number;
  errors: number;
  errorDetails?: Array<{ qboCustomerId: string; error: string }>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function safeStr(v: any): string {
  return String(v == null ? '' : v).trim();
}

/**
 * Derive a single-line address from the QBO BillAddr object. Spec asks for
 * "Line1, City, State" — we keep that exact ordering and drop empty pieces.
 */
function formatBillAddr(addr: QboCustomer['BillAddr']): string {
  if (!addr) return '';
  return [addr.Line1, addr.City, addr.CountrySubDivisionCode]
    .map((v) => safeStr(v))
    .filter(Boolean)
    .join(', ');
}

/**
 * Build the Firestore patch that represents a QBO customer in our `projects`
 * shape. Used for both create (with extra defaults) and update (only the
 * mutable contact/address fields, no status reset).
 */
function customerToProjectFields(customer: QboCustomer): Record<string, any> {
  const displayName =
    safeStr(customer.DisplayName) ||
    safeStr(customer.CompanyName) ||
    `QBO Customer ${customer.Id}`;
  return {
    name: displayName,
    clientName: displayName,
    clientEmail: safeStr(customer.PrimaryEmailAddr?.Address),
    clientPhone: safeStr(customer.PrimaryPhone?.FreeFormNumber),
    address: formatBillAddr(customer.BillAddr),
  };
}

/**
 * Decide if an existing project doc needs an update vs. the latest QBO state.
 * We only mark "changed" when one of the synced fields differs — avoids
 * thrashing `updatedAt` on every webhook ping when nothing actually moved.
 */
function projectNeedsUpdate(
  existing: Record<string, any>,
  fields: Record<string, any>,
): boolean {
  const keys = ['name', 'clientName', 'clientEmail', 'clientPhone', 'address'];
  for (const k of keys) {
    if (safeStr(existing[k]) !== safeStr(fields[k])) return true;
  }
  return false;
}

// ── Public: single-customer upsert (used by webhook + bulk loop) ────────────

/**
 * Upsert one QBO customer as a Skyeline project. Returns 'created' | 'updated'
 * | 'unchanged' so the caller can tally stats.
 *
 * Never throws — errors are surfaced via the returned object so a bad single
 * customer doesn't kill a bulk sync.
 */
export async function upsertQboCustomerAsProject(
  db: adminFirestore.Firestore,
  customer: QboCustomer,
): Promise<{ result: 'created' | 'updated' | 'unchanged' | 'error'; projectId?: string; error?: string }> {
  if (!customer || !customer.Id) {
    return { result: 'error', error: 'Missing customer.Id' };
  }
  const fields = customerToProjectFields(customer);
  try {
    const existing = await db
      .collection('projects')
      .where('qboCustomerId', '==', String(customer.Id))
      .limit(1)
      .get();

    if (existing.empty) {
      const docRef = await db.collection('projects').add({
        ...fields,
        status: 'active',
        qboCustomerId: String(customer.Id),
        qboSyncedAt: admin.firestore.Timestamp.now(),
        source: 'qbo_import',
        createdAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      });
      return { result: 'created', projectId: docRef.id };
    }

    const doc = existing.docs[0];
    const data = doc.data() || {};
    if (!projectNeedsUpdate(data, fields)) {
      // Touch qboSyncedAt so the UI can show "last seen from QBO" without
      // bumping updatedAt (which other parts of the app treat as a real edit).
      await doc.ref.set(
        { qboSyncedAt: admin.firestore.Timestamp.now() },
        { merge: true },
      );
      return { result: 'unchanged', projectId: doc.id };
    }

    await doc.ref.set(
      {
        ...fields,
        qboSyncedAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.Timestamp.now(),
      },
      { merge: true },
    );
    return { result: 'updated', projectId: doc.id };
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(
      '[qbo/customerSync] upsert failed for customer',
      customer.Id,
      msg,
    );
    return { result: 'error', error: msg };
  }
}

// ── Public: bulk QBO → Skyeline customer pull ───────────────────────────────

/**
 * Pull every active QBO Customer and upsert each as a Skyeline project.
 *
 * Returns a stats summary so the admin UI can show
 *   "✓ 12 projects synced (3 new, 9 updated)".
 *
 * Throws { code: 'not_connected' } if QBO isn't linked — the caller decides
 * whether to surface that as a 409 to the UI.
 */
export async function syncQboCustomersToProjects(
  db: adminFirestore.Firestore,
): Promise<CustomerSyncStats> {
  const stats: CustomerSyncStats = {
    synced: 0,
    created: 0,
    updated: 0,
    errors: 0,
    errorDetails: [],
  };

  // QBO query is SQL-ish; single-quoted literals; MAXRESULTS caps at 1000.
  // Active=true filters out archived customers. Pagination beyond 1000 is
  // intentionally out of scope here — a single bulk pull covers Skyeline's
  // current book of business with headroom.
  const queryStr =
    `SELECT * FROM Customer WHERE Active = true MAXRESULTS 1000`;
  const resp = await qboRequest(
    db,
    'GET',
    `query?query=${encodeURIComponent(queryStr)}`,
  );
  const customers: QboCustomer[] = Array.isArray(resp?.QueryResponse?.Customer)
    ? resp.QueryResponse.Customer
    : [];

  for (const customer of customers) {
    const { result, error } = await upsertQboCustomerAsProject(db, customer);
    if (result === 'created') {
      stats.created += 1;
      stats.synced += 1;
    } else if (result === 'updated') {
      stats.updated += 1;
      stats.synced += 1;
    } else if (result === 'unchanged') {
      stats.synced += 1;
    } else {
      stats.errors += 1;
      stats.errorDetails!.push({
        qboCustomerId: String(customer.Id || ''),
        error: error || 'unknown',
      });
    }
  }
  if (stats.errorDetails && stats.errorDetails.length === 0) {
    delete stats.errorDetails;
  }
  return stats;
}
