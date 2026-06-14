// One-click "Add Standard Task List" for Templates → Job. Builds a Job template
// (templates doc, category 'job') whose jobTasks are derived from Skyeline's
// standard House Build schedule (non-phase tasks → checklist tasks with a
// day-offset from project start). The GC can then ★ it as the project default.

import { collection, doc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { STARTER_SCHEDULE_TEMPLATES } from '@/data/skyelineStarterTemplates';

const STANDARD_NAME = 'Standard Task List';

export async function seedStandardTaskList(createdByEmail: string): Promise<{ created: boolean; taskCount: number }> {
  // Skip if a job template with this name already exists.
  const existing = await getDocs(query(
    collection(db, 'templates'),
    where('category', '==', 'job'),
    where('name', '==', STANDARD_NAME),
  ));
  if (!existing.empty) return { created: false, taskCount: 0 };

  const house = STARTER_SCHEDULE_TEMPLATES[0];
  if (!house) return { created: false, taskCount: 0 };

  const tasks = house.tasks.filter(t => !t.isPhase);
  const starts = tasks.map(t => Date.parse(t.startDate)).filter(Number.isFinite);
  const earliest = starts.length ? Math.min(...starts) : Date.now();

  // Is there already a default job template? If not, make this one the default.
  const anyDefault = (await getDocs(query(collection(db, 'templates'), where('category', '==', 'job'))))
    .docs.some(d => (d.data() as any).isDefault === true);

  const tmplRef = doc(collection(db, 'templates'));
  const batch = writeBatch(db);
  batch.set(tmplRef, {
    name: STANDARD_NAME,
    category: 'job',
    description: `Skyeline's standard build task list (${tasks.length} tasks), derived from the House Build schedule.`,
    isStarter: true,
    isDefault: !anyDefault,
    createdBy: createdByEmail || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  tasks.forEach((t, i) => {
    const ms = Date.parse(t.startDate);
    const daysOffset = Number.isFinite(ms) ? Math.max(0, Math.round((ms - earliest) / 86400000)) : 0;
    batch.set(doc(collection(db, 'templates', tmplRef.id, 'jobTasks')), {
      name: t.name,
      daysOffset,
      order: i,
      dateType: 'dependent',
      notifyOnAssign: false,
      notifyOnDue: false,
      notifyOnComplete: false,
      createdAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return { created: true, taskCount: tasks.length };
}
