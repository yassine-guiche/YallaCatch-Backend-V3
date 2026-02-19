import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import { OfflineService } from './offline.service';
import { syncActionsSchema, getSyncStatusSchema } from './offline.schema';

/**
 * Enhanced Offline Routes
 */
export default async function offlineRoutes(fastify: FastifyInstance) {
  // POST /api/offline/sync - Sync offline actions
  fastify.post('/sync', {
    preHandler: [authenticate],
    schema: {
      description: 'Sync offline actions with conflict resolution',
      tags: ['Offline'],
      body: syncActionsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            synced: { type: 'array', items: {} },
            failed: { type: 'array', items: {} },
            conflicts: { type: 'array', items: {} }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: z.infer<typeof syncActionsSchema> }>, reply: FastifyReply) => {
    const userId = request.user!.sub;
    const data = request.body;

    const result = await OfflineService.syncActions(userId, data);

    return reply.code(200).send({ success: true, data: result });
  });

  // GET /api/offline/status - Get sync status
  fastify.get('/status', {
    preHandler: [authenticate],
    schema: {
      description: 'Get offline sync status',
      tags: ['Offline'],
      querystring: getSyncStatusSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            status: {
              type: 'object',
              properties: {
                pending: { type: 'number' },
                syncing: { type: 'number' },
                synced: { type: 'number' },
                failed: { type: 'number' },
                conflicts: { type: 'number' },
                total: { type: 'number' }
              }
            },
            recentActions: { type: 'array', items: {} }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: z.infer<typeof getSyncStatusSchema> }>, reply: FastifyReply) => {
    const userId = request.user!.sub;
    const data = request.query;

    const result = await OfflineService.getSyncStatus(userId, data);

    return reply.code(200).send({ success: true, data: result });
  });

  // POST /api/offline/retry - Retry failed actions
  fastify.post('/retry', {
    preHandler: [authenticate],
    schema: {
      description: 'Retry failed offline actions',
      tags: ['Offline'],
      response: {
        200: {
          type: 'object',
          properties: {
            retried: { type: 'number' },
            results: { type: 'array', items: {} }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.sub;

    const result = await OfflineService.retryFailedActions(userId);

    return reply.code(200).send({ success: true, data: result });
  });

  // POST /api/offline/package - Get offline data package
  fastify.post('/package', {
    preHandler: [authenticate],
    schema: {
      description: 'Get offline data package',
      tags: ['Offline'],
      body: {
        type: 'object',
        properties: {
          location: {
            type: 'object',
            required: ['latitude', 'longitude', 'radius'],
            properties: {
              latitude: { type: 'number' },
              longitude: { type: 'number' },
              radius: { type: 'number' }
            }
          },
          dataTypes: {
            type: 'array',
            items: { type: 'string' },
            default: ['prizes']
          },
          maxItems: { type: 'number', default: 100 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.sub;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = request.body as any;

    const result = await OfflineService.getOfflineDataPackage(userId, body);

    return reply.code(200).send({ success: true, data: result });
  });

  // GET /api/offline/package - Get offline data package (Unity calls this as GET)
  fastify.get('/package', {
    preHandler: [authenticate],
    schema: {
      description: 'Get offline data package (GET variant for Unity)',
      tags: ['Offline'],
      querystring: {
        type: 'object',
        properties: {
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          radius: { type: 'number', default: 5 },
          dataTypes: { type: 'string', default: 'prizes' },
          maxItems: { type: 'number', default: 100 }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.sub;
    const query = request.query as any;

    // Convert querystring to the shape the service expects
    const packageOptions = {
      location: query.latitude && query.longitude ? {
        latitude: parseFloat(query.latitude),
        longitude: parseFloat(query.longitude),
        radius: parseFloat(query.radius || '5')
      } : undefined,
      dataTypes: query.dataTypes ? query.dataTypes.split(',') : ['prizes'],
      maxItems: parseInt(query.maxItems || '100')
    };

    const result = await OfflineService.getOfflineDataPackage(userId, packageOptions);

    return reply.code(200).send({ success: true, data: result });
  });

  // GET /api/offline/capabilities - Get offline capabilities
  fastify.get('/capabilities', {
    preHandler: [authenticate],
    schema: {
      description: 'Get offline capabilities',
      tags: ['Offline']
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.sub;

    const result = await OfflineService.getOfflineCapabilities(userId);

    return reply.code(200).send({ success: true, data: result });
  });
}
