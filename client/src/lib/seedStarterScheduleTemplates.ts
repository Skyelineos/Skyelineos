import {
  addDoc, collection, getDocs, query, serverTimestamp, where, updateDoc, doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { STARTER_SCHEDULE_TEMPLATES } from '@/data/skyelineStarterTemplates';

// Seeds the per-project-type starter schedule templates (House Build, Basement
// Finishing, Pool Build, House Remodel) into `scheduleTemplates` so they show up
// in the Gantt template editor (/templates → Schedule).
//
// Re-runnable: a matching template that is still a starter (`isStarter: true`)
// gets REFRESHED to the latest canonical content, so re-clicking the button picks
// up updates. A same-named template the user has taken over (not a starter) is
// left untouched.
export async function seedStarterScheduleTemplates(createdBy?: string): Promise<{
  created: number;
  refreshed: number;
  skipped: number;
  total: number;
}> {
  let created = 0;
  let refreshed = 0;
  let skipped = 0;
  for (const t of STARTER_SCHEDULE_TEMPLATES) {
    const existing = await getDocs(query(
      collection(db, 'scheduleTemplates'),
      where('name', '==', t.name),
    ));
    if (!existing.empty) {
      const snap = existing.docs[0];
      if ((snap.data() as any).isStarter === true) {
        await updateDoc(doc(db, 'scheduleTemplates', snap.id), {
          description: t.description,
          tasks: t.tasks,
          links: t.links,
          taskCount: t.tasks.length,
          updatedAt: serverTimestamp(),
        });
        refreshed++;
      } else {
        skipped++;
      }
      continue;
    }
    await addDoc(collection(db, 'scheduleTemplates'), {
      name: t.name,
      description: t.description,
      tasks: t.tasks,
      links: t.links,
      taskCount: t.tasks.length,
      createdBy: createdBy ?? null,
      isStarter: true,
      createdAt: serverTimestamp(),
    });
    created++;
  }
  return { created, refreshed, skipped, total: STARTER_SCHEDULE_TEMPLATES.length };
}
