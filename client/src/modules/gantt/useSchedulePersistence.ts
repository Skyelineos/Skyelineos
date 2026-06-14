import { doc, setDoc, getDoc, collection, addDoc, getDocs, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WbsTask, Link } from './types';

export interface ScheduleTemplate {
  id: string;
  name: string;
  description?: string;
  tasks: WbsTask[];
  links: Link[];
  createdAt: any;
  createdBy?: string;
}

export async function saveSchedule(projectId: string, tasks: WbsTask[], links: Link[]): Promise<void> {
  await setDoc(doc(db, 'schedules', projectId), {
    tasks,
    links,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function loadSchedule(projectId: string): Promise<{ tasks: WbsTask[]; links: Link[] } | null> {
  const snap = await getDoc(doc(db, 'schedules', projectId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { tasks: data.tasks ?? [], links: data.links ?? [] };
}

export async function saveAsTemplate(
  name: string,
  description: string,
  tasks: WbsTask[],
  links: Link[],
  createdBy?: string
): Promise<string> {
  const ref = await addDoc(collection(db, 'scheduleTemplates'), {
    name,
    description,
    tasks,
    links,
    createdBy: createdBy ?? null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listTemplates(): Promise<ScheduleTemplate[]> {
  const q = query(collection(db, 'scheduleTemplates'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as ScheduleTemplate));
}

export async function loadTemplate(templateId: string): Promise<ScheduleTemplate | null> {
  const snap = await getDoc(doc(db, 'scheduleTemplates', templateId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ScheduleTemplate;
}
