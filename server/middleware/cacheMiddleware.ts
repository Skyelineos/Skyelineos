import { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../../shared/auth-types';
import { cacheService, CacheKeys, CacheTTL } from '../utils/redisClient';

/**
 * Cache middleware for GET requests
 * Caches successful responses and serves them on subsequent requests
 */
export function cacheMiddleware(key: string | ((req: AuthenticatedRequest) => string), ttl: number = CacheTTL.MEDIUM) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    try {
      const cacheKey = typeof key === 'function' ? key(req) : key;
      
      // Try to get from cache
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        // Target operation completed
        return res.json(cached);
      }

      // Cache miss - store the original res.json function
      const originalJson = res.json;
      
      res.json = function(data) {
        // Cache the response asynchronously
        setImmediate(async () => {
          try {
            if (res.statusCode === 200) {
              await cacheService.set(cacheKey, data, ttl);
              // Development logging removed
            }
          } catch (error) {
            console.error('Cache storage error:', error);
          }
        });

        // Call the original json function
        return originalJson.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
}

/**
 * Cache invalidation middleware for write operations
 * Invalidates related cache entries after successful write operations
 */
export function invalidateCacheMiddleware(patterns: string | string[] | ((req: AuthenticatedRequest) => string | string[])) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json;
    
    res.json = function(data) {
      // Invalidate cache asynchronously after successful operations
      setImmediate(async () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const invalidationPatterns = typeof patterns === 'function' ? patterns(req) : patterns;
            const patternsArray = Array.isArray(invalidationPatterns) ? invalidationPatterns : [invalidationPatterns];
            
            for (const pattern of patternsArray) {
              await cacheService.invalidatePattern(pattern);
            }
          }
        } catch (error) {
          console.error('Cache invalidation error:', error);
        }
      });

      return originalJson.call(this, data);
    };

    next();
  };
}