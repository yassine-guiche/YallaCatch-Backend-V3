import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod'; // Keep zod for explicit type inference in request handler
import { NotificationService } from './notifications.service';
import {
  getNotificationsSchema,
  markAsReadSchema,
  updateSettingsSchema,
  subscribePushSchema
} from './notifications.schema';
import {
  GetUserNotificationOptions,
  MarkAsReadData,
  NotificationSettings,
  PushSubscriptionData
} from './notifications.types';

export default async function notificationsRoutes(fastify: FastifyInstance) {
  // NOTE: Admin notification routes are handled by admin/routes/notifications.routes.ts
  // This module only exposes user-facing notification endpoints

  // User: Get notifications
  fastify.get('/', {
    preHandler: [authenticate],
    schema: {
      querystring: getNotificationsSchema
    }
  }, async (request: FastifyRequest<{ Querystring: GetUserNotificationOptions }>, reply: FastifyReply) => {
    try {
      const result = await NotificationService.getUserNotifications(request.user.sub, request.query);
      reply.send({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // User: Mark notifications as read
  fastify.put('/read', {
    preHandler: [authenticate],
    schema: {
      body: markAsReadSchema
    }
  }, async (request: FastifyRequest<{ Body: MarkAsReadData }>, reply: FastifyReply) => {
    try {
      const result = await NotificationService.markNotificationsRead(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // User: Get notification settings
  fastify.get('/settings', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await NotificationService.getNotificationSettings(request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // User: Update notification settings
  fastify.put('/settings', {
    preHandler: [authenticate],
    schema: {
      body: updateSettingsSchema
    }
  }, async (request: FastifyRequest<{ Body: NotificationSettings }>, reply: FastifyReply) => {
    try {
      const result = await NotificationService.updateNotificationSettings(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // User: Subscribe to push notifications
  fastify.post('/push/subscribe', {
    preHandler: [authenticate],
    schema: {
      body: subscribePushSchema
    }
  }, async (request: FastifyRequest<{ Body: PushSubscriptionData }>, reply: FastifyReply) => {
    try {
      const result = await NotificationService.subscribePushNotifications(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // User: Unsubscribe from push notifications
  fastify.delete('/push/unsubscribe', {
    preHandler: [authenticate],
    schema: {
      body: z.object({
        endpoint: z.string().url()
      })
    }
  }, async (request: FastifyRequest<{ Body: { endpoint: string } }>, reply: FastifyReply) => {
    try {
      const result = await NotificationService.unsubscribePushNotifications(
        request.user.sub,
        request.body.endpoint
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // User: Get notification statistics
  fastify.get('/stats', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const result = await NotificationService.getNotificationStats(request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
}
