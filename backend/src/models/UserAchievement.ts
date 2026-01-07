import { Schema, model, Types } from 'mongoose';

/**
 * UserAchievement Interface
 */
export interface IUserAchievement {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  achievementId: Types.ObjectId;
  progress: number; // 0-100
  unlockedAt?: Date;
  notified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * UserAchievement Schema
 */
const userAchievementSchema = new Schema<IUserAchievement>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  achievementId: {
    type: Schema.Types.ObjectId,
    ref: 'Achievement',
    required: true,
    index: true,
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  unlockedAt: {
    type: Date,
  },
  notified: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Index composé pour éviter les doublons
userAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });
userAchievementSchema.index({ userId: 1, unlockedAt: 1 });
userAchievementSchema.index({ userId: 1, progress: 1 });

// Virtual pour savoir si débloqué
userAchievementSchema.virtual('isUnlocked').get(function() {
  return !!this.unlockedAt;
});

/**
 * UserAchievement Model
 */
export const UserAchievement = model<IUserAchievement>('UserAchievement', userAchievementSchema);
export default UserAchievement;

