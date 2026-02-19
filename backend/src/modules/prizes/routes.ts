import { FastifyInstance } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import { PrizeService } from './prizes.service';
import { nearbyPrizesSchema, cityPrizesSchema, searchPrizesSchema, createPrizeSchema, updatePrizeSchema, bulkCreatePrizesSchema } from './prizes.schema';
import { PrizeCategory, PrizeRarity } from '@/types';
import { TUNISIA_CITIES } from '@/config';

export default async function prizeRoutes(fastify: FastifyInstance) {
  // Get nearby prizes
  fastify.get('/nearby', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await PrizeService.getNearbyPrizes(
        request.user!.sub,
        request.query as z.infer<typeof nearbyPrizesSchema>
      );

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const message = (error as any).message;
      const statusCode = message === 'LOCATION_OUT_OF_BOUNDS'
        ? 400
        : message === 'ANTI_CHEAT_VIOLATION'
          ? 403
          : 500;
      reply.code(statusCode).send({
        success: false,
        error: message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get prizes by city
  fastify.get<{ Params: { city: string }, Querystring: z.infer<typeof cityPrizesSchema> }>('/city/:city', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['city'],
        properties: {
          city: { type: 'string', enum: Object.keys(TUNISIA_CITIES) }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: Object.values(PrizeCategory) },
          rarity: { type: 'string', enum: Object.values(PrizeRarity) },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          page: { type: 'number', minimum: 1, default: 1 }
        }
      },
    }
  }, async (request, reply) => {
    try {
      const result = await PrizeService.getCityPrizes({
        ...request.query,
        city: request.params.city as any
      });

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

  // Get prize details
  fastify.get<{ Params: { prizeId: string }, Querystring: { lat?: number, lng?: number } }>('/:prizeId', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userLocation = request.query.lat && request.query.lng ? {
        lat: request.query.lat,
        lng: request.query.lng
      } : undefined;

      const result = await PrizeService.getPrizeDetails(
        request.user!.sub,
        request.params.prizeId,
        userLocation
      );

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const message = (error as any).message;
      const statusCode = message === 'PRIZE_NOT_FOUND'
        ? 404
        : message === 'ANTI_CHEAT_VIOLATION'
          ? 403
          : 500;
      reply.code(statusCode).send({
        success: false,
        error: message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Search prizes
  fastify.get('/search', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await PrizeService.searchPrizes(request.query as z.infer<typeof searchPrizesSchema>);

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
