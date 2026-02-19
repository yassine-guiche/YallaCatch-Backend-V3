import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { redisClient } from '@/config/redis';
import { logSecurity } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';

/**
 * Distributed rate limiter configurations
 */
export interface RateLimitConfig {
  keyPrefix: string;
  points: number;
  duration: number;
  blockDuration?: number;
  execEvenly?: boolean;
}

/**
 * Create a distributed rate limiter using Redis
 */
function createRateLimiter(rateLimitConfig: RateLimitConfig): RateLimiterRedis {
  return new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: rateLimitConfig.keyPrefix,
    points: rateLimitConfig.points,
    duration: rateLimitConfig.duration,
    blockDuration: rateLimitConfig.blockDuration || rateLimitConfig.duration,
    execEvenly: rateLimitConfig.execEvenly || false,
  });
}

/**
 * Rate limiter instances
 */
let limiters: {
  global: RateLimiterRedis;
  auth: RateLimiterRedis;
  user: RateLimiterRedis;
  claims: RateLimiterRedis;
  admin: RateLimiterRedis;
  websocket: RateLimiterRedis;
} | null = null;

function ensureLimiters() {
  if (limiters) return limiters;
  if (!redisClient) {
    throw new Error('Redis client not initialized for rate limiting');
  }
  limiters = {
    // Global IP-based rate limiting
    global: createRateLimiter({
      keyPrefix: 'global_rate_limit',
      points: 1000, // 1000 requests (increased for dev)
      duration: 900, // per 15 minutes
      blockDuration: 60, // block for 1 minute only
    }),

    // Authentication endpoints
    auth: createRateLimiter({
      keyPrefix: 'auth_rate_limit',
      points: 20, // 20 attempts (increased for dev)
      duration: 900, // per 15 minutes
      blockDuration: 300, // block for 5 minutes
    }),

    // User-specific rate limiting
    user: createRateLimiter({
      keyPrefix: 'user_rate_limit',
      points: 1000, // 1000 requests
      duration: 3600, // per hour
      blockDuration: 3600, // block for 1 hour
    }),

    // Claims (prize capture) rate limiting
    claims: createRateLimiter({
      keyPrefix: 'claims_rate_limit',
      points: 50, // 50 claims
      duration: 3600, // per hour
      blockDuration: 1800, // block for 30 minutes
    }),

    // Admin operations
    admin: createRateLimiter({
      keyPrefix: 'admin_rate_limit',
      points: 500, // 500 requests
      duration: 3600, // per hour
      blockDuration: 600, // block for 10 minutes
    }),

    // WebSocket connections
    websocket: createRateLimiter({
      keyPrefix: 'websocket_rate_limit',
      points: 10, // 10 connections
      duration: 60, // per minute
      blockDuration: 300, // block for 5 minutes
    }),
  };
  return limiters;
}

/**
 * Generic rate limiting middleware factory
 */
export function createRateLimitMiddleware(
  limiter: RateLimiterRedis,
  keyExtractor: (request: FastifyRequest) => string,
  options: {
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    onLimitReached?: (request: FastifyRequest, rateLimiterRes: RateLimiterRes) => void;
  } = {}
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const key = keyExtractor(request);

      // Try to consume a point
      const rateLimiterRes = await limiter.consume(key);

      // Add rate limit headers
      reply.headers({
        'X-RateLimit-Limit': limiter.points,
        'X-RateLimit-Remaining': rateLimiterRes.remainingPoints || 0,
        'X-RateLimit-Reset': (new Date(Date.now() + rateLimiterRes.msBeforeNext)).toISOString(),
      });

    } catch (rateLimiterRes) {
      if (rateLimiterRes instanceof RateLimiterRes) {
        const secs = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;

        // Log rate limit exceeded
        logSecurity('rate_limit_exceeded', 'medium', {
          key: keyExtractor(request),
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          endpoint: request.url,
          method: request.method,
          userId: request.user?.sub,
          retryAfter: secs,
        });

        // Call custom handler if provided
        if (options.onLimitReached) {
          options.onLimitReached(request, rateLimiterRes);
        }

        reply.code(429).headers({
          'Retry-After': secs,
          'X-RateLimit-Limit': limiter.points,
          'X-RateLimit-Remaining': 0,
          'X-RateLimit-Reset': (new Date(Date.now() + rateLimiterRes.msBeforeNext)).toISOString(),
        });

        return reply.send({
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          retryAfter: secs,
          timestamp: new Date().toISOString(),
        });
      }

      // Other error
      typedLogger.error('Rate limiter error', {
        error: rateLimiterRes instanceof Error ? rateLimiterRes.message : String(rateLimiterRes),
        key: keyExtractor(request),
        ip: request.ip,
      });

      // Don't block on rate limiter errors, just log and continue
    }
  };
}

/**
 * IP-based rate limiting (skips OPTIONS preflight requests)
 */
export const ipRateLimit = async (request: FastifyRequest, reply: FastifyReply) => {
  // Skip rate limiting for OPTIONS preflight requests
  if (request.method === 'OPTIONS') {
    return;
  }
  return createRateLimitMiddleware(ensureLimiters().global, (req) => req.ip)(request, reply);
};

/**
 * User-based rate limiting (skips OPTIONS preflight requests)
 */
export const userRateLimit = async (request: FastifyRequest, reply: FastifyReply) => {
  // Skip rate limiting for OPTIONS preflight requests
  if (request.method === 'OPTIONS') {
    return;
  }
  return createRateLimitMiddleware(ensureLimiters().user, (req) => {
    return req.user?.sub || req.ip;
  })(request, reply);
};

/**
 * Authentication rate limiting (skips OPTIONS preflight requests)
 */
