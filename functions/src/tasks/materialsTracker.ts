// Materials Tracker
//
// Owns the lifecycle of `material_orders/{id}`. Orders are seeded by
// projectTaskEngine.generateProjectTaskList in NEEDED state. From there:
//
//   NEEDED  → markMaterialOrdered → ORDERED   (vendor + expectedDelivery set,
//                                              followUpDate auto-scheduled
//                                              for 2 days before delivery)
//   ORDERED → markMaterialConfirmed         (vendor confirms expectedDelivery)
//   ORDERED → markMaterialDelivered          (actual arrived; clears followUp)
//   ORDERED → markMaterialDelayed           (new expectedDelivery + note;
//                                            followUpDate auto-rescheduled)
//
// getMaterialsNeedingAction is the daily-workflow query: returns the
// overdue (past expectedDelivery and not delivered), followUpToday
// (followUpDate ≤ today and not delivered), and upcoming (orderByDate within
// 7 days and still NEEDED).

import type { Firestore } from 'firebase-admin/firestore';
import { TradeType } from './phaseCatalog';

export type MaterialStatus =
  | 'NEEDED'         // task is queued; need to place the order
  | 'ORDERED'        // PO out to vendor; awaiting confirmation
  | 'CONFIRMED'      // vendor confirmed expected delivery
  | 'DELIVERED'      // material on site
  | 'DELAYED';       // vendor pushed delivery — see notes

export interface MaterialOrder {
  id?: string;
  projectId: string;
  taskId: string;
  category: string;
  description: string;
  vendorContactId: string | null;
  vendorName: string;
  vendorTradeType?: TradeType;
  status: MaterialStatus;
  orderByDate?: string;     // when Tyler should hit the vendor (computed)
  orderDate?: string;       // when the order was actually placed
  expectedDelivery?: string;
  actualDelivery?: string;
  notes?: string | null;
  needsFollowUp: boolean;
  followUpDate?: string;    // expectedDelivery - 2 days, auto-set
  createdAt?: string;
  updatedAt?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function todayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isBefore(iso: string | undefined, cutoffIso: string): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < new Date(cutoffIso).getTime();
}

function isWithinDays(iso: string | undefined, days: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  const now = Date.now();
  const horizon = now + days * 24 * 60 * 60 * 1000;
  return t >= now && t <= horizon;
}

// ── getMaterialsNeedingAction ────────────────────────────────────────────────
// Bucketed view for Tyler's morning digest. We pull all material_orders for
// the project (not filtered by status server-side, because we need to bucket
// based on a mix of dates + status) and slice in memory. Per-project, this
// list is bounded — a single house is ~50-100 material rows total.
export async function getMaterialsNeedingAction(
  db: Firestore,
  projectId: string,
): Promise<{
  overdue: MaterialOrder[];
  followUpToday: MaterialOrder[];
  upcoming: MaterialOrder[];
  delivered: MaterialOrder[];
}> {
  const snap = await db
    .collection('material_orders')
    .where('projectId', '==', projectId)
    .get();

  const overdue: MaterialOrder[] = [];
  const followUpToday: MaterialOrder[] = [];
  const upcoming: MaterialOrder[] = [];
  const delivered: MaterialOrder[] = [];
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const endOfTodayIso = now.toISOString();

  snap.forEach((doc) => {
    const m = { id: doc.id, ...(doc.data() as any) } as MaterialOrder;
    if (m.status === 'DELIVERED') {
      delivered.push(m);
      return;
    }

    // Overdue: past expectedDelivery AND not yet delivered
    if (
      (m.status === 'ORDERED' || m.status === 'CONFIRMED' || m.status === 'DELAYED') &&
      m.expectedDelivery &&
      isBefore(m.expectedDelivery, todayStartIso())
    ) {
      overdue.push(m);
      return;
    }

    // Follow-up today: followUpDate ≤ end of today
    if (
      m.needsFollowUp &&
      m.followUpDate &&
      new Date(m.followUpDate).getTime() <= now.getTime()
    ) {
      followUpToday.push(m);
      return;
    }

    // Upcoming: NEEDED with orderByDate inside next 7 days
    if (m.status === 'NEEDED' && m.orderByDate && isWithinDays(m.orderByDate, 7)) {
      upcoming.push(m);
      return;
    }

    // Also surface ORDERED/CONFIRMED with expectedDelivery in next 3 days
    if (
      (m.status === 'ORDERED' || m.status === 'CONFIRMED') &&
      m.expectedDelivery &&
      isWithinDays(m.expectedDelivery, 3)
    ) {
      upcoming.push(m);
    }
  });

  // Sort each bucket by the most relevant date for that bucket.
  overdue.sort((a, b) => (a.expectedDelivery || '').localeCompare(b.expectedDelivery || ''));
  followUpToday.sort((a, b) => (a.followUpDate || '').localeCompare(b.followUpDate || ''));
  upcoming.sort((a, b) =>
    (a.orderByDate || a.expectedDelivery || '').localeCompare(
      b.orderByDate || b.expectedDelivery || '',
    ),
  );

  return { overdue, followUpToday, upcoming, delivered };
}

