import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { AdminSystemService } from '../services/admin-system.service';
import { AdminUsersService } from '../services/admin-users.service';
import AdminPrizesService from '../services/admin-prizes.service';
import { audit } from '@/lib/audit-logger';

export default async function systemRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireAdmin);
  fastify.addHook('preHandler', adminRateLimit);

  // ... (existing routes omitted for brevity, focusing on relevant connections below)

  // GET /system/health
  fastify.get('/system/health', async (request: FastifyRequest, reply) => {
    const health = await AdminSystemService.getHealthStatus();
    return reply.send(health);
  });

  // GET /system/metrics
  fastify.get('/system/metrics', async (request: FastifyRequest, reply) => {
    const metrics = await AdminSystemService.getSystemMetrics();
    return reply.send(metrics);
  });

  // GET /system/logs
  fastify.get('/system/logs', async (request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>, reply) => {
    const query = request.query;
    const logs = await AdminSystemService.getSystemLogs({
      page: parseInt(query.page || '1'),
      limit: parseInt(query.limit || '50')
    });
    return reply.send(logs);
  });

  // GET /system/stats
  fastify.get('/system/stats', async (_request, reply) => {
    const stats = await AdminSystemService.getSystemStats();
    return reply.send(stats);
  });

  // POST /system/cache/clear
  fastify.post('/system/cache/clear', async (request: FastifyRequest, reply) => {
    const adminId = request.user?.sub;
    const result = await AdminSystemService.clearCache();
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action: 'CLEAR_CACHE',
      resource: 'system',
      category: 'admin',
      severity: 'medium',
      description: 'Cleared system cache',
    });
    return reply.send(result);
  });

  // POST /system/backup
  fastify.post('/system/backup', async (request: FastifyRequest, reply) => {
    const adminId = request.user?.sub;
    const result = await AdminSystemService.createBackup(adminId);
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action: 'CREATE_BACKUP',
      resource: 'system',
      category: 'admin',
      severity: 'high',
      description: 'Created system backup',
      metadata: result,
    });
    return reply.send(result);
  });

  // POST /system/restore
  fastify.post('/system/restore', async (request: FastifyRequest, reply) => {
    const { backupId } = request.body as { backupId: string };
    const adminId = request.user?.sub;
    const result = await AdminSystemService.restoreBackup(adminId, backupId);
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action: 'RESTORE_BACKUP',
      resource: 'system',
      resourceId: backupId,
      category: 'admin',
      severity: 'high',
      description: `Restored backup: ${backupId}`,
      metadata: { backupId },
    });
    return reply.send(result);
  });

  // POST /backup/create
  fastify.post('/backup/create', async (request: FastifyRequest, reply) => {
    const adminId = request.user?.sub;
    const result = await AdminSystemService.createBackup(adminId);
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action: 'CREATE_BACKUP',
      resource: 'system',
      category: 'admin',
      severity: 'high',
      description: 'Created system backup',
      metadata: result,
    });
    return reply.send(result);
  });

  // GET /logs
  fastify.get('/logs', async (request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>, reply) => {
    const query = request.query;
    const logs = await AdminSystemService.getSystemLogs({
      page: parseInt(query.page || '1'),
      limit: parseInt(query.limit || '50')
    });
    return reply.send(logs);
  });

  // GET /audit-logs
  fastify.get('/audit-logs', async (request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>, reply) => {
    const query = request.query;
    const logs = await AdminSystemService.getSystemLogs({
      page: parseInt(query.page || '1'),
      limit: parseInt(query.limit || '50')
    });
    return reply.send(logs);
  });

  // POST /bulk-operations
  fastify.post('/bulk-operations', async (request: FastifyRequest, reply) => {
    const { action, ids, data } = request.body as { action: string; ids: string[]; data?: Record<string, unknown> };
    const adminId = request.user?.sub;

    if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ success: false, error: 'Invalid bulk operation request' });
    }

    try {
      let result;

      switch (action) {
        case 'delete_users':
          result = await AdminUsersService.bulkDelete(ids, adminId);
          result.message = 'Bulk delete completed';
          break;
        case 'approve_prizes':
          result = await AdminPrizesService.bulkApprove(ids, adminId);
          result.message = 'Bulk approve completed';
          break;
        default:
          return reply.status(400).send({ success: false, error: 'Unsupported bulk action' });
      }

      // No need to double-log here as services handle specific audit logging now
      // Just returning the aggregated result
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bulk operation failed';
      return reply.status(500).send({ success: false, error: message });
    }
  });
}
