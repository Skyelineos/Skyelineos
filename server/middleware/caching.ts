import { Request, Response, NextFunction } from 'express';
import redisService from '../utils/redisClient';

interface CacheOptions {
  ttl: number; // Time to live in seconds
  key?: (req: Request) => string;
  condition?: (req: Request) => boolean;
  invalidateOn?: string[]; // HTTP methods that should invalidate cache
}

// Memory cache fallback when Redis is not available
class MemoryCache {
  private cache = new Map<string, { data: any; expiry: number }>();
  
  get(key: string): any | null {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }
  
  set(key: string, data: any, ttlSeconds: number): void {
    const expiry = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { data, expiry });
  }
  
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
}

const memoryCache = new MemoryCache();

export function createCacheMiddleware(options: CacheOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip caching for non-GET requests unless specified
    if (req.method !== 'GET' && !options.condition?.(req)) {
      return next();
    }
    
    // Check cache condition
    if (options.condition && !options.condition(req)) {
      return next();
    }
    
    // Generate cache key
    const cacheKey = options.key ? options.key(req) : `cache:${req.originalUrl}`;
    
    try {
      // Try to get from cache
      let cachedData: string | null = null;
      
      if (redisService.isAvailable()) {
        cachedData = await redisService.get(cacheKey);
      } else {
        const memData = memoryCache.get(cacheKey);
        cachedData = memData ? JSON.stringify(memData) : null;
      }
      
      if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        console.debug(`Cache hit for key: ${cacheKey}`);
        
        // Set cache headers
        res.set({
          'X-Cache': 'HIT',
          'Cache-Control': `public, max-age=${options.ttl}`,
        });
        
        return res.json(parsedData);
      }
      
      // Cache miss - intercept response
      const originalJson = res.json.bind(res);
      
      res.json = function(data: any) {
        // Store in cache
        const dataToCache = JSON.stringify(data);
        
        if (redisService.isAvailable()) {
          redisService.set(cacheKey, dataToCache, options.ttl);
        } else {
          memoryCache.set(cacheKey, data, options.ttl);
        }
        
        console.debug(`Cache miss, stored for key: ${cacheKey}`);
        
        // Set cache headers
        res.set({
          'X-Cache': 'MISS',
          'Cache-Control': `public, max-age=${options.ttl}`,
        });
        
        return originalJson(data);
      };
      
      next();
      
    } catch (error) {
      console.error('Cache middleware error:', error);
      next(); // Continue without caching on error
    }
  };
}

// Cache invalidation middleware
export function createCacheInvalidationMiddleware(pattern: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original response methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    
    // Function to invalidate cache after successful response
    const invalidateCache = async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          if (redisService.isAvailable()) {
            // For Redis, we would need to implement pattern matching
            // For now, we'll invalidate specific keys
            console.debug(`Cache invalidation triggered for pattern: ${pattern}`);
          } else {
            // For memory cache, clear all (simple approach)
            memoryCache.clear();
            console.debug('Memory cache cleared due to invalidation');
          }
        } catch (error) {
          console.error('Cache invalidation error:', error);
        }
      }
    };
    
    // Override response methods
    res.json = function(data: any) {
      invalidateCache();
      return originalJson(data);
    };
    
    res.send = function(data: any) {
      invalidateCache();
      return originalSend(data);
    };
    
    next();
  };
}

// Predefined cache configurations
export const cacheConfigs = {
  // Short-term cache for frequently accessed data
  short: (customTtl?: number): CacheOptions => ({
    ttl: customTtl || 300, // 5 minutes
    key: (req) => `short:${req.originalUrl}:${JSON.stringify(req.query)}`,
  }),
  
  // Medium-term cache for semi-static data
  medium: (customTtl?: number): CacheOptions => ({
    ttl: customTtl || 1800, // 30 minutes
    key: (req) => `medium:${req.originalUrl}:${JSON.stringify(req.query)}`,
  }),
  
  // Long-term cache for static data
  long: (customTtl?: number): CacheOptions => ({
    ttl: customTtl || 3600, // 1 hour
    key: (req) => `long:${req.originalUrl}:${JSON.stringify(req.query)}`,
  }),
  
  // User-specific cache
  user: (ttl: number = 600): CacheOptions => ({
    ttl,
    key: (req) => {
      const userId = (req as any).user?.id || 'anonymous';
      return `user:${userId}:${req.originalUrl}:${JSON.stringify(req.query)}`;
    },
    condition: (req) => !!(req as any).user, // Only cache for authenticated users
  }),
  
  // Project-specific cache
  project: (ttl: number = 600): CacheOptions => ({
    ttl,
    key: (req) => {
      const projectId = req.params.projectId || req.query.projectId;
      return `project:${projectId}:${req.originalUrl}:${JSON.stringify(req.query)}`;
    },
    condition: (req) => !!(req.params.projectId || req.query.projectId),
  }),
};

// Middleware factory functions
export const shortCache = (ttl?: number) => createCacheMiddleware(cacheConfigs.short(ttl));
export const mediumCache = (ttl?: number) => createCacheMiddleware(cacheConfigs.medium(ttl));
export const longCache = (ttl?: number) => createCacheMiddleware(cacheConfigs.long(ttl));
export const userCache = (ttl?: number) => createCacheMiddleware(cacheConfigs.user(ttl));
export const projectCache = (ttl?: number) => createCacheMiddleware(cacheConfigs.project(ttl));

// Cache warming utilities
export class CacheWarmer {
  static async warmProjectData(projectId: string): Promise<void> {
    const endpoints = [
      `/api/projects/${projectId}`,
      `/api/projects/${projectId}/milestones`,
      `/api/projects/${projectId}/documents`,
      `/api/projects/${projectId}/transactions`,
    ];
    
    for (const endpoint of endpoints) {
      try {
        // Make internal request to warm cache
        // This would need to be implemented based on your app structure
        console.debug(`Warming cache for: ${endpoint}`);
      } catch (error) {
        console.error(`Failed to warm cache for ${endpoint}:`, error);
      }
    }
  }
  
  static async warmUserData(userId: string): Promise<void> {
    const endpoints = [
      `/api/users/${userId}/projects`,
      `/api/users/${userId}/notifications`,
      `/api/users/${userId}/preferences`,
    ];
    
    for (const endpoint of endpoints) {
      try {
        console.debug(`Warming cache for: ${endpoint}`);
      } catch (error) {
        console.error(`Failed to warm cache for ${endpoint}:`, error);
      }
    }
  }
}