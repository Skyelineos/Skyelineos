/**
 * Firestore trigger — fires when a selection doc is created or updated.
 *
 * Use cases:
 *  - Designer publishes a recommendation → notify the client immediately
 *  - Client approves a selection → notify the designer + builder
 *  - Selection moves to "Ordered" → notify the builder
 *
 * Writes an in-app notification doc and (optionally) sends an email when
 * the change is "interesting." SMS is reserved for the daily digest /
 * overdue path.
 */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendTransactionalEmail } from '../email/sendTransactionalEmail';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const onSelectionUpdated = functions.firestore
  .document('projects/{projectId}/selections/{selectionId}')
  .onWrite(async (change, context) => {
    const { projectId, selectionId } = context.params;
    const before = change.before.exists ? (change.before.data() as any) : null;
    const after = change.after.exists ? (change.after.data() as any) : null;
    if (!after) return null; // deletion, nothing to do

    const projSnap = await db.collection('projects').doc(projectId).get();
    if (!projSnap.exists) return null;
    const project = projSnap.data() as any;

    // 1) Designer just published a recommendation
    const wasRecPublished = before?.recommendationPublished === true;
    const isRecPublished = after.recommendationPublished === true;
    if (isRecPublished && !wasRecPublished && project.clientId) {
      await notify({
        uid: project.clientId,
        type: 'designer_recommendation',
        projectId,
        projectName: project.name,
        title: `${after.recommendationByName || 'Your designer'} added a recommendation`,
        body: `${after.item}: ${after.recommendationByName || 'your designer'} picked an option for you to review.`,
        link: `/client-portal/selections?focus=${selectionId}`,
      });
      // Optional email
      await maybeEmail({
        uid: project.clientId,
        subject: `${after.recommendationByName || 'Your designer'} recommends an option for your ${after.room || 'project'}`,
        item: after.item,
        cta: 'Review and approve',
        link: `https://app.skyelineos.com/client-portal/selections?focus=${selectionId}`,
      });
    }

    // 2) Client just approved
    const wasApproved = before?.clientApprovalStatus === 'Approved';
    const isApproved = after.clientApprovalStatus === 'Approved';
    if (isApproved && !wasApproved) {
      // Notify designer
      if (project.assignedDesignerId) {
        await notify({
          uid: project.assignedDesignerId,
          type: 'client_approved',
          projectId,
          projectName: project.name,
          title: `Client approved: ${after.item}`,
          body: `Approved on ${project.name}. Ready to order.`,
          link: `/designer-portal/selections?project=${projectId}&focus=${selectionId}`,
        });
      }
      // Notify builder
      if (project.assignedBuilderId) {
        await notify({
          uid: project.assignedBuilderId,
          type: 'client_approved',
          projectId,
          projectName: project.name,
          title: `Approved: ${after.item}`,
          body: `Client approved this on ${project.name}.`,
        });
      }
    }

    // 3) Status moved to Ordered → notify builder
    const wasOrdered = before?.status === 'Ordered';
    const isOrdered = after.status === 'Ordered';
    if (isOrdered && !wasOrdered && project.assignedBuilderId) {
      await notify({
        uid: project.assignedBuilderId,
        type: 'selection_ordered',
        projectId,
        projectName: project.name,
        title: `Ordered: ${after.item}`,
        body: `${after.item} for ${after.room} on ${project.name} has been ordered.`,
      });
    }

    return null;
  });

async function notify(args: {
  uid: string;
  type: string;
  projectId: string;
  projectName: string;
  title: string;
  body: string;
  link?: string;
}) {
  const { uid, ...rest } = args;
  await db.collection(`users/${uid}/notifications`).add({
    ...rest,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function maybeEmail(args: {
  uid: string;
  subject: string;
  item: string;
  cta: string;
  link: string;
}) {
  const u = await db.collection('users').doc(args.uid).get();
  if (!u.exists) return;
  const user = u.data() as any;
  const prefs = user.notificationPreferences || {};
  if (prefs.selectionsEmail === false || !user.email) return;
  try {
    await sendTransactionalEmail({
      toEmail: user.email,
      toName: user.displayName || user.name || 'there',
      subject: args.subject,
      html: `
        <p>Hi ${user.displayName || user.name || 'there'},</p>
        <p>A new design selection is ready for your review on Skyeline:</p>
        <p style="font-size:18px;font-weight:600;margin:16px 0;">${args.item}</p>
        <p>
          <a href="${args.link}" style="background:#C9A96E;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">${args.cta}</a>
        </p>
        <p style="color:#666;font-size:12px;margin-top:24px;">
          You can change which selection emails you receive in your portal settings.
        </p>
      `,
    });
  } catch (err) {
    functions.logger.error('Transactional email failed', { uid: args.uid, err });
  }
}
