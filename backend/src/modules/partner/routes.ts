import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '@/middleware/auth';
import { UserRole } from '@/types';
import { typedLogger } from '@/lib/typed-logger';
import { PartnerService } from './partner.service';
import { PartnerItemSchema, PartnerLocationSchema, PartnerProfileSchema } from './partner.schema';

const ensurePartner = (request: FastifyRequest) => {
  const user = request.user as { role?: UserRole; partnerId?: string } | undefined;
  if (!user || user.role !== UserRole.PARTNER || !user.partnerId) {
    throw new Error('PARTNER_ONLY');
  }
  return user.partnerId;
};

export default async function partnerRoutes(fastify: FastifyInstance) {
  // Common error handler helper
  const handlePartnerError = (reply: FastifyReply, error: any, message: string) => {
    if (error.message === 'PARTNER_ONLY') return reply.code(403).send({ success: false, error: 'FORBIDDEN' });
    if (error.message === 'PARTNER_NOT_FOUND') return reply.code(404).send({ success: false, error: 'PARTNER_NOT_FOUND' });
    if (error.message === 'LOCATION_NOT_FOUND') return reply.code(404).send({ success: false, error: 'LOCATION_NOT_FOUND' });
    if (error.message === 'ITEM_NOT_FOUND') return reply.code(404).send({ success: false, error: 'ITEM_NOT_FOUND' });

    if (error instanceof z.ZodError) {
      return reply.code(400).send({ success: false, error: 'VALIDATION_FAILED', details: error.errors });
    }

    typedLogger.error(message, { error: error.message });
    return reply.code(500).send({ success: false, error: 'INTERNAL_SERVER_ERROR', message });
  };

  // --- PROFILE MANAGEMENT ---

  // Get partner profile
  fastify.get('/profile', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const partner = await PartnerService.getProfile(partnerId);
      return reply.send({ success: true, partner });
    } catch (error: any) {
      return handlePartnerError(reply, error, 'Get partner profile error');
    }
  });

  // Update partner profile
  fastify.put('/profile', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request: FastifyRequest<{ Body: z.infer<typeof PartnerProfileSchema> }>, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const body = PartnerProfileSchema.parse(request.body);
      const partner = await PartnerService.updateProfile(partnerId, body);
      return reply.send({ success: true, partner });
    } catch (error: any) {
      return handlePartnerError(reply, error, 'Update partner profile error');
    }
  });

  // --- LOCATION MANAGEMENT ---

  // Get partner locations
  fastify.get('/locations', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const locations = await PartnerService.getLocations(partnerId);
      return reply.send({ success: true, data: locations });
    } catch (error: any) {
      return handlePartnerError(reply, error, 'Get partner locations error');
    }
  });

  // Update or Create Location
  fastify.post('/location', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request: FastifyRequest<{ Body: z.infer<typeof PartnerLocationSchema> }>, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const payload = PartnerLocationSchema.parse(request.body);

      const result = await PartnerService.updateLocation(partnerId, payload);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return handlePartnerError(reply, error, 'Update/Create location error');
    }
  });

  // Delete partner location
  fastify.delete('/locations/:id', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const locations = await PartnerService.removeLocation(partnerId, request.params.id);
      return reply.send({ success: true, locations });
    } catch (error: any) {
      return handlePartnerError(reply, error, 'Delete location error');
    }
  });

  // --- MARKETPLACE ITEMS ---

  // List Items
  fastify.get('/items', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const items = await PartnerService.getItems(partnerId);
      return reply.send({ success: true, items });
    } catch (error: any) {
      return handlePartnerError(reply, error, 'List items error');
    }
  });

  // Create Item
  fastify.post('/items', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request: FastifyRequest<{ Body: z.infer<typeof PartnerItemSchema> }>, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const body = PartnerItemSchema.parse(request.body);

      const reward = await PartnerService.createItem(partnerId, body);
      return reply.code(201).send({ success: true, item: reward });
    } catch (error: any) {
      return handlePartnerError(reply, error, 'Create item error');
    }
  });

  // Update Item
  fastify.put('/items/:id', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request: FastifyRequest<{ Params: { id: string }; Body: Partial<z.infer<typeof PartnerItemSchema>> }>, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const body = PartnerItemSchema.partial().parse(request.body);

      const item = await PartnerService.updateItem(partnerId, request.params.id, body);
      return reply.send({ success: true, item });
    } catch (error: any) {
      return handlePartnerError(reply, error, 'Update item error');
    }
  });

  // Delete Item
  fastify.delete('/items/:id', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const partnerId = ensurePartner(request);
      await PartnerService.deleteItem(partnerId, request.params.id);
      return reply.send({ success: true });
    } catch (error: any) {
      return handlePartnerError(reply, error, 'Delete item error');
    }
  });

  // --- STATISTICS & REDEMPTIONS ---

  // Partner Stats
  fastify.get('/stats', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const data = await PartnerService.getStats(partnerId);
      return reply.send({ success: true, data });
    } catch (error: any) {
      return handlePartnerError(reply, error, 'Get stats error');
    }
  });

  // Pending Redemptions
  fastify.get('/redemptions/pending', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request: FastifyRequest<{ Querystring: { limit?: number } }>, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const limit = Math.min(Math.max((request.query.limit || 50), 1), 200);

      const data = await PartnerService.getPendingRedemptions(partnerId, limit);
      return reply.send({ success: true, data });
    } catch (error: any) {
      return handlePartnerError(reply, error, 'Get pending redemptions error');
    }
  });

  // Marketplace Analytics (Commission etc)
  fastify.get('/analytics', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const data = await PartnerService.getAnalytics(partnerId);
      return reply.send({ success: true, data });
    } catch (error: any) {
      return handlePartnerError(reply, error, 'Get analytics error');
    }
  });
}
