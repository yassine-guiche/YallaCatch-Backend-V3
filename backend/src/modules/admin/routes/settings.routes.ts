import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { AdminSettingsService } from '../services/admin-settings.service';
import { configService } from '@/services/config';
import { audit } from '@/lib/audit-logger';
import { z } from 'zod';

const ProgressionSettingsSchema = z.object({
  levels: z.array(z.object({
    name: z.string({ required_error: 'Level name is required' }),
    threshold: z.number().min(0, { message: 'Threshold must be 0 or greater' }),
  })).min(1, { message: 'At least one level is required' }),
});

const AntiCheatSettingsSchema = z.object({
  captureFrequencyPerMinute: z.number()
    .min(1, { message: 'Capture frequency must be at least 1 per minute' })
    .default(10),
  maxSpeedMps: z.number()
    .min(1, { message: 'Max speed must be at least 1 m/s' })
    .default(50),
  validationScoreFloor: z.number()
    .min(0, { message: 'Validation score floor must be between 0 and 1' })
    .max(1, { message: 'Validation score floor must be between 0 and 1' })
    .default(0.3),
  gpsAccuracyThreshold: z.number()
    .min(1, { message: 'GPS accuracy threshold must be at least 1 meter' })
    .default(50),
  penalties: z.object({
    deviceChange: z.number().min(0).max(1).default(0.1),
    trackingNotTracking: z.number().min(0).max(1).default(0.2),
    lowLight: z.number().min(0).max(1).default(0.1),
    lowAccuracy: z.number().min(0).max(1).default(0.1),
  }).default({}),
});

const GameSettingsSchema = z.object({
  claimRadiusMeters: z.number()
    .min(1, { message: 'Claim radius must be at least 1 meter' })
    .default(50),
  maxDailyClaims: z.number()
    .min(1, { message: 'Max daily claims must be at least 1' })
    .default(50),
  speedLimitKmh: z.number()
    .min(1, { message: 'Speed limit must be at least 1 km/h' })
    .default(120),
  cooldownSeconds: z.number()
    .min(0, { message: 'Cooldown cannot be negative' })
    .default(60),
  levelUpMultiplier: z.number()
    .min(0.1, { message: 'Level up multiplier must be at least 0.1' })
    .default(1.5),
});

const OfflineSettingsSchema = z.object({
  maxQueueAgeMinutes: z.number()
    .min(1, { message: 'Max queue age must be at least 1 minute' })
    .default(1440),
  maxBatchSize: z.number()
    .min(1, { message: 'Max batch size must be at least 1' })
    .default(100),
  retryLimit: z.number()
    .min(0, { message: 'Retry limit cannot be negative' })
    .default(5),
  retryBackoffMs: z.number()
    .min(0, { message: 'Retry backoff cannot be negative' })
    .default(2000),
});

type AdminRequest<P = Record<string, any>, B = any, Q = any> = FastifyRequest<{
  Params: P;
  Body: B;
  Querystring: Q;
}>;

export default async function settingsRoutes(fastify: FastifyInstance) {
  // Get all settings
  fastify.get('/settings', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const settings = await AdminSettingsService.getSettings();
      reply.send({ success: true, data: settings });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Update settings (partial)
  fastify.patch('/settings', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<{}, any>, reply) => {
    try {
      const settings = await AdminSettingsService.updateSettings(request.user.sub, request.body);
      reply.send({ success: true, data: settings });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Progression settings
  fastify.get('/settings/progression', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const data = await AdminSettingsService.getSettingsSection('progression');
      reply.send({ success: true, data });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.patch('/settings/progression', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: ProgressionSettingsSchema },
  }, async (request: AdminRequest<{}, z.infer<typeof ProgressionSettingsSchema>>, reply) => {
    try {
      const data = await AdminSettingsService.updateSettingsSection(request.user.sub, 'progression', request.body);
      reply.send({ success: true, data });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Anti-cheat settings
  fastify.get('/settings/anti-cheat', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const data = await AdminSettingsService.getSettingsSection('antiCheat');
      reply.send({ success: true, data });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.patch('/settings/anti-cheat', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: AntiCheatSettingsSchema },
  }, async (request: AdminRequest<{}, z.infer<typeof AntiCheatSettingsSchema>>, reply) => {
    try {
      const data = await AdminSettingsService.updateSettingsSection(request.user.sub, 'antiCheat', request.body);
      reply.send({ success: true, data });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Game settings
  fastify.get('/settings/game', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const data = await AdminSettingsService.getSettingsSection('game');
      reply.send({ success: true, data });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.patch('/settings/game', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: GameSettingsSchema },
  }, async (request: AdminRequest<{}, z.infer<typeof GameSettingsSchema>>, reply) => {
    try {
      const data = await AdminSettingsService.updateSettingsSection(request.user.sub, 'game', request.body);
      reply.send({ success: true, data });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Offline settings
  fastify.get('/settings/offline', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const data = await AdminSettingsService.getSettingsSection('offline');
      reply.send({ success: true, data });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.patch('/settings/offline', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: OfflineSettingsSchema },
  }, async (request: AdminRequest<{}, z.infer<typeof OfflineSettingsSchema>>, reply) => {
    try {
      const data = await AdminSettingsService.updateSettingsSection(request.user.sub, 'offline', request.body);
      reply.send({ success: true, data });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Maintenance mode
  fastify.post('/maintenance/start', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: AdminRequest<{}, { message?: string }>, reply) => {
    try {
      const result = await AdminSettingsService.startMaintenance(request.user.sub, request.body?.message);
      reply.send({ success: true, data: result });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/maintenance/stop', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    try {
      const result = await AdminSettingsService.stopMaintenance(request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // ===== NEW REAL-TIME CONFIG ENDPOINTS =====

  // Get config version (for checking if config has changed)
  fastify.get('/config/version', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const version = configService.getVersion();
      reply.send({ success: true, data: { version } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Force reload config from database
  fastify.post('/config/reload', {
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
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Get config history
  fastify.get('/config/history', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<{}, {}, { section?: string; limit?: string }>, reply) => {
    try {
      const limit = request.query.limit ? parseInt(request.query.limit as string) : 50;
      const history = await configService.getConfigHistory(request.query.section, limit);
      reply.send({ success: true, data: history });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Get current active config (all sections)
  fastify.get('/config/active', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const config = await configService.getConfig();
      reply.send({ success: true, data: config });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Validate config changes before applying
  fastify.post('/config/validate', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<{}, { section: string; changes: Record<string, any> }>, reply) => {
    try {
      const result = await configService.validateConfigUpdate(
        request.body.section,
        request.body.changes
      );
      reply.send({ success: true, data: result });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Get specific config value (dot notation support)
  fastify.get('/config/value/:path', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<{ path: string }>, reply) => {
    try {
      const value = await configService.getConfigValue(request.params.path);
      reply.send({ success: true, data: { value } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Update specific config value
  fastify.patch('/config/value/:path', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: AdminRequest<{ path: string }, { value: any }>, reply) => {
    try {
      const result = await configService.updateConfigValue(
        request.params.path,
        request.body.value,
        request.user.sub
      );
      reply.send({ success: true, data: result });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });

  // Check if feature is enabled
  fastify.get('/config/feature/:name', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<{ name: string }>, reply) => {
    try {
      const enabled = await configService.isFeatureEnabled(request.params.name);
      reply.send({ success: true, data: { enabled } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: error.message });
    }
  });
}
