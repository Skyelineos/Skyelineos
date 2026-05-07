import { addDays, parseISO } from 'date-fns';

// Task interface matching the actual hook structure
interface Task {
  id: number;
  projectId: number;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  duration: number;
  status: 'not_started' | 'in_progress' | 'completed' | 'on_hold';
  assignedTo?: string;
  progress: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
}

export interface PhaseTask {
  id: string;
  wbs: string;
  title: string;
  owner: string;
  startDate: Date;
  endDate: Date;
  duration: number;
  progress: number;
  phase: string;
  trade: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed';
  dependencies: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  weather_dependent?: boolean;
  inspector_required?: boolean;
}

// Map status values from API to component expected values
const mapStatus = (status: string): 'not_started' | 'in_progress' | 'completed' | 'delayed' => {
  switch (status?.toLowerCase()) {
    case 'completed':
    case 'complete':
      return 'completed';
    case 'in_progress':
    case 'active':
    case 'in progress':
      return 'in_progress';
    case 'delayed':
    case 'overdue':
      return 'delayed';
    case 'not_started':
    case 'planned':
    case 'pending':
    default:
      return 'not_started';
  }
};

// Assign phase based on task characteristics and available phases
const assignPhaseToTask = (task: Task, allTasks: Task[], availablePhases: string[]): string => {
  if (availablePhases.length === 0) return 'Default Phase';
  
  const category = task.category?.toLowerCase() || '';
  const title = task.title?.toLowerCase() || '';
  
  // Try to match task characteristics to phase names
  for (const phase of availablePhases) {
    const phaseLower = phase.toLowerCase();
    
    // Check for keyword matches
    if ((phaseLower.includes('foundation') || phaseLower.includes('initiation') || phaseLower.includes('planning')) &&
        (category.includes('foundation') || category.includes('excavation') || 
         title.includes('foundation') || title.includes('excavation') ||
         title.includes('permit') || title.includes('initiation') ||
         title.includes('conception') || title.includes('planning'))) {
      return phase;
    }
    
    if ((phaseLower.includes('structural') || phaseLower.includes('framing') || phaseLower.includes('definition')) &&
        (category.includes('framing') || category.includes('roofing') ||
         title.includes('framing') || title.includes('roofing') ||
         title.includes('structural') || title.includes('definition'))) {
      return phase;
    }
    
    if ((phaseLower.includes('mechanical') || phaseLower.includes('electrical') || phaseLower.includes('interior') || phaseLower.includes('monitoring')) &&
        (category.includes('plumbing') || category.includes('electrical') || category.includes('hvac') ||
         category.includes('insulation') || category.includes('drywall') ||
         title.includes('plumbing') || title.includes('electrical') || title.includes('hvac') ||
         title.includes('insulation') || title.includes('drywall') ||
         title.includes('monitoring') || title.includes('tracking'))) {
      return phase;
    }
    
    if ((phaseLower.includes('finish') || phaseLower.includes('completion') || phaseLower.includes('performance')) &&
        (category.includes('flooring') || category.includes('painting') || category.includes('landscaping') ||
         category.includes('final') || category.includes('cleanup') ||
         title.includes('flooring') || title.includes('painting') || title.includes('landscaping') ||
         title.includes('final') || title.includes('cleanup') || title.includes('performance'))) {
      return phase;
    }
  }
  
  // Default assignment based on timeline position
  const allStartDates = allTasks.map(t => parseISO(t.startDate)).sort((a, b) => a.getTime() - b.getTime());
  const taskStartDate = parseISO(task.startDate);
  const taskIndex = allStartDates.findIndex(date => date.getTime() === taskStartDate.getTime());
  const phaseIndex = Math.floor((taskIndex / allStartDates.length) * availablePhases.length);
  
  return availablePhases[Math.min(phaseIndex, availablePhases.length - 1)];
};

// Generate WBS numbers based on phase and task order
const generateWBS = (task: Task, phase: string, phaseIndex: number, taskIndex: number): string => {
  const phaseNumber = phase === 'PHASE ONE' ? 1 : 
                     phase === 'PHASE TWO' ? 2 : 
                     phase === 'PHASE THREE' ? 3 : 4;
  
  // Create hierarchical WBS based on task relationships
  const category = task.category?.toLowerCase() || '';
  
  if (category.includes('foundation') || category.includes('excavation')) {
    return `${phaseNumber}.${taskIndex + 1}`;
  } else if (task.title?.toLowerCase().includes('revision') || 
             task.title?.toLowerCase().includes('update')) {
    // Sub-tasks get additional level
    return `${phaseNumber}.${Math.floor(taskIndex / 2) + 1}.${(taskIndex % 2) + 1}`;
  } else {
    return `${phaseNumber}.${taskIndex + 1}`;
  }
};

// Determine priority based on task characteristics
const determinePriority = (task: Task): 'low' | 'medium' | 'high' | 'critical' => {
  const title = task.title?.toLowerCase() || '';
  const category = task.category?.toLowerCase() || '';
  
  if (title.includes('critical') || title.includes('foundation') || 
      title.includes('structural') || category.includes('foundation')) {
    return 'critical';
  } else if (title.includes('important') || category.includes('electrical') || 
             category.includes('plumbing') || category.includes('hvac')) {
    return 'high';
  } else if (category.includes('framing') || category.includes('roofing')) {
    return 'medium';
  } else {
    return 'low';
  }
};

export function transformToPhaseData(
  tasks: Task[], 
  dependencies: Array<{fromTaskId: number; toTaskId: number}> = [],
  phases: string[] = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4']
): PhaseTask[] {
  // Assign phases to tasks
  const tasksWithPhases = tasks.map(task => ({
    ...task,
    phase: assignPhaseToTask(task, tasks, phases)
  }));
  
  // Sort tasks by phase order and start date
  tasksWithPhases.sort((a, b) => {
    const aPhaseIndex = phases.indexOf(a.phase);
    const bPhaseIndex = phases.indexOf(b.phase);
    const phaseComparison = aPhaseIndex - bPhaseIndex;
    if (phaseComparison !== 0) return phaseComparison;
    
    return parseISO(a.startDate).getTime() - parseISO(b.startDate).getTime();
  });
  
  // Transform to PhaseTask format
  return tasksWithPhases.map((task, index) => {
    const startDate = parseISO(task.startDate);
    const endDate = task.endDate ? parseISO(task.endDate) : addDays(startDate, task.duration || 1);
    
    // Find phase index for WBS generation
    const phaseIndex = tasksWithPhases.filter(t => t.phase === task.phase).indexOf(task);
    
    return {
      id: task.id.toString(),
      wbs: generateWBS(task, task.phase, 0, phaseIndex),
      title: task.title || 'Untitled Task',
      owner: task.assignedTo || 'Unassigned',
      startDate,
      endDate,
      duration: task.duration || Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))),
      progress: Math.round(task.progress || 0),
      phase: task.phase,
      trade: task.category || 'General',
      status: mapStatus(task.status || 'not_started'),
      dependencies: dependencies
        .filter(dep => dep.toTaskId === task.id)
        .map(dep => dep.fromTaskId.toString()),
      priority: determinePriority(task),
      weather_dependent: task.category?.toLowerCase().includes('roofing') || 
                        task.category?.toLowerCase().includes('landscaping') ||
                        task.title?.toLowerCase().includes('exterior'),
      inspector_required: task.category?.toLowerCase().includes('foundation') ||
                         task.category?.toLowerCase().includes('electrical') ||
                         task.category?.toLowerCase().includes('plumbing') ||
                         task.title?.toLowerCase().includes('inspection')
    };
  });
}