import CircuitBreaker from 'opossum';
import { logger } from '../logger';
import { AppError } from '../middleware/errorHandler';

// Circuit breaker options
const circuitBreakerOptions = {
  timeout: 3000, // 3 seconds
  errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
  resetTimeout: 30000, // Try again after 30 seconds
  rollingCountTimeout: 60000, // Track failures over 60 second window
  rollingCountBuckets: 10, // Split the window into 10 buckets
  name: 'EmailService',
  fallback: () => Promise.reject(new AppError('Email service temporarily unavailable', 503, 'SERVICE_UNAVAILABLE'))
};

// Retry configuration
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffFactor: 2
};

// Exponential backoff retry wrapper
async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = defaultRetryConfig
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === config.maxRetries) {
        throw lastError;
      }
      
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffFactor, attempt),
        config.maxDelay
      );
      
      logger.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
        error: lastError.message,
        attempt: attempt + 1,
        maxRetries: config.maxRetries
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Core email sending function (this would integrate with your actual email service)
async function sendEmailCore(emailData: EmailData): Promise<EmailResult> {
  // Simulate email service call
  // In reality, this would call SendGrid, Mailgun, AWS SES, etc.
  
  const { to, subject, body, from } = emailData;
  
  logger.info('Sending email', {
    to: Array.isArray(to) ? to.join(', ') : to,
    subject,
    from
  });
  
  // Simulate potential failures for testing
  if (Math.random() < 0.1) { // 10% failure rate for testing
    throw new Error('Email service connection timeout');
  }
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
  
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    messageId,
    status: 'sent',
    timestamp: new Date().toISOString()
  };
}

// Email data interface
interface EmailData {
  to: string | string[];
  from: string;
  subject: string;
  body: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

// Email result interface
interface EmailResult {
  messageId: string;
  status: 'sent' | 'failed' | 'queued';
  timestamp: string;
}

// Create circuit breaker for email service
const emailCircuitBreaker = new CircuitBreaker(
  async (emailData: EmailData) => {
    return await withRetry(() => sendEmailCore(emailData));
  },
  circuitBreakerOptions
);

// Circuit breaker event handlers
emailCircuitBreaker.on('open', () => {
  logger.error('Email service circuit breaker opened - service is failing');
});

emailCircuitBreaker.on('halfOpen', () => {
  logger.info('Email service circuit breaker half-open - testing service');
});

emailCircuitBreaker.on('close', () => {
  logger.info('Email service circuit breaker closed - service is healthy');
});

emailCircuitBreaker.on('failure', (error: any) => {
  logger.error('Email service call failed', { error: error.message });
});

emailCircuitBreaker.on('success', (result: any) => {
  logger.debug('Email service call succeeded', { messageId: result.messageId });
});

// Main notification service class
export class NotificationService {
  
  /**
   * Send email with circuit breaker protection and retry logic
   */
  async sendEmail(emailData: EmailData): Promise<EmailResult> {
    try {
      logger.info('Attempting to send email', {
        to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
        subject: emailData.subject
      });

      const result = await emailCircuitBreaker.fire(emailData);
      
      logger.info('Email sent successfully', {
        messageId: result.messageId,
        to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to
      });

      return result;
    } catch (error) {
      logger.error('Failed to send email after all retries', {
        error: error instanceof Error ? error.message : 'Unknown error',
        to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
        subject: emailData.subject
      });

      throw new AppError(
        'Failed to send email notification',
        503,
        'EMAIL_SERVICE_UNAVAILABLE'
      );
    }
  }

  /**
   * Send SMS notification (placeholder for SMS circuit breaker)
   */
  async sendSMS(phoneNumber: string, message: string): Promise<{ messageId: string }> {
    // This would have its own circuit breaker similar to email
    logger.info('SMS sending not implemented yet', { phoneNumber, message });
    throw new AppError('SMS service not implemented', 501, 'SMS_NOT_IMPLEMENTED');
  }

  /**
   * Send push notification (placeholder)
   */
  async sendPushNotification(userId: string, notification: any): Promise<void> {
    // This would have its own circuit breaker
    logger.info('Push notification sending not implemented yet', { userId, notification });
    throw new AppError('Push notification service not implemented', 501, 'PUSH_NOT_IMPLEMENTED');
  }

  /**
   * Get circuit breaker stats for monitoring
   */
  getEmailServiceStats() {
    return {
      name: emailCircuitBreaker.name,
      state: emailCircuitBreaker.opened ? 'open' : emailCircuitBreaker.halfOpen ? 'half-open' : 'closed',
      stats: emailCircuitBreaker.stats
    };
  }

  /**
   * Health check for notification services
   */
  async healthCheck(): Promise<{ email: string; overall: string }> {
    const emailStatus = emailCircuitBreaker.opened ? 'unhealthy' : 'healthy';
    const overall = emailStatus === 'healthy' ? 'healthy' : 'degraded';
    
    return {
      email: emailStatus,
      overall
    };
  }
}

// Export singleton instance
export const notificationService = new NotificationService();

// Export types for use in other modules
export type { EmailData, EmailResult };