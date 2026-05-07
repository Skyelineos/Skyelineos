// Frappe Gantt Adapter
import type { WbsTask } from '../types';

export function toFrappe(tasks: WbsTask[]) {
  const out: any[] = [];
  
  const walk = (nodes: WbsTask[]) => {
    nodes.forEach(t => {
      if (t.children?.length) {
        walk(t.children);
      } else {
        // Only include leaf tasks for Frappe (it prefers flat task lists)
        out.push({
          id: t.id,
          name: t.name,
          start: t.startDate,
          end: t.endDate,
          progress: t.progress ?? 0,
          custom_class: getCssClass(t)
        });
      }
    });
  };
  
  walk(tasks);
  return out;
}

function getCssClass(task: WbsTask): string {
  const classes: string[] = [];
  
  if (task.status) {
    classes.push(`status-${task.status}`);
  }
  
  if (task.phase) {
    classes.push(`phase-${task.phase}`);
  }
  
  if ((task.progress ?? 0) === 100) {
    classes.push('completed');
  } else if ((task.progress ?? 0) === 0) {
    classes.push('not-started');
  } else {
    classes.push('in-progress');
  }
  
  return classes.join(' ');
}