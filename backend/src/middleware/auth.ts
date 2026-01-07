import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt';
import { User } from '@/models/User';
import { UserRole } from '@/types';
import { logger, logSecurity } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      sub: string;
      email?: string;
      role: string;
      deviceId?: string;
      sessionId?: string; // Made optional to match common authentication patterns
      displayName?: string;
      iat?: number;
      exp?: number;
    };
  }
}

/**
 * Authentication middleware
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = extractTokenFromHeader(request.headers.authorization);
    
    if (!token) {
      return reply.code(401).send({
        success: false,
        error: 'MISSING_TOKEN',
        message: 'Authorization token is required',
        timestamp: new Date().toISOString(),
      });
    }

    const verificationResult = await verifyToken(token);
    
    if (!verificationResult.valid || !verificationResult.decoded) {
      logSecurity('invalid_token_used', 'medium', {
        token: token.substring(0, 20) + '...',
        error: verificationResult.error,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      
      return reply.code(401).send({
        success: false,
        error: 'INVALID_TOKEN',
        message: verificationResult.error || 'Invalid or expired token',
        timestamp: new Date().toISOString(),
      });
    }

    // Check if user still exists and is not banned
    const user = await User.findById(verificationResult.decoded.sub);
    
    if (!user) {
      logSecurity('token_for_deleted_user', 'medium', {
        userId: verificationResult.decoded.sub,
        ip: request.ip,
      });
      
      return reply.code(401).send({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'User account no longer exists',
        timestamp: new Date().toISOString(),
      });
    }

    if (user.isBanned) {
      if (user.banExpiresAt && user.banExpiresAt > new Date()) {
        logSecurity('banned_user_access_attempt', 'high', {
          userId: user._id,
          banReason: user.banReason,
          banExpiresAt: user.banExpiresAt,
          ip: request.ip,
        });
        
        return reply.code(403).send({
          success: false,
          error: 'USER_BANNED',
          message: 'Account is temporarily banned',
          banExpiresAt: user.banExpiresAt,
          timestamp: new Date().toISOString(),
        });
      } else {
        // Unban expired bans
        user.unban();
        await user.save();
      }
    }

    if (user.deletedAt) {
      return reply.code(401).send({
        success: false,
        error: 'USER_DELETED',
        message: 'User account has been deleted',
        timestamp: new Date().toISOString(),
      });
    }

    // Update last active timestamp (throttled to 5 minutes)
    const now = Date.now();
    const last = user.lastActive ? user.lastActive.getTime() : 0;
    if (now - last > 5 * 60 * 1000) {
      user.lastActive = new Date(now);
      await user.save();
    }

    // Attach user to request
    request.user = verificationResult.decoded;

  } catch (error) {
    typedLogger.error('Authentication middleware error', {
      error: (error as any).message,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    
    return reply.code(500).send({
      success: false,
      error: 'AUTHENTICATION_ERROR',
      message: 'Authentication failed',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Admin authentication middleware
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.code(401).send({
      success: false,
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
      timestamp: new Date().toISOString(),
    });
  }

  const adminRoles = [UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPER_ADMIN];
  
  if (!adminRoles.includes(request.user.role as UserRole)) {
    logSecurity('unauthorized_admin_access', 'high', {
      userId: request.user.sub,
      role: request.user.role,
      endpoint: request.url,
      method: request.method,
      ip: request.ip,
    });
    
    return reply.code(403).send({
      success: false,
      error: 'INSUFFICIENT_PERMISSIONS',
      message: 'Admin privileges required',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Super admin authentication middleware
 */
