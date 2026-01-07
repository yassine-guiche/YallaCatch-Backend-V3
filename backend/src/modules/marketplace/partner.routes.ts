import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '@/middleware/auth';
import { UserRole } from '@/types';
import { Reward } from '@/models/Reward';
import { Partner } from '@/models/Partner';
import { Redemption } from '@/models/Redemption';
import { typedLogger } from '@/lib/typed-logger';

const PartnerItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  pointsCost: z.number().int().min(0),
  stockQuantity: z.number().int().min(0),
  imageUrl: z.string().url().optional().or(z.literal('')).transform(v => v || undefined),
  isActive: z.boolean().optional(),
  isPopular: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const ensurePartner = (request: FastifyRequest) => {
  const user = request.user as { role?: UserRole; partnerId?: string } | undefined;
  if (!user || user.role !== UserRole.PARTNER || !user.partnerId) {
    throw new Error('PARTNER_ONLY');
  }
  return user.partnerId;
};

export default async function partnerMarketplaceRoutes(fastify: FastifyInstance) {
  // List partner items
  fastify.get('/marketplace/items', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const items = await Reward.find({ partnerId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean();
      return reply.send({ success: true, items });
    } catch (error: any) {
      if (error.message === 'PARTNER_ONLY') return reply.code(403).send({ success: false, error: 'FORBIDDEN' });
      typedLogger.error('Partner list items error', { error: error.message });
      return reply.code(500).send({ success: false, error: 'Failed to load items' });
    }
  });

  // Create partner item
  fastify.post('/marketplace/items', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request: FastifyRequest<{ Body: z.infer<typeof PartnerItemSchema> }>, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const validation = PartnerItemSchema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({ success: false, error: 'VALIDATION_FAILED', details: validation.error.errors });
      }
      const partner = await Partner.findById(partnerId).lean();
      const commissionRate = (partner as any)?.commissionRate;
      const body = validation.data;
      const reward = await Reward.create({
        name: body.name,
        description: body.description,
        category: body.category,
        pointsCost: body.pointsCost,
        stockQuantity: body.stockQuantity,
        stockAvailable: body.stockQuantity,
        imageUrl: body.imageUrl,
        isActive: body.isActive ?? true,
        isPopular: body.isPopular ?? false,
        partnerId,
        metadata: {
          ...(body.metadata || {}),
          isSponsored: true,
          commissionRate,
          source: 'marketplace',
        },
      });
      return reply.code(201).send({ success: true, item: reward });
    } catch (error: any) {
      typedLogger.error('Partner create item error', { error: error.message });
      return reply.code(500).send({ success: false, error: 'Failed to create item' });
    }
  });

  // Update partner item
  fastify.put('/marketplace/items/:id', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request: FastifyRequest<{ Params: { id: string }; Body: Partial<z.infer<typeof PartnerItemSchema>> }>, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const validation = PartnerItemSchema.partial().safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({ success: false, error: 'VALIDATION_FAILED', details: validation.error.errors });
      }
      const update: Record<string, unknown> = { ...validation.data };
      if (update.stockQuantity !== undefined) {
        update.stockAvailable = update.stockQuantity;
      }
      update.metadata = {
        ...(validation.data.metadata || {}),
        isSponsored: true,
        source: 'marketplace',
      };
      const item = await Reward.findOneAndUpdate(
        { _id: request.params.id, partnerId },
        update,
        { new: true }
      ).lean();
      if (!item) return reply.code(404).send({ success: false, error: 'ITEM_NOT_FOUND' });
      return reply.send({ success: true, item });
    } catch (error: any) {
      typedLogger.error('Partner update item error', { error: error.message });
      return reply.code(500).send({ success: false, error: 'Failed to update item' });
    }
  });

  // Delete partner item (soft delete)
  fastify.delete('/marketplace/items/:id', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const item = await Reward.findOneAndUpdate(
        { _id: request.params.id, partnerId },
        { isActive: false, isDeleted: true, 'metadata.deletedAt': new Date() },
        { new: true }
      ).lean();
      if (!item) return reply.code(404).send({ success: false, error: 'ITEM_NOT_FOUND' });
      return reply.send({ success: true });
    } catch (error: any) {
      typedLogger.error('Partner delete item error', { error: error.message });
      return reply.code(500).send({ success: false, error: 'Failed to delete item' });
    }
  });

  // Partner analytics
  fastify.get('/marketplace/analytics', { preHandler: [authenticate, requireRole([UserRole.PARTNER]) as any] }, async (request, reply) => {
    try {
      const partnerId = ensurePartner(request);
      const partner = await Partner.findById(partnerId).lean();
      const commissionRateDefault = (partner as any)?.commissionRate || 0;
      const itemsCount = await Reward.countDocuments({ partnerId, isDeleted: { $ne: true } });
      const redemptions = await Redemption.find({ 'metadata.source': 'marketplace', status: { $ne: 'CANCELLED' }, 'reward.partnerId': partnerId }).populate('rewardId', 'pointsCost metadata partnerId').lean();
      const totalRedemptions = redemptions.length;
      const pointsSpent = redemptions.reduce((sum, r: any) => sum + (r.pointsCost || r.rewardId?.pointsCost || 0), 0);
      const commission = redemptions.reduce((sum, r: any) => {
        const rate = r.rewardId?.metadata?.commissionRate ?? commissionRateDefault;
        const pts = r.pointsCost || r.rewardId?.pointsCost || 0;
        return sum + pts * (rate / 100);
      }, 0);
      reply.send({
        success: true,
        data: {
          itemsCount,
          totalRedemptions,
          pointsSpent,
          commission,
          commissionRate: commissionRateDefault,
        },
      });
    } catch (error: any) {
      typedLogger.error('Partner analytics error', { error: error.message });
      reply.code(500).send({ success: false, error: 'Failed to fetch analytics' });
    }
  });
}
