import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate } from '@/middleware/auth';
import { authRateLimit } from '@/middleware/distributed-rate-limit';
import { AuthService } from './auth.service';
import { AuthExtendedService, UserExtendedService } from './auth-extended';
import { AdminPartnersService } from '@/modules/admin/services/admin-partners.service';
import { UsersService, updateProfileSchema } from '@/modules/users/index';
import { User } from '@/models/User';
import { Partner } from '@/models/Partner';
import { normalizeError } from '@/utils/api-errors';
import { typedLogger } from '@/lib/typed-logger';
import {
  partnerLoginSchema,
  partnerRegisterSchema,
  guestLoginSchema,
  emailRegisterSchema,
  emailLoginSchema,
  refreshTokenSchema,
  logoutSchema
} from './auth.schema';

/**
 * Auth routes
 */
export default async function authRoutes(fastify: FastifyInstance) {
  // Partner login endpoint
  fastify.post<{ Body: z.infer<typeof partnerLoginSchema> }>('/partner-login', {
    preHandler: [authRateLimit]
  }, async (request, reply) => {
    try {
      const result = await AuthService.partnerLogin(request.body, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const email = request.body?.email;
      typedLogger.error('Partner login failed', { error, email });
      const normalized = normalizeError(error, 'Partner login failed');
      const code = normalized.code as string;
      let statusCode = 401;
      if (code === 'ACCOUNT_BANNED') statusCode = 403;
      if (code === 'NOT_A_PARTNER') statusCode = 403;
      reply.code(statusCode).send({
        success: false,
        error: code || 'PARTNER_LOGIN_FAILED',
        message: normalized.message || (error instanceof Error ? error.message : 'Partner login failed'),
        debug: {
          rawMessage: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  // Partner registration endpoint (public)
  fastify.post<{ Body: z.infer<typeof partnerRegisterSchema> }>('/partner-register', async (request, reply) => {
    try {
      const result = await AdminPartnersService.registerPartner(request.body as any);
      reply.status(201).send({
        success: true,
        data: result,
        message: 'REGISTRATION_SUCCESS_PENDING_APPROVAL',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      typedLogger.error('Partner registration failed', { error, data: request.body });
      const normalized = normalizeError(error, 'Partner registration failed');
      reply.code(400).send({
        success: false,
        error: normalized.code || 'REGISTRATION_FAILED',
        message: normalized.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // TEMP: partner debug helper (remove in production). Allows inspecting user/partner linkage for a given email.
  fastify.get<{ Querystring: { email?: string } }>('/partner-debug', {
    preHandler: [authRateLimit],
  }, async (request, reply) => {
    const email = (request.query.email || '').toString().trim().toLowerCase();
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
          contactEmail: partner.contactEmail,
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
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await UsersService.getProfile(request.user.sub);
      reply.header('Deprecation', 'true');
      reply.header('Link', '</api/v1/users/profile>; rel="successor-version"');
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      reply.code(404).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Guest login
  fastify.post<{ Body: z.infer<typeof guestLoginSchema> }>('/guest', {
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
                sessionId: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await AuthService.guestLogin(request.body, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const normalized = normalizeError(error, 'Guest login failed');
      reply.code(400).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Email registration
  fastify.post<{ Body: z.infer<typeof emailRegisterSchema> }>('/register', {
    preHandler: [authRateLimit]
  }, async (request, reply) => {
    try {
      const result = await AuthService.emailRegister(request.body, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const normalized = normalizeError(error, 'Registration failed');
      const statusCode = normalized.code === 'EMAIL_ALREADY_EXISTS' ? 409 : 400;

      reply.code(statusCode).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Email login
  fastify.post<{ Body: z.infer<typeof emailLoginSchema> }>('/login', {
    preHandler: [authRateLimit]
  }, async (request, reply) => {
    try {
      const result = await AuthService.emailLogin(request.body, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const normalized = normalizeError(error, 'Login failed');
      const statusCode = normalized.code === 'ACCOUNT_BANNED' ? 403 : 401;

      reply.code(statusCode).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Refresh token
  fastify.post<{ Body: z.infer<typeof refreshTokenSchema> }>('/refresh', {
  }, async (request, reply) => {
    try {
      const result = await AuthService.refreshToken(request.body);

      // Best-effort: update lastIp/lastUserAgent using refresh token payload
      try {
        const { decodeToken } = await import('@/lib/jwt');
        const refreshToken = request.body.refreshToken;
        if (refreshToken) {
          const decoded = decodeToken(refreshToken);
          if (decoded?.sub) {
            await User.findByIdAndUpdate(decoded.sub, {
              $set: {
                lastIp: request.ip,
                lastUserAgent: request.headers['user-agent'],
              },
            });
          }
        }
      } catch { /* best effort */ }

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const normalized = normalizeError(error, 'Token refresh failed');
      reply.code(401).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Logout
  fastify.post<{ Body: z.infer<typeof logoutSchema> }>('/logout', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      if (!request.user) {
        throw new Error('UNAUTHORIZED');
      }
      const result = await AuthService.logout(request.user.sub, request.body);

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const normalized = normalizeError(error, 'Logout failed');
      reply.code(400).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get profile (deprecated — use /api/v1/users/profile)
  fastify.get('/profile', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await UsersService.getProfile(request.user.sub);
      reply.header('Deprecation', 'true');
      reply.header('Link', '</api/v1/users/profile>; rel="successor-version"');

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      reply.code(404).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Update profile (deprecated — use /api/v1/users/profile [PATCH])
  fastify.patch<{ Body: z.infer<typeof updateProfileSchema> }>('/profile', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      if (!request.user) {
        throw new Error('UNAUTHORIZED');
      }
      const result = await UsersService.updateProfile(
        request.user.sub,
        request.body
      );
      reply.header('Deprecation', 'true');
      reply.header('Link', '</api/v1/users/profile>; rel="successor-version"');

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      reply.code(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
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
      reply.code(400).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
      reply.code(400).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
      reply.code(400).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
      reply.code(400).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
      reply.code(400).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
      reply.code(400).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get user stats
  fastify.get('/stats', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await UserExtendedService.getUserStats(request.user.sub);
      reply.header('Deprecation', 'true');
      reply.header('Link', '</api/v1/users/stats>; rel="successor-version"');
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
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
      reply.code(400).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get achievements
  fastify.get('/achievements', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await UserExtendedService.getUserAchievements(request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
