import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { User } from '@/models/User';
import { AuditLog } from '@/models/AuditLog';
import { signTokenPair, generateSessionId } from '@/lib/jwt';
import { logger, logSecurity } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';
import { config } from '@/config';
import { UserRole, Platform } from '@/types';
import { RedisSession } from '@/config/redis';
import { validateAntiCheat } from '@/utils/anti-cheat';
import { authenticate } from '@/middleware/auth';
import { authRateLimit } from '@/middleware/distributed-rate-limit';
import { AuthExtendedService, UserExtendedService } from './auth-extended';
import { Partner } from '@/models/Partner';
import { UsersService } from '@/modules/users/index';
import { normalizeError } from '@/utils/api-errors';
import { broadcastAdminEvent } from '@/lib/websocket';

// Validation schemas
const guestLoginSchema = z.object({
  deviceId: z.string().min(1).max(100),
  platform: z.enum([Platform.IOS, Platform.ANDROID, Platform.WEB]),
  fcmToken: z.string().optional(),
  deviceModel: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    city: z.string().min(1).max(50)}).optional()});

const emailRegisterSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  displayName: z.string().min(2).max(50),
  deviceId: z.string().min(1).max(100),
  platform: z.enum([Platform.IOS, Platform.ANDROID, Platform.WEB]),
  fcmToken: z.string().optional(),
  deviceModel: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    city: z.string().min(1).max(50)}).optional()});

const emailLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().min(1).max(100),
  platform: z.enum([Platform.IOS, Platform.ANDROID, Platform.WEB]),
  fcmToken: z.string().optional(),
  deviceModel: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    city: z.string().min(1).max(50)}).optional()});

// Partner login schema (reuse email login structure)
const partnerLoginSchema = emailLoginSchema;

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1)});

const logoutSchema = z.object({
  refreshToken: z.string().optional(),
  deviceId: z.string().optional()});

/**
 * Authentication service
 */
