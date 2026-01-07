import { redisClient } from '@/config/redis';
import { typedLogger } from '@/lib/typed-logger';
import { config } from '@/config';

/**
 * Intelligent Caching Service
 * Critical for Unity performance - reduces API calls, improves response times
 * Implements multi-layer caching with automatic invalidation
 */

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for group invalidation
  compress?: boolean; // Compress large data
  serialize?: boolean; // Auto JSON serialize/deserialize
  namespace?: string; // Cache namespace
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: number;
}

export class CacheService {
  private static redis = redisClient;
  // Always return a live Redis client; avoid undefined during early bootstrap
  private static get client() {
    return CacheService.redis ?? redisClient;
  }
  private static defaultTTL = 3600; // 1 hour
  private static stats = {
    hits: 0,
    misses: 0,
  };

  /**
   * Get cached data with automatic deserialization
   */
  static async get<T = any>(key: string, options: CacheOptions = {}): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key, options.namespace);
      const client = this.client;
      if (!client) {
        typedLogger.error('Cache get skipped: redis client not ready', { key });
        return null;
      }
      const cached = await client.get(fullKey);

      if (cached === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;

      // Handle compressed data
      let data = cached;
      if (options.compress && cached.startsWith('COMPRESSED:')) {
        data = this.decompress(cached.substring(11));
      }

      // Handle serialized data
      if (options.serialize !== false) {
        try {
          return JSON.parse(data);
        } catch {
          return data as T;
        }
      }

      return data as T;
    } catch (error) {
      typedLogger.error('Cache get error', { error: (error as any).message, key });
      return null;
    }
  }

  /**
   * Set cached data with automatic serialization and compression
   */
  static async set(
    key: string, 
    value: any, 
    options: CacheOptions = {}
  ): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options.namespace);
      const ttl = options.ttl || this.defaultTTL;
      const client = this.client;
      if (!client) {
        typedLogger.error('Cache set skipped: redis client not ready', { key });
        return false;
      }

      // Serialize data
      let data = options.serialize !== false ? JSON.stringify(value) : value;

      // Compress large data
      if (options.compress && data.length > 1024) {
        data = 'COMPRESSED:' + this.compress(data);
      }

      // Set with expiration
      await client.setex(fullKey, ttl, data);

      // Add tags for group invalidation
      if (options.tags && options.tags.length > 0) {
        await this.addToTags(fullKey, options.tags, ttl);
      }

      return true;
    } catch (error) {
      typedLogger.error('Cache set error', { error: (error as any).message, key });
      return false;
    }
  }

  /**
   * Delete cached data
   */
  static async del(key: string, namespace?: string): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, namespace);
      const client = this.client;
      if (!client) {
        typedLogger.error('Cache delete skipped: redis client not ready', { key });
        return false;
      }
      const result = await client.del(fullKey);
      return result > 0;
    } catch (error) {
      typedLogger.error('Cache delete error', { error: (error as any).message, key });
      return false;
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute function and cache result
   */
  static async getOrSet<T = any>(
    key: string,
    fetchFunction: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.get<T>(key, options);
      if (cached !== null) {
        return cached;
      }

      // Execute fetch function
      const data = await fetchFunction();
      
      // Cache the result
      await this.set(key, data, options);
      
      return data;
    } catch (error) {
      typedLogger.error('Cache getOrSet error', { error: (error as any).message, key });
      throw error;
    }
  }

  /**
   * Invalidate cache by tags
   */
  static async invalidateByTags(tags: string[]): Promise<number> {
    try {
      let deletedCount = 0;
      const client = this.client;
      if (!client) {
        typedLogger.error('Cache invalidateByTags skipped: redis client not ready', { tags });
        return 0;
      }

      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const keys = await client.smembers(tagKey);
        
        if (keys.length > 0) {
          // Delete all keys with this tag
          const deleted = await client.del(...keys);
          deletedCount += deleted;
          
          // Remove the tag set
          await client.del(tagKey);
        }
      }

      typedLogger.info('Cache invalidated by tags', { tags, deletedCount });
      return deletedCount;
    } catch (error) {
      typedLogger.error('Cache invalidate by tags error', { error: (error as any).message, tags });
      return 0;
    }
  }

  /**
   * Invalidate cache by key pattern (supports wildcards)
   */
  static async invalidate(pattern: string, namespace?: string): Promise<number> {
    try {
      const fullPattern = this.buildKey(pattern, namespace);
      const client = this.client;
      if (!client) {
        typedLogger.error('Cache invalidate skipped: redis client not ready', { pattern });
        return 0;
      }
      const keys = await client.keys(fullPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      const deleted = await client.del(...keys);
      typedLogger.info('Cache invalidated by pattern', { pattern: fullPattern, deletedCount: deleted });
      return deleted;
    } catch (error) {
      typedLogger.error('Cache invalidate by pattern error', { error: (error as any).message, pattern });
      return 0;
    }
  }

  /**
   * Cache Unity-specific map data with spatial indexing
   */
  static async cacheMapData(
    bounds: { north: number; south: number; east: number; west: number },
    data: any,
    ttl: number = 300 // 5 minutes for map data
  ): Promise<void> {
    try {
      const key = `map:${bounds.north}_${bounds.south}_${bounds.east}_${bounds.west}`;
      
      await this.set(key, {
        bounds,
        data,
        timestamp: new Date().toISOString(),
      }, {
        ttl,
        tags: ['map_data', 'unity'],
        compress: true,
      });

      // Also cache individual prizes for faster lookup
      if (data.prizes) {
        for (const prize of data.prizes) {
          await this.set(`prize:${prize.id}`, prize, {
            ttl: ttl * 2, // Prizes cache longer
            tags: ['prizes', 'unity'],
          });
        }
      }
    } catch (error) {
      typedLogger.error('Cache map data error', { error: (error as any).message, bounds });
    }
  }

  /**
   * Cache user session data for Unity
   */
  static async cacheUserSession(userId: string, sessionData: any): Promise<void> {
    try {
      await this.set(`user_session:${userId}`, sessionData, {
        ttl: 3600, // 1 hour
        tags: ['user_sessions', 'unity'],
      });
    } catch (error) {
      typedLogger.error('Cache user session error', { error: (error as any).message, userId });
    }
  }

  /**
   * Cache leaderboard data with automatic refresh
   */
  static async cacheLeaderboard(
    type: string,
    data: any,
    ttl: number = 300 // 5 minutes
  ): Promise<void> {
    try {
      await this.set(`leaderboard:${type}`, {
        data,
        lastUpdated: new Date().toISOString(),
      }, {
        ttl,
        tags: ['leaderboards', 'unity'],
        compress: true,
      });
    } catch (error) {
      typedLogger.error('Cache leaderboard error', { error: (error as any).message, type });
    }
  }

  /**
   * Warm up cache with frequently accessed data
   */
  static async warmupCache(): Promise<void> {
    try {
      typedLogger.info('Starting cache warmup...');

      // Warmup common queries
      const warmupTasks = [
        this.warmupMapData(),
        this.warmupLeaderboards(),
        this.warmupSettings(),
        this.warmupPartners(),
      ];

      await Promise.allSettled(warmupTasks);
      
      typedLogger.info('Cache warmup completed');
    } catch (error) {
      typedLogger.error('Cache warmup error', { error: (error as any).message });
    }
  }

  /**
   * Get cache statistics
   */
  static async getStats(): Promise<CacheStats> {
    try {
      const client = this.client;
      if (!client) {
        typedLogger.error('Cache stats skipped: redis client not ready');
        return {
          hits: this.stats.hits,
          misses: this.stats.misses,
          hitRate: 0,
          totalKeys: 0,
          memoryUsage: 0,
        };
      }
      const info = await client.info('memory');
      const keyspace = await client.info('keyspace');
      
      // Parse memory usage
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : 0;

      // Parse total keys
      const keysMatch = keyspace.match(/keys=(\d+)/);
      const totalKeys = keysMatch ? parseInt(keysMatch[1]) : 0;

      const totalRequests = this.stats.hits + this.stats.misses;
      const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: Math.round(hitRate * 100) / 100,
        totalKeys,
        memoryUsage,
      };
    } catch (error) {
      typedLogger.error('Get cache stats error', { error: (error as any).message });
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate: 0,
        totalKeys: 0,
        memoryUsage: 0,
      };
    }
  }

  /**
   * Clear all cache
   */
  static async clearAll(): Promise<boolean> {
    try {
      const client = this.client;
      if (!client) {
        typedLogger.error('Cache clear skipped: redis client not ready');
        return false;
      }
      await client.flushdb();
      this.stats.hits = 0;
      this.stats.misses = 0;
      typedLogger.info('All cache cleared');
      return true;
    } catch (error) {
      typedLogger.error('Clear all cache error', { error: (error as any).message });
      return false;
    }
  }

  /**
   * Unity-specific cache methods
   */
  
  // Cache nearby prizes for Unity
  static async cacheNearbyPrizes(
    location: { lat: number; lng: number },
    radius: number,
    prizes: any[]
  ): Promise<void> {
    const key = `nearby_prizes:${location.lat}_${location.lng}_${radius}`;
    await this.set(key, prizes, {
      ttl: 60, // 1 minute for nearby prizes
      tags: ['nearby_prizes', 'unity'],
    });
  }

  // Cache user achievements for Unity
  static async cacheUserAchievements(userId: string, achievements: any[]): Promise<void> {
    await this.set(`achievements:${userId}`, achievements, {
      ttl: 1800, // 30 minutes
      tags: ['achievements', 'unity', `user:${userId}`],
    });
  }

  // Cache power-ups for Unity
  static async cachePowerUps(userId: string, powerUps: any[]): Promise<void> {
    await this.set(`powerups:${userId}`, powerUps, {
      ttl: 600, // 10 minutes
      tags: ['powerups', 'unity', `user:${userId}`],
    });
  }

  // Cache daily challenges for Unity
  static async cacheDailyChallenges(userId: string, challenges: any[]): Promise<void> {
    await this.set(`daily_challenges:${userId}`, challenges, {
      ttl: 3600, // 1 hour
      tags: ['challenges', 'unity', `user:${userId}`],
    });
  }

  // Private helper methods
  private static buildKey(key: string, namespace?: string): string {
    const prefix = config.NODE_ENV === 'production' ? 'yc:prod:' : 'yc:dev:';
    const ns = namespace ? `${namespace}:` : '';
    return `${prefix}${ns}${key}`;
  }

  private static async addToTags(key: string, tags: string[], ttl: number): Promise<void> {
    try {
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        await this.redis.sadd(tagKey, key);
        await this.redis.expire(tagKey, ttl + 60); // Tag expires slightly later
      }
    } catch (error) {
      typedLogger.error('Add to tags error', { error: (error as any).message, key, tags });
    }
  }

  private static compress(data: string): string {
    // Simple compression implementation
    // In production, use a proper compression library like zlib
    return Buffer.from(data).toString('base64');
  }

  private static decompress(data: string): string {
    // Simple decompression implementation
    return Buffer.from(data, 'base64').toString();
  }

  // Warmup methods
  private static async warmupMapData(): Promise<void> {
    try {
      // Warmup major cities in Tunisia
      const majorCities = [
        { name: 'Tunis', lat: 36.8065, lng: 10.1815 },
        { name: 'Sfax', lat: 34.7406, lng: 10.7603 },
        { name: 'Sousse', lat: 35.8256, lng: 10.6411 },
        { name: 'Kairouan', lat: 35.6781, lng: 10.0963 },
      ];

      for (const city of majorCities) {
        const bounds = {
          north: city.lat + 0.05,
          south: city.lat - 0.05,
          east: city.lng + 0.05,
          west: city.lng - 0.05,
        };
        
        // This would typically call the actual map data service
        await this.cacheMapData(bounds, { prizes: [], partners: [] }, 1800);
      }
    } catch (error) {
      typedLogger.error('Warmup map data error', { error: (error as any).message });
    }
  }

  private static async warmupLeaderboards(): Promise<void> {
    try {
      const leaderboardTypes = ['points', 'claims', 'distance', 'level'];
      
      for (const type of leaderboardTypes) {
        // This would typically call the actual leaderboard service
        await this.cacheLeaderboard(type, [], 600);
      }
    } catch (error) {
      typedLogger.error('Warmup leaderboards error', { error: (error as any).message });
    }
  }

  private static async warmupSettings(): Promise<void> {
    try {
      // Cache system settings
      await this.set('system_settings', {}, {
        ttl: 3600,
        tags: ['settings'],
      });
    } catch (error) {
      typedLogger.error('Warmup settings error', { error: (error as any).message });
    }
  }

  private static async warmupPartners(): Promise<void> {
    try {
      // Cache active partners
      await this.set('active_partners', [], {
        ttl: 1800,
        tags: ['partners'],
      });
    } catch (error) {
      typedLogger.error('Warmup partners error', { error: (error as any).message });
    }
  }
}

// Allow Redis initialization to be injected after connect to avoid circular imports
export function setCacheClient(client: any) {
  (CacheService as any).redis = client;
}

/**
 * Cache decorators for automatic caching
 */
export function Cacheable(options: CacheOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${target.constructor.name}:${propertyKey}:${JSON.stringify(args)}`;
      
      return await CacheService.getOrSet(
        cacheKey,
        () => originalMethod.apply(this, args),
        options
      );
    };

    return descriptor;
  };
}

export default CacheService;
