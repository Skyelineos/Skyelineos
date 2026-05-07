/**
 * Environment variable validation helper
 * Enforces that critical environment variables are set in production
 */

interface EnvConfig {
  name: string;
  required: boolean;
  defaultValue?: string;
}

/**
 * Requires an environment variable to be set
 * Throws an error in production if missing
 * Returns a default value in development if provided
 */
export function must(name: string, defaultValue?: string): string {
  const value = process.env[name];
  
  if (!value) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `Environment variable ${name} is required in production but not set. ` +
        `Please set ${name} in your environment variables.`
      );
    }
    
    if (defaultValue !== undefined) {
      console.warn(
        `⚠️  Environment variable ${name} not set, using default value for development. ` +
        `Set ${name} in production.`
      );
      return defaultValue;
    }
    
    throw new Error(
      `Environment variable ${name} is required but not set. ` +
      `Please set ${name} in your environment variables.`
    );
  }
  
  return value;
}

/**
 * Calculate entropy of a string based on character set diversity and length
 */
function calculateEntropy(secret: string): number {
  const charset = new Set(secret).size;
  return secret.length * Math.log2(charset);
}

/**
 * Validate JWT secret strength for production security
 */
function validateSecretStrength(secretName: string, secret: string, isProduction: boolean): string[] {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Minimum requirements for production
  const PRODUCTION_MIN_LENGTH = 32;
  const PRODUCTION_MIN_ENTROPY = 128; // bits
  const DEVELOPMENT_MIN_LENGTH = 16;
  
  // Check if secret contains obvious weak patterns
  const weakPatterns = [
    'secret', 'password', 'key', 'token', 'jwt',
    '123', 'abc', 'test', 'demo', 'dev', 'default'
  ];
  
  const lowerSecret = secret.toLowerCase();
  const hasWeakPattern = weakPatterns.some(pattern => lowerSecret.includes(pattern));
  
  // Length validation
  if (isProduction && secret.length < PRODUCTION_MIN_LENGTH) {
    errors.push(
      `${secretName} must be at least ${PRODUCTION_MIN_LENGTH} characters in production (current: ${secret.length})`
    );
  } else if (!isProduction && secret.length < DEVELOPMENT_MIN_LENGTH) {
    warnings.push(
      `${secretName} should be at least ${DEVELOPMENT_MIN_LENGTH} characters (current: ${secret.length})`
    );
  }
  
  // Entropy validation (production only)
  if (isProduction) {
    const entropy = calculateEntropy(secret);
    if (entropy < PRODUCTION_MIN_ENTROPY) {
      errors.push(
        `${secretName} entropy is too low for production (${entropy.toFixed(1)} bits, minimum: ${PRODUCTION_MIN_ENTROPY} bits). ` +
        `Use a cryptographically strong random secret.`
      );
    }
  }
  
  // Weak pattern detection
  if (isProduction && hasWeakPattern) {
    errors.push(
      `${secretName} contains weak patterns that could be guessed. Use a cryptographically random secret.`
    );
  } else if (!isProduction && hasWeakPattern) {
    warnings.push(
      `${secretName} contains weak patterns. Consider using a stronger secret for better security.`
    );
  }
  
  // Check for repeated characters (production only)
  if (isProduction) {
    const uniqueChars = new Set(secret).size;
    const repetitionRatio = uniqueChars / secret.length;
    if (repetitionRatio < 0.3) {
      errors.push(
        `${secretName} has too many repeated characters (${(repetitionRatio * 100).toFixed(1)}% unique). ` +
        `Use a more diverse character set.`
      );
    }
  }
  
  // Display warnings in development
  if (!isProduction && warnings.length > 0) {
    console.warn(`⚠️  Security warnings for ${secretName}:`);
    warnings.forEach(warning => console.warn(`   - ${warning}`));
  }
  
  return errors;
}

/**
 * Enhanced environment validation with JWT secret strength validation
 */