export async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.code(401).send({
      success: false,
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
      timestamp: new Date().toISOString(),
    });
  }

  if (request.user.role !== UserRole.SUPER_ADMIN) {
    logSecurity('unauthorized_super_admin_access', 'critical', {
      userId: request.user.sub,
      role: request.user.role,
      endpoint: request.url,
      method: request.method,
      ip: request.ip,
    });
    
    return reply.code(403).send({
      success: false,
      error: 'INSUFFICIENT_PERMISSIONS',
      message: 'Super admin privileges required',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Optional authentication middleware
 */
export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const token = extractTokenFromHeader(request.headers.authorization);
    
    if (!token) {
      return; // No token provided, continue without authentication
    }

    const verificationResult = await verifyToken(token);
    
    if (verificationResult.valid && verificationResult.decoded) {
      // Check if user still exists
      const user = await User.findById(verificationResult.decoded.sub);
      
      if (user && !user.isBanned && !user.deletedAt) {
        request.user = verificationResult.decoded;
        
        // Update last active timestamp
        user.lastActive = new Date();
        await user.save();
      }
    }
  } catch (error) {
    // Silently fail for optional auth
    typedLogger.debug('Optional auth failed', { error: (error as any).message });
  }
}

/**
 * Role-based access control middleware factory
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return reply.code(401).send({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
        timestamp: new Date().toISOString(),
      });
    }

    if (!allowedRoles.includes(request.user.role as UserRole)) {
      logSecurity('unauthorized_role_access', 'medium', {
        userId: request.user.sub,
        userRole: request.user.role,
        requiredRoles: allowedRoles,
        endpoint: request.url,
        method: request.method,
        ip: request.ip,
      });
      
      return reply.code(403).send({
        success: false,
        error: 'INSUFFICIENT_PERMISSIONS',
        message: `Required roles: ${allowedRoles.join(', ')}`,
        timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * Device validation middleware
 */
export async function validateDevice(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const deviceId = request.headers['x-device-id'] as string;
  const platform = request.headers['x-platform'] as string;
  
  if (!deviceId) {
    return reply.code(400).send({
      success: false,
      error: 'MISSING_DEVICE_ID',
      message: 'Device ID header is required',
      timestamp: new Date().toISOString(),
    });
  }

  if (!platform) {
    return reply.code(400).send({
      success: false,
      error: 'MISSING_PLATFORM',
      message: 'Platform header is required',
      timestamp: new Date().toISOString(),
    });
  }

  // Validate device ID format
  if (deviceId.length < 10 || deviceId.length > 100) {
    return reply.code(400).send({
      success: false,
      error: 'INVALID_DEVICE_ID',
      message: 'Device ID must be between 10 and 100 characters',
      timestamp: new Date().toISOString(),
    });
  }

  // Validate platform
  const validPlatforms = ['iOS', 'Android', 'Web'];
  if (!validPlatforms.includes(platform)) {
    return reply.code(400).send({
      success: false,
      error: 'INVALID_PLATFORM',
      message: `Platform must be one of: ${validPlatforms.join(', ')}`,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Rate limiting by user middleware
 */
export function rateLimitByUser(maxRequests: number, windowMs: number) {
  const userRequests = new Map<string, { count: number; resetTime: number }>();
  
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      return; // Skip rate limiting for unauthenticated requests
    }

    const userId = request.user.sub;
    const now = Date.now();
    const userLimit = userRequests.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or create new limit
      userRequests.set(userId, {
        count: 1,
        resetTime: now + windowMs,
      });
      return;
    }

    if (userLimit.count >= maxRequests) {
      const retryAfter = Math.ceil((userLimit.resetTime - now) / 1000);
      
      logSecurity('user_rate_limit_exceeded', 'low', {
        userId,
        endpoint: request.url,
        method: request.method,
        count: userLimit.count,
        limit: maxRequests,
      });
      
      return reply.code(429).send({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this user',
        retryAfter,
        timestamp: new Date().toISOString(),
      });
    }

    userLimit.count++;
  };
}

// Register middleware with Fastify
export default async function authPlugin(fastify: any) {
  fastify.decorate('authenticate', authenticate);
  fastify.decorate('requireAdmin', requireAdmin);
  fastify.decorate('requireSuperAdmin', requireSuperAdmin);
  fastify.decorate('optionalAuth', optionalAuth);
  fastify.decorate('requireRole', requireRole);
  fastify.decorate('validateDevice', validateDevice);
  fastify.decorate('rateLimitByUser', rateLimitByUser);
}
