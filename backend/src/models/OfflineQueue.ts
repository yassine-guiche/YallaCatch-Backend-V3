import { Schema, model, Model, Types } from 'mongoose';

/**
 * Offline Action Type
 */
export enum OfflineActionType {
  CLAIM_PRIZE = 'claim_prize',
  UPDATE_PROFILE = 'update_profile',
  SEND_FRIEND_REQUEST = 'send_friend_request',
  ACCEPT_FRIEND_REQUEST = 'accept_friend_request',
  PURCHASE_ITEM = 'purchase_item',
  UNLOCK_ACHIEVEMENT = 'unlock_achievement',
}

/**
 * Offline Action Status
 */
export enum OfflineActionStatus {
  PENDING = 'pending',
  SYNCING = 'syncing',
  SYNCED = 'synced',
  FAILED = 'failed',
  CONFLICT = 'conflict',
}

/**
 * Conflict Resolution Strategy
 */
export enum ConflictResolution {
  SERVER_WINS = 'server_wins',
  CLIENT_WINS = 'client_wins',
  MERGE = 'merge',
  MANUAL = 'manual',
}

/**
 * Offline Queue Interface
 */
export interface IOfflineQueue {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  actionType: OfflineActionType;
  actionData: any;
  status: OfflineActionStatus;
  clientTimestamp: Date;
  serverTimestamp?: Date;
  syncedAt?: Date;
  attempts: number;
  maxAttempts: number;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  conflict?: {
    serverData: any;
    clientData: any;
    resolution: ConflictResolution;
    resolvedData?: any;
  };
  metadata: {
    deviceId: string;
    platform: string;
    appVersion: string;
    networkType?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Offline Queue Schema
 */
const offlineQueueSchema = new Schema<IOfflineQueue>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  actionType: {
    type: String,
    enum: Object.values(OfflineActionType),
    required: true,
    index: true,
  },
  actionData: {
    type: Schema.Types.Mixed,
    required: true,
  },
  status: {
    type: String,
    enum: Object.values(OfflineActionStatus),
    default: OfflineActionStatus.PENDING,
    index: true,
  },
  clientTimestamp: {
    type: Date,
    required: true,
  },
  serverTimestamp: {
    type: Date,
  },
  syncedAt: {
    type: Date,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  maxAttempts: {
    type: Number,
    default: 3,
  },
  error: {
    code: String,
    message: String,
    details: Schema.Types.Mixed,
  },
  conflict: {
    serverData: Schema.Types.Mixed,
    clientData: Schema.Types.Mixed,
    resolution: {
      type: String,
      enum: Object.values(ConflictResolution),
    },
    resolvedData: Schema.Types.Mixed,
  },
  metadata: {
    deviceId: {
      type: String,
      required: true,
    },
    platform: {
      type: String,
      required: true,
    },
    appVersion: {
      type: String,
      required: true,
    },
    networkType: String,
  },
}, {
  timestamps: true,
});

// Indexes
offlineQueueSchema.index({ userId: 1, status: 1, createdAt: -1 });
offlineQueueSchema.index({ status: 1, attempts: 1 });
offlineQueueSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days

/**
 * Offline Queue Model
 */
export const OfflineQueue: Model<IOfflineQueue> = model<IOfflineQueue>('OfflineQueue', offlineQueueSchema);

