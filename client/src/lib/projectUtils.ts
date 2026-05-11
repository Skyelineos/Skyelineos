// Shared project utilities to eliminate duplicate code

interface ProjectMetadata {
  projectType?: string;
  assignedProjectManager?: string;
  costPerSqft?: number;
  contingencyPercent?: number;
  contractorFeePercent?: number;
  clientId?: string;
  createdBy?: string;
}

interface DatabaseProject {
  id: string;
  name: string;
  description?: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  address?: string;
  squareFootage?: number;
  estimatedBudget?: number;
  actualCost?: number;
  status?: string;
  startDate?: string | Date;
  targetCompletion?: string | Date;
  projectMetadata?: string | object;
}

export interface TransformedProject {
  id: string;
  projectId: string;
  name: string;
  client: string;
  clientEmail: string;
  clientPhone: string;
  address: string;
  status: string;
  progress: number;
  budget: number;
  spent: number;
  startDate: string;
  targetCompletion: string;
  squareFootage: number;
  projectManager: string;
  description: string;
  milestones?: any[];
}

// Parse project metadata safely
export function parseProjectMetadata(projectMetadata: string | object | null | undefined): ProjectMetadata {
  if (!projectMetadata) return {};
  
  try {
    if (typeof projectMetadata === 'string') {
      return JSON.parse(projectMetadata);
    } else if (typeof projectMetadata === 'object') {
      return projectMetadata;
    }
  } catch (error) {
    // Silently handle metadata parsing errors in production
  }
  
  return {};
}

// Get project manager name from provided project managers data
export function getProjectManagerName(pmId: string, projectManagers: any[] = []): string {
  const pm = projectManagers.find((p: any) => p.id === pmId);
  return pm ? pm.name : 'Unassigned';
}

// Safe date formatting to handle Firebase timestamps and prevent Invalid time value errors
function formatSafeDate(dateInput: string | Date | null | undefined | any): string {
  if (!dateInput) return '';
  
  try {
    let date: Date;
    
    // Handle Firebase Timestamp objects
    if (dateInput && typeof dateInput === 'object' && dateInput._seconds) {
      date = new Date(dateInput._seconds * 1000);
    } 
    // Handle Firestore Timestamp with toDate method
    else if (dateInput && typeof dateInput === 'object' && typeof dateInput.toDate === 'function') {
      date = dateInput.toDate();
    }
    // Handle regular Date or string
    else {
      date = new Date(dateInput);
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return '';
    }
    return date.toISOString().split('T')[0];
  } catch (error) {
    return '';
  }
}

// Calculate project progress (TODO: Implement real calculation from tasks)
export function calculateProjectProgress(projectId: string): number {
  // Placeholder - should calculate from actual project tasks/milestones
  return 0;
}

