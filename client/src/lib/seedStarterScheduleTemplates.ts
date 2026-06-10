import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { STARTER_SCHEDULE_TEMPLATES } from '@/data/skyelineStarterTemplates';

// Seeds the per-project-type starter schedule templates (House Build, Basement
// Finishing, Pool Build, House Remodel) into the `scheduleTemplates` collection
// so they show up in the Gantt template editor (/templates → Schedule).
// Idempotent: skips any template whose name already exists.
export async function seedStarterScheduleTemplates(createdBy?: string): Promise<{
  created: number;
  skipped: number;
  total: number;
}> {
  let created = 0;
  let skipped = 0;
  for (const t of STARTER_SCHEDULE_TEMPLATES) {
    const existing = await getDocs(query(
      collection(db, 'scheduleTemplates'),
      where('name', '==', t.name),
    ));
    if (!existing.empty) { skipped++; continue; }
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
  return { created, skipped, total: STARTER_SCHEDULE_TEMPLATES.length };
}
