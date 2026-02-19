import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { typedLogger } from '@/lib/typed-logger';
import { AdminAdMobService } from '../services/admin-admob.service';
import { Settings } from '@/models/Settings';
import { AdmobConfigSchema, getAdmobConfig, saveAdmobConfig } from '@/modules/admob/config';

export default async function admobRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', authenticate);
  fastify.addHook('onRequest', requireAdmin);

  // Admin: Get AdMob analytics
  fastify.get('/analytics', async (request: FastifyRequest<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      groupBy?: 'day' | 'week' | 'month';
    }
  }>, reply: FastifyReply) => {
    try {
      const { startDate, endDate, groupBy = 'day' } = request.query;

      const stats = await AdminAdMobService.getAnalytics(
        startDate,
        endDate,
        groupBy
      );

      return reply.send({
        success: true,
        data: stats
      });
    } catch (error) {
      typedLogger.error('Error fetching AdMob analytics:', { error: error instanceof Error ? error.message : 'Unknown' });
      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch AdMob analytics'
      });
    }
  });

  // Admin: Update AdMob configuration
  fastify.patch('/config', {
    schema: { body: AdmobConfigSchema.partial() }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as Record<string, unknown>;
      const parsed = AdmobConfigSchema.partial().parse(body);
      const adminId = request.user?.sub || 'admin';
      const updated = await saveAdmobConfig(parsed, adminId);
      typedLogger.info('AdMob configuration updated by admin', { adminId });
      return reply.send({ success: true, data: updated });
    } catch (error) {
      typedLogger.error('Error updating AdMob config:', { error: error instanceof Error ? error.message : 'Unknown' });
      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to update AdMob configuration'
      });
    }
  });

  // Admin: Get current configuration
  fastify.get('/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const [config, settings] = await Promise.all([
      getAdmobConfig(),
      Settings.findOne({}, { updatedAt: 1, updatedBy: 1 }).lean()
    ]);
    return reply.send({
      success: true,
      data: {
        ...config,
        updatedAt: settings?.updatedAt?.toISOString?.() || new Date().toISOString(),
        updatedBy: settings?.updatedBy || 'unknown',
      }
    });
  });
}
