import { FastifyInstance, FastifyRequest } from 'fastify'
import { authenticate, requireAdmin } from '@/middleware/auth'
import { adminRateLimit } from '@/middleware/distributed-rate-limit'
import { Achievement } from '@/models/Achievement'
import { UserAchievement } from '@/models/UserAchievement'
import { Reward } from '@/models/Reward'
import { Report } from '@/models/Report'
import { Session } from '@/models/Session'
import { Friendship } from '@/models/Friendship'
import { Code } from '@/models/Code'
import { ARSession } from '@/models/ARSession'
import { OfflineQueue } from '@/models/OfflineQueue'
import { DeviceToken } from '@/models/DeviceToken'
import { Redemption } from '@/models/Redemption'
import { AuditLog } from '@/models/AuditLog'
import { User } from '@/models/User'
import { audit } from '@/lib/audit-logger'
import { broadcastAdminEvent } from '@/lib/websocket'
import { CacheService } from '@/services/cache'
import { GamificationService } from '@/modules/gamification'
import crypto from 'crypto'

// Helper to log admin actions using unified audit logger
async function logAdminAction(adminId: string, action: string, resource: string, resourceId: string, details?: any) {
  // Use unified audit logger - writes to both Pino and MongoDB
  await audit.custom({
    userId: adminId,
    userRole: 'admin',
    action: action.toUpperCase(),
    resource,
    resourceId,
    category: 'admin',
    severity: action.includes('DELETE') ? 'medium' : 'low',
    metadata: details,
  });
}

