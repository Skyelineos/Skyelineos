// Skyeline Homes SMS Agent — Trigger System (Phase 1)
//
// Stateless functions other parts of the app call when a job event happens. Each
// trigger:
//   1. Loads context (project, contacts, recent activity)
//   2. Asks the agent to draft an outbound message (generateOutbound)
//   3. Sends it via Twilio (smsService.sendSms)
//   4. Logs the trigger event to sms_trigger_events for audit
//
// Triggers are imported by the relevant feature modules (task signoff,
// scheduling, inspections, etc.) — wire-up beyond what the build spec
// requires is left as Phase 2. For Phase 1 we expose the four named triggers
// from the spec as importable functions; the audit log + draft path is
// already exercised by the /api/sms/generate route.
//
// Each trigger respects the contact's preferredLanguage and Spanish style
// guide rules automatically (handled in messagingAgent.ts).

import * as admin from 'firebase-admin';
import type { firestore as adminFirestore } from 'firebase-admin';
import { generateOutbound } from './messagingAgent';
import { sendSms, SMS_COLLECTIONS } from './smsService';
import type {
  SmsContact,
  JobContext,
  Recipient,
  OutboundType,
} from './types';

const TRIGGER_EVENTS = 'sms_trigger_events';

interface TriggerResult {
  trigger: string;
  recipients: Array<{
    contactId: string;
    sent: boolean;
    messageId?: string;
    needsClarification?: boolean;
    error?: string;
  }>;
}

// ── Public triggers ──────────────────────────────────────────────────────────

/** Project milestone reached → CLIENT_UPDATE to every CLIENT contact on the project. */
export async function onMilestoneReached(
  db: adminFirestore.Firestore,
  projectId: string,
  milestone: string,
): Promise<TriggerResult> {
  const job = await loadJobContext(db, projectId, `Milestone reached: ${milestone}`);
  const clients = await contactsForProject(db, projectId, 'CLIENT');
  const intent = `Let the client know we've reached the "${milestone}" milestone. Lead with what happened, then what is next, then what is needed from them (if anything).`;
  return fanOut(db, 'onMilestoneReached', 'CLIENT_MILESTONE', job, clients, intent, { milestone });
}

/** A task is overdue → SUB_FOLLOWUP to the assigned sub. */
export async function onTaskOverdue(
  db: adminFirestore.Firestore,
  taskId: string,
  assigneeContact: SmsContact,
): Promise<TriggerResult> {
  // Best-effort task lookup so the agent has a name for it.
  let taskTitle = `Task ${taskId}`;
  let projectId: string | null = null;
  try {
    const snap = await db.collection('tasks').doc(taskId).get();
    if (snap.exists) {
      const d: any = snap.data() || {};
      taskTitle = String(d.title || d.name || taskTitle);
      projectId = d.projectId ? String(d.projectId) : null;
    }
  } catch { /* fallthrough */ }
  const job = projectId
    ? await loadJobContext(db, projectId, `Task overdue: ${taskTitle}`)
    : ({ projectId: '', projectName: 'a job', triggerSummary: `Task overdue: ${taskTitle}` } as JobContext);
  const intent = `Gentle follow-up on overdue task "${taskTitle}". Ask if there is an updated eta. Give them an out ("no pressure if you don't").`;
  return fanOut(db, 'onTaskOverdue', 'SUB_FOLLOWUP', job, [assigneeContact], intent, { taskId, taskTitle });
}

/** Schedule changed → SUB_SCHEDULE_REQUEST (or DELAY_NOTICE) to affected subs. */
export async function onScheduleChanged(
  db: adminFirestore.Firestore,
  projectId: string,
  affectedContacts: SmsContact[],
  summary?: string,
): Promise<TriggerResult> {
  const job = await loadJobContext(db, projectId, summary || 'Schedule updated');
  const intent = summary
    ? `The schedule for ${job.projectName} just changed. Specifically: ${summary}. Let each affected sub know and ask if the new timing works.`
    : `The schedule for ${job.projectName} just changed. Let each affected sub know and ask if the new timing works for them.`;
  // Pick DELAY_NOTICE when the summary explicitly mentions a push-back; else
  // SCHEDULE_REQUEST. Heuristic only — fine because the agent voice handles
  // the actual delivery.
  const type: OutboundType = /\b(delay|push|later|behind|slip)\b/i.test(summary || '')
    ? 'DELAY_NOTICE'
    : 'SUB_SCHEDULE_REQUEST';
  return fanOut(db, 'onScheduleChanged', type, job, affectedContacts, intent, { summary });
}

/** Inspection scheduled → REMINDER to all SUBs on the project. */
export async function onInspectionScheduled(
  db: adminFirestore.Firestore,
  projectId: string,
  date: Date | string,
  inspectionType?: string,
): Promise<TriggerResult> {
  const job = await loadJobContext(db, projectId, `Inspection scheduled${inspectionType ? `: ${inspectionType}` : ''} on ${formatDate(date)}`);
  const subs = await contactsForProject(db, projectId, 'SUB');
  const intent = `Inspection ${inspectionType ? `(${inspectionType}) ` : ''}is scheduled for ${formatDate(date)} at ${job.projectName}. Friendly reminder, ask them to make sure their work is ready / they are on site if they need to be.`;
  return fanOut(db, 'onInspectionScheduled', 'REMINDER', job, subs, intent, { date: String(date), inspectionType });
}

