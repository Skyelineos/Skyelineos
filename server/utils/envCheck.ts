import { logger } from '../logger';

/**
 * Required environment variables for BuildFlow application
 * These must be set in production for security and functionality
 */
export interface RequiredEnvVars {
  DATABASE_URL: string;
  JWT_SECRET: string;
  NODE_ENV: string;
}

/**
 * Optional but recommended environment variables
 * These will show warnings if missing but won't prevent startup
 */
export interface OptionalEnvVars {
  // Monitoring & Observability
  SENTRY_DSN?: string;
  PROMETHEUS_PORT?: string;
  REDIS_URL?: string;
  
  // AWS/Cloud Storage (if using object storage)
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_REGION?: string;
  AWS_S3_BUCKET?: string;
  
  // Email Service (if using notifications)
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  
  // Third-party Integrations
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  
  // Security
  CORS_ORIGIN?: string;
  SESSION_SECRET?: string;
  BCRYPT_ROUNDS?: string;
}

/**
 * Environment variable validation configuration
 */
interface EnvConfigItem {
  description: string;
  example: string;
  validate?: (value: string) => void;
}

const ENV_CONFIG = {
  required: {
    DATABASE_URL: {
      description: 'PostgreSQL database connection string',
      example: 'postgresql://user:password@localhost:5432/buildflow'
    } as EnvConfigItem,
    JWT_SECRET: {
      description: 'Secret key for JWT token signing (min 32 characters)',
      example: 'your-super-secret-jwt-key-here-min-32-chars',
      validate: (value: string) => {
        if (value.length < 32) {
          throw new Error('JWT_SECRET must be at least 32 characters long');
        }
        if (value === 'your-super-secret-jwt-key-here-min-32-chars') {
          throw new Error('JWT_SECRET must not use the example value');
        }
      }
    } as EnvConfigItem,
    NODE_ENV: {
      description: 'Application environment (development, production, test)',
      example: 'production',
      validate: (value: string) => {
        const validEnvs = ['development', 'production', 'test'];
        if (!validEnvs.includes(value)) {
          throw new Error(`NODE_ENV must be one of: ${validEnvs.join(', ')}`);
        }
      }
    } as EnvConfigItem
  },
  optional: {
    SENTRY_DSN: 'Sentry error tracking DSN',
    REDIS_URL: 'Redis connection string for caching',
    AWS_ACCESS_KEY_ID: 'AWS access key for S3 storage',
    AWS_SECRET_ACCESS_KEY: 'AWS secret key for S3 storage',
    AWS_REGION: 'AWS region (e.g., us-east-1)',
    STRIPE_SECRET_KEY: 'Stripe payment processing secret key',
    TWILIO_ACCOUNT_SID: 'Twilio SMS service account SID'
  }
} as const;

/**
 * Validates that all required environment variables are present and valid
 * @throws {Error} If any required environment variables are missing or invalid
 */
export function validateRequiredEnvVars(): void {
  const missingVars: string[] = [];
  const invalidVars: string[] = [];

  logger.info('🔍 Validating required environment variables...');

  // Check required environment variables
  for (const [key, config] of Object.entries(ENV_CONFIG.required)) {
    const value = process.env[key];
    
    if (!value) {
      missingVars.push(`${key} (${config.description})`);
      continue;
    }

    // Run custom validation if provided
    if (config.validate) {
      try {
        config.validate(value);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
        invalidVars.push(`${key}: ${errorMessage}`);
      }
    }
  }

  // Report missing variables
  if (missingVars.length > 0) {
    logger.error('❌ Missing required environment variables:', {
      missing: missingVars,
      help: 'Set these variables in your .env file or environment'
    });
    
    console.error('\n🔧 Required Environment Variables Setup:');
    console.error('=====================================');
    
    for (const [key, config] of Object.entries(ENV_CONFIG.required)) {
      if (!process.env[key]) {
        console.error(`\n${key}:`);
        console.error(`  Description: ${config.description}`);
        console.error(`  Example: ${key}=${config.example}`);
      }
    }
    
    console.error('\n📋 Create a .env file in your project root with these variables.');
    console.error('🔒 Never commit .env files to version control!');
    
    throw new Error(`Missing required environment variables: ${missingVars.map(v => v.split(' ')[0]).join(', ')}`);
  }

  // Report invalid variables
  if (invalidVars.length > 0) {
    logger.error('❌ Invalid environment variables:', invalidVars);
    throw new Error(`Invalid environment variables: ${invalidVars.join('; ')}`);
  }

  logger.info('✅ All required environment variables are valid');
}

/**
 * Validates optional environment variables and logs warnings for missing ones
 * in production environment
 */
export function validateOptionalEnvVars(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const missingOptional: string[] = [];

  // Check optional environment variables
  for (const [key, description] of Object.entries(ENV_CONFIG.optional)) {
    if (!process.env[key]) {
      missingOptional.push(`${key} (${description})`);
    }
  }

  if (missingOptional.length > 0) {
    if (isProduction) {
      logger.warn('⚠️ Missing optional environment variables (may impact functionality):', {
        missing: missingOptional,
        environment: 'production'
      });
    } else {
      logger.debug('ℹ️ Optional environment variables not set:', missingOptional);
    }
  }

  // Check for development-specific warnings
  if (isProduction) {
    const criticalOptional = ['SENTRY_DSN', 'REDIS_URL'];
    const missingCritical = criticalOptional.filter(key => !process.env[key]);
    
    if (missingCritical.length > 0) {
      logger.warn('🚨 Critical optional variables missing in production:', {
        missing: missingCritical,
        impact: 'Monitoring and performance may be affected'
      });
    }
  }
}

/**
 * Comprehensive environment validation
 * Validates both required and optional environment variables
 */
export function validateEnvironment(): void {
  try {
    validateRequiredEnvVars();
    validateOptionalEnvVars();
    
    logger.info('🛡️ Environment validation completed successfully', {
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('💥 Environment validation failed:', error);
    
    // In production, exit immediately
    if (process.env.NODE_ENV === 'production') {
      console.error('\n🚨 Application cannot start in production without required environment variables.');
      console.error('Please set the missing variables and restart the application.');
      process.exit(1);
    }
    
    // In development, allow startup but show warnings
    console.warn('\n⚠️ Development mode: Starting with missing environment variables.');
    console.warn('Some features may not work correctly.');
  }
}

/**
 * Environment variable utility functions
 */
export const envUtils = {
  /**
   * Get environment variable with default value
   */
  get(key: string, defaultValue?: string): string | undefined {
    return process.env[key] || defaultValue;
  },

  /**
   * Get required environment variable (throws if missing)
   */
  getRequired(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  },

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
  },

  /**
   * Check if running in test environment
   */
  isTest(): boolean {
    return process.env.NODE_ENV === 'test';
  }
};