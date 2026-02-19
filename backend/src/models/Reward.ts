import { Schema, model, Model, Types } from 'mongoose';
import { IReward, IRewardModel, RewardCategory, ListingType } from '@/types';
import { logger } from '@/lib/logger';

const rewardSchema = new Schema<IReward>({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100,
    index: true,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  category: {
    type: String,
    enum: Object.values(RewardCategory),
    required: true,
    index: true,
  },
  pointsCost: {
    type: Number,
    required: true,
    min: 1,
    max: 1000000,
    index: true,
  },
  stockQuantity: {
    type: Number,
    required: true,
    min: 0,
  },
  stockReserved: {
    type: Number,
    default: 0,
    min: 0,
  },
  stockAvailable: {
    type: Number,
    required: true,
    min: 0,
  },
  imageUrl: {
    type: String,
    validate: {
      validator: function (url: string) {
        // Accept URLs, upload paths, or empty strings
        return !url || url.startsWith('/uploads/') || /^https?:\/\/.+/.test(url);
      },
      message: 'Invalid image URL format'
    }
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  isPopular: {
    type: Boolean,
    default: false,
    index: true,
  },
  // Approval status for partner-submitted items
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved', // Admin-created items are auto-approved
    index: true,
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: {
    type: Date,
  },
  listingType: {
    type: String,
    enum: Object.values(ListingType),
    default: ListingType.GAME_REWARD,
    index: true,
  },
  partnerId: {
    type: Schema.Types.ObjectId,
    ref: 'Partner',
    index: true,
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
rewardSchema.index({ category: 1, pointsCost: 1 });
rewardSchema.index({ isActive: 1, pointsCost: 1 });
rewardSchema.index({ isPopular: 1, pointsCost: 1 });
rewardSchema.index({ name: 'text', description: 'text' });
rewardSchema.index({ 'metadata.isSponsored': 1, isActive: 1, createdAt: -1 });

// Virtual fields
rewardSchema.virtual('isAvailable').get(function () {
  return this.isActive && this.stockAvailable > 0;
});

rewardSchema.virtual('stockUsed').get(function () {
  return this.stockQuantity - this.stockAvailable - this.stockReserved;
});

rewardSchema.virtual('popularityScore').get(function () {
  // Simple popularity calculation based on stock usage
  if (this.stockQuantity === 0) return 0;
  return ((this as any).stockUsed / this.stockQuantity) * 100;
});

// Pre-save middleware
rewardSchema.pre('save', function (next) {
  // Ensure stock consistency
  if (this.stockReserved + this.stockAvailable > this.stockQuantity) {
    this.stockAvailable = Math.max(0, this.stockQuantity - this.stockReserved);
  }

  next();
});

// Instance methods
rewardSchema.methods.reserveStock = function (quantity: number = 1): boolean {
  if (this.stockAvailable < quantity) {
    return false;
  }

  this.stockAvailable -= quantity;
  this.stockReserved += quantity;
  return true;
};

rewardSchema.methods.releaseReservation = function (quantity: number = 1): void {
  const toRelease = Math.min(quantity, this.stockReserved);
  this.stockReserved -= toRelease;
  this.stockAvailable += toRelease;
};

rewardSchema.methods.confirmRedemption = function (quantity: number = 1): boolean {
  if (this.stockReserved < quantity) {
    return false;
  }

  this.stockReserved -= quantity;
  return true;
};

rewardSchema.methods.addStock = function (quantity: number): void {
  this.stockQuantity += quantity;
  this.stockAvailable += quantity;
};

rewardSchema.methods.activate = function (): void {
  this.isActive = true;
};

rewardSchema.methods.deactivate = function (): void {
  this.isActive = false;
};

// Static methods
rewardSchema.statics.findAvailable = function (options: any = {}) {
  const query: any = {
    isActive: true,
    stockAvailable: { $gt: 0 },
  };

  if (options.category) {
    query.category = options.category;
  }

  if (options.maxCost) {
    query.pointsCost = { $lte: options.maxCost };
  }

  if (options.minCost) {
    query.pointsCost = { ...query.pointsCost, $gte: options.minCost };
  }

  return this.find(query)
    .populate('partnerId', 'name logoUrl')
    .sort(options.sort || { pointsCost: 1 })
    .limit(options.limit || 50);
};

rewardSchema.statics.findPopular = function (limit: number = 10) {
  return this.find({
    isActive: true,
    stockAvailable: { $gt: 0 },
    isPopular: true,
  })
    .populate('partnerId', 'name logoUrl')
    .sort({ pointsCost: 1 })
    .limit(limit);
};

rewardSchema.statics.findByCategory = function (category: RewardCategory, options: any = {}) {
  return this.find({
    category,
    isActive: true,
    stockAvailable: { $gt: 0 },
  })
    .populate('partnerId', 'name logoUrl')
    .sort(options.sort || { pointsCost: 1 })
    .limit(options.limit || 50);
};

rewardSchema.statics.searchRewards = function (query: string, options: any = {}) {
  return this.find({
    $text: { $search: query },
    isActive: true,
    stockAvailable: { $gt: 0 },
  })
    .populate('partnerId', 'name logoUrl')
    .sort({ score: { $meta: 'textScore' } })
    .limit(options.limit || 20);
};

rewardSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalRewards: { $sum: 1 },
        activeRewards: {
          $sum: { $cond: ['$isActive', 1, 0] }
        },
        totalStock: { $sum: '$stockQuantity' },
        availableStock: { $sum: '$stockAvailable' },
        reservedStock: { $sum: '$stockReserved' },
        totalValue: { $sum: { $multiply: ['$pointsCost', '$stockQuantity'] } },
        categoryDistribution: { $push: '$category' },
      }
    }
  ]);

  return stats[0] || {
    totalRewards: 0,
    activeRewards: 0,
    totalStock: 0,
    availableStock: 0,
    reservedStock: 0,
    totalValue: 0,
    categoryDistribution: [],
  };
};

rewardSchema.statics.getLowStockRewards = function (threshold: number = 10) {
  return this.find({
    isActive: true,
    stockAvailable: { $lte: threshold, $gt: 0 },
  })
    .populate('partnerId', 'name')
    .sort({ stockAvailable: 1 });
};

/**
 * ATOMIC OPERATIONS FOR CONCURRENCY SAFETY
 */
rewardSchema.statics.atomicReserveStock = async function (rewardId: string | Types.ObjectId, quantity: number = 1) {
  return this.findOneAndUpdate(
    {
      _id: rewardId,
      isActive: true,
      stockAvailable: { $gte: quantity }
    },
    {
      $inc: {
        stockAvailable: -quantity,
        stockReserved: quantity
      }
    },
    { new: true }
  );
};

rewardSchema.statics.atomicConfirmRedemption = async function (rewardId: string | Types.ObjectId, quantity: number = 1) {
  return this.findOneAndUpdate(
    {
      _id: rewardId,
      stockReserved: { $gte: quantity }
    },
    {
      $inc: {
        stockReserved: -quantity
      }
    },
    { new: true }
  );
};

rewardSchema.statics.atomicReleaseReservation = async function (rewardId: string | Types.ObjectId, quantity: number = 1) {
  return this.findOneAndUpdate(
    {
      _id: rewardId,
      stockReserved: { $gte: quantity }
    },
    {
      $inc: {
        stockAvailable: quantity,
        stockReserved: -quantity
      }
    },
    { new: true }
  );
};

export const Reward = model<IReward, IRewardModel>('Reward', rewardSchema);
export default Reward;
