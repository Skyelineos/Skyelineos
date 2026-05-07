import { Router, Request, Response } from 'express';
import { db } from '../db';
import redisService from '../utils/redisClient';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    memory: MemoryStatus;
  };
}

interface ServiceStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime?: number;
  message?: string;
}

interface MemoryStatus extends ServiceStatus {
  usage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
}

// Overall health endpoint
router.get('/', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const [databaseStatus, redisStatus] = await Promise.all([
      checkDatabase(),
      checkRedis(),
    ]);

    const memoryStatus = checkMemory();
    const responseTime = Date.now() - startTime;

    const overallStatus: HealthStatus = {
      status: determineOverallStatus(databaseStatus, redisStatus, memoryStatus),
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: databaseStatus,
        redis: redisStatus,
        memory: memoryStatus,
      },
    };

    const statusCode = overallStatus.status === 'healthy' ? 200 : 
                      overallStatus.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(overallStatus);

  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Database-specific health check
router.get('/database', async (req: Request, res: Response) => {
  try {
    const status = await checkDatabase();
    const statusCode = status.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(status);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Database check failed',
    });
  }
});

// Redis-specific health check
router.get('/redis', async (req: Request, res: Response) => {
  try {
    const status = await checkRedis();
    const statusCode = status.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(status);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Redis check failed',
    });
  }
});

// Memory usage check
router.get('/memory', (req: Request, res: Response) => {
  try {
    const status = checkMemory();
    const statusCode = status.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(status);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Memory check failed',
    });
  }
});

// Helper functions
async function checkDatabase(): Promise<ServiceStatus> {
  const startTime = Date.now();
  
  try {
    // Simple database connectivity test
    await db.execute('SELECT 1');
    const responseTime = Date.now() - startTime;
    
    return {
      status: responseTime < 1000 ? 'healthy' : 'degraded',
      responseTime,
      message: responseTime < 1000 ? 'OK' : 'Slow response',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  const startTime = Date.now();
  
  try {
    if (!redisService.isAvailable()) {
      return {
        status: 'degraded',
        responseTime: Date.now() - startTime,
        message: 'Redis not configured, using memory cache',
      };
    }

    // Test Redis with a simple ping-like operation
    await redisService.set('health:check', 'ok', 30);
    const value = await redisService.get('health:check');
    
    const responseTime = Date.now() - startTime;
    
    if (value === 'ok') {
      return {
        status: responseTime < 500 ? 'healthy' : 'degraded',
        responseTime,
        message: responseTime < 500 ? 'OK' : 'Slow response',
      };
    } else {
      return {
        status: 'unhealthy',
        responseTime,
        message: 'Redis operation failed',
      };
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      message: error instanceof Error ? error.message : 'Redis check failed',
    };
  }
}

function checkMemory(): MemoryStatus {
  const memUsage = process.memoryUsage();
  const totalMemory = memUsage.rss + memUsage.heapTotal + memUsage.external;
  
  // Consider unhealthy if using more than 1GB
  const memoryLimitBytes = 1024 * 1024 * 1024; // 1GB
  const isHighMemory = totalMemory > memoryLimitBytes;
  
  return {
    status: isHighMemory ? 'degraded' : 'healthy',
    message: isHighMemory ? 'High memory usage' : 'OK',
    usage: {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
    },
  };
}

function determineOverallStatus(
  database: ServiceStatus,
  redis: ServiceStatus,
  memory: ServiceStatus
): 'healthy' | 'unhealthy' | 'degraded' {
  if (database.status === 'unhealthy') {
    return 'unhealthy';
  }
  
  if (database.status === 'degraded' || 
      memory.status === 'degraded' || 
      redis.status === 'degraded') {
    return 'degraded';
  }
  
  return 'healthy';
}

export default router;