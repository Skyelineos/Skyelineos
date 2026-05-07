import { trace, metrics, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

// Create a simple tracer and meter (without full SDK for now)
let isTracingInitialized = false;

// Initialize basic tracing
export function initializeTracing() {
  try {
    // For now, just mark as initialized - we'll use the basic API
    isTracingInitialized = true;
    logger.info('Basic OpenTelemetry tracing initialized', {
      service: 'buildflow-api',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    logger.error('Failed to initialize tracing', { error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// Get tracer and meter instances
export const tracer = trace.getTracer('buildflow-api', '1.0.0');

// Simple metrics store (we'll use this instead of OpenTelemetry meters for now)
const metricsStore = {
  httpRequests: new Map<string, number>(),
  httpErrors: new Map<string, number>(),
  httpDurations: new Map<string, number[]>(),
};

// Middleware to instrument HTTP requests
export function tracingMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Create a span for this request
    const span = tracer.startSpan(`${req.method} ${req.route?.path || req.path}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': req.method,
        'http.url': req.url,
        'http.route': req.route?.path || req.path,
        'http.user_agent': req.get('User-Agent') || '',
        'http.remote_addr': req.ip,
      },
    });

    // Note: Full context API requires SDK setup, using simplified approach

    // Track request count
    const routeKey = `${req.method}:${req.route?.path || req.path}`;
    const currentCount = metricsStore.httpRequests.get(routeKey) || 0;
    metricsStore.httpRequests.set(routeKey, currentCount + 1);

    // Override res.end to capture response details
    const originalEnd = res.end;
    res.end = function(this: Response, ...args: any[]) {
      const duration = Date.now() - startTime;
      
      // Record metrics
      const routeKey = `${req.method}:${req.route?.path || req.path}`;
      const durations = metricsStore.httpDurations.get(routeKey) || [];
      durations.push(duration);
      metricsStore.httpDurations.set(routeKey, durations);

      // Record errors
      if (res.statusCode >= 400) {
        const errorKey = `${routeKey}:${res.statusCode}`;
        const currentErrors = metricsStore.httpErrors.get(errorKey) || 0;
        metricsStore.httpErrors.set(errorKey, currentErrors + 1);
        
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${res.statusCode}`,
        });
      }

      // Update span with response details
      span.setAttributes({
        'http.status_code': res.statusCode,
        'http.response_size': parseInt(res.get('content-length') || '0'),
      });

      span.end();
      
      // Log request completion
      logger.info('HTTP request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
      });

      return originalEnd.apply(this, args as any);
    };

    next();
  };
}

// Middleware to track circuit breaker states
export function updateCircuitBreakerMetrics(serviceName: string, state: 'closed' | 'open' | 'half-open') {
  // Store circuit breaker state in metrics
  metricsStore.httpRequests.set(`circuit_breaker:${serviceName}`, state === 'closed' ? 0 : state === 'open' ? 1 : 2);
}

// Helper function to create custom spans
export function createSpan(name: string, attributes?: Record<string, any>) {
  return tracer.startSpan(name, {
    attributes,
  });
}

// Helper function to trace async operations
export async function traceAsyncOperation<T>(
  operationName: string,
  operation: () => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const span = tracer.startSpan(operationName, {
    attributes,
  });

  try {
    const result = await operation();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

// Export metrics for external monitoring
export function getMetrics() {
  const metrics = {
    requests: Object.fromEntries(metricsStore.httpRequests),
    errors: Object.fromEntries(metricsStore.httpErrors),
    durations: Object.fromEntries(
      Array.from(metricsStore.httpDurations.entries()).map(([route, durations]) => [
        route,
        {
          count: durations.length,
          avg: durations.reduce((a, b) => a + b, 0) / durations.length || 0,
          min: Math.min(...durations) || 0,
          max: Math.max(...durations) || 0,
        }
      ])
    ),
  };
  return metrics;
}

// Graceful shutdown
export function shutdownTracing() {
  // Simple cleanup
  isTracingInitialized = false;
}

// Health check for tracing
export function getTracingHealth() {
  return {
    status: isTracingInitialized ? 'healthy' : 'not_initialized',
    tracer: isTracingInitialized ? 'initialized' : 'not_initialized',
    metricsEndpoint: '/api/metrics',
    metrics: getMetrics(),
    instrumentations: [
      'basic_tracing',
      'custom_metrics'
    ]
  };
}