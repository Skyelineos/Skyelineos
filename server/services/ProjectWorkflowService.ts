import { storage } from '../storage';
import { eventBus } from '../events/eventBus';

export interface ProjectStatusTransition {
  projectId: number;
  from: string;
  to: string;
  timestamp: Date;
  triggeredBy: string;
  reason?: string;
}

/**
 * Automated project workflow service that handles all project status transitions
 * without manual intervention. Each business event automatically triggers the
 * appropriate status change.
 */
export class ProjectWorkflowService {
  
  /**
   * Triggered when an estimate is approved - moves project to bidding phase
   */
  static async approveEstimate(projectId: number, triggeredBy: string = 'system') {
    const project = storage.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Processing operation
    
    // Update project status
    const updatedProject = {
      ...project,
      status: 'bidding' as const,
      updatedAt: new Date().toISOString()
    };
    
    storage.updateProject(projectId, updatedProject);
    
    // Log transition
    this.logStatusTransition({
      projectId,
      from: project.status,
      to: 'bidding',
      timestamp: new Date(),
      triggeredBy,
      reason: 'Estimate approved by client'
    });

    // Emit event for other systems
    eventBus.emit('ProjectStatusChanged', {
      projectId,
      previousStatus: project.status,
      newStatus: 'bidding',
      triggeredBy
    });

    return updatedProject;
  }

  /**
   * Triggered when a bid is awarded - moves project to client review
   */
  static async awardBid(projectId: number, triggeredBy: string = 'system') {
    const project = storage.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Processing operation
    
    const updatedProject = {
      ...project,
      status: 'client_review' as const,
      updatedAt: new Date().toISOString()
    };
    
    storage.updateProject(projectId, updatedProject);
    
    this.logStatusTransition({
      projectId,
      from: project.status,
      to: 'client_review',
      timestamp: new Date(),
      triggeredBy,
      reason: 'Bid awarded to subcontractor'
    });

    eventBus.emit('ProjectStatusChanged', {
      projectId,
      previousStatus: project.status,
      newStatus: 'client_review',
      triggeredBy
    });

    return updatedProject;
  }

  /**
   * Triggered when client approves the project - moves to scheduled
   */
  static async approveClient(projectId: number, triggeredBy: string = 'system') {
    const project = storage.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Processing operation
    
    const updatedProject = {
      ...project,
      status: 'scheduled' as const,
      updatedAt: new Date().toISOString()
    };
    
    storage.updateProject(projectId, updatedProject);
    
    this.logStatusTransition({
      projectId,
      from: project.status,
      to: 'scheduled',
      timestamp: new Date(),
      triggeredBy,
      reason: 'Client approved project for scheduling'
    });

    eventBus.emit('ProjectStatusChanged', {
      projectId,
      previousStatus: project.status,
      newStatus: 'scheduled',
      triggeredBy
    });

    // Auto-generate initial schedule if tasks don't exist
    await this.autoGenerateScheduleIfNeeded(projectId);

    return updatedProject;
  }

