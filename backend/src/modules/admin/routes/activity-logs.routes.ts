import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { AuditLog } from '@/models/AuditLog';
import { User } from '@/models/User';

export default async function activityLogsRoutes(fastify: FastifyInstance) {
    fastify.addHook('onRequest', authenticate);
    fastify.addHook('onRequest', requireAdmin);
    fastify.addHook('onRequest', adminRateLimit);

    fastify.get('/', async (request: FastifyRequest<{
        Querystring: { page?: string; limit?: string; action?: string; userId?: string; startDate?: string; endDate?: string }
    }>, reply) => {
        try {
            const { page = '1', limit = '50', action, userId, startDate, endDate } = request.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const query: Record<string, unknown> = {};
            if (action) query.action = action;
            if (userId) query.userId = userId;
            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate) (query.createdAt as Record<string, Date>).$gte = new Date(startDate);
                if (endDate) (query.createdAt as Record<string, Date>).$lte = new Date(endDate);
            }

            console.log('[ACTIVITY-LOGS] Fetching logs with query:', JSON.stringify(query), 'skip:', skip, 'limit:', limit);

            const [logs, total] = await Promise.all([
                AuditLog.find(query).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }).lean(),
                AuditLog.countDocuments(query)
            ]);

            console.log('[ACTIVITY-LOGS] Found', logs.length, 'logs, total:', total);

            // Collect unique admin user IDs to fetch their details
            const isValidObjectId = (id: string) => {
                return id && id.length === 24 && /^[0-9a-fA-F]{24}$/.test(id);
            }
            const adminIds = [...new Set(logs.map((log) => (log as Record<string, unknown>).userId as string).filter(id => id && isValidObjectId(id)))];
            const adminUsers = adminIds.length > 0
                ? await User.find({ _id: { $in: adminIds } }).select('_id displayName email role').lean()
                : [];
            const adminMap = new Map(adminUsers.map((u) => [u._id.toString(), u]));

            // Enhance logs with actor details
            const enhancedLogs = logs.map((log) => {
                const logRecord = log as Record<string, unknown>;
                const admin = logRecord.userId ? adminMap.get((logRecord.userId as object).toString()) : null;
                return {
                    ...logRecord,
                    actor: admin ? {
                        id: admin._id,
                        displayName: admin.displayName || 'Unknown Admin',
                        email: admin.email,
                        role: admin.role,
                    } : logRecord.userEmail ? {
                        id: logRecord.userId,
                        displayName: logRecord.userEmail,
                        email: logRecord.userEmail,
                        role: logRecord.userRole || 'admin',
                    } : null,
                    displayAction: (logRecord.action as string)?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()),
                    displayResource: (logRecord.resource as string)?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()),
                };
            });

            return reply.send({ logs: enhancedLogs, total, page: parseInt(page), limit: parseInt(limit) });
        } catch (error) {
            console.error('Failed to fetch activity logs:', error);
            return reply.status(500).send({ error: 'Failed to fetch activity logs' });
        }
    });

    fastify.get('/statistics', async (request: FastifyRequest<{
        Querystring: { period?: string }
    }>, reply) => {
        try {
            const { period = '7d' } = request.query;
            const days = parseInt(period) || 7;
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const stats = await AuditLog.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                { $group: { _id: '$action', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);

            const total = await AuditLog.countDocuments({ createdAt: { $gte: startDate } });
            return reply.send({ total, byAction: stats, period });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch activity log statistics' });
        }
    });

    fastify.delete('/clear', async (request: FastifyRequest<{
        Querystring: { olderThanDays?: string }
    }>, reply) => {
        try {
            const { olderThanDays = '90' } = request.query;
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - parseInt(olderThanDays));

            const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoffDate } });
            return reply.send({ deleted: result.deletedCount });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to clear old logs' });
        }
    });

    fastify.get('/export', async (request: FastifyRequest<{
        Querystring: { startDate?: string; endDate?: string; format?: string }
    }>, reply) => {
        try {
            const { startDate, endDate, format = 'json' } = request.query;
            const query: Record<string, unknown> = {};
            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate) (query.createdAt as Record<string, Date>).$gte = new Date(startDate);
                if (endDate) (query.createdAt as Record<string, Date>).$lte = new Date(endDate);
            }

            const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(10000).lean();

            if (format === 'csv') {
                const csv = logs.map((log) => {
                    const logRecord = log as Record<string, unknown>;
                    return `${logRecord._id},${logRecord.action},${logRecord.userId || ''},${logRecord.userEmail || ''},${logRecord.resource || ''},${logRecord.createdAt}`;
                }).join('\n');
                reply.header('Content-Type', 'text/csv');
                reply.header('Content-Disposition', 'attachment; filename=activity-logs.csv');
                return reply.send(`id,action,userId,userEmail,resource,createdAt\n${csv}`);
            }

            return reply.send({ logs, count: logs.length });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to export activity logs' });
        }
    });

    fastify.post('/', async (request: FastifyRequest<{
        Body: {
            action: string;
            type?: string;
            message?: string;
            actor?: { id?: string; email?: string; name?: string };
            target?: Record<string, unknown>;
            details?: Record<string, unknown>;
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
    });
}
