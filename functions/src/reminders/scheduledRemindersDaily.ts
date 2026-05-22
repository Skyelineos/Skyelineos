/**
 * Daily scheduled Cloud Function — fires every morning at 8am Mountain Time.
 *
 * For each active project:
 *  1. Pulls every selection whose phase deadline is within reminder windows
 *     (overdue, due in 3 days, due in 7 days, due in 14 days)
 *  2. Groups them by recipient (client, designer, builder)
 *  3. Sends one digest email per recipient (avoids spam)
 *  4. For overdue items only: also sends an SMS to the client and writes an
 *     in-app notification doc
 *
 * Deploy:
 *   firebase deploy --only functions:scheduledSelectionRemindersDaily
 */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { sendSelectionReminderEmail } from '../email/sendReminderEmail';
import { sendSelectionReminderSms } from '../sms/sendSelectionSms';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

interface Project {
  id: string;
  name: string;
  clientId?: string;
  assignedDesignerId?: string;
  assignedBuilderId?: string;
  assignedUserIds?: string[];
  status?: string;
  phaseDeadlines?: Record<string, FirebaseFirestore.Timestamp>;
}

interface SelectionDoc {
  id: string;
  category?: string;
  item?: string;
  room?: string;
  phase?: string;
  status?: string;
  clientApprovalStatus?: string;
  decisionOwner?: string;
}

interface ReminderItem extends SelectionDoc {
  projectId: string;
  projectName: string;
  daysUntilDue: number; // negative = overdue
  dueDate: Date;
}

const ACTIVE_STATUSES = ['Not Started', 'In Discussion'];
const COMPLETED_APPROVAL = ['Approved'];

export const scheduledSelectionRemindersDaily = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .pubsub.schedule('0 8 * * *')
  .timeZone('America/Denver')
  .onRun(async () => {
    const startedAt = Date.now();
    functions.logger.info('Starting daily selection reminders');

    // Fetch all active projects
    const projSnap = await db.collection('projects')
      .where('status', 'in', ['active', 'in-progress', 'design', 'construction'])
      .get();

    if (projSnap.empty) {
      functions.logger.info('No active projects, nothing to do');
      return null;
    }

    let totalReminders = 0;
    let totalEmailsSent = 0;
    let totalSmsSent = 0;

    for (const projDoc of projSnap.docs) {
      const project = { id: projDoc.id, ...projDoc.data() } as Project;
      const phaseDeadlines = project.phaseDeadlines || {};

      // Pull selections for this project
      const selSnap = await db.collection(`projects/${project.id}/selections`).get();

      // Group items by recipient
      const clientItems: ReminderItem[] = [];
      const designerItems: ReminderItem[] = [];
      const builderItems: ReminderItem[] = [];

      const now = new Date();
      for (const s of selSnap.docs) {
        const sel = { id: s.id, ...s.data() } as SelectionDoc;
        if (!sel.phase) continue;
        const phaseDl = phaseDeadlines[sel.phase];
        if (!phaseDl) continue;
        const dueDate = phaseDl.toDate();
        const daysUntilDue = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        // Reminder windows: overdue, due-in-3, due-in-7, due-in-14
        const inWindow = daysUntilDue < 0 || daysUntilDue === 3 || daysUntilDue === 7 || daysUntilDue === 14;
        if (!inWindow) continue;
        // Only items still actionable
        const status = sel.status || 'Not Started';
        const approval = sel.clientApprovalStatus || 'Pending Options';
        if (!ACTIVE_STATUSES.includes(status) || COMPLETED_APPROVAL.includes(approval)) continue;

        const item: ReminderItem = {
          ...sel,
          projectId: project.id,
          projectName: project.name,
          daysUntilDue,
          dueDate,
        };

        const owner = sel.decisionOwner || 'Designer';
        if (owner === 'Client' || approval === 'Checking w/ Client') clientItems.push(item);
        if (owner === 'Designer' || approval !== 'Approved') designerItems.push(item);
        if (owner === 'Builder' || owner === 'Architect') builderItems.push(item);
      }

      totalReminders += clientItems.length + designerItems.length + builderItems.length;

      // CLIENT digest
      if (clientItems.length > 0 && project.clientId) {
        const sent = await sendDigestToUser({
          uid: project.clientId, role: 'client', project, items: clientItems,
        });
        if (sent.email) totalEmailsSent += 1;
        if (sent.sms) totalSmsSent += 1;
      }
      // DESIGNER digest
      if (designerItems.length > 0 && project.assignedDesignerId) {
        const sent = await sendDigestToUser({
          uid: project.assignedDesignerId, role: 'designer', project, items: designerItems,
        });
        if (sent.email) totalEmailsSent += 1;
      }
      // BUILDER digest
      if (builderItems.length > 0 && project.assignedBuilderId) {
        const sent = await sendDigestToUser({
          uid: project.assignedBuilderId, role: 'builder', project, items: builderItems,
        });
        if (sent.email) totalEmailsSent += 1;
      }
    }

    functions.logger.info('Daily selection reminders complete', {
      durationMs: Date.now() - startedAt,
      projects: projSnap.size,
      totalReminders,
      totalEmailsSent,
      totalSmsSent,
    });
    return null;
  });

