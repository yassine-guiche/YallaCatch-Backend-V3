import { Schema, model, Model, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser, IDevice, IUserModel, IUserMethods, IUserVirtuals, UserRole, UserLevel, Platform, Language, Theme, AchievementTrigger } from '@/types';
import { config } from '@/config';
import { typedLogger } from '@/lib/typed-logger';

// Device subdocument schema
const deviceSchema = new Schema<IDevice>({
  deviceId: {
    type: String,
    required: true,
    index: true,
  },
  platform: {
    type: String,
    enum: Object.values(Platform),
    required: true
  },
  fcmToken: {
    type: String,
    sparse: true,
  },
  model: { type: String },
  osVersion: { type: String },
  appVersion: { type: String },
  userAgent: { type: String },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
}, { _id: false });

// Main user schema
const userSchema = new Schema<IUser, IUserModel, IUserMethods, {}, IUserVirtuals>({
  email: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function (email: string) {
        return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Invalid email format'
    }
  },
  passwordHash: {
    type: String,
    select: false, // Don't include in queries by default
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 50,
  },
  role: {
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.PLAYER,
    index: true,
  },
  partnerId: {
    type: Schema.Types.ObjectId,
    ref: 'Partner',
    index: true,
    required: false,
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
    trim: true,
    uppercase: true,
  },
  referredBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  points: {
    available: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      default: 0,
      min: 0,
      index: true, // For leaderboards
    },
    spent: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  level: {
    type: String,
    enum: Object.values(UserLevel),
    default: UserLevel.BRONZE,
    index: true,
  },
  location: {
    lat: {
      type: Number,
      min: -90,
      max: 90,
    },
    lng: {
      type: Number,
      min: -180,
      max: 180,
    },
    city: {
      type: String,
      index: true,
    },
    lastUpdated: {
      type: Date
    },
  },
  stats: {
    prizesFound: {
      type: Number,
      default: 0,
      min: 0,
    },
    rewardsRedeemed: {
      type: Number,
      default: 0,
      min: 0,
    },
    sessionsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPlayTime: {
      type: Number,
      default: 0,
      min: 0, // in seconds
    },
    longestStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    currentStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    favoriteCity: {
      type: String
    },
    lastClaimDate: {
      type: Date
    },
    dailyClaimsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  devices: [deviceSchema],
  preferences: {
    notifications: {
      type: Boolean,
      default: true
    },
    language: {
      type: String,
      enum: Object.values(Language),
      default: Language.FR
    },
    theme: {
      type: String,
      enum: Object.values(Theme),
      default: Theme.LIGHT
    },
  },
  isGuest: {
    type: Boolean,
    default: false,
    index: true,
  },
  isBanned: {
    type: Boolean,
    default: false,
    index: true,
  },
  // Game inventory and effects system
  inventory: {
    powerUps: [{
      id: String,
      type: { type: String },
      quantity: { type: Number, default: 0 },
      expiresAt: Date
    }],
    items: [{
      id: String,
      name: String,
      type: String,
      quantity: { type: Number, default: 0 },
      expiresAt: Date
    }]
  },
  activeEffects: [{
    type: String,
    effect: Schema.Types.Mixed,
    expiresAt: Date,
    createdAt: { type: Date, default: Date.now }
  }],
  banReason: {
    type: String
  },
  banExpiresAt: {
    type: Date,
    index: true,
  },
  phoneNumber: {
    type: String,
    sparse: true,  // Allows multiple null values but unique for non-null values
  },
  avatar: {
    type: String,
    default: null,
  },
  lastIp: {
    type: String,
    index: true,
  },
  lastUserAgent: {
    type: String,
  },
  lastActive: {
    type: Date,
    default: Date.now,
    index: true,
  },
  deletedAt: {
    type: Date,
    index: true,
  },
  favorites: [{
    type: Schema.Types.ObjectId,
    ref: 'Reward',
  }],
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.passwordHash;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform: function (doc, ret) {
      delete ret.passwordHash;
      delete ret.__v;
      return ret;
    }
  }
});

