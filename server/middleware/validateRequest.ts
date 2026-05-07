import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';

/**
 * Interface for formatted validation errors
 */
interface ValidationErrorResponse {
  error: string;
  code: string;
  details: Record<string, string>;
  timestamp: string;
}

/**
 * Format validation errors into a user-friendly structure
 */
function formatValidationErrors(errors: ValidationError[]): Record<string, string> {
  const formattedErrors: Record<string, string> = {};
  
  errors.forEach((error) => {
    let fieldName: string;
    let message: string;

    if (error.type === 'field') {
      fieldName = error.path;
      message = error.msg;
    } else if (error.type === 'alternative') {
      fieldName = 'validation';
      message = 'One of the alternative validation rules must be satisfied';
    } else if (error.type === 'alternative_grouped') {
      fieldName = 'grouped_validation';
      message = 'Grouped validation failed';
    } else if (error.type === 'unknown_fields') {
      fieldName = 'unknown_fields';
      message = `Unknown fields: ${(error as any).fields?.join(', ') || 'detected'}`;
    } else {
      fieldName = 'general';
      message = error.msg || 'Validation error occurred';
    }

    // If we already have an error for this field, combine them
    if (formattedErrors[fieldName]) {
      formattedErrors[fieldName] = `${formattedErrors[fieldName]}; ${message}`;
    } else {
      formattedErrors[fieldName] = message;
    }
  });
  
  return formattedErrors;
}

/**
 * Express middleware to validate request and return formatted errors
 */
export function validateRequest(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = formatValidationErrors(errors.array());
    
    const errorResponse: ValidationErrorResponse = {
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: formattedErrors,
      timestamp: new Date().toISOString()
    };
    
    // Log validation errors for debugging
    console.warn('Validation failed:', {
      path: req.path,
      method: req.method,
      errors: formattedErrors,
      body: req.body
    });
    
    res.status(400).json(errorResponse);
    return;
  }
  
  next();
}

/**
 * Custom validation error handler that provides more context
 */
export function handleValidationError(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (error.type === 'entity.parse.failed') {
    res.status(400).json({
      error: 'Invalid JSON format',
      code: 'INVALID_JSON',
      details: { body: 'Request body contains invalid JSON' },
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  if (error.type === 'entity.too.large') {
    res.status(400).json({
      error: 'Request too large',
      code: 'REQUEST_TOO_LARGE',
      details: { size: 'Request body exceeds maximum allowed size' },
      timestamp: new Date().toISOString()
    });
    return;
  }
  
  next(error);
}

/**
 * Validation schema helpers for common patterns
 */
export const commonValidations = {
  id: {
    in: ['params'],
    isInt: {
      options: { min: 1 },
      errorMessage: 'ID must be a positive integer'
    },
    toInt: true
  },
  
  projectId: {
    in: ['body', 'params'],
    isInt: {
      options: { min: 1 },
      errorMessage: 'Project ID must be a positive integer'
    },
    toInt: true
  },
  
  email: {
    isEmail: {
      options: { allow_utf8_local_part: false },
      errorMessage: 'Must be a valid email address'
    },
    normalizeEmail: true
  },
  
  name: {
    isLength: {
      options: { min: 1, max: 255 },
      errorMessage: 'Name must be between 1 and 255 characters'
    },
    trim: true,
    escape: true
  },
  
  description: {
    optional: true,
    isLength: {
      options: { max: 2000 },
      errorMessage: 'Description cannot exceed 2000 characters'
    },
    trim: true
  },
  
  currency: {
    isDecimal: {
      options: { decimal_digits: '0,2', force_decimal: false },
      errorMessage: 'Must be a valid currency amount'
    },
    toFloat: true
  },
  
  date: {
    isISO8601: {
      options: { strict: true },
      errorMessage: 'Must be a valid ISO 8601 date'
    },
    toDate: true
  },
  
  status: (allowedValues: string[]) => ({
    isIn: {
      options: [allowedValues],
      errorMessage: `Status must be one of: ${allowedValues.join(', ')}`
    }
  }),
  
  arrayOfStrings: {
    isArray: {
      options: { min: 1 },
      errorMessage: 'Must be a non-empty array'
    },
    custom: {
      options: (value: any[]) => {
        if (!value.every((item: any) => typeof item === 'string')) {
          throw new Error('All items must be strings');
        }
        return true;
      }
    }
  }
};