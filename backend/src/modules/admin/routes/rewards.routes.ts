import { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate, requireAdmin } from '@/middleware/auth'
import { adminRateLimit } from '@/middleware/distributed-rate-limit'
import { ListingType } from '@/types'
import { AdminRewardsService } from '../services/admin-rewards.service'
import { z } from 'zod'

// Extended category list to support legacy data and various reward types
const REWARD_CATEGORIES = [
  'voucher', 'gift_card', 'physical', 'digital', 'experience',
  'discount', 'Discount', 'coupon', 'Coupon', 'cashback', 'Cashback',
  'points', 'Points', 'merchandise', 'Merchandise', 'service', 'Service',
  'subscription', 'Subscription', 'food', 'Food', 'travel', 'Travel',
  'entertainment', 'Entertainment', 'other', 'Other'
] as const;

// Base schema without refinement for updates - with coercion for form data
const RewardBaseSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(500), // Required by Mongoose model
  category: z.enum(REWARD_CATEGORIES).transform(v => v.toLowerCase()), // Normalize to lowercase
  pointsCost: z.coerce.number().int().positive(),
  stockQuantity: z.coerce.number().int().min(0),
  imageUrl: z.string().optional().or(z.literal('')).or(z.null()).refine(
    (val) => !val || val.startsWith('/uploads/') || /^https?:\/\/.+/.test(val),
    { message: 'Image must be a valid URL or uploaded file path' }
  ).transform(v => v || ''),
  partnerId: z.string().optional().or(z.null()).transform(v => v || undefined),
  isActive: z.boolean().optional(),
  isPopular: z.boolean().optional(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
  metadata: z.record(z.unknown()).optional()
})

// Create schema with refinement for sponsored items
const RewardCreateSchema = RewardBaseSchema.refine((data) => {
  const metadata = data.metadata as Record<string, unknown> | undefined;
  const isSponsored = metadata?.isSponsored === true || metadata?.sponsored === true;
  return !isSponsored || !!data.partnerId;
}, { message: 'partnerId is required for sponsored items', path: ['partnerId'] })

// Update schema - partial of base schema (without refinement)
const RewardUpdateSchema = RewardBaseSchema.partial()

const StockUpdateSchema = z.object({
  quantity: z.number().int().min(0)
})

export default async function rewardsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', authenticate)
  fastify.addHook('onRequest', requireAdmin)
  fastify.addHook('onRequest', adminRateLimit)

  // GET /rewards - list rewards with pagination and filters
  fastify.get<{
    Querystring: {
      page?: string
      limit?: string
      category?: string
      status?: string
      minCost?: string
      maxCost?: string
      search?: string
    }
  }>('/rewards', async (request, reply) => {
    try {
      const { page, limit, category, status, minCost, maxCost, search } = request.query

      const result = await AdminRewardsService.getRewards({
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        category,
        status,
        minCost: minCost ? parseInt(minCost, 10) : undefined,
        maxCost: maxCost ? parseInt(maxCost, 10) : undefined,
        search,
        listingType: ListingType.GAME_REWARD
      })

      return reply.send(result)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch rewards' })
    }
  })

  // GET /rewards/analytics - get reward analytics
  fastify.get<{
    Querystring: { period?: string }
  }>('/rewards/analytics', async (request, reply) => {
    try {
      const { period = '30d' } = request.query
      const analytics = await AdminRewardsService.getRewardAnalytics(period)
      return reply.send(analytics)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch reward analytics' })
    }
  })

  // GET /rewards/:rewardId - get single reward
  fastify.get<{
    Params: { rewardId: string }
  }>('/rewards/:rewardId', async (request, reply) => {
    try {
      const { rewardId } = request.params
      const reward = await AdminRewardsService.getReward(rewardId)
      return reply.send(reward)
    } catch (error) {
      if ((error as Error).message === 'REWARD_NOT_FOUND') {
        return reply.status(404).send({ error: 'Reward not found' })
      }
      return reply.status(500).send({ error: 'Failed to fetch reward' })
    }
  })

  // POST /rewards - create reward
  fastify.post<{
    Body: z.infer<typeof RewardCreateSchema>
  }>('/rewards', async (request, reply) => {
    try {
      const validation = RewardCreateSchema.safeParse(request.body)

      if (!validation.success) {
        return reply.status(400).send({ error: 'Validation failed', details: validation.error.errors })
      }

      const adminId = request.user?.sub;
      const reward = await AdminRewardsService.createReward(adminId, { ...validation.data, listingType: ListingType.GAME_REWARD })

      return reply.status(201).send(reward)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to create reward' })
    }
  })

  // PATCH /rewards/:rewardId - update reward
  fastify.patch<{
    Params: { rewardId: string }
    Body: Partial<z.infer<typeof RewardUpdateSchema>>
  }>('/rewards/:rewardId', async (request, reply) => {
    try {
      const { rewardId } = request.params
      const validation = RewardUpdateSchema.safeParse(request.body)

      if (!validation.success) {
        console.error('Reward update validation failed:', JSON.stringify(validation.error.errors, null, 2))
        console.error('Request body:', JSON.stringify(request.body, null, 2))
        return reply.status(400).send({ error: 'Validation failed', details: validation.error.errors })
      }

      const adminId = request.user?.sub;
      const reward = await AdminRewardsService.updateReward(adminId, rewardId, validation.data)

      return reply.send(reward)
    } catch (error) {
      console.error('Reward update error:', error)
      if ((error as Error).message === 'REWARD_NOT_FOUND') {
        return reply.status(404).send({ error: 'Reward not found' })
      }
      return reply.status(500).send({ error: 'Failed to update reward' })
    }
  })

  // DELETE /rewards/:rewardId - soft delete reward
  fastify.delete<{
    Params: { rewardId: string }
  }>('/rewards/:rewardId', async (request, reply) => {
    try {
      const { rewardId } = request.params
      const adminId = request.user?.sub;

      await AdminRewardsService.deleteReward(adminId, rewardId)

      return reply.status(204).send()
    } catch (error) {
      if ((error as Error).message === 'REWARD_NOT_FOUND') {
        return reply.status(404).send({ error: 'Reward not found' })
      }
      return reply.status(500).send({ error: 'Failed to delete reward' })
    }
  })

  // PATCH /rewards/:rewardId/stock - update stock levels
  fastify.patch<{
    Params: { rewardId: string }
    Body: z.infer<typeof StockUpdateSchema>
  }>('/rewards/:rewardId/stock', async (request, reply) => {
    try {
      const { rewardId } = request.params
      const validation = StockUpdateSchema.safeParse(request.body)

      if (!validation.success) {
        return reply.status(400).send({ error: 'Validation failed', details: validation.error.errors })
      }

      const adminId = request.user?.sub;
      const reward = await AdminRewardsService.updateRewardStock(adminId, rewardId, validation.data.quantity)

      return reply.send(reward)
    } catch (error) {
      if ((error as Error).message === 'REWARD_NOT_FOUND') {
        return reply.status(404).send({ error: 'Reward not found' })
      }
      return reply.status(500).send({ error: 'Failed to update reward stock' })
    }
  })
}
