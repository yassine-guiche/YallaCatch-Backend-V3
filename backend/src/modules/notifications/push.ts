import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Types } from 'mongoose';
import { DeviceToken, DevicePlatform, INotificationPreferences } from '@/models/DeviceToken';
import { typedLogger } from '@/lib/typed-logger';

// Validation schemas
const registerDeviceSchema = z.object({
  deviceId: z.string().min(1).max(100),
  platform: z.enum(['ios', 'android', 'web']),
  fcmToken: z.string().min(1),
  apnsToken: z.string().optional()
});

const unregisterDeviceSchema = z.object({
  deviceId: z.string().min(1).max(100)
});

const updatePreferencesSchema = z.object({
  deviceId: z.string().optional(),
  preferences: z.object({
    enabled: z.boolean().optional(),
    prizeNearby: z.boolean().optional(),
    friendRequest: z.boolean().optional(),
    achievementUnlocked: z.boolean().optional(),
    dailyReminder: z.boolean().optional(),
    marketplaceDeals: z.boolean().optional(),
    eventStarted: z.boolean().optional(),
    levelUp: z.boolean().optional()
  })
});

/**
 * Push Notification Service
 */
export class PushNotificationService {
  /**
   * Register device for push notifications
   */
  static async registerDevice(
    userId: string,
    data: z.infer<typeof registerDeviceSchema>
  ) {
    try {
      // Check if device already registered
      let deviceToken = await DeviceToken.findOne({
        userId: new Types.ObjectId(userId),
        deviceId: data.deviceId
      });

      if (deviceToken) {
        // Update existing token
        deviceToken.fcmToken = data.fcmToken;
        deviceToken.apnsToken = data.apnsToken;
        deviceToken.platform = data.platform as DevicePlatform;
        deviceToken.isActive = true;
        deviceToken.lastUsed = new Date();
        await deviceToken.save();
      } else {
        // Create new device token
        deviceToken = new DeviceToken({
          userId: new Types.ObjectId(userId),
          deviceId: data.deviceId,
          platform: data.platform as DevicePlatform,
          fcmToken: data.fcmToken,
          apnsToken: data.apnsToken,
          isActive: true,
          lastUsed: new Date()
        });
        await deviceToken.save();
      }

      typedLogger.info('Device registered for push notifications', {
        userId,
        deviceId: data.deviceId,
        platform: data.platform
      });

      return {
        deviceId: deviceToken.deviceId,
        platform: deviceToken.platform,
        preferences: deviceToken.preferences
      };

    } catch (error: any) {
      typedLogger.error('Register device error', {
        userId,
        error: (error as any).message
      });
      throw error;
    }
  }

  /**
   * Unregister device from push notifications
   */
  static async unregisterDevice(
    userId: string,
    data: z.infer<typeof unregisterDeviceSchema>
  ) {
    try {
      const deviceToken = await DeviceToken.findOne({
        userId: new Types.ObjectId(userId),
        deviceId: data.deviceId
      });

      if (!deviceToken) {
        throw new Error('DEVICE_NOT_FOUND');
      }

      deviceToken.isActive = false;
      await deviceToken.save();

      typedLogger.info('Device unregistered from push notifications', {
        userId,
        deviceId: data.deviceId
      });

      return {
        message: 'Device unregistered successfully'
      };

    } catch (error: any) {
      typedLogger.error('Unregister device error', {
        userId,
        error: (error as any).message
      });
      throw error;
    }
  }

  /**
   * Update notification preferences
   */
  static async updatePreferences(
    userId: string,
    data: z.infer<typeof updatePreferencesSchema>
  ) {
    try {
      const query: any = {
        userId: new Types.ObjectId(userId),
        isActive: true
      };

      if (data.deviceId) {
        query.deviceId = data.deviceId;
      }

      const deviceTokens = await DeviceToken.find(query);

      if (deviceTokens.length === 0) {
        throw new Error('NO_ACTIVE_DEVICES');
      }

      // Update preferences for all devices (or specific device)
      for (const deviceToken of deviceTokens) {
        Object.assign(deviceToken.preferences, data.preferences);
        await deviceToken.save();
      }

      typedLogger.info('Notification preferences updated', {
        userId,
        deviceId: data.deviceId || 'all',
        preferences: data.preferences
      });

      return {
        updated: deviceTokens.length,
        preferences: deviceTokens[0].preferences
      };

    } catch (error: any) {
      typedLogger.error('Update preferences error', {
        userId,
        error: (error as any).message
      });
      throw error;
    }
  }

