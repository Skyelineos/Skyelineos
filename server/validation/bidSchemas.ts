import { Schema } from 'express-validator';
import { commonValidations } from '../middleware/validateRequest';

/**
 * Validation schema for creating bid invitations
 */
export const createBidInvitationSchema: Schema = {
  projectId: {
    ...commonValidations.projectId,
    in: ['body'],
    errorMessage: 'Project ID is required and must be a positive integer'
  },
  
  estimateId: {
    in: ['body'],
    isInt: {
      options: { min: 1 },
      errorMessage: 'Estimate ID must be a positive integer'
    },
    toInt: true
  },
  
  estimateItemId: {
    in: ['body'],
    optional: true,
    isString: {
      errorMessage: 'Estimate item ID must be a string'
    },
    trim: true
  },
  
  trade: {
    in: ['body'],
    isLength: {
      options: { min: 1, max: 100 },
      errorMessage: 'Trade must be between 1 and 100 characters'
    },
    trim: true,
    escape: true
  },
  
  category: {
    in: ['body'],
    isLength: {
      options: { min: 1, max: 100 },
      errorMessage: 'Category must be between 1 and 100 characters'
    },
    trim: true,
    escape: true
  },
  
  description: {
    in: ['body'],
    isLength: {
      options: { min: 1, max: 2000 },
      errorMessage: 'Description must be between 1 and 2000 characters'
    },
    trim: true
  },
  
  estimatedCost: {
    in: ['body'],
    optional: true,
    ...commonValidations.currency,
    errorMessage: 'Estimated cost must be a valid currency amount'
  },
  
  invitedSubs: {
    in: ['body'],
    isArray: {
      options: { min: 1 },
      errorMessage: 'At least one subcontractor must be invited'
    },
    custom: {
      options: (subs: any[]) => {
        if (!Array.isArray(subs)) {
          throw new Error('Invited subs must be an array');
        }
        
        subs.forEach((sub, index) => {
          if (!sub.id || typeof sub.id !== 'number') {
            throw new Error(`Subcontractor ${index + 1}: ID is required and must be a number`);
          }
          if (!sub.name || typeof sub.name !== 'string') {
            throw new Error(`Subcontractor ${index + 1}: Name is required`);
          }
          if (sub.email && typeof sub.email !== 'string') {
            throw new Error(`Subcontractor ${index + 1}: Email must be a string`);
          }
        });
        
        return true;
      }
    }
  },
  
  dueDate: {
    in: ['body'],
    ...commonValidations.date,
    errorMessage: 'Due date must be a valid ISO 8601 date'
  },
  
  notes: {
    in: ['body'],
    optional: true,
    isLength: {
      options: { max: 1000 },
      errorMessage: 'Notes cannot exceed 1000 characters'
    },
    trim: true
  },
  
  attachments: {
    in: ['body'],
    optional: true,
    isArray: true,
    custom: {
      options: (attachments: any[]) => {
        if (attachments && Array.isArray(attachments)) {
          attachments.forEach((attachment, index) => {
            if (!attachment.url || typeof attachment.url !== 'string') {
              throw new Error(`Attachment ${index + 1}: URL is required`);
            }
            if (attachment.name && typeof attachment.name !== 'string') {
              throw new Error(`Attachment ${index + 1}: Name must be a string`);
            }
          });
        }
        return true;
      }
    }
  }
};

/**
 * Validation schema for creating bid responses
 */
export const createBidResponseSchema: Schema = {
  bidProcessId: {
    in: ['body'],
    isInt: {
      options: { min: 1 },
      errorMessage: 'Bid process ID must be a positive integer'
    },
    toInt: true
  },
  
  subcontractorId: {
    in: ['body'],
    isInt: {
      options: { min: 1 },
      errorMessage: 'Subcontractor ID must be a positive integer'
    },
    toInt: true
  },
  
  bidAmount: {
    in: ['body'],
    ...commonValidations.currency,
    custom: {
      options: (value: number) => {
        if (value <= 0) {
          throw new Error('Bid amount must be greater than 0');
        }
        return true;
      }
    },
    errorMessage: 'Bid amount must be a positive currency amount'
  },
  
  proposedTimeline: {
    in: ['body'],
    isInt: {
      options: { min: 1, max: 365 },
      errorMessage: 'Proposed timeline must be between 1 and 365 days'
    },
    toInt: true
  },
  
  comments: {
    in: ['body'],
    optional: true,
    isLength: {
      options: { max: 2000 },
      errorMessage: 'Comments cannot exceed 2000 characters'
    },
    trim: true
  },
  
  attachments: {
    in: ['body'],
    optional: true,
    isArray: true,
    custom: {
      options: (attachments: any[]) => {
        if (attachments && Array.isArray(attachments)) {
          attachments.forEach((attachment, index) => {
            if (!attachment.url || typeof attachment.url !== 'string') {
              throw new Error(`Attachment ${index + 1}: URL is required`);
            }
            if (attachment.name && typeof attachment.name !== 'string') {
              throw new Error(`Attachment ${index + 1}: Name must be a string`);
            }
          });
        }
        return true;
      }
    }
  },
  
  availableStartDate: {
    in: ['body'],
    optional: true,
    ...commonValidations.date,
    errorMessage: 'Available start date must be a valid ISO 8601 date'
  }
};

/**
 * Validation schema for updating bid status
 */
export const updateBidStatusSchema: Schema = {
  bidId: {
    ...commonValidations.id,
    in: ['params'],
    errorMessage: 'Bid ID must be a positive integer'
  },
  
  status: {
    in: ['body'],
    ...commonValidations.status(['pending', 'accepted', 'rejected', 'withdrawn']),
    errorMessage: 'Status must be one of: pending, accepted, rejected, withdrawn'
  },
  
  rejectionReason: {
    in: ['body'],
    optional: true,
    isLength: {
      options: { max: 500 },
      errorMessage: 'Rejection reason cannot exceed 500 characters'
    },
    trim: true
  },
  
  acceptedBy: {
    in: ['body'],
    optional: true,
    ...commonValidations.name,
    errorMessage: 'Accepted by must be a valid name'
  }
};