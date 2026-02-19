import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { Session } from '@/models/Session';
import { logAdminAction } from '../utils/audit-helper';

export default async function sessionsRoutes(fastify: FastifyInstance) {
    fastify.addHook('onRequest', authenticate);
    fastify.addHook('onRequest', requireAdmin);
    fastify.addHook('onRequest', adminRateLimit);

    fastify.get('/active', async (request: FastifyRequest<{
        Querystring: { page?: string; limit?: string }
    }>, reply) => {
        try {
            const { page = '1', limit = '20' } = request.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);

            const [sessions, total] = await Promise.all([
                Session.find({ isActive: true }).populate('userId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
                Session.countDocuments({ isActive: true })
            ]);

            return reply.send({ sessions, total, page: parseInt(page), limit: parseInt(limit) });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch active sessions' });
        }
    });

    fastify.get('/stats', async (_request, reply) => {
        try {
            const [total, active] = await Promise.all([
                Session.countDocuments(),
                Session.countDocuments({ isActive: true })
            ]);

            return reply.send({ total, active });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch session stats' });
        }
    });

    fastify.delete('/:id', async (request: FastifyRequest<{
        Params: { id: string }
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const session = await Session.findByIdAndUpdate(
                request.params.id,
                { isActive: false, terminatedAt: new Date() },
                { new: true }
            );
            if (!session) return reply.status(404).send({ error: 'Session not found' });

            await logAdminAction(adminId, 'TERMINATE_SESSION', 'session', request.params.id, {
                userId: session.userId?.toString(),
                terminatedAt: new Date().toISOString()
            });

            return reply.status(204).send();
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to terminate session' });
        }
    });
}
