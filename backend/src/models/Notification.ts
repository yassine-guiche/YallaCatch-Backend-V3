import { Schema, model, Model } from 'mongoose';
import { INotification, NotificationType, NotificationTargetType, NotificationStatus } from '@/types';

const notificationSchema = new Schema<INotification>({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: Object.values(NotificationType), required: true },
  targetType: { type: String, enum: Object.values(NotificationTargetType), required: true },
  targetValue: String,
  status: { type: String, enum: Object.values(NotificationStatus), default: NotificationStatus.DRAFT },
  scheduledFor: Date,
  sentAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  metadata: { type: Schema.Types.Mixed, default: {} },

  // Production-level fields
  priority: {
    type: Number,
    min: 1,
    max: 5,
    default: 3,
    index: true
  },
  expiresAt: {
    type: Date,
  },
  deliveryMethod: {
    type: String,
    enum: ['push', 'email', 'inapp', 'all'],
    default: 'all',
    required: true
  },
  channelPreferences: {
    push: Boolean,
    email: Boolean,
    inApp: Boolean
  },
  statistics: {
    totalTargets: { type: Number, default: 0 },
    deliveredCount: { type: Number, default: 0 },
    openedCount: { type: Number, default: 0 },
    clickedCount: { type: Number, default: 0 }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add indexes for better query performance
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ status: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-expire notifications
notificationSchema.index({ scheduledFor: 1 }); // For scheduled notifications
notificationSchema.index({ createdBy: 1 }); // For admin queries

export const Notification: Model<INotification> = model<INotification>('Notification', notificationSchema);
export default Notification;
