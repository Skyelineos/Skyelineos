import { addDays, parseISO, format } from 'date-fns';

// Trade build order configuration
const TRADE_BUILD_ORDER = [
  'Permits',
  'Site Management',
  'Lot Staking / Surveying',
  'Excavation',
  'Lateral Utility Hookups',
  'Concrete: Footings / Foundation',
  'Foundation Waterproofing',
  'Concrete: Flatwork',
  'Framing',
  'Roofing',
  'Windows and Exterior Doors',
  'HVAC',
  'Plumbing',
  'Gas Lines',
  'Electrical',
  'Insulation',
  'Sheet Rock',
  'Stone',
  'Stucco',
  'Fireplace',
  'Interior Doors',
  'Finish Trim',
  'Cabinets',
  'Counter Tops',
  'Paint',
  'Flooring',
  'Tile',
  'Carpet',
  'Deck',
  'Exterior Railing',
  'Final Cleaning',
  'Contractor Fee'
];

// Default durations for each trade (in days)
const DEFAULT_TRADE_DURATIONS: { [key: string]: number } = {
  'Permits': 3,
  'Site Management': 1,
  'Lot Staking / Surveying': 1,
  'Excavation': 2,
  'Lateral Utility Hookups': 1,
  'Concrete: Footings / Foundation': 3,
  'Foundation Waterproofing': 1,
  'Concrete: Flatwork': 2,
  'Framing': 7,
  'Roofing': 4,
  'Windows and Exterior Doors': 3,
  'HVAC': 3,
  'Plumbing': 3,
  'Gas Lines': 1,
  'Electrical': 3,
  'Insulation': 1,
  'Sheet Rock': 3,
  'Stone': 2,
  'Stucco': 3,
  'Fireplace': 2,
  'Interior Doors': 2,
  'Finish Trim': 4,
  'Cabinets': 3,
  'Counter Tops': 2,
  'Paint': 3,
  'Flooring': 2,
  'Tile': 2,
  'Carpet': 1,
  'Deck': 2,
  'Exterior Railing': 1,
  'Final Cleaning': 1,
  'Contractor Fee': 1
};

// Trade dependencies - which trades must be completed before others can start
const TRADE_DEPENDENCIES: { [key: string]: string[] } = {
  'Site Management': ['Permits'],
  'Lot Staking / Surveying': ['Permits'],
  'Excavation': ['Permits', 'Lot Staking / Surveying'],
  'Lateral Utility Hookups': ['Excavation'],
  'Concrete: Footings / Foundation': ['Excavation'],
  'Foundation Waterproofing': ['Concrete: Footings / Foundation'],
  'Concrete: Flatwork': ['Concrete: Footings / Foundation'],
  'Framing': ['Concrete: Footings / Foundation', 'Foundation Waterproofing'],
  'Roofing': ['Framing'],
  'Windows and Exterior Doors': ['Framing'],
  'HVAC': ['Framing'],
  'Plumbing': ['Framing'],
  'Gas Lines': ['Framing'],
  'Electrical': ['Framing'],
  'Insulation': ['HVAC', 'Plumbing', 'Electrical'],
  'Sheet Rock': ['Insulation'],
  'Stone': ['Sheet Rock'],
  'Stucco': ['Sheet Rock'],
  'Fireplace': ['Sheet Rock'],
  'Interior Doors': ['Sheet Rock', 'Paint'],
  'Finish Trim': ['Sheet Rock', 'Paint'],
  'Cabinets': ['Sheet Rock', 'Paint'],
  'Counter Tops': ['Cabinets'],
  'Paint': ['Sheet Rock'],
  'Flooring': ['Paint'],
  'Tile': ['Paint'],
  'Carpet': ['Paint'],
  'Deck': ['Roofing'],
  'Exterior Railing': ['Deck'],
  'Final Cleaning': [], // Can run parallel with final items
  'Contractor Fee': [] // Administrative task
};

interface EstimateItem {
  id: number;
  name: string;
  trade?: string;
  category?: string;
  duration?: number;
  status?: string;
  assignedContactId?: number;
}

interface AutoScheduleTask {
  id: number;
  title: string;
  trade: string;
  startDate: Date;
  endDate: Date;
  duration: number;
  dependencies: string | null;
  estimateItemIds: number[];
  contactId: number | null;
  status: string;
  description: string | null;
  orderIndex: number;
}

interface AutoScheduleOptions {
  projectStartDate: Date;
  includePendingItems?: boolean;
  customDurations?: { [tradeName: string]: number };
  excludeTrades?: string[];
}

/**
 * Generates an auto-schedule from approved estimate items
 */