export const authRateLimit = async (request: FastifyRequest, reply: FastifyReply) => {
  // Skip rate limiting for OPTIONS preflight requests
  if (request.method === 'OPTIONS') {
    return;
  }
  return createRateLimitMiddleware(
    ensureLimiters().auth,
    (req) => {
      const body = req.body as Record<string, unknown>;
      return typeof body?.email === 'string' ? body.email : req.ip;
    },
    {
      onLimitReached: (req, rateLimiterRes) => {
        const body = req.body as Record<string, unknown>;
        logSecurity('auth_rate_limit_exceeded', 'high', {
          email: typeof body?.email === 'string' ? body.email : undefined,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          endpoint: req.url,
          method: req.method,
          msBeforeNext: rateLimiterRes.msBeforeNext,
        });
      },
    }
  )(request, reply);
};

/**
 * Claims rate limiting (skips OPTIONS preflight requests)
 */
export const claimsRateLimit = async (request: FastifyRequest, reply: FastifyReply) => {
  // Skip rate limiting for OPTIONS preflight requests
  if (request.method === 'OPTIONS') {
    return;
  }
  return createRateLimitMiddleware(
    ensureLimiters().claims,
    (req) => {
      return req.user?.sub || req.ip;
    },
    {
      onLimitReached: (req, rateLimiterRes) => {
        logSecurity('claims_rate_limit_exceeded', 'medium', {
          userId: req.user?.sub,
          ip: req.ip,
          endpoint: req.url,
          msBeforeNext: rateLimiterRes.msBeforeNext,
        });
      },
    }
  )(request, reply);
};

/**
 * Admin rate limiting (skips OPTIONS preflight requests)
 */
export const adminRateLimit = async (request: FastifyRequest, reply: FastifyReply) => {
  // Skip rate limiting for OPTIONS preflight requests
  if (request.method === 'OPTIONS') {
    return;
  }
  return createRateLimitMiddleware(
    ensureLimiters().admin,
    (req) => {
      return `admin:${req.user?.sub || req.ip}`;
    }
  )(request, reply);
};

/**
 * WebSocket connection rate limiting (skips OPTIONS preflight requests)
 */
export const websocketRateLimit = async (request: FastifyRequest, reply: FastifyReply) => {
  // Skip rate limiting for OPTIONS preflight requests
  if (request.method === 'OPTIONS') {
    return;
  }
  return createRateLimitMiddleware(
    ensureLimiters().websocket,
    (req) => `ws:${req.ip}`
  )(request, reply);
};

/**
 * Adaptive rate limiting based on user behavior
 */
export class AdaptiveRateLimiter {
  private suspiciousUsers = new Set<string>();
  private strictLimiter: RateLimiterRedis;
  private normalLimiter: RateLimiterRedis;

  constructor() {
    this.strictLimiter = createRateLimiter({
      keyPrefix: 'adaptive_strict',
      points: 10,
      duration: 60,
      blockDuration: 300,
    });

    this.normalLimiter = createRateLimiter({
      keyPrefix: 'adaptive_normal',
      points: 100,
      duration: 60,
      blockDuration: 60,
    });
  }

  markSuspicious(userId: string): void {
    this.suspiciousUsers.add(userId);

    // Remove after 1 hour
    setTimeout(() => {
      this.suspiciousUsers.delete(userId);
    }, 3600000);

    logSecurity('user_marked_suspicious', 'high', {
      userId,
      timestamp: new Date().toISOString(),
    });
  }

  async checkLimit(userId: string, ip: string): Promise<boolean> {
    const key = userId || ip;
    const limiter = this.suspiciousUsers.has(userId) ? this.strictLimiter : this.normalLimiter;

    try {
      await limiter.consume(key);
      return true;
    } catch (rateLimiterRes) {
      if (rateLimiterRes instanceof RateLimiterRes) {
        return false;
      }
      // On error, allow the request
      return true;
    }
  }

  createMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const userId = request.user?.sub;
      const ip = request.ip;

      // Type assertion for userId is safe here because checkLimit handles undefined
      // But checkLimit expects string, so we default to empty string if undefined (though it falls back to IP)
      const allowed = await this.checkLimit(userId || '', ip);

      if (!allowed) {
        logSecurity('adaptive_rate_limit_exceeded', 'high', {
          userId,
          ip,
          isSuspicious: userId ? this.suspiciousUsers.has(userId) : false,
          endpoint: request.url,
        });

        return reply.code(429).send({
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Request rate too high',
          timestamp: new Date().toISOString(),
        });
      }
    };
  }
}

// Initialize rate limiters function
export function initializeRateLimiters() {
  ensureLimiters();
  typedLogger.info('Rate limiters initialized');
}

// Export singleton instance (lazy initialization to avoid Redis connection issues)
let _adaptiveRateLimiter: AdaptiveRateLimiter | null = null;
export const getAdaptiveRateLimiter = () => {
  if (!_adaptiveRateLimiter) {
    _adaptiveRateLimiter = new AdaptiveRateLimiter();
  }
  return _adaptiveRateLimiter;
};

/**
 * Rate limiting plugin for Fastify
 */
export default async function rateLimitPlugin(fastify: FastifyInstance) {
  // Register rate limiters as decorators
  fastify.decorate('rateLimiters', limiters);
  fastify.decorate('ipRateLimit', ipRateLimit);
  fastify.decorate('userRateLimit', userRateLimit);
  fastify.decorate('authRateLimit', authRateLimit);
  fastify.decorate('claimsRateLimit', claimsRateLimit);
  fastify.decorate('adminRateLimit', adminRateLimit);
  fastify.decorate('websocketRateLimit', websocketRateLimit);
  fastify.decorate('adaptiveRateLimiter', getAdaptiveRateLimiter());
}
