import Redis from 'ioredis';

// Simple config for redis client without circular dependency
const getRedisConfig = () => ({
  url: process.env.REDIS_URL,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
  keepAlive: 30000,
  family: 4, // Use IPv4
});

class RedisService {
  private client: Redis | null = null;
  private isConnected = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    const config = getRedisConfig();
    
    if (!config.url) {
      console.warn('Redis URL not configured, using memory cache for development');
      return;
    }

    try {
      this.client = new Redis(config.url, {
        maxRetriesPerRequest: config.maxRetriesPerRequest,
        lazyConnect: config.lazyConnect,
        keepAlive: config.keepAlive,
        family: config.family,
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        console.info('Redis connected successfully');
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        console.error('Redis connection error:', err);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        console.warn('Redis connection closed');
      });

    } catch (error) {
      console.error('Failed to initialize Redis:', error);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client || !this.isConnected) {
      return null;
    }
    
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis EXISTS error:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  isAvailable(): boolean {
    return this.client !== null && this.isConnected;
  }
}

// Cache key patterns and utilities
export const CacheKeys = {
  PROJECT: (id: string) => `project:${id}`,
  USER: (id: string) => `user:${id}`,
  MILESTONES: (projectId: string) => `milestones:${projectId}`,
  DOCUMENTS: (projectId: string) => `documents:${projectId}`,
  TRANSACTIONS: (projectId: string) => `transactions:${projectId}`,
  ALL_PROJECTS: 'projects:all',
  trades: 'trades:all',
} as const;

export const CachePatterns = {
  PROJECT: 'project:*',
  USER: 'user:*',
  ALL: '*',
  PROJECT_DATA: 'project:*',
  GLOBAL_SCHEDULE: 'schedule:global',
} as const;

export const CacheTTL = {
  SHORT: 300,    // 5 minutes
  MEDIUM: 1800,  // 30 minutes
  LONG: 3600,    // 1 hour
  DAY: 86400,    // 24 hours
} as const;

export const redisService = new RedisService();
export const cacheService = redisService; // Alias for backward compatibility

// Utility function for graceful shutdown
export const closeRedisConnection = async (): Promise<void> => {
  await redisService.disconnect();
};

export default redisService;