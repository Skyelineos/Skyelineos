// adapter.ts
import { differenceInBusinessDays, parseISO } from 'date-fns';
import type { WbsTask } from '@/types/wbs';

export function toBryntumProjectData(roots: WbsTask[]) {
  const tasks: any[] = [];
  const dependencies: any[] = [];

  const walk = (nodes: WbsTask[], parentId?: string) => {
    nodes.forEach(t => {
      const duration = t.durationDays ??
        Math.max(1, differenceInBusinessDays(parseISO(t.endDate), parseISO(t.startDate)) + 1);
      
      tasks.push({
        id: t.id,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        duration,
        percentDone: t.percent ?? 0,
        manuallyScheduled: !!t.locked,
        constraintType: t.notEarlierThan ? 'startnoearlierthan' : null,
        constraintDate: t.notEarlierThan ?? null,
        expanded: true,
        parentId
      });
      
      t.predecessors?.forEach(p => {
        dependencies.push({
          id: `${p.taskId}->${t.id}`,
          fromTask: p.taskId,
          toTask: t.id,
          type: p.type,          // 'FS'|'SS'|'FF'|'SF'
          lag: (p.lagDays ?? 0) + 'd'
        });
      });
      
      if (t.children?.length) walk(t.children, t.id);
    });
  };
  
  walk(roots);
  return { tasks, dependencies };
}

export function fromBryntumProjectData(tasks: any[], dependencies: any[]): WbsTask[] {
  const taskMap = new Map<string, any>();
  const rootTasks: WbsTask[] = [];
  
  // Create task map
  tasks.forEach(task => taskMap.set(task.id, task));
  
  // Build dependency map
  const predecessorMap = new Map<string, any[]>();
  dependencies.forEach(dep => {
    if (!predecessorMap.has(dep.toTask)) {
      predecessorMap.set(dep.toTask, []);
    }
    predecessorMap.get(dep.toTask)!.push({
      taskId: dep.fromTask,
      type: dep.type,
      lagDays: dep.lag ? parseInt(dep.lag.replace('d', '')) : 0
    });
  });
  
  // Convert tasks
  const convertTask = (task: any): WbsTask => {
    const wbsTask: WbsTask = {
      id: task.id,
      name: task.name,
      startDate: task.startDate,
      endDate: task.endDate,
      percent: task.percentDone,
      durationDays: task.duration,
      locked: task.manuallyScheduled,
      notEarlierThan: task.constraintType === 'startnoearlierthan' ? task.constraintDate : undefined,
      predecessors: predecessorMap.get(task.id) || undefined
    };
    
    // Handle children
    const children = tasks.filter(t => t.parentId === task.id);
    if (children.length > 0) {
      wbsTask.children = children.map(convertTask);
    }
    
    return wbsTask;
  };
  
  // Get root tasks (no parent)
  const rootTasksData = tasks.filter(t => !t.parentId);
  rootTasksData.forEach(task => {
    rootTasks.push(convertTask(task));
  });
  
  return rootTasks;
}