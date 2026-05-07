// DHTMLX Gantt Adapter
import type { WbsTask, Link } from '../types';

export function toDhtmlx(tasks: WbsTask[], links: Link[]) {
  const rows: any[] = [];
  const parent = (p?: string) => p ?? 0;
  
  const walk = (nodes: WbsTask[], p?: string) => {
    nodes.forEach(t => {
      // Ensure dates are properly formatted
      const startDate = t.startDate.includes('T') ? t.startDate.split('T')[0] : t.startDate;
      const endDate = t.endDate.includes('T') ? t.endDate.split('T')[0] : t.endDate;
      
      rows.push({
        id: t.id,
        text: t.name,
        start_date: startDate,
        end_date: endDate,
        duration: t.durationDays || Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)),
        progress: (t.progress ?? 0) / 100,
        open: true,
        parent: parent(p),
        type: t.children?.length ? 'project' : 'task'
      });
      if (t.children?.length) walk(t.children, t.id);
    });
  };
  
  walk(tasks);
  
  console.log('toDhtmlx conversion:', { 
    inputTasks: tasks.length, 
    outputRows: rows.length,
    sampleRow: rows[0]
  });
  
  return {
    data: rows,
    links: links.map(l => ({
      id: l.id ?? `${l.sourceId}->${l.targetId}`,
      source: l.sourceId,
      target: l.targetId,
      type: l.type,
      lag: l.lagDays ?? 0
    }))
  };
}

export function fromDhtmlx(ganttApi: any): { tasks: WbsTask[]; links: Link[] } {
  const tasks: WbsTask[] = [];
  const links: Link[] = [];
  
  // Get all tasks from DHTMLX
  ganttApi.eachTask((task: any) => {
    const wbsTask: WbsTask = {
      id: task.id,
      name: task.text,
      startDate: task.start_date,
      endDate: task.end_date,
      progress: Math.round((task.progress || 0) * 100)
    };
    
    // Handle parent-child relationships
    if (task.parent && task.parent !== ganttApi.config.root_id) {
      // This will be handled by the hierarchical reconstruction
    } else {
      tasks.push(wbsTask);
    }
  });
  
  // Get all links
  ganttApi.getLinks().forEach((link: any) => {
    links.push({
      id: link.id,
      sourceId: link.source,
      targetId: link.target,
      type: link.type,
      lagDays: link.lag || 0
    });
  });
  
  return { tasks, links };
}