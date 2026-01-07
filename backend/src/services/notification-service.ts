import { Types } from 'mongoose';
import { Notification } from '@/models/Notification';
import { UserNotification } from '@/models/UserNotification';
import { User } from '@/models/User';
import { PushNotificationService } from './push-notifications';
import { typedLogger } from '@/lib/typed-logger';
import { NotificationType, NotificationTargetType, NotificationStatus } from '@/types';
import { z } from 'zod';

// Input validation schemas
type SendNotificationPayload = {
  title: string;
  message: string;
  type: NotificationType;
  targetType: NotificationTargetType;
  targetValue?: string;
  priority?: number;
  expiresAt?: string;
  deliveryMethod?: 'push' | 'email' | 'inapp' | 'all';
  channelPreferences?: {
    push?: boolean;
    email?: boolean;
    inApp?: boolean;
  };
  metadata?: Record<string, any>;
};

const sendNotificationSchema = z.object({
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  type: z.nativeEnum(NotificationType),
  targetType: z.nativeEnum(NotificationTargetType),
  targetValue: z.string().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  expiresAt: z.string().datetime().optional(),
  deliveryMethod: z.enum(['push', 'email', 'inapp', 'all']).default('all'),
  channelPreferences: z.object({
    push: z.boolean().optional(),
    email: z.boolean().optional(),
    inApp: z.boolean().optional()
  }).optional(),
  metadata: z.record(z.any()).optional()
});

const getUserNotificationsSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  unreadOnly: z.boolean().default(false),
  type: z.nativeEnum(NotificationType).optional(),
});

const markAsReadSchema = z.object({
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  notificationIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).optional(),
  all: z.boolean().optional()
});

/**
 * Unified Notification Service
 * Handles all notification-related operations including global notifications,
 * user-specific notifications, and cross-platform delivery
 */
