import { apiRequest } from './queryClient';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface ProgressCalculation {
  completionPercentage: number;
  completedTasks: number;
  totalTasks: number;
  timelineProgress: number;
  estimateProgress: number;
  budgetUtilization: number;
  details: {
    completedMilestones: string[];
    upcomingMilestones: string[];
    overdueTasks: string[];
  };
}

export interface EstimateItem {
  id: string;
  title: string;
  trade: string;
  estimatedCost: number;
  status: 'Estimating' | 'Bidding' | 'Waiting Approval' | 'Approved' | 'Complete';
  duration?: number;
  timeline?: string;
}

export interface ScheduleTask {
  id: number;
  title: string;
  status: string; // Allow any string to handle various status formats
  startDate: string;
  endDate: string;
  progress?: number;
  estimateItemId?: string;
  trade?: string; // Add trade field for better matching
}

/**
 * Calculate live completion progress based on estimates timeframe and completed schedule jobs
 */
export async function calculateLiveProgress(projectId: string | number): Promise<ProgressCalculation> {
  try {
    // Read directly from Firestore. The legacy /api/* endpoints used here
    // were never deployed (the `api` Cloud Function doesn't include them),
    // and Hosting fall-through to the SPA returned HTML that fed every
    // caller a "non-JSON" error. Talking to Firestore directly is faster
    // anyway — no round-trip through Cloud Functions.
    const pid = String(projectId);

    // 1. Approved estimate line items for this project.
    //    Estimates store their items in `lineItems[]` on the parent doc;
    //    "approved" estimates are status='approved' (or 'signed').
    const estSnap = await getDocs(query(
      collection(db, 'estimates'),
      where('projectId', '==', pid),
    ));
    const approvedEstimates: any[] = [];
    estSnap.docs.forEach(d => {
      const data = d.data() as any;
      const status = String(data.status || '').toLowerCase();
      // Only count signed/approved estimates toward scope.
      if (status !== 'approved' && status !== 'signed' && status !== 'won') return;
      const items: any[] = Array.isArray(data.lineItems) ? data.lineItems : [];
      items.forEach(item => approvedEstimates.push({
        id: item.id,
        title: item.description || item.title || '',
        trade: item.trade || '',
        estimatedCost: item.total || item.unitCost || 0,
        status: item.status || 'Approved',
        duration: item.duration || 1,
      }));
    });

    // 2. Schedule tasks for this project.
    const taskSnap = await getDocs(query(
      collection(db, 'tasks'),
      where('projectId', '==', pid),
    ));
    const scheduleTasks: any[] = taskSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    // 3. Project doc for budget / actualCost.
    let project: any = {};
    try {
      const projSnap = await getDoc(doc(db, 'projects', pid));
      if (projSnap.exists()) project = projSnap.data();
    } catch { /* non-fatal */ }

    if (!approvedEstimates || !Array.isArray(approvedEstimates)) {
      console.warn('No approved estimates found for progress calculation');
      return getDefaultProgress();
    }

    if (!scheduleTasks || !Array.isArray(scheduleTasks)) {
      console.warn('No schedule tasks found for progress calculation');
      return getDefaultProgress();
    }

    // Calculate completion based on estimate items linked to completed schedule tasks
    const completedTasks: ScheduleTask[] = scheduleTasks.filter(task => 
      task.status?.toLowerCase() === 'complete' || 
      task.status?.toLowerCase() === 'completed'
    );
    const totalTasks: ScheduleTask[] = scheduleTasks;
    
    // Development logging removed
    
    // Calculate progress based on duration (days) of estimate items vs completed items
    let totalDuration = 0;
    let completedDuration = 0;
    
    // Development logging removed
    
    approvedEstimates.forEach((item, index) => {
      try {
        const itemDuration = item.duration || 1; // Default to 1 day if no duration specified
        totalDuration += itemDuration;
        
        // Check if this estimate item is completed by finding corresponding completed task
        const linkedTask = completedTasks.find(task => {
          const matchById = task.estimateItemId === item.id;
          const matchByTrade = task.trade && item.trade && 
            task.trade.toLowerCase().replace(/\s+/g, '') === item.trade.toLowerCase().replace(/\s+/g, '');
          
          return matchById || matchByTrade;
        });
        
        const isComplete = linkedTask || item.status === 'Complete';
        
        if (isComplete) {
          completedDuration += itemDuration;
        }
        
        // Development logging removed
        
      } catch (err) {
        console.error('Error processing estimate item:', err, item);
        // Default to 1 day for errored items
        totalDuration += 1;
      }
    });
    
    const estimateProgress = totalDuration > 0 ? (completedDuration / totalDuration) * 100 : 0;
    
    // Calculate timeline progress (simple task count)
    const timelineProgress = totalTasks.length > 0 ? (completedTasks.length / totalTasks.length) * 100 : 0;
    
    // Overall completion is weighted average of estimate progress (70%) and timeline progress (30%)
    const completionPercentage = Math.round((estimateProgress * 0.7) + (timelineProgress * 0.3));
    
    // Development logging removed

    // Calculate budget utilization (still use cost-based calculation for budget)
    const totalBudget = project?.budget || 0;
    const actualSpent = project?.actualCost || 0;
    const budgetUtilization = totalBudget > 0 ? (actualSpent / totalBudget) * 100 : 0;

    // Identify upcoming milestones (tasks starting within next 7 days)
    const upcomingDate = new Date();
    upcomingDate.setDate(upcomingDate.getDate() + 7);
    
    const upcomingMilestones = scheduleTasks
      .filter(task => 
        task.status?.toLowerCase() === 'scheduled' && 
        new Date(task.startDate) <= upcomingDate &&
        new Date(task.startDate) >= new Date()
      )
      .map(task => task.title);

    // Identify overdue tasks
    const currentDate = new Date();
    const overdueTasks = scheduleTasks
      .filter(task => 
        task.status?.toLowerCase() !== 'complete' && 
        task.status?.toLowerCase() !== 'completed' &&
        new Date(task.endDate) < currentDate
      )
      .map(task => task.title);

    // Development logging removed
    // Development logging removed
    // Development logging removed
    // Development logging removed

    return {
      completionPercentage: Math.max(0, Math.min(100, completionPercentage)),
      completedTasks: completedTasks.length,
      totalTasks: totalTasks.length,
      timelineProgress: Math.round(timelineProgress),
      estimateProgress: Math.round(estimateProgress),
      budgetUtilization: Math.round(budgetUtilization),
      details: {
        completedMilestones: completedTasks.map(task => task.title),
        upcomingMilestones,
        overdueTasks
      }
    };

  } catch (error) {
    // Fail quiet — Financials would render an entire dashboard's worth of
    // projects, and one broken Firestore read shouldn't spam the console
    // for every project. Log once at warn level instead of error.
    console.warn('[progressUtils] live progress fell back to default for', projectId, error instanceof Error ? error.message : error);
    return getDefaultProgress();
  }
}

function getDefaultProgress(): ProgressCalculation {
  return {
    completionPercentage: 0,
    completedTasks: 0,
    totalTasks: 0,
    timelineProgress: 0,
    estimateProgress: 0,
    budgetUtilization: 0,
    details: {
      completedMilestones: [],
      upcomingMilestones: [],
      overdueTasks: []
    }
  };
}

/**
 * Get progress description based on current status
 */
export function getProgressDescription(progress: ProgressCalculation): string {
  const { completionPercentage, details } = progress;
  
  if (completionPercentage === 0) {
    return "Project planning phase";
  } else if (completionPercentage < 25) {
    return "Early construction phase";
  } else if (completionPercentage < 50) {
    return "Foundation and framing in progress";
  } else if (completionPercentage < 75) {
    return "Systems and interior work underway";
  } else if (completionPercentage < 95) {
    return "Finishing touches and final inspections";
  } else if (completionPercentage < 100) {
    return "Project nearing completion";
  } else {
    return "Project completed";
  }
}