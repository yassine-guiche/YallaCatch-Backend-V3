import { Schema, model, Types } from 'mongoose';

/**
 * Achievement Category Enum
 */
export enum AchievementCategory {
  EXPLORER = 'explorer',
  COLLECTOR = 'collector',
  SOCIAL = 'social',
  MASTER = 'master',
  SPECIAL = 'special',
}

/**
 * Achievement Trigger Enum
 */
export enum AchievementTrigger {
  PRIZE_CLAIMED = 'PRIZE_CLAIMED',
  LEVEL_UP = 'LEVEL_UP',
  REWARD_REDEEMED = 'REWARD_REDEEMED',
  FRIEND_ADDED = 'FRIEND_ADDED',
  STREAK_MILESTONE = 'STREAK_MILESTONE',
  DISTANCE_MILESTONE = 'DISTANCE_MILESTONE',
  MANUAL = 'MANUAL',
}

/**
 * Achievement Condition Type Enum
 */
export enum AchievementConditionType {
  TOTAL_CLAIMS = 'TOTAL_CLAIMS',
  TOTAL_POINTS = 'TOTAL_POINTS',
  LEVEL_REACHED = 'LEVEL_REACHED',
  STREAK_DAYS = 'STREAK_DAYS',
  CATEGORY_CLAIMS = 'CATEGORY_CLAIMS',
  RARITY_CLAIMS = 'RARITY_CLAIMS',
  DISTANCE_TRAVELED = 'DISTANCE_TRAVELED',
  FRIENDS_COUNT = 'FRIENDS_COUNT',
  REWARDS_REDEEMED = 'REWARDS_REDEEMED',
}

/**
 * Achievement Reward Type Enum
 */
export enum AchievementRewardType {
  POINTS = 'POINTS',
  POWER_UP = 'POWER_UP',
  COSMETIC = 'COSMETIC',
  TITLE = 'TITLE',
  BADGE = 'BADGE',
}

/**
 * Achievement Interface
 */
export interface IAchievement {
  _id: Types.ObjectId;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  trigger: AchievementTrigger;
  condition: {
    type: AchievementConditionType;
    target: number;
    category?: string;
    rarity?: string;
  };
  rewards: Array<{
    type: AchievementRewardType;
    value: any;
    description: string;
  }>;
  isActive: boolean;
  isHidden: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Achievement Schema
 */
const achievementSchema = new Schema<IAchievement>({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  icon: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: Object.values(AchievementCategory),
    required: true,
    index: true,
  },
  trigger: {
    type: String,
    enum: Object.values(AchievementTrigger),
    required: true,
    index: true,
  },
  condition: {
    type: {
      type: String,
      enum: Object.values(AchievementConditionType),
      required: true,
    },
    target: {
      type: Number,
      required: true,
      min: 1,
    },
    category: String,
    rarity: String,
  },
  rewards: [{
    type: {
      type: String,
      enum: Object.values(AchievementRewardType),
      required: true,
    },
    value: Schema.Types.Mixed,
    description: String,
  }],
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  isHidden: {
    type: Boolean,
    default: false,
  },
  order: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

// Indexes
achievementSchema.index({ category: 1, order: 1 });
achievementSchema.index({ trigger: 1, isActive: 1 });

/**
 * Achievement Model
 */
export const Achievement = model<IAchievement>('Achievement', achievementSchema);
export default Achievement;

