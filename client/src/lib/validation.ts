import { z } from 'zod';

// Enhanced validation schemas for Projects module
export const ProjectValidationSchema = z.object({
  name: z.string()
    .min(1, 'Project name is required')
    .max(100, 'Project name must be less than 100 characters')
    .refine((name) => !/^\s+$/.test(name), 'Project name cannot be only whitespace'),
  
  description: z.string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional(),
  
  clientName: z.string()
    .min(1, 'Client name is required')
    .max(100, 'Client name must be less than 100 characters'),
  
  clientEmail: z.string()
    .email('Invalid email format')
    .max(254, 'Email must be less than 254 characters')
    .optional()
    .or(z.literal('')),
  
  clientPhone: z.string()
    .regex(/^[\+]?[1-9][\d]{0,15}$/, 'Invalid phone number format')
    .optional()
    .or(z.literal('')),
  
  address: z.string()
    .max(500, 'Address must be less than 500 characters')
    .optional(),
  
  squareFootage: z.number()
    .min(0, 'Square footage must be positive')
    .max(100000, 'Square footage seems unreasonably large')
    .optional(),
  
  estimatedBudget: z.number()
    .min(0, 'Budget must be positive')
    .max(50000000, 'Budget seems unreasonably large')
    .optional(),
  
  startDate: z.string()
    .datetime({ message: 'Invalid start date format' })
    .optional(),
  
  targetCompletion: z.string()
    .datetime({ message: 'Invalid target completion date format' })
    .optional(),
  
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'cancelled'], {
    errorMap: () => ({ message: 'Invalid project status' }),
  }),
  
  projectManagerId: z.string()
    .max(50, 'Project manager ID too long')
    .optional(),
}).refine((data) => {
  // Cross-field validation: target completion must be after start date
  if (data.startDate && data.targetCompletion) {
    return new Date(data.targetCompletion) > new Date(data.startDate);
  }
  return true;
}, {
  message: 'Target completion date must be after start date',
  path: ['targetCompletion'],
});

// Sanitization utilities
export const sanitizeProjectData = (data: any) => {
  return {
    ...data,
    name: data.name?.trim(),
    description: data.description?.trim(),
    clientName: data.clientName?.trim(),
    clientEmail: data.clientEmail?.trim().toLowerCase(),
    clientPhone: data.clientPhone?.replace(/[^\d\+]/g, ''),
    address: data.address?.trim(),
  };
};

// Security validation for project access
export const validateProjectAccess = (userRole: string, projectData: any) => {
  const allowedRoles = ['Admin', 'ProjectManager'];
  
  if (!allowedRoles.includes(userRole)) {
    throw new Error('Insufficient permissions to access this project');
  }
  
  return true;
};

// Input sanitization for search queries
export const sanitizeSearchQuery = (query: string): string => {
  return query
    .trim()
    .replace(/[<>]/g, '') // Remove potential XSS characters
    .substring(0, 100); // Limit length
};

// Validate file uploads for project documents
export const validateFileUpload = (file: File) => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (!allowedTypes.includes(file.type)) {
    throw new Error('File type not allowed');
  }
  
  if (file.size > maxSize) {
    throw new Error('File size too large (max 10MB)');
  }
  
  return true;
};