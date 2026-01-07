import { Schema, model, Model, Types } from 'mongoose';

/**
 * Device Platform
 */
export enum DevicePlatform {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

/**
 * Notification Preferences
 */
export interface INotificationPreferences {
  enabled: boolean;
  prizeNearby: boolean;
  friendRequest: boolean;
  achievementUnlocked: boolean;
  dailyReminder: boolean;
  marketplaceDeals: boolean;
  eventStarted: boolean;
  levelUp: boolean;
}

/**
 * Device Token Interface
 */
export interface IDeviceToken {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  deviceId: string;
  platform: DevicePlatform;
  fcmToken: string;
  apnsToken?: string;
  isActive: boolean;
  preferences: INotificationPreferences;
  lastUsed: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Device Token Schema
 */
const deviceTokenSchema = new Schema<IDeviceToken>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  deviceId: {
    type: String,
    required: true,
    index: true,
  },
  platform: {
    type: String,
    enum: Object.values(DevicePlatform),
    required: true,
  },
  fcmToken: {
    type: String,
    required: true,
    unique: true,
    sparse: true,
  },
  apnsToken: {
    type: String,
    sparse: true,
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  preferences: {
    enabled: {
      type: Boolean,
      default: true,
    },
    prizeNearby: {
      type: Boolean,
      default: true,
    },
    friendRequest: {
      type: Boolean,
      default: true,
    },
    achievementUnlocked: {
      type: Boolean,
      default: true,
    },
    dailyReminder: {
      type: Boolean,
      default: true,
    },
    marketplaceDeals: {
      type: Boolean,
      default: true,
    },
    eventStarted: {
      type: Boolean,
      default: true,
    },
    levelUp: {
      type: Boolean,
      default: true,
    },
  },
  lastUsed: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Indexes
deviceTokenSchema.index({ userId: 1, deviceId: 1 });
deviceTokenSchema.index({ isActive: 1, userId: 1 });

/**
 * Device Token Model
 */
export const DeviceToken: Model<IDeviceToken> = model<IDeviceToken>('DeviceToken', deviceTokenSchema);
