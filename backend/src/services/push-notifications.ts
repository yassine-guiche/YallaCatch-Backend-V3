import { Types } from 'mongoose';
import { DeviceToken, DevicePlatform, INotificationPreferences } from '@/models/DeviceToken';
import { typedLogger } from '@/lib/typed-logger';
import { config } from '@/config';

/**
 * Push Notification Payload
 */
export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
  actionUrl?: string;
  badge?: number;
  sound?: string;
  priority?: 'high' | 'normal';
  ttl?: number; // Time to live in seconds
}

/**
 * Push Notification Result
 */
export interface PushNotificationResult {
  success: boolean;
  deviceId: string;
  platform: DevicePlatform;
  messageId?: string;
  error?: string;
}

/**
 * FCM Message Format
 */
interface FCMMessage {
  token: string;
  notification?: {
    title: string;
    body: string;
    image?: string;
  };
  data?: Record<string, string>;
  android?: {
    priority: 'high' | 'normal';
    ttl?: string;
    notification?: {
      sound?: string;
      click_action?: string;
    };
  };
  apns?: {
    payload: {
      aps: {
        alert: {
          title: string;
          body: string;
        };
        badge?: number;
        sound?: string;
        'content-available'?: number;
      };
    };
    fcm_options?: {
      image?: string;
    };
  };
  webpush?: {
    notification: {
      title: string;
      body: string;
      icon?: string;
      image?: string;
    };
    fcm_options?: {
      link?: string;
    };
  };
}

/**
 * APNS Message Format
 */
interface APNSMessage {
  deviceToken: string;
  payload: {
    aps: {
      alert: {
        title: string;
        body: string;
      };
      badge?: number;
      sound?: string;
      'content-available'?: number;
      'mutable-content'?: number;
    };
    data?: Record<string, any>;
  };
  priority?: number;
  expiry?: number;
}

/**
 * Push Notification Service
 * Handles sending push notifications via FCM (Android/Web) and APNS (iOS)
 */
export class PushNotificationService {
  private static fcmEnabled = !!config.FCM_SERVER_KEY;
  private static apnsEnabled = !!config.APNS_KEY_ID;

  /**
   * Send push notification to a single user
   */
  static async sendToUser(
    userId: string,
    payload: PushNotificationPayload,
    notificationType?: keyof INotificationPreferences
  ): Promise<PushNotificationResult[]> {
    try {
      // Get all active devices for the user
      const devices = await DeviceToken.find({
        userId: new Types.ObjectId(userId),
        isActive: true,
        'preferences.enabled': true,
      });

      if (devices.length === 0) {
        typedLogger.info('No active devices for user', { userId });
        return [];
      }

      // Filter by notification type preference
      const filteredDevices = notificationType
        ? devices.filter(device => device.preferences[notificationType] !== false)
        : devices;

      if (filteredDevices.length === 0) {
        typedLogger.info('User has disabled this notification type', {
          userId,
          notificationType,
        });
        return [];
      }

      // Send to all devices
      const results = await Promise.all(
        filteredDevices.map(device => this.sendToDevice(device, payload))
      );

      // Update last used timestamp for successful sends
      const successfulDeviceIds = results
        .filter(r => r.success)
        .map(r => r.deviceId);

      if (successfulDeviceIds.length > 0) {
        await DeviceToken.updateMany(
          { deviceId: { $in: successfulDeviceIds } },
          { $set: { lastUsed: new Date() } }
        );
      }

      // Deactivate devices with permanent errors
      const failedDevices = results.filter(
        r => !r.success && (r.error?.includes('invalid') || r.error?.includes('not registered'))
      );

      if (failedDevices.length > 0) {
        await DeviceToken.updateMany(
          { deviceId: { $in: failedDevices.map(d => d.deviceId) } },
          { $set: { isActive: false } }
        );
      }

      return results;
    } catch (error: any) {
      typedLogger.error('Send to user error', {
        userId,
        error: (error as any).message,
      });
      throw error;
    }
  }

