// Bridges the "Recommended For You" layer to the project task system.
//
// Clients can't create or complete projectTasks directly (those writes are
// GC-only by Firestore rule), so this trigger does it with admin privileges:
//
//   • status → 'removed'      → create a client "upload a photo" projectTask +
//                               stamp the task id back on the recommendation +
//                               notify the designers/admins.
//   • client uploads a photo  → mark that projectTask Complete (with the photo) +
//                               notify the designers/admins.
//   • client undoes a removal → skip the dangling task.
//
// Each write-back is guarded so the resulting re-trigger is a no-op (no loops).

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

/** Notify every admin + designer about a client recommendation event. */
async function notifyDesigners(opts: {
  projectId: string; title: string; body: string; link: string; recId: string;
}): Promise<void> {
  const snap = await db.collection('users').where('role', 'in', ['admin', 'designer', 'gc', 'projectManager']).get();
  if (snap.empty) return;
  const batch = db.batch();
  const col = db.collection('notifications');
  snap.docs.forEach(u => {
    batch.set(col.doc(), {
      userId: u.id,
      kind: 'system',
      title: opts.title,
      body: opts.body,
      link: opts.link,
      projectId: opts.projectId,
      refType: 'task',
      refId: opts.recId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

export const recommendationTaskBridge = onDocumentWritten(
  'projects/{projectId}/selectionRecommendations/{recId}',
  async (event) => {
    const { projectId, recId } = event.params as { projectId: string; recId: string };
    const after = event.data?.after;
    if (!after || !after.exists) return; // deleted — nothing to do
    const rec = after.data() as any;
    const before = event.data?.before?.exists ? (event.data.before.data() as any) : null;

    const recRef = db.doc(`projects/${projectId}/selectionRecommendations/${recId}`);
    const label = [rec.room, rec.category].filter(Boolean).join(' · ') || rec.category || 'a selection';

    // ── 1. "Not for me" → create the client upload task ──────────────────────
    if (rec.status === 'removed' && !rec.taskId && before?.status !== 'removed') {
      const taskRef = db.collection('projectTasks').doc();
      await taskRef.set({
        projectId,
        masterTaskId: null,
        masterVersionUsed: 0,
        taskCode: 'REC-UPLOAD',
        title: `Upload a photo: ${rec.category} you'd like`,
        description: `You set aside our recommendation for ${label} ("${rec.title}"). When you're ready, upload a photo of what you'd like instead so your designer can match it.`,
        phase: 'Design',
        assignedRole: 'client',
        assignedUserId: null,
        assignedSubcontractorId: null,
        status: 'In Progress',
        priority: 'medium',
        startDate: null,
        dueDate: null,
        completedAt: null,
        dependencies: [],
        acceptanceCriteria: [],
        requiredPhotos: 1,
        uploadedPhotos: [],
        requiredDocuments: [],
        uploadedDocuments: [],
        inspectionRequired: false,
        inspectionStatus: 'not_required',
        drawMilestoneRelevant: false,
        clientVisible: true,
        subcontractorVisible: false,
        designerVisible: true,
        projectSpecificNotes: `Linked to recommendation ${recId}`,
        changeReason: '',
        isCustomTask: true,
        qualityGate: false,
        riskLevel: 'low',
        tags: ['recommendation', 'client-upload'],
        order: 0,
        inspectionId: null,
        drawRequestId: null,
        changeOrderId: null,
        clientSelectionId: null,
        recommendationId: recId,
        subcontractorId: null,
        warrantyItemId: null,
        scheduleTaskId: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      await recRef.update({ taskId: taskRef.id, updatedAt: FieldValue.serverTimestamp() });

      await notifyDesigners({
        projectId,
        title: 'Client redirected a recommendation',
        body: `They set aside "${rec.title}" for ${label} and will upload a photo of what they'd like.`,
        link: '/client-portal/design',
        recId,
      });
      return;
    }

    // ── 2. Client uploaded their redirect photo → complete the task ──────────
    const photoJustAdded = !!rec.clientPhotoUrl && before?.clientPhotoUrl !== rec.clientPhotoUrl;
    if (photoJustAdded) {
      if (rec.taskId) {
        try {
          await db.collection('projectTasks').doc(rec.taskId).update({
            status: 'Complete',
            completedAt: FieldValue.serverTimestamp(),
            uploadedPhotos: FieldValue.arrayUnion({ url: rec.clientPhotoUrl, path: rec.clientPhotoPath || '' }),
            updatedAt: FieldValue.serverTimestamp(),
          });
        } catch (e) {
          console.warn('[recommendationTaskBridge] could not complete task', rec.taskId, e);
        }
      }
      await notifyDesigners({
        projectId,
        title: 'Client uploaded a photo',
        body: `For ${label}: ${rec.clientNote ? `"${rec.clientNote}"` : 'see their photo in the Design Studio.'}`,
        link: '/client-portal/design',
        recId,
      });
      return;
    }

    // ── 3. Client undid a removal before uploading → skip the dangling task ──
    if (before?.status === 'removed' && rec.status !== 'removed' && !rec.clientPhotoUrl && rec.taskId) {
      try {
        await db.collection('projectTasks').doc(rec.taskId).update({
          status: 'Skipped',
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.warn('[recommendationTaskBridge] could not skip task', rec.taskId, e);
      }
      await recRef.update({ taskId: null, updatedAt: FieldValue.serverTimestamp() });
      return;
    }
  },
);
