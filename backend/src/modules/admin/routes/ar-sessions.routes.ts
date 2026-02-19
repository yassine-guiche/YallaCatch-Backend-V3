import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { ARSession } from '@/models/ARSession';

export default async function arSessionsRoutes(fastify: FastifyInstance) {
    fastify.addHook('onRequest', authenticate);
    fastify.addHook('onRequest', requireAdmin);
    fastify.addHook('onRequest', adminRateLimit);

    // List AR Sessions
    fastify.get('/', async (request: FastifyRequest<{
        Querystring: { page?: string; limit?: string; status?: string; userId?: string }
    }>, reply) => {
        try {
            const { page = '1', limit = '20', status, userId } = request.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const query: any = {};
            if (status) query.status = status;
            if (userId) query.userId = userId;

            const [sessions, total] = await Promise.all([
                ARSession.find(query).populate('userId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
                ARSession.countDocuments(query)
            ]);

            return reply.send({ sessions, total, page: parseInt(page), limit: parseInt(limit) });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch AR sessions' });
        }
    });

    // AR Stats
    fastify.get('/stats', async (_request, reply) => {
        try {
            const [total, active, completed] = await Promise.all([
                ARSession.countDocuments(),
                ARSession.countDocuments({ status: 'active' }),
                ARSession.countDocuments({ status: 'completed' })
            ]);

            return reply.send({ stats: { total, active, completed } });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch AR stats' });
        }
    });
}
