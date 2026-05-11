import { z } from 'zod';

// Project validation schemas
export const projectIdSchema = z.object({
  projectId: z.string().regex(/^\d+$/).transform(Number)
});

export const taskIdSchema = z.object({
  taskId: z.string().regex(/^\d+$/).transform(Number)
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  clientId: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budget: z.number().optional(),
  status: z.enum(['planning', 'active', 'punch_list', 'closeout', 'completed', 'on_hold', 'cancelled', 'archived']).default('planning')
});

export const updateProjectSchema = createProjectSchema.partial();

// Task validation schemas
export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  projectId: z.number(),
  assignedTo: z.number().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).default('pending'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium')
});

export const updateTaskSchema = createTaskSchema.partial().omit({ projectId: true });

// User validation schemas
export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  role: z.enum(['admin', 'project_manager', 'client', 'subcontractor', 'designer', 'accountant'])
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true });

// Pagination schema
export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).default('10'),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});