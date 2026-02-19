import { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate, requireAdmin } from '@/middleware/auth'
import { adminRateLimit } from '@/middleware/distributed-rate-limit'
import { AdminPrizesService } from '../services/admin-prizes.service'
import { z } from 'zod'
import { PrizeContentType } from '@/types'

const PrizeManagementSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(['standard', 'geo_crypto', 'nft', 'coupon', 'physical']).optional(),
  displayType: z.enum(['standard', 'mystery_box', 'treasure', 'bonus', 'special']).optional(),
  contentType: z.nativeEnum(PrizeContentType).optional(),
  category: z.string().optional(),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).optional(),
  value: z.number().positive().optional(),
  quantity: z.number().int().min(0).optional(),
  imageUrl: z.string().optional().refine(
    (val) => !val || val.startsWith('/uploads/') || /^https?:\/\/.+/.test(val),
    { message: 'Image must be a valid URL or uploaded file path' }
  ),
  city: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radius: z.number().positive().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  status: z.enum(['active', 'inactive', 'expired', 'claimed']).optional(),
  metadata: z.record(z.unknown()).optional(),
  directReward: z.object({
    rewardId: z.string(),
    autoRedeem: z.boolean().optional(),
    probability: z.number().min(0).max(1).optional(),
  }).optional(),
})

export default async function prizesRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', authenticate)
  fastify.addHook('onRequest', requireAdmin)
  fastify.addHook('onRequest', adminRateLimit)

  // GET /prizes - list prizes with pagination and filters
  fastify.get<{
    Querystring: {
      page?: string
      limit?: string
      status?: string
      category?: string
      rarity?: string
      city?: string
      search?: string
    }
  }>('/prizes', async (request, reply) => {
    const { page = '1', limit = '20', status, category, rarity, city, search } = request.query

    const result = await AdminPrizesService.getPrizes({
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      status,
      category,
      rarity,
      city,
      search
    })

    return reply.send(result)
  })

  // GET /prizes/:prizeId - get single prize
  fastify.get<{
    Params: { prizeId: string }
  }>('/prizes/:prizeId', async (request, reply) => {
    const { prizeId } = request.params

    const prize = await AdminPrizesService.getPrize(prizeId)

    if (!prize) {
      return reply.status(404).send({ error: 'Prize not found' })
    }

    return reply.send(prize)
  })

  // POST /prizes - create prize
  fastify.post<{
    Body: z.infer<typeof PrizeManagementSchema>
  }>('/prizes', async (request, reply) => {
    const validation = PrizeManagementSchema.safeParse(request.body)

    if (!validation.success) {
      return reply.status(400).send({ error: 'Validation failed', details: validation.error.errors })
    }

    const adminId = request.user?.sub;
    const prize = await AdminPrizesService.createPrize(validation.data, adminId)

    return reply.status(201).send(prize)
  })
  // PATCH /prizes/:prizeId - update prize
  fastify.patch<{
    Params: { prizeId: string }
    Body: Partial<z.infer<typeof PrizeManagementSchema>>
  }>('/prizes/:prizeId', async (request, reply) => {
    const { prizeId } = request.params
    const validation = PrizeManagementSchema.partial().safeParse(request.body)

    if (!validation.success) {
      return reply.status(400).send({ error: 'Validation failed', details: validation.error.errors })
    }

    const adminId = request.user?.sub;
    const prize = await AdminPrizesService.updatePrize(validation.data, prizeId, adminId);

    if (!prize) {
      return reply.status(404).send({ error: 'Prize not found' });
    }

    return reply.send(prize);
  });

  // PUT /prizes/:prizeId - update prize (alias for PATCH)
  fastify.put<{
    Params: { prizeId: string }
    Body: Partial<z.infer<typeof PrizeManagementSchema>>
  }>('/prizes/:prizeId', async (request, reply) => {
    const { prizeId } = request.params;
    const validation = PrizeManagementSchema.partial().safeParse(request.body);

    if (!validation.success) {
      return reply.status(400).send({ error: 'Validation failed', details: validation.error.errors });
    }

    const adminId = request.user?.sub;
    const prize = await AdminPrizesService.updatePrize(validation.data, prizeId, adminId);

    if (!prize) {
      return reply.status(404).send({ error: 'Prize not found' });
    }

    return reply.send(prize);
  });

  // DELETE /prizes/:prizeId - delete prize
  fastify.delete<{
    Params: { prizeId: string }
  }>('/prizes/:prizeId', async (request, reply) => {
    const { prizeId } = request.params;

    const adminId = request.user?.sub;
    const deleted = await AdminPrizesService.deletePrize(prizeId, adminId);

    if (!deleted) {
      return reply.status(404).send({ error: 'Prize not found' });
    }

    return reply.send({ success: true, data: deleted });
  });

  // GET /prizes/nearby - get prizes near a location
  fastify.get<{
    Querystring: { latitude: string; longitude: string; radius?: string }
  }>('/prizes/nearby', async (request, reply) => {
    const { latitude, longitude, radius = '5000' } = request.query;

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const rad = parseFloat(radius);

    if (isNaN(lat) || isNaN(lng)) {
      return reply.status(400).send({ error: 'Invalid latitude or longitude' });
    }

    const prizes = await AdminPrizesService.getNearbyPrizes?.(lat, lng, rad) || [];
    return reply.send({ success: true, data: prizes, count: prizes.length });
  });
}
