/**
 * Projects Controller - Thin controller that delegates to ProjectWorkflowService
 */

import { Request, Response } from 'express';
import { ProjectWorkflowService } from '../services/ProjectWorkflowService';

/**
 * Approve an estimate - thin controller that delegates to ProjectWorkflowService
 */
export async function approveEstimate(req: Request & { user?: any }, res: Response): Promise<void> {
  try {
    const estimateId = parseInt(req.params.id);
    const { status, approvedDate, clientSignature, rejectionNote, approvedBy } = req.body;
    
    if (isNaN(estimateId)) {
      res.status(400).json({ error: 'Invalid estimate ID' });
      return;
    }

    // Delegate to existing estimate workflow service (assuming this exists)
    // const result = await EstimateWorkflowService.approveEstimate({
    //   estimateId,
    //   status,
    //   approvedDate,
    //   clientSignature,
    //   rejectionNote,
    //   approvedBy
    // });

    // For now, create a simple result object
    const result = {
      success: true,
      estimate: { projectId: 123 } // This should come from actual estimate data
    };

    // Trigger automatic project status transition
    if (status === 'approved' && result.estimate?.projectId) {
      const userId = req.user?.id?.toString() || 'system';
      await ProjectWorkflowService.approveEstimate(result.estimate.projectId, userId);
    }

    res.json(result);

  } catch (error) {
    console.error('Error in approveEstimate controller:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update estimate approval status';
    res.status(500).json({ error: errorMessage });
  }
}