// ── markMaterialOrdered ──────────────────────────────────────────────────────
// Tyler placed the order. Records vendor + expectedDelivery and auto-schedules
// a follow-up for 2 days before the expected arrival.
export async function markMaterialOrdered(
  db: Firestore,
  materialId: string,
  vendorContactId: string,
  expectedDelivery: Date,
): Promise<void> {
  const ref = db.collection('material_orders').doc(materialId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`material order ${materialId} not found`);

  // Look up vendor name from sms_contacts (best-effort). If not found, fall
  // back to the existing vendorName so we don't blow away a manual edit.
  let vendorName = '';
  const vendorSnap = await db.collection('sms_contacts').doc(vendorContactId).get();
  if (vendorSnap.exists) {
    vendorName = vendorSnap.data()?.name || '';
  }

  // Follow-up 2 days before delivery (or today if delivery is sooner).
  const followUp = new Date(expectedDelivery);
  followUp.setDate(followUp.getDate() - 2);
  if (followUp.getTime() < Date.now()) {
    followUp.setTime(Date.now());
  }

  await ref.update({
    status: 'ORDERED',
    vendorContactId,
    vendorName: vendorName || snap.data()?.vendorName || '',
    orderDate: new Date().toISOString(),
    expectedDelivery: expectedDelivery.toISOString(),
    needsFollowUp: true,
    followUpDate: followUp.toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

// ── markMaterialConfirmed ────────────────────────────────────────────────────
export async function markMaterialConfirmed(
  db: Firestore,
  materialId: string,
  expectedDelivery?: Date,
): Promise<void> {
  const update: any = {
    status: 'CONFIRMED',
    needsFollowUp: false,
    updatedAt: new Date().toISOString(),
  };
  if (expectedDelivery) {
    update.expectedDelivery = expectedDelivery.toISOString();
    const followUp = new Date(expectedDelivery);
    followUp.setDate(followUp.getDate() - 1);
    update.followUpDate = followUp.toISOString();
    update.needsFollowUp = true;
  }
  await db.collection('material_orders').doc(materialId).update(update);
}

// ── markMaterialDelivered ────────────────────────────────────────────────────
export async function markMaterialDelivered(
  db: Firestore,
  materialId: string,
  actualDelivery: Date = new Date(),
): Promise<void> {
  await db.collection('material_orders').doc(materialId).update({
    status: 'DELIVERED',
    actualDelivery: actualDelivery.toISOString(),
    needsFollowUp: false,
    followUpDate: null,
    updatedAt: new Date().toISOString(),
  });
}

// ── markMaterialDelayed ──────────────────────────────────────────────────────
export async function markMaterialDelayed(
  db: Firestore,
  materialId: string,
  newExpectedDelivery: Date,
  reason: string,
): Promise<void> {
  const followUp = new Date(newExpectedDelivery);
  followUp.setDate(followUp.getDate() - 2);
  await db.collection('material_orders').doc(materialId).update({
    status: 'DELAYED',
    expectedDelivery: newExpectedDelivery.toISOString(),
    needsFollowUp: true,
    followUpDate: followUp.toISOString(),
    notes: reason,
    updatedAt: new Date().toISOString(),
  });
}

// ── humanizeMaterialAction ───────────────────────────────────────────────────
// Used by the daily workflow route to surface a one-line directive in
// Tyler's voice. Mirrors the style guide's "Hey just checking in on…" /
// "Order now — needed in 3 days" cadence.
export function humanizeMaterialAction(m: MaterialOrder): string {
  const now = new Date();
  if (m.status === 'NEEDED') {
    if (m.orderByDate) {
      const days = Math.ceil(
        (new Date(m.orderByDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (days <= 0) return `Order now — past order-by date`;
      if (days <= 3) return `Order now — needed in ${days} day${days === 1 ? '' : 's'}`;
      return `Order within ${days} days`;
    }
    return 'Order needed';
  }
  if (m.status === 'ORDERED') {
    if (m.expectedDelivery) {
      const days = Math.ceil(
        (new Date(m.expectedDelivery).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (days < 0) return `Overdue — delivery expected ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
      if (days === 0) return 'Follow up — delivery expected today';
      if (days <= 2) return `Follow up — delivery expected in ${days} day${days === 1 ? '' : 's'}`;
      return `Delivery expected in ${days} days`;
    }
    return 'Confirm vendor delivery date';
  }
  if (m.status === 'CONFIRMED') {
    if (m.expectedDelivery) {
      const days = Math.ceil(
        (new Date(m.expectedDelivery).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      if (days < 0) return `Overdue — confirmed for ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
      if (days === 0) return 'Delivery today';
      return `Confirmed — delivery in ${days} day${days === 1 ? '' : 's'}`;
    }
    return 'Confirmed';
  }
  if (m.status === 'DELAYED') return `Delayed — ${m.notes || 'reschedule with vendor'}`;
  if (m.status === 'DELIVERED') return 'On site';
  return '';
}
