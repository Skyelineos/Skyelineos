// Daily 7:30am MT sweep that scans active projects for schedule-slip transitions.
// When a project's target-completion date crosses into 'red' (overdue) or 'amber'
// (due in <= 7 days), fire `schedule_slip` to the staff_on_project audience
// (admins + gcs + the project's PM). Idempotent per (project, tone, day): we
// stamp `scheduleSlipLastFiredOn` so a re-run on the same day doesn't double-fire.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { fireTriggerForMany } from './fireTrigger';
import { resolveStaffOnProject } from './audienceResolvers';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

type Tone = 'green' | 'amber' | 'red' | 'gray';

function toneFor(target: Date, status: string): { tone: Tone; days: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (status === 'completed') return { tone: 'green', days };
  if (status === 'cancelled' || status === 'archived') return { tone: 'gray', days };
  if (days < 0) return { tone: 'red', days };
  if (days <= 7) return { tone: 'amber', days };
  return { tone: 'green', days };
}

export const scheduleSlipSweep = onSchedule(
  {
    schedule: '30 7 * * *', // 7:30am every day (after dueSweep at 7am)
    timeZone: 'America/Denver',
  },
  async () => {
    const today = new Date().toISOString().slice(0, 10);
    const snap = await db.collection('projects')
      .where('status', 'in', ['active', 'in_progress'])
      .get();
    let fired = 0;

    for (const projDoc of snap.docs) {
      const data = projDoc.data() as any;
      const target = data.targetCompletion ? new Date(data.targetCompletion) : null;
      if (!target || isNaN(target.getTime())) continue;
      const { tone, days } = toneFor(target, data.status || 'active');
      if (tone !== 'red' && tone !== 'amber') continue;

      // Idempotent per (project, day, tone).
      const lastKey = `${today}:${tone}`;
      if (data.scheduleSlipLastFiredOn === lastKey) continue;

      const recipients = await resolveStaffOnProject(db, projDoc.id);
      if (recipients.length === 0) continue;

      try {
        await fireTriggerForMany(
          {
            db,
            triggerKey: 'schedule_slip',
            audience: 'team',
            projectId: projDoc.id,
            fromUserName: 'Skyeline OS',
            variables: {
              projectName: data.name || 'a project',
              tone,
              days: String(Math.abs(days)),
              link: `/projects/${projDoc.id}/overview`,
            },
          },
          recipients,
        );
        await projDoc.ref.update({ scheduleSlipLastFiredOn: lastKey });
        fired += recipients.length;
      } catch (e) {
        console.warn('[scheduleSlipSweep] fire failed', projDoc.id, e);
      }
    }

    console.log(`[scheduleSlipSweep] fired ${fired} schedule_slip notifications`);
  },
);
