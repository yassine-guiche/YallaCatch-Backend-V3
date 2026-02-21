import { Schema, model, Model, Types } from 'mongoose';
import { IRedemption, RedemptionStatus } from '@/types';

const redemptionSchema = new Schema<IRedemption>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  rewardId: {
    type: Schema.Types.ObjectId,
    ref: 'Reward',
    required: true,
    index: true,
  },
  pointsSpent: {
    type: Number,
    required: true,
    min: 1,
  },
  status: {
    type: String,
    enum: Object.values(RedemptionStatus),
    default: RedemptionStatus.PENDING,
    index: true,
  },
  codeId: {
    type: Schema.Types.ObjectId,
    ref: 'Code',
    index: true,
  },
  redeemedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  fulfilledAt: {
    type: Date,
    index: true,
  },
  redeemedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: (doc, ret: any) => {
      ret._id = ret._id.toString();
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Indexes
redemptionSchema.index({ userId: 1, redeemedAt: -1 });
redemptionSchema.index({ status: 1, redeemedAt: -1 });
redemptionSchema.index({ rewardId: 1, status: 1 });
redemptionSchema.index({ 'metadata.source': 1, createdAt: -1 });

// Virtual fields
redemptionSchema.virtual('isPending').get(function() {
  return this.status === RedemptionStatus.PENDING;
});

redemptionSchema.virtual('isFulfilled').get(function() {
  return this.status === RedemptionStatus.FULFILLED;
});

redemptionSchema.virtual('processingTime').get(function() {
  if (!this.fulfilledAt) return null;
  return this.fulfilledAt.getTime() - this.redeemedAt.getTime();
});

// Instance methods
redemptionSchema.methods.fulfill = function(): void {
  this.status = RedemptionStatus.FULFILLED;
  this.fulfilledAt = new Date();
};

redemptionSchema.methods.cancel = function(): void {
  this.status = RedemptionStatus.CANCELLED;
};

redemptionSchema.methods.fail = function(): void {
  this.status = RedemptionStatus.FAILED;
};

// Static methods
redemptionSchema.statics.findByUser = function(userId: Types.ObjectId, options: any = {}) {
  return this.find({ userId })
    .populate('rewardId', 'name description category imageUrl')
    .populate('codeId', 'code')
    .sort({ redeemedAt: -1 })
    .limit(options.limit || 50);
};

redemptionSchema.statics.findPending = function(options: any = {}) {
  return this.find({ status: RedemptionStatus.PENDING })
    .populate('userId', 'displayName email')
    .populate('rewardId', 'name category')
    .sort({ redeemedAt: 1 })
    .limit(options.limit || 100);
};

export const Redemption: Model<IRedemption> = model<IRedemption>('Redemption', redemptionSchema);
export default Redemption;
