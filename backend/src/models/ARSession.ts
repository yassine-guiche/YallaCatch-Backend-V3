import { Schema, model, Model, Types } from 'mongoose';

/**
 * AR Session Status
 */
export enum ARSessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

/**
 * AR Session Interface
 */
export interface IARSession {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  prizeId: Types.ObjectId;
  sessionId: string;
  status: ARSessionStatus;
  startedAt: Date;
  completedAt?: Date;
  duration: number; // seconds
  screenshots: Array<{
    url: string;
    timestamp: Date;
    location?: {
      lat: number;
      lng: number;
    };
  }>;
  metadata: {
    deviceModel?: string;
    osVersion?: string;
    arKitVersion?: string;
    arCoreVersion?: string;
    cameraPermission: boolean;
    locationPermission: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AR Session Schema
 */
const arSessionSchema = new Schema<IARSession>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  prizeId: {
    type: Schema.Types.ObjectId,
    ref: 'Prize',
    required: true,
    index: true,
  },
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  status: {
    type: String,
    enum: Object.values(ARSessionStatus),
    default: ARSessionStatus.ACTIVE,
    index: true,
  },
  startedAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
  completedAt: {
    type: Date,
  },
  duration: {
    type: Number,
    default: 0,
  },
  screenshots: [{
    url: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    location: {
      lat: Number,
      lng: Number,
    },
  }],
  metadata: {
    deviceModel: String,
    osVersion: String,
    arKitVersion: String,
    arCoreVersion: String,
    cameraPermission: {
      type: Boolean,
      required: true,
    },
    locationPermission: {
      type: Boolean,
      required: true,
    },
  },
}, {
  timestamps: true,
});

// Indexes
arSessionSchema.index({ userId: 1, createdAt: -1 });
arSessionSchema.index({ prizeId: 1, createdAt: -1 });
arSessionSchema.index({ status: 1, createdAt: -1 });

// Auto-expire sessions after 30 minutes
arSessionSchema.index({ startedAt: 1 }, { expireAfterSeconds: 1800 });

/**
 * AR Session Model
 */
export const ARSession: Model<IARSession> = model<IARSession>('ARSession', arSessionSchema);
