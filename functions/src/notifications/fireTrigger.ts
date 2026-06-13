// fireTrigger — the single entry point every notification-producing event calls.
//
// It loads the admin-configured flow for (triggerKey × recipient audience),
// renders the step templates with the event's variables, and either:
//   • creates a notifications/{id} doc immediately (delay 0), or
//   • enqueues a notificationJobs/{id} doc with runAt for delayed steps
//     (executed later by the scheduled sweeper).
//
// The created notification doc carries an explicit `channels` directive (the
// org-level eligibility the admin configured). The dispatcher intersects that
// with the recipient's own prefs + SMS opt-out/consent — so an admin toggle can
// turn a channel OFF, but can never override an individual's STOP.

import * as admin from 'firebase-admin';
import {
  Audience, Channel, Flow, FlowStep, FlowCondition,
  roleToAudience, defaultFlow, getTrigger,
} from './triggerCatalog';

const RULES_DOC = 'settings/notificationRules';

interface RulesShape {
  flows?: Record<string, Partial<Record<Audience, Flow>>>;
}

/** Load the admin-saved flows doc (best-effort; falls back to defaults). */
export async function loadRules(db: admin.firestore.Firestore): Promise<RulesShape> {
  try {
    const snap = await db.doc(RULES_DOC).get();
    return snap.exists ? (snap.data() as RulesShape) : {};
  } catch (e) {
    console.warn('[fireTrigger] failed to load rules, using defaults', e);
    return {};
  }
}

/** Resolve the effective flow for a trigger × audience (saved, else default). */
export function resolveFlow(rules: RulesShape, triggerKey: string, audience: Audience): Flow {
  const saved = rules.flows?.[triggerKey]?.[audience];
  if (saved && Array.isArray(saved.steps)) return saved;
  return defaultFlow(triggerKey, audience);
}

/** Replace {variable} tokens in a template string. Unknown vars render empty. */
export function renderTemplate(tpl: string | undefined, vars: Record<string, any>): string {
  if (!tpl) return '';
  return tpl.replace(/\{(\w+)\}/g, (_m, name) => {
    const v = vars[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

/** Evaluate a condition against the snapshotted variable payload. */
export function evalCondition(cond: FlowCondition | undefined, vars: Record<string, any>): boolean {
  if (!cond || cond.type === 'always') return true;
  const actual = cond.field ? vars[cond.field] : undefined;
  switch (cond.type) {
    case 'exists': return actual !== undefined && actual !== null && actual !== '';
    case 'notExists': return actual === undefined || actual === null || actual === '';
    case 'equals': return String(actual ?? '') === String(cond.value ?? '');
    case 'notEquals': return String(actual ?? '') !== String(cond.value ?? '');
    default: return true;
  }
}

export interface FireTriggerInput {
  db: admin.firestore.Firestore;
  triggerKey: string;
  recipientUserId: string;
  variables: Record<string, any>;
  projectId?: string;
  /** Force a specific audience instead of resolving from the recipient's role. */
  audience?: Audience;
  /** Sender display name (for the in-app notification "From" line). */
  fromUserName?: string;
}

/**
 * Build the notification doc payload for one step (rendered + channel-gated).
 * Shared by the immediate path here and the delayed sweeper.
 */
export function buildNotificationDoc(
  triggerKey: string,
  step: FlowStep,
  input: { recipientUserId: string; variables: Record<string, any>; projectId?: string; fromUserName?: string },
) {
  const vars = input.variables;
  const channels: Record<Channel, boolean> = {
    inApp: step.channels?.inApp !== false,
    email: step.channels?.email === true,
    sms: step.channels?.sms === true,
    push: step.channels?.push !== false,
  };
  const title = renderTemplate(step.inAppTitle || step.emailSubject, vars) || (getTrigger(triggerKey)?.label ?? 'Update');
  const body = renderTemplate(step.inAppBody || step.smsBody, vars);
  return {
    userId: input.recipientUserId,
    kind: triggerKey,
    title,
    body,
    link: vars.link || undefined,
    projectId: input.projectId,
    fromUserName: input.fromUserName,
    channels,
    forceSms: step.forceSms === true,
    // Rendered per-channel content the dispatcher uses verbatim.
    emailSubject: renderTemplate(step.emailSubject, vars) || title,
    emailBody: renderTemplate(step.emailBody, vars) || body,
    smsBody: renderTemplate(step.smsBody, vars) || `${title}${body ? `: ${body}` : ''}`,
    hidden: channels.inApp === false,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

/**
 * Fire a configured trigger for one recipient. Resolves the audience from the
 * recipient's role (unless overridden), then schedules each step.
 */
export async function fireTrigger(input: FireTriggerInput): Promise<void> {
  const { db, triggerKey, recipientUserId, variables, projectId } = input;
  if (!recipientUserId) return;

  // Resolve audience from the recipient's role unless caller pinned one.
  let audience: Audience = input.audience ?? 'team';
  if (!input.audience) {
    try {
      const u = await db.collection('users').doc(recipientUserId).get();
      const role = u.exists ? (u.data() as any)?.role : undefined;
      audience = roleToAudience(role);
    } catch { /* default team */ }
  }

  const rules = await loadRules(db);
  const flow = resolveFlow(rules, triggerKey, audience);
  if (!flow.enabled) return;

  const now = Date.now();
  const batch = db.batch();
  for (const step of flow.steps || []) {
    const delayMs = Math.max(0, Number(step.delayMinutes) || 0) * 60_000;
    if (delayMs === 0) {
      // Immediate: gate on the snapshot condition, then create the notification.
      if (!evalCondition(step.condition, variables)) continue;
      const ref = db.collection('notifications').doc();
      batch.set(ref, buildNotificationDoc(triggerKey, step, {
        recipientUserId, variables, projectId, fromUserName: input.fromUserName,
      }));
    } else {
      // Delayed: enqueue a job the sweeper picks up at runAt.
      const ref = db.collection('notificationJobs').doc();
      batch.set(ref, {
        triggerKey,
        audience,
        recipientUserId,
        variables,
        projectId: projectId ?? null,
        fromUserName: input.fromUserName ?? null,
        step,
        runAt: admin.firestore.Timestamp.fromMillis(now + delayMs),
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
  await batch.commit();
}

/** Fan a trigger out to many recipients (e.g. all admins for a new lead). */
export async function fireTriggerForMany(
  base: Omit<FireTriggerInput, 'recipientUserId'>,
  recipientUserIds: string[],
): Promise<void> {
  await Promise.all(
    recipientUserIds.filter(Boolean).map(uid => fireTrigger({ ...base, recipientUserId: uid })),
  );
}
