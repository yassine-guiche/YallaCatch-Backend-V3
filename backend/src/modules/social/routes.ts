import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { userRateLimit } from '@/middleware/distributed-rate-limit';
import { normalizeError } from '@/utils/api-errors';
import { SocialService } from './social.service';
import {
  friendRequestSchema,
  respondFriendRequestSchema,
  teamCreateSchema,
  socialChallengeSchema,
} from './social.schema';
import {
  FriendRequestData,
  TeamCreateData,
  SocialChallengeData
} from './social.types';

export default async function socialRoutes(fastify: FastifyInstance) {
  const sendError = (reply: FastifyReply, error: unknown, fallback: string, status = 400) => {
    const normalized = normalizeError(error, fallback);
    reply.code(status).send({ success: false, error: normalized.code, message: normalized.message });
  };

  // Friend management
  fastify.post('/friends/request', {
    preHandler: [authenticate, userRateLimit],
    schema: { body: friendRequestSchema }
  }, async (request: FastifyRequest<{ Body: FriendRequestData }>, reply) => {
    try {
      const result = await SocialService.sendFriendRequest(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply, error, 'Friend request failed');
    }
  });

  fastify.post('/friends/respond', {
    preHandler: [authenticate, userRateLimit],
    schema: {
      body: respondFriendRequestSchema
    }
  }, async (request: FastifyRequest<{
    Body: { fromUserId: string; action: 'accept' | 'reject' };
  }>, reply: FastifyReply) => {
    try {
      const result = await SocialService.respondToFriendRequest(
        request.user.sub,
        request.body.fromUserId,
        request.body.action
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply, error, 'Friend response failed');
    }
  });

  fastify.get('/friends', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await SocialService.getFriends(request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply as FastifyReply, error, 'Get friends failed', 500);
    }
  });

  // Team management
  fastify.post('/teams', {
    preHandler: [authenticate, userRateLimit],
    schema: { body: teamCreateSchema }
  }, async (request: FastifyRequest<{ Body: TeamCreateData }>, reply) => {
    try {
      const result = await SocialService.createTeam(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply, error, 'Team creation failed');
    }
  });

  // Social challenges
  fastify.post('/challenges', {
    preHandler: [authenticate, userRateLimit],
    schema: { body: socialChallengeSchema }
  }, async (request: FastifyRequest<{ Body: SocialChallengeData }>, reply) => {
    try {
      const result = await SocialService.createSocialChallenge(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply, error, 'Challenge creation failed');
    }
  });

  // Leaderboard
  fastify.get('/leaderboard', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['global', 'city', 'friends'], default: 'global' },
          city: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: {
      type?: 'global' | 'city' | 'friends';
      city?: string;
      limit?: number;
      offset?: number;
    }
  }>, reply: FastifyReply) => {
    try {
      const result = await SocialService.getLeaderboard(
        request.user.sub,
        request.query.type,
        request.query.city,
        request.query.limit,
        request.query.offset
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Share capture
  fastify.post('/share', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['captureId', 'platform'],
        properties: {
          captureId: { type: 'string' },
          platform: {
            type: 'string',
            enum: ['facebook', 'instagram', 'twitter', 'whatsapp']
          },
          message: { type: 'string', maxLength: 500 }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: {
      captureId: string;
      platform: 'facebook' | 'instagram' | 'twitter' | 'whatsapp';
      message?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const result = await SocialService.shareCapture(
        request.user.sub,
        request.body.captureId,
        request.body.platform,
        request.body.message
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Get user profile
  fastify.get('/profile/:userId', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { userId: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await SocialService.getUserProfile(
        request.user.sub,
        request.params.userId
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(404).send({ success: false, error: (error as any).message });
    }
  });

  // Nearby players
  fastify.get('/nearby', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        required: ['latitude', 'longitude', 'radius'],
        properties: {
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          radius: { type: 'number', minimum: 0.1, maximum: 50, default: 5 }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: {
      latitude: number;
      longitude: number;
      radius: number;
    }
  }>, reply: FastifyReply) => {
    try {
      const result = await SocialService.getNearbyPlayers(
        request.user.sub,
        {
          latitude: request.query.latitude,
          longitude: request.query.longitude
        },
        request.query.radius
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ── Missing routes (matched to Unity SocialAPI.cs) ──────────────────────

  // GET /friends/requests/pending — Unity: SOCIAL_FRIENDS_PENDING
  // Returns { incoming, outgoing } to match PendingRequestsResponse
  fastify.get('/friends/requests/pending', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const userId = request.user.sub;
      const [incoming, outgoing] = await Promise.all([
        SocialService.getPendingRequests(userId),
        SocialService.getSentRequests(userId),
      ]);
      reply.send({
        success: true,
        data: {
          incoming: incoming.requests,
          outgoing: outgoing.requests,
        }
      });
    } catch (error) {
      sendError(reply as FastifyReply, error, 'Get pending requests failed', 500);
    }
  });

  // DELETE /friends/:id — Unity: SOCIAL_FRIEND_REMOVE
  fastify.delete<{ Params: { id: string } }>('/friends/:id', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await SocialService.removeFriend(request.user.sub, request.params.id);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply as FastifyReply, error, 'Remove friend failed');
    }
  });

  // POST /friends/block — Block a user (future-proof)
  fastify.post<{ Body: { friendshipId: string } }>('/friends/block', {
    preHandler: [authenticate, userRateLimit],
    schema: {
      body: {
        type: 'object',
        required: ['friendshipId'],
        properties: {
          friendshipId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const result = await SocialService.blockUser(request.user.sub, request.body.friendshipId);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply as FastifyReply, error, 'Block user failed');
    }
  });
}
