import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { z } from 'zod';
import { Notification } from '@/models/Notification';
import { UserNotification } from '@/models/UserNotification';
import { User } from '@/models/User';
import { Settings } from '@/models/Settings';
import { PushNotificationService } from '@/services/push-notifications';
import { typedLogger } from '@/lib/typed-logger';
import { NotificationType, NotificationTargetType, NotificationStatus, INotification, Platform } from '@/types';
import { Types } from 'mongoose';

// Define proper TypeScript interfaces
interface SendNotificationData {
  title: string;
  message: string;
  type: NotificationType;
  targetType: NotificationTargetType;
  targetValue?: string;
  scheduledFor?: string;
  metadata?: Record<string, any>;
}

interface GetUserNotificationOptions {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

interface MarkAsReadData {
  notificationIds?: string[];
  all?: boolean;
}

interface NotificationSettings {
  push?: boolean;
  email?: boolean;
  sms?: boolean;
  inApp?: boolean;
}

interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Notification Service
 */
export class NotificationService {
  static async sendNotification(adminId: string, data: SendNotificationData) {
    try {
      const notification = new Notification({
        title: data.title,
        message: data.message,
        type: data.type,
        targetType: data.targetType,
        targetValue: data.targetValue,
        createdBy: new Types.ObjectId(adminId),
        status: data.scheduledFor ? NotificationStatus.SCHEDULED : NotificationStatus.SENT,
        sentAt: data.scheduledFor ? undefined : new Date(),
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : undefined,
        metadata: data.metadata || {}});

      await notification.save();

      // If not scheduled, send immediately
      if (!data.scheduledFor) {
        await this.processNotification(notification);
      }

      typedLogger.info('Notification created', {
        notificationId: notification._id,
        adminId,
        type: data.type,
        targetType: data.targetType});

      return notification.toJSON();
    } catch (error) {
      typedLogger.error('Send notification error', { error: (error as any).message, adminId, data });
      throw error;
    }
  }

  static async processNotification(notification: any) {
    try {
      let recipients: any[] = [];

      // Get recipients based on target type
      switch (notification.targetType) {
        case NotificationTargetType.ALL:
          recipients = await User.find({
            'preferences.notifications': { $ne: false },
          }).select('_id devices').lean();
          break;
        case NotificationTargetType.CITY:
          if (notification.targetValue) {
            recipients = await User.find({
              'location.city': notification.targetValue,
              'preferences.notifications': { $ne: false },
            }).select('_id devices').lean();
          } else {
            recipients = [];
          }
          break;
        case NotificationTargetType.LEVEL:
          if (notification.targetValue) {
            recipients = await User.find({
              level: notification.targetValue,
              'preferences.notifications': { $ne: false },
            }).select('_id devices').lean();
          } else {
            recipients = [];
          }
          break;
        case NotificationTargetType.USER:
          if (notification.targetValue) {
            recipients = await User.find({
              _id: new Types.ObjectId(notification.targetValue),
              'preferences.notifications': { $ne: false },
            }).select('_id devices').lean();
          } else {
            recipients = [];
          }
          break;
        default:
          recipients = [];
      }

      // Dispatch by channel (type)
      if (notification.type === 'push') {
        // Check global push settings
        const settings = await Settings.findOne({}).sort({ updatedAt: -1 }).select('notifications').lean();
        const pushEnabled = settings?.notifications?.pushNotifications?.enabled !== false;
        if (!pushEnabled) {
          typedLogger.info('Global push disabled, skipping notification', { id: notification._id });
          return { recipientCount: 0 };
        }

        let successCount = 0;
        for (const user of recipients) {
          if (user.devices && Array.isArray(user.devices)) {
            for (const device of user.devices) {
              if (device.fcmToken) {
                try {
                  await PushNotificationService.sendToUser(user._id.toString(), {
                    title: notification.title,
                    body: notification.message,
                    data: notification.metadata || {},
                    priority: 'high'
                  });
                  successCount++;
                } catch (err) {
                  typedLogger.warn('Failed to send push notification to device', {
                    userId: user._id,
                    deviceId: device.deviceId,
                    error: (err as any).message
                  });
                }
              }
            }
          }
        }
        return { recipientCount: successCount };
      } else {
        // For other notification types (email, sms, in_app): placeholder processing
        for (const user of recipients) {
          typedLogger.info(`[MOCK] ${notification.type} notification processed for user`, {
            userId: user._id,
            title: notification.title,
          });
        }
        return { recipientCount: recipients.length };
      }
    } catch (error) {
      typedLogger.error('Process notification error', { error: (error as any).message, notificationId: notification._id });
      throw error;
    }
  }

