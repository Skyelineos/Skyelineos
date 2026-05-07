import { Request, Response } from 'express';
import { checkSchema, Schema } from 'express-validator';
import { storage } from '../memory-storage';
import { commonValidations } from '../middleware/validateRequest';

/**
 * Validation schema for creating estimates
 */
export const createEstimateSchema: Schema = {
  projectId: {
    ...commonValidations.projectId,
    in: ['body'],
    errorMessage: 'Project ID is required and must be a positive integer'
  },
  
  title: {
    in: ['body'],
    isLength: {
      options: { min: 1, max: 255 },
      errorMessage: 'Title must be between 1 and 255 characters'
    },
    trim: true,
    escape: true,
    errorMessage: 'Title is required'
  },
  
  description: {
    in: ['body'],
    optional: true,
    isLength: {
      options: { max: 2000 },
      errorMessage: 'Description cannot exceed 2000 characters'
    },
    trim: true
  },
  
  clientName: {
    in: ['body'],
    ...commonValidations.name,
    errorMessage: 'Client name is required'
  },
  
  clientEmail: {
    in: ['body'],
    optional: true,
    ...commonValidations.email
  },
  
  totalCost: {
    in: ['body'],
    optional: true,
    ...commonValidations.currency,
    errorMessage: 'Total cost must be a valid currency amount'
  },
  
  status: {
    in: ['body'],
    optional: true,
    ...commonValidations.status(['draft', 'sent', 'approved', 'rejected', 'expired']),
    errorMessage: 'Status must be one of: draft, sent, approved, rejected, expired'
  },
  
  validUntil: {
    in: ['body'],
    optional: true,
    ...commonValidations.date,
    errorMessage: 'Valid until date must be a valid ISO 8601 date'
  },
  
  items: {
    in: ['body'],
    isArray: {
      options: { min: 1 },
      errorMessage: 'At least one estimate item is required'
    },
    custom: {
      options: (items: any[]) => {
        if (!Array.isArray(items)) {
          throw new Error('Items must be an array');
        }
        
        items.forEach((item, index) => {
          if (!item.category || typeof item.category !== 'string') {
            throw new Error(`Item ${index + 1}: Category is required`);
          }
          if (!item.description || typeof item.description !== 'string') {
            throw new Error(`Item ${index + 1}: Description is required`);
          }
          if (item.cost !== undefined && (isNaN(Number(item.cost)) || Number(item.cost) < 0)) {
            throw new Error(`Item ${index + 1}: Cost must be a positive number`);
          }
        });
        
        return true;
      }
    }
  },
  
  notes: {
    in: ['body'],
    optional: true,
    isLength: {
      options: { max: 1000 },
      errorMessage: 'Notes cannot exceed 1000 characters'
    },
    trim: true
  }
};

/**
 * Validation schema for updating estimates
 */
export const updateEstimateSchema: Schema = {
  id: {
    ...commonValidations.id,
    in: ['params'],
    errorMessage: 'Estimate ID must be a positive integer'
  },
  
  title: {
    in: ['body'],
    optional: true,
    isLength: {
      options: { min: 1, max: 255 },
      errorMessage: 'Title must be between 1 and 255 characters'
    },
    trim: true,
    escape: true
  },
  
  description: {
    in: ['body'],
    optional: true,
    isLength: {
      options: { max: 2000 },
      errorMessage: 'Description cannot exceed 2000 characters'
    },
    trim: true
  },
  
  status: {
    in: ['body'],
    optional: true,
    ...commonValidations.status(['draft', 'sent', 'approved', 'rejected', 'expired'])
  },
  
  totalCost: {
    in: ['body'],
    optional: true,
    ...commonValidations.currency
  },
  
  notes: {
    in: ['body'],
    optional: true,
    isLength: {
      options: { max: 1000 },
      errorMessage: 'Notes cannot exceed 1000 characters'
    },
    trim: true
  }
};

/**
 * Validation schema for estimate approval
 */
export const approveEstimateSchema: Schema = {
  id: {
    ...commonValidations.id,
    in: ['params']
  },
  
  status: {
    in: ['body'],
    ...commonValidations.status(['approved', 'rejected']),
    errorMessage: 'Status must be either "approved" or "rejected"'
  },
  
  approvedDate: {
    in: ['body'],
    optional: true,
    ...commonValidations.date
  },
  
  clientSignature: {
    in: ['body'],
    optional: true,
    isLength: {
      options: { max: 500 },
      errorMessage: 'Client signature cannot exceed 500 characters'
    },
    trim: true
  },
  
  rejectionNote: {
    in: ['body'],
    optional: true,
    isLength: {
      options: { max: 1000 },
      errorMessage: 'Rejection note cannot exceed 1000 characters'
    },
    trim: true
  },
  
  approvedBy: {
    in: ['body'],
    optional: true,
    ...commonValidations.name
  }
};

/**
 * Controller function to create a new estimate
 */