export function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const requiredVars = [
    'JWT_SECRET',
    'REFRESH_SECRET', 
    'DATABASE_URL',
  ];

  const errors: string[] = [];
  const secrets: { [key: string]: string } = {};
  
  // First, validate that all required variables exist
  for (const varName of requiredVars) {
    try {
      const value = must(varName);
      if (varName === 'JWT_SECRET' || varName === 'REFRESH_SECRET') {
        secrets[varName] = value;
      }
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  
  // Then validate JWT secret strength if secrets were loaded
  for (const [secretName, secretValue] of Object.entries(secrets)) {
    const secretErrors = validateSecretStrength(secretName, secretValue, isProduction);
    errors.push(...secretErrors);
  }
  
  // Additional production security checks
  if (isProduction) {
    // Ensure JWT and refresh secrets are different
    if (secrets.JWT_SECRET === secrets.REFRESH_SECRET) {
      errors.push('JWT_SECRET and REFRESH_SECRET must be different in production');
    }
    
    // Check for development default secrets in production
    const developmentDefaults = [
      'dev-jwt-secret-not-for-production',
      'dev-refresh-secret-not-for-production'
    ];
    
    for (const [secretName, secretValue] of Object.entries(secrets)) {
      if (developmentDefaults.some(defaultPattern => secretValue.includes(defaultPattern))) {
        errors.push(
          `${secretName} appears to be using development defaults in production. ` +
          `Generate a cryptographically strong random secret.`
        );
      }
    }
  }
  
  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    
    if (isProduction) {
      console.error('🚨 Server cannot start in production with insecure configuration');
      console.error('');
      console.error('PRODUCTION SECURITY REQUIREMENTS:');
      console.error('  • JWT_SECRET: minimum 32 characters, 128+ bits entropy');  
      console.error('  • REFRESH_SECRET: minimum 32 characters, 128+ bits entropy');
      console.error('  • Secrets must be cryptographically random');
      console.error('  • No weak patterns or repeated characters');
      console.error('  • JWT_SECRET ≠ REFRESH_SECRET');
      console.error('');
      console.error('Generate secure secrets: openssl rand -base64 32');
      console.error('');
      process.exit(1);
    } else {
      console.error('⚠️  Server starting in development mode with security issues');
      console.error('⚠️  These issues must be resolved before production deployment');
    }
  } else {
    // Success operation completed
  }
}

/**
 * Get CORS origin with intelligent defaults for different environments
 */
export function getCorsOrigin(): string | string[] {
  // Auto-detect deployment environment and provide appropriate defaults
  let defaultOrigin: string | undefined;
  
  if (process.env.NODE_ENV === 'production') {
    // In production, try to auto-detect from common deployment variables
    if (process.env.REPLIT_DEV_DOMAIN) {
      // Replit deployment detected
      defaultOrigin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    } else if (process.env.VERCEL_URL) {
      // Vercel deployment detected
      defaultOrigin = `https://${process.env.VERCEL_URL}`;
    } else if (process.env.RENDER_EXTERNAL_URL) {
      // Render deployment detected
      defaultOrigin = process.env.RENDER_EXTERNAL_URL;
    } else if (process.env.RAILWAY_STATIC_URL) {
      // Railway deployment detected
      defaultOrigin = process.env.RAILWAY_STATIC_URL;
    } else {
      // Production requires explicit CORS_ORIGIN setting
      console.warn('⚠️  Production deployment detected but CORS_ORIGIN not set. Please set CORS_ORIGIN environment variable.');
    }
  } else {
    // Development environment defaults
    if (process.env.REPLIT_DEV_DOMAIN) {
      defaultOrigin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    } else {
      defaultOrigin = 'http://localhost:5000';
    }
  }
      
  const origin = must('CORS_ORIGIN', defaultOrigin);
  
  // Support comma-separated origins for multiple domains
  if (origin.includes(',')) {
    return origin.split(',').map(o => o.trim());
  }
  
  return origin;
}