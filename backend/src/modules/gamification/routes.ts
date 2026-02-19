import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import { GamificationService } from './gamification.service';

export default async function gamificationRoutes(fastify: FastifyInstance) {
  // Get user achievements
  fastify.get('/achievements', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await GamificationService.getUserAchievements(request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get recently unlocked achievements
  fastify.get('/achievements/recent', {
    preHandler: [authenticate],
    schema: {
      querystring: z.object({
        limit: z.coerce.number().min(1).max(50).default(10)
      })
    }
  }, async (request: FastifyRequest<{ Querystring: { limit?: number } }>, reply: FastifyReply) => {
    try {
      const limit = request.query.limit || 10;
      const result = await GamificationService.getRecentlyUnlocked(request.user.sub, limit);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
}
