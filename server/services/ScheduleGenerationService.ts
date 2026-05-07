import { addDays, parseISO, format } from 'date-fns';

/**
 * Calculates the shift amount needed to move tasks to project start date
 */
function calculateDateShift(tasks: any[], projectStartDate: string): number {
  if (tasks.length === 0) return 0;
  
  // Find the earliest start date among all tasks
  const earliestDate = tasks.reduce((earliest, task) => {
    const taskDate = new Date(task.startDate);
    return !earliest || taskDate < earliest ? taskDate : earliest;
  }, null);
  
  if (!earliestDate) return 0;
  
  // Calculate days between earliest task date and project start date
  const projectStart = new Date(projectStartDate);
  const diffTime = projectStart.getTime() - earliestDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Shifts all task dates by the specified number of days
 */
function shiftTaskDates(tasks: any[], shiftDays: number): any[] {
  return tasks.map(task => {
    const startDate = new Date(task.startDate);
    const endDate = task.endDate ? new Date(task.endDate) : null;
    
    startDate.setDate(startDate.getDate() + shiftDays);
    
    return {
      ...task,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: endDate ? format(new Date(endDate.getTime() + (shiftDays * 24 * 60 * 60 * 1000)), 'yyyy-MM-dd') : null
    };
  });
}

/**
 * Creates tasks from CSV data and shifts them to project start date
 */
export async function createTasksFromCsvAndShiftToProjectStart(
  storage: any, 
  projectId: number, 
  csvData: any[], 
  projectStartDate: string
): Promise<any[]> {
  // Development logging removed
  
  const createdTasks = [];
  const today = new Date();
  
  // First pass: create tasks with temporary dates
  for (const row of csvData) {
    const task = {
      projectId,
      title: row.title || row.Title || 'Imported Task',
      description: row.description || row.Description || '',
      trade: row.trade || row.Trade || 'General',
      duration: parseInt(row.duration || row.Duration) || 1,
      startDate: row.startDate || today.toISOString().split('T')[0],
      status: 'scheduled',
      estimatedCost: parseFloat(row.estimatedCost || row['Estimated Cost']) || 0,
      assignedSubcontractor: row.assignedSubcontractor || row['Assigned Subcontractor'] || null,
      weatherDependent: (row.weatherDependent || row['Weather Dependent'] || 'false').toLowerCase() === 'true',
      priority: row.priority || row.Priority || 'normal'
    };
    
    const createdTask = await storage.createProjectTask(task);
    createdTasks.push(createdTask);
    
    // Advance date for next task if no specific start date provided
    if (!row.startDate) {
      today.setDate(today.getDate() + task.duration);
    }
  }
  
  // Calculate shift to align with project start date
  const shiftDays = calculateDateShift(createdTasks, projectStartDate);
  
  if (shiftDays !== 0) {
    // Development logging removed
    
    // Update all tasks with shifted dates
    for (const task of createdTasks) {
      const startDate = new Date(task.startDate);
      startDate.setDate(startDate.getDate() + shiftDays);
      
      await storage.updateProjectTask(task.id, {
        startDate: format(startDate, 'yyyy-MM-dd')
      });
      
      task.startDate = format(startDate, 'yyyy-MM-dd');
    }
  }
  
  // Success operation completed
  return createdTasks;
}

/**
 * Generates tasks from estimates and shifts them to project start date
 */
export async function generateTasksFromEstimatesAndShiftToProjectStart(
  storage: any, 
  projectId: number, 
  projectStartDate: string
): Promise<any[]> {
  // Development logging removed
  
  // Get estimates for this project
  const estimates = await storage.getEstimates();
  const projectEstimates = estimates.filter((est: any) => est.projectId === projectId);
  
  // Extract approved items
  const approvedItems = projectEstimates.flatMap((estimate: any) => 
    (estimate.items || []).filter((item: any) => item.status === 'Approved')
  );
  
  if (approvedItems.length === 0) {
    throw new Error('No approved estimate items found for this project');
  }
  
  // Development logging removed
  
  // Trade sequence for construction
  const tradeSequence = [
    'Excavation', 'Foundation', 'Framing', 'Roofing', 'Plumbing Rough', 'Electrical Rough',
    'Insulation', 'Drywall', 'Flooring', 'Cabinets', 'Plumbing Finish', 'Electrical Finish',
    'Painting', 'Trim', 'Cleanup', 'Final Inspection'
  ];
  
  // Group items by trade
  const tradeGroups = approvedItems.reduce((acc: any, item: any) => {
    if (!acc[item.trade]) {
      acc[item.trade] = [];
    }
    acc[item.trade].push(item);
    return acc;
  }, {});
  
  const createdTasks = [];
  let currentDate = new Date(projectStartDate);
  
  // Create tasks in trade sequence order
  for (const trade of tradeSequence) {
    if (tradeGroups[trade]) {
      for (const item of tradeGroups[trade]) {
        const duration = getDurationForTrade(trade) || 3; // Default 3 days
        
        const task = {
          projectId,
          title: `${trade} - ${item.description || item.title}`,
          description: item.description || '',
          trade,
          duration,
          startDate: format(currentDate, 'yyyy-MM-dd'),
          status: 'scheduled',
          estimatedCost: item.estimatedCost || 0,
          estimateItemId: item.id,
          priority: 'normal'
        };
        
        const createdTask = await storage.createProjectTask(task);
        createdTasks.push(createdTask);
        
        // Advance date by duration
        currentDate = addDays(currentDate, duration);
      }
    }
  }
  
  // Handle any remaining trades not in the sequence
  for (const trade of Object.keys(tradeGroups)) {
    if (!tradeSequence.includes(trade)) {
      for (const item of tradeGroups[trade]) {
        const duration = 3; // Default duration
        
        const task = {
          projectId,
          title: `${trade} - ${item.description || item.title}`,
          description: item.description || '',
          trade,
          duration,
          startDate: format(currentDate, 'yyyy-MM-dd'),
          status: 'scheduled',
          estimatedCost: item.estimatedCost || 0,
          estimateItemId: item.id,
          priority: 'normal'
        };
        
        const createdTask = await storage.createProjectTask(task);
        createdTasks.push(createdTask);
        
        currentDate = addDays(currentDate, duration);
      }
    }
  }
  
  // Success operation completed
  return createdTasks;
}

/**
 * Copies schedule from source project and shifts to target project start date
 */
export async function copyScheduleAndShiftToProjectStart(
  storage: any, 
  sourceProjectId: number, 
  targetProjectId: number, 
  projectStartDate: string
): Promise<any[]> {
  // Development logging removed
  
  // Get tasks from source project
  const sourceTasks = await storage.getProjectTasks(sourceProjectId);
  
  if (sourceTasks.length === 0) {
    throw new Error('Source project has no tasks to copy');
  }
  
  // Development logging removed
  
  // Calculate shift amount
  const shiftDays = calculateDateShift(sourceTasks, projectStartDate);
  
  // Development logging removed
  
  const copiedTasks = [];
  
  // Create new tasks in target project with shifted dates
  for (const sourceTask of sourceTasks) {
    const startDate = new Date(sourceTask.startDate);
    startDate.setDate(startDate.getDate() + shiftDays);
    
    const newTask = {
      projectId: targetProjectId,
      title: sourceTask.title,
      description: sourceTask.description,
      trade: sourceTask.trade,
      duration: sourceTask.duration,
      startDate: format(startDate, 'yyyy-MM-dd'),
      status: 'scheduled',
      estimatedCost: sourceTask.estimatedCost,
      assignedSubcontractor: sourceTask.assignedSubcontractor,
      weatherDependent: sourceTask.weatherDependent,
      priority: sourceTask.priority
    };
    
    const createdTask = await storage.createProjectTask(newTask);
    copiedTasks.push(createdTask);
  }
  
  // Copy dependencies if they exist
  try {
    const sourceDependencies = await storage.getProjectDependencies(sourceProjectId);
    
    if (sourceDependencies.length > 0) {
      // Development logging removed
      
      // Create a mapping from old task IDs to new task IDs
      const taskIdMap = {};
      for (let i = 0; i < sourceTasks.length; i++) {
        taskIdMap[sourceTasks[i].id] = copiedTasks[i].id;
      }
      
      // Copy dependencies with updated task IDs
      for (const dep of sourceDependencies) {
        if (taskIdMap[dep.predecessorId] && taskIdMap[dep.successorId]) {
          await storage.createDependency({
            projectId: targetProjectId,
            predecessorId: taskIdMap[dep.predecessorId],
            successorId: taskIdMap[dep.successorId],
            type: dep.type || 'finish-to-start'
          });
        }
      }
    }
  } catch (error) {
    console.warn('Could not copy dependencies:', error.message);
  }
  
  // Success operation completed
  return copiedTasks;
}

/**
 * Applies template and shifts to project start date
 */
export async function applyTemplateAndShiftToProjectStart(
  storage: any, 
  projectId: number, 
  templateId: string, 
  projectStartDate: string
): Promise<any[]> {
  // Development logging removed
  
  // For now, use a basic template - in a real system this would come from a templates table
  const templates = {
    'residential-basic': [
      { title: 'Site Preparation', trade: 'Excavation', duration: 2 },
      { title: 'Foundation Pour', trade: 'Foundation', duration: 3 },
      { title: 'Framing', trade: 'Framing', duration: 10 },
      { title: 'Roof Installation', trade: 'Roofing', duration: 5 },
      { title: 'Rough Plumbing', trade: 'Plumbing Rough', duration: 3 },
      { title: 'Rough Electrical', trade: 'Electrical Rough', duration: 3 },
      { title: 'Insulation', trade: 'Insulation', duration: 2 },
      { title: 'Drywall', trade: 'Drywall', duration: 5 },
      { title: 'Flooring', trade: 'Flooring', duration: 4 },
      { title: 'Kitchen Cabinets', trade: 'Cabinets', duration: 3 },
      { title: 'Plumbing Fixtures', trade: 'Plumbing Finish', duration: 2 },
      { title: 'Electrical Fixtures', trade: 'Electrical Finish', duration: 2 },
      { title: 'Interior Paint', trade: 'Painting', duration: 3 },
      { title: 'Trim Work', trade: 'Trim', duration: 4 },
      { title: 'Final Cleanup', trade: 'Cleanup', duration: 1 },
      { title: 'Final Inspection', trade: 'Final Inspection', duration: 1 }
    ]
  };
  
  const template = templates[templateId];
  if (!template) {
    throw new Error(`Template ${templateId} not found`);
  }
  
  const createdTasks = [];
  let currentDate = new Date(projectStartDate);
  
  // Create tasks from template
  for (const templateTask of template) {
    const task = {
      projectId,
      title: templateTask.title,
      description: `Generated from ${templateId} template`,
      trade: templateTask.trade,
      duration: templateTask.duration,
      startDate: format(currentDate, 'yyyy-MM-dd'),
      status: 'scheduled',
      estimatedCost: 0,
      priority: 'normal'
    };
    
    const createdTask = await storage.createProjectTask(task);
    createdTasks.push(createdTask);
    
    // Advance date by duration
    currentDate = addDays(currentDate, templateTask.duration);
  }
  
  // Success operation completed
  return createdTasks;
}

/**
 * Gets typical duration for a trade (in days)
 */
function getDurationForTrade(trade: string): number {
  const tradeDurations = {
    'Excavation': 2,
    'Foundation': 3,
    'Framing': 10,
    'Roofing': 5,
    'Plumbing Rough': 3,
    'Electrical Rough': 3,
    'Insulation': 2,
    'Drywall': 5,
    'Flooring': 4,
    'Cabinets': 3,
    'Plumbing Finish': 2,
    'Electrical Finish': 2,
    'Painting': 3,
    'Trim': 4,
    'Cleanup': 1,
    'Final Inspection': 1
  };
  
  return tradeDurations[trade] || 3;
}