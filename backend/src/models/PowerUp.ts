import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPowerUp extends Document {
  _id: Types.ObjectId;
  name: string;
  description: string;
  type: 'radar_boost' | 'double_points' | 'speed_boost' | 'shield' | 'time_extension';
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  durationMs: number;
  
  // Drop configuration
  dropRate: number; // 0-100, percentage chance to drop on prize claim
  maxPerSession: number; // Max instances per game session
  maxInInventory: number; // Max player can hold
  
  // Effect values
  effects: {
    radarBoost?: { radiusMultiplier: number };
    doublePoints?: { pointsMultiplier: number };
    speedBoost?: { speedMultiplier: number };
    shield?: { damageMitigation: number };
    timeExtension?: { additionalTimeMs: number };
  };
  
  // Inventory & distribution
  totalCreated: number; // Total instances ever created
  totalClaimed: number; // Total instances claimed by players
  activeInstances: number; // Currently in player inventories
  usageCount: number; // Times used in gameplay
  
  // Analytics
  claimRate: number; // % of sessions where dropped
  adoptionRate: number; // % of players who have used
  averageUsagePerSession: number;
  
  // Management
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: Types.ObjectId; // Admin who created
  lastModifiedBy: Types.ObjectId;
  notes?: string;
}

const PowerUpSchema = new Schema<IPowerUp>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 50,
    },
    description: {
      type: String,
      required: true,
      maxlength: 500,
    },
    type: {
      type: String,
      enum: ['radar_boost', 'double_points', 'speed_boost', 'shield', 'time_extension'],
      required: true,
    },
    icon: {
      type: String,
      required: true,
      default: '⚡',
    },
    rarity: {
      type: String,
      enum: ['common', 'rare', 'epic', 'legendary'],
      default: 'common',
    },
    durationMs: {
      type: Number,
      required: true,
      min: 1000,
      max: 3600000, // 1 hour max
    },
    
    // Drop configuration
    dropRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 10, // 10% default
    },
    maxPerSession: {
      type: Number,
      min: 1,
      default: 3,
    },
    maxInInventory: {
      type: Number,
      min: 1,
      default: 10,
    },
    
    // Effect values
    effects: {
      type: {
        radarBoost: {
          radiusMultiplier: { type: Number, min: 1.0, max: 5.0 },
        },
        doublePoints: {
          pointsMultiplier: { type: Number, min: 1.5, max: 10.0 },
        },
        speedBoost: {
          speedMultiplier: { type: Number, min: 1.1, max: 3.0 },
        },
        shield: {
          damageMitigation: { type: Number, min: 0, max: 1 },
        },
        timeExtension: {
          additionalTimeMs: { type: Number, min: 1000, max: 600000 },
        },
      },
      default: {},
    },
    
    // Inventory & distribution
    totalCreated: {
      type: Number,
      default: 0,
    },
    totalClaimed: {
      type: Number,
      default: 0,
    },
    activeInstances: {
      type: Number,
      default: 0,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    
    // Analytics
    claimRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    adoptionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    averageUsagePerSession: {
      type: Number,
      default: 0,
    },
    
    // Management
    enabled: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
PowerUpSchema.index({ enabled: 1, createdAt: -1 });
PowerUpSchema.index({ type: 1 });
PowerUpSchema.index({ rarity: 1 });
PowerUpSchema.index({ name: 'text', description: 'text' });

export default mongoose.model<IPowerUp>('PowerUp', PowerUpSchema);
