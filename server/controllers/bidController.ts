/**
 * Bid Controller - Thin controller that delegates to ProjectWorkflowService
 */

import { Request, Response } from 'express';
import { ProjectWorkflowService } from '../services/ProjectWorkflowService';

/**
 * Award a bid - thin controller that delegates to ProjectWorkflowService
 */
export async function awardBid(req: Request, res: Response): Promise<void> {
  try {
    const bidId = parseInt(req.params.id);
    const { awardedBy, projectId } = req.body;
    
    if (isNaN(bidId)) {
      res.status(400).json({ error: 'Invalid bid ID' });
      return;
    }

    if (!awardedBy || !projectId) {
      res.status(400).json({ error: 'awardedBy and projectId are required' });
      return;
    }

    // Delegate to workflow service
    const result = await ProjectWorkflowService.awardBid({
      bidId,
      awardedBy,
      projectId
    });

    res.json(result);

  } catch (error) {
    console.error('Error in awardBid controller:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to award bid';
    res.status(500).json({ error: errorMessage });
  }
}