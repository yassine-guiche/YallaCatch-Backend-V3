import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { configService } from '@/services/config';
import { audit } from '@/lib/audit-logger';

type AdminRequest<P = Record<string, unknown>, B = unknown, Q = unknown> = FastifyRequest<{
    Params: P;
    Body: B;
    Querystring: Q;
}>;

export default async function configRoutes(fastify: FastifyInstance) {
    // Get config version (for checking if config has changed)
    fastify.get('/version', {
        preHandler: [authenticate, requireAdmin, adminRateLimit],
    }, async (request, reply) => {
        try {
            const version = configService.getVersion();
            reply.send({ success: true, data: { version } });
        } catch (error) {
            reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    });

    // Force reload config from database
    fastify.post('/reload', {
        preHandler: [authenticate, requireAdmin],
    }, async (request: AdminRequest, reply) => {
        try {
            const adminId = request.user?.sub || 'system';
            await configService.reload();

            // Audit log for config reload
            await audit.custom(adminId, 'RELOAD_CONFIG', 'settings', undefined, {
                timestamp: new Date().toISOString(),
            });

            reply.send({ success: true, message: 'Config reloaded successfully' });
        } catch (error) {
            reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    });

    // Get config history
    fastify.get('/history', {
        preHandler: [authenticate, requireAdmin, adminRateLimit],
    }, async (request: AdminRequest<Record<string, never>, unknown, { section?: string; limit?: string }>, reply) => {
        try {
            const limit = request.query.limit ? parseInt(request.query.limit as string) : 50;
            const history = await configService.getConfigHistory(request.query.section, limit);
            reply.send({ success: true, data: history });
        } catch (error) {
            reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    });

    // Get current active config (all sections)
    fastify.get('/active', {
        preHandler: [authenticate, requireAdmin, adminRateLimit],
    }, async (request, reply) => {
        try {
            const config = await configService.getConfig();
            reply.send({ success: true, data: config });
        } catch (error) {
            reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    });

    // Validate config changes before applying
    fastify.post('/validate', {
        preHandler: [authenticate, requireAdmin, adminRateLimit],
    }, async (request: AdminRequest<Record<string, never>, { section: string; changes: Record<string, unknown> }>, reply) => {
        try {
            const result = await configService.validateConfigUpdate(
                request.body.section,
                request.body.changes
            );
            reply.send({ success: true, data: result });
        } catch (error) {
            reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    });

    // Get specific config value (dot notation support)
    fastify.get('/value/:path', {
        preHandler: [authenticate, requireAdmin, adminRateLimit],
    }, async (request: AdminRequest<{ path: string }>, reply) => {
        try {
            const value = await configService.getConfigValue(request.params.path);
            reply.send({ success: true, data: { value } });
        } catch (error) {
            reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    });

    // Update specific config value
    fastify.patch('/value/:path', {
        preHandler: [authenticate, requireAdmin],
    }, async (request: AdminRequest<{ path: string }, { value: unknown }>, reply) => {
        try {
            const result = await configService.updateConfigValue(
                request.params.path,
                request.body.value,
                request.user.sub
            );
            reply.send({ success: true, data: result });
        } catch (error) {
            reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    });

    // Check if feature is enabled
    fastify.get('/feature/:name', {
        preHandler: [authenticate, requireAdmin, adminRateLimit],
    }, async (request: AdminRequest<{ name: string }>, reply) => {
        try {
            const enabled = await configService.isFeatureEnabled(request.params.name);
            reply.send({ success: true, data: { enabled } });
        } catch (error) {
            reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    });
}
