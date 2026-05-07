import { QueryClient } from '@tanstack/react-query';

// Default color palette for tasks
export const DEFAULT_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#F97316', // orange
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#EC4899', // pink
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#F59E0B', // yellow
];

// Trade-specific color mapping
export const TRADE_COLORS: { [key: string]: string } = {
  'foundation': '#8B4513',
  'framing': '#D2691E', 
  'roofing': '#DC143C',
  'electrical': '#FFD700',
  'plumbing': '#4169E1',
  'drywall': '#F5F5DC',
  'flooring': '#8B4513',
  'painting': '#FF69B4',
  'cabinet': '#A0522D',
  'tile': '#696969',
  'landscaping': '#228B22',
  'cleanup': '#808080',
  'inspection': '#FF4500',
  'permit': '#9932CC',
  'concrete': '#708090',
  'siding': '#2E8B57',
  'insulation': '#FFB6C1',
  'hvac': '#4682B4',
  'appliance': '#B22222',
  'fixture': '#CD853F',
};

// Status color mapping
export const STATUS_COLORS: { [key: string]: string } = {
  'not_started': '#9CA3AF',
  'in_progress': '#3B82F6',
  'completed': '#10B981',
  'delayed': '#EF4444',
  'blocked': '#F59E0B',
};

// Priority color mapping
export const PRIORITY_COLORS: { [key: string]: string } = {
  'low': '#10B981',
  'medium': '#F59E0B',
  'high': '#EF4444',
  'critical': '#DC2626',
};

// Weather impact types
export const WEATHER_IMPACT_TYPES = [
  'rain_sensitive',
  'temperature_sensitive',
  'wind_sensitive',
  'outdoor_only',
  'concrete_curing',
  'painting_weather',
  'roofing_weather'
] as const;

// Risk levels
export const RISK_LEVELS = ['low', 'medium', 'high'] as const;

// Task statuses
export const TASK_STATUSES = ['not_started', 'in_progress', 'completed', 'delayed', 'blocked'] as const;

// Priority levels
export const PRIORITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

// Database task interface (as stored in the database)
export interface DatabaseTask {
  id: number;
  projectId: number;
  title: string;
  description?: string;
  trade: string;
  duration: number;
  startDate: string;
  endDate: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed' | 'blocked';
  dependencies?: string; // JSON string
  dependents?: string; // JSON string
  assignedSubcontractor?: string;
  estimatedCost?: number;
  actualCost?: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  weatherDependent?: boolean;
  bufferDays?: number;
  riskLevel?: string;
  materialDeliveryDate?: string;
  permitRequired?: boolean;
  permitStatus?: string;
  notes?: string;
  progress?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Timeline task interface (as used in the timeline components)
export interface TimelineTask {
  id: string;
  title: string;
  description?: string;
  trade: string;
  duration: number;
  startDate: Date;
  endDate: Date;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed' | 'blocked';
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedCost?: number;
  actualCost?: number;
  progress?: number;
  notes?: string;
  // Enhanced properties for timeline
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  isSelected?: boolean;
  isDragging?: boolean;
  isResizing?: boolean;
}

/**
 * Transform a database task to a timeline task
 */
export function transformDatabaseTaskToTimeline(dbTask: DatabaseTask): TimelineTask {
  return {
    id: dbTask.id.toString(),
    title: dbTask.title,
    description: dbTask.description,
    trade: dbTask.trade,
    duration: dbTask.duration,
    startDate: new Date(dbTask.startDate),
    endDate: new Date(dbTask.endDate),
    status: dbTask.status,
    priority: dbTask.priority,
    estimatedCost: dbTask.estimatedCost,
    actualCost: dbTask.actualCost,
    progress: dbTask.progress || 0,
    notes: dbTask.notes,
    // Timeline-specific properties (will be calculated by timeline components)
    color: getTradeColor(dbTask.trade),
  };
}

/**
 * Transform a timeline task to a database task
 */
export function transformTimelineTaskToDatabase(timelineTask: TimelineTask): Partial<DatabaseTask> {
  return {
    id: parseInt(timelineTask.id),
    title: timelineTask.title,
    description: timelineTask.description,
    trade: timelineTask.trade,
    duration: timelineTask.duration,
    startDate: timelineTask.startDate.toISOString(),
    endDate: timelineTask.endDate.toISOString(),
    status: timelineTask.status,
    priority: timelineTask.priority,
    estimatedCost: timelineTask.estimatedCost,
    actualCost: timelineTask.actualCost,
    progress: timelineTask.progress,
    notes: timelineTask.notes,
  };
}

/**
 * Get color for a trade type
 */
export function getTradeColor(trade: string): string {
  const tradeColors: { [key: string]: string } = {
    'foundation': '#8B4513',
    'framing': '#D2691E', 
    'roofing': '#DC143C',
    'electrical': '#FFD700',
    'plumbing': '#4169E1',
    'drywall': '#F5F5DC',
    'flooring': '#8B4513',
    'painting': '#FF69B4',
    'cabinet': '#A0522D',
    'tile': '#696969',
    'landscaping': '#228B22',
    'cleanup': '#808080',
    'inspection': '#FF4500',
    'permit': '#9932CC',
    'concrete': '#708090',
    'siding': '#2E8B57',
    'insulation': '#FFB6C1',
    'hvac': '#4682B4',
    'appliance': '#B22222',
    'fixture': '#CD853F',
  };

  const tradeLower = trade.toLowerCase();
  for (const [key, color] of Object.entries(tradeColors)) {
    if (tradeLower.includes(key)) {
      return color;
    }
  }
  
  // Default color
  return '#6B7280';
}

/**
 * Get status color for timeline visualization
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'not_started':
      return '#9CA3AF'; // gray
    case 'in_progress':
      return '#3B82F6'; // blue
    case 'completed':
      return '#10B981'; // green
    case 'delayed':
      return '#EF4444'; // red
    case 'blocked':
      return '#F59E0B'; // amber
    default:
      return '#6B7280'; // gray
  }
}

/**
 * Get priority color
 */
export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'low':
      return '#10B981'; // green
    case 'medium':
      return '#F59E0B'; // amber
    case 'high':
      return '#EF4444'; // red
    case 'critical':
      return '#DC2626'; // dark red
    default:
      return '#6B7280'; // gray
  }
}

