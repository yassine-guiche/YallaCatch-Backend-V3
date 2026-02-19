import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireRole } from '@/middleware/auth'; // Removed requireAdmin as it is not used in the routes below
import { MarketplaceService } from './marketplace.service';
import { PurchaseItemSchema, RedeemItemSchema } from './marketplace.schema';
import { UserRole } from '@/types';

export default async function marketplaceRoutes(fastify: FastifyInstance) {
  const sendError = (reply: FastifyReply, error: unknown, fallback: string, status = 400) => {
    reply.code(status).send({ success: false, error: error instanceof Error ? error.message : fallback });
  };

  // Get marketplace items (public/authenticated)
  fastify.get('/items', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          minPoints: { type: 'number' },
          maxPoints: { type: 'number' },
          search: { type: 'string' },
          featured: { type: 'boolean' },
          page: { type: 'number' },
          limit: { type: 'number' },
          latitude: { type: 'number' },
          longitude: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: {
      category?: string;
      minPoints?: number;
      maxPoints?: number;
      search?: string;
      featured?: boolean;
      page?: number;
      limit?: number;
      latitude?: number;
      longitude?: number;
    }
  }>, reply) => {
    try {
      const location = request.query.latitude && request.query.longitude ? {
        latitude: request.query.latitude,
        longitude: request.query.longitude
      } : undefined;

      const result = await MarketplaceService.getMarketplace(request.user.sub, {
        category: request.query.category,
        minPoints: request.query.minPoints,
        maxPoints: request.query.maxPoints,
        search: request.query.search,
        featured: request.query.featured,
        page: request.query.page,
        limit: request.query.limit,
        location
      });
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply, error, 'Get marketplace items failed');
    }
  });

  // Purchase item
  fastify.post('/purchase', {
    preHandler: [authenticate],
    schema: { body: PurchaseItemSchema }
  }, async (request: FastifyRequest<{
    Body: {
      itemId: string;
      location?: { latitude: number; longitude: number };
      deviceInfo?: { platform: string; version: string };
    }
  }>, reply) => {
    try {
      const result = await MarketplaceService.purchaseItem(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply, error, 'Purchase failed');
    }
  });

  // Get my redemptions
  fastify.get('/redemptions', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          page: { type: 'number' },
          limit: { type: 'number' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: {
      status?: string;
      page?: number;
      limit?: number;
    }
  }>, reply) => {
    try {
      const result = await MarketplaceService.getUserRedemptions(request.user.sub, request.query);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply, error, 'Get redemptions failed');
    }
  });

  // Redeem item at partner location (for partner app usually, but exposed here if needed)
  // Note: This endpoint is deprecated in favor of specific partner app routes, but kept for compatibility
  fastify.post('/redeem', {
    preHandler: [authenticate],
    schema: { body: RedeemItemSchema }
  }, async (request: FastifyRequest<{
    Body: {
      redemptionCode: string;
      location: { latitude: number; longitude: number };
      verificationCode?: string;
    }
  }>, reply) => {
    try {
      reply.header('Deprecation', 'true');
      reply.header('Link', '</api/v1/rewards/scan>; rel="successor-version"');
      const result = await MarketplaceService.redeemItem(request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply, error, 'Redemption failed');
    }
  });

  // Admin analytics
  fastify.get('/analytics', {
    preHandler: [authenticate, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN])],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          timeframe: { type: 'string', default: '30d' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { timeframe?: string }
  }>, reply) => {
    try {
      const result = await MarketplaceService.getMarketplaceAnalytics(request.query.timeframe);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply, error, 'Get analytics failed');
    }
  });

  // GET /categories — Return available marketplace categories with item counts
  fastify.get('/categories', {
    preHandler: [authenticate],
  }, async (_request, reply) => {
    try {
      const categories = await MarketplaceService.getCategoryOptions();
      reply.send({ success: true, categories, data: categories });
    } catch (error) {
      sendError(reply, error, 'Get categories failed');
    }
  });

  // GET /featured — Return featured/popular marketplace items
  fastify.get('/featured', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest<{
    Querystring: { limit?: number }
  }>, reply) => {
    try {
      const { Reward } = await import('@/models/Reward');
      const featured = await Reward.find({
        isActive: true,
        listingType: 'marketplace',
        $or: [{ isPopular: true }, { isFeatured: true }],
      })
        .populate('partnerId', 'name logo')
        .sort({ createdAt: -1 })
        .limit(request.query.limit || 20)
        .lean();

      reply.send({ success: true, rewards: featured, data: featured });
    } catch (error) {
      sendError(reply, error, 'Get featured rewards failed');
    }
  });

  // GET /history — Return redemption exchange history (admin)
  fastify.get('/history', {
    preHandler: [authenticate, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN])],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          limit: { type: 'number' },
          status: { type: 'string' },
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { page?: number; limit?: number; status?: string }
  }>, reply) => {
    try {
      const { Redemption } = await import('@/models/Redemption');
      const { page = 1, limit = 50, status } = request.query;
      const skip = (page - 1) * limit;
      const query: Record<string, unknown> = {};
      if (status && status !== 'all') query.status = status;

      const [exchanges, total] = await Promise.all([
        Redemption.find(query)
          .populate('userId', 'username email')
          .populate('rewardId', 'name pointsCost category')
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 })
          .lean(),
        Redemption.countDocuments(query),
      ]);

      reply.send({
        success: true,
        exchanges,
        data: exchanges,
        total,
        hasMore: skip + limit < total,
      });
    } catch (error) {
      sendError(reply, error, 'Get marketplace history failed');
    }
  });
}