export async function createEstimate(req: Request & { user?: any, logger?: any }, res: Response): Promise<void> {
  try {
    const requestLogger = req.logger || console;
    
    const {
      projectId,
      title,
      description,
      clientName,
      clientEmail,
      totalCost,
      status = 'draft',
      validUntil,
      items,
      notes
    } = req.body;
    
    requestLogger.info?.('Creating new estimate', { projectId, title, itemCount: items?.length });

    // Check if project exists (basic validation)
    const projects = await storage.getProjects();
    const project = projects.find(p => p.id === projectId);
    
    if (!project) {
      res.status(404).json({
        error: 'Project not found',
        code: 'PROJECT_NOT_FOUND'
      });
      return;
    }

    // Create the estimate
    const estimateData = {
      projectId,
      title,
      description,
      clientName,
      clientEmail,
      totalCost: totalCost || 0,
      status,
      validUntil: validUntil ? new Date(validUntil) : undefined,
      items: items || [],
      notes,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const newEstimate = await storage.createEstimate(estimateData);

    res.status(201).json({
      success: true,
      estimate: newEstimate,
      message: 'Estimate created successfully'
    });

  } catch (error) {
    console.error('Error creating estimate:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create estimate';
    res.status(500).json({
      error: errorMessage,
      code: 'ESTIMATE_CREATION_FAILED'
    });
  }
}

/**
 * Controller function to update an existing estimate
 */
export async function updateEstimate(req: Request & { user?: any }, res: Response): Promise<void> {
  try {
    const estimateId = parseInt(req.params.id);
    const updateData = req.body;

    // Get existing estimate
    const estimates = await storage.getEstimatesByProject(updateData.projectId || 0);
    const existingEstimate = estimates.find(e => e.id === estimateId);

    if (!existingEstimate) {
      res.status(404).json({
        error: 'Estimate not found',
        code: 'ESTIMATE_NOT_FOUND'
      });
      return;
    }

    // Update the estimate
    const updatedEstimate = await storage.updateEstimate(estimateId, {
      ...updateData,
      updatedAt: new Date()
    });

    if (!updatedEstimate) {
      res.status(500).json({
        error: 'Failed to update estimate',
        code: 'ESTIMATE_UPDATE_FAILED'
      });
      return;
    }

    res.json({
      success: true,
      estimate: updatedEstimate,
      message: 'Estimate updated successfully'
    });

  } catch (error) {
    console.error('Error updating estimate:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update estimate';
    res.status(500).json({
      error: errorMessage,
      code: 'ESTIMATE_UPDATE_FAILED'
    });
  }
}

/**
 * Controller function to approve an estimate
 */
export async function approveEstimate(req: Request & { user?: any }, res: Response): Promise<void> {
  try {
    const estimateId = parseInt(req.params.id);
    const { status, approvedDate, clientSignature, rejectionNote, approvedBy } = req.body;

    // Get existing estimate
    const estimates = await storage.getAllEstimates();
    const existingEstimate = estimates.find(e => e.id === estimateId);

    if (!existingEstimate) {
      res.status(404).json({
        error: 'Estimate not found',
        code: 'ESTIMATE_NOT_FOUND'
      });
      return;
    }

    // Update estimate status
    const updateData: any = {
      status,
      updatedAt: new Date()
    };

    if (status === 'approved') {
      updateData.approvedDate = approvedDate ? new Date(approvedDate) : new Date();
      updateData.approvedBy = approvedBy || req.user?.email;
      updateData.clientSignature = clientSignature;
    } else if (status === 'rejected') {
      updateData.rejectionNote = rejectionNote;
    }

    const updatedEstimate = await storage.updateEstimate(estimateId, updateData);

    if (!updatedEstimate) {
      res.status(500).json({
        error: 'Failed to update estimate approval status',
        code: 'ESTIMATE_APPROVAL_FAILED'
      });
      return;
    }

    res.json({
      success: true,
      estimate: updatedEstimate,
      message: `Estimate ${status} successfully`
    });

  } catch (error) {
    console.error('Error approving estimate:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to update estimate approval status';
    res.status(500).json({
      error: errorMessage,
      code: 'ESTIMATE_APPROVAL_FAILED'
    });
  }
}

/**
 * Controller function to get estimates by project
 */
export async function getEstimatesByProject(req: Request, res: Response): Promise<void> {
  try {
    const projectId = parseInt(req.params.projectId);
    
    if (isNaN(projectId)) {
      res.status(400).json({
        error: 'Invalid project ID',
        code: 'INVALID_PROJECT_ID'
      });
      return;
    }

    const estimates = await storage.getEstimatesByProject(projectId);
    
    res.json({
      success: true,
      estimates,
      total: estimates.length
    });

  } catch (error) {
    console.error('Error fetching estimates:', error);
    res.status(500).json({
      error: 'Failed to fetch estimates',
      code: 'ESTIMATE_FETCH_FAILED'
    });
  }
}