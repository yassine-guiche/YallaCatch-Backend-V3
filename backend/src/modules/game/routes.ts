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
  // SDK 2.4.0 expects /location/update
  fastify.post('/location', async (request, reply) => {
    const user = (request as any).user;
    const result = await GameService.updateLocation(user.sub, request.body as any);
    return reply.send({ success: true, data: result });
  });
  
  fastify.post('/location/update', async (request, reply) => {
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
    
    let bounds;
    
    // Support SDK format (lat, lng, radius)
    if (query.lat && query.lng && query.radius) {
      const lat = parseFloat(query.lat);
      const lng = parseFloat(query.lng);
      const radiusKm = parseFloat(query.radius) / 1000; // Convert meters to km
      
      // Approximate bounds from center + radius
      // 1 deg lat ~= 111km
      // 1 deg lng ~= 111km * cos(lat)
      const latDelta = radiusKm / 111;
      const lngDelta = radiusKm / (111 * Math.cos(lat * (Math.PI / 180)));
      
      bounds = {
        north: lat + latDelta,
        south: lat - latDelta,
        east: lng + lngDelta,
        west: lng - lngDelta
      };
    } else {
      // Support Bounding Box format
      bounds = {
        north: parseFloat(query.north),
        south: parseFloat(query.south),
        east: parseFloat(query.east),
        west: parseFloat(query.west)
      };
    }

    // Validate bounds
    if (isNaN(bounds.north) || isNaN(bounds.south) || isNaN(bounds.east) || isNaN(bounds.west)) {
      return reply.code(400).send({ success: false, error: 'Invalid bounds or location parameters' });
    }

    const result = await GameService.getMapData(bounds, user.sub);
    return reply.send({ success: true, data: result });
  });

  // GAME_POWERUP_USE = "/game/powerup/use"
  // SDK 2.4.0 expects /power-ups/use
  fastify.post('/powerup/use', async (request, reply) => {
    const user = (request as any).user;
    const data = PowerUpUsageSchema.parse(request.body);
    const result = await GameService.usePowerUp(user.sub, data as any);
    return reply.send({ success: true, data: result });
  });

  fastify.post('/power-ups/use', async (request, reply) => {
    const user = (request as any).user;
    const data = PowerUpUsageSchema.parse(request.body);
    const result = await GameService.usePowerUp(user.sub, data as any);
    return reply.send({ success: true, data: result });
  });

  // GAME_CHALLENGES = "/game/challenges"
  // SDK 2.4.0 expects /challenges/daily
  fastify.get('/challenges', async (request, reply) => {
    const user = (request as any).user;
    const result = await GameService.getDailyChallenges(user.sub);
    return reply.send({ success: true, data: result });
  });

  fastify.get('/challenges/daily', async (request, reply) => {
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

  // SDK 2.4.0 expects POST /challenges/complete with body { challengeId }
  fastify.post('/challenges/complete', async (request, reply) => {
    const user = (request as any).user;
    const { challengeId } = request.body as { challengeId: string };
    if (!challengeId) {
      return reply.code(400).send({ success: false, error: 'challengeId required' });
    }
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
