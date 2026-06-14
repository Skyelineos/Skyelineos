// Milestone Auto-Generation Engine
import { parseISO, format } from 'date-fns';
import type { WbsTask, Milestone } from '../types';

// Key construction milestones to auto-generate
const MILESTONE_PATTERNS = [
  { pattern: /excavation|site prep/i, name: 'Excavation Complete' },
  { pattern: /foundation|footing/i, name: 'Foundation Walls Complete' },
  { pattern: /framing|structural/i, name: 'Framing Complete' },
  { pattern: /rough.*(?:plumb|electric|hvac)/i, name: '4-Way Rough Complete' },
  { pattern: /drywall|sheetrock/i, name: 'Drywall Complete' },
  { pattern: /cabinet/i, name: 'Cabinets Installed' },
  { pattern: /paint/i, name: 'Paint Complete' },
  { pattern: /final.*inspect/i, name: 'Final Inspection Complete' },
  { pattern: /walkthrough|punch.*list/i, name: 'Client Walkthrough' }
];

export function generateMilestones(tasks: WbsTask[]): Milestone[] {
  const milestones: Milestone[] = [];
  const foundMilestones = new Set<string>();
  
  const scanTasks = (taskList: WbsTask[]) => {
    taskList.forEach(task => {
      // Check if this task matches any milestone pattern
      for (const milestone of MILESTONE_PATTERNS) {
        if (milestone.pattern.test(task.name) && !foundMilestones.has(milestone.name)) {
          milestones.push({
            id: `milestone-${milestones.length + 1}`,
            name: milestone.name,
            date: task.endDate
          });
          foundMilestones.add(milestone.name);
        }
      }
      
      // Recursively scan children
      if (task.children) {
        scanTasks(task.children);
      }
    });
  };
  
  scanTasks(tasks);
  
  // Sort milestones by date
  return milestones.sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
}

export function getUpcomingMilestones(milestones: Milestone[], daysAhead: number = 30): Milestone[] {
  const today = new Date();
  const cutoffDate = new Date(today.getTime() + (daysAhead * 24 * 60 * 60 * 1000));
  
  return milestones.filter(m => {
    const milestoneDate = parseISO(m.date);
    return milestoneDate >= today && milestoneDate <= cutoffDate;
  });
}