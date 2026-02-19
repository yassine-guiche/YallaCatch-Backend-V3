import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { Achievement } from '@/models/Achievement';
import { UserAchievement } from '@/models/UserAchievement';
import { GamificationService } from '@/modules/gamification';
import { CacheService } from '@/services/cache';
import { broadcastAdminEvent } from '@/lib/websocket';
import { logAdminAction } from '../utils/audit-helper';

export default async function achievementsRoutes(fastify: FastifyInstance) {
    fastify.addHook('onRequest', authenticate);
    fastify.addHook('onRequest', requireAdmin);
    fastify.addHook('onRequest', adminRateLimit);

    // Get achievements for a specific user (admin)
    fastify.get('/user/:userId', async (request: FastifyRequest<{
        Params: { userId: string }
    }>, reply) => {
        try {
            const { userId } = request.params;
            if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
                return reply.status(400).send({ error: 'Invalid userId' });
            }
            const achievements = await GamificationService.getUserAchievements(userId);
            return reply.send({ success: true, data: achievements });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch user achievements' });
        }
    });

    // GET achievements with caching
    fastify.get('/', async (request: FastifyRequest<{
        Querystring: { page?: string; limit?: string; category?: string }
    }>, reply) => {
        try {
            const { page = '1', limit = '20', category } = request.query;
            const cacheKey = `admin:achievements:${page}:${limit}:${category || 'all'}`;

            // Try cache first
            const cached = await CacheService.get(cacheKey);
            if (cached) {
                return reply.send(cached);
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const query: Record<string, unknown> = {};
            if (category) query.category = category;

            const [achievements, total] = await Promise.all([
                Achievement.find(query).skip(skip).limit(parseInt(limit)).sort({ order: 1 }),
                Achievement.countDocuments(query)
            ]);

            const result = { achievements, total, page: parseInt(page), limit: parseInt(limit) };
            await CacheService.set(cacheKey, result, { ttl: 300 }); // 5 min cache

            return reply.send(result);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch achievements' });
        }
    });

    fastify.get('/:id', async (request: FastifyRequest<{
        Params: { id: string }
    }>, reply) => {
        try {
            const achievement = await Achievement.findById(request.params.id);
            if (!achievement) return reply.status(404).send({ error: 'Achievement not found' });
            return reply.send(achievement);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch achievement' });
        }
    });

    fastify.post('/', async (request: FastifyRequest<{
        Body: Record<string, unknown>
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const achievement = await Achievement.create(request.body);

            // Log action
            await logAdminAction(adminId, 'CREATE', 'achievement', achievement._id.toString(), { name: achievement.name });

            // Invalidate cache
            await CacheService.invalidate('admin:achievements:*');

            // Broadcast event
            broadcastAdminEvent({ type: 'achievement_created', achievement });

            return reply.status(201).send(achievement);
        } catch (error) {
            const err = error as Error;
            console.error('Failed to create achievement:', err?.message || error);
            return reply.status(500).send({ error: err?.message || 'Failed to create achievement' });
        }
    });

    fastify.put('/:id', async (request: FastifyRequest<{
        Params: { id: string }
        Body: Record<string, unknown>
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const achievement = await Achievement.findByIdAndUpdate(
                request.params.id,
                request.body,
                { new: true }
            );
            if (!achievement) return reply.status(404).send({ error: 'Achievement not found' });

            // Log action
            await logAdminAction(adminId, 'UPDATE', 'achievement', request.params.id, { changes: request.body });

            // Invalidate cache
            await CacheService.invalidate('admin:achievements:*');

            // Broadcast event
            broadcastAdminEvent({ type: 'achievement_updated', achievement });

            return reply.send(achievement);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to update achievement' });
        }
    });

    fastify.delete('/:id', async (request: FastifyRequest<{
        Params: { id: string }
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const achievement = await Achievement.findByIdAndDelete(request.params.id);
            if (!achievement) return reply.status(404).send({ error: 'Achievement not found' });

            // Log action
            await logAdminAction(adminId, 'DELETE', 'achievement', request.params.id, { name: achievement.name });

            // Invalidate cache
            await CacheService.invalidate('admin:achievements:*');

            // Broadcast event
            broadcastAdminEvent({ type: 'achievement_deleted', achievementId: request.params.id });

            return reply.status(204).send();
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to delete achievement' });
        }
    });

    fastify.post('/unlock', async (request: FastifyRequest<{
        Body: { userId: string; achievementId: string }
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const { userId, achievementId } = request.body;
            const userAchievement = await UserAchievement.findOneAndUpdate(
                { userId, achievementId },
                { progress: 100, unlockedAt: new Date() },
                { upsert: true, new: true }
            );

            // Log action
            await logAdminAction(adminId, 'UNLOCK', 'achievement', achievementId, { userId });

            // Broadcast event
            broadcastAdminEvent({ type: 'achievement_unlocked', userId, achievementId });

            return reply.send(userAchievement);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to unlock achievement' });
        }
    });
}