// Compound indexes
userSchema.index({ role: 1, lastActive: -1 });
userSchema.index({ 'location.city': 1, level: 1 });
userSchema.index({ isBanned: 1, deletedAt: 1 });

// Virtual fields
userSchema.virtual('isActive').get(function () {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return this.lastActive > oneWeekAgo;
});

userSchema.virtual('levelProgress').get(function () {
  const levelRequirements = {
    [UserLevel.BRONZE]: 0,
    [UserLevel.SILVER]: 1000,
    [UserLevel.GOLD]: 5000,
    [UserLevel.PLATINUM]: 15000,
    [UserLevel.DIAMOND]: 50000,
  };

  const currentRequirement = levelRequirements[this.level];
  const nextLevel = Object.values(UserLevel)[Object.values(UserLevel).indexOf(this.level) + 1];
  const nextRequirement = nextLevel ? levelRequirements[nextLevel] : null;

  if (!nextRequirement) {
    return {
      progress: 100,
      pointsToNext: 0,
      nextLevel: null,
      currentLevel: this.level,
      pointsForNext: 0
    };
  }

  const progress = Math.min(100, ((this.points.total - currentRequirement) / (nextRequirement - currentRequirement)) * 100);
  const pointsToNext = Math.max(0, nextRequirement - this.points.total);

  return {
    progress,
    pointsToNext,
    nextLevel,
    currentLevel: this.level,
    pointsForNext: pointsToNext
  };
});

userSchema.virtual('activeDevice').get(function () {
  if (!this.devices || !Array.isArray(this.devices)) return null;
  return this.devices.find(device => device.isActive) || this.devices[0];
});

// isGuest is a real field in the schema, not a virtual

userSchema.virtual('canClaim').get(function () {
  if (this.isBanned) return false;
  if (this.deletedAt) return false;

  // Check daily limit
  const today = new Date();
  const lastClaim = this.stats.lastClaimDate;

  if (lastClaim &&
    lastClaim.toDateString() === today.toDateString() &&
    this.stats.dailyClaimsCount >= config.GAME_MAX_DAILY_CLAIMS) {
    return false;
  }

  return true;
});

// Pre-save middleware for password hashing
userSchema.pre('save', async function (next) {
  try {
    // Hash password if modified
    if (this.isModified('passwordHash') && this.passwordHash) {
      // Avoid double hashing if already looks like a bcrypt hash
      if (!this.passwordHash.startsWith('$2a$') && !this.passwordHash.startsWith('$2b$') && !this.passwordHash.startsWith('$2y$')) {
        this.passwordHash = await bcrypt.hash(this.passwordHash, config.BCRYPT_ROUNDS);
      }
    }

    // Update level based on points
    (this as any).updateLevel();

    // Reset daily claims count if it's a new day
    (this as any).resetDailyClaimsIfNeeded();

    // Update last active timestamp
    if (this.isModified('lastActive') || this.isNew) {
      this.lastActive = new Date();
    }

    next();
  } catch (error) {
    typedLogger.error('Error in user pre-save middleware', { error: (error as any).message, userId: this._id });
    next(error);
  }
});

// Instance methods
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  try {
    if (!this.passwordHash) return false;

    // Always use bcrypt for simplicity
    return await bcrypt.compare(candidatePassword, this.passwordHash);
  } catch (error) {
    typedLogger.error('Error comparing password', { error: (error as any).message, userId: this._id });
    return false;
  }
};

