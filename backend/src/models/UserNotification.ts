import { Schema, model, Model, Types } from 'mongoose';
import { DevicePlatform } from './DeviceToken';

// Define the UserNotification interface
export interface IUserNotification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;           // Reference to user
  notificationId: Types.ObjectId;   // Reference to global notification
  status: 'sent' | 'delivered' | 'opened' | 'archived';
  isRead: boolean;
  isDelivered: boolean;
  isArchived: boolean;
  deliveredAt?: Date;
  readAt?: Date;
  archivedAt?: Date;
  channel: 'push' | 'email' | 'inapp';
  deliveryToken?: string;           // FCM/APNS token used for delivery
  errorReason?: string;             // Reason for delivery failure
  preferencesApplied: {             // Preferences at time of delivery
    push: boolean;
    email: boolean;
    inApp: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Define the UserNotification schema
const userNotificationSchema = new Schema<IUserNotification>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  notificationId: {
    type: Schema.Types.ObjectId,
    ref: 'Notification',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'opened', 'archived'],
    default: 'sent',
    required: true
  },
  isRead: {
    type: Boolean,
    default: false,
    required: true
  },
  isDelivered: {
    type: Boolean,
    default: false,
    required: true
  },
  isArchived: {
    type: Boolean,
    default: false,
    required: true
  },
  deliveredAt: Date,
  readAt: Date,
  archivedAt: Date,
  channel: {
    type: String,
    enum: ['push', 'email', 'inapp'],
    required: true
  },
  deliveryToken: {
    type: String,
    // Token used for this specific delivery (FCM, APNS, etc.)
  },
  errorReason: {
    type: String,
    // If delivery failed, store the error reason
  },
  preferencesApplied: {
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    inApp: { type: Boolean, default: true }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create compound index for efficient queries
userNotificationSchema.index({ userId: 1, createdAt: -1 });
userNotificationSchema.index({ userId: 1, isRead: 1 });
userNotificationSchema.index({ notificationId: 1, userId: 1 }, { unique: true }); // Each user gets each notification only once

export const UserNotification: Model<IUserNotification> = model<IUserNotification>('UserNotification', userNotificationSchema);
export default UserNotification;