// When a project's moveInDate is set (or changed) we auto-create four
// reminders for Tyler's dashboard at 3, 6, 11, and 12 months from move-in.
//   3mo  → general check-in: "everything working?"
//   6mo  → drywall touch-up walkthrough
//   11mo → final walkthrough before warranty expires
//   12mo → warranty expires + ask for Google review
//
// Idempotent: tags the project doc with `warrantyRemindersCreatedForMoveIn`
// so we don't duplicate on every project write.

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const WARRANTY_MILESTONES: Array<{ months: number; kind: string }> = [
  { months: 3,  kind: 'warranty_3mo' },
  { months: 6,  kind: 'warranty_6mo' },
  { months: 11, kind: 'warranty_11mo' },
  { months: 12, kind: 'warranty_12mo' },
];

export const createWarrantyReminders = onDocumentWritten(
  'projects/{projectId}',
  async (event) => {
    const after = event.data?.after?.data() as any;
    const before = event.data?.before?.data() as any;
    if (!after) return;

    const moveInDate = after.moveInDate;
    if (!moveInDate) return;

    // Skip if moveInDate didn't change AND reminders already created for
    // this exact date.
    const beforeDate = before?.moveInDate;
    const tagDate = after.warrantyRemindersCreatedForMoveIn;
    if (tagDate === moveInDate) return;
    if (beforeDate === moveInDate && tagDate === moveInDate) return;

    const projectId = event.params.projectId;
    const projectName = after.name || '';
    const ownerUid = after.ownerUid || after.createdBy || null;

    console.log(`[warrantyReminders] creating for project ${projectId} (moveIn ${moveInDate})`);

    // Delete any prior auto-warranty reminders for this project (in case
    // the move-in date shifted — we re-create with the new dates).
    try {
      const prior = await db.collection('reminders')
        .where('projectId', '==', projectId)
        .where('kindSet', '==', 'warranty')
        .get();
      const batch = db.batch();
      prior.docs.forEach(d => batch.delete(d.ref));
      if (!prior.empty) await batch.commit();
    } catch (e) {
      console.error('[warrantyReminders] failed to clear prior reminders:', e);
    }

    // Create the four new ones.
    try {
      for (const m of WARRANTY_MILESTONES) {
        await db.collection('reminders').add({
          kind: m.kind,
          kindSet: 'warranty',
          projectId,
          projectName,
          ownerUid,
          dueAt: addMonths(moveInDate, m.months),
          status: 'open',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: 'system:warrantyReminders',
        });
      }
      // Tag the project so subsequent writes don't re-run this work.
      await event.data!.after!.ref.update({
        warrantyRemindersCreatedForMoveIn: moveInDate,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('[warrantyReminders] failed to create reminders:', e);
    }
  },
);