  /**
   * Send push notification to multiple users
   */
  static async sendToUsers(
    userIds: string[],
    payload: PushNotificationPayload,
    notificationType?: keyof INotificationPreferences
  ): Promise<Record<string, PushNotificationResult[]>> {
    const results: Record<string, PushNotificationResult[]> = {};

    // Send in batches to avoid overwhelming the system
    const batchSize = 100;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async userId => {
          const userResults = await this.sendToUser(userId, payload, notificationType);
          return { userId, results: userResults };
        })
      );

      batchResults.forEach(({ userId, results: userResults }) => {
        results[userId] = userResults;
      });
    }

    return results;
  }

  /**
   * Send push notification to a single device
   */
  private static async sendToDevice(
    device: any,
    payload: PushNotificationPayload
  ): Promise<PushNotificationResult> {
    try {
      if (device.platform === DevicePlatform.IOS && device.apnsToken) {
        return await this.sendViaAPNS(device, payload);
      } else if (device.fcmToken) {
        return await this.sendViaFCM(device, payload);
      } else {
        return {
          success: false,
          deviceId: device.deviceId,
          platform: device.platform,
          error: 'No valid token',
        };
      }
    } catch (error: any) {
      return {
        success: false,
        deviceId: device.deviceId,
        platform: device.platform,
        error: (error as any).message,
      };
    }
  }

  /**
   * Send via Firebase Cloud Messaging (Android/Web)
   */
  private static async sendViaFCM(
    device: any,
    payload: PushNotificationPayload
  ): Promise<PushNotificationResult> {
    if (!this.fcmEnabled) {
      // Mock mode for development
      typedLogger.info('[MOCK] FCM notification sent', {
        deviceId: device.deviceId,
        platform: device.platform,
        payload,
      });

      return {
        success: true,
        deviceId: device.deviceId,
        platform: device.platform,
        messageId: `mock-fcm-${Date.now()}`,
      };
    }

    try {
      // Prepare FCM message
      const message: FCMMessage = {
        token: device.fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
          image: payload.imageUrl,
        },
        data: payload.data ? this.stringifyData(payload.data) : undefined,
      };

      // Android-specific options
      if (device.platform === DevicePlatform.ANDROID) {
        message.android = {
          priority: payload.priority || 'high',
          ttl: payload.ttl ? `${payload.ttl}s` : undefined,
          notification: {
            sound: payload.sound || 'default',
            click_action: payload.actionUrl,
          },
        };
      }

      // Web-specific options
      if (device.platform === DevicePlatform.WEB) {
        message.webpush = {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/icon.png',
            image: payload.imageUrl,
          },
          fcm_options: {
            link: payload.actionUrl,
          },
        };
      }

      // In production, use Firebase Admin SDK:
      // const admin = require('firebase-admin');
      // const response = await admin.messaging().send(message);
      // return { success: true, deviceId: device.deviceId, platform: device.platform, messageId: response };

      // For now, mock the response
      typedLogger.info('[MOCK] FCM notification would be sent', {
        deviceId: device.deviceId,
        message,
      });

      return {
        success: true,
        deviceId: device.deviceId,
        platform: device.platform,
        messageId: `mock-fcm-${Date.now()}`,
      };
    } catch (error: any) {
      typedLogger.error('FCM send error', {
        deviceId: device.deviceId,
        error: (error as any).message,
      });

      return {
        success: false,
        deviceId: device.deviceId,
        platform: device.platform,
        error: (error as any).message,
      };
    }
  }

  /**
   * Send via Apple Push Notification Service (iOS)
   */
  private static async sendViaAPNS(
    device: any,
    payload: PushNotificationPayload
  ): Promise<PushNotificationResult> {
    if (!this.apnsEnabled) {
      // Mock mode for development
      typedLogger.info('[MOCK] APNS notification sent', {
        deviceId: device.deviceId,
        platform: device.platform,
        payload,
      });

      return {
        success: true,
        deviceId: device.deviceId,
        platform: device.platform,
        messageId: `mock-apns-${Date.now()}`,
      };
    }

    try {
      // Prepare APNS message
      const message: APNSMessage = {
        deviceToken: device.apnsToken,
        payload: {
          aps: {
            alert: {
              title: payload.title,
              body: payload.body,
            },
            badge: payload.badge,
            sound: payload.sound || 'default',
            'content-available': 1,
            'mutable-content': 1,
          },
          data: payload.data,
        },
        priority: payload.priority === 'high' ? 10 : 5,
        expiry: payload.ttl ? Math.floor(Date.now() / 1000) + payload.ttl : undefined,
      };

      // In production, use node-apn or similar:
      // const apn = require('apn');
      // const provider = new apn.Provider({ ... });
      // const notification = new apn.Notification(message.payload);
      // const response = await provider.send(notification, message.deviceToken);
      // return { success: response.sent.length > 0, deviceId: device.deviceId, platform: device.platform };

      // For now, mock the response
      typedLogger.info('[MOCK] APNS notification would be sent', {
        deviceId: device.deviceId,
        message,
      });

      return {
        success: true,
        deviceId: device.deviceId,
        platform: device.platform,
        messageId: `mock-apns-${Date.now()}`,
      };
    } catch (error: any) {
      typedLogger.error('APNS send error', {
        deviceId: device.deviceId,
        error: (error as any).message,
      });

      return {
        success: false,
        deviceId: device.deviceId,
        platform: device.platform,
        error: (error as any).message,
      };
    }
  }

  /**
   * Convert data object to string values (required by FCM)
   */
  private static stringifyData(data: Record<string, any>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return result;
  }

  /**
   * Send test notification
   */
  static async sendTestNotification(userId: string): Promise<PushNotificationResult[]> {
    return this.sendToUser(userId, {
      title: 'Test Notification',
      body: 'This is a test notification from YallaCatch!',
      data: {
        type: 'test',
        timestamp: new Date().toISOString(),
      },
    });
  }
}