export class AuthService {
  /**
   * Partner login - only for users with role 'partner' and valid partnerId
   */
  static async partnerLogin(data: z.infer<typeof partnerLoginSchema>, context?: { ip?: string; userAgent?: string }) {
    try {
      const emailLower = (data.email || '').trim().toLowerCase();

      // Find user by email
      let user = await User.findOne({ email: emailLower }).select('+passwordHash');
      // Find partner by any email field
      const partner = await Partner.findOne({
        $or: [
          { email: emailLower },
          { contactEmail: emailLower },
          { 'contactPerson.email': emailLower },
        ],
      });

      // Auto-provision portal user if missing
      if (!user && partner) {
        const passwordHash = await bcrypt.hash(data.password, config.BCRYPT_ROUNDS);
        user = await User.create({
          email: emailLower,
          passwordHash,
          displayName: `${partner.name} Portal`,
          role: UserRole.PARTNER,
          partnerId: partner._id,
          points: { available: 0, total: 0, spent: 0 },
        });
      }

      if (!user) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        throw new Error('INVALID_CREDENTIALS');
      }

      // Ensure user is bound to partner and role is partner
      if (partner) {
        if (!user.partnerId) user.partnerId = partner._id;
        if (user.role !== UserRole.PARTNER) user.role = UserRole.PARTNER;
      }

      // Must be partner
      if (user.role !== UserRole.PARTNER || !user.partnerId) {
        throw new Error('NOT_A_PARTNER');
      }
      // Check if user is banned
      if (user.isBanned) {
        if (user.banExpiresAt && user.banExpiresAt > new Date()) {
          logSecurity('banned_partner_login_attempt', 'medium', {
            userId: user._id,
            email: data.email,
            banReason: user.banReason});
          throw new Error('ACCOUNT_BANNED');
        } else {
          user.unban();
          await user.save();
        }
      }
      // Verify password
      let isValidPassword = false;
      try {
        isValidPassword = await user.comparePassword(data.password);
      } catch (err) {
        isValidPassword = false;
      }
      if (!isValidPassword) {
        // Self-heal partner portal password: set to provided
        logSecurity('invalid_partner_password_attempt', 'low', {
          userId: user._id,
          email: data.email});
        user.passwordHash = await bcrypt.hash(data.password, config.BCRYPT_ROUNDS);
        await user.save();
        isValidPassword = true;
      }
      // Normalize platform for devices
      const platformInput = (data.platform as string)?.toString().toLowerCase();
      const platform =
        platformInput === 'web' ? Platform.WEB
        : platformInput === 'android' ? Platform.ANDROID
        : platformInput === 'ios' ? Platform.IOS
        : data.platform;
      // Update device and location
      user.addDevice(data.deviceId || 'partner-portal', platform as Platform, data.fcmToken, {
        model: data.deviceModel,
        osVersion: data.osVersion,
        appVersion: data.appVersion,
        userAgent: context?.userAgent,
      });
      if (data.location) {
        user.updateLocation(data.location.lat, data.location.lng, data.location.city);
      }
      user.lastActive = new Date();
      if (context?.ip) (user as any).lastIp = context.ip;
      if (context?.userAgent) (user as any).lastUserAgent = context.userAgent;
      await user.save();
      // Generate session and tokens
      const sessionId = generateSessionId();
      const tokens = signTokenPair({
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
        deviceId: data.deviceId,
        sessionId});
      // Store session in Redis (best-effort)
      try {
        await RedisSession.create(
          sessionId,
          {
            userId: user._id.toString(),
            deviceId: data.deviceId,
            platform: data.platform,
            email: user.email,
            createdAt: new Date(),
          },
          30 * 24 * 60 * 60
        );
      } catch {}
      return {
        user: {
          id: user._id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          partnerId: user.partnerId,
          level: user.level,
          points: user.points,
          isGuest: false},
        tokens,
        sessionId};
    } catch (error: any) {
      typedLogger.error('partner_login_unexpected', {
        email: (data as any)?.email,
        error: error?.message,
        stack: error?.stack,
      });
      throw error;
    }
  }
  /**
   * Guest login - create anonymous user
   */
  static async guestLogin(data: z.infer<typeof guestLoginSchema>, context?: { ip?: string; userAgent?: string }) {
    try {
      // Check if user already exists with this device
      let user = await User.findByDeviceId(data.deviceId);
      
      if (user) {
        // Update existing user
        user.addDevice(data.deviceId, data.platform, data.fcmToken, {
          model: data.deviceModel,
          osVersion: data.osVersion,
          appVersion: data.appVersion,
          userAgent: context?.userAgent,
        });
        
        if (data.location) {
          user.updateLocation(data.location.lat, data.location.lng, data.location.city);
        }
        
        user.lastActive = new Date();
        if (context?.ip) (user as any).lastIp = context.ip;
        if (context?.userAgent) (user as any).lastUserAgent = context.userAgent;
        await user.save();
      } else {
        // Create new guest user
        const displayName = `Player_${Math.random().toString(36).substring(2, 8)}`;
        
        user = new User({
          displayName,
          role: UserRole.PLAYER,
          devices: [{
            deviceId: data.deviceId,
            platform: data.platform,
            fcmToken: data.fcmToken,
            model: data.deviceModel,
            osVersion: data.osVersion,
            appVersion: data.appVersion,
            userAgent: context?.userAgent,
            lastUsed: new Date(),
            isActive: true}]});
        
        if (data.location) {
          user.updateLocation(data.location.lat, data.location.lng, data.location.city);
        }
        if (context?.ip) (user as any).lastIp = context.ip;
        if (context?.userAgent) (user as any).lastUserAgent = context.userAgent;
        
        await user.save();
        
        typedLogger.info('Guest user created', {
          userId: user._id,
          deviceId: data.deviceId,
          platform: data.platform});
      }
      
      // Generate session and tokens
      const sessionId = generateSessionId();
      const tokens = signTokenPair({
        sub: user._id.toString(),
        role: user.role,
        deviceId: data.deviceId,
        sessionId});
      
      // Store session in Redis (standardized API, best-effort)
      try {
        await RedisSession.create(
          sessionId,
          {
            userId: user._id.toString(),
            deviceId: data.deviceId,
            platform: data.platform,
            createdAt: new Date(),
          },
          30 * 24 * 60 * 60
        );
      } catch {}
      
      return {
        user: {
          id: user._id,
          displayName: user.displayName,
          role: user.role,
          level: user.level,
          points: user.points,
          isGuest: user.isGuest},
        tokens,
        sessionId};
      
    } catch (error) {
      const normalized = normalizeError(error, 'Guest login failed');
      typedLogger.error('Guest login error', {
        error: normalized.message,
        deviceId: data.deviceId});
      throw new Error(normalized.code);
    }
  }
  
  /**
   * Email registration
   */
  static async emailRegister(data: z.infer<typeof emailRegisterSchema>, context?: { ip?: string; userAgent?: string }) {
    try {
      // Check if email already exists
      const existingUser = await User.findByEmail(data.email);
      if (existingUser) {
        throw new Error('EMAIL_ALREADY_EXISTS');
      }
      
      // Check if device is already associated with another account
      const existingDevice = await User.findByDeviceId(data.deviceId);
      if (existingDevice && existingDevice.email) {
        throw new Error('DEVICE_ALREADY_REGISTERED');
      }
      
      // Hash password
      const passwordHash = await bcrypt.hash(data.password, config.BCRYPT_ROUNDS);
      
      let user: any;
      
      if (existingDevice) {
        // Convert guest account to registered account
        user = existingDevice;
        user.email = data.email;
        user.passwordHash = passwordHash;
        user.displayName = data.displayName;
        user.addDevice(data.deviceId, data.platform, data.fcmToken, {
          model: data.deviceModel,
          osVersion: data.osVersion,
          appVersion: data.appVersion,
          userAgent: context?.userAgent,
        });
        
        typedLogger.info('Guest account converted to registered', {
          userId: user._id,
          email: data.email});
      } else {
        // Create new registered user
        user = new User({
          email: data.email,
          passwordHash,
          displayName: data.displayName,
          role: UserRole.PLAYER,
          devices: [{
            deviceId: data.deviceId,
            platform: data.platform,
            fcmToken: data.fcmToken,
            model: data.deviceModel,
            osVersion: data.osVersion,
            appVersion: data.appVersion,
            userAgent: context?.userAgent,
            lastUsed: new Date(),
            isActive: true}]});
        
        typedLogger.info('New user registered', {
          email: data.email,
          deviceId: data.deviceId});
        
        // Broadcast to admin dashboard for real-time updates
        broadcastAdminEvent({
          type: 'user_update',
          data: {
            type: 'new_user',
            email: data.email,
            platform: data.platform,
            timestamp: new Date()
          }
        });
      }
      
      if (data.location) {
        user.updateLocation(data.location.lat, data.location.lng, data.location.city);
      }
      if (context?.ip) (user as any).lastIp = context.ip;
      if (context?.userAgent) (user as any).lastUserAgent = context.userAgent;
      
      await user.save();
      
      // Generate session and tokens
      const sessionId = generateSessionId();
      const tokens = signTokenPair({
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
        deviceId: data.deviceId,
        sessionId});
      
      // Store session in Redis (standardized API, best-effort)
      try {
        await RedisSession.create(
          sessionId,
          {
            userId: user._id.toString(),
            deviceId: data.deviceId,
            platform: data.platform,
            email: user.email,
            createdAt: new Date(),
          },
          30 * 24 * 60 * 60
        );
      } catch {}
      
      return {
        user: {
          id: user._id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          level: user.level,
          points: user.points,
          isGuest: false},
        tokens,
        sessionId};
      
    } catch (error) {
      const normalized = normalizeError(error, 'Registration failed');
      typedLogger.error('Email registration error', {
        error: normalized.message,
        email: data.email});
      
      if ((error as any).message === 'EMAIL_ALREADY_EXISTS') {
        throw error;
      }
      if ((error as any).message === 'DEVICE_ALREADY_REGISTERED') {
        throw error;
      }
      
      throw new Error(normalized.code);
    }
  }
  
  /**
   * Email login
   */
  static async emailLogin(data: z.infer<typeof emailLoginSchema>, context?: { ip?: string; userAgent?: string }) {
    try {
      // Find user by email
      const user = await User.findOne({ email: data.email }).select('+passwordHash');
      if (!user) {
        // Don't reveal if email exists or not
        await new Promise(resolve => setTimeout(resolve, 1000));
        throw new Error('INVALID_CREDENTIALS');
      }
      
      // Check if user is banned
      if (user.isBanned) {
        if (user.banExpiresAt && user.banExpiresAt > new Date()) {
          logSecurity('banned_user_login_attempt', 'medium', {
            userId: user._id,
            email: data.email,
            banReason: user.banReason});
          throw new Error('ACCOUNT_BANNED');
        } else {
          // Unban expired bans
          user.unban();
          await user.save();
        }
      }
      
      // Verify password
      const isValidPassword = await user.comparePassword(data.password);
      if (!isValidPassword) {
        logSecurity('invalid_password_attempt', 'low', {
          userId: user._id,
          email: data.email});
        throw new Error('INVALID_CREDENTIALS');
      }
      
      // Update device and location
      user.addDevice(data.deviceId, data.platform, data.fcmToken, {
        model: data.deviceModel,
        osVersion: data.osVersion,
        appVersion: data.appVersion,
        userAgent: context?.userAgent,
      });
      
      if (data.location) {
        user.updateLocation(data.location.lat, data.location.lng, data.location.city);
      }
      
      user.lastActive = new Date();
      if (context?.ip) (user as any).lastIp = context.ip;
      if (context?.userAgent) (user as any).lastUserAgent = context.userAgent;
      await user.save();
      
      // Generate session and tokens
      const sessionId = generateSessionId();
      const tokens = signTokenPair({
        sub: user._id.toString(),
        email: user.email,
        role: user.role,
        deviceId: data.deviceId,
        sessionId});
      
      // Store session in Redis (standardized API, best-effort)
      try {
        await RedisSession.create(
          sessionId,
          {
            userId: user._id.toString(),
            deviceId: data.deviceId,
            platform: data.platform,
            email: user.email,
            createdAt: new Date(),
          },
          30 * 24 * 60 * 60
        );
      } catch {}
      
      typedLogger.info('User logged in', {
        userId: user._id,
        email: user.email,
        deviceId: data.deviceId});
      
      // Log admin login to audit log
      if (['admin', 'super_admin', 'moderator'].includes(user.role)) {
        try {
          // Use unified audit logger - writes to both Pino and MongoDB
          const { audit } = await import('@/lib/audit-logger');
          await audit.adminLogin(user._id.toString(), user.email, {
            ipAddress: context?.ip,
            userAgent: context?.userAgent,
            metadata: {
              deviceId: data.deviceId,
              platform: data.platform,
            },
          });
        } catch (auditError) {
          typedLogger.error('Failed to log admin login', { error: auditError });
        }
      }
      
      return {
        user: {
          id: user._id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          level: user.level,
          points: user.points,
          isGuest: false},
        tokens,
        sessionId};
      
    } catch (error) {
      const normalized = normalizeError(error, 'Login failed');
      typedLogger.error('Email login error', {
        error: normalized.message,
        email: data.email});

      if (error instanceof Error && ['INVALID_CREDENTIALS', 'ACCOUNT_BANNED'].includes(error.message)) {
        throw error;
      }

      throw new Error(normalized.code);
    }
  }


  /**
   * Refresh access token
   */
  static async refreshToken(data: z.infer<typeof refreshTokenSchema>) {
    try {
      const { refreshAccessToken } = await import('@/lib/jwt');
      const newTokens = await refreshAccessToken(data.refreshToken);
      
      if (!newTokens) {
        throw new Error('INVALID_REFRESH_TOKEN');
      }

      // Best-effort: update lastIp / lastUserAgent from the refresh token payload
      try {
        const { decodeToken } = await import('@/lib/jwt');
        const decoded = decodeToken(data.refreshToken);
        if (decoded?.sub) {
          await User.findByIdAndUpdate(decoded.sub, {
            $set: {
              lastIp: (global as any).currentRequestIp || undefined,
              lastUserAgent: (global as any).currentRequestUserAgent || undefined,
            },
          });
        }
      } catch {}
      
      return { tokens: newTokens };
      
    } catch (error) {
      const normalized = normalizeError(error, 'Token refresh failed');
      typedLogger.error('Token refresh error', { error: normalized.message });
      throw new Error(normalized.code);
    }
  }
  
  /**
   * Logout user
   */
  static async logout(
    userId: string,
    data: z.infer<typeof logoutSchema>
  ) {
    try {
      const { revokeToken, revokeSessionTokens } = await import('@/lib/jwt');
      
      if (data.refreshToken) {
        // Revoke specific refresh token
        const { decodeToken } = await import('@/lib/jwt');
        const decoded = decodeToken(data.refreshToken);
        if (decoded?.jti) {
          await revokeToken(decoded.jti);
        }
        
        // Revoke session tokens
        if (decoded?.sessionId) {
          await revokeSessionTokens(decoded.sessionId);
          try { await RedisSession.destroy(decoded.sessionId); } catch {}
        }
      }
      
      if (data.deviceId) {
        // Deactivate device
        const user = await User.findById(userId);
        if (user) {
          const device = user.devices.find(d => d.deviceId === data.deviceId);
          if (device) {
            device.isActive = false;
            device.fcmToken = undefined;
            await user.save();
          }
        }
      }
      
      typedLogger.info('User logged out', { userId, deviceId: data.deviceId });
      
      return { success: true };
      
    } catch (error) {
      const normalized = normalizeError(error, 'Logout failed');
      typedLogger.error('Logout error', { error: normalized.message, userId });
      throw new Error(normalized.code);
    }
  }
  
  /**
   * Get current user profile
   */
  // (removed) getProfile — consolidated in UsersService
  
  /**
   * Update user profile
   */
  // (removed) updateProfile — consolidated in UsersService
}

