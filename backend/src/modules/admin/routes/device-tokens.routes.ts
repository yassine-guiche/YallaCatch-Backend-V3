import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { DeviceToken } from '@/models/DeviceToken';
import { logAdminAction } from '../utils/audit-helper';

export default async function deviceTokensRoutes(fastify: FastifyInstance) {
    fastify.addHook('onRequest', authenticate);
    fastify.addHook('onRequest', requireAdmin);
    fastify.addHook('onRequest', adminRateLimit);

    fastify.get('/', async (request: FastifyRequest<{
        Querystring: { page?: string; limit?: string; platform?: string }
    }>, reply) => {
        try {
            const { page = '1', limit = '20', platform } = request.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const query: Record<string, unknown> = {};
            if (platform) query.platform = platform;

            const [tokens, total] = await Promise.all([
                DeviceToken.find(query).populate('userId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
                DeviceToken.countDocuments(query)
            ]);

            return reply.send({ tokens, total, page: parseInt(page), limit: parseInt(limit) });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch device tokens' });
        }
    });

    fastify.get('/stats', async (_request, reply) => {
        try {
            const stats = await DeviceToken.aggregate([
                { $group: { _id: '$platform', count: { $sum: 1 } } }
            ]);

            const total = await DeviceToken.countDocuments();
            return reply.send({ total, byPlatform: stats });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch device token stats' });
        }
    });

    fastify.delete('/:id', async (request: FastifyRequest<{
        Params: { id: string }
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const token = await DeviceToken.findByIdAndDelete(request.params.id);
            if (!token) return reply.status(404).send({ error: 'Device token not found' });

            await logAdminAction(adminId, 'REVOKE_DEVICE_TOKEN', 'device_token', request.params.id, {
                userId: token.userId?.toString(),
                platform: token.platform
            });

            return reply.status(204).send();
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to revoke device token' });
        }
    });
}