userSchema.methods.updateLevel = function (): void {
  const totalPoints = this.points.total;
  let newLevel = UserLevel.BRONZE;

  if (totalPoints >= 50000) newLevel = UserLevel.DIAMOND;
  else if (totalPoints >= 15000) newLevel = UserLevel.PLATINUM;
  else if (totalPoints >= 5000) newLevel = UserLevel.GOLD;
  else if (totalPoints >= 1000) newLevel = UserLevel.SILVER;

  if (this.level !== newLevel) {
    const oldLevel = this.level;
    this.level = newLevel;

    typedLogger.info('User level updated', {
      userId: this._id,
      oldLevel,
      newLevel,
      totalPoints,
    });

    // Trigger achievements (async, don't wait)
    import('@/services/achievement').then(({ default: AchievementService }) => {
      AchievementService.checkAchievements(this._id.toString(), 'LEVEL_UP', {
        oldLevel,
        newLevel,
        totalPoints,
      }).catch(error => {
        typedLogger.error('Check achievements error (LEVEL_UP)', { error: (error as any).message, userId: this._id });
      });
    });
  }
};

userSchema.methods.addPoints = function (points: number): void {
  this.points.available += points;
  this.points.total += points;
  this.updateLevel();
};

userSchema.methods.spendPoints = function (points: number): boolean {
  if (this.points.available < points) {
    return false;
  }

  this.points.available -= points;
  this.points.spent += points;
  return true;
};

userSchema.methods.updateLocation = function (lat: number, lng: number, city: string): void {
  this.location = {
    lat,
    lng,
    city,
    lastUpdated: new Date(),
  };

  // Update favorite city based on frequency
  this.updateFavoriteCity(city);
};

userSchema.methods.updateFavoriteCity = function (city: string): void {
  // Simple implementation - could be enhanced with more sophisticated tracking
  if (!this.stats.favoriteCity) {
    this.stats.favoriteCity = city;
  }
};

userSchema.methods.addDevice = function (
  deviceId: string,
  platform: Platform,
  fcmToken?: string,
  meta?: { model?: string; osVersion?: string; appVersion?: string; userAgent?: string }
): void {
  // Deactivate existing devices
  this.devices.forEach(device => {
    device.isActive = false;
  });

  // Check if device already exists
  const existingDevice = this.devices.find(device => device.deviceId === deviceId);

  if (existingDevice) {
    existingDevice.platform = platform;
    existingDevice.fcmToken = fcmToken;
    existingDevice.lastUsed = new Date();
    existingDevice.isActive = true;
    if (meta?.model) (existingDevice as any).model = meta.model;
    if (meta?.osVersion) (existingDevice as any).osVersion = meta.osVersion;
    if (meta?.appVersion) (existingDevice as any).appVersion = meta.appVersion;
    if (meta?.userAgent) (existingDevice as any).userAgent = meta.userAgent;
  } else {
    this.devices.push({
      deviceId,
      platform,
      fcmToken,
      model: meta?.model,
      osVersion: meta?.osVersion,
      appVersion: meta?.appVersion,
      userAgent: meta?.userAgent,
      lastUsed: new Date(),
      isActive: true,
    });
  }
};

userSchema.methods.removeDevice = function (deviceId: string): void {
  this.devices = this.devices.filter(device => device.deviceId !== deviceId);
};

userSchema.methods.updateStreak = function (): void {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const lastClaim = this.stats.lastClaimDate;

  if (!lastClaim) {
    this.stats.currentStreak = 1;
  } else if (lastClaim.toDateString() === yesterday.toDateString()) {
    this.stats.currentStreak += 1;
  } else if (lastClaim.toDateString() !== today.toDateString()) {
    this.stats.currentStreak = 1;
  }

  if (this.stats.currentStreak > this.stats.longestStreak) {
    this.stats.longestStreak = this.stats.currentStreak;
  }
};

userSchema.methods.resetDailyClaimsIfNeeded = function (): void {
  const today = new Date();
  const lastClaim = this.stats.lastClaimDate;

  if (!lastClaim || lastClaim.toDateString() !== today.toDateString()) {
    this.stats.dailyClaimsCount = 0;
  }
};