export class UnifiedNotificationService {
  /**
   * Send a notification to targeted users
   */
  static async sendNotification(input: SendNotificationPayload) {
    try {
      // Validate input
      const validatedData = sendNotificationSchema.parse(input) as SendNotificationPayload;

      // Create global notification record
      const globalNotification = await Notification.create({
        title: validatedData.title,
        message: validatedData.message,
        type: validatedData.type,
        targetType: validatedData.targetType,
        targetValue: validatedData.targetValue,
        status: 'draft', // Use string value instead of enum
        priority: validatedData.priority || 3, // Use numerical value instead of enum
        expiresAt: validatedData.expiresAt ? new Date(validatedData.expiresAt) : undefined,
        deliveryMethod: validatedData.deliveryMethod,
        channelPreferences: validatedData.channelPreferences,
        metadata: validatedData.metadata
      });

      // Get target users based on targetType
      const targetUsers = await this.getTargetUsers(validatedData);

      // Create user-specific notification records
      const userNotificationPromises = targetUsers.map(userId =>
        UserNotification.create({
          userId: new Types.ObjectId(userId),
          notificationId: globalNotification._id,
          status: 'sent',
          isRead: false,
          isDelivered: false,
          isArchived: false,
          channel: validatedData.deliveryMethod === 'all' ? 'push' : validatedData.deliveryMethod, // Default channel for delivery
          preferencesApplied: {
            push: validatedData.channelPreferences?.push ?? true,
            email: validatedData.channelPreferences?.email ?? true,
            inApp: validatedData.channelPreferences?.inApp ?? true
          }
        })
      );

      await Promise.all(userNotificationPromises);

      // Update global notification statistics
      await Notification.findByIdAndUpdate(globalNotification._id, {
        $set: {
          'statistics.totalTargets': targetUsers.length,
          status: 'sent', // Use string value instead of enum
          sentAt: new Date()
        }
      });

      // Initiate delivery process asynchronously
      this.initiateDelivery(globalNotification._id.toString(), targetUsers, {
        title: validatedData.title,
        body: validatedData.message,
        data: validatedData.metadata,
        type: validatedData.type
      }).catch(error => {
        typedLogger.error('Async notification delivery failed', { 
          error: (error as any).message, 
          notificationId: globalNotification._id 
        });
      });

      typedLogger.info('Notification created and queued for delivery', {
        notificationId: globalNotification._id,
        targetType: validatedData.targetType,
        targetCount: targetUsers.length,
        title: validatedData.title
      });

      return {
        success: true,
        notificationId: globalNotification._id,
        targetCount: targetUsers.length,
        message: `Notification queued for ${targetUsers.length} users`
      };

    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`VALIDATION_ERROR: ${error.errors.map(e => e.message).join(', ')}`);
      }
      typedLogger.error('Send notification error', { error: (error as any).message, input });
      throw error;
    }
  }

  /**
   * Get targeted users based on notification type
   */
  private static async getTargetUsers(data: z.infer<typeof sendNotificationSchema>): Promise<string[]> {
    try {
      let userIds: string[] = [];

      switch (data.targetType) {
        case 'all':
          const allUsers = await User.find({ isBanned: false }).select('_id');
          userIds = allUsers.map(user => user._id.toString());
          break;

        case 'city':
          if (data.targetValue) {
            const cityUsers = await User.find({
              'location.city': data.targetValue,
              isBanned: false
            }).select('_id');
            userIds = cityUsers.map(user => user._id.toString());
          }
          break;

        case 'level':
          if (data.targetValue) {
            const levelUsers = await User.find({
              level: data.targetValue,
              isBanned: false
            }).select('_id');
            userIds = levelUsers.map(user => user._id.toString());
          }
          break;

        case 'user':
          if (data.targetValue) {
            // Validate that targetValue is a valid ObjectId
            if (!Types.ObjectId.isValid(data.targetValue)) {
              throw new Error('INVALID_USER_ID');
            }
            const user = await User.findById(data.targetValue);
            if (user && !user.isBanned) {
              userIds = [user._id.toString()];
            }
          }
          break;

        default:
          userIds = [];
      }

      return userIds;
    } catch (error) {
      typedLogger.error('Get target users error', { error: (error as any).message, data });
      throw error;
    }
  }

  /**
   * Initiate async delivery of notifications
   */
  private static async initiateDelivery(
    notificationId: string, 
    userIds: string[], 
    payload: { title: string; body: string; data?: any; type?: string }
  ) {
    try {
      // Process delivery in batches to avoid overwhelming the system
      const batchSize = 100;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        
        // Send to each user in the batch
        await Promise.allSettled(batch.map(userId => 
          this.deliverToUser(notificationId, userId, payload)
        ));
      }

      typedLogger.info('Notification delivery initiated', {
        notificationId,
        totalUsers: userIds.length,
        batches: Math.ceil(userIds.length / batchSize)
      });
    } catch (error) {
      typedLogger.error('Initiate delivery error', { error: (error as any).message, notificationId, userIdCount: userIds.length });
      throw error;
    }
  }

  /**
   * Deliver notification to a specific user
   */
  private static async deliverToUser(
    notificationId: string,
    userId: string,
    payload: { title: string; body: string; data?: any; type?: string }
  ): Promise<void> {
    try {
      // Update user notification status to delivered
      await UserNotification.findOneAndUpdate(
        { 
          notificationId: new Types.ObjectId(notificationId),
          userId: new Types.ObjectId(userId) 
        },
        {
          $set: {
            status: 'delivered',
            isDelivered: true,
            deliveredAt: new Date()
          }
        }
      );

      // Send via appropriate channel
      const result = await PushNotificationService.sendToUser(userId, {
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        type: payload.type
      } as any);

      // Update delivery status based on result
      await UserNotification.findOneAndUpdate(
        { 
          notificationId: new Types.ObjectId(notificationId),
          userId: new Types.ObjectId(userId) 
        },
        {
          $set: {
            deliveryToken: result[0]?.messageId, // First successful delivery token
            ...(result[0]?.success ? {} : { errorReason: result[0]?.error })
          }
        }
      );

      typedLogger.info('Notification delivered to user', {
        notificationId,
        userId,
        deliveryResult: result.map(r => ({ 
          deviceId: r.deviceId, 
          success: r.success, 
          error: r.error 
        }))
      });
    } catch (error) {
      typedLogger.error('Deliver to user error', { 
        error: (error as any).message, 
        notificationId, 
        userId 
      });
      
      // Update with error status
      await UserNotification.findOneAndUpdate(
        { 
          notificationId: new Types.ObjectId(notificationId),
          userId: new Types.ObjectId(userId) 
        },
        {
          $set: {
            status: 'failed',
            errorReason: (error as any).message
          }
        }
      );
    }
  }

  /**
   * Get user-specific notifications
   */
  static async getUserNotifications(input: z.infer<typeof getUserNotificationsSchema>) {
    try {
      const validatedData = getUserNotificationsSchema.parse(input);
      
      const userId = new Types.ObjectId(validatedData.userId);
      const page = validatedData.page;
      const limit = validatedData.limit;
      const skip = (page - 1) * limit;

      // Build query for user notifications
      const query: any = { userId };
      
      if (validatedData.unreadOnly) {
        query.isRead = false;
      }
      
      if (validatedData.type) {
        // This would require a more complex query to match the type in the related Notification document
        // For now, we'll handle this in the aggregate lookup stage
      }

      // Build aggregation pipeline
      const pipeline: any[] = [
        { $match: query },
        {
          $lookup: {
            from: 'notifications',
            localField: 'notificationId',
            foreignField: '_id',
            as: 'globalNotification'
          }
        },
        { $unwind: '$globalNotification' },
      ];

      // Add type filter if specified
      if (validatedData.type) {
        pipeline.push({
          $match: {
            'globalNotification.type': validatedData.type
          }
        });
      }

      pipeline.push(
        {
          $project: {
            id: '$_id',
            userId: 1,
            notificationId: 1,
            title: '$globalNotification.title',
            message: '$globalNotification.message',
            type: '$globalNotification.type',
            isRead: 1,
            isDelivered: 1,
            isArchived: 1,
            deliveredAt: 1,
            readAt: 1,
            archivedAt: 1,
            status: 1,
            createdAt: 1,
            // Include global notification metadata
            metadata: '$globalNotification.metadata',
            priority: '$globalNotification.priority',
            expiresAt: '$globalNotification.expiresAt'
          }
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      );

      // Execute aggregation
      const results = await UserNotification.aggregate(pipeline);

      // Count total for pagination (apply same filters)
      const countPipeline: any[] = [
        { $match: query },
        {
          $lookup: {
            from: 'notifications',
            localField: 'notificationId',
            foreignField: '_id',
            as: 'globalNotification'
          }
        },
        { $unwind: '$globalNotification' },
      ];

      if (validatedData.type) {
        countPipeline.push({
          $match: {
            'globalNotification.type': validatedData.type
          }
        });
      }

      countPipeline.push({
        $count: 'total'
      });

      const countResult = await UserNotification.aggregate(countPipeline);
      const total = countResult[0]?.total || 0;

      return {
        notifications: results,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: skip + limit < total,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`VALIDATION_ERROR: ${error.errors.map(e => e.message).join(', ')}`);
      }
      typedLogger.error('Get user notifications error', { error: (error as any).message, input });
      throw error;
    }
  }

  /**
   * Mark notifications as read for a user
   */
  static async markNotificationsAsRead(input: z.infer<typeof markAsReadSchema>) {
    try {
      const validatedData = markAsReadSchema.parse(input);

      const updateQuery: any = {
        userId: new Types.ObjectId(validatedData.userId)
      };

      if (validatedData.all) {
        // Mark all as read
        updateQuery.isRead = false;
      } else if (validatedData.notificationIds && validatedData.notificationIds.length > 0) {
        // Mark specific notifications as read
        updateQuery._id = {
          $in: validatedData.notificationIds.map(id => new Types.ObjectId(id))
        };
      } else {
        throw new Error('Either "all" or "notificationIds" must be provided');
      }

      const result = await UserNotification.updateMany(
        updateQuery,
        {
          $set: {
            isRead: true,
            readAt: new Date(),
            status: 'opened'
          }
        }
      );

      // Update global notification statistics if needed
      if (validatedData.notificationIds && validatedData.notificationIds.length > 0) {
        // Update statistics for each notification
        for (const notificationId of validatedData.notificationIds) {
          await Notification.findByIdAndUpdate(
            new Types.ObjectId(notificationId),
            {
              $inc: { 'statistics.openedCount': 1 }
            }
          );
        }
      }

      typedLogger.info('Notifications marked as read', {
        userId: validatedData.userId,
        count: result.modifiedCount,
        all: validatedData.all,
        notificationIds: validatedData.notificationIds
      });

      return {
        success: true,
        modifiedCount: result.modifiedCount
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`VALIDATION_ERROR: ${error.errors.map(e => e.message).join(', ')}`);
      }
      typedLogger.error('Mark notifications as read error', { error: (error as any).message, input });
      throw error;
    }
  }

  /**
   * Get notification statistics for admin panel
   */
  static async getNotificationStats() {
    try {
      // Get global notification statistics
      const globalStats = await Notification.aggregate([
        {
          $group: {
            _id: null,
            totalNotifications: { $sum: 1 },
            totalDelivered: { $sum: '$statistics.deliveredCount' },
            totalOpened: { $sum: '$statistics.openedCount' },
            byStatus: {
              $push: {
                status: '$status',
                count: 1
              }
            },
            byType: {
              $push: {
                type: '$type',
                count: 1
              }
            },
            byChannel: {
              $push: {
                channel: '$deliveryMethod',
                count: 1
              }
            }
          }
        }
      ]);

      // Get user engagement statistics
      const userEngagement = await UserNotification.aggregate([
        {
          $group: {
            _id: null,
            totalUserNotifications: { $sum: 1 },
            totalRead: { 
              $sum: { 
                $cond: ['$isRead', 1, 0] 
              } 
            },
            totalDelivered: {
              $sum: {
                $cond: ['$isDelivered', 1, 0]
              }
            }
          }
        }
      ]);

      // Calculate open rate
      const openRate = globalStats[0]?.totalDelivered > 0 
        ? (globalStats[0]?.totalOpened / globalStats[0]?.totalDelivered) * 100 
        : 0;

      return {
        global: globalStats[0] || {
          totalNotifications: 0,
          totalDelivered: 0,
          totalOpened: 0,
          byStatus: [],
          byType: [],
          byChannel: []
        },
        engagement: userEngagement[0] || {
          totalUserNotifications: 0,
          totalRead: 0,
          totalDelivered: 0
        },
        openRate: openRate,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      typedLogger.error('Get notification stats error', { error: (error as any).message });
      throw error;
    }
  }

  /**
   * Get user's notification preferences
   */
  static async getUserPreferences(userId: string) {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new Error('INVALID_USER_ID');
      }

      const user = await User.findById(userId).select('preferences.notifications').lean();
      
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Return user's notification preferences with defaults
      return user.preferences?.notifications || {
        push: true,
        email: false,
        inApp: true,
        sms: false,
        // Default preferences per notification type
        types: {
          system: true,
          promotional: false,
          social: true,
          achievement: true,
          challenge: true
        }
      };
    } catch (error) {
      typedLogger.error('Get user preferences error', { error: (error as any).message, userId });
      throw error;
    }
  }

  /**
   * Update user's notification preferences
   */
  static async updateUserPreferences(userId: string, preferences: any) {
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new Error('INVALID_USER_ID');
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $set: { 'preferences.notifications': preferences } },
        { new: true, select: 'preferences.notifications' }
      );

      if (!updatedUser) {
        throw new Error('USER_NOT_FOUND');
      }

      typedLogger.info('User notification preferences updated', { 
        userId, 
        preferences 
      });

      return updatedUser.preferences?.notifications;
    } catch (error) {
      typedLogger.error('Update user preferences error', { 
        error: (error as any).message, 
        userId, 
        preferences 
      });
      throw error;
    }
  }

  /**
   * Clean up expired notifications (to be called by scheduler)
   */
  static async cleanupExpiredNotifications() {
    try {
      const now = new Date();
      
      // Find notifications that have expired and are no longer needed
      const result = await Notification.deleteMany({
        expiresAt: { $lt: now },
        createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Keep for at least 30 days
      });

      typedLogger.info('Expired notifications cleaned up', {
        deletedCount: result.deletedCount
      });

      return {
        success: true,
        deletedCount: result.deletedCount
      };
    } catch (error) {
      typedLogger.error('Cleanup expired notifications error', { error: (error as any).message });
      throw error;
    }
  }
}

export default UnifiedNotificationService;
