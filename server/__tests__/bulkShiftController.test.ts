import request from 'supertest';
import { Express } from 'express';
import { db } from '../db';
import { projectTasks, taskDependencies, projects } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { parseISO, formatISO, addDays } from 'date-fns';
import { bulkShiftTasks } from '../controllers/bulkShiftController';
import express from 'express';

// Mock the database for testing
jest.mock('../db', () => ({
  db: {
    transaction: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
  }
}));

const mockDb = db as jest.Mocked<NonNullable<typeof db>>;

describe('Bulk Shift Controller', () => {
  let app: Express;
  
  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.post('/api/projects/:projectId/tasks/bulkShift', bulkShiftTasks);
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  const mockProject = {
    id: 1,
    name: 'Test Project',
    description: 'Test project for bulk shift testing',
    clientName: 'Test Client',
    status: 'active'
  };

  const mockTasks = [
    {
      id: 1,
      projectId: 1,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-05'),
      duration: 5
    },
    {
      id: 2,
      projectId: 1,
      startDate: new Date('2024-01-06'),
      endDate: new Date('2024-01-10'),
      duration: 5
    },
    {
      id: 3,
      projectId: 1,
      startDate: new Date('2024-01-11'),
      endDate: new Date('2024-01-15'),
      duration: 5
    }
  ];

  const mockDependencies = [
    {
      id: 1,
      fromTaskId: 1,
      toTaskId: 2,
      dependencyType: 'FS' as const,
      lagDays: 0
    },
    {
      id: 2,
      fromTaskId: 2,
      toTaskId: 3,
      dependencyType: 'FS' as const,
      lagDays: 1
    }
  ];

  describe('POST /api/projects/:projectId/tasks/bulkShift', () => {
    it('should successfully update all provided tasks', async () => {
      const shifts = [
        { id: 1, start: '2024-01-02', end: '2024-01-06' },
        { id: 2, start: '2024-01-07', end: '2024-01-11' }
      ];

      // Mock the transaction to return success
      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockTasks)
            })
          }),
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue({ rowCount: 1 })
            })
          })
        };

        // Mock the Promise.all for fetching tasks and dependencies
        const selectMock = mockTx.select as jest.Mock;
        selectMock
          .mockReturnValueOnce({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockTasks)
            })
          })
          .mockReturnValueOnce({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockDependencies)
            })
          });

        return await callback(mockTx as any);
      });

      const response = await request(app)
        .post('/api/projects/1/tasks/bulkShift')
        .send({ shifts })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Successfully updated');
      expect(response.body.data).toHaveProperty('updatedTasks');
      expect(response.body.data).toHaveProperty('totalUpdated');
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    });

    it('should handle cascade effects correctly', async () => {
      const shifts = [
        { id: 1, start: '2024-01-03', end: '2024-01-07' } // Move first task by 2 days
      ];

      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([])
            })
          }),
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue({ rowCount: 1 })
            })
          })
        };

        // Mock tasks and dependencies fetch
        const selectMock = mockTx.select as jest.Mock;
        selectMock
          .mockReturnValueOnce({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockTasks)
            })
          })
          .mockReturnValueOnce({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockDependencies)
            })
          });

        return await callback(mockTx as any);
      });

      const response = await request(app)
        .post('/api/projects/1/tasks/bulkShift')
        .send({ shifts })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cascadeEffects).toBeGreaterThan(0);
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    });

    it('should validate request body correctly', async () => {
      const invalidShifts = [
        { id: 1, start: 'invalid-date', end: '2024-01-06' }
      ];

      const response = await request(app)
        .post('/api/projects/1/tasks/bulkShift')
        .send({ shifts: invalidShifts })
        .expect(400);

      expect(response.body.error).toBe('Invalid request data');
      expect(response.body.details).toBeDefined();
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should reject when end date is before start date', async () => {
      const invalidShifts = [
        { id: 1, start: '2024-01-06', end: '2024-01-02' } // End before start
      ];

      const response = await request(app)
        .post('/api/projects/1/tasks/bulkShift')
        .send({ shifts: invalidShifts })
        .expect(400);

      expect(response.body.error).toBe('Invalid date range');
      expect(response.body.details).toContain('end date cannot be before start date');
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should require at least one task shift', async () => {
      const response = await request(app)
        .post('/api/projects/1/tasks/bulkShift')
        .send({ shifts: [] })
        .expect(400);

      expect(response.body.error).toBe('Invalid request data');
      expect(response.body.details).toBeDefined();
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should handle invalid project ID', async () => {
      const shifts = [
        { id: 1, start: '2024-01-02', end: '2024-01-06' }
      ];

      const response = await request(app)
        .post('/api/projects/invalid/tasks/bulkShift')
        .send({ shifts })
        .expect(400);

      expect(response.body.error).toBe('Invalid project ID');
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should rollback transaction if one update fails', async () => {
      const shifts = [
        { id: 1, start: '2024-01-02', end: '2024-01-06' },
        { id: 2, start: '2024-01-07', end: '2024-01-11' }
      ];

      // Mock transaction to throw an error during update
      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([])
            })
          }),
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockRejectedValue(new Error('Database update failed'))
            })
          })
        };

        // Mock tasks and dependencies fetch
        const selectMock = mockTx.select as jest.Mock;
        selectMock
          .mockReturnValueOnce({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockTasks)
            })
          })
          .mockReturnValueOnce({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockDependencies)
            })
          });

        // This should throw and cause rollback
        throw new Error('Database update failed');
      });

      const response = await request(app)
        .post('/api/projects/1/tasks/bulkShift')
        .send({ shifts })
        .expect(500);

      expect(response.body.error).toBe('Failed to update tasks');
      expect(response.body.details).toBe('Database update failed');
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    });

    it('should handle missing tasks in project', async () => {
      const shifts = [
        { id: 999, start: '2024-01-02', end: '2024-01-06' } // Non-existent task
      ];

      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([])
            })
          })
        };

        // Mock tasks and dependencies fetch - return empty arrays
        const selectMock = mockTx.select as jest.Mock;
        selectMock
          .mockReturnValueOnce({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([]) // No tasks found
            })
          })
          .mockReturnValueOnce({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([])
            })
          });

        throw new Error('Tasks not found in project 1: 999');
      });

      const response = await request(app)
        .post('/api/projects/1/tasks/bulkShift')
        .send({ shifts })
        .expect(500);

      expect(response.body.error).toBe('Failed to update tasks');
      expect(response.body.details).toContain('Tasks not found in project');
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    });

    it('should handle different dependency types correctly', async () => {
      const dependenciesWithTypes = [
        { id: 1, fromTaskId: 1, toTaskId: 2, dependencyType: 'SS' as const, lagDays: 2 },
        { id: 2, fromTaskId: 2, toTaskId: 3, dependencyType: 'FF' as const, lagDays: -1 }
      ];

      const shifts = [
        { id: 1, start: '2024-01-03', end: '2024-01-07' }
      ];

      mockDb.transaction.mockImplementation(async (callback) => {
        const mockTx = {
          select: jest.fn().mockReturnValue({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue([])
            })
          }),
          update: jest.fn().mockReturnValue({
            set: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue({ rowCount: 1 })
            })
          })
        };

        const selectMock = mockTx.select as jest.Mock;
        selectMock
          .mockReturnValueOnce({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(mockTasks)
            })
          })
          .mockReturnValueOnce({
            from: jest.fn().mockReturnValue({
              where: jest.fn().mockResolvedValue(dependenciesWithTypes)
            })
          });

        return await callback(mockTx as any);
      });

      const response = await request(app)
        .post('/api/projects/1/tasks/bulkShift')
        .send({ shifts })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.cascadeEffects).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Input validation', () => {
    it('should validate task ID is positive integer', async () => {
      const shifts = [
        { id: -1, start: '2024-01-02', end: '2024-01-06' }
      ];

      const response = await request(app)
        .post('/api/projects/1/tasks/bulkShift')
        .send({ shifts })
        .expect(400);

      expect(response.body.error).toBe('Invalid request data');
    });

    it('should validate date format is YYYY-MM-DD', async () => {
      const shifts = [
        { id: 1, start: '01/02/2024', end: '2024-01-06' }
      ];

      const response = await request(app)
        .post('/api/projects/1/tasks/bulkShift')
        .send({ shifts })
        .expect(400);

      expect(response.body.error).toBe('Invalid request data');
    });

    it('should handle missing required fields', async () => {
      const shifts = [
        { id: 1, start: '2024-01-02' } // Missing end date
      ];

      const response = await request(app)
        .post('/api/projects/1/tasks/bulkShift')
        .send({ shifts })
        .expect(400);

      expect(response.body.error).toBe('Invalid request data');
    });
  });
});