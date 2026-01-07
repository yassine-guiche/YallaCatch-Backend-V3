import Redis, { RedisOptions } from 'ioredis';
import { config, isProduction } from './index';
import { logger } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';

// Redis connection options
const redisOptions: RedisOptions = {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  family: 4, // Use IPv4
  keepAlive: 30000,
  db: 0,
  password: config.REDIS_PASSWORD,
  keyPrefix: 'yallacatch:',
};

// Connection state management
let isConnected = false;
let connectionPromise: Promise<Redis> | null = null;

// Main Redis client
export let redisClient: Redis;

// Separate client for pub/sub SUBSCRIBER operations (enters subscriber mode, cannot publish)
export let redisPubSub: Redis;

// Separate client for PUBLISHING operations (cannot subscribe)
export let redisPublisher: Redis;

/**
 * Connect to Redis with retry logic
 */
export const connectRedis = async (): Promise<Redis> => {
  if (isConnected && redisClient?.status === 'ready') {
    return redisClient;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = createRedisConnection();

  try {
    redisClient = await connectionPromise;
    
    // Create separate pub/sub subscriber client (for subscribe only)
    redisPubSub = redisClient.duplicate();
    await redisPubSub.connect();

    // Create separate publisher client (for publish only)
    redisPublisher = redisClient.duplicate();
    await redisPublisher.connect();

    isConnected = true;
    typedLogger.info('Redis connected successfully', {
      host: redisClient.options.host,
      port: redisClient.options.port,
      db: redisClient.options.db,
      status: redisClient.status,
    });

    // Propagate the live client to cache service without creating import cycles
    try {
      const cacheModule = await import('@/services/cache');
      if (typeof (cacheModule as any).setCacheClient === 'function') {
        (cacheModule as any).setCacheClient(redisClient);
      }
    } catch (err) {
      typedLogger.error('Failed to set cache client', { error: (err as any)?.message });
    }

    return redisClient;
  } catch (error) {
    isConnected = false;
    connectionPromise = null;
    typedLogger.error('Redis connection failed', { error: (error as any).message });
    throw error;
  }
};

/**
 * Create Redis connection with event listeners
 */
const createRedisConnection = async (): Promise<Redis> => {
  const client = new Redis(config.REDIS_URL, redisOptions);

  // Set up event listeners
  client.on('connect', () => {
    typedLogger.info('Redis connection established');
  });

  client.on('ready', () => {
    typedLogger.info('Redis client ready');
    isConnected = true;
  });

  client.on('error', (error) => {
    typedLogger.error('Redis connection error', { error: (error as any).message });
    isConnected = false;
  });

  client.on('close', () => {
    typedLogger.warn('Redis connection closed');
    isConnected = false;
  });

  client.on('reconnecting', (ms) => {
    typedLogger.info('Redis reconnecting', { delay: ms });
  });

  client.on('end', () => {
    typedLogger.info('Redis connection ended');
    isConnected = false;
  });

  // Connect to Redis
  await client.connect();
  return client;
};

/**
 * Disconnect from Redis
 */
export const disconnectRedis = async (): Promise<void> => {
  try {
    if (redisPubSub) {
      await redisPubSub.disconnect();
    }
    if (redisPublisher) {
      await redisPublisher.disconnect();
    }
    if (redisClient) {
      await redisClient.disconnect();
    }
    isConnected = false;
    connectionPromise = null;
    typedLogger.info('Redis disconnected successfully');
  } catch (error) {
    typedLogger.error('Error disconnecting from Redis', { error: (error as any).message });
    throw error;
  }
};

/**
 * Redis cache utility functions
 */
export class RedisCache {
  private static client: Redis;

  static initialize(client: Redis) {
    this.client = client;
  }

  /**
   * Set a value in cache with TTL
   */
  static async set(key: string, value: any, ttl: number = config.CACHE_TTL): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttl, serialized);
    } catch (error) {
      typedLogger.error('Redis cache set error', { key, error: (error as any).message });
      throw error;
    }
  }

  /**
   * Get a value from cache
   */
  static async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      typedLogger.error('Redis cache get error', { key, error: (error as any).message });
      return null;
    }
  }

  /**
   * Delete a key from cache
   */
  static async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      typedLogger.error('Redis cache delete error', { key, error: (error as any).message });
      throw error;
    }
  }

  /**
   * Check if a key exists in cache
   */
  static async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      typedLogger.error('Redis cache exists error', { key, error: (error as any).message });
      return false;
    }
  }

  /**
   * Set TTL for a key
   */
  static async expire(key: string, ttl: number): Promise<void> {
    try {
      await this.client.expire(key, ttl);
    } catch (error) {
      typedLogger.error('Redis cache expire error', { key, ttl, error: (error as any).message });
      throw error;
    }
  }

  /**
   * Increment a counter
   */
  static async incr(key: string, ttl?: number): Promise<number> {
    try {
      const result = await this.client.incr(key);
      if (ttl && result === 1) {
        await this.client.expire(key, ttl);
      }
      return result;
    } catch (error) {
      typedLogger.error('Redis cache increment error', { key, error: (error as any).message });
      throw error;
    }
  }

  /**
   * Add item to a set
   */
  static async sadd(key: string, member: string, ttl?: number): Promise<void> {
    try {
      await this.client.sadd(key, member);
      if (ttl) {
        await this.client.expire(key, ttl);
      }
    } catch (error) {
      typedLogger.error('Redis set add error', { key, member, error: (error as any).message });
      throw error;
    }
  }

  /**
   * Get all members of a set
   */
  static async smembers(key: string): Promise<string[]> {
    try {
      const members = await this.client.smembers(key);
      return members || [];
    } catch (error) {
      typedLogger.error('Redis set members error', { key, error: (error as any).message });
      return [];
    }
  }

  /**
   * Check if member exists in set
   */
  static async sismember(key: string, member: string): Promise<boolean> {
    try {
      const result = await this.client.sismember(key, member);
      return result === 1;
    } catch (error) {
      typedLogger.error('Redis set member check error', { key, member, error: (error as any).message });
      return false;
    }
  }


  /**
   * Remove member from set
   */
  static async srem(key: string, member: string): Promise<void> {
    try {
      await this.client.srem(key, member);
    } catch (error) {
      typedLogger.error('Redis set remove error', { key, member, error: (error as any).message });
      throw error;
    }
  }

  /**
   * Push item to list
   */
  static async lpush(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await this.client.lpush(key, serialized);
      if (ttl) {
        await this.client.expire(key, ttl);
      }
    } catch (error) {
      typedLogger.error('Redis list push error', { key, error: (error as any).message });
      throw error;
    }
  }

  /**
   * Get list range
   */
  static async lrange<T = any>(key: string, start: number = 0, stop: number = -1): Promise<T[]> {
    try {
      const values = await this.client.lrange(key, start, stop);
      return values.map(value => JSON.parse(value));
    } catch (error) {
      typedLogger.error('Redis list range error', { key, start, stop, error: (error as any).message });
      return [];
    }
  }

  /**
   * Clear all cache
   */
  static async clear(): Promise<void> {
    try {
      const keys = await this.client.keys('yallacatch:*');
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      typedLogger.error('Redis cache clear error', { error: (error as any).message });
      throw error;
    }
  }
}

