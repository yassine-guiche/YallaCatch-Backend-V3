import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { OfflineQueue } from '@/models/OfflineQueue';
import { logAdminAction } from '../utils/audit-helper';

export default async function offlineQueueRoutes(fastify: FastifyInstance) {
    fastify.addHook('onRequest', authenticate);
    fastify.addHook('onRequest', requireAdmin);
    fastify.addHook('onRequest', adminRateLimit);

    fastify.get('/', async (request: FastifyRequest<{
        Querystring: { page?: string; limit?: string; status?: string }
    }>, reply) => {
        try {
            const { page = '1', limit = '20', status } = request.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const query: Record<string, unknown> = {};
            if (status) query.status = status;

            const [items, total] = await Promise.all([
                OfflineQueue.find(query).populate('userId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
                OfflineQueue.countDocuments(query)
            ]);

            return reply.send({ items, total, page: parseInt(page), limit: parseInt(limit) });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch offline queue' });
        }
    });

    fastify.delete('/clear', async (request: FastifyRequest, reply) => {
        try {
            const adminId = request.user?.sub;
            const result = await OfflineQueue.deleteMany({ status: 'resolved' });

            await logAdminAction(adminId, 'CLEAR_OFFLINE_QUEUE', 'offline_queue', 'batch', {
                deletedCount: result.deletedCount
            });

            return reply.send({ deleted: result.deletedCount });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to clear resolved items' });
        }
    });
}
