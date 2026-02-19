import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { DistributionService } from '../services/admin-distribution.service';
import { audit } from '@/lib/audit-logger';
import { z } from 'zod';
import {
  PrizeCategory,
  PrizeRarity,
  PrizeType,
} from '@/types';
import { findNearestCity } from '@/utils/geo';

const LocationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  radius: z.coerce.number().positive().optional()
});

const PrizeConfigSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(10).max(1000),
  category: z.nativeEnum(PrizeCategory).catch(PrizeCategory.LIFESTYLE),
  type: z.nativeEnum(PrizeType).catch(PrizeType.PHYSICAL),
  rarity: z.nativeEnum(PrizeRarity),
  image: z.string().url().optional(),
  content: z.record(z.unknown()).optional()
});

const DistributionConfigSchema = z.object({
  spawnRadius: z.coerce.number().positive(),
  quantity: z.coerce.number().int().positive(),
  maxClaims: z.coerce.number().int().positive(),
  respawnInterval: z.coerce.number().int().nonnegative(),
  duration: z.coerce.number().int().positive()
});

const SingleDistributionSchema = z.object({
  location: LocationSchema,
  prizeConfig: PrizeConfigSchema,
  distribution: DistributionConfigSchema,
  targeting: z.object({
    userLevels: z.array(z.number()).optional(),
    regions: z.array(z.string()).optional(),
    excludeUsers: z.array(z.string()).optional()
  }).optional(),
  metadata: z.record(z.unknown()).optional()
});

const BulkDistributionSchema = z.object({
  template: PrizeConfigSchema,
  locations: z.array(LocationSchema).min(1).max(1000),
  distributionMode: z.enum(['sequential', 'parallel', 'random'])
});

const AutoDistributionSchema = z.object({
  region: z.object({
    center: LocationSchema,
    radiusKm: z.coerce.number().positive()
  }),
  density: z.coerce.number().positive(),
  prizeTemplate: PrizeConfigSchema
});

const ManageDistributionSchema = z.object({
  action: z.enum(['pause', 'resume', 'extend', 'terminate']),
  params: z.record(z.unknown()).optional()
});

const sanitizeLocation = (loc: z.infer<typeof LocationSchema>) => {
  const lat = loc.latitude;
  const lng = loc.longitude;
  const city = loc.city || findNearestCity({ lat, lng });
  return {
    lat,
    lng,
    latitude: lat, // keep legacy shape for downstream consumers
    longitude: lng,
    address: loc.address,
    city,
    country: loc.country,
    radius: loc.radius
  };
};

const sanitizePrizeConfig = (cfg: z.infer<typeof PrizeConfigSchema>, loc: z.infer<typeof LocationSchema>) => {
  // map possible legacy values
  const type = Object.values(PrizeType).includes(cfg.type) ? cfg.type : PrizeType.PHYSICAL;
  const category = Object.values(PrizeCategory).includes(cfg.category) ? cfg.category : PrizeCategory.LIFESTYLE;
  const rarity = Object.values(PrizeRarity).includes(cfg.rarity) ? cfg.rarity : PrizeRarity.COMMON;
  const contentRecord = (cfg.content || {}) as Record<string, unknown>;
  const cfgRecord = cfg as Record<string, unknown>;
  const points = Math.max(1, Number(contentRecord.points ?? cfgRecord.points ?? 0));

  return {
    name: cfg.title,
    description: cfg.description,
    type,
    category,
    rarity,
    imageUrl: cfg.image,
    points,
    location: {
      latitude: loc.latitude,
      longitude: loc.longitude,
      city: loc.city || findNearestCity({ lat: loc.latitude, lng: loc.longitude }),
      address: loc.address,
      radius: loc.radius
    },
    content: {
      ...cfg.content,
      points
    }
  };
};

const SettingsSchema = z.object({
  maxActiveDistributions: z.number().int().positive().optional(),
  defaultSpawnRadius: z.number().positive().optional(),
  defaultDuration: z.number().int().positive().optional(),
  autoCleanupEnabled: z.boolean().optional(),
  cleanupIntervalHours: z.number().int().positive().optional()
});