/**
 * Calculate task position in timeline
 */
export function calculateTaskPosition(
  task: TimelineTask,
  timelineStart: Date,
  timelineEnd: Date,
  containerWidth: number,
  rowHeight: number,
  rowIndex: number
): { x: number; y: number; width: number; height: number } {
  const totalTimelineWidth = containerWidth - 200; // Account for labels
  const totalDays = Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
  const dayWidth = totalTimelineWidth / totalDays;
  
  const taskStartOffset = Math.ceil((task.startDate.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));
  const taskWidth = task.duration * dayWidth;
  
  return {
    x: 200 + (taskStartOffset * dayWidth), // 200px for labels
    y: rowIndex * (rowHeight + 10) + 10, // 10px padding
    width: Math.max(taskWidth, 50), // Minimum width of 50px
    height: rowHeight
  };
}

/**
 * Validate task data
 */
export function validateTask(task: Partial<TimelineTask>): string[] {
  const errors: string[] = [];
  
  if (!task.title || task.title.trim().length === 0) {
    errors.push('Task title is required');
  }
  
  if (!task.trade || task.trade.trim().length === 0) {
    errors.push('Trade is required');
  }
  
  if (!task.duration || task.duration <= 0) {
    errors.push('Duration must be greater than 0');
  }
  
  if (!task.startDate) {
    errors.push('Start date is required');
  }
  
  if (!task.endDate) {
    errors.push('End date is required');
  }
  
  if (task.startDate && task.endDate && task.startDate >= task.endDate) {
    errors.push('End date must be after start date');
  }
  
  return errors;
}

/**
 * Sort tasks by start date and dependencies
 */
export function sortTasksBySchedule(tasks: TimelineTask[]): TimelineTask[] {
  return [...tasks].sort((a, b) => {
    // First sort by start date
    const dateCompare = a.startDate.getTime() - b.startDate.getTime();
    if (dateCompare !== 0) return dateCompare;
    
    // Then by priority (critical first)
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const priorityCompare = (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
    if (priorityCompare !== 0) return priorityCompare;
    
    // Finally by title alphabetically
    return a.title.localeCompare(b.title);
  });
}

/**
 * Group tasks by trade
 */
export function groupTasksByTrade(tasks: TimelineTask[]): { [trade: string]: TimelineTask[] } {
  return tasks.reduce((groups, task) => {
    const trade = task.trade;
    if (!groups[trade]) {
      groups[trade] = [];
    }
    groups[trade].push(task);
    return groups;
  }, {} as { [trade: string]: TimelineTask[] });
}

/**
 * Calculate project statistics
 */
export function calculateProjectStats(tasks: TimelineTask[]) {
  if (tasks.length === 0) {
    return {
      totalTasks: 0,
      completedTasks: 0,
      inProgressTasks: 0,
      notStartedTasks: 0,
      delayedTasks: 0,
      totalDuration: 0,
      estimatedCost: 0,
      actualCost: 0,
      overallProgress: 0
    };
  }

  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const notStartedTasks = tasks.filter(t => t.status === 'not_started').length;
  const delayedTasks = tasks.filter(t => t.status === 'delayed').length;
  
  const startDate = new Date(Math.min(...tasks.map(t => t.startDate.getTime())));
  const endDate = new Date(Math.max(...tasks.map(t => t.endDate.getTime())));
  const totalDuration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  const estimatedCost = tasks.reduce((sum, t) => sum + (t.estimatedCost || 0), 0);
  const actualCost = tasks.reduce((sum, t) => sum + (t.actualCost || 0), 0);
  
  const overallProgress = tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / tasks.length;

  return {
    totalTasks: tasks.length,
    completedTasks,
    inProgressTasks,
    notStartedTasks,
    delayedTasks,
    totalDuration,
    estimatedCost,
    actualCost,
    overallProgress: Math.round(overallProgress)
  };
}

/**
 * Invalidate task-related queries
 */
export function invalidateTaskQueries(queryClient: QueryClient, projectId?: number) {
  // Invalidate all task-related queries
  queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
  
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
  }
  
  // Also invalidate project queries since they might include task counts
  queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
}