  static async getNotifications(options: { page?: number; limit?: number; } = {}) {
    try {
      const page = options.page || 1;
      const limit = options.limit || 50;
      const skip = ((page as number) - 1) * (limit as number);

      const [notifications, total] = await Promise.all([
        Notification.find()
          .populate('createdBy', 'displayName')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit as number),
        Notification.countDocuments()]);

      return {
        notifications: notifications.map(n => n.toJSON()),
        pagination: {
          page: page as number,
          limit: limit as number,
          total,
          pages: Math.ceil(total / (limit as number))}};
    } catch (error) {
      typedLogger.error('Get notifications error', { error: (error as any).message });
      throw error;
    }
  }

  /**
   * Get user's notifications
   */
  static async getUserNotifications(userId: string, options: GetUserNotificationOptions) {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const skip = (page - 1) * limit;

      const query: any = { userId: new Types.ObjectId(userId) };
      if (options.unreadOnly) {
        query.isRead = false;
      }

      const [userNotifications, total] = await Promise.all([
        UserNotification.find(query)
          .populate('notificationId', 'title message type metadata createdAt')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        UserNotification.countDocuments(query)]);

      return {
        notifications: userNotifications.map(un => ({
          id: un._id,
          title: (un as any).notificationId?.title,
          message: (un as any).notificationId?.message,
          type: (un as any).notificationId?.type,
          isRead: un.isRead || false,
          createdAt: (un as any).notificationId?.createdAt || un.createdAt,
          metadata: (un as any).notificationId?.metadata || {}})),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: skip + limit < total,
          hasPrev: page > 1}};
    } catch (error) {
      typedLogger.error('Get user notifications error', { error: (error as any).message, userId, options });
      throw error;
    }
  }

  /**
   * Mark notifications as read
   */
  static async markNotificationsRead(userId: string, data: MarkAsReadData) {
    try {
      const updates = { isRead: true, readAt: new Date() };

      if (data.all) {
        // Mark all as read
        const result = await UserNotification.updateMany(
          { userId: new Types.ObjectId(userId), isRead: false },
          { $set: updates });

        return { success: true, modifiedCount: result.modifiedCount };
      } else if (data.notificationIds && Array.isArray(data.notificationIds)) {
        // Mark specific notifications as read
        const result = await UserNotification.updateMany(
          {
            _id: { $in: data.notificationIds.map(id => new Types.ObjectId(id)) },
            userId: new Types.ObjectId(userId) },
          { $set: updates });

        return { success: true, modifiedCount: result.modifiedCount };
      } else {
        throw new Error('INVALID_INPUT - Either "all" or "notificationIds" must be provided');
      }
    } catch (error) {
      typedLogger.error('Mark notifications read error', { error: (error as any).message, userId, data });
      throw error;
    }
  }

  /**
   * Get notification settings for user
   */
  static async getNotificationSettings(userId: string) {
    try {
      const user = await User.findById(userId).select('preferences.notifications').lean();

      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Return user's notification preferences
      return user.preferences?.notifications || {
        push: true,
        email: true,
        sms: false,
        inApp: true};
    } catch (error) {
      typedLogger.error('Get notification settings error', { error: (error as any).message, userId });
      throw error;
    }
  }

  /**
   * Update notification settings for user
   */
  static async updateNotificationSettings(userId: string, settings: NotificationSettings) {
    try {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { 'preferences.notifications': { ...settings } } },
        { new: true, select: 'preferences.notifications' });

      if (!updatedUser) {
        throw new Error('USER_NOT_FOUND');
      }

      typedLogger.info('Notification settings updated', { userId, settings });

      return updatedUser.preferences.notifications;
    } catch (error) {
      typedLogger.error('Update notification settings error', { error: (error as any).message, userId, settings });
      throw error;
    }
  }

  /**
   * Subscribe to push notifications
   */
  static async subscribePushNotifications(userId: string, subscriptionData: PushSubscriptionData) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Add or update the device with the push subscription
      const deviceExists = user.devices?.some(d => d.fcmToken === subscriptionData.endpoint);
      
      if (!deviceExists) {
        if (!user.devices) {
          user.devices = [];
        }
        
        user.devices.push({
          deviceId: `push_sub_${Date.now()}`,
          platform: Platform.WEB, // using Platform enum value
          fcmToken: subscriptionData.endpoint,
          lastUsed: new Date(),
          isActive: true
        });
        
        await user.save();
      }

      typedLogger.info('User subscribed to push notifications', { userId, endpoint: subscriptionData.endpoint });

      return { success: true, message: 'Successfully subscribed to push notifications' };
    } catch (error) {
      typedLogger.error('Subscribe push notifications error', { error: (error as any).message, userId, subscriptionData });
      throw error;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  static async unsubscribePushNotifications(userId: string, endpoint: string) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Remove the device with this endpoint
      if (user.devices) {
        user.devices = user.devices.filter(d => d.fcmToken !== endpoint);
        await user.save();
      }

      typedLogger.info('User unsubscribed from push notifications', { userId, endpoint });

      return { success: true, message: 'Successfully unsubscribed from push notifications' };
    } catch (error) {
      typedLogger.error('Unsubscribe push notifications error', { error: (error as any).message, userId, endpoint });
      throw error;
    }
  }

  /**
   * Get notification statistics for user
   */
  static async getNotificationStats(userId: string) {
    try {
      const [totalCount, unreadCount, recentUserNotifications] = await Promise.all([
        UserNotification.countDocuments({ userId: new Types.ObjectId(userId) }),
        UserNotification.countDocuments({ userId: new Types.ObjectId(userId), isRead: false }),
        UserNotification.find({ userId: new Types.ObjectId(userId) })
          .populate('notificationId', 'title type createdAt')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean()
      ]);

      return {
        total: totalCount,
        unread: unreadCount,
        recent: recentUserNotifications.map(un => ({
          id: un._id,
          title: (un as any).notificationId?.title,
          type: (un as any).notificationId?.type,
          isRead: un.isRead || false,
          createdAt: (un as any).notificationId?.createdAt || un.createdAt
        })),
        preferences: await this.getNotificationSettings(userId)
      };
    } catch (error) {
      typedLogger.error('Get notification stats error', { error: (error as any).message, userId });
      throw error;
    }
  }
}

