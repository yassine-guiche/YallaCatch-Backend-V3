import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { AdminNotificationsService } from '../services/admin-notifications.service';
import { z } from 'zod';

const normalizeType = z
  .string()
  .optional()
  .transform((val) => (val ? val.toLowerCase() : undefined))
  .refine((val) => !val || ['push', 'email', 'sms', 'in_app'].includes(val), {
    message: 'Type must be one of: push, email, sms, in_app'
  });

const NotificationQuerySchema = z.object({
  page: z.coerce.number().int().positive({ message: 'Page must be a positive integer' }).default(1),
  limit: z.coerce.number().int()
    .min(1, { message: 'Limit must be at least 1' })
    .max(100, { message: 'Limit cannot exceed 100' }).default(20),
  status: z.enum(['sent', 'scheduled', 'failed', 'pending'], {
    errorMap: () => ({ message: 'Status must be one of: sent, scheduled, failed, pending' })
  }).optional(),
  type: normalizeType,
});

const SendNotificationSchema = z.object({
  title: z.string()
    .min(1, { message: 'Title is required' })
    .max(200, { message: 'Title cannot exceed 200 characters' }),
  message: z.string()
    .min(1, { message: 'Message is required' })
    .max(1000, { message: 'Message cannot exceed 1000 characters' }),
  type: normalizeType,
  data: z.record(z.unknown()).optional(),
  targetUserIds: z.array(z.string())
    .min(1, { message: 'At least one target user ID is required' }),
});

const BroadcastNotificationSchema = z.object({
  title: z.string()
    .min(1, { message: 'Title is required' })
    .max(200, { message: 'Title cannot exceed 200 characters' }),
  message: z.string()
    .min(1, { message: 'Message is required' })
    .max(1000, { message: 'Message cannot exceed 1000 characters' }),
  type: normalizeType,
  data: z.record(z.unknown()).optional(),
});

const ScheduleNotificationSchema = z.object({
  title: z.string()
    .min(1, { message: 'Title is required' })
    .max(200, { message: 'Title cannot exceed 200 characters' }),
  message: z.string()
    .min(1, { message: 'Message is required' })
    .max(1000, { message: 'Message cannot exceed 1000 characters' }),
  type: normalizeType,
  data: z.record(z.unknown()).optional(),
  targetUserIds: z.array(z.string()).optional(),
  scheduledFor: z.string().datetime({ message: 'scheduledFor must be a valid ISO 8601 datetime (e.g., 2024-01-15T10:30:00Z)' }),
});

const StatsQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'all'], {
    errorMap: () => ({ message: 'Period must be one of: day, week, month, all' })
  }).default('week'),
});

const NotificationTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  channel: z.enum(['push', 'email', 'sms', 'in_app']),
  variables: z.array(z.string()).default([]),
  content: z.record(z.unknown()).optional(),
});

export default async function notificationsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireAdmin);
  fastify.addHook('preHandler', adminRateLimit);

  fastify.get('/notifications', async (request: FastifyRequest, reply) => {
    const query = NotificationQuerySchema.parse(request.query);
    const result = await AdminNotificationsService.getNotifications(query);
    return reply.send(result);
  });

  fastify.get('/notifications/stats', async (request: FastifyRequest, reply) => {
    const { period } = StatsQuerySchema.parse(request.query);
    const stats = await AdminNotificationsService.getNotificationStats(period);
    return reply.send(stats);
  });

  fastify.post('/notifications/send', async (request: FastifyRequest, reply) => {
    const payload = SendNotificationSchema.parse(request.body);
    const adminId = request.user?.sub;
    const result = await AdminNotificationsService.sendNotification(adminId, payload as any);
    return reply.send(result);
  });

  fastify.post('/notifications/broadcast', async (request: FastifyRequest, reply) => {
    const payload = BroadcastNotificationSchema.parse(request.body);
    const adminId = request.user?.sub;
    const result = await AdminNotificationsService.broadcastNotification(adminId, payload as any);
    return reply.send(result);
  });

  fastify.post('/notifications/schedule', async (request: FastifyRequest, reply) => {
    const payload = ScheduleNotificationSchema.parse(request.body);
    const adminId = request.user?.sub;
    const result = await AdminNotificationsService.scheduleNotification(adminId, {
      ...payload,
      scheduledFor: new Date(payload.scheduledFor),
    } as any);
    return reply.send(result);
  });

  // Templates CRUD
  fastify.get('/notifications/templates', async (_request: FastifyRequest, reply) => {
    const templates = await AdminNotificationsService.getTemplates();
    return reply.send({ success: true, data: templates });
  });

  fastify.post('/notifications/templates', async (request: FastifyRequest, reply) => {
    const payload = NotificationTemplateSchema.parse(request.body);
    const adminId = request.user?.sub;
    const template = await AdminNotificationsService.createTemplate(adminId, payload as any);
    return reply.code(201).send({ success: true, data: template });
  });

  fastify.patch('/notifications/templates/:templateId', async (request: FastifyRequest<{ Params: { templateId: string } }>, reply) => {
    const changes = NotificationTemplateSchema.partial().parse(request.body);
    const adminId = request.user?.sub;
    const updated = await AdminNotificationsService.updateTemplate(adminId, request.params.templateId, changes);
    return reply.send({ success: true, data: updated });
  });

  fastify.delete('/notifications/templates/:templateId', async (request: FastifyRequest<{ Params: { templateId: string } }>, reply) => {
    const adminId = request.user?.sub;
    await AdminNotificationsService.deleteTemplate(adminId, request.params.templateId);
    return reply.status(204).send();
  });

  // Get single notification
  fastify.get('/notifications/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const notification = await AdminNotificationsService.getNotificationById(request.params.id);
    if (!notification) {
      return reply.status(404).send({ success: false, error: 'NOTIFICATION_NOT_FOUND' });
    }
    return reply.send({ success: true, data: notification });
  });
}
