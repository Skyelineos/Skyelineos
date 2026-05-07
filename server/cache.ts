import Redis from 'ioredis';
import { logger } from './logger';

// Redis connection configuration
const REDIS_URL = process.env.REDIS_URL || process.env.REDISCLOUD_URL;
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';

// Cache configuration
const CACHE_CONFIG = {
  DEFAULT_TTL: 60,   // 1 minute default
  PROJECTS_TTL: 30,  // 30 seconds for projects
  SCHEDULE_TTL: 30,  // 30 seconds for schedule
  CONTACTS_TTL: 120, // 2 minutes for contacts
  STATS_TTL: 15,     // 15 seconds for stats
};

class CacheService {
  private redis: Redis | null = null;
  private isConnected = false;
  private memoryCache: Map<string, { data: any; expires: number }> = new Map();

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      if (REDIS_URL) {
        this.redis = new Redis(REDIS_URL, {
          connectTimeout: 10000,
          lazyConnect: true,
          maxRetriesPerRequest: 3,
        });

        this.redis.on('connect', () => {
          logger.info('Redis cache connected successfully');
          this.isConnected = true;
        });

        this.redis.on('error', (error) => {
          logger.error('Redis connection error', { error: error.message });
          this.isConnected = false;
        });

        this.redis.on('close', () => {
          logger.warn('Redis connection closed');
          this.isConnected = false;
        });

        // Test connection
        await this.redis.connect();
        await this.redis.ping();
        logger.info('Redis cache service initialized');
      } else {
        logger.warn('Redis URL not provided, using memory cache for development');
        this.startMemoryCacheCleanup();
      }
    } catch (error) {
      logger.error('Failed to initialize Redis cache', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      this.redis = null;
      this.startMemoryCacheCleanup();
    }
  }

  private startMemoryCacheCleanup(): void {
    // Clean up expired memory cache entries every minute
    setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];
      this.memoryCache.forEach((value, key) => {
        if (value.expires < now) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => this.memoryCache.delete(key));
    }, 60000);
  }

  private async useRedis(): Promise<boolean> {
    return this.redis !== null && this.isConnected;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (await this.useRedis()) {
        const value = await this.redis!.get(key);
        if (value) {
          const parsed = JSON.parse(value);
          logger.debug('Cache hit (Redis)', { key, hasData: !!parsed });
          return parsed;
        }
      } else {
        // Fallback to memory cache
        const cached = this.memoryCache.get(key);
        if (cached && cached.expires > Date.now()) {
          logger.debug('Cache hit (Memory)', { key, hasData: !!cached.data });
          return cached.data;
        }
        // Clean up expired entry
        if (cached) {
          this.memoryCache.delete(key);
        }
      }

      logger.debug('Cache miss', { key });
      return null;
    } catch (error) {
      logger.error('Cache get error', { 
        key, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: any, ttlSeconds: number = CACHE_CONFIG.DEFAULT_TTL): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      
      if (await this.useRedis()) {
        await this.redis!.setex(key, ttlSeconds, serialized);
        logger.debug('Cached value (Redis)', { key, ttl: ttlSeconds });
      } else {
        // Fallback to memory cache
        const expires = Date.now() + (ttlSeconds * 1000);
        this.memoryCache.set(key, { data: value, expires });
        logger.debug('Cached value (Memory)', { key, ttl: ttlSeconds });
      }
    } catch (error) {
      logger.error('Cache set error', { 
        key, 
        ttl: ttlSeconds,
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    try {
      if (await this.useRedis()) {
        await this.redis!.del(key);
      } else {
        this.memoryCache.delete(key);
      }
      logger.debug('Cache key deleted', { key });
    } catch (error) {
      logger.error('Cache delete error', { 
        key, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Delete all keys matching pattern
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      if (await this.useRedis()) {
        const keys = await this.redis!.keys(pattern);
        if (keys.length > 0) {
          await this.redis!.del(keys);
          logger.debug('Cache pattern deleted', { pattern, count: keys.length });
        }
      } else {
        // For memory cache, convert Redis pattern to regex
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        const keysToDelete: string[] = [];
        this.memoryCache.forEach((_, key) => {
          if (regex.test(key)) {
            keysToDelete.push(key);
          }
        });
        keysToDelete.forEach(key => this.memoryCache.delete(key));
        logger.debug('Cache pattern deleted (Memory)', { pattern, count: keysToDelete.length });
      }
    } catch (error) {
      logger.error('Cache pattern delete error', { 
        pattern, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Wrap a function with caching
   */
  cached<T>(
    key: string, 
    fn: () => Promise<T>, 
    ttlSeconds: number = CACHE_CONFIG.DEFAULT_TTL
  ): Promise<T> {
    return (async (): Promise<T> => {
      // Try to get from cache first
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      // Execute function and cache result
      const result = await fn();
      await this.set(key, result, ttlSeconds);
      return result;
    })();
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ connected: boolean; type: string; keyCount?: number }> {
    try {
      if (await this.useRedis()) {
        const keyCount = await this.redis!.dbsize();
        return { connected: true, type: 'Redis', keyCount };
      } else {
        return { connected: false, type: 'Memory', keyCount: this.memoryCache.size };
      }
    } catch (error) {
      logger.error('Failed to get cache stats', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return { connected: false, type: 'Error' };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    try {
      if (await this.useRedis()) {
        const start = Date.now();
        await this.redis!.ping();
        const latency = Date.now() - start;
        return { healthy: true, latency };
      } else {
        return { healthy: true }; // Memory cache is always "healthy"
      }
    } catch (error) {
      return { 
        healthy: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.quit();
        logger.info('Redis connection closed');
      }
    } catch (error) {
      logger.error('Error closing Redis connection', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
}

// Singleton instance
export const cacheService = new CacheService();

// Cache key generators
export const CacheKeys = {
  projects: () => 'projects:all',
  project: (id: string | number) => `project:${id}`,
  projectSchedule: (id: string | number) => `project:${id}:schedule`,
  globalSchedule: () => 'schedule:global',
  contacts: (page?: number, limit?: number) => 
    page && limit ? `contacts:page:${page}:limit:${limit}` : 'contacts:all',
  contactsCount: () => 'contacts:count',
  estimates: (projectId?: string | number) => 
    projectId ? `estimates:project:${projectId}` : 'estimates:all',
  bids: (estimateId: string | number) => `bids:estimate:${estimateId}`,
  userStats: (userId: string | number) => `stats:user:${userId}`,
  dashboardStats: () => 'stats:dashboard',
  urgentItems: () => 'urgent:items',
};

// Cache decorators for service methods
export function CacheResult(ttlSeconds: number = CACHE_CONFIG.DEFAULT_TTL) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${target.constructor.name}:${propertyName}:${JSON.stringify(args)}`;
      
      // Try cache first
      const cached = await cacheService.get(cacheKey);
      if (cached !== null) {
        return cached;
      }
      
      // Execute original method
      const result = await method.apply(this, args);
      
      // Cache the result
      await cacheService.set(cacheKey, result, ttlSeconds);
      
      return result;
    };
    
    return descriptor;
  };
}

// Invalidate cache decorator
export function InvalidateCache(patterns: string[]) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      // Execute original method first
      const result = await method.apply(this, args);
      
      // Invalidate cache patterns
      for (const pattern of patterns) {
        await cacheService.delPattern(pattern);
      }
      
      return result;
    };
    
    return descriptor;
  };
}

export { CACHE_CONFIG };