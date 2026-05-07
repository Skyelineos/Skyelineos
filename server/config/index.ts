import { productionConfig } from './production';
import redisService from '../utils/redisClient';
import { initializeSentry } from '../monitoring/sentry';

export async function initializeProductionServices(): Promise<void> {
  console.log('🚀 Initializing production services...');

  // Initialize error monitoring
  initializeSentry();

  // Test Redis connection if configured
  if (productionConfig.redis.url) {
    try {
      const isAvailable = redisService.isAvailable();
      if (isAvailable) {
        console.log('✅ Redis cache connected successfully');
      } else {
        console.warn('⚠️ Redis cache not available, using memory fallback');
      }
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
    }
  }

  console.log('✅ Production services initialized');
}

export { productionConfig };