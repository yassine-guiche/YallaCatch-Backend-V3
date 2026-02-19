import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { claimsRateLimit, adminRateLimit } from '@/middleware/distributed-rate-limit';
import { z } from 'zod';
import { Prize } from '@/models/Prize';
import { User } from '@/models/User';
import { Claim } from '@/models/Claim';
import { Report } from '@/models/Report';
import { typedLogger } from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';

import { Settings } from '@/models/Settings';
import { ProgressionService } from '@/services/progression';
import { CaptureService, CaptureAttemptSchema, CaptureValidationSchema } from './capture.service';
import { ProximityService } from './proximity.service';
import mongoose from 'mongoose';
import { Types } from 'mongoose';

/**
 * AR Capture Module
 * Core Feature 2: Utilisateur capture â†’ Gagne les points + dÃ©couvre contenu
 * Handles the AR capture experience with animations, validation, and rewards
 */

// Schemas and interfaces are imported from @/services/capture.service

export default async function captureRoutes(fastify: FastifyInstance): Promise<void> {
  // Get AR proximity data (zones, hints, bearings)
  fastify.get('/nearby', {
    preHandler: [authenticate, claimsRateLimit],
    schema: {
      querystring: z.object({
        lat: z.coerce.number(),
        lng: z.coerce.number(),
        radius: z.coerce.number().optional(),
        accuracy: z.coerce.number().optional()
      })
    }
  }, async (request: FastifyRequest<{ Querystring: { lat: number; lng: number; radius?: number; accuracy?: number } }>, reply) => {
    try {
      const result = await ProximityService.getProximityPrizes(
        request.user.sub,
        {
          latitude: request.query.lat,
          longitude: request.query.lng,
          accuracy: request.query.accuracy
        },
        {
          maxRadius: request.query.radius
        }
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Attempt capture
  fastify.post('/attempt', {
    preHandler: [authenticate, claimsRateLimit],
    schema: {
      body: CaptureAttemptSchema
    }
  }, async (request: FastifyRequest<{ Body: z.infer<typeof CaptureAttemptSchema> }>, reply) => {
    try {
      const result = await CaptureService.attemptCapture(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Pre-validate capture
  fastify.post('/validate', {
    preHandler: [authenticate, claimsRateLimit],
    schema: {
      body: CaptureValidationSchema
    }
  }, async (request: FastifyRequest<{ Body: z.infer<typeof CaptureValidationSchema> }>, reply) => {
    try {
      const result = await CaptureService.preValidateCapture(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Get box animation
  fastify.get('/animation/:prizeId', {
    preHandler: [authenticate, claimsRateLimit],
    schema: {
      params: z.object({
        prizeId: z.string()
      })
    }
  }, async (request: FastifyRequest<{ Params: { prizeId: string } }>, reply) => {
    try {
      const result = await CaptureService.getBoxAnimation(request.params.prizeId);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Confirm capture (after /attempt succeeds)
  fastify.post('/confirm', {
    preHandler: [authenticate, claimsRateLimit],
    schema: {
      body: z.object({
        claimId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid claim ID')
      })
    }
  }, async (request: FastifyRequest<{ Body: { claimId: string } }>, reply) => {
    try {
      const result = await CaptureService.confirmCapture(request.user.sub, request.body.claimId);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

}
