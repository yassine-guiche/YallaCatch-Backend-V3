import { FastifyInstance } from 'fastify';
import { GameService, GameSessionSchema, LocationUpdateData, PowerUpUsageSchema } from './index';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';

export default async function gameRoutes(fastify: FastifyInstance) {
  // All game routes require authentication
  fastify.addHook('onRequest', authenticate);

  // GAME_SESSION_START = "/game/session/start"
  fastify.post('/session/start', async (request, reply) => {
    // Validate body using schema
    const data = GameSessionSchema.parse(request.body);
    const user = (request as any).user;
    const result = await GameService.startGameSession(user.sub, data as any);
    return reply.send({ success: true, data: result });
  });

  // GAME_SESSION_END = "/game/session/end"
  fastify.post('/session/end', async (request, reply) => {
    const user = (request as any).user;
    const { sessionId } = request.body as { sessionId: string };
    const result = await GameService.endGameSession(user.sub, sessionId);
    return reply.send({ success: true, data: result });
  });

  // GAME_LOCATION = "/game/location" (Renamed from /location/update)
  fastify.post('/location', async (request, reply) => {
    const user = (request as any).user;
    const result = await GameService.updateLocation(user.sub, request.body as any);
    return reply.send({ success: true, data: result });
  });

  // GAME_LEADERBOARD = "/game/leaderboard"
  fastify.get('/leaderboard', async (request, reply) => {
    const { type, limit } = request.query as { type?: string; limit?: number };
    const result = await GameService.getLeaderboard(type, limit);
    return reply.send({ success: true, data: result });
  });

  // GAME_MAP = "/game/map"
  fastify.get('/map', async (request, reply) => {
    const user = (request as any).user;
    const query = request.query as any;
    const bounds = {
      north: parseFloat(query.north),
      south: parseFloat(query.south),
      east: parseFloat(query.east),
      west: parseFloat(query.west)
    };

    // Validate bounds
    if (isNaN(bounds.north) || isNaN(bounds.south) || isNaN(bounds.east) || isNaN(bounds.west)) {
      return reply.code(400).send({ success: false, error: 'Invalid bounds' });
    }

    const result = await GameService.getMapData(bounds, user.sub);
    return reply.send({ success: true, data: result });
  });

  // GAME_POWERUP_USE = "/game/powerup/use" (Singular 'powerup', was plural)
  fastify.post('/powerup/use', async (request, reply) => {
    const user = (request as any).user;
    const data = PowerUpUsageSchema.parse(request.body);
    const result = await GameService.usePowerUp(user.sub, data as any);
    return reply.send({ success: true, data: result });
  });

  // GAME_CHALLENGES = "/game/challenges" (Was /challenges/daily)
  fastify.get('/challenges', async (request, reply) => {
    const user = (request as any).user;
    const result = await GameService.getDailyChallenges(user.sub);
    return reply.send({ success: true, data: result });
  });

  // GAME_CHALLENGE_COMPLETE = "/game/challenges/{0}/complete"
  fastify.post('/challenges/:challengeId/complete', async (request, reply) => {
    const user = (request as any).user;
    const { challengeId } = request.params as { challengeId: string };
    const result = await GameService.completeChallenge(user.sub, challengeId);
    return reply.send({ success: true, data: result });
  });

  // GAME_INVENTORY = "/game/inventory"
  fastify.get('/inventory', async (request, reply) => {
    const user = (request as any).user;
    const result = await GameService.getInventory(user.sub);
    return reply.send({ success: true, data: result });
  });
}