  /**
   * Triggered when work starts (first task begins) - moves to in_progress
   */
  static async startWork(projectId: number, triggeredBy: string = 'system') {
    const project = storage.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Only transition if currently scheduled
    if (project.status !== 'scheduled') {
      // Development logging removed
      return project;
    }

    // Processing operation
    
    const updatedProject = {
      ...project,
      status: 'in_progress' as const,
      actualStartDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    storage.updateProject(projectId, updatedProject);
    
    this.logStatusTransition({
      projectId,
      from: project.status,
      to: 'in_progress',
      timestamp: new Date(),
      triggeredBy,
      reason: 'First task started'
    });

    eventBus.emit('ProjectStatusChanged', {
      projectId,
      previousStatus: project.status,
      newStatus: 'in_progress',
      triggeredBy
    });

    return updatedProject;
  }

  /**
   * Triggered when all tasks are completed - moves to completed
   */
  static async completeProject(projectId: number, triggeredBy: string = 'system') {
    const project = storage.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Processing operation
    
    const updatedProject = {
      ...project,
      status: 'completed' as const,
      actualEndDate: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    storage.updateProject(projectId, updatedProject);
    
    this.logStatusTransition({
      projectId,
      from: project.status,
      to: 'completed',
      timestamp: new Date(),
      triggeredBy,
      reason: 'All tasks completed'
    });

    eventBus.emit('ProjectStatusChanged', {
      projectId,
      previousStatus: project.status,
      newStatus: 'completed',
      triggeredBy
    });

    return updatedProject;
  }

  /**
   * Checks if all tasks are completed and auto-completes project if so
   */
  static async checkTasksCompletion(projectId: number, triggeredBy: string = 'system') {
    const tasks = storage.getTasks().filter(task => task.projectId === projectId);
    
    if (tasks.length === 0) {
      // Development logging removed
      return;
    }

    const incompleteTasks = tasks.filter(task => 
      task.status !== 'completed' && task.progress < 100
    );

    // Development logging removed

    if (incompleteTasks.length === 0) {
      // Success operation completed
      await this.completeProject(projectId, triggeredBy);
    } else {
      // Check if project should be in progress
      const tasksInProgress = tasks.filter(task => 
        task.status === 'in_progress' || task.progress > 0
      );
      
      if (tasksInProgress.length > 0) {
        await this.startWork(projectId, triggeredBy);
      }
    }
  }

  /**
   * Triggered when a task status changes - checks for project transitions
   */
  static async onTaskStatusChange(projectId: number, taskId: number, newStatus: string, triggeredBy: string = 'system') {
    // Development logging removed
    
    if (newStatus === 'in_progress') {
      // Starting a task should move project to in_progress
      await this.startWork(projectId, triggeredBy);
    } else if (newStatus === 'completed') {
      // Completing a task might complete the entire project
      await this.checkTasksCompletion(projectId, triggeredBy);
    }
  }

  /**
   * Auto-generate schedule if no tasks exist for a scheduled project
   */
  private static async autoGenerateScheduleIfNeeded(projectId: number) {
    const tasks = storage.getTasks().filter(task => task.projectId === projectId);
    
    if (tasks.length === 0) {
      // Development logging removed
      
      // Emit event to trigger schedule generation
      eventBus.emit('ScheduleGenerated', {
        projectId,
        reason: 'Auto-generated for newly scheduled project',
        triggeredBy: 'ProjectWorkflowService'
      });
    }
  }

  /**
   * Log status transition for audit trail
   */
  private static logStatusTransition(transition: ProjectStatusTransition) {
    // Development logging removed

    // Store in audit log (if implemented)
    // auditService.log('project_status_change', transition);
  }

  /**
   * Get current project status and suggest next actions
   */
  static getProjectWorkflowState(projectId: number) {
    const project = storage.getProjectById(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const tasks = storage.getTasks().filter(task => task.projectId === projectId);
    const estimates = storage.getEstimates().filter(est => est.projectId === projectId);

    return {
      currentStatus: project.status,
      taskCount: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      estimateCount: estimates.length,
      approvedEstimates: estimates.filter(e => e.status === 'approved').length,
      nextActions: this.suggestNextActions(project, tasks, estimates)
    };
  }

  /**
   * Suggest next actions based on current project state
   */
  private static suggestNextActions(project: any, tasks: any[], estimates: any[]) {
    const actions = [];

    switch (project.status) {
      case 'planning':
        if (estimates.length === 0) {
          actions.push('Create estimates for the project');
        } else if (estimates.filter(e => e.status === 'approved').length === 0) {
          actions.push('Get client approval on estimates');
        }
        break;
      
      case 'bidding':
        actions.push('Send bids to subcontractors');
        actions.push('Review and award bids');
        break;
      
      case 'client_review':
        actions.push('Get final client approval');
        break;
      
      case 'scheduled':
        if (tasks.length === 0) {
          actions.push('Generate project schedule');
        } else {
          actions.push('Begin first task to start work');
        }
        break;
      
      case 'in_progress':
        const incompleteTasks = tasks.filter(t => t.status !== 'completed');
        actions.push(`Complete remaining ${incompleteTasks.length} tasks`);
        break;
      
      case 'completed':
        actions.push('Project completed - generate final reports');
        break;
    }

    return actions;
  }
}