import { z } from 'zod';

// Enhanced validation schemas for project data integrity
export const projectValidationSchema = z.object({
  name: z.string()
    .min(1, 'Project name is required')
    .max(100, 'Project name must be less than 100 characters')
    .regex(/^[a-zA-Z0-9\s\-_().,]+$/, 'Project name contains invalid characters'),
  
  description: z.string()
    .max(500, 'Description must be less than 500 characters')
    .optional(),
  
  clientName: z.string()
    .min(1, 'Client name is required')
    .max(100, 'Client name must be less than 100 characters'),
  
  clientEmail: z.string()
    .email('Invalid email format')
    .optional()
    .or(z.literal('')),
  
  clientPhone: z.string()
    .regex(/^[\+]?[1-9]?[\d\s\-\(\)\.]{7,15}$/, 'Invalid phone number format')
    .optional()
    .or(z.literal('')),
  
  address: z.string()
    .max(200, 'Address must be less than 200 characters')
    .optional(),
  
  squareFootage: z.number()
    .min(0, 'Square footage cannot be negative')
    .max(50000, 'Square footage cannot exceed 50,000')
    .optional(),
  
  estimatedBudget: z.number()
    .min(0, 'Budget cannot be negative')
    .max(10000000, 'Budget cannot exceed $10M')
    .optional(),
  
  startDate: z.date()
    .optional(),
  
  targetCompletion: z.date()
    .optional(),
  
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled'])
});

// Validation for project updates
export const projectUpdateSchema = projectValidationSchema.partial();

// Cross-field validation rules
export function validateProjectDates(startDate?: Date, targetCompletion?: Date): string[] {
  const errors: string[] = [];
  
  if (startDate && targetCompletion) {
    if (startDate >= targetCompletion) {
      errors.push('Target completion date must be after start date');
    }
    
    // Check if dates are reasonable (not too far in the past or future)
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const fiveYearsFromNow = new Date(now.getFullYear() + 5, now.getMonth(), now.getDate());
    
    if (startDate < oneYearAgo) {
      errors.push('Start date cannot be more than 1 year in the past');
    }
    
    if (targetCompletion > fiveYearsFromNow) {
      errors.push('Target completion cannot be more than 5 years in the future');
    }
  }
  
  return errors;
}

// Budget validation rules
export function validateProjectBudget(budget?: number, squareFootage?: number): string[] {
  const errors: string[] = [];
  
  if (budget && squareFootage) {
    const costPerSqft = budget / squareFootage;
    
    // Reasonable cost per square foot validation (construction industry standards)
    if (costPerSqft < 50) {
      errors.push('Cost per square foot seems unusually low (less than $50/sqft)');
    }
    
    if (costPerSqft > 1000) {
      errors.push('Cost per square foot seems unusually high (more than $1000/sqft)');
    }
  }
  
  return errors;
}

// Comprehensive project validation
export function validateProject(projectData: any): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Schema validation
    projectValidationSchema.parse(projectData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      errors.push(...error.errors.map(err => err.message));
    }
  }
  
  // Cross-field validation
  const dateErrors = validateProjectDates(projectData.startDate, projectData.targetCompletion);
  errors.push(...dateErrors);
  
  const budgetWarnings = validateProjectBudget(projectData.estimatedBudget, projectData.squareFootage);
  warnings.push(...budgetWarnings);
  
  // Business rule validation
  if (projectData.status === 'active' && !projectData.startDate) {
    errors.push('Active projects must have a start date');
  }
  
  if (projectData.status === 'completed' && !projectData.targetCompletion) {
    warnings.push('Completed projects should have a target completion date');
  }
  
  return {
    isValid: errors.length === 0,
    errors: [...new Set(errors)], // Remove duplicates
    warnings: [...new Set(warnings)], // Remove duplicates
  };
}

// Input sanitization for security
export function sanitizeProjectInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .slice(0, 1000); // Limit length for security
}

// Safe number parsing
export function parseProjectNumber(value: string | number | undefined): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[,$]/g, ''));
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

// File upload validation
export function validateProjectFile(file: File): { isValid: boolean; error?: string } {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  if (file.size > maxSize) {
    return { isValid: false, error: 'File size must be less than 10MB' };
  }
  
  if (!allowedTypes.includes(file.type)) {
    return { isValid: false, error: 'File type not allowed' };
  }
  
  // Check for potentially malicious file names
  if (/[<>:"\\|?*]/.test(file.name)) {
    return { isValid: false, error: 'File name contains invalid characters' };
  }
  
  return { isValid: true };
}