import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { EstimateService } from '../services/EstimateService';
import { authenticateToken, requireRole } from '../middleware/auth';
import { authorizeProjectAccess } from '../middleware/authorizeProjectAccess';
import { catchAsync, AppError } from '../middleware/errorHandler';
import { logger } from '../logger';

const router = Router();

// Validation schemas
const sendEstimateSchema = [
  param('projectId').isInt({ min: 1 }).withMessage('Invalid project ID'),
  param('estimateId').isInt({ min: 1 }).withMessage('Invalid estimate ID'),
  body('customMessage').optional().isString().trim().isLength({ max: 500 }).withMessage('Custom message must be a string with max 500 characters'),
];

const approveEstimateSchema = [
  param('projectId').isInt({ min: 1 }).withMessage('Invalid project ID'),
  param('estimateId').isInt({ min: 1 }).withMessage('Invalid estimate ID'),
  body('clientMessage').optional().isString().trim().isLength({ max: 500 }).withMessage('Client message must be a string with max 500 characters'),
];

const rejectEstimateSchema = [
  param('projectId').isInt({ min: 1 }).withMessage('Invalid project ID'),
  param('estimateId').isInt({ min: 1 }).withMessage('Invalid estimate ID'),
  body('rejectionReason').notEmpty().isString().trim().isLength({ max: 500 }).withMessage('Rejection reason is required and must be max 500 characters'),
  body('clientMessage').optional().isString().trim().isLength({ max: 500 }).withMessage('Client message must be a string with max 500 characters'),
];

/**
 * Send estimate to client for approval
 * POST /api/projects/:projectId/estimates/:estimateId/send
 */
router.post(
  '/projects/:projectId/estimates/:estimateId/send',
  authenticateToken,
  authorizeProjectAccess,
  requireRole(['admin', 'project_manager']),
  sendEstimateSchema,
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, { errors: errors.array() });
    }

    const projectId = parseInt(req.params.projectId);
    const estimateId = parseInt(req.params.estimateId);
    const userId = req.user?.id;
    const { customMessage } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const estimate = await EstimateService.sendEstimate({
      projectId,
      estimateId,
      userId,
      customMessage
    });

    logger.info('Estimate sent to client via API', {
      projectId,
      estimateId,
      userId,
      hasCustomMessage: !!customMessage
    });

    res.status(200).json({
      success: true,
      message: 'Estimate sent to client successfully',
      data: {
        estimateId: estimate.id,
        status: 'sent',
        sentAt: new Date().toISOString()
      }
    });
  })
);

/**
 * Client approves the estimate
 * POST /api/projects/:projectId/estimates/:estimateId/approve
 */
router.post(
  '/projects/:projectId/estimates/:estimateId/approve',
  authenticateToken,
  authorizeProjectAccess,
  approveEstimateSchema,
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, { errors: errors.array() });
    }

    const projectId = parseInt(req.params.projectId);
    const estimateId = parseInt(req.params.estimateId);
    const userId = req.user?.id;
    const { clientMessage } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const estimate = await EstimateService.approveEstimate({
      projectId,
      estimateId,
      userId,
      clientMessage
    });

    logger.info('Estimate approved via API', {
      projectId,
      estimateId,
      userId,
      hasClientMessage: !!clientMessage
    });

    res.status(200).json({
      success: true,
      message: 'Estimate approved successfully',
      data: {
        estimateId: estimate.id,
        status: estimate.status,
        approvedAt: estimate.approvedAt,
        approvedBy: estimate.approvedBy,
        clientMessage: estimate.clientMessage
      }
    });
  })
);

/**
 * Client rejects the estimate
 * POST /api/projects/:projectId/estimates/:estimateId/reject
 */
router.post(
  '/projects/:projectId/estimates/:estimateId/reject',
  authenticateToken,
  authorizeProjectAccess,
  rejectEstimateSchema,
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, { errors: errors.array() });
    }

    const projectId = parseInt(req.params.projectId);
    const estimateId = parseInt(req.params.estimateId);
    const userId = req.user?.id;
    const { rejectionReason, clientMessage } = req.body;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const estimate = await EstimateService.rejectEstimate({
      projectId,
      estimateId,
      userId,
      rejectionReason,
      clientMessage
    });

    logger.info('Estimate rejected via API', {
      projectId,
      estimateId,
      userId,
      rejectionReason,
      hasClientMessage: !!clientMessage
    });

    res.status(200).json({
      success: true,
      message: 'Estimate rejected successfully',
      data: {
        estimateId: estimate.id,
        status: estimate.status,
        rejectedAt: estimate.rejectedAt,
        rejectedBy: estimate.rejectedBy,
        rejectionReason: estimate.rejectionReason,
        clientMessage: estimate.clientMessage
      }
    });
  })
);

/**
 * Get estimate with approval details
 * GET /api/projects/:projectId/estimates/:estimateId/approval-details
 */
router.get(
  '/projects/:projectId/estimates/:estimateId/approval-details',
  authenticateToken,
  authorizeProjectAccess,
  param('projectId').isInt({ min: 1 }).withMessage('Invalid project ID'),
  param('estimateId').isInt({ min: 1 }).withMessage('Invalid estimate ID'),
  catchAsync(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new AppError('Validation failed', 400, { errors: errors.array() });
    }

    const projectId = parseInt(req.params.projectId);
    const estimateId = parseInt(req.params.estimateId);

    const estimate = await EstimateService.getEstimateWithApprovalDetails(projectId, estimateId);

    if (!estimate) {
      throw new AppError('Estimate not found', 404);
    }

    res.status(200).json({
      success: true,
      data: estimate
    });
  })
);

export default router;