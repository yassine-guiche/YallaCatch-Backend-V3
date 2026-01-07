import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { AdminSystemService } from '../services/admin-system.service';
import { audit } from '@/lib/audit-logger';

export default async function systemRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireAdmin);
  fastify.addHook('preHandler', adminRateLimit);

  // GET /system/health - get health status
  fastify.get('/system/health', async (request: FastifyRequest, reply) => {
    const health = await AdminSystemService.getHealthStatus();
    return reply.send(health);
  });

  // GET /system/metrics - get system metrics
  fastify.get('/system/metrics', async (request: FastifyRequest, reply) => {
    const metrics = await AdminSystemService.getSystemMetrics();
    return reply.send(metrics);
  });

  // GET /system/logs - get system logs (alias to audit logs)
  fastify.get('/system/logs', async (request: FastifyRequest, reply) => {
    const logs = await AdminSystemService.getSystemLogs({
      page: parseInt((request.query as any).page) || 1,
      limit: parseInt((request.query as any).limit) || 50
    });
    return reply.send(logs);
  });

  // GET /system/stats - aggregate system statistics
  fastify.get('/system/stats', async (_request, reply) => {
    const stats = await AdminSystemService.getSystemStats();
    return reply.send(stats);
  });

  // POST /system/cache/clear - clear cache
  fastify.post('/system/cache/clear', async (request: FastifyRequest, reply) => {
    const adminId = (request as any).user?.sub || (request as any).user?.id;
    const result = await AdminSystemService.clearCache();
    
    // Audit log
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

  // POST /system/backup - create backup stub
  fastify.post('/system/backup', async (request: FastifyRequest, reply) => {
    const adminId = (request as any).user?.sub || (request as any).user?.id || (request as any).userId;
    const result = await AdminSystemService.createBackup(adminId);
    
    // Audit log
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

  // POST /system/restore - restore backup stub
  fastify.post('/system/restore', async (request: FastifyRequest, reply) => {
    const { backupId } = request.body as { backupId: string };
    const adminId = (request as any).user?.sub || (request as any).user?.id || (request as any).userId;
    const result = await AdminSystemService.restoreBackup(adminId, backupId);
    
    // Audit log
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

  // POST /backup/create - alias for create backup
  fastify.post('/backup/create', async (request: FastifyRequest, reply) => {
    const adminId = (request as any).user?.sub || (request as any).user?.id || (request as any).userId;
    const result = await AdminSystemService.createBackup(adminId);
    
    // Audit log
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

  // GET /logs - alias for system logs
  fastify.get('/logs', async (request: FastifyRequest, reply) => {
    const logs = await AdminSystemService.getSystemLogs({
      page: parseInt((request.query as any).page) || 1,
      limit: parseInt((request.query as any).limit) || 50
    });
    return reply.send(logs);
  });
}
