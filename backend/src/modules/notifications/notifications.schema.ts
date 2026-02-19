import { z } from 'zod';
import { NotificationType, NotificationTargetType } from '@/types';

export const sendNotificationSchema = z.object({
    title: z.string().min(1).max(100),
    message: z.string().min(1).max(500),
    type: z.nativeEnum(NotificationType),
    targetType: z.nativeEnum(NotificationTargetType),
    targetValue: z.string().optional(),
    scheduledFor: z.string().datetime().optional(),
    metadata: z.record(z.unknown()).optional()
});

export const getNotificationsSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(50).default(20),
    unreadOnly: z.coerce.boolean().default(false)
});

export const markAsReadSchema = z.object({
    notificationIds: z.array(z.string()).optional(),
    all: z.boolean().optional()
});

export const updateSettingsSchema = z.object({
    push: z.boolean().optional(),
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    inApp: z.boolean().optional()
});

export const subscribePushSchema = z.object({
    endpoint: z.string().url(),
    keys: z.object({
        p256dh: z.string(),
        auth: z.string()
    })
});
