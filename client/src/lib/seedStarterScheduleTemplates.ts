import {
  addDoc, collection, getDocs, query, serverTimestamp, where, updateDoc, doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { STARTER_SCHEDULE_TEMPLATES } from '@/data/skyelineStarterTemplates';
import { TYPE_SCHEDULE_TEMPLATES } from '@/data/scheduleTemplatesByType';

// Seeds starter schedule templates into `scheduleTemplates` so they show up in
// Templates → Schedule and auto-attach to new jobs by project type.
//
// Sources:
//   • STARTER_SCHEDULE_TEMPLATES — House Build (Custom Home) + Kitchen/Bathroom.
//     The Basement/Pool/Remodel SKELETONS here are superseded by the richer,
//     project-type-tagged versions below, so they're skipped to avoid dupes.
//   • TYPE_SCHEDULE_TEMPLATES — rich Spec Home / Basement Finish / Remodel / Pool
//     templates, tagged with `projectType` (and `aliases` of any older stub names
//     so seeding fills the existing stub in place instead of duplicating).
//
// Idempotent: matches an existing doc by stable `starterKey`, then by current/
// alias name. A doc still flagged `isStarter` is REFRESHED to the latest content;
// a doc the user has taken over (isStarter !== true) is left untouched.
//
// Custom Home is never modified here beyond the existing House Build starter, and
// the Custom Home Master Task List (`masterTasks`) is a different system entirely.

interface SeedItem {
  key: string;
  name: string;
  description: string;
  tasks: any[];
  links: any[];
  projectType?: string;
  aliases?: string[];
}

// Skip the legacy skeletons that the typed templates replace.
const REPLACED_KEYS = new Set(['basement_finish', 'pool_build', 'house_remodel']);

async function findExisting(item: SeedItem) {
  // 1) stable key
  const byKey = await getDocs(query(
    collection(db, 'scheduleTemplates'),
    where('starterKey', '==', item.key),
  ));
  if (!byKey.empty) return byKey.docs[0];
  // 2) current name or any alias (Firestore `in` supports up to 10 values)
  const names = [item.name, ...(item.aliases || [])].slice(0, 10);
  const byName = await getDocs(query(
    collection(db, 'scheduleTemplates'),
    where('name', 'in', names),
  ));
  return byName.empty ? null : byName.docs[0];
}

export async function seedStarterScheduleTemplates(createdBy?: string): Promise<{
  created: number;
  refreshed: number;
  skipped: number;
  total: number;
}> {
  const items: SeedItem[] = [
    ...STARTER_SCHEDULE_TEMPLATES
      .filter((t) => !REPLACED_KEYS.has(t.key))
      .map((t) => ({ key: t.key, name: t.name, description: t.description, tasks: t.tasks, links: t.links })),
    ...TYPE_SCHEDULE_TEMPLATES.map((t) => ({
      key: t.key, name: t.name, description: t.description, tasks: t.tasks, links: t.links,
      projectType: t.projectType, aliases: t.aliases,
    })),
  ];

  let created = 0;
  let refreshed = 0;
  let skipped = 0;

  for (const item of items) {
    const existing = await findExisting(item);
    if (existing) {
      if ((existing.data() as any).isStarter === true) {
        await updateDoc(doc(db, 'scheduleTemplates', existing.id), {
          name: item.name,
          description: item.description,
          tasks: item.tasks,
          links: item.links,
          taskCount: item.tasks.length,
          starterKey: item.key,
          ...(item.projectType ? { projectType: item.projectType } : {}),
          updatedAt: serverTimestamp(),
        });
        refreshed++;
      } else {
        skipped++; // user has taken this template over — leave it alone
      }
      continue;
    }
    await addDoc(collection(db, 'scheduleTemplates'), {
      name: item.name,
      description: item.description,
      tasks: item.tasks,
      links: item.links,
      taskCount: item.tasks.length,
      starterKey: item.key,
      ...(item.projectType ? { projectType: item.projectType } : {}),
      createdBy: createdBy ?? null,
      isStarter: true,
      createdAt: serverTimestamp(),
    });
    created++;
  }

  return { created, refreshed, skipped, total: items.length };
}