/**
 * Rate limiting utility
 */
export class RedisRateLimit {
  private static client: Redis;

  static initialize(client: Redis) {
    this.client = client;
  }

  /**
   * Check rate limit for a key
   */
  static async checkLimit(
    key: string,
    limit: number,
    windowMs: number,
    identifier?: string
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const fullKey = identifier ? `ratelimit:${key}:${identifier}` : `ratelimit:${key}`;
      const current = await this.client.incr(fullKey);
      
      if (current === 1) {
        await this.client.expire(fullKey, Math.ceil(windowMs / 1000));
      }

      const ttl = await this.client.ttl(fullKey);
      const resetTime = Date.now() + (ttl * 1000);
      const remaining = Math.max(0, limit - current);

      return {
        allowed: current <= limit,
        remaining,
        resetTime,
      };
    } catch (error) {
      typedLogger.error('Redis rate limit error', { key, error: (error as any).message });
      // Allow request on Redis error
      return { allowed: true, remaining: limit, resetTime: Date.now() + windowMs };
    }
  }

  /**
   * Reset rate limit for a key
   */
  static async resetLimit(key: string, identifier?: string): Promise<void> {
    try {
      const fullKey = identifier ? `ratelimit:${key}:${identifier}` : `ratelimit:${key}`;
      await this.client.del(fullKey);
    } catch (error) {
      typedLogger.error('Redis rate limit reset error', { key, error: (error as any).message });
      throw error;
    }
  }
}

