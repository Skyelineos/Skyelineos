// Single source of truth for "publish a schedule to the client." Both the live
// Gantt page and the estimate Schedule tab call this so the client-facing
// behavior is identical: write the client-safe snapshot + an "updated" stamp +
// a drift signature, then notify the homeowner.

import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { fireTrigger } from '@/lib/notifications';
import { scheduleSignature } from './wbsToClientSchedule';
import type { GeneratedSchedule } from './types';

// Resolve the homeowner's portal uid(s) for notification. A project keys its
// client by Firebase uid OR contact-doc id; the contact carries linkedUserId.
// Returns every distinct uid we can reach (handles the contact-id case).
async function resolveClientUids(project: any): Promise<string[]> {
  const ids = new Set<string>();
  const candidates = [project?.clientId, ...(Array.isArray(project?.clientIds) ? project.clientIds : [])]
    .filter(Boolean) as string[];
  for (const c of candidates) {
    // If it's already a uid this is harmless; if it's a contact id, pull the
    // linked portal uid.
    try {
      const contactSnap = await getDoc(doc(db, 'contacts', c));
      const linked = contactSnap.exists() ? (contactSnap.data() as any).linkedUserId : null;
      if (linked) ids.add(String(linked));
      else ids.add(String(c)); // best-effort: treat as a uid
    } catch {
      ids.add(String(c));
    }
  }
  // Also catch contacts whose linkedUserId equals a candidate uid (uid → contact
  // already covered; this covers contact docs found by clientId being a uid).
  return Array.from(ids);
}

export interface PublishScheduleArgs {
  projectId: string;
  schedule: GeneratedSchedule;
  source: string;                 // human label: "Work schedule (Gantt)" | "Estimate line items" | template name
  startDate?: string;             // anchor date (optional)
  fromUserId?: string;
  fromUserName?: string;
  notify?: boolean;               // default true
}

export async function publishScheduleToClient(args: PublishScheduleArgs): Promise<void> {
  const { projectId, schedule, source, startDate, fromUserId, fromUserName, notify = true } = args;
  if (!projectId || !schedule) throw new Error('Missing project or schedule');

  const signature = scheduleSignature(schedule);

  await updateDoc(doc(db, 'projects', projectId), {
    estimatedSchedule: schedule,
    ...(startDate ? { estimatedScheduleStartDate: startDate } : {}),
    estimatedScheduleSource: source,
    estimatedSchedulePublishedAt: serverTimestamp(),
    estimatedSchedulePublishedSignature: signature,
    updatedAt: serverTimestamp(),
  });

  if (!notify) return;

  // Wave-2: route through fireTrigger so the server resolves the project's
  // homeowner audience, applies per-user prefs, and fans out to email/SMS/push.
  try {
    await fireTrigger({
      kind: 'schedule_published',
      projectId,
      payload: {
        link: '/portal?tab=schedule',
      },
    });
  } catch (e) {
    // Notifications are best-effort — never block the publish.
    console.warn('[publishSchedule] notify failed', e);
  }
}
