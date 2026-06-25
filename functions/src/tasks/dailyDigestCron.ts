// Daily digest cron
// =================
//
// 7:30 AM MT every day. Three responsibilities:
//
//   1. For every project_task due today: call sendTaskReminder().
//      Idempotent on the task itself (taskReminderLastSentOn).
//
//   2. Run runOverdueCheck() so anything overdue gets escalated alongside.
//
//   3. Send Tyler a single "Good morning" SMS summarizing the day's load:
//      tasks due, overdue count, materials needing attention.
//
// We deliberately route Tyler's morning summary through the *notifications*
// collection (not direct sendSms) so it flows through dispatchNotification.
// That gives us free in-app + push + email + SMS fan-out without re-implementing
// channel preferences here.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { sendTaskReminder } from './taskNotifier';
import { runOverdueCheck } from './overdueChecker';
import type { ProjectTask } from './projectTaskEngine';

if (!admin.apps.length) admin.initializeApp();

const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_FROM_NUMBER = defineSecret('TWILIO_FROM_NUMBER');
const APP_BASE_URL = defineSecret('APP_BASE_URL');

function isToday(iso: string | undefined | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

/**
 * Count materials needing action today — those with status='NEEDED' and
 * orderByDate <= today, or status='FOLLOW_UP'/'DELAYED'. Cheap rough count;
 * the materials UI is the source of truth.
 */
async function countMaterialsNeedingAttention(db: Firestore): Promise<number> {
  try {
    const snap = await db.collection('material_orders')
      .where('status', 'in', ['NEEDED', 'FOLLOW_UP', 'DELAYED'])
      .limit(500)
      .get();
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    let count = 0;
    snap.forEach((doc) => {
      const d: any = doc.data();
      if (d.status !== 'NEEDED') {
        count++;
        return;
      }
      // For NEEDED, only count if the order-by date is here or past.
      const ob = d.orderByDate ? new Date(d.orderByDate) : null;
      if (!ob || Number.isNaN(ob.getTime()) || ob.getTime() <= today.getTime()) count++;
    });
    return count;
  } catch (err: any) {
    console.warn('[dailyDigest] materials count failed:', err?.message);
    return 0;
  }
}

/**
 * Main entry — exported for unit testing. The scheduled wrapper calls this.
 */
export async function runDailyDigest(db: Firestore): Promise<void> {
  // ── 1. Reminders for tasks due today
  let dueTodayCount = 0;
  try {
    const tasksSnap = await db.collection('project_tasks')
      .where('status', 'in', ['not_started', 'in_progress'])
      .limit(2000)
      .get();
    for (const doc of tasksSnap.docs) {
      const data = doc.data() as any;
      if (!isToday(data.endDate || data.dueDate)) continue;
      dueTodayCount++;
      if (!data.assignedContactId) continue; // can't remind nobody
      const task: ProjectTask = { id: doc.id, ...(data as any) };
      // Each call is wrapped in its own try/catch downstream; we don't await
      // them serially with a big try block so one failure doesn't poison the
      // whole sweep.
      try {
        await sendTaskReminder(db, task);
      } catch (err: any) {
        console.warn('[dailyDigest] reminder failed for task', doc.id, err?.message);
      }
    }
  } catch (err: any) {
    console.error('[dailyDigest] task-due sweep failed:', err?.message);
  }

  // ── 2. Overdue escalations
  let overdueStats = { totalOverdue: 0, high: 0, medium: 0, low: 0 };
  try {
    overdueStats = await runOverdueCheck(db);
  } catch (err: any) {
    console.error('[dailyDigest] overdue check failed:', err?.message);
  }

  // ── 3. Materials needing attention
  const materialsCount = await countMaterialsNeedingAttention(db);

  // ── 4. Tyler's morning summary
  const appBase = (process.env.APP_BASE_URL || 'https://skyelineos.web.app').replace(/\/$/, '');
  const summary = `Good morning Tyler. Today across your jobs: ${dueTodayCount} task${dueTodayCount === 1 ? '' : 's'} due, ${overdueStats.totalOverdue} overdue, ${materialsCount} material${materialsCount === 1 ? '' : 's'} need attention. Open Skyeline to review: ${appBase}/daily`;

  // Route through notifications + dispatchNotification so per-channel prefs
  // are respected. forceSms=true ensures Tyler gets the text regardless of
  // global opt-in state.
  try {
    const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
    if (adminsSnap.empty) {
      console.warn('[dailyDigest] no admin users — morning summary not delivered');
    } else {
      const writes = adminsSnap.docs.map((d) =>
        db.collection('notifications').add({
          userId: d.id,
          kind: 'daily_digest',
          title: 'Skyeline daily digest',
          body: summary,
          smsBody: summary,
          link: '/daily',
          forceSms: true,
          createdAt: FieldValue.serverTimestamp(),
        }),
      );
      await Promise.all(writes);
    }
  } catch (err: any) {
    console.error('[dailyDigest] summary notification write failed:', err?.message);
  }

  console.log(
    `[dailyDigest] done — dueToday=${dueTodayCount} overdue=${overdueStats.totalOverdue}(h${overdueStats.high}/m${overdueStats.medium}/l${overdueStats.low}) materials=${materialsCount}`,
  );
}

export const dailyDigestSweep = onSchedule(
  {
    schedule: '30 7 * * *', // 7:30am MT daily
    timeZone: 'America/Denver',
    secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, APP_BASE_URL],
  },
  async () => {
    const db = admin.firestore();
    await runDailyDigest(db);
  },
);
