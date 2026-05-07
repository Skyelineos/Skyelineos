import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';
import { Request, Response } from 'express';

// Collect default metrics (CPU, memory, etc.) every 10 seconds
collectDefaultMetrics({
  register,
  prefix: 'buildflow_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // Custom GC buckets
});

// Custom application metrics
export const httpRequestsTotal = new Counter({
  name: 'buildflow_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'buildflow_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const activeConnections = new Gauge({
  name: 'buildflow_active_connections',
  help: 'Number of active Socket.IO connections',
  registers: [register],
});

export const databaseConnections = new Gauge({
  name: 'buildflow_database_connections',
  help: 'Number of active database connections',
  registers: [register],
});

export const cacheHitRate = new Counter({
  name: 'buildflow_cache_operations_total',
  help: 'Total cache operations',
  labelNames: ['operation', 'result'],
  registers: [register],
});

export const projectsTotal = new Gauge({
  name: 'buildflow_projects_total',
  help: 'Total number of projects in the system',
  registers: [register],
});

export const contactsTotal = new Gauge({
  name: 'buildflow_contacts_total',
  help: 'Total number of contacts in the system',
  registers: [register],
});

export const estimatesTotal = new Gauge({
  name: 'buildflow_estimates_total',
  help: 'Total number of estimates in the system',
  registers: [register],
});

// Metrics endpoint handler
export const metricsHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const metrics = await register.metrics();
    res.set('Content-Type', register.contentType);
    res.status(200).send(metrics);
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).send('Error generating metrics');
  }
};

// Middleware to track HTTP metrics
export const metricsMiddleware = () => {
  return (req: Request, res: Response, next: Function) => {
    const start = Date.now();
    
    // Track request count
    const route = req.route?.path || req.path || 'unknown';
    
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      
      // Record metrics
      httpRequestsTotal
        .labels(req.method, route, res.statusCode.toString())
        .inc();
      
      httpRequestDuration
        .labels(req.method, route, res.statusCode.toString())
        .observe(duration);
    });
    
    next();
  };
};

// Update business metrics periodically
export const updateBusinessMetrics = (
  projectCount: number,
  contactCount: number,
  estimateCount: number
) => {
  projectsTotal.set(projectCount);
  contactsTotal.set(contactCount);
  estimatesTotal.set(estimateCount);
};

// Track cache operations
export const trackCacheOperation = (operation: 'hit' | 'miss' | 'set' | 'delete', result: 'success' | 'error' = 'success') => {
  cacheHitRate.labels(operation, result).inc();
};

// Track Socket.IO connections
export const updateActiveConnections = (count: number) => {
  activeConnections.set(count);
};

// Track database connections
export const updateDatabaseConnections = (count: number) => {
  databaseConnections.set(count);
};

export { register };