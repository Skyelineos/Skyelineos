// Example type-safe API handler showing comprehensive elimination of 'any' types
import { Request, Response } from 'express';
import { z } from 'zod';
import { ApiResponse, PaginatedResponse, DatabaseProject, Estimate, Contact, BidResponse } from '@shared/types';

// Request validation schemas
const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  clientName: z.string().min(1, 'Client name is required'),
  address: z.string().min(1, 'Address is required'),
  estimatedBudget: z.number().positive().optional(),
  squareFootage: z.number().positive().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
});

const updateProjectSchema = createProjectSchema.partial();

const createEstimateSchema = z.object({
  projectId: z.number(),
  name: z.string().min(1, 'Estimate name is required'),
  description: z.string().optional(),
  categories: z.array(z.object({
    name: z.string(),
    items: z.array(z.object({
      trade: z.string(),
      description: z.string(),
      estimatedCost: z.number(),
      duration: z.number().optional(),
    }))
  }))
});

const submitBidSchema = z.object({
  bidProcessId: z.number(),
  contactId: z.number(),
  bidAmount: z.number().positive(),
  timeline: z.number().positive(),
  notes: z.string().optional(),
});

// Type-safe request interfaces
interface TypedRequest<T = Record<string, unknown>> extends Request {
  body: T;
  user?: {
    id: number;
    email: string;
    role: string;
    permissions: string[];
  };
}

interface PaginationQuery extends Record<string, unknown> {
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Type-safe response helpers
class TypeSafeResponse {
  static success<T>(res: Response, data: T, message?: string): void {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message
    };
    res.json(response);
  }

  static error(res: Response, error: string, statusCode: number = 500): void {
    const response: ApiResponse = {
      success: false,
      error
    };
    res.status(statusCode).json(response);
  }

  static paginated<T>(
    res: Response, 
    data: T[], 
    pagination: { page: number; limit: number; total: number }
  ): void {
    const response: PaginatedResponse<T> = {
      success: true,
      data,
      pagination: {
        ...pagination,
        totalPages: Math.ceil(pagination.total / pagination.limit)
      }
    };
    res.json(response);
  }
}

// Type-safe validation middleware
function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: TypedRequest<T>, res: Response, next: () => void) => {
    try {
      const validatedData = schema.parse(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        TypeSafeResponse.error(res, `Validation error: ${error.errors.map(e => e.message).join(', ')}`, 400);
      } else {
        TypeSafeResponse.error(res, 'Invalid request data', 400);
      }
    }
  };
}

// Type-safe query parser
function parseQuery<T extends Record<string, unknown>>(query: Record<string, unknown>): T {
  const parsed: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string') {
      // Try to parse numbers
      if (!isNaN(Number(value)) && value !== '') {
        parsed[key] = Number(value);
      } else if (value === 'true' || value === 'false') {
        parsed[key] = value === 'true';
      } else {
        parsed[key] = value;
      }
    } else {
      parsed[key] = value;
    }
  }
  
  return parsed as T;
}

// Example type-safe API handlers
export class ProjectAPIHandler {
  // GET /api/projects - Type-safe project listing with pagination
  static async getProjects(req: Request, res: Response): Promise<void> {
    try {
      const query = parseQuery<PaginationQuery>(req.query);
      const page = Math.max(1, query.page ? parseInt(query.page) : 1);
      const limit = Math.min(100, Math.max(1, query.limit ? parseInt(query.limit) : 10));
      
      // Mock data retrieval (in real app, would use storage service)
      const projects: DatabaseProject[] = []; // Would fetch from storage
      const total = projects.length;
      
      const startIndex = (page - 1) * limit;
      const paginatedProjects = projects.slice(startIndex, startIndex + limit);
      
      TypeSafeResponse.paginated(res, paginatedProjects, { page, limit, total });
    } catch (error) {
      console.error('Error fetching projects:', error);
      TypeSafeResponse.error(res, 'Failed to fetch projects');
    }
  }

