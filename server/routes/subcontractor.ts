import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { requireRole, authenticateToken } from '../middleware/auth';
import { catchAsync } from '../middleware/errorHandler';

const router = Router();

// Middleware to ensure user is a subcontractor
const requireSubcontractorRole = requireRole(['subcontractor']);

/**
 * GET /api/sub/projects
 * Returns projects assigned to the authenticated subcontractor
 */
router.get('/projects', authenticateToken, requireSubcontractorRole, catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const userEmail = req.user?.email;
  
  if (!userId || !userEmail) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  // Find the subcontractor contact record
  const contacts = await storage.getAllContacts();
  const subcontractor = contacts.find((contact: any) => 
    contact.email === userEmail && contact.role === 'subcontractor'
  );

  if (!subcontractor) {
    return res.status(404).json({ error: 'Subcontractor profile not found' });
  }

  // Get projects where this subcontractor is assigned
  const projects = await storage.getProjects();
  const assignedProjects = projects.filter(project => {
    // Check if subcontractor is in associated projects list
    if (subcontractor.associatedProjects) {
      try {
        const associatedIds = JSON.parse(subcontractor.associatedProjects);
        return associatedIds.includes(project.id);
      } catch (e) {
        return false;
      }
    }
    return false;
  }).map(project => ({
    id: project.id,
    name: project.name,
    status: project.status,
    clientName: project.clientName,
    address: project.address,
    startDate: project.startDate,
    targetCompletion: project.targetCompletion
  }));

  res.json(assignedProjects);
}));

/**
 * GET /api/sub/projects/:projectId/tasks
 * Returns tasks assigned to the authenticated subcontractor for a specific project
 */
router.get('/projects/:projectId/tasks', authenticateToken, requireSubcontractorRole, catchAsync(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const userEmail = req.user?.email;

  // Find the subcontractor contact record
  const contacts = await storage.getAllContacts();
  const subcontractor = contacts.find((contact: any) => 
    contact.email === userEmail && contact.role === 'subcontractor'
  );

  if (!subcontractor) {
    return res.status(404).json({ error: 'Subcontractor profile not found' });
  }

  // Get tasks for this project assigned to this subcontractor
  const tasks = await storage.getAllTasks();
  const assignedTasks = tasks.filter((task: any) => 
    task.projectId === parseInt(projectId) && task.assignedSubId === subcontractor.id
  );

  res.json(assignedTasks);
}));

/**
 * GET /api/sub/projects/:projectId/bids
 * Returns bids submitted by the authenticated subcontractor for a specific project
 */
router.get('/projects/:projectId/bids', authenticateToken, requireSubcontractorRole, catchAsync(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const userEmail = req.user?.email;

  // Find the subcontractor contact record
  const contacts = await storage.getAllContacts();
  const subcontractor = contacts.find((contact: any) => 
    contact.email === userEmail && contact.role === 'subcontractor'
  );

  if (!subcontractor) {
    return res.status(404).json({ error: 'Subcontractor profile not found' });
  }

  // Get bid items for this project from this subcontractor
  const bidItems = await storage.getBidsByProject(parseInt(projectId));
  const subcontractorBids = bidItems.filter((bid: any) => 
    bid.contactId === subcontractor.id
  );

  res.json(subcontractorBids);
}));

/**
 * GET /api/sub/projects/:projectId/pos
 * Returns purchase orders for the authenticated subcontractor for a specific project
 */
router.get('/projects/:projectId/pos', authenticateToken, requireSubcontractorRole, catchAsync(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const userEmail = req.user?.email;

  // Find the subcontractor contact record
  const contacts = await storage.getAllContacts();
  const subcontractor = contacts.find((contact: any) => 
    contact.email === userEmail && contact.role === 'subcontractor'
  );

  if (!subcontractor) {
    return res.status(404).json({ error: 'Subcontractor profile not found' });
  }

  // Get purchase orders for this project for this subcontractor
  const purchaseOrders = await storage.getAllPurchaseOrders();
  const subcontractorPOs = purchaseOrders.filter((po: any) => 
    po.projectId === parseInt(projectId) && po.subcontractorId === subcontractor.id
  );

  res.json(subcontractorPOs);
}));

/**
 * POST /api/sub/tasks/:taskId/update
 * Update task status or actual dates by the authenticated subcontractor
 */
