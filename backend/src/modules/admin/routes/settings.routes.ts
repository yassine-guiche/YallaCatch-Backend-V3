import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { AdminSettingsService } from '../services/admin-settings.service';

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
  prizeDetectionRadiusM: z.number().min(10).max(500).default(50),
  catchRadiusM: z.number().min(1).max(50).default(5),
  visibleRadiusM: z.number().min(5).max(100).default(20),
  maxDailyClaims: z.number().min(1).default(50),
  claimCooldownMs: z.number().min(0).default(300000), // 5 min
  maxSpeedMs: z.number().min(1).max(100).default(15),

  captureBonuses: z.object({
    distance: z.object({
      close: z.number().min(1),
      perfect: z.number().min(1),
      thresholdClose: z.number().min(0),
      thresholdPerfect: z.number().min(0)
    }),
    technique: z.object({
      gesture: z.number().min(1),
      voice: z.number().min(1)
    }),
    validation: z.object({
      highScore: z.number().min(1),
      threshold: z.number().min(0).max(1)
    })
  }).optional(),

  pointsPerClaim: z.object({
    common: z.number().min(1),
    rare: z.number().min(1),
    epic: z.number().min(1),
    legendary: z.number().min(1)
  }).optional(),
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

type AdminRequest<P = Record<string, unknown>, B = Record<string, unknown>, Q = Record<string, unknown>> = FastifyRequest<{
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
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  fastify.patch('/settings', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<Record<string, never>, Record<string, unknown>>, reply) => {
    try {
      const settings = await AdminSettingsService.updateSettings(request.user.sub, request.body);
      reply.send({ success: true, data: settings });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Progression settings
  fastify.get('/settings/progression', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const data = await AdminSettingsService.getSettingsSection('progression');
      reply.send({ success: true, data });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  fastify.patch('/settings/progression', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: ProgressionSettingsSchema },
  }, async (request: AdminRequest<Record<string, never>, z.infer<typeof ProgressionSettingsSchema>>, reply) => {
    try {
      const data = await AdminSettingsService.updateSettingsSection(request.user.sub, 'progression', request.body);
      reply.send({ success: true, data });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Anti-cheat settings
  fastify.get('/settings/anti-cheat', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const data = await AdminSettingsService.getSettingsSection('antiCheat');
      reply.send({ success: true, data });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  fastify.patch('/settings/anti-cheat', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: AntiCheatSettingsSchema },
  }, async (request: AdminRequest<Record<string, never>, z.infer<typeof AntiCheatSettingsSchema>>, reply) => {
    try {
      const data = await AdminSettingsService.updateSettingsSection(request.user.sub, 'antiCheat', request.body);
      reply.send({ success: true, data });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Game settings
  fastify.get('/settings/game', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const data = await AdminSettingsService.getSettingsSection('game');
      reply.send({ success: true, data });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  fastify.patch('/settings/game', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: GameSettingsSchema },
  }, async (request: AdminRequest<Record<string, never>, z.infer<typeof GameSettingsSchema>>, reply) => {
    try {
      const data = await AdminSettingsService.updateSettingsSection(request.user.sub, 'game', request.body);
      reply.send({ success: true, data });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Offline settings
  fastify.get('/settings/offline', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const data = await AdminSettingsService.getSettingsSection('offline');
      reply.send({ success: true, data });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  fastify.patch('/settings/offline', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: OfflineSettingsSchema },
  }, async (request: AdminRequest<Record<string, never>, z.infer<typeof OfflineSettingsSchema>>, reply) => {
    try {
      const data = await AdminSettingsService.updateSettingsSection(request.user.sub, 'offline', request.body);
      reply.send({ success: true, data });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Maintenance mode
  fastify.post('/maintenance/start', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: AdminRequest<Record<string, never>, { message?: string }>, reply) => {
    try {
      const result = await AdminSettingsService.startMaintenance(request.user.sub, request.body?.message);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  fastify.post('/maintenance/stop', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    try {
      const result = await AdminSettingsService.stopMaintenance(request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });


}
