import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { Report } from '@/models/Report';
import { logAdminAction } from '../utils/audit-helper';

export default async function reportsRoutes(fastify: FastifyInstance) {
    fastify.addHook('onRequest', authenticate);
    fastify.addHook('onRequest', requireAdmin);
    fastify.addHook('onRequest', adminRateLimit);

    fastify.get('/', async (request: FastifyRequest<{
        Querystring: { page?: string; limit?: string; status?: string; type?: string }
    }>, reply) => {
        try {
            const { page = '1', limit = '20', status, type } = request.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const query: Record<string, unknown> = {};
            if (status) query.status = status;
            if (type) query.type = type;

            const [reports, total] = await Promise.all([
                Report.find(query).populate('reporterId reportedUserId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
                Report.countDocuments(query)
            ]);

            return reply.send({ reports, total, page: parseInt(page), limit: parseInt(limit) });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch reports' });
        }
    });

    fastify.get('/:id', async (request: FastifyRequest<{
        Params: { id: string }
    }>, reply) => {
        try {
            const report = await Report.findById(request.params.id).populate('reporterId reportedUserId');
            if (!report) return reply.status(404).send({ error: 'Report not found' });
            return reply.send(report);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch report' });
        }
    });

    // Get reports by user (reporter or reported)
    fastify.get('/user/:userId', async (request: FastifyRequest<{
        Params: { userId: string };
        Querystring: { page?: string; limit?: string; role?: string }
    }>, reply) => {
        try {
            const { userId } = request.params;
            const { page = '1', limit = '20', role = 'both' } = request.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);

            // Filter by reporter, reported, or both
            let query: Record<string, unknown> = {};
            if (role === 'reporter') {
                query = { reporterId: userId };
            } else if (role === 'reported') {
                query = { reportedUserId: userId };
            } else {
                query = { $or: [{ reporterId: userId }, { reportedUserId: userId }] };
            }

            const [reports, total] = await Promise.all([
                Report.find(query).populate('reporterId reportedUserId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
                Report.countDocuments(query)
            ]);

            return reply.send({ reports, total, page: parseInt(page), limit: parseInt(limit) });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch user reports' });
        }
    });

    // Get reports by capture ID (reports referencing a specific capture)
    fastify.get('/capture/:captureId', async (request: FastifyRequest<{
        Params: { captureId: string };
        Querystring: { page?: string; limit?: string }
    }>, reply) => {
        try {
            const { captureId } = request.params;
            const { page = '1', limit = '20' } = request.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);

            const query = { captureId };
            const [reports, total] = await Promise.all([
                Report.find(query).populate('reporterId reportedUserId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
                Report.countDocuments(query)
            ]);

            return reply.send({ reports, total, page: parseInt(page), limit: parseInt(limit) });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch capture reports' });
        }
    });

    fastify.get('/stats', async (_request, reply) => {
        try {
            const [total, pending, resolved, dismissed] = await Promise.all([
                Report.countDocuments(),
                Report.countDocuments({ status: 'pending' }),
                Report.countDocuments({ status: 'resolved' }),
                Report.countDocuments({ status: 'dismissed' })
            ]);

            return reply.send({ total, pending, resolved, dismissed });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch report stats' });
        }
    });

    fastify.patch('/:id/resolve', async (request: FastifyRequest<{
        Params: { id: string }
        Body: { resolution?: string; action?: string }
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const report = await Report.findByIdAndUpdate(
                request.params.id,
                { status: 'resolved', resolution: request.body.resolution, resolvedBy: adminId, resolvedAt: new Date() },
                { new: true }
            );
            if (!report) return reply.status(404).send({ error: 'Report not found' });

            // Log action
            await logAdminAction(adminId, 'RESOLVE', 'report', request.params.id, { resolution: request.body.resolution });

            return reply.send(report);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to resolve report' });
        }
    });

    fastify.patch('/:id/dismiss', async (request: FastifyRequest<{
        Params: { id: string }
        Body: { reason?: string }
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const report = await Report.findByIdAndUpdate(
                request.params.id,
                { status: 'dismissed', dismissReason: request.body.reason, resolvedBy: adminId, resolvedAt: new Date() },
                { new: true }
            );
            if (!report) return reply.status(404).send({ error: 'Report not found' });

            // Log action
            await logAdminAction(adminId, 'DISMISS', 'report', request.params.id, { reason: request.body.reason });

            return reply.send(report);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to dismiss report' });
        }
    });
}