router.post('/tasks/:taskId/update', authenticateToken, requireSubcontractorRole, catchAsync(async (req: Request, res: Response) => {
  const { taskId } = req.params;
  const { status, actualStartDate, actualEndDate, notes } = req.body;
  const userEmail = req.user?.email;

  // Find the subcontractor contact record
  const contacts = await storage.getAllContacts();
  const subcontractor = contacts.find((contact: any) => 
    contact.email === userEmail && contact.role === 'subcontractor'
  );

  if (!subcontractor) {
    return res.status(404).json({ error: 'Subcontractor profile not found' });
  }

  // Get the task and verify it's assigned to this subcontractor
  const tasks = await storage.getAllTasks();
  const task = tasks.find((t: any) => t.id === parseInt(taskId));
  if (!task || task.assignedSubId !== subcontractor.id) {
    return res.status(403).json({ error: 'Task not assigned to this subcontractor' });
  }

  // Update the task - for now we'll use a simple approach
  const updatedTask = {
    ...task,
    status,
    actualStartDate,
    actualEndDate,
    notes: notes ? `${task.notes || ''}\n[${new Date().toISOString()}] ${subcontractor.name}: ${notes}` : task.notes
  };

  res.json(updatedTask);
}));

/**
 * POST /api/sub/bids
 * Submit a new bid by the authenticated subcontractor
 */
router.post('/bids', authenticateToken, requireSubcontractorRole, catchAsync(async (req: Request, res: Response) => {
  const { projectId, estimateId, estimateItemId, bidAmount, timeline, notes, trade, category } = req.body;
  const userEmail = req.user?.email;

  // Find the subcontractor contact record
  const contacts = await storage.getAllContacts();
  const subcontractor = contacts.find((contact: any) => 
    contact.email === userEmail && contact.role === 'subcontractor'
  );

  if (!subcontractor) {
    return res.status(404).json({ error: 'Subcontractor profile not found' });
  }

  // Verify the subcontractor is associated with this project
  if (subcontractor.associatedProjects) {
    try {
      const associatedIds = JSON.parse(subcontractor.associatedProjects);
      if (!associatedIds.includes(parseInt(projectId))) {
        return res.status(403).json({ error: 'Not authorized for this project' });
      }
    } catch (e) {
      return res.status(403).json({ error: 'Not authorized for this project' });
    }
  } else {
    return res.status(403).json({ error: 'Not authorized for this project' });
  }

  // Create the bid item
  const bidItem = await storage.createBid({
    projectId: parseInt(projectId),
    estimateId: parseInt(estimateId),
    estimateItemId,
    contactId: subcontractor.id,
    bidAmount: parseFloat(bidAmount),
    timeline: parseInt(timeline),
    notes,
    trade,
    category,
    status: 'pending'
  });

  res.status(201).json(bidItem);
}));

/**
 * GET /api/sub/profile
 * Get subcontractor profile information
 */
router.get('/profile', authenticateToken, requireSubcontractorRole, catchAsync(async (req: Request, res: Response) => {
  const userEmail = req.user?.email;

  // Find the subcontractor contact record
  const contacts = await storage.getAllContacts();
  const subcontractor = contacts.find((contact: any) => 
    contact.email === userEmail && contact.role === 'subcontractor'
  );

  if (!subcontractor) {
    return res.status(404).json({ error: 'Subcontractor profile not found' });
  }

  res.json(subcontractor);
}));

/**
 * POST /api/sub/pos/:poId/acknowledge
 * Acknowledge a purchase order
 */
router.post('/pos/:poId/acknowledge', authenticateToken, requireSubcontractorRole, catchAsync(async (req: Request, res: Response) => {
  const { poId } = req.params;
  const userEmail = req.user?.email;

  // Find the subcontractor contact record
  const contacts = await storage.getAllContacts();
  const subcontractor = contacts.find((contact: any) => 
    contact.email === userEmail && contact.role === 'subcontractor'
  );

  if (!subcontractor) {
    return res.status(404).json({ error: 'Subcontractor profile not found' });
  }

  // Get the PO and verify it belongs to this subcontractor
  const pos = await storage.getAllPurchaseOrders();
  const po = pos.find((p: any) => p.id === parseInt(poId));
  if (!po || po.subcontractorId !== subcontractor.id) {
    return res.status(403).json({ error: 'Purchase order not found or not authorized' });
  }

  // Update PO status to acknowledged - for now return the updated object
  const updatedPO = {
    ...po,
    status: 'acknowledged',
    acknowledgedAt: new Date().toISOString(),
    acknowledgedBy: subcontractor.id
  };

  res.json(updatedPO);
}));

export default router;