/**
 * Session management utility
 */
export class RedisSession {
  private static client: Redis;

  static initialize(client: Redis) {
    this.client = client;
  }

  /**
   * Create a session
   */
  static async create(sessionId: string, data: any, ttl: number = 86400): Promise<void> {
    try {
      const key = `session:${sessionId}`;
      await this.client.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      typedLogger.error('Redis session create error', { sessionId, error: (error as any).message });
      throw error;
    }
  }

  /**
   * Get session data
   */
  static async get<T = any>(sessionId: string): Promise<T | null> {
    try {
      const key = `session:${sessionId}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      typedLogger.error('Redis session get error', { sessionId, error: (error as any).message });
      return null;
    }
  }

  /**
   * Update session data
   */
  static async update(sessionId: string, data: any, ttl?: number): Promise<void> {
    try {
      const key = `session:${sessionId}`;
      if (ttl) {
        await this.client.setex(key, ttl, JSON.stringify(data));
      } else {
        await this.client.set(key, JSON.stringify(data));
      }
    } catch (error) {
      typedLogger.error('Redis session update error', { sessionId, error: (error as any).message });
      throw error;
    }
  }

  /**
   * Delete a session
   */
  static async destroy(sessionId: string): Promise<void> {
    try {
      const key = `session:${sessionId}`;
      await this.client.del(key);
    } catch (error) {
      typedLogger.error('Redis session destroy error', { sessionId, error: (error as any).message });
      throw error;
    }
  }

  /**
   * Extend session TTL
   */
  static async extend(sessionId: string, ttl: number): Promise<void> {
    try {
      const key = `session:${sessionId}`;
      await this.client.expire(key, ttl);
    } catch (error) {
      typedLogger.error('Redis session extend error', { sessionId, error: (error as any).message });
      throw error;
    }
  }
}

/**
 * Get Redis connection status
 */
export const getConnectionStatus = () => {
  return {
    isConnected,
    status: redisClient?.status || 'disconnected',
    host: redisClient?.options?.host,
    port: redisClient?.options?.port,
    db: redisClient?.options?.db,
  };
};

/**
 * Health check for Redis
 */
export const healthCheck = async (): Promise<boolean> => {
  try {
    if (!isConnected || redisClient?.status !== 'ready') {
      return false;
    }

    // Ping Redis
    const result = await redisClient.ping();
    return result === 'PONG';
  } catch (error) {
    typedLogger.error('Redis health check failed', { error: (error as any).message });
    return false;
  }
};

// Initialize utilities when Redis connects
export const initializeRedisUtilities = (client: Redis): void => {
  RedisCache.initialize(client);
  RedisRateLimit.initialize(client);
  RedisSession.initialize(client);
};

// Handle process termination
process.on('SIGINT', async () => {
  try {
    await disconnectRedis();
  } catch (error) {
    typedLogger.error('Error during Redis graceful shutdown', { error: (error as any).message });
  }
});