export function generateAutoSchedule(
  estimateItems: EstimateItem[],
  options: AutoScheduleOptions
): AutoScheduleTask[] {
  const {
    projectStartDate,
    includePendingItems = false,
    customDurations = {},
    excludeTrades = []
  } = options;

  // Filter and group estimate items by trade
  const filteredItems = estimateItems.filter(item => {
    if (!includePendingItems && item.status !== 'approved') return false;
    if (!item.trade && !item.category) return false;
    const tradeName = item.trade || item.category || '';
    return !excludeTrades.includes(tradeName);
  });

  // Group items by trade/category
  const itemsByTrade = groupItemsByTrade(filteredItems);

  // Generate tasks with proper sequencing
  const tasks: AutoScheduleTask[] = [];
  const taskLookup: { [tradeName: string]: AutoScheduleTask } = {};
  let currentTaskId = 1;

  // Sort trades by build order
  const sortedTrades = Object.keys(itemsByTrade).sort((a, b) => {
    const indexA = TRADE_BUILD_ORDER.indexOf(a);
    const indexB = TRADE_BUILD_ORDER.indexOf(b);
    
    // If not in predefined order, put at end
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    
    return indexA - indexB;
  });

  // Create tasks for each trade
  sortedTrades.forEach((tradeName, index) => {
    const tradeItems = itemsByTrade[tradeName];
    
    // Calculate duration
    const customDuration = customDurations[tradeName];
    const estimateDuration = getTradeDurationFromItems(tradeItems);
    const defaultDuration = DEFAULT_TRADE_DURATIONS[tradeName] || 1;
    const duration = customDuration || estimateDuration || defaultDuration;

    // Calculate start date based on dependencies
    const startDate = calculateTaskStartDate(
      tradeName,
      projectStartDate,
      taskLookup
    );

    // Get assigned contact (if any)
    const contactId = getAssignedContact(tradeItems);

    // Create task
    const task: AutoScheduleTask = {
      id: currentTaskId++,
      title: `${tradeName} Work`,
      trade: tradeName,
      startDate,
      endDate: addDays(startDate, duration - 1),
      duration,
      dependencies: getDependenciesString(tradeName, taskLookup),
      estimateItemIds: tradeItems.map(item => item.id),
      contactId,
      status: 'planned',
      description: `Auto-generated task for ${tradeName} (${tradeItems.length} estimate items)`,
      orderIndex: index
    };

    tasks.push(task);
    taskLookup[tradeName] = task;
  });

  return tasks;
}

/**
 * Groups estimate items by trade/category
 */
function groupItemsByTrade(items: EstimateItem[]): { [tradeName: string]: EstimateItem[] } {
  return items.reduce((groups, item) => {
    const tradeName = item.trade || item.category || 'Other';
    if (!groups[tradeName]) {
      groups[tradeName] = [];
    }
    groups[tradeName].push(item);
    return groups;
  }, {} as { [tradeName: string]: EstimateItem[] });
}

/**
 * Extracts duration from estimate items (if specified)
 */
function getTradeDurationFromItems(items: EstimateItem[]): number | null {
  const durations = items
    .map(item => item.duration)
    .filter((duration): duration is number => duration !== undefined && duration !== null && duration > 0);
  
  if (durations.length === 0) return null;
  
  // Use the maximum duration if multiple items have durations
  return Math.max(...durations);
}

/**
 * Calculates when a task should start based on its dependencies
 */
function calculateTaskStartDate(
  tradeName: string,
  projectStartDate: Date,
  completedTasks: { [tradeName: string]: AutoScheduleTask }
): Date {
  const dependencies = TRADE_DEPENDENCIES[tradeName] || [];
  
  if (dependencies.length === 0) {
    return projectStartDate;
  }

  // Find the latest end date of all dependencies
  let latestEndDate = projectStartDate;
  
  dependencies.forEach(depTradeName => {
    const depTask = completedTasks[depTradeName];
    if (depTask && depTask.endDate > latestEndDate) {
      latestEndDate = depTask.endDate;
    }
  });

  // Start the day after the latest dependency ends
  return addDays(latestEndDate, 1);
}

/**
 * Gets the assigned contact for a trade (if any)
 */
function getAssignedContact(items: EstimateItem[]): number | null {
  const contacts = items
    .map(item => item.assignedContactId)
    .filter((contactId): contactId is number => contactId !== undefined && contactId !== null);
  
  if (contacts.length === 0) return null;
  
  // If multiple contacts, use the first one (could be enhanced to handle conflicts)
  return contacts[0];
}

/**
 * Creates a dependency string for a task
 */
function getDependenciesString(
  tradeName: string,
  completedTasks: { [tradeName: string]: AutoScheduleTask }
): string | null {
  const dependencies = TRADE_DEPENDENCIES[tradeName] || [];
  
  const dependencyIds = dependencies
    .map(depTradeName => completedTasks[depTradeName])
    .filter(task => task)
    .map(task => task.id.toString());
  
  return dependencyIds.length > 0 ? dependencyIds.join(', ') : null;
}

/**
 * Validates auto-schedule configuration
 */
export function validateAutoScheduleInputs(
  estimateItems: EstimateItem[],
  options: AutoScheduleOptions
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!estimateItems || estimateItems.length === 0) {
    errors.push('No estimate items provided');
  }

  if (!options.projectStartDate) {
    errors.push('Project start date is required');
  }

  if (options.projectStartDate && options.projectStartDate < new Date()) {
    errors.push('Project start date cannot be in the past');
  }

  const approvedItems = estimateItems.filter(item => 
    item.status === 'approved' || options.includePendingItems
  );

  if (approvedItems.length === 0) {
    errors.push('No approved estimate items found for scheduling');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Gets summary statistics for an auto-schedule
 */
export function getScheduleSummary(tasks: AutoScheduleTask[]) {
  if (tasks.length === 0) {
    return {
      totalTasks: 0,
      totalDuration: 0,
      startDate: null,
      endDate: null,
      tradeCount: 0
    };
  }

  const startDate = tasks.reduce((earliest, task) => 
    task.startDate < earliest ? task.startDate : earliest, 
    tasks[0].startDate
  );

  const endDate = tasks.reduce((latest, task) => 
    task.endDate > latest ? task.endDate : latest, 
    tasks[0].endDate
  );

  const totalDuration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const tradeCount = new Set(tasks.map(task => task.trade)).size;

  return {
    totalTasks: tasks.length,
    totalDuration,
    startDate,
    endDate,
    tradeCount
  };
}