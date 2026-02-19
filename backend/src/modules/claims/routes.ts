import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { claimsRateLimit } from '@/middleware/distributed-rate-limit';
import { z } from 'zod';
import { normalizeError } from '@/utils/api-errors';
import { ClaimsService } from './claims.service';
import { claimPrizeSchema, getUserClaimsSchema } from './claims.schema';

export default async function claimsRoutes(fastify: FastifyInstance) {
  // Claim a prize
  fastify.post('/', {
    preHandler: [authenticate, claimsRateLimit],
    schema: {
      body: claimPrizeSchema
    }
  }, async (request, reply) => {
    try {
      const result = await ClaimsService.claimPrize(
        request.user.sub,
        request.body as z.infer<typeof claimPrizeSchema>
      );

      reply.code(201).send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const normalized = normalizeError(error, 'Claim prize failed');
      const statusCodes: Record<string, number> = {
        LOCATION_OUT_OF_BOUNDS: 400,
        USER_NOT_FOUND: 404,
        PRIZE_NOT_FOUND: 404,
        PRIZE_NOT_AVAILABLE: 409,
        DISTANCE_TOO_FAR: 400,
        ANTI_CHEAT_VIOLATION: 403,
        COOLDOWN_ACTIVE: 429,
        DAILY_LIMIT_EXCEEDED: 429,
      };
      const statusCode = statusCodes[normalized.code] || 500;
      reply.code(statusCode).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get user claims
  fastify.get<{ Querystring: z.infer<typeof getUserClaimsSchema> }>('/my-claims', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await ClaimsService.getUserClaims(
        request.user.sub,
        request.query
      );

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const normalized = normalizeError(error, 'Get user claims failed');
      reply.code(500).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get claim details
  fastify.get<{ Params: { claimId: string; } }>(
    '/:claimId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const result = await ClaimsService.getClaimDetails(
          request.user.sub,
          request.params.claimId
        );

        reply.send({
          success: true,
          data: result,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        const normalized = normalizeError(error, 'Get claim details failed');
        const statusCode = (error as any).message === 'CLAIM_NOT_FOUND' ? 404 : 500;
        reply.code(statusCode).send({
          success: false,
          error: normalized.code,
          message: normalized.message,
          timestamp: new Date().toISOString()
        });
      }
    });

  // Get user claim statistics
  fastify.get('/my-stats', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await ClaimsService.getUserClaimStats(request.user.sub);

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      reply.code(500).send({
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Admin: Get all claims
  fastify.get<{ Querystring: any }>('/admin/all', {
    preHandler: [authenticate, requireAdmin]
  }, async (request, reply) => {
    try {
      const result = await ClaimsService.getAllClaims(request.query);

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      reply.code(500).send({
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()
      });
    }
  });
}