export default async function extraRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', authenticate)
  fastify.addHook('onRequest', requireAdmin)
  fastify.addHook('onRequest', adminRateLimit)

  // ==================== ACHIEVEMENTS ====================

  // Get achievements for a specific user (admin)
  fastify.get('/achievements/user/:userId', async (request: FastifyRequest<{
    Params: { userId: string }
  }>, reply) => {
    try {
      const { userId } = request.params
      if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
        return reply.status(400).send({ error: 'Invalid userId' })
      }
      const achievements = await GamificationService.getUserAchievements(userId)
      return reply.send({ success: true, data: achievements })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch user achievements' })
    }
  })

  // GET achievements with caching
  fastify.get('/achievements', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; category?: string }
  }>, reply) => {
    try {
      const { page = '1', limit = '20', category } = request.query
      const cacheKey = `admin:achievements:${page}:${limit}:${category || 'all'}`
      
      // Try cache first
      const cached = await CacheService.get(cacheKey)
      if (cached) {
        return reply.send(cached)
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit)
      const query: any = {}
      if (category) query.category = category

      const [achievements, total] = await Promise.all([
        Achievement.find(query).skip(skip).limit(parseInt(limit)).sort({ order: 1 }),
        Achievement.countDocuments(query)
      ])

      const result = { achievements, total, page: parseInt(page), limit: parseInt(limit) }
      await CacheService.set(cacheKey, result, { ttl: 300 }) // 5 min cache
      
      return reply.send(result)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch achievements' })
    }
  })

  fastify.get('/achievements/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply) => {
    try {
      const achievement = await Achievement.findById(request.params.id)
      if (!achievement) return reply.status(404).send({ error: 'Achievement not found' })
      return reply.send(achievement)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch achievement' })
    }
  })

  fastify.post('/achievements', async (request: FastifyRequest<{
    Body: any
  }>, reply) => {
    try {
      const adminId = (request as any).user?.id || (request as any).user?._id
      const achievement = await Achievement.create(request.body)
      
      // Log action
      await logAdminAction(adminId, 'CREATE', 'achievement', achievement._id.toString(), { name: achievement.name })
      
      // Invalidate cache
      await CacheService.invalidate('admin:achievements:*')
      
      // Broadcast event
      broadcastAdminEvent({ type: 'achievement_created', achievement })
      
      return reply.status(201).send(achievement)
    } catch (error: any) {
      console.error('Failed to create achievement:', error?.message || error)
      return reply.status(500).send({ error: error?.message || 'Failed to create achievement' })
    }
  })

  fastify.put('/achievements/:id', async (request: FastifyRequest<{
    Params: { id: string }
    Body: any
  }>, reply) => {
    try {
      const adminId = (request as any).user?.id || (request as any).user?._id
      const achievement = await Achievement.findByIdAndUpdate(
        request.params.id,
        request.body,
        { new: true }
      )
      if (!achievement) return reply.status(404).send({ error: 'Achievement not found' })
      
      // Log action
      await logAdminAction(adminId, 'UPDATE', 'achievement', request.params.id, { changes: request.body })
      
      // Invalidate cache
      await CacheService.invalidate('admin:achievements:*')
      
      // Broadcast event
      broadcastAdminEvent({ type: 'achievement_updated', achievement })
      
      return reply.send(achievement)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to update achievement' })
    }
  })

  fastify.delete('/achievements/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply) => {
    try {
      const adminId = (request as any).user?.id || (request as any).user?._id
      const achievement = await Achievement.findByIdAndDelete(request.params.id)
      if (!achievement) return reply.status(404).send({ error: 'Achievement not found' })
      
      // Log action
      await logAdminAction(adminId, 'DELETE', 'achievement', request.params.id, { name: achievement.name })
      
      // Invalidate cache
      await CacheService.invalidate('admin:achievements:*')
      
      // Broadcast event
      broadcastAdminEvent({ type: 'achievement_deleted', achievementId: request.params.id })
      
      return reply.status(204).send()
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to delete achievement' })
    }
  })

  fastify.post('/achievements/unlock', async (request: FastifyRequest<{
    Body: { userId: string; achievementId: string }
  }>, reply) => {
    try {
      const adminId = (request as any).user?.id || (request as any).user?._id
      const { userId, achievementId } = request.body
      const userAchievement = await UserAchievement.findOneAndUpdate(
        { userId, achievementId },
        { progress: 100, unlockedAt: new Date() },
        { upsert: true, new: true }
      )
      
      // Log action
      await logAdminAction(adminId, 'UNLOCK', 'achievement', achievementId, { userId })
      
      // Broadcast event
      broadcastAdminEvent({ type: 'achievement_unlocked', userId, achievementId })
      
      return reply.send(userAchievement)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to unlock achievement' })
    }
  })

  // ==================== MARKETPLACE ====================

  // GET marketplace items with caching
  fastify.get('/marketplace/items', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; category?: string; isActive?: string }
  }>, reply) => {
    try {
      const { page = '1', limit = '20', category, isActive } = request.query
      const cacheKey = `admin:marketplace:${page}:${limit}:${category || 'all'}:${isActive || 'all'}`
      
      // Try cache first
      const cached = await CacheService.get(cacheKey)
      if (cached) {
        return reply.send(cached)
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit)
      const query: any = {}
      if (category) query.category = category
      if (isActive !== undefined) query.isActive = isActive === 'true'

      const [items, total] = await Promise.all([
        Reward.find(query).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
        Reward.countDocuments(query)
      ])

      const result = { items, total, page: parseInt(page), limit: parseInt(limit) }
      await CacheService.set(cacheKey, result, { ttl: 300 }) // 5 min cache
      
      return reply.send(result)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch marketplace items' })
    }
  })

  fastify.get('/marketplace/items/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply) => {
    try {
      const item = await Reward.findById(request.params.id)
      if (!item) return reply.status(404).send({ error: 'Item not found' })
      return reply.send(item)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch item' })
    }
  })

  fastify.post('/marketplace/items', async (request: FastifyRequest<{
    Body: any
  }>, reply) => {
    try {
      const adminId = (request as any).user?.id || (request as any).user?._id
      const body = request.body as any
      
      // Ensure required fields have defaults
      const itemData = {
        name: body.name,
        description: body.description,
        category: body.category,
        pointsCost: body.pointsCost || body.points_cost || 100,
        stockQuantity: body.stockQuantity || body.stock_quantity || body.stock || 0,
        stockAvailable: body.stockAvailable || body.stock_available || body.stockQuantity || body.stock || 0,
        imageUrl: body.imageUrl || body.image_url || body.image || '',
        isActive: body.isActive !== undefined ? body.isActive : true,
        isPopular: body.isPopular !== undefined ? body.isPopular : false,
        partnerId: body.partnerId || body.partner_id || undefined,
        metadata: body.metadata || {},
      }
      
      const item = await Reward.create(itemData)
      
      // Log action
      await logAdminAction(adminId, 'CREATE', 'marketplace_item', item._id.toString(), { name: item.name })
      
      // Invalidate cache
      await CacheService.invalidate('admin:marketplace:*')
      
      // Broadcast event
      broadcastAdminEvent({ type: 'marketplace_item_created', item })
      
      return reply.status(201).send({ success: true, data: item })
    } catch (error: any) {
      console.error('Failed to create marketplace item:', error)
      // Return validation errors if available
      if (error.name === 'ValidationError') {
        return reply.status(400).send({ 
          success: false, 
          error: 'Validation failed', 
          details: error.message 
        })
      }
      return reply.status(500).send({ success: false, error: error.message || 'Failed to create item' })
    }
  })

  fastify.put('/marketplace/items/:id', async (request: FastifyRequest<{
    Params: { id: string }
    Body: any
  }>, reply) => {
    try {
      const adminId = (request as any).user?.id || (request as any).user?._id
      const item = await Reward.findByIdAndUpdate(
        request.params.id,
        request.body,
        { new: true }
      )
      if (!item) return reply.status(404).send({ error: 'Item not found' })
      
      // Log action
      await logAdminAction(adminId, 'UPDATE', 'marketplace_item', request.params.id, { changes: request.body })
      
      // Invalidate cache
      await CacheService.invalidate('admin:marketplace:*')
      
      // Broadcast event
      broadcastAdminEvent({ type: 'marketplace_item_updated', item })
      
      return reply.send(item)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to update item' })
    }
  })

  fastify.delete('/marketplace/items/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply) => {
    try {
      const adminId = (request as any).user?.id || (request as any).user?._id
      const item = await Reward.findByIdAndDelete(request.params.id)
      if (!item) return reply.status(404).send({ error: 'Item not found' })
      
      // Log action
      await logAdminAction(adminId, 'DELETE', 'marketplace_item', request.params.id, { name: item.name })
      
      // Invalidate cache
      await CacheService.invalidate('admin:marketplace:*')
      
      // Broadcast event
      broadcastAdminEvent({ type: 'marketplace_item_deleted', itemId: request.params.id })
      
      return reply.status(204).send()
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to delete item' })
    }
  })

  fastify.get('/marketplace/redemptions', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; status?: string }
  }>, reply) => {
    try {
      const { page = '1', limit = '20', status } = request.query
      const skip = (parseInt(page) - 1) * parseInt(limit)
      const query: any = {}
      if (status) query.status = status

      const [redemptions, total] = await Promise.all([
        Redemption.find(query).populate('userId rewardId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
        Redemption.countDocuments(query)
      ])

      return reply.send({ redemptions, total, page: parseInt(page), limit: parseInt(limit) })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch redemptions' })
    }
  })

  fastify.patch('/marketplace/redemptions/:id/validate', async (request: FastifyRequest<{
    Params: { id: string }
    Body: { validated: boolean; notes?: string }
  }>, reply) => {
    try {
      const adminId = (request as any).user?.id || (request as any).user?._id
      const { validated, notes } = request.body
      const redemption = await Redemption.findByIdAndUpdate(
        request.params.id,
        { status: validated ? 'validated' : 'rejected', notes, validatedAt: new Date() },
        { new: true }
      )
      if (!redemption) return reply.status(404).send({ error: 'Redemption not found' })
      
      // Log action
      await logAdminAction(adminId, validated ? 'VALIDATE' : 'REJECT', 'redemption', request.params.id, { notes })
      
      // Broadcast event
      broadcastAdminEvent({ type: 'redemption_validated', redemption, validated })
      
      return reply.send(redemption)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to validate redemption' })
    }
  })

  fastify.get('/marketplace/stats', async (_request, reply) => {
    try {
      const [totalItems, activeItems, totalRedemptions, pendingRedemptions] = await Promise.all([
        Reward.countDocuments(),
        Reward.countDocuments({ isActive: true }),
        Redemption.countDocuments(),
        Redemption.countDocuments({ status: 'pending' })
      ])

      return reply.send({ totalItems, activeItems, totalRedemptions, pendingRedemptions })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch marketplace stats' })
    }
  })

  // ==================== REPORTS ====================

  fastify.get('/reports', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; status?: string; type?: string }
  }>, reply) => {
    try {
      const { page = '1', limit = '20', status, type } = request.query
      const skip = (parseInt(page) - 1) * parseInt(limit)
      const query: any = {}
      if (status) query.status = status
      if (type) query.type = type

      const [reports, total] = await Promise.all([
        Report.find(query).populate('reporterId reportedUserId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
        Report.countDocuments(query)
      ])

      return reply.send({ reports, total, page: parseInt(page), limit: parseInt(limit) })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch reports' })
    }
  })

  fastify.get('/reports/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply) => {
    try {
      const report = await Report.findById(request.params.id).populate('reporterId reportedUserId')
      if (!report) return reply.status(404).send({ error: 'Report not found' })
      return reply.send(report)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch report' })
    }
  })

  fastify.get('/reports/stats', async (_request, reply) => {
    try {
      const [total, pending, resolved, dismissed] = await Promise.all([
        Report.countDocuments(),
        Report.countDocuments({ status: 'pending' }),
        Report.countDocuments({ status: 'resolved' }),
        Report.countDocuments({ status: 'dismissed' })
      ])

      return reply.send({ total, pending, resolved, dismissed })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch report stats' })
    }
  })

  fastify.patch('/reports/:id/resolve', async (request: FastifyRequest<{
    Params: { id: string }
    Body: { resolution?: string; action?: string }
  }>, reply) => {
    try {
      const adminId = (request as any).user?.id || (request as any).user?._id
      const report = await Report.findByIdAndUpdate(
        request.params.id,
        { status: 'resolved', resolution: request.body.resolution, resolvedBy: adminId, resolvedAt: new Date() },
        { new: true }
      )
      if (!report) return reply.status(404).send({ error: 'Report not found' })
      
      // Log action
      await logAdminAction(adminId, 'RESOLVE', 'report', request.params.id, { resolution: request.body.resolution })
      
      return reply.send(report)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to resolve report' })
    }
  })

  fastify.patch('/reports/:id/dismiss', async (request: FastifyRequest<{
    Params: { id: string }
    Body: { reason?: string }
  }>, reply) => {
    try {
      const adminId = (request as any).user?.id || (request as any).user?._id
      const report = await Report.findByIdAndUpdate(
        request.params.id,
        { status: 'dismissed', dismissReason: request.body.reason, resolvedBy: adminId, resolvedAt: new Date() },
        { new: true }
      )
      if (!report) return reply.status(404).send({ error: 'Report not found' })
      
      // Log action
      await logAdminAction(adminId, 'DISMISS', 'report', request.params.id, { reason: request.body.reason })
      
      return reply.send(report)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to dismiss report' })
    }
  })

  // ==================== SESSIONS ====================

  fastify.get('/sessions/active', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string }
  }>, reply) => {
    try {
      const { page = '1', limit = '20' } = request.query
      const skip = (parseInt(page) - 1) * parseInt(limit)

      const [sessions, total] = await Promise.all([
        Session.find({ isActive: true }).populate('userId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
        Session.countDocuments({ isActive: true })
      ])

      return reply.send({ sessions, total, page: parseInt(page), limit: parseInt(limit) })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch active sessions' })
    }
  })

  fastify.get('/sessions/stats', async (_request, reply) => {
    try {
      const [total, active] = await Promise.all([
        Session.countDocuments(),
        Session.countDocuments({ isActive: true })
      ])

      return reply.send({ total, active })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch session stats' })
    }
  })

  fastify.delete('/sessions/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply) => {
    try {
      const adminId = (request as any).user?.sub || (request as any).userId
      const session = await Session.findByIdAndUpdate(
        request.params.id,
        { isActive: false, terminatedAt: new Date() },
        { new: true }
      )
      if (!session) return reply.status(404).send({ error: 'Session not found' })
      
      await logAdminAction(adminId, 'TERMINATE_SESSION', 'session', request.params.id, {
        userId: (session as any).userId?.toString(),
        terminatedAt: new Date().toISOString()
      })
      
      return reply.status(204).send()
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to terminate session' })
    }
  })

  // ==================== FRIENDSHIPS ====================

  fastify.get('/friendships', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; status?: string }
  }>, reply) => {
    try {
      const { page = '1', limit = '20', status } = request.query
      const skip = (parseInt(page) - 1) * parseInt(limit)
      const query: any = {}
      if (status) query.status = status

      const [friendships, total] = await Promise.all([
        Friendship.find(query).populate('userId friendId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
        Friendship.countDocuments(query)
      ])

      return reply.send({ friendships, total, page: parseInt(page), limit: parseInt(limit) })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch friendships' })
    }
  })

  fastify.delete('/friendships/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply) => {
    try {
      const adminId = (request as any).user?.sub || (request as any).userId
      const friendship = await Friendship.findByIdAndDelete(request.params.id)
      if (!friendship) return reply.status(404).send({ error: 'Friendship not found' })
      
      await logAdminAction(adminId, 'DELETE_FRIENDSHIP', 'friendship', request.params.id, {
        userId: (friendship as any).userId?.toString(),
        friendId: (friendship as any).friendId?.toString()
      })
      
      return reply.status(204).send()
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to remove friendship' })
    }
  })

  // ==================== CODES ====================

  fastify.get('/codes', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; isUsed?: string; isActive?: string }
  }>, reply) => {
    try {
      const { page = '1', limit = '20', isUsed, isActive } = request.query
      const skip = (parseInt(page) - 1) * parseInt(limit)
      const query: any = {}
      if (isUsed !== undefined) query.isUsed = isUsed === 'true'
      if (isActive !== undefined) query.isActive = isActive === 'true'

      const [codes, total] = await Promise.all([
        Code.find(query).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
        Code.countDocuments(query)
      ])

      return reply.send({ codes, total, page: parseInt(page), limit: parseInt(limit) })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch codes' })
    }
  })

  fastify.post('/codes/generate', async (request: FastifyRequest<{
    Body: { count: number; prefix?: string; pointsValue?: number; expiresAt?: string }
  }>, reply) => {
    try {
      const adminId = (request as any).user?.sub || (request as any).userId
      const { count, prefix = 'YALLA', pointsValue = 100, expiresAt } = request.body
      const codes = []

      for (let i = 0; i < count; i++) {
        const code = `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
        codes.push({
          code,
          pointsValue,
          isActive: true,
          isUsed: false,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined
        })
      }

      const createdCodes = await Code.insertMany(codes)
      
      await logAdminAction(adminId, 'GENERATE_CODES', 'code', 'batch', {
        count: createdCodes.length,
        prefix,
        pointsValue,
        expiresAt
      })
      
      return reply.status(201).send({ codes: createdCodes, count: createdCodes.length })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to generate codes' })
    }
  })

  fastify.patch('/codes/:id/deactivate', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply) => {
    try {
      const adminId = (request as any).user?.sub || (request as any).userId
      const code = await Code.findByIdAndUpdate(
        request.params.id,
        { isActive: false },
        { new: true }
      )
      if (!code) return reply.status(404).send({ error: 'Code not found' })
      
      await logAdminAction(adminId, 'DEACTIVATE_CODE', 'code', request.params.id, {
        code: (code as any).code,
        pointsValue: (code as any).pointsValue
      })
      
      return reply.send(code)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to deactivate code' })
    }
  })

  // ==================== OFFLINE QUEUE ====================

  fastify.get('/offline-queue', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; status?: string }
  }>, reply) => {
    try {
      const { page = '1', limit = '20', status } = request.query
      const skip = (parseInt(page) - 1) * parseInt(limit)
      const query: any = {}
      if (status) query.status = status

      const [items, total] = await Promise.all([
        OfflineQueue.find(query).populate('userId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
        OfflineQueue.countDocuments(query)
      ])

      return reply.send({ items, total, page: parseInt(page), limit: parseInt(limit) })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch offline queue' })
    }
  })

  fastify.delete('/offline-queue/clear', async (request: FastifyRequest, reply) => {
    try {
      const adminId = (request as any).user?.sub || (request as any).userId
      const result = await OfflineQueue.deleteMany({ status: 'resolved' })
      
      await logAdminAction(adminId, 'CLEAR_OFFLINE_QUEUE', 'offline_queue', 'batch', {
        deletedCount: result.deletedCount
      })
      
      return reply.send({ deleted: result.deletedCount })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to clear resolved items' })
    }
  })

  // ==================== DEVICE TOKENS ====================

  fastify.get('/device-tokens', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; platform?: string }
  }>, reply) => {
    try {
      const { page = '1', limit = '20', platform } = request.query
      const skip = (parseInt(page) - 1) * parseInt(limit)
      const query: any = {}
      if (platform) query.platform = platform

      const [tokens, total] = await Promise.all([
        DeviceToken.find(query).populate('userId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
        DeviceToken.countDocuments(query)
      ])

      return reply.send({ tokens, total, page: parseInt(page), limit: parseInt(limit) })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch device tokens' })
    }
  })

  fastify.get('/device-tokens/stats', async (_request, reply) => {
    try {
      const stats = await DeviceToken.aggregate([
        { $group: { _id: '$platform', count: { $sum: 1 } } }
      ])

      const total = await DeviceToken.countDocuments()
      return reply.send({ total, byPlatform: stats })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch device token stats' })
    }
  })

  fastify.delete('/device-tokens/:id', async (request: FastifyRequest<{
    Params: { id: string }
  }>, reply) => {
    try {
      const adminId = (request as any).user?.sub || (request as any).userId
      const token = await DeviceToken.findByIdAndDelete(request.params.id)
      if (!token) return reply.status(404).send({ error: 'Device token not found' })
      
      await logAdminAction(adminId, 'REVOKE_DEVICE_TOKEN', 'device_token', request.params.id, {
        userId: (token as any).userId?.toString(),
        platform: (token as any).platform
      })
      
      return reply.status(204).send()
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to revoke device token' })
    }
  })

  // ==================== REDEMPTIONS ====================

  fastify.get('/redemptions', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; status?: string }
  }>, reply) => {
    try {
      const { page = '1', limit = '20', status } = request.query
      const skip = (parseInt(page) - 1) * parseInt(limit)
      const query: any = {}
      if (status) query.status = status

      const [redemptions, total] = await Promise.all([
        Redemption.find(query).populate('userId rewardId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
        Redemption.countDocuments(query)
      ])

      return reply.send({ redemptions, total, page: parseInt(page), limit: parseInt(limit) })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch redemptions' })
    }
  })

  fastify.post('/redemptions/:id/validate', async (request: FastifyRequest<{
    Params: { id: string }
    Body: { validated: boolean; notes?: string }
  }>, reply) => {
    try {
      const adminId = (request as any).user?.sub || (request as any).userId
      const { validated, notes } = request.body
      const redemption = await Redemption.findByIdAndUpdate(
        request.params.id,
        { status: validated ? 'fulfilled' : 'rejected', notes, fulfilledAt: validated ? new Date() : undefined },
        { new: true }
      ).populate('userId rewardId')
      if (!redemption) return reply.status(404).send({ error: 'Redemption not found' })
      
      await logAdminAction(adminId, validated ? 'VALIDATE_REDEMPTION' : 'REJECT_REDEMPTION', 'redemption', request.params.id, {
        userId: (redemption as any).userId?._id?.toString() || (redemption as any).userId?.toString(),
        rewardName: (redemption as any).rewardId?.name,
        notes
      })
      
      return reply.send(redemption)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to validate redemption' })
    }
  })

  fastify.post('/rewards/qr-scan', async (request: FastifyRequest<{
    Body: { qrCode: string; scannedBy: string }
  }>, reply) => {
    try {
      const adminId = (request as any).user?.sub || (request as any).userId
      const { qrCode, scannedBy } = request.body
      const redemption = await Redemption.findOneAndUpdate(
        { qrCode, status: 'pending' },
        { status: 'fulfilled', fulfilledAt: new Date(), fulfilledBy: scannedBy },
        { new: true }
      ).populate('userId rewardId')

      if (!redemption) return reply.status(404).send({ error: 'Invalid or already used QR code' })
      
      await logAdminAction(adminId, 'QR_SCAN_REDEMPTION', 'redemption', (redemption as any)._id.toString(), {
        userId: (redemption as any).userId?._id?.toString() || (redemption as any).userId?.toString(),
        rewardName: (redemption as any).rewardId?.name,
        scannedBy,
        qrCode: qrCode.substring(0, 10) + '...'
      })
      
      return reply.send(redemption)
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to process QR scan' })
    }
  })

  // ==================== ACTIVITY LOGS ====================

  fastify.get('/activity-logs', async (request: FastifyRequest<{
    Querystring: { page?: string; limit?: string; action?: string; userId?: string; startDate?: string; endDate?: string }
  }>, reply) => {
    try {
      const { page = '1', limit = '50', action, userId, startDate, endDate } = request.query
      const skip = (parseInt(page) - 1) * parseInt(limit)
      const query: any = {}
      if (action) query.action = action
      if (userId) query.userId = userId
      if (startDate || endDate) {
        query.createdAt = {}
        if (startDate) query.createdAt.$gte = new Date(startDate)
        if (endDate) query.createdAt.$lte = new Date(endDate)
      }

      console.log('[ACTIVITY-LOGS] Fetching logs with query:', JSON.stringify(query), 'skip:', skip, 'limit:', limit)

      const [logs, total] = await Promise.all([
        AuditLog.find(query).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }).lean(),
        AuditLog.countDocuments(query)
      ])

      console.log('[ACTIVITY-LOGS] Found', logs.length, 'logs, total:', total)

      // Collect unique admin user IDs to fetch their details
      // Filter out non-ObjectId values like "system"
      const isValidObjectId = (id: string) => {
        return id && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id)
      }
      const adminIds = [...new Set(logs.map((log: any) => log.userId).filter(id => id && isValidObjectId(id)))]
      const adminUsers = adminIds.length > 0
        ? await User.find({ _id: { $in: adminIds } }).select('_id displayName email role').lean()
        : []
      const adminMap = new Map(adminUsers.map((u: any) => [u._id.toString(), u]))

      // Enhance logs with actor details
      const enhancedLogs = logs.map((log: any) => {
        const admin = log.userId ? adminMap.get(log.userId.toString()) : null
        return {
          ...log,
          actor: admin ? {
            id: admin._id,
            displayName: admin.displayName || 'Unknown Admin',
            email: admin.email,
            role: admin.role,
          } : log.userEmail ? {
            id: log.userId,
            displayName: log.userEmail,
            email: log.userEmail,
            role: log.userRole || 'admin',
          } : null,
          displayAction: log.action?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()),
          displayResource: log.resource?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()),
        }
      })

      return reply.send({ logs: enhancedLogs, total, page: parseInt(page), limit: parseInt(limit) })
    } catch (error) {
      console.error('Failed to fetch activity logs:', error)
      return reply.status(500).send({ error: 'Failed to fetch activity logs' })
    }
  })

  fastify.get('/activity-logs/statistics', async (request: FastifyRequest<{
    Querystring: { period?: string }
  }>, reply) => {
    try {
      const { period = '7d' } = request.query
      const days = parseInt(period) || 7
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      const stats = await AuditLog.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])

      const total = await AuditLog.countDocuments({ createdAt: { $gte: startDate } })
      return reply.send({ total, byAction: stats, period })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch activity log statistics' })
    }
  })

  fastify.delete('/activity-logs/clear', async (request: FastifyRequest<{
    Querystring: { olderThanDays?: string }
  }>, reply) => {
    try {
      const { olderThanDays = '90' } = request.query
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(olderThanDays))

      const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoffDate } })
      return reply.send({ deleted: result.deletedCount })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to clear old logs' })
    }
  })

  fastify.get('/activity-logs/export', async (request: FastifyRequest<{
    Querystring: { startDate?: string; endDate?: string; format?: string }
  }>, reply) => {
    try {
      const { startDate, endDate, format = 'json' } = request.query
      const query: any = {}
      if (startDate || endDate) {
        query.createdAt = {}
        if (startDate) query.createdAt.$gte = new Date(startDate)
        if (endDate) query.createdAt.$lte = new Date(endDate)
      }

      const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(10000).lean()

      if (format === 'csv') {
        const csv = logs.map(log => {
          return `${log._id},${log.action},${log.userId || ''},${log.userEmail || ''},${log.resource || ''},${log.createdAt}`
        }).join('\n')
        reply.header('Content-Type', 'text/csv')
        reply.header('Content-Disposition', 'attachment; filename=activity-logs.csv')
        return reply.send(`id,action,userId,userEmail,resource,createdAt\n${csv}`)
      }

      return reply.send({ logs, count: logs.length })
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to export activity logs' })
    }
  })

  fastify.post('/activity-logs', async (request: FastifyRequest<{
    Body: { 
      action: string; 
      type?: string;
      message?: string;
      actor?: { id?: string; email?: string; name?: string };
      target?: any;
      details?: any; 
    }
  }>, reply) => {
    try {
      const body = request.body;
      
      // Map frontend format to AuditLog schema
      const logData = {
        userId: body.actor?.id,
        userEmail: body.actor?.email,
        userRole: 'admin' as const,
        action: body.action,
        resource: body.type || 'admin_action',
        resourceId: body.target?.id,
        category: 'admin' as const,
        severity: 'low' as const,
        success: true,
        description: body.message,
        metadata: body.details,
      };

      const log = await AuditLog.create(logData);
      return reply.status(201).send(log);
    } catch (error) {
      console.error('Failed to create activity log:', error);
      return reply.status(500).send({ error: 'Failed to create activity log' });
    }
  })
}
