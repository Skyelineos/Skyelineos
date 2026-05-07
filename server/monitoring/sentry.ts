import * as Sentry from '@sentry/node';
import type { Express } from 'express';
import { productionConfig, isProduction } from '../config/production';

export function initializeSentry(): void {
  if (!productionConfig.monitoring.sentryDsn) {
    console.warn('SENTRY_DSN not configured, skipping Sentry initialization');
    return;
  }

  Sentry.init({
    dsn: productionConfig.monitoring.sentryDsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: isProduction ? 0.1 : 1.0,
    profilesSampleRate: isProduction ? 0.1 : 1.0,
    
    beforeSend(event) {
      // Filter out sensitive data
      if (event.request) {
        // Remove authorization headers
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }
        
        // Remove sensitive query parameters
        if (event.request.query_string) {
          event.request.query_string = event.request.query_string
            .replace(/token=[^&]*/g, 'token=[REDACTED]')
            .replace(/key=[^&]*/g, 'key=[REDACTED]')
            .replace(/secret=[^&]*/g, 'secret=[REDACTED]');
        }
      }

      // Filter out PII from user data
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }

      return event;
    },

    integrations: [
      // Performance monitoring
      new Sentry.Integrations.Http({ tracing: true }),
    ],
  });

  console.info('Sentry monitoring initialized');
}

export function captureException(error: Error, context?: Record<string, any>): void {
  if (productionConfig.monitoring.sentryDsn) {
    Sentry.withScope((scope) => {
      if (context) {
        Object.keys(context).forEach(key => {
          scope.setTag(key, context[key]);
        });
      }
      Sentry.captureException(error);
    });
  } else {
    console.error('Error captured (Sentry not configured):', error);
  }
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  if (productionConfig.monitoring.sentryDsn) {
    Sentry.captureMessage(message, level);
  } else {
    console.log(`Message captured (Sentry not configured): ${message}`);
  }
}

// Express middleware exports
export const sentryRequestHandler = () => {
  if (productionConfig.monitoring.sentryDsn) {
    return Sentry.Handlers.requestHandler();
  }
  return (req: any, res: any, next: any) => next();
};

export const sentryErrorHandler = () => {
  if (productionConfig.monitoring.sentryDsn) {
    return Sentry.Handlers.errorHandler();
  }
  return (err: any, req: any, res: any, next: any) => next(err);
};

export { Sentry };