/**
 * XState machine for project workflow status management
 */

import { createMachine, interpret } from 'xstate';

// Project workflow events
export type ProjectEvent =
  | { type: 'START_ESTIMATING' }
  | { type: 'START_BIDDING' }
  | { type: 'AWARD_BIDS' }
  | { type: 'SEND_TO_CLIENT' }
  | { type: 'CLIENT_APPROVE' }
  | { type: 'CLIENT_REJECT' }
  | { type: 'SCHEDULE_PROJECT' }
  | { type: 'START_CONSTRUCTION' }
  | { type: 'COMPLETE_PROJECT' }
  | { type: 'CANCEL_PROJECT' }
  | { type: 'REOPEN_PROJECT' };

// Project workflow states
export type ProjectState = 
  | 'draft'
  | 'estimating'
  | 'bidding'
  | 'awarded'
  | 'client_review'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

// State machine context
interface ProjectContext {
  projectId?: number;
  estimateCount?: number;
  approvedEstimates?: number;
  lastTransition?: Date;
}

// XState machine definition
export const projectStateMachine = createMachine<ProjectContext, ProjectEvent>({
  id: 'projectWorkflow',
  initial: 'draft',
  context: {
    estimateCount: 0,
    approvedEstimates: 0
  },
  states: {
    draft: {
      on: {
        START_ESTIMATING: 'estimating',
        CANCEL_PROJECT: 'cancelled'
      },
      meta: {
        description: 'Initial project state - planning and setup phase'
      }
    },
    estimating: {
      on: {
        START_BIDDING: 'bidding',
        CANCEL_PROJECT: 'cancelled'
      },
      meta: {
        description: 'Creating estimates for project scope and costs'
      }
    },
    bidding: {
      on: {
        AWARD_BIDS: 'awarded',
        START_ESTIMATING: 'estimating', // Allow going back to refine estimates
        CANCEL_PROJECT: 'cancelled'
      },
      meta: {
        description: 'Collecting bids from subcontractors'
      }
    },
    awarded: {
      on: {
        SEND_TO_CLIENT: 'client_review',
        START_BIDDING: 'bidding', // Allow going back if bids need adjustment
        CANCEL_PROJECT: 'cancelled'
      },
      meta: {
        description: 'Bids have been awarded, ready for client approval'
      }
    },
    client_review: {
      on: {
        CLIENT_APPROVE: 'scheduled',
        CLIENT_REJECT: 'awarded', // Back to awarded state for revisions
        CANCEL_PROJECT: 'cancelled'
      },
      meta: {
        description: 'Estimate sent to client for approval'
      }
    },
    scheduled: {
      on: {
        START_CONSTRUCTION: 'in_progress',
        CLIENT_REJECT: 'awarded', // Client can still reject after initial approval
        CANCEL_PROJECT: 'cancelled'
      },
      meta: {
        description: 'Project approved and scheduled for construction'
      }
    },
    in_progress: {
      on: {
        COMPLETE_PROJECT: 'completed',
        CANCEL_PROJECT: 'cancelled'
      },
      meta: {
        description: 'Construction work is actively underway'
      }
    },
    completed: {
      on: {
        REOPEN_PROJECT: 'in_progress' // Allow reopening for warranty work
      },
      meta: {
        description: 'Project construction is finished'
      }
    },
    cancelled: {
      on: {
        REOPEN_PROJECT: 'draft' // Allow restarting cancelled projects
      },
      meta: {
        description: 'Project has been cancelled'
      }
    }
  }
});

/**
 * Service class for managing project state transitions
 */
export class ProjectStateMachineService {
  /**
   * Get the next state for a given current state and event
   */
  static getNextState(currentState: ProjectState, event: ProjectEvent): ProjectState {
    const service = interpret(projectStateMachine);
    
    // Start the service at the current state
    service.start({ value: currentState, context: {} });
    
    try {
      // Send the event and get the new state
      service.send(event);
      const newState = service.getSnapshot();
      
      service.stop();
      
      if (typeof newState.value === 'string') {
        return newState.value as ProjectState;
      } else {
        throw new Error(`Complex state not supported: ${JSON.stringify(newState.value)}`);
      }
    } catch (error) {
      service.stop();
      throw new Error(`Invalid transition from ${currentState} with event ${event.type}: ${error.message}`);
    }
  }

  /**
   * Validate if a transition is allowed
   */
  static canTransition(currentState: ProjectState, event: ProjectEvent): boolean {
    try {
      this.getNextState(currentState, event);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all possible events for a given state
   */
  static getPossibleEvents(currentState: ProjectState): ProjectEvent['type'][] {
    const stateDefinition = projectStateMachine.states[currentState];
    if (!stateDefinition || !stateDefinition.on) {
      return [];
    }
    
    return Object.keys(stateDefinition.on) as ProjectEvent['type'][];
  }

  /**
   * Get human-readable description of a state
   */
  static getStateDescription(state: ProjectState): string {
    const stateDefinition = projectStateMachine.states[state];
    return stateDefinition?.meta?.description || `Project state: ${state}`;
  }

  /**
   * Map legacy status strings to new state machine states
   */
  static mapLegacyStatus(legacyStatus: string): ProjectState {
    const statusMap: Record<string, ProjectState> = {
      'planning': 'draft',
      'active': 'estimating',
      'on_hold': 'cancelled',
      'completed': 'completed',
      'cancelled': 'cancelled',
      'construction': 'in_progress',
      'in-progress': 'in_progress',
      'client_review': 'client_review',
      'scheduled': 'scheduled',
      'estimating': 'estimating',
      'bidding': 'bidding',
      'awarded': 'awarded'
    };

    return statusMap[legacyStatus] || 'draft';
  }

  /**
   * Map state machine states back to legacy status for backward compatibility
   */
  static mapToLegacyStatus(state: ProjectState): string {
    const legacyMap: Record<ProjectState, string> = {
      'draft': 'planning',
      'estimating': 'active',
      'bidding': 'active',
      'awarded': 'active',
      'client_review': 'client_review',
      'scheduled': 'scheduled',
      'in_progress': 'construction',
      'completed': 'completed',
      'cancelled': 'cancelled'
    };

    return legacyMap[state] || 'planning';
  }
}

// Export convenience functions
export const { getNextState, canTransition, getPossibleEvents, getStateDescription } = ProjectStateMachineService;