import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { Friendship } from '@/models/Friendship';
import { logAdminAction } from '../utils/audit-helper';

export default async function friendshipsRoutes(fastify: FastifyInstance) {
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

            const [friendships, total] = await Promise.all([
                Friendship.find(query).populate('userId friendId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
                Friendship.countDocuments(query)
            ]);

            return reply.send({ friendships, total, page: parseInt(page), limit: parseInt(limit) });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch friendships' });
        }
    });

    fastify.delete('/:id', async (request: FastifyRequest<{
        Params: { id: string }
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const friendship = await Friendship.findByIdAndDelete(request.params.id);
            if (!friendship) return reply.status(404).send({ error: 'Friendship not found' });

            await logAdminAction(adminId, 'DELETE_FRIENDSHIP', 'friendship', request.params.id, {
                userId: (friendship as unknown as Record<string, { toString(): string }>).userId?.toString(),
                friendId: (friendship as unknown as Record<string, { toString(): string }>).friendId?.toString()
            });

            return reply.status(204).send();
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to remove friendship' });
        }
    });
}