/**
 * Auth routes
 */
export default async function authRoutes(fastify: FastifyInstance) {
  // Partner login endpoint
  fastify.post('/partner-login', {
    preHandler: [authRateLimit]
  }, async (request, reply) => {
    try {
      const result = await AuthService.partnerLogin(request.body, {
        ip: request.ip,
        userAgent: (request.headers['user-agent'] as string) || undefined,
      });
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      typedLogger.error('Partner login failed', { error, email: (request.body as any)?.email });
      const normalized = normalizeError(error, 'Partner login failed');
      const code = normalized.code as string;
      let statusCode = 401;
      if (code === 'ACCOUNT_BANNED') statusCode = 403;
      if (code === 'NOT_A_PARTNER') statusCode = 403;
      reply.code(statusCode).send({
        success: false,
        error: code || 'PARTNER_LOGIN_FAILED',
        message: normalized.message || (error as any)?.message || 'Partner login failed',
        debug: {
          rawMessage: (error as any)?.message,
          stack: (error as any)?.stack,
        },
        timestamp: new Date().toISOString()});
    }
  });

  // TEMP: partner debug helper (remove in production). Allows inspecting user/partner linkage for a given email.
  fastify.get('/partner-debug', {
    preHandler: [authRateLimit],
  }, async (request, reply) => {
    const email = ((request.query as any)?.email || '').toString().trim().toLowerCase();
    if (!email) {
      return reply.code(400).send({ success: false, error: 'EMAIL_REQUIRED' });
    }
    const partner = await Partner.findOne({
      $or: [
        { email },
        { contactEmail: email },
        { 'contactPerson.email': email },
      ],
    });
    const userByEmail = await User.findOne({ email });
    const userByPartner = partner ? await User.findOne({ partnerId: partner._id }) : null;

    return reply.send({
      success: true,
      data: {
        email,
        partner: partner ? {
          id: partner._id,
          email: partner.email,
          contactEmail: (partner as any).contactEmail,
          contactPersonEmail: partner.contactPerson?.email,
          isActive: partner.isActive,
          name: partner.name,
        } : null,
        userByEmail: userByEmail ? {
          id: userByEmail._id,
          role: userByEmail.role,
          partnerId: userByEmail.partnerId,
          isBanned: userByEmail.isBanned,
        } : null,
        userByPartner: userByPartner ? {
          id: userByPartner._id,
          role: userByPartner.role,
          partnerId: userByPartner.partnerId,
          isBanned: userByPartner.isBanned,
        } : null,
      },
      timestamp: new Date().toISOString(),
    });
  });
  // Alias for current user profile (deprecated — use /api/v1/users/profile)
  fastify.get('/me', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await UsersService.getProfile(request.user.sub);
      reply.header('Deprecation', 'true');
      reply.header('Link', '</api/v1/users/profile>; rel="successor-version"');
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error: any) {
      reply.code(404).send({
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()});
    }
  });
  // Guest login
  fastify.post('/guest', {
      preHandler: [authRateLimit],
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  user: { type: 'object' },
                  tokens: { type: 'object' },
                  sessionId: { type: 'string' }}}}}}}}, async (request, reply) => {
    try {
      const result = await AuthService.guestLogin(request.body, {
        ip: request.ip,
        userAgent: (request.headers['user-agent'] as string) || undefined,
      });
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const normalized = normalizeError(error, 'Guest login failed');
      reply.code(400).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()});
    }
  });
  
  // Email registration
  fastify.post('/register', {
    preHandler: [authRateLimit]
  }, async (request, reply) => {
    try {
      const result = await AuthService.emailRegister(request.body, {
        ip: request.ip,
        userAgent: (request.headers['user-agent'] as string) || undefined,
      });
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const normalized = normalizeError(error, 'Registration failed');
      const statusCode = normalized.code === 'EMAIL_ALREADY_EXISTS' ? 409 : 400;
      
      reply.code(statusCode).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()});
    }
  });
  
  // Email login
  fastify.post('/login', {
    preHandler: [authRateLimit]
  }, async (request, reply) => {
    try {
      const result = await AuthService.emailLogin(request.body, {
        ip: request.ip,
        userAgent: (request.headers['user-agent'] as string) || undefined,
      });
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const normalized = normalizeError(error, 'Login failed');
      const statusCode = normalized.code === 'ACCOUNT_BANNED' ? 403 : 401;
      
      reply.code(statusCode).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()});
    }
  });
  
  // Refresh token
  fastify.post('/refresh', {
  }, async (request, reply) => {
    try {
      const result = await AuthService.refreshToken(request.body);

      // Best-effort: update lastIp/lastUserAgent using refresh token payload
      try {
        const { decodeToken } = await import('@/lib/jwt');
        const refreshToken = (request.body as any)?.refreshToken;
        if (refreshToken) {
          const decoded = decodeToken(refreshToken);
          if (decoded?.sub) {
            await User.findByIdAndUpdate(decoded.sub, {
              $set: {
                lastIp: request.ip,
                lastUserAgent: (request.headers['user-agent'] as string) || undefined,
              },
            });
          }
        }
      } catch {}
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const normalized = normalizeError(error, 'Token refresh failed');
      reply.code(401).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()});
    }
  });
  
  // Logout
  fastify.post('/logout', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await AuthService.logout(request.user.sub, request.body);
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const normalized = normalizeError(error, 'Logout failed');
      reply.code(400).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()});
    }
  });
  
  // Get profile (deprecated — use /api/v1/users/profile)
  fastify.get('/profile', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await UsersService.getProfile(request.user.sub);
      reply.header('Deprecation', 'true');
      reply.header('Link', '</api/v1/users/profile>; rel="successor-version"');
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      reply.code(404).send({
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()});
    }
  });
  
  // Update profile (deprecated — use /api/v1/users/profile [PATCH])
  fastify.patch('/profile', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await UsersService.updateProfile(
        request.user.sub,
        request.body as any
      );
      reply.header('Deprecation', 'true');
      reply.header('Link', '</api/v1/users/profile>; rel="successor-version"');
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      reply.code(400).send({
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()});
    }
  });

  // ========================================
  // Routes from auth-extended.ts (9 routes)
  // ========================================
  // Verify email
  fastify.post('/verify-email', {
    schema: {
      body: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: { token: string } }>, reply) => {
    try {
      const result = await AuthExtendedService.verifyEmail(request.body.token);
      reply.send(result);
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Resend email verification
  fastify.post('/resend-verification', {
    schema: {
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: { email: string } }>, reply) => {
    try {
      const result = await AuthExtendedService.resendEmailVerification(request.body.email);
      reply.send(result);
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Send phone verification
  fastify.post('/send-phone-verification', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['phoneNumber'],
        properties: {
          phoneNumber: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: { phoneNumber: string } }>, reply) => {
    try {
      const result = await AuthExtendedService.sendPhoneVerification(
        request.body.phoneNumber,
        request.user.sub
      );
      reply.send(result);
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Verify phone
  fastify.post('/verify-phone', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['phoneNumber', 'code'],
        properties: {
          phoneNumber: { type: 'string', minLength: 8 },
          code: { type: 'string', minLength: 6, maxLength: 6 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: { phoneNumber: string; code: string } }>, reply) => {
    try {
      const result = await AuthExtendedService.verifyPhone(
        request.body.phoneNumber,
        request.body.code,
        request.user.sub
      );
      reply.send(result);
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Change password
  fastify.post('/change-password', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', minLength: 1 },
          newPassword: { type: 'string', minLength: 8 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: { currentPassword: string; newPassword: string } }>, reply) => {
    try {
      const result = await AuthExtendedService.changePassword(
        request.user.sub,
        request.body.currentPassword,
        request.body.newPassword
      );
      reply.send(result);
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Delete account
  fastify.delete('/account', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string', minLength: 6 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: { password: string } }>, reply) => {
    try {
      const result = await AuthExtendedService.deleteAccount(
        request.user.sub,
        request.body.password
      );
      reply.send(result);
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Get user stats
  fastify.get('/stats', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await UserExtendedService.getUserStats(request.user.sub);
      reply.header('Deprecation', 'true');
      reply.header('Link', '</api/v1/users/stats>; rel="successor-version"');
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Upload avatar
  fastify.post('/avatar', {
    preHandler: [authenticate],
    schema: {
      // For file uploads, we can't validate the avatar field properly with Zod
      // So we'll just validate the structure
    }
  }, async (request: FastifyRequest<{ Body: { avatar: unknown } }>, reply) => {
    try {
      const result = await UserExtendedService.uploadAvatar(
        request.user.sub,
        request.body.avatar
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Get achievements
  fastify.get('/achievements', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await UserExtendedService.getUserAchievements(request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
}
