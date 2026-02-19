import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import { UsersService } from './users.service';
import { updateProfileSchema, getLeaderboardSchema } from './users.schema';

export default async function usersRoutes(fastify: FastifyInstance) {
  // Get user profile
  fastify.get('/profile', {
    preHandler: [authenticate]
  }, async (request: FastifyRequest, reply) => {
    try {
      if (!request.user) {
        throw new Error('UNAUTHORIZED');
      }
      const result = await UsersService.getProfile(request.user.sub);

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const statusCode = error instanceof Error && error.message === 'USER_NOT_FOUND' ? 404 : 500;

      reply.code(statusCode).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Update user profile
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

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const statusCodes: Record<string, number> = {
        'USER_NOT_FOUND': 404,
        'EMAIL_ALREADY_EXISTS': 409
      };

      const statusCode = error instanceof Error ? (statusCodes[error.message] || 500) : 500;

      reply.code(statusCode).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get leaderboard
  fastify.get<{ Querystring: z.infer<typeof getLeaderboardSchema> }>('/leaderboard', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      // Validate query manually or rely on type safety
      // Since we defined the generic, TS knows the shape, but runtime validation should happen if possible.
      // With setValidatorCompiler in server.ts, validation might not happen automatically for GET query params unless schema is passed.
      // But we passed generic, not schema to route options (well, we didn't pass schema in options in original file either).
      // Let's explicitly parse if we want validation or just pass raw query if we trust strict compilation (which we don't for runtime).
      // The service expects z.infer<typeof schema>, so let's validate.
      const query = getLeaderboardSchema.parse(request.query);
      const result = await UsersService.getLeaderboard(query);

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get user statistics
  fastify.get('/stats', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      if (!request.user) {
        throw new Error('UNAUTHORIZED');
      }
      const result = await UsersService.getUserStats(request.user.sub);

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const statusCode = error instanceof Error && error.message === 'USER_NOT_FOUND' ? 404 : 500;

      reply.code(statusCode).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // NOTE: Admin routes (ban, unban, get all users) have been moved to admin module to eliminate duplication
  // and maintain proper separation of concerns between user and admin functionality
}
