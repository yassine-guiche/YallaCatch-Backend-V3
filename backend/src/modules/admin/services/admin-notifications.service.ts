import { User } from '@/models';
import { Notification } from '@/models/Notification';
import { NotificationService } from '@/modules/notifications';
import { NotificationStatus, NotificationType, NotificationTargetType } from '@/types';
import { Types } from 'mongoose';
import { typedLogger } from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';
import { audit } from '@/lib/audit-logger';
import { Settings } from '@/models/Settings';
import { randomUUID } from 'crypto';

interface NotificationQuery {
  page?: number;
  limit?: number;
  status?: NotificationStatus | string;
  type?: string;
}

interface NotificationPayload {
  title: string;
  message: string;
  type?: string | NotificationType;
  data?: Record<string, unknown>;
  targetUserIds?: string[];
}

interface ScheduledNotificationPayload extends NotificationPayload {
  scheduledFor: Date;
}

interface NotificationStats {
  totalSent: number;
  sentToday: number;
  sentThisWeek: number;
  scheduled: number;
  failed: number;
}

export class AdminNotificationsService {
  static async getNotificationById(id: string) {
    const notification = await Notification.findById(id).lean();
    return notification || null;
  }

  static async getNotifications(query: NotificationQuery) {
    const { page = 1, limit = 20, status, type } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (type) filter.type = type;

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
    ]);

    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  static async sendNotification(adminId: string, payload: NotificationPayload) {
    const normalizeType = (t?: string | NotificationType) => {
      if (!t) return NotificationType.PUSH;
      const val = (t as string).toLowerCase();
      return (Object.values(NotificationType) as string[]).includes(val) ? (val as NotificationType) : NotificationType.PUSH;
    };

    const { title, message, data, targetUserIds } = payload;
    const type = normalizeType(payload.type);

    if (!targetUserIds || targetUserIds.length === 0) {
      throw new Error('Target user IDs are required');
    }

    const results = await Promise.all(
      targetUserIds.map(async (userId) => {
        try {
          await NotificationService.sendNotification(adminId, {
            title,
            message,
            type,
            targetType: NotificationTargetType.USER,
            targetValue: userId,
            metadata: data || {},
          } as any);
          return { userId, success: true };
        } catch (error) {
          typedLogger.error('Failed to send notification', { userId, error });
          return { userId, success: false, error };
        }
      })
    );

    await this.logAdminAction(adminId, 'SEND_NOTIFICATION', {
      targetCount: targetUserIds.length,
      successCount: results.filter((r) => r.success).length,
    });

    return {
      sent: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  static async broadcastNotification(adminId: string, payload: NotificationPayload) {
    const normalizeType = (t?: string | NotificationType) => {
      if (!t) return NotificationType.PUSH;
      const val = (t as string).toLowerCase();
      return (Object.values(NotificationType) as string[]).includes(val) ? (val as NotificationType) : NotificationType.PUSH;
    };

    const { title, message, data } = payload;
    const type = normalizeType(payload.type);

    // Single notification targeted to ALL users (NotificationService will fan-out)
    await NotificationService.sendNotification(adminId, {
      title,
      message,
      type,
      targetType: NotificationTargetType.ALL,
      metadata: data || {},
    } as any);

    await this.logAdminAction(adminId, 'BROADCAST_NOTIFICATION', {
      totalUsers: 'ALL',
      sent: 'ALL',
      failed: 0,
    });

    typedLogger.info('Broadcast notification created (ALL users)');

    return { totalUsers: 'ALL', sent: 'ALL', failed: 0 };
  }

  static async scheduleNotification(adminId: string, payload: ScheduledNotificationPayload) {
    const normalizeType = (t?: string | NotificationType) => {
      if (!t) return NotificationType.PUSH;
      const val = (t as string).toLowerCase();
      return (Object.values(NotificationType) as string[]).includes(val) ? (val as NotificationType) : NotificationType.PUSH;
    };

    const { title, message, data, targetUserIds, scheduledFor } = payload;
    const type = normalizeType(payload.type);

    const scheduledDate = new Date(scheduledFor);
    if (scheduledDate <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    const targetIds = targetUserIds && targetUserIds.length > 0 ? targetUserIds : null;

    if (targetIds) {
      const notifications = await Promise.all(
        targetIds.map((userId) =>
          NotificationService.sendNotification(adminId, {
            title,
            message,
            type: type as NotificationType,
            targetType: NotificationTargetType.USER,
            targetValue: userId,
            scheduledFor: scheduledDate.toISOString(),
            metadata: data || {},
          } as any)
        )
      );

      for (const n of notifications) {
        await redisClient.zadd('scheduled_notifications', scheduledDate.getTime(), (n as any)._id.toString());
      }

      await this.logAdminAction(adminId, 'SCHEDULE_NOTIFICATION', {
        notificationIds: notifications.map((n: any) => n._id),
        scheduledFor: scheduledDate,
      });

      return notifications;
    }

    const notification = await NotificationService.sendNotification(adminId, {
      title,
      message,
      type: type as NotificationType,
      targetType: NotificationTargetType.ALL,
      scheduledFor: scheduledDate.toISOString(),
      metadata: data || {},
    } as any);

    await redisClient.zadd('scheduled_notifications', scheduledDate.getTime(), (notification as any)._id.toString());

    await this.logAdminAction(adminId, 'SCHEDULE_NOTIFICATION', {
      notificationId: (notification as any)._id,
      scheduledFor: scheduledDate,
    });

    return notification;
  }

  static async getNotificationStats(period: string): Promise<NotificationStats> {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);

    const [totalSent, sentToday, sentThisWeek, scheduled, failed] = await Promise.all([
      Notification.countDocuments({ status: NotificationStatus.SENT || 'sent' }),
      Notification.countDocuments({
        status: NotificationStatus.SENT || 'sent',
        createdAt: { $gte: todayStart },
      }),
      Notification.countDocuments({
        status: NotificationStatus.SENT || 'sent',
        createdAt: { $gte: weekStart },
      }),
      Notification.countDocuments({ status: NotificationStatus.SCHEDULED || 'scheduled' }),
      Notification.countDocuments({ status: NotificationStatus.FAILED || 'failed' }),
    ]);

    return {
      totalSent,
      sentToday,
      sentThisWeek,
      scheduled,
      failed,
    };
  }

  static async getTemplates() {
    const settings = await Settings.findOne({}, { 'custom.notificationsTemplates': 1 }).lean();
    const templates = (settings as any)?.custom?.notificationsTemplates;
    if (templates && Array.isArray(templates)) return templates;

    return [
      { id: 'prize_nearby', channel: 'push', name: 'Prize Nearby Alert', variables: ['prizeName', 'distance'] },
      { id: 'prize_claimed', channel: 'push', name: 'Prize Claimed', variables: ['prizeName', 'points'] },
      { id: 'level_up', channel: 'push', name: 'Level Up Notification', variables: ['newLevel', 'rewards'] },
      { id: 'welcome_email', channel: 'email', name: 'Welcome Email', variables: ['userName', 'verificationLink'] },
      { id: 'password_reset', channel: 'email', name: 'Password Reset', variables: ['resetLink'] },
    ];
  }

  private static async saveTemplates(templates: Array<Record<string, unknown>>) {
    await Settings.findOneAndUpdate(
      {},
      { $set: { 'custom.notificationsTemplates': templates, updatedAt: new Date() } },
      { upsert: true }
    );
    return templates;
  }

  static async createTemplate(adminId: string, template: { id?: string; name: string; channel: string; variables?: string[]; content?: Record<string, unknown> }) {
    const templates = await this.getTemplates();
    const id = template.id || randomUUID();
    const entry = { id, name: template.name, channel: template.channel, variables: template.variables || [], content: template.content || {} };
    const updated = [...templates, entry];
    await this.saveTemplates(updated);

    // Audit log for template creation
    await this.logAdminAction(adminId, 'CREATE_NOTIFICATION_TEMPLATE', {
      templateId: id,
      templateName: template.name,
      channel: template.channel,
    });

    return entry;
  }

  static async updateTemplate(adminId: string, templateId: string, changes: Partial<{ name: string; channel: string; variables: string[]; content: Record<string, unknown> }>) {
    const templates = await this.getTemplates();
    const idx = templates.findIndex((t: Record<string, unknown>) => t.id === templateId);
    if (idx === -1) throw new Error('TEMPLATE_NOT_FOUND');
    const updatedTemplate = { ...templates[idx], ...changes };
    templates[idx] = updatedTemplate;
    await this.saveTemplates(templates);

    // Audit log for template update
    await this.logAdminAction(adminId, 'UPDATE_NOTIFICATION_TEMPLATE', {
      templateId,
      changedFields: Object.keys(changes),
    });

    return updatedTemplate;
  }

  static async deleteTemplate(adminId: string, templateId: string) {
    const templates = await this.getTemplates();
    const template = templates.find((t: Record<string, unknown>) => t.id === templateId);
    const filtered = templates.filter((t: Record<string, unknown>) => t.id !== templateId);
    if (filtered.length === templates.length) throw new Error('TEMPLATE_NOT_FOUND');
    await this.saveTemplates(filtered);

    // Audit log for template deletion
    await this.logAdminAction(adminId, 'DELETE_NOTIFICATION_TEMPLATE', {
      templateId,
      templateName: template?.name,
    });

    return { success: true };
  }

  private static async logAdminAction(
    adminId: string,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    // Use unified audit logger - writes to both Pino and MongoDB
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action,
      resource: 'notification',
      category: 'admin',
      severity: 'low',
      metadata: details,
    });
  }
}

export default AdminNotificationsService;