  /**
   * Get notification preferences
   */
  static async getPreferences(userId: string, deviceId?: string) {
    try {
      const query: any = {
        userId: new Types.ObjectId(userId),
        isActive: true
      };

      if (deviceId) {
        query.deviceId = deviceId;
      }

      const deviceTokens = await DeviceToken.find(query);

      if (deviceTokens.length === 0) {
        // Return default preferences
        return {
          devices: [],
          defaultPreferences: {
            enabled: true,
            prizeNearby: true,
            friendRequest: true,
            achievementUnlocked: true,
            dailyReminder: true,
            marketplaceDeals: true,
            eventStarted: true,
            levelUp: true
          }
        };
      }

      return {
        devices: deviceTokens.map(dt => ({
          deviceId: dt.deviceId,
          platform: dt.platform,
          preferences: dt.preferences,
          lastUsed: dt.lastUsed
        }))
      };

    } catch (error: any) {
      typedLogger.error('Get preferences error', {
        userId,
        error: (error as any).message
      });
      throw error;
    }
  }

  /**
   * Send push notification (helper for internal use)
   */
  static async sendNotification(
    userId: string,
    notification: {
      title: string;
      body: string;
      data?: any;
      type?: string;
    }
  ) {
    try {
      const deviceTokens = await DeviceToken.find({
        userId: new Types.ObjectId(userId),
        isActive: true,
        'preferences.enabled': true
      });

      if (deviceTokens.length === 0) {
        return {
          sent: 0,
          message: 'No active devices'
        };
      }

      // Filter by notification type preference
      const filteredDevices = deviceTokens.filter(dt => {
        if (!notification.type) return true;

        const prefKey = notification.type as keyof INotificationPreferences;
        return dt.preferences[prefKey] !== false;
      });

      // In production, send via FCM/APNS
      // For now, just log
      typedLogger.info('Push notification sent', {
        userId,
        devices: filteredDevices.length,
        notification
      });

      return {
        sent: filteredDevices.length,
        devices: filteredDevices.map(dt => dt.deviceId)
      };

    } catch (error: any) {
      typedLogger.error('Send notification error', {
        userId,
        error: (error as any).message
      });
      throw error;
    }
  }
}

/**
 * Push Notification Routes
 */
export default async function pushNotificationRoutes(fastify: FastifyInstance) {
  // POST /api/notifications/register-device
  fastify.post('/register-device', {
    preHandler: [(fastify as any).authenticate],
    schema: {
      description: 'Register device for push notifications',
      tags: ['Push Notifications'],
      response: {
        200: {
          type: 'object',
          properties: {
            deviceId: { type: 'string' },
            platform: { type: 'string' },
            preferences: { type: 'object' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.sub;
    const data = registerDeviceSchema.parse(request.body);

    const result = await PushNotificationService.registerDevice(userId, data);

    return reply.code(200).send(result);
  });

  // POST /api/notifications/unregister-device
  fastify.post('/unregister-device', {
    preHandler: [(fastify as any).authenticate],
    schema: {
      description: 'Unregister device from push notifications',
      tags: ['Push Notifications'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user.sub;
      const data = unregisterDeviceSchema.parse(request.body);

      const result = await PushNotificationService.unregisterDevice(userId, data);

      return reply.code(200).send(result);
    } catch (error: any) {
      if ((error as any).message === 'DEVICE_NOT_FOUND') {
        return reply.code(404).send({ error: 'DEVICE_NOT_FOUND', message: 'Device not found' });
      }
      throw error;
    }
  });

  // PUT /api/notifications/preferences
  fastify.put('/preferences', {
    preHandler: [(fastify as any).authenticate],
    schema: {
      description: 'Update notification preferences',
      tags: ['Push Notifications'],
      response: {
        200: {
          type: 'object',
          properties: {
            updated: { type: 'number' },
            preferences: { type: 'object' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user.sub;
      const data = updatePreferencesSchema.parse(request.body);

      const result = await PushNotificationService.updatePreferences(userId, data);

      return reply.code(200).send(result);
    } catch (error: any) {
      if ((error as any).message === 'NO_ACTIVE_DEVICES') {
        return reply.code(404).send({ error: 'NO_ACTIVE_DEVICES', message: 'No active devices found' });
      }
      throw error;
    }
  });

  // GET /api/notifications/preferences
  fastify.get('/preferences', {
    preHandler: [(fastify as any).authenticate],
    schema: {
      description: 'Get notification preferences',
      tags: ['Push Notifications'],
      querystring: {
        type: 'object',
        properties: {
          deviceId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            devices: { type: 'array' },
            defaultPreferences: { type: 'object' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.sub;
    const { deviceId } = request.query as { deviceId?: string };

    const result = await PushNotificationService.getPreferences(userId, deviceId);

    return reply.code(200).send(result);
  });
}