// Validation schemas
const sendNotificationSchema = z.object({
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  type: z.nativeEnum(NotificationType),
  targetType: z.nativeEnum(NotificationTargetType),
  targetValue: z.string().optional(),
  scheduledFor: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional()});

const getNotificationsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  unreadOnly: z.coerce.boolean().default(false)});

const markAsReadSchema = z.object({
  notificationIds: z.array(z.string()).optional(),
  all: z.boolean().optional()});

const updateSettingsSchema = z.object({
  push: z.boolean().optional(),
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  inApp: z.boolean().optional()});

const subscribePushSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string()
  })
});

export default async function notificationsRoutes(fastify: FastifyInstance) {
  // Admin: Send notification
  fastify.post('/admin/send', {
    preHandler: [authenticate, requireAdmin],
    schema: {
      body: sendNotificationSchema
    }
  }, async (request: FastifyRequest<{ Body: SendNotificationData }>, reply: FastifyReply) => {
    try {
      const result = await NotificationService.sendNotification(request.user.sub, request.body);
      reply.code(201).send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Admin: Get notifications
  fastify.get('/admin', {
    preHandler: [authenticate, requireAdmin],
    schema: {
      querystring: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(50)
      })
    }
  }, async (request: FastifyRequest<{ Querystring: { page?: number; limit?: number } }>, reply: FastifyReply) => {
    try {
      const result = await NotificationService.getNotifications(request.query);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

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
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
}