export default async function distributionRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', authenticate);
  fastify.addHook('onRequest', requireAdmin);
  fastify.addHook('onRequest', adminRateLimit);

  fastify.post<{ Body: z.infer<typeof SingleDistributionSchema> }>('/place', async (request, reply) => {
    const body = SingleDistributionSchema.parse(request.body);
    const adminId = String(request.user?.sub);
    const location = sanitizeLocation(body.location);
    const prizeConfig = sanitizePrizeConfig(body.prizeConfig, location);

    const result = await DistributionService.distributeSinglePrize(adminId, {
      title: prizeConfig.name,
      description: prizeConfig.description,
      category: prizeConfig.category,
      type: prizeConfig.type,
      rarity: prizeConfig.rarity,
      image: prizeConfig.imageUrl,
      value: prizeConfig.points,
      points: prizeConfig.points,
      location: {
        lat: location.lat,
        lng: location.lng,
        city: location.city,
        address: location.address,
      },
      radius: location.radius,
      metadata: {
        prizeConfig,
        distribution: body.distribution,
        targeting: body.targeting,
        location,
        ...(body.metadata || {}),
      },
    } as Record<string, unknown>);

    // Audit log
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action: 'DISTRIBUTE_PRIZE',
      resource: 'prize',
      category: 'admin',
      severity: 'low',
      metadata: { location: location.city, prizeConfig },
    });

    return reply.send(result);
  });

  fastify.post<{ Body: z.infer<typeof BulkDistributionSchema> }>('/batch', async (request, reply) => {
    const body = BulkDistributionSchema.parse(request.body);
    const adminId = String(request.user?.sub);
    const templateLocation = sanitizeLocation(body.locations[0]);
    const template = sanitizePrizeConfig(body.template, templateLocation);
    const locations = body.locations.map((loc) => {
      const sanitized = sanitizeLocation(loc);
      return {
        latitude: sanitized.lat,
        longitude: sanitized.lng,
        city: sanitized.city,
        address: sanitized.address,
        radius: sanitized.radius,
      };
    });

    const result = await DistributionService.distributeBulkPrizes(adminId, {
      template,
      locations,
      distributionMode: body.distributionMode
    });

    // Audit log
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action: 'BATCH_DISTRIBUTE_PRIZES',
      resource: 'prize',
      category: 'admin',
      severity: 'medium',
      metadata: { count: locations.length, template: template.name },
    });

    return reply.send(result);
  });

  fastify.post<{ Body: z.infer<typeof AutoDistributionSchema> }>('/auto', async (request, reply) => {
    const body = AutoDistributionSchema.parse(request.body);
    const adminId = String(request.user?.sub);
    const centerLoc = sanitizeLocation(body.region.center);
    const prizeTemplate = sanitizePrizeConfig(body.prizeTemplate, centerLoc);
    const result = await DistributionService.autoDistributePrizes(adminId, {
      region: {
        center: { lat: centerLoc.lat, lng: centerLoc.lng },
        radius: body.region.radiusKm * 1000 // convert km to meters for the service logic
      },
      totalValue: prizeTemplate.points,
      count: Math.max(1, Math.round(body.density)),
      densityBased: true,
    });

    // Audit log
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action: 'AUTO_DISTRIBUTE_PRIZES',
      resource: 'prize',
      category: 'admin',
      severity: 'medium',
      metadata: { region: body.region, density: body.density },
    });

    return reply.send(result);
  });

  fastify.get<{ Querystring: { timeframe?: string; startDate?: string; endDate?: string } }>('/distribution/analytics', async (request, reply) => {
    const adminId = String(request.user?.sub);
    const query = request.query;
    const timeframe = query.timeframe || '30d';
    const result = await DistributionService.getDistributionAnalytics(adminId, timeframe, query);
    return reply.send(result);
  });

  fastify.get<{ Querystring: { page?: string; limit?: string } }>('/distribution/active', async (request, reply) => {
    const query = request.query;
    const page = query.page ? parseInt(query.page) : 1;
    const limit = query.limit ? parseInt(query.limit) : 20;

    try {
      const adminId = String(request.user?.sub);
      const result = await DistributionService.getActiveDistributions(adminId, { page, limit });
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error in /distribution/active:', message);
      // Return empty result instead of 500 error
      return reply.send({
        items: [],
        pagination: { page, limit, total: 0, pages: 0 }
      });
    }
  });

  fastify.get<{ Querystring: { page?: string; limit?: string; status?: string } }>('/distribution/history', async (request, reply) => {
    const query = request.query;
    const result = await DistributionService.getDistributionHistory(
      query.page ? parseInt(query.page) : 1,
      query.limit ? parseInt(query.limit) : 20,
      query.status
    );
    return reply.send(result);
  });

  fastify.get('/distribution/settings', async (request: FastifyRequest, reply) => {
    const result = await DistributionService.getDistributionSettings();
    return reply.send(result);
  });

  fastify.put<{ Body: z.infer<typeof SettingsSchema> }>('/distribution/settings', async (request, reply) => {
    const body = SettingsSchema.parse(request.body);
    const adminId = String(request.user?.sub);
    const result = await DistributionService.updateDistributionSettings(adminId, body);

    // Audit log
    await audit.settingsUpdated(adminId, 'distribution', { metadata: { changes: Object.keys(body) } });

    return reply.send(result);
  });

  fastify.post('/distribution/trigger', async (request: FastifyRequest, reply) => {
    const body = z.object({
      type: z.string(),
      config: z.record(z.unknown()).optional()
    }).parse(request.body);
    const adminId = String(request.user?.sub);
    const result = await DistributionService.triggerManualDistribution(adminId, body.type, body.config || {});

    // Audit log
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action: 'TRIGGER_DISTRIBUTION',
      resource: 'distribution',
      category: 'admin',
      severity: 'medium',
      metadata: { type: body.type, config: body.config },
    });

    return reply.send(result);
  });

  fastify.post('/manage/:distributionId', async (request: FastifyRequest<{ Params: { distributionId: string } }>, reply) => {
    const { distributionId } = request.params;
    const body = ManageDistributionSchema.parse(request.body);
    const adminId = String(request.user?.sub);
    const result = await DistributionService.manageDistribution(adminId, distributionId, body.action, body.params);

    // Audit log
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action: `DISTRIBUTION_${body.action.toUpperCase()}`,
      resource: 'distribution',
      resourceId: distributionId,
      category: 'admin',
      severity: 'medium',
      metadata: { action: body.action, params: body.params },
    });

    return reply.send(result);
  });

  // GET /distribution/templates — Return predefined distribution templates
  fastify.get('/distribution/templates', async (_request, reply) => {
    try {
      const templates = [
        {
          id: 'city_center',
          name: 'City Center Distribution',
          description: 'Distribute prizes in a city center area with high foot traffic',
          config: { spawnRadius: 1000, quantity: 10, maxClaims: 1, respawnInterval: 3600 },
        },
        {
          id: 'event_zone',
          name: 'Event Zone Distribution',
          description: 'Concentrated prize distribution for events or promotions',
          config: { spawnRadius: 500, quantity: 25, maxClaims: 1, respawnInterval: 1800 },
        },
        {
          id: 'wide_area',
          name: 'Wide Area Distribution',
          description: 'Spread prizes across a large geographic area',
          config: { spawnRadius: 5000, quantity: 50, maxClaims: 3, respawnInterval: 7200 },
        },
        {
          id: 'daily_challenge',
          name: 'Daily Challenge',
          description: 'Daily time-limited prize distribution',
          config: { spawnRadius: 2000, quantity: 15, maxClaims: 1, respawnInterval: 0 },
        },
      ];

      return reply.send({ success: true, templates, data: templates });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch distribution templates' });
    }
  });
}
