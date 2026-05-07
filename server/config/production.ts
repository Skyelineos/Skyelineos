import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const productionConfig = {
  // Database Configuration
  database: {
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'),
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    lazyConnect: true,
    keepAlive: 30000,
    family: 4, // Use IPv4
  },

  // Rate Limiting
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    standardHeaders: true,
    legacyHeaders: false,
  },

  // File Upload Security
  fileUpload: {
    maxSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    allowedTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ],
    uploadPath: process.env.UPLOAD_PATH || './uploads',
  },

  // Security Headers
  security: {
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    csrfSecret: process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
    jwtSecret: process.env.JWT_SECRET,
    refreshSecret: process.env.REFRESH_SECRET,
  },

  // Monitoring
  monitoring: {
    sentryDsn: process.env.SENTRY_DSN,
    logLevel: process.env.LOG_LEVEL || 'info',
    enableMetrics: process.env.ENABLE_METRICS === 'true',
  },

  // Backup Configuration
  backup: {
    enabled: process.env.BACKUP_ENABLED === 'true',
    schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *', // Daily at 2 AM
    retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30'),
    s3Bucket: process.env.BACKUP_S3_BUCKET,
    s3Region: process.env.BACKUP_S3_REGION || 'us-east-1',
  }
};

export const isProduction = process.env.NODE_ENV === 'production';
export const isDevelopment = process.env.NODE_ENV === 'development';