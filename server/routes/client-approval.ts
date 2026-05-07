/**
 * Client approval routes for automatic project status transitions
 */
import { Router } from 'express';
import { ProjectWorkflowService } from '../services/ProjectWorkflowService';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * Client approves project for scheduling
 * POST /api/projects/:projectId/client-approval
 */
router.post('/projects/:projectId/client-approval', 
  authenticateToken,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const userId = (req as any).user?.id?.toString() || 'system';
      
      // Trigger automatic transition to scheduled status
      const result = await ProjectWorkflowService.approveClient(projectId, userId);
      
      res.json({ 
        success: true, 
        message: 'Project approved and moved to scheduled status',
        project: result
      });
    } catch (error) {
      console.error('Error in client approval:', error);
      res.status(500).json({ 
        error: 'Failed to approve project',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Get project workflow state and suggested actions
 * GET /api/projects/:projectId/workflow-state
 */
router.get('/projects/:projectId/workflow-state',
  authenticateToken,
  async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const workflowState = ProjectWorkflowService.getProjectWorkflowState(projectId);
      
      res.json(workflowState);
    } catch (error) {
      console.error('Error getting workflow state:', error);
      res.status(500).json({ 
        error: 'Failed to get workflow state',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;