userSchema.methods.incrementDailyClaims = function (): void {
  this.stats.dailyClaimsCount += 1;
  this.stats.lastClaimDate = new Date();
  this.updateStreak();
};

userSchema.methods.ban = function (reason: string, duration?: number): void {
  this.isBanned = true;
  this.banReason = reason;

  if (duration) {
    this.banExpiresAt = new Date(Date.now() + duration);
  }

  typedLogger.warn('User banned', {
    userId: this._id,
    reason,
    duration,
    expiresAt: this.banExpiresAt,
  });
};

userSchema.methods.unban = function (): void {
  this.isBanned = false;
  this.banReason = undefined;
  this.banExpiresAt = undefined;

  typedLogger.info('User unbanned', { userId: this._id });
};

userSchema.methods.softDelete = function (): void {
  this.deletedAt = new Date();
  this.email = undefined;
  this.passwordHash = undefined;
  this.devices = [];

  typedLogger.info('User soft deleted', { userId: this._id });
};

userSchema.methods.restore = function (): void {
  this.deletedAt = undefined;

  typedLogger.info('User restored', { userId: this._id });
};

// Static methods
userSchema.statics.findByEmail = function (email: string) {
  return this.findOne({ email: email.toLowerCase(), deletedAt: { $exists: false } });
};

userSchema.statics.findByDeviceId = function (deviceId: string) {
  return this.findOne({
    'devices.deviceId': deviceId,
    deletedAt: { $exists: false }
  });
};

userSchema.statics.findActiveUsers = function (days: number = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return this.find({
    lastActive: { $gte: cutoff },
    deletedAt: { $exists: false }
  });
};

userSchema.statics.getLeaderboard = function (city?: string, limit: number = 100) {
  const query: any = { deletedAt: { $exists: false } };
  if (city) {
    query['location.city'] = city;
  }

  return this.find(query)
    .sort({ 'points.total': -1 })
    .limit(limit)
    .select('displayName points.total level location.city stats.prizesFound');
};

userSchema.statics.getUserStats = async function () {
  const stats = await this.aggregate([
    { $match: { deletedAt: { $exists: false } } },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: {
          $sum: {
            $cond: [
              { $gte: ['$lastActive', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
              1,
              0
            ]
          }
        },
        totalPoints: { $sum: '$points.total' },
        averagePoints: { $avg: '$points.total' },
        levelDistribution: {
          $push: '$level'
        }
      }
    }
  ]);

  return stats[0] || {};
};

// Static helper: get required points for a given level
userSchema.statics.getPointsForLevel = function (level: UserLevel): number {
  const levelRequirements: Record<UserLevel, number> = {
    [UserLevel.BRONZE]: 0,
    [UserLevel.SILVER]: 1000,
    [UserLevel.GOLD]: 5000,
    [UserLevel.PLATINUM]: 15000,
    [UserLevel.DIAMOND]: 50000,
  } as any;
  return levelRequirements[level] ?? 0;
};

/**
 * ATOMIC OPERATIONS FOR CONCURRENCY SAFETY
 */
userSchema.statics.atomicSpendPoints = async function (userId: string | Types.ObjectId, pointsCost: number) {
  return this.findOneAndUpdate(
    {
      _id: userId,
      'points.available': { $gte: pointsCost }
    },
    {
      $inc: {
        'points.available': -pointsCost,
        'points.spent': pointsCost,
        'stats.rewardsRedeemed': 1
      },
      $set: { lastActive: new Date() }
    },
    { new: true }
  );
};

userSchema.statics.atomicAddPoints = async function (userId: string | Types.ObjectId, points: number) {
  return this.findOneAndUpdate(
    { _id: userId },
    {
      $inc: {
        'points.available': points,
        'points.total': points
      },
      $set: { lastActive: new Date() }
    },
    { new: true }
  );
};

// Create and export the model
export const User: IUserModel = model<IUser, IUserModel>('User', userSchema);
export default User;