// ── Internals ────────────────────────────────────────────────────────────────

async function loadJobContext(
  db: adminFirestore.Firestore,
  projectId: string,
  triggerSummary?: string,
): Promise<JobContext> {
  const snap = await db.collection('projects').doc(projectId).get();
  if (!snap.exists) {
    return { projectId, projectName: 'Unknown project', triggerSummary };
  }
  const data: any = snap.data() || {};
  return {
    projectId,
    projectName: data.name || data.clientLastName || projectId,
    address: data.address || data.jobsiteAddress || null,
    city: data.city || null,
    triggerSummary,
  };
}

/**
 * Resolve contacts on a project filtered by role. Prefers sms_contacts entries
 * (projectIds array-contains), falls back to the canonical contacts collection
 * for projects that haven't built out an SMS roster yet.
 */
async function contactsForProject(
  db: adminFirestore.Firestore,
  projectId: string,
  role: SmsContact['role'],
): Promise<SmsContact[]> {
  const out = new Map<string, SmsContact>();
  try {
    const snap = await db.collection(SMS_COLLECTIONS.contacts)
      .where('projectIds', 'array-contains', projectId)
      .where('role', '==', role)
      .limit(100).get();
    snap.docs.forEach((d) => out.set(d.id, { id: d.id, ...(d.data() as any) } as SmsContact));
  } catch (e) {
    console.warn('[sms-triggers] sms_contacts query failed', e);
  }
  // Fallback to the main contacts collection (no project FK in sms_contacts).
  if (out.size === 0) {
    try {
      const snap = await db.collection('contacts').limit(2000).get();
      for (const d of snap.docs) {
        const data: any = d.data();
        const associated = Array.isArray(data.associatedProjects) ? data.associatedProjects : [];
        if (!associated.includes(projectId)) continue;
        const phone = data.phone || data.phoneNumber || data.mobile;
        if (!phone) continue;
        const inferredRole = inferRoleFromContact(data);
        if (inferredRole !== role) continue;
        out.set(d.id, {
          id: d.id,
          name: data.name || 'Unknown',
          phoneNumber: phone,
          role: inferredRole,
          preferredLanguage: data.preferredLanguage === 'es' ? 'es' : 'en',
          projectIds: associated,
          trade: data.trade || data.trades?.[0] || null,
          notes: null,
          linkedContactId: d.id,
          createdBy: 'system',
        });
      }
    } catch (e) {
      console.warn('[sms-triggers] contacts fallback failed', e);
    }
  }
  return Array.from(out.values());
}

function inferRoleFromContact(data: any): SmsContact['role'] {
  const v = String(data.role || data.type || '').toLowerCase().trim();
  if (v === 'client' || v === 'homeowner') return 'CLIENT';
  if (v === 'sub' || v === 'subcontractor') return 'SUB';
  if (v === 'vendor' || v === 'supplier') return 'VENDOR';
  if (v === 'admin' || v === 'gc' || v === 'projectmanager' || v === 'staff') return 'INTERNAL';
  return 'SUB';
}

/** Common fan-out: generate per-recipient draft, send, log event. */
async function fanOut(
  db: adminFirestore.Firestore,
  trigger: string,
  type: OutboundType,
  job: JobContext,
  recipients: SmsContact[],
  intent: string,
  meta: Record<string, any>,
): Promise<TriggerResult> {
  const result: TriggerResult = { trigger, recipients: [] };

  for (const contact of recipients) {
    if (!contact.id) {
      result.recipients.push({ contactId: 'unknown', sent: false, error: 'contact missing id' });
      continue;
    }
    if (!contact.phoneNumber) {
      result.recipients.push({ contactId: contact.id, sent: false, error: 'contact missing phone' });
      continue;
    }
    const recipient: Recipient = { contact, intent };
    try {
      const draft = await generateOutbound(type, job, recipient);
      if (draft.needsClarification) {
        result.recipients.push({
          contactId: contact.id,
          sent: false,
          needsClarification: true,
          error: draft.clarification || 'agent needs more info',
        });
        continue;
      }
      const send = await sendSms(db, {
        to: contact.phoneNumber,
        body: draft.text,
        contactId: contact.id,
        projectId: job.projectId || null,
        generatedByAi: true,
        outboundType: type,
      });
      result.recipients.push({
        contactId: contact.id,
        sent: send.ok,
        messageId: send.messageId,
        error: send.ok ? undefined : (send.error || send.skipped),
      });
    } catch (e: any) {
      console.error(`[sms-triggers/${trigger}] recipient ${contact.id} failed`, e?.message);
      result.recipients.push({ contactId: contact.id, sent: false, error: e?.message || 'unknown' });
    }
  }

  // Audit log: one doc per trigger fire, with per-recipient outcomes.
  try {
    await db.collection(TRIGGER_EVENTS).add({
      trigger,
      outboundType: type,
      projectId: job.projectId || null,
      projectName: job.projectName,
      recipients: result.recipients,
      meta,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[sms-triggers] failed to write trigger event log', e);
  }

  return result;
}

function formatDate(d: Date | string): string {
  try {
    const date = typeof d === 'string' ? new Date(d) : d;
    if (Number.isNaN(date.getTime())) return String(d);
    // "Mon Jun 23" style — matches Tyler's casual register.
    return date.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      timeZone: 'America/Denver',
    });
  } catch {
    return String(d);
  }
}