async function sendDigestToUser(args: {
  uid: string;
  role: 'client' | 'designer' | 'builder';
  project: Project;
  items: ReminderItem[];
}): Promise<{ email: boolean; sms: boolean; inApp: boolean }> {
  const { uid, role, project, items } = args;

  // Pull user record to get email, phone, preferences
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    functions.logger.warn(`Skipping reminders — user ${uid} not found`);
    return { email: false, sms: false, inApp: false };
  }
  const user = userSnap.data() as any;
  const prefs = (user.notificationPreferences || {}) as any;

  // Default: email always on, SMS only for overdue clients, in-app always on
  const wantsEmail = prefs.selectionsEmail !== false;
  const wantsSms = prefs.selectionsSms !== false && role === 'client';
  const wantsInApp = prefs.selectionsInApp !== false;

  const hasOverdue = items.some(i => i.daysUntilDue < 0);
  const result = { email: false, sms: false, inApp: false };

  // 1) In-app notification doc — always written for the dashboard bell/banner
  if (wantsInApp) {
    await db.collection(`users/${uid}/notifications`).add({
      type: 'selections_reminder',
      projectId: project.id,
      projectName: project.name,
      itemCount: items.length,
      overdueCount: items.filter(i => i.daysUntilDue < 0).length,
      role,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    result.inApp = true;
  }

  // 2) Email digest
  if (wantsEmail && user.email) {
    try {
      await sendSelectionReminderEmail({
        toEmail: user.email,
        toName: user.displayName || user.name || 'there',
        role,
        projectName: project.name,
        projectId: project.id,
        items: items.map(i => ({
          item: i.item || '',
          room: i.room || '',
          phase: i.phase || '',
          daysUntilDue: i.daysUntilDue,
          dueDate: i.dueDate.toISOString(),
        })),
      });
      result.email = true;
    } catch (err) {
      functions.logger.error('Email send failed', { uid, err });
    }
  }

  // 3) SMS for overdue only
  if (wantsSms && hasOverdue && user.phone) {
    try {
      const overdueCount = items.filter(i => i.daysUntilDue < 0).length;
      await sendSelectionReminderSms({
        toPhone: user.phone,
        body: `Skyeline: ${overdueCount} design selection${overdueCount === 1 ? ' is' : 's are'} overdue on ${project.name}. Open the portal: https://app.skyelineos.com/client-portal/selections`,
      });
      result.sms = true;
    } catch (err) {
      functions.logger.error('SMS send failed', { uid, err });
    }
  }

  return result;
}