  // POST /api/projects - Type-safe project creation
  static createProject = [
    validateRequest(createProjectSchema),
    async (req: TypedRequest<z.infer<typeof createProjectSchema>>, res: Response): Promise<void> => {
      try {
        const projectData = req.body;
        
        // Create project with proper typing
        const newProject: DatabaseProject = {
          id: Date.now().toString(), // Would use proper ID generation
          ...projectData,
          status: 'planning',
          actualCost: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        // Save to storage (properly typed)
        // await storage.createProject(newProject);
        
        TypeSafeResponse.success(res, newProject, 'Project created successfully');
      } catch (error) {
        console.error('Error creating project:', error);
        TypeSafeResponse.error(res, 'Failed to create project');
      }
    }
  ];

  // PUT /api/projects/:id - Type-safe project update
  static updateProject = [
    validateRequest(updateProjectSchema),
    async (req: TypedRequest<z.infer<typeof updateProjectSchema>>, res: Response): Promise<void> => {
      try {
        const projectId = req.params.id;
        const updateData = req.body;
        
        // Validate project exists and update with proper typing
        const updatedProject: DatabaseProject = {
          id: projectId,
          name: updateData.name || 'Default Name',
          clientName: updateData.clientName || 'Default Client',
          ...updateData,
          updatedAt: new Date().toISOString(),
        };
        
        TypeSafeResponse.success(res, updatedProject, 'Project updated successfully');
      } catch (error) {
        console.error('Error updating project:', error);
        TypeSafeResponse.error(res, 'Failed to update project');
      }
    }
  ];
}

export class EstimateAPIHandler {
  // POST /api/estimates - Type-safe estimate creation
  static createEstimate = [
    validateRequest(createEstimateSchema),
    async (req: TypedRequest<z.infer<typeof createEstimateSchema>>, res: Response): Promise<void> => {
      try {
        const estimateData = req.body;
        
        const newEstimate: Estimate = {
          id: Date.now(),
          ...estimateData,
          categories: estimateData.categories.map((category, index) => ({
            id: `cat_${Date.now()}_${index}`,
            name: category.name,
            orderIndex: index,
            items: category.items.map((item, itemIndex) => ({
              id: `item_${Date.now()}_${itemIndex}`,
              trade: item.trade,
              description: item.description,
              estimatedCost: item.estimatedCost,
              duration: item.duration,
              status: 'Estimating',
              orderIndex: itemIndex,
            }))
          })),
          totalCost: estimateData.categories.reduce((total, category) => 
            total + category.items.reduce((catTotal, item) => catTotal + item.estimatedCost, 0), 0
          ),
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        TypeSafeResponse.success(res, newEstimate, 'Estimate created successfully');
      } catch (error) {
        console.error('Error creating estimate:', error);
        TypeSafeResponse.error(res, 'Failed to create estimate');
      }
    }
  ];
}

export class BidAPIHandler {
  // POST /api/bids - Type-safe bid submission
  static submitBid = [
    validateRequest(submitBidSchema),
    async (req: TypedRequest<z.infer<typeof submitBidSchema>>, res: Response): Promise<void> => {
      try {
        const bidData = req.body;
        
        const newBid: BidResponse = {
          subId: bidData.contactId.toString(),
          subName: 'Contractor Name', // Would fetch from contacts
          trade: 'General', // Would fetch from bid process
          bidAmount: bidData.bidAmount,
          status: 'submitted',
          bidSentAt: new Date().toISOString(),
          timeline: bidData.timeline,
          notes: bidData.notes,
        };
        
        TypeSafeResponse.success(res, newBid, 'Bid submitted successfully');
      } catch (error) {
        console.error('Error submitting bid:', error);
        TypeSafeResponse.error(res, 'Failed to submit bid');
      }
    }
  ];
}

// Type-safe error handling middleware
export function handleAPIError(error: Error, req: Request, res: Response, next: () => void): void {
  console.error('API Error:', error);
  
  if (error instanceof z.ZodError) {
    TypeSafeResponse.error(res, `Validation error: ${error.errors.map(e => e.message).join(', ')}`, 400);
  } else if (error.message.includes('not found')) {
    TypeSafeResponse.error(res, 'Resource not found', 404);
  } else if (error.message.includes('unauthorized')) {
    TypeSafeResponse.error(res, 'Unauthorized access', 401);
  } else {
    TypeSafeResponse.error(res, 'Internal server error', 500);
  }
}