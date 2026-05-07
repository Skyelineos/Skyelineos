/**
 * Client Controller - Thin controller that delegates to ProjectWorkflowService
 */

import { Request, Response } from 'express';
import { ProjectWorkflowService } from '../services/ProjectWorkflowService';

/**
 * Send estimate to client - thin controller that delegates to ProjectWorkflowService
 */
export async function sendToClient(req: Request, res: Response): Promise<void> {
  try {
    const estimateId = parseInt(req.params.id);
    const { projectId, sentBy } = req.body;
    
    if (isNaN(estimateId)) {
      res.status(400).json({ error: 'Invalid estimate ID' });
      return;
    }

    if (!projectId || !sentBy) {
      res.status(400).json({ error: 'projectId and sentBy are required' });
      return;
    }

    // Delegate to workflow service
    const result = await ProjectWorkflowService.sendToClient({
      estimateId,
      projectId,
      sentBy
    });

    res.json(result);

  } catch (error) {
    console.error('Error in sendToClient controller:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to send estimate to client';
    res.status(500).json({ error: errorMessage });
  }
}

/**
 * Generate schedule - thin controller that delegates to ProjectWorkflowService
 */
export async function generateSchedule(req: Request, res: Response): Promise<void> {
  try {
    const projectId = parseInt(req.params.projectId);
    const { userId } = req.body;
    
    if (isNaN(projectId)) {
      res.status(400).json({ error: 'Invalid project ID' });
      return;
    }

    // Delegate to workflow service
    const result = await ProjectWorkflowService.generateSchedule({
      projectId,
      userId
    });

    res.json(result);

  } catch (error) {
    console.error('Error in generateSchedule controller:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate schedule';
    res.status(500).json({ error: errorMessage });
  }
}