// Build a human-readable project code: LastName + MMDDYYYY (no separators).
// Examples: "Gardanier12122025", "Smith05102026". Falls back gracefully when
// pieces are missing. Prefer the project doc's saved `projectCode` field
// when one exists so legacy projects can be assigned codes manually too.
export function buildProjectCode(clientName?: string, createdAt?: string | Date | null): string {
  const tokens = String(clientName || '').trim().split(/\s+/).filter(Boolean);
  const last = tokens.length > 0 ? tokens[tokens.length - 1] : 'Project';
  // Strip non-alpha so suffixes / punctuation don't bleed into the code.
  const lastClean = last.replace(/[^A-Za-z]/g, '') || 'Project';
  let date: Date | null = null;
  if (createdAt instanceof Date) date = createdAt;
  else if (createdAt && typeof (createdAt as any).toMillis === 'function') date = new Date((createdAt as any).toMillis());
  else if (typeof createdAt === 'string' && createdAt) date = new Date(createdAt);
  if (!date || !Number.isFinite(date.getTime())) date = new Date();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${lastClean}${mm}${dd}${yyyy}`;
}

// Transform database project to display format
export function transformDbProject(dbProject: DatabaseProject, projectManagers: any[] = []): TransformedProject {
  const metadata = parseProjectMetadata(dbProject.projectMetadata);

  // Check for project manager ID in direct field first, then metadata
  const projectManagerId = (dbProject as any).assignedProjectManager || metadata.assignedProjectManager || '';

  // Display ID = saved projectCode if present, else derived from client + createdAt.
  const savedCode = (dbProject as any).projectCode as string | undefined;
  const derivedCode = buildProjectCode(dbProject.clientName, dbProject.createdAt);

  return {
    id: dbProject.id.toString(),
    projectId: savedCode || derivedCode,
    name: dbProject.name || 'Untitled Project',
    client: dbProject.clientName || 'Unknown Client',
    clientEmail: dbProject.clientEmail || '',
    clientPhone: dbProject.clientPhone || '',
    address: dbProject.address || 'No address provided',
    status: dbProject.status || 'planning',
    progress: calculateProjectProgress(dbProject.id),
    budget: dbProject.estimatedBudget || 0,
    spent: dbProject.actualCost || 0,
    startDate: dbProject.startDate ? formatSafeDate(dbProject.startDate) : formatSafeDate(new Date()),
    targetCompletion: dbProject.targetCompletion ? formatSafeDate(dbProject.targetCompletion) : '',
    squareFootage: dbProject.squareFootage || 0,
    projectManager: getProjectManagerName(projectManagerId, projectManagers),
    description: dbProject.description || 'No description provided',
    milestones: [] // Will be populated from database in future updates
  };
}

// Project lifecycle phases — ordered. Each project flows: planning → active →
// punch_list → closeout → completed. on_hold/cancelled/archived sit outside the
// linear flow.
export type ProjectStatus =
  | 'planning' | 'active' | 'punch_list' | 'closeout' | 'completed'
  | 'on_hold' | 'cancelled' | 'archived';

// Linear lifecycle order — used to render phase pills + figure out next phase.
export const LIFECYCLE_PHASES: ProjectStatus[] = ['planning', 'active', 'punch_list', 'closeout', 'completed'];

// Returns the next phase in the linear flow, or null if at the end.
export function nextPhase(current: string): ProjectStatus | null {
  const i = LIFECYCLE_PHASES.indexOf(current as ProjectStatus);
  if (i < 0 || i >= LIFECYCLE_PHASES.length - 1) return null;
  return LIFECYCLE_PHASES[i + 1];
}

// Status utilities with custom color styling
export const statusColors = {
  active: 'default',
  planning: 'secondary',
  punch_list: 'secondary',
  closeout: 'secondary',
  completed: 'outline',
  on_hold: 'destructive',
  cancelled: 'destructive',
  archived: 'secondary'
} as const;

// Custom status color classes for enhanced visual distinction
export const getStatusBadgeClass = (status: string): string => {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200';
    case 'planning':
      return 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200';
    case 'punch_list':
      return 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200';
    case 'closeout':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-200';
    case 'completed':
      return 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200';
    case 'on_hold':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200';
    case 'cancelled':
      return 'bg-red-100 text-red-800 border-red-200 hover:bg-red-200';
    case 'archived':
      return 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-200';
  }
};

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'active': return 'Active';
    case 'planning': return 'Planning';
    case 'punch_list': return 'Punch List';
    case 'closeout': return 'Closeout';
    case 'completed': return 'Completed';
    case 'on_hold': return 'On Hold';
    case 'cancelled': return 'Cancelled';
    case 'archived': return 'Archived';
    default: return status;
  }
}

// Compares a project's target completion against today and returns a short
// human-readable status + tone color. `progress` (0-100) lets us flag projects
// that are time-fine but progress-behind ("at risk").
export interface ScheduleSlip {
  label: string;
  tone: 'green' | 'amber' | 'red' | 'gray';
  days: number; // negative = overdue, positive = days remaining
}
export function computeScheduleSlip(
  targetCompletion: string | null | undefined,
  status: string,
  progress: number,
): ScheduleSlip | null {
  if (!targetCompletion) return null;
  const target = new Date(targetCompletion);
  if (isNaN(target.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (status === 'completed') {
    return { label: 'Completed', tone: 'green', days };
  }
  if (status === 'cancelled' || status === 'archived') {
    return { label: getStatusLabel(status), tone: 'gray', days };
  }
  if (days < 0) {
    return { label: `${Math.abs(days)}d overdue`, tone: 'red', days };
  }
  if (days <= 7) {
    return { label: `Due in ${days}d`, tone: 'amber', days };
  }
  // Time looks fine — flag if progress is lagging significantly behind elapsed time.
  // (We don't know start date here, so this is a soft "at risk" hint.)
  if (progress > 0 && progress < 25 && days <= 30) {
    return { label: `${days}d left · at risk`, tone: 'amber', days };
  }
  return { label: `${days}d remaining`, tone: 'green', days };
}

export function getStatusColor(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'active': return 'default';
    case 'planning': return 'secondary';
    case 'punch_list': return 'secondary';
    case 'closeout': return 'secondary';
    case 'completed': return 'outline';
    case 'on_hold': return 'destructive';
    case 'cancelled': return 'destructive';
    case 'archived': return 'secondary';
    default: return 'secondary';
  }
}