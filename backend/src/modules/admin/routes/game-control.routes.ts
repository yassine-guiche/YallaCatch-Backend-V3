import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { z } from 'zod';
import { redisClient } from '@/config/redis';
import { User } from '@/models/User';
import { Session } from '@/models/Session';
import { Claim } from '@/models/Claim';
import { Prize } from '@/models/Prize';
import { Settings } from '@/models/Settings';
import { typedLogger } from '@/lib/typed-logger';
import { audit } from '@/lib/audit-logger';

type AdminRequest<P = Record<string, unknown>, B = unknown, Q = unknown> = FastifyRequest<{
  Params: P;
  Body: B;
  Querystring: Q;
}>;

/**
 * Game Control Routes
 * Admin endpoints for monitoring and controlling game sessions
 */
export default async function gameControlRoutes(fastify: FastifyInstance) {
  // ==================== ACTIVE SESSIONS ====================

  // Get active game sessions
  fastify.get('/game/sessions/active', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<{}, {}, { page?: string; limit?: string; userId?: string; city?: string }>, reply) => {
    try {
      const page = parseInt(request.query.page || '1');
      const limit = parseInt(request.query.limit || '20');
      const skip = (page - 1) * limit;

      // Get active sessions from Redis
      const sessionKeys = await redisClient.keys('session:game_session_*');
      const sessions: { userId: string; status: string; user?: { displayName: string; email?: string; level?: number } }[] = [];

      for (const key of sessionKeys) {
        const sessionData = await redisClient.get(key);
        if (sessionData) {
          const session = JSON.parse(sessionData);
          if (session.status === 'active') {
            // Filter by userId if provided
            if (request.query.userId && session.userId !== request.query.userId) continue;
            
            // Get user info
            const user = await User.findById(session.userId).select('displayName email level').lean();
            sessions.push({
              ...session,
              user: user || { displayName: 'Unknown' }
            });
          }
        }
      }

      // Paginate
      const total = sessions.length;
      const paginatedSessions = sessions.slice(skip, skip + limit);

      reply.send({
        success: true,
        data: {
          sessions: paginatedSessions,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Force end a game session (Kill Switch)
  fastify.delete('/game/sessions/:sessionId', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<{ sessionId: string }>, reply) => {
    try {
      const { sessionId } = request.params;
      const { GameService } = await import('../../game/index');

      // Check if session exists in Redis
      const sessionKey = `session:${sessionId}`;
      const sessionData = await redisClient.get(sessionKey);
      
      if (!sessionData) {
        return reply.code(404).send({ success: false, error: 'Session not found or already ended' });
      }

      const session = JSON.parse(sessionData);
      
      // Force end the session using GameService
      try {
        await GameService.endGameSession(session.userId, sessionId);
      } catch (err) {
        // Even if GameService fails (e.g. logic error), force delete from Redis to kill it
        await redisClient.del(sessionKey);
      }
      
      // Log this admin action
      await audit.custom(
        (request.user as { sub: string }).sub,
        'FORCE_END_SESSION',
        'session',
        sessionId,
        { userId: session.userId, ip: request.ip }
      );

      return reply.send({ success: true, message: 'Session terminated successfully' });
    } catch (error) {
      return reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Get session history from database
  fastify.get('/game/sessions/history', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<{}, {}, { page?: string; limit?: string; userId?: string; startDate?: string; endDate?: string }>, reply) => {
    try {
      const page = parseInt(request.query.page || '1');
      const limit = parseInt(request.query.limit || '20');
      const skip = (page - 1) * limit;

      const query: Record<string, unknown> = {};
      if (request.query.userId) query.userId = request.query.userId;
      if (request.query.startDate || request.query.endDate) {
        query.startTime = {} as Record<string, Date>;
        if (request.query.startDate) (query.startTime as Record<string, Date>).$gte = new Date(request.query.startDate);
        if (request.query.endDate) (query.startTime as Record<string, Date>).$lte = new Date(request.query.endDate);
      }

      const [sessions, total] = await Promise.all([
        Session.find(query)
          .populate('userId', 'displayName email level')
          .sort({ startTime: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Session.countDocuments(query)
      ]);

      reply.send({
        success: true,
        data: {
          sessions,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Get session details
  fastify.get('/game/sessions/:sessionId', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<{ sessionId: string }>, reply) => {
    try {
      // Try Redis first (active sessions)
      const redisSession = await redisClient.get(`session:${request.params.sessionId}`);
      if (redisSession) {
        const session = JSON.parse(redisSession);
        const user = await User.findById(session.userId).select('displayName email level points').lean();
        return reply.send({
          success: true,
          data: { ...session, user, source: 'active' }
        });
      }

      // Try database (completed sessions)
      const dbSession = await Session.findOne({ sessionId: request.params.sessionId })
        .populate('userId', 'displayName email level points')
        .lean();

      if (!dbSession) {
        return reply.code(404).send({ success: false, error: 'Session not found' });
      }

      return reply.send({
        success: true,
        data: { ...dbSession, source: 'history' }
      });
    } catch (error) {
      return reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Force terminate session
  fastify.post('/game/sessions/:sessionId/terminate', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: AdminRequest<{ sessionId: string }, { reason?: string }>, reply) => {
    try {
      const sessionKey = `session:${request.params.sessionId}`;
      const sessionData = await redisClient.get(sessionKey);

      if (!sessionData) {
        return reply.code(404).send({ success: false, error: 'Active session not found' });
      }

      const session = JSON.parse(sessionData);
      session.status = 'terminated';
      session.terminatedAt = new Date().toISOString();
      session.terminatedBy = request.user.sub;
      session.terminationReason = request.body.reason || 'Admin termination';

      // Update in Redis (keep for logging)
      await redisClient.setex(sessionKey, 86400, JSON.stringify(session));

      // Audit log
      await audit.custom({
        userId: request.user.sub,
        userRole: 'admin',
        action: 'TERMINATE_SESSION',
        resource: 'game_session',
        resourceId: request.params.sessionId,
        category: 'admin',
        severity: 'medium',
        description: `Terminated game session: ${request.body.reason || 'Admin termination'}`,
        metadata: { sessionId: request.params.sessionId, userId: session.userId, reason: request.body.reason },
      });

      typedLogger.warn('Game session terminated by admin', {
        sessionId: request.params.sessionId,
        adminId: request.user.sub,
        reason: request.body.reason
      });

      return reply.send({
        success: true,
        message: 'Session terminated successfully',
        data: session
      });
    } catch (error) {
      return reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ==================== LEADERBOARDS ====================

  // Get leaderboard
  fastify.get('/game/leaderboard', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<{}, {}, { type?: string; limit?: string; city?: string }>, reply) => {
    try {
      const type = request.query.type || 'points';
      const limit = parseInt(request.query.limit || '50');

      let sortField = 'points.total';
      switch (type) {
        case 'claims': sortField = 'stats.prizesFound'; break;
        case 'distance': sortField = 'stats.totalPlayTime'; break;
        case 'level': sortField = 'level'; break;
        default: sortField = 'points.total';
      }

      const query: Record<string, unknown> = { isBanned: false };
      if (request.query.city) {
        query['location.city'] = request.query.city;
      }

      const users = await User.find(query)
        .select('displayName email level points stats avatar location')
        .sort({ [sortField]: -1 })
        .limit(limit)
        .lean();

      const leaderboard = users.map((user, index) => ({
        rank: index + 1,
        userId: user._id,
        displayName: user.displayName,
        email: user.email,
        level: user.level,
        points: user.points,
        stats: user.stats,
        city: user.location?.city
      }));

      reply.send({
        success: true,
        data: { leaderboard, type }
      });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Reset leaderboard (clear points for specific type)
  fastify.post('/game/leaderboard/reset', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: AdminRequest<{}, { type: string; scope?: string; confirm?: boolean }>, reply) => {
    try {
      if (!request.body.confirm) {
        return reply.code(400).send({
          success: false,
          error: 'Please confirm this action by setting confirm: true'
        });
      }

      const { type, scope } = request.body;
      const query: Record<string, unknown> = {};
      if (scope && scope !== 'global') {
        query['location.city'] = scope;
      }

      let updateField = {};
      switch (type) {
        case 'points':
          updateField = { 'points.available': 0, 'points.total': 0 };
          break;
        case 'claims':
          updateField = { 'stats.prizesFound': 0 };
          break;
        case 'distance':
          updateField = { 'stats.totalPlayTime': 0 };
          break;
        default:
          return reply.code(400).send({ success: false, error: 'Invalid leaderboard type' });
      }

      const result = await User.updateMany(query, { $set: updateField });

      // Audit log - this is a critical action
      await audit.custom({
        userId: request.user.sub,
        userRole: 'admin',
        action: 'RESET_LEADERBOARD',
        resource: 'leaderboard',
        category: 'admin',
        severity: 'high',
        description: `Reset ${type} leaderboard${scope && scope !== 'global' ? ` for ${scope}` : ''}`,
        metadata: { type, scope, affected: result.modifiedCount },
      });

      typedLogger.warn('Leaderboard reset by admin', {
        adminId: request.user.sub,
        type,
        scope,
        affected: result.modifiedCount
      });

      return reply.send({
        success: true,
        message: `Leaderboard reset successfully`,
        data: { affected: result.modifiedCount }
      });
    } catch (error) {
      return reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ==================== DAILY CHALLENGES ====================

  // Get challenge templates
  fastify.get('/game/challenges', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const settings = await Settings.findOne();
      const challenges = settings?.custom?.dailyChallenges || [
        { id: 'daily_claims', title: 'Prize Hunter', description: 'Claim 5 prizes', type: 'claims', target: 5, reward: 100 },
        { id: 'distance_walker', title: 'Explorer', description: 'Walk 2km', type: 'distance', target: 2000, reward: 75 },
        { id: 'category_variety', title: 'Variety Seeker', description: 'Claim from 3 categories', type: 'categories', target: 3, reward: 50 }
      ];

      reply.send({ success: true, data: { challenges } });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Update challenge template
  fastify.post('/game/challenges', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: AdminRequest<{}, { id: string; title: string; description: string; type: string; target: number; reward: number }>, reply) => {
    try {
      const challengeData = request.body;

      await Settings.findOneAndUpdate(
        {},
        {
          $set: {
            [`custom.dailyChallenges`]: challengeData
          }
        },
        { upsert: true }
      );

      // Audit log
      await audit.custom({
        userId: request.user.sub,
        userRole: 'admin',
        action: 'UPDATE_CHALLENGES',
        resource: 'challenge',
        category: 'admin',
        severity: 'low',
        metadata: challengeData,
      });

      reply.send({ success: true, message: 'Challenge updated', data: challengeData });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Delete challenge
  fastify.delete('/game/challenges/:challengeId', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: AdminRequest<{ challengeId: string }>, reply) => {
    try {
      await Settings.findOneAndUpdate(
        {},
        {
          $pull: {
            'custom.dailyChallenges': { id: request.params.challengeId }
          }
        }
      );

      // Audit log
      await audit.custom({
        userId: request.user.sub,
        userRole: 'admin',
        action: 'DELETE_CHALLENGE',
        resource: 'challenge',
        resourceId: request.params.challengeId,
        category: 'admin',
        severity: 'low',
        metadata: { challengeId: request.params.challengeId },
      });

      reply.send({ success: true, message: 'Challenge deleted' });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ==================== MAINTENANCE MODE ====================

  // Get maintenance status
  fastify.get('/maintenance/status', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const maintenanceData = await redisClient.get('system:maintenance');
      if (maintenanceData) {
        reply.send({ success: true, data: JSON.parse(maintenanceData) });
      } else {
        reply.send({ success: true, data: { active: false, message: null } });
      }
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
}
