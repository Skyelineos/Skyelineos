import {
  collection, doc, getDocs, query, orderBy,
  writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface JobTask {
  id: string;
  name: string;
  description?: string;
  category?: string;
  assigneeRole?: string;
  tags?: string[];
  dateType?: 'fixed' | 'dependent';
  daysOffset: number;
  dependsOn?: string;
  checklist?: { id: string; label: string; done: boolean }[];
  notifyOnAssign?: boolean;
  notifyOnDue?: boolean;
  notifyOnComplete?: boolean;
}

// Apply a saved job template to a project: copies the template's jobTasks into
// the global `tasks` collection scoped to projectId, computing due dates from
// `startDate` + each task's offset (resolving `dependsOn` chains topologically).
export async function applyJobTemplate(
  templateId: string,
  projectId: string,
  startDate: string,
): Promise<{ taskCount: number }> {
  const tasksSnap = await getDocs(query(
    collection(db, 'templates', templateId, 'jobTasks'),
    orderBy('order', 'asc'),
  ));
  const tasks: JobTask[] = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() } as JobTask));
  if (tasks.length === 0) return { taskCount: 0 };

  const start = new Date(startDate);
  const dueByTaskId = new Map<string, Date>();
  const tasksById = new Map(tasks.map(t => [t.id, t]));

  const resolveDue = (task: JobTask, visiting = new Set<string>()): Date => {
    if (dueByTaskId.has(task.id)) return dueByTaskId.get(task.id)!;
    if (visiting.has(task.id)) {
      const d = new Date(start);
      d.setDate(d.getDate() + (task.daysOffset || 0));
      return d;
    }
    visiting.add(task.id);
    let due: Date;
    if (task.dateType === 'dependent' && task.dependsOn && tasksById.has(task.dependsOn)) {
      const parentDue = resolveDue(tasksById.get(task.dependsOn)!, visiting);
      due = new Date(parentDue);
      due.setDate(due.getDate() + (task.daysOffset || 0));
    } else {
      due = new Date(start);
      due.setDate(due.getDate() + (task.daysOffset || 0));
    }
    visiting.delete(task.id);
    dueByTaskId.set(task.id, due);
    return due;
  };

  const batch = writeBatch(db);
  const tasksCol = collection(db, 'tasks');

  for (const task of tasks) {
    const due = resolveDue(task);
    const newTaskRef = doc(tasksCol);
    batch.set(newTaskRef, {
      title: task.name,
      name: task.name,
      description: task.description || '',
      projectId,
      category: task.category || 'Other',
      assigneeRole: task.assigneeRole || '',
      tags: task.tags || [],
      dueDate: due.toISOString().slice(0, 10),
      startDate,
      status: 'todo',
      priority: 'medium',
      checklist: task.checklist || [],
      notifyOnAssign: !!task.notifyOnAssign,
      notifyOnDue: !!task.notifyOnDue,
      notifyOnComplete: !!task.notifyOnComplete,
      sourceTemplateId: templateId,
      sourceTaskId: task.id,
      createdAt: serverTimestamp(),
      visibleToClient: task.assigneeRole === 'client',
    });
  }

  await batch.commit();
  return { taskCount: tasks.length };
}
