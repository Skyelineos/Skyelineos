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

// Transform database project to display format
export function transformDbProject(dbProject: DatabaseProject, projectManagers: any[] = []): TransformedProject {
  const metadata = parseProjectMetadata(dbProject.projectMetadata);

  // Check for project manager ID in direct field first, then metadata
  const projectManagerId = (dbProject as any).assignedProjectManager || metadata.assignedProjectManager || '';

  return {
    id: dbProject.id.toString(),
    projectId: `PRJ-${dbProject.id.toString().padStart(4, '0')}`, // Auto-generated formatted ID
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

// Status utilities with custom color styling
export const statusColors = {
  active: 'default',
  planning: 'secondary', 
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
    case 'completed': return 'Completed';
    case 'on_hold': return 'On Hold';
    case 'cancelled': return 'Cancelled';
    case 'archived': return 'Archived';
    default: return status;
  }
}

export function getStatusColor(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'active': return 'default';
    case 'planning': return 'secondary';
    case 'completed': return 'outline';
    case 'on_hold': return 'destructive';
    case 'cancelled': return 'destructive';
    case 'archived': return 'secondary';
    default: return 'secondary';
  }
}