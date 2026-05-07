/**
 * Schedule Orchestrator - Handles estimate approval events and triggers schedule generation
 */

import { eventBus } from '../eventBus';
import { storage } from '../../storage';

export interface EstimateApprovedPayload {
  projectId: number;
  estimateId: number;
  approvedBy: number;
  estimate: any;
}

export interface ScheduleGeneratedPayload {
  projectId: number;
  estimateId: number;
  tasksGenerated: number;
}

/**
 * Handle EstimateApproved events by generating tasks from awarded estimates
 */
async function handleEstimateApproved(payload: EstimateApprovedPayload): Promise<void> {
  // Target operation completed
  
  try {
    // Generate tasks from the approved estimate
    const generatedTasks = await generateTasksFromAwards(payload.projectId, payload.estimate);
    
    // Success operation completed
    
    // Publish ScheduleGenerated event for other handlers
    await eventBus.publish('ScheduleGenerated', {
      projectId: payload.projectId,
      estimateId: payload.estimateId,
      tasksGenerated: generatedTasks.length
    } as ScheduleGeneratedPayload);
    
  } catch (error) {
    console.error(`❌ Schedule Orchestrator: Error generating tasks for project ${payload.projectId}:`, error);
    throw error;
  }
}

/**
 * Generate tasks from awarded estimate items
 */
async function generateTasksFromAwards(projectId: number, estimate: any): Promise<any[]> {
  // Component lifecycle tracked
  
  const generatedTasks: any[] = [];
  
  if (!estimate.categories || !Array.isArray(estimate.categories)) {
    // Development logging removed
    return generatedTasks;
  }

  // Process each category and its items
  for (const category of estimate.categories) {
    if (category.items && Array.isArray(category.items)) {
      for (const item of category.items) {
        // Only generate tasks for approved items
        if (item.status === 'Approved' && item.vendor) {
          try {
            // Calculate start and end dates
            const startDate = await calculateTaskStartDate(projectId);
            const duration = parseInt(item.estimatedDuration) || 5; // Default 5 days if not specified
            const endDateObj = new Date(startDate);
            endDateObj.setDate(endDateObj.getDate() + duration - 1);
            const endDate = endDateObj.toISOString().split('T')[0];

            // Create a task for this approved estimate item
            const taskData = {
              projectId,
              name: `${item.trade} - ${item.vendor}`,
              trade: item.trade,
              description: item.description || `${item.trade} work by ${item.vendor}`,
              estimatedCost: parseFloat(item.estimatedCost) || 0,
              duration,
              status: 'not_started',
              priority: 'medium',
              vendor: item.vendor,
              estimateItemId: item.id,
              estimateId: estimate.id,
              startDate,
              endDate,
              color: getTradeColor(item.trade)
            };

            const createdTask = await storage.createProjectTask(taskData);
            generatedTasks.push(createdTask);
            
            // Success operation completed
            
          } catch (error) {
            console.error(`❌ Error creating task for ${item.trade}:`, error);
          }
        }
      }
    }
  }
  
  return generatedTasks;
}

/**
 * Calculate appropriate start date for new tasks
 */
async function calculateTaskStartDate(projectId: number): Promise<string> {
  try {
    const existingTasks = await storage.getProjectTasks(projectId);
    
    if (existingTasks.length === 0) {
      // No existing tasks, start from today
      return new Date().toISOString().split('T')[0];
    }
    
    // Find the latest end date among existing tasks
    const latestEndDate = existingTasks.reduce((latest, task) => {
      const taskEndDate = new Date(task.endDate);
      return taskEndDate > latest ? taskEndDate : latest;
    }, new Date());
    
    // Start new tasks 1 day after the latest existing task
    const startDate = new Date(latestEndDate);
    startDate.setDate(startDate.getDate() + 1);
    
    return startDate.toISOString().split('T')[0];
    
  } catch (error) {
    console.error('Error calculating task start date:', error);
    // Fallback to today
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Get color based on trade type
 */
function getTradeColor(trade: string): string {
  const tradeColors: Record<string, string> = {
    'foundation': '#8B5A2B',
    'framing': '#D4AF37',
    'roofing': '#DC143C',
    'plumbing': '#1E90FF',
    'electrical': '#FFD700',
    'hvac': '#32CD32',
    'drywall': '#F5F5DC',
    'flooring': '#8B4513',
    'painting': '#FF6347',
    'cabinets': '#DEB887',
    'countertops': '#708090',
    'appliances': '#4682B4',
    'landscaping': '#228B22'
  };
  
  const normalizedTrade = trade.toLowerCase().replace(/[^a-z]/g, '');
  return tradeColors[normalizedTrade] || '#6B7280'; // Default gray
}

/**
 * Initialize the schedule orchestrator by subscribing to events
 */
export function initializeScheduleOrchestrator(): void {
  // Development logging removed
  
  // Subscribe to EstimateApproved events
  eventBus.subscribe('EstimateApproved', handleEstimateApproved);
  
  // Success operation completed
}