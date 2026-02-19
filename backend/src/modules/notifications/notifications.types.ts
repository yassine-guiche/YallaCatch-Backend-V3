import { NotificationType, NotificationTargetType } from '@/types';

export interface SendNotificationData {
    title: string;
    message: string;
    type: NotificationType;
    targetType: NotificationTargetType;
    targetValue?: string;
    scheduledFor?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>;
}

export interface GetUserNotificationOptions {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
}

export interface MarkAsReadData {
    notificationIds?: string[];
    all?: boolean;
}

export interface NotificationSettings {
    push?: boolean;
    email?: boolean;
    sms?: boolean;
    inApp?: boolean;
}

export interface PushSubscriptionData {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}
