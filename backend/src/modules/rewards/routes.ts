import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import { RewardsService } from './rewards.service';
import {
  getRewardsSchema,
  searchRewardsSchema,
  redeemRewardSchema,
  createRewardSchema,
  updateRewardSchema,
  addStockSchema,
  promoCodeSchema
} from './rewards.schema';

export default async function rewardsRoutes(fastify: FastifyInstance) {
  // All routes might not require auth, but most do. Let's check.
  // Public routes: categories, featured, maybe listing?
  // Private routes: redeem, favorites, history.

  // Get reward categories (Public?) - Authenticated for consistency usually, or public if app needs it before login.
  // Assuming authenticated based on other modules.
  fastify.get('/categories', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const result = await RewardsService.getRewardCategories();
    return { success: true, data: result };
  });

  // Get featured rewards
  fastify.get('/featured', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const { limit } = request.query as { limit?: number };
    const result = await RewardsService.getFeaturedRewards(limit ? Number(limit) : 10);
    return { success: true, data: result };
  });

  // Search rewards
  fastify.get<{ Querystring: z.infer<typeof searchRewardsSchema> }>('/search', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    // Manually parse query params if needed or rely on fastify schema
    // Since we are using z.infer directly in service, we might need to parse query.
    // However, fastify doesn't auto-validate Zod in query unless we set validator compiler properly.
    // server.ts has setValidatorCompiler.
    // We should validate inputs.
    const query = searchRewardsSchema.parse(request.query);
    const result = await RewardsService.searchRewards(query);
    return { success: true, data: result };
  });

  // Get rewards list
  fastify.get<{ Querystring: z.infer<typeof getRewardsSchema> }>('/', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    // We need to parse query params carefully as they come as strings
    const rawQuery = request.query as any;
    const cleanQuery = {
      ...rawQuery,
      page: rawQuery.page ? Number(rawQuery.page) : undefined,
      limit: rawQuery.limit ? Number(rawQuery.limit) : undefined,
      minCost: rawQuery.minCost ? Number(rawQuery.minCost) : undefined,
      maxCost: rawQuery.maxCost ? Number(rawQuery.maxCost) : undefined,
      popular: rawQuery.popular === 'true',
    };

    // Validate with Zod
    const data = getRewardsSchema.parse(cleanQuery);
    const result = await RewardsService.getRewards(data);
    return { success: true, data: result };
  });

  // Redeem promo code
  fastify.post<{ Body: z.infer<typeof promoCodeSchema> }>('/promo', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    if (!request.user) throw new Error('UNAUTHORIZED');
    const data = promoCodeSchema.parse(request.body);
    // Explicit cast to ensure type safety matching the service expectation
    const serviceData = { code: data.code };
    const result = await RewardsService.redeemPromoCode(request.user.sub, serviceData);
    return { success: true, data: result };
  });

  // Scan QR Code
  fastify.post('/scan', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    if (!request.user) throw new Error('UNAUTHORIZED');
    const result = await RewardsService.scanQRCode(request.user.sub, request.body);
    return { success: true, data: result };
  });

  // Redeem reward
  fastify.post<{ Body: z.infer<typeof redeemRewardSchema> }>('/redeem', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    if (!request.user) throw new Error('UNAUTHORIZED');
    const data = redeemRewardSchema.parse(request.body);
    const result = await RewardsService.redeemReward(request.user.sub, data);
    return { success: true, data: result };
  });

  // Favorites
  fastify.get('/favorites', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    if (!request.user) throw new Error('UNAUTHORIZED');
    const result = await RewardsService.getFavoriteRewards(request.user.sub);
    return { success: true, data: result };
  });

  fastify.post<{ Params: { id: string } }>('/favorites/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    if (!request.user) throw new Error('UNAUTHORIZED');
    const result = await RewardsService.addToFavorites(request.user.sub, request.params.id);
    return { success: true, data: result };
  });

  fastify.delete<{ Params: { id: string } }>('/favorites/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    if (!request.user) throw new Error('UNAUTHORIZED');
    const result = await RewardsService.removeFromFavorites(request.user.sub, request.params.id);
    return { success: true, data: result };
  });

  // Redemption History
  fastify.get('/history', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    if (!request.user) throw new Error('UNAUTHORIZED');
    const result = await RewardsService.getRedemptionHistory(request.user.sub, request.query);
    return { success: true, data: result };
  });

  // Get reward details (Must be last to avoid collision with specific paths if any)
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    const result = await RewardsService.getRewardDetails(request.params.id, request.user?.sub);
    return { success: true, data: result };
  });

}
