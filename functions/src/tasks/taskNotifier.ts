// Task assignment + completion notifier
// =====================================
//
// Bridges project_tasks ↔ the SMS agent so subs / internal team members get
// pinged when they're assigned a task, get a reminder the day it's due, and
// can reply DONE to mark it complete.
//
// Three public functions:
//
//   notifyTaskAssigned(db, task, assigneeContactId)
//     Sends the first "you've been assigned …" SMS. Called from the assignment
//     UI / engine right after the task's assignedContactId is set.
//
//   sendTaskReminder(db, task)
//     Sends "reminder — [task] is due today". Called by the daily 7:30am cron.
//
//   handleTaskCompletion(db, contactId, messageText, threadId)
//     Hooked into the inbound SMS pipeline. When a sub texts DONE / LISTO /
//     etc., we find their oldest open assigned task and mark it complete.
//
// All three are wrapped in defensive try/catches at the caller layer (the
// cron, the SMS webhook). We don't throw past return — we log and bail so a
// single broken task doesn't kill a sweep.
//
// Calendar integration is intentionally not in this file. See
// calendarService.ts; this module just calls it when an assignee has a
// linked email + a Google access token on file.

import type { Firestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { sendSms } from '../sms/smsService';
import type { ProjectTask } from './projectTaskEngine';
import { createTaskCalendarEvent } from './calendarService';

// ── Helpers ──────────────────────────────────────────────────────────────────

function firstName(full: string | null | undefined): string {
  if (!full) return 'there';
  const trimmed = String(full).trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'soon';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'soon';
    return d.toLocaleDateString('en-US', {
      timeZone: 'America/Denver',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'soon';
  }
}

async function resolveProjectName(db: Firestore, projectId: string): Promise<string> {
  if (!projectId) return 'the project';
  try {
    const snap = await db.collection('projects').doc(projectId).get();
    if (!snap.exists) return 'the project';
    const data: any = snap.data() || {};
    return data.name || data.clientLastName || 'the project';
  } catch {
    return 'the project';
  }
}

// sms_contacts/{id} OR contacts/{id} — assignment UI sets one or the other.
// We try sms_contacts first because that's the agent's primary lookup.
async function resolveContact(
  db: Firestore,
  contactId: string,
): Promise<{
  id: string;
  name: string;
  phoneNumber: string;
  preferredLanguage: 'en' | 'es';
  email?: string | null;
  googleAccessToken?: string | null;
} | null> {
  if (!contactId) return null;
  try {
    const sms = await db.collection('sms_contacts').doc(contactId).get();
    if (sms.exists) {
      const d: any = sms.data() || {};
      return {
        id: sms.id,
        name: d.name || 'Unknown',
        phoneNumber: d.phoneNumber || '',
        preferredLanguage: d.preferredLanguage === 'es' ? 'es' : 'en',
        email: d.email || null,
        googleAccessToken: null, // sms_contacts don't store Google tokens
      };
    }
  } catch (err: any) {
    console.warn('[taskNotifier/resolveContact] sms_contacts lookup failed:', err?.message);
  }
  try {
    const c = await db.collection('contacts').doc(contactId).get();
    if (c.exists) {
      const d: any = c.data() || {};
      return {
        id: c.id,
        name: d.name || 'Unknown',
        phoneNumber: d.phone || d.phoneNumber || d.mobile || '',
        preferredLanguage: d.preferredLanguage === 'es' ? 'es' : 'en',
        email: d.email || null,
        googleAccessToken: d.googleAccessToken || null,
      };
    }
  } catch (err: any) {
    console.warn('[taskNotifier/resolveContact] contacts lookup failed:', err?.message);
  }
  return null;
}

// ── notifyTaskAssigned ───────────────────────────────────────────────────────

/**
 * Send the initial "you've been assigned X at Y" SMS. Should be called once
 * per assignment. Idempotent guarding lives on the caller's side (the project
 * task engine flips a flag once we've notified).
 */
export async function notifyTaskAssigned(
  db: Firestore,
  task: ProjectTask,
  assigneeContactId: string,
): Promise<void> {
  if (!task.id) {
    console.warn('[taskNotifier/notifyTaskAssigned] task missing id; skipping');
    return;
  }
  const contact = await resolveContact(db, assigneeContactId);
  if (!contact || !contact.phoneNumber) {
    console.warn(`[taskNotifier/notifyTaskAssigned] contact ${assigneeContactId} not found or no phone`);
    return;
  }
  const projectName = await resolveProjectName(db, task.projectId);
  const due = formatDate(task.endDate);
  const isEs = contact.preferredLanguage === 'es';

  const body = isEs
    ? `Hola ${firstName(contact.name)}, te asignaron: ${task.name} en ${projectName}. Para el ${due}. Responde LISTO cuando termines o AYUDA si necesitas algo.`
    : `Hey ${firstName(contact.name)}, you've been assigned: ${task.name} at ${projectName}. Due ${due}. Reply DONE when complete or HELP if you need something.`;

  try {
    await sendSms(db, {
      to: contact.phoneNumber,
      body,
      contactId: contact.id,
      projectId: task.projectId,
      generatedByAi: false,
      outboundType: 'SUB_SCHEDULE_REQUEST',
    });
  } catch (err: any) {
    console.error('[taskNotifier/notifyTaskAssigned] sendSms failed:', err?.message);
  }

  // Best-effort calendar event. Returns null silently when the feature flag is off.
  if (contact.email) {
    try {
      const eventId = await createTaskCalendarEvent(
        task,
        contact.email,
        contact.googleAccessToken || '',
        db,
      );
      if (eventId) {
        await db.collection('project_tasks').doc(task.id).update({
          calendarEventId: eventId,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      console.warn('[taskNotifier/notifyTaskAssigned] calendar event failed (non-fatal):', err?.message);
    }
  }

  // Stamp the task so we know we've pinged this assignee.
  try {
    await db.collection('project_tasks').doc(task.id).update({
      lastAssignmentNotifiedAt: FieldValue.serverTimestamp(),
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn('[taskNotifier/notifyTaskAssigned] update task flag failed:', err?.message);
  }
}

// ── sendTaskReminder ─────────────────────────────────────────────────────────

/**
 * Morning-of reminder. Idempotent on the same UTC day via taskReminderLastSentOn.
 */
export async function sendTaskReminder(
  db: Firestore,
  task: ProjectTask,
): Promise<void> {
  if (!task.id || !task.assignedContactId) return;
  const today = new Date().toISOString().slice(0, 10);
  // Idempotency: re-read so we don't double-send if the cron retried.
  try {
    const fresh = await db.collection('project_tasks').doc(task.id).get();
    if (fresh.exists && (fresh.data() as any)?.taskReminderLastSentOn === today) {
      return;
    }
  } catch { /* fall through; better to risk a dup than miss */ }

  const contact = await resolveContact(db, task.assignedContactId);
  if (!contact || !contact.phoneNumber) {
    console.warn(`[taskNotifier/sendTaskReminder] contact ${task.assignedContactId} not found or no phone`);
    return;
  }
  const projectName = await resolveProjectName(db, task.projectId);
  const isEs = contact.preferredLanguage === 'es';
  const body = isEs
    ? `Buenos días ${firstName(contact.name)}, recordatorio — ${task.name} en ${projectName} es para hoy. Responde LISTO cuando termines.`
    : `Morning ${firstName(contact.name)}, reminder — ${task.name} at ${projectName} is due today. Reply DONE when complete.`;

  try {
    await sendSms(db, {
      to: contact.phoneNumber,
      body,
      contactId: contact.id,
      projectId: task.projectId,
      generatedByAi: false,
      outboundType: 'REMINDER',
    });
    await db.collection('project_tasks').doc(task.id).update({
      taskReminderLastSentOn: today,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[taskNotifier/sendTaskReminder] sendSms failed:', err?.message);
  }
}

// ── handleTaskCompletion ─────────────────────────────────────────────────────

const COMPLETION_KEYWORDS_EN = [
  'done', 'complete', 'completed', 'finished', 'wrapped up', 'wrapped',
];
const COMPLETION_KEYWORDS_ES = [
  'listo', 'lista', 'terminado', 'terminada', 'acabado', 'acabada', 'hecho', 'hecha',
];

/**
 * Returns true if `messageText` looks like a task-completion ack
 * (DONE / LISTO / etc.). Used by the SMS pipeline to gate the closure flow.
 */
export function isCompletionKeyword(messageText: string): boolean {
  const t = String(messageText || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!t) return false;
  for (const kw of [...COMPLETION_KEYWORDS_EN, ...COMPLETION_KEYWORDS_ES]) {
    if (t === kw) return true;
    // Allow "done ✓" / "ya está listo" / "terminado!" / "all done"
    const re = new RegExp(`(^|\\W)${kw.replace(/\s+/g, '\\s+')}(\\W|$)`, 'i');
    if (re.test(t)) return true;
  }
  return false;
}

/**
 * Close the oldest open task assigned to this contact and ack via SMS. No-op
 * (returns false) when the contact has no open assigned tasks; the SMS
 * pipeline will then fall back to the normal STATUS_UPDATE handler.
 *
 * Returns true when a task was closed (so the pipeline knows it already
 * acked the sender and can skip the generic "Got it, logged" reply).
 */
export async function handleTaskCompletion(
  db: Firestore,
  contactId: string,
  messageText: string,
  threadId: string,
): Promise<boolean> {
  if (!contactId) return false;

  // Find the oldest open assigned task for this contact. We don't filter by
  // dueDate — late completions still close the task. Status filter excludes
  // already-complete tasks. We pull a few candidates and pick the one whose
  // endDate is soonest (most likely the one they mean).
  let candidates: Array<{ id: string; data: any }> = [];
  try {
    const snap = await db.collection('project_tasks')
      .where('assignedContactId', '==', contactId)
      .where('status', 'in', ['not_started', 'in_progress'])
      .limit(20)
      .get();
    candidates = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  } catch (err: any) {
    // Firestore's `in` query requires the field present on every matched doc.
    // Fall back to a single-status query if the composite fails.
    console.warn('[taskNotifier/handleTaskCompletion] composite query failed, retrying:', err?.message);
    try {
      const a = await db.collection('project_tasks')
        .where('assignedContactId', '==', contactId)
        .where('status', '==', 'not_started')
        .limit(10)
        .get();
      const b = await db.collection('project_tasks')
        .where('assignedContactId', '==', contactId)
        .where('status', '==', 'in_progress')
        .limit(10)
        .get();
      candidates = [
        ...a.docs.map((d) => ({ id: d.id, data: d.data() })),
        ...b.docs.map((d) => ({ id: d.id, data: d.data() })),
      ];
    } catch (err2: any) {
      console.error('[taskNotifier/handleTaskCompletion] fallback queries failed:', err2?.message);
      return false;
    }
  }

  if (candidates.length === 0) return false;

  // Pick the task with the earliest endDate (most likely "this one").
  candidates.sort((a, b) => {
    const ae = new Date(a.data.endDate || a.data.startDate || 0).getTime();
    const be = new Date(b.data.endDate || b.data.startDate || 0).getTime();
    return ae - be;
  });
  const target = candidates[0];

  // Resolve language for the ack.
  const contact = await resolveContact(db, contactId);
  const isEs = contact?.preferredLanguage === 'es';

  // Close the task.
  try {
    await db.collection('project_tasks').doc(target.id).update({
      status: 'complete',
      completionConfirmedBy: contactId,
      completionConfirmedAt: FieldValue.serverTimestamp(),
      completionMethod: 'sms',
      completionMessage: String(messageText || '').slice(0, 500),
      completionThreadId: threadId || null,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[taskNotifier/handleTaskCompletion] update task failed:', err?.message);
    return false;
  }

  // Drop a project_status_updates row so the activity feed reflects it.
  try {
    await db.collection('project_status_updates').add({
      projectId: target.data.projectId || null,
      projectName: null, // populated by reader from project doc if needed
      source: 'sms',
      contactId,
      contactName: contact?.name || null,
      contactPhone: contact?.phoneNumber || null,
      body: `Task completion confirmed: ${target.data.name || target.id}`,
      taskId: target.id,
      kind: 'task_completion',
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err: any) {
    console.warn('[taskNotifier/handleTaskCompletion] status_update write failed (non-fatal):', err?.message);
  }

  // Send the ack.
  if (contact?.phoneNumber) {
    const ack = isEs ? 'Recibido, anotado ✓' : 'Got it, logged ✓';
    try {
      await sendSms(db, {
        to: contact.phoneNumber,
        body: ack,
        contactId,
        projectId: target.data.projectId || null,
        generatedByAi: false,
        outboundType: 'INBOUND_REPLY',
      });
    } catch (err: any) {
      console.warn('[taskNotifier/handleTaskCompletion] ack send failed:', err?.message);
    }
  }

  console.info(`[taskNotifier] closed task ${target.id} for contact ${contactId} via SMS`);
  return true;
}

// Re-export the admin namespace use to avoid "imported but never used" complaints
// from strict tsconfig variants. Most callers won't touch this.
export const _internal = { admin };
