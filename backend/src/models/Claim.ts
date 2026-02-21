import { Schema, model, Model, Types } from 'mongoose';
import { IClaim } from '@/types';
import { logger } from '@/lib/logger';

const claimSchema = new Schema<IClaim>({
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
  location: {
    lat: {
      type: Number,
      required: true,
      min: -90,
      max: 90,
    },
    lng: {
      type: Number,
      required: true,
      min: -180,
      max: 180,
    },
    accuracy: {
      type: Number,
      min: 0,
    },
  },
  distance: {
    type: Number,
    required: true,
    min: 0,
  },
  pointsAwarded: {
    type: Number,
    required: true,
    min: 0,
  },
  deviceSignals: {
    speed: Number,
    mockLocation: Boolean,
    attestationToken: String,
  },
  validationChecks: {
    distanceValid: {
      type: Boolean,
      required: true,
    },
    timeValid: {
      type: Boolean,
      required: true,
    },
    speedValid: {
      type: Boolean,
      required: true,
    },
    cooldownValid: {
      type: Boolean,
      required: true,
    },
    dailyLimitValid: {
      type: Boolean,
      required: true,
    },
  },
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  claimedAt: {
    type: Date,
    default: Date.now,
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
claimSchema.index({ userId: 1, claimedAt: -1 });
claimSchema.index({ prizeId: 1, claimedAt: -1 });
claimSchema.index({ claimedAt: -1 });
claimSchema.index({ 'location.lat': 1, 'location.lng': 1 });

// Virtual fields
claimSchema.virtual('isValid').get(function() {
  return Object.values(this.validationChecks).every(check => check === true);
});

// Static methods
claimSchema.statics.findByUser = function(userId: Types.ObjectId, options: any = {}) {
  return this.find({ userId })
    .populate('prizeId', 'name description points rarity category')
    .sort({ claimedAt: -1 })
    .limit(options.limit || 50);
};

claimSchema.statics.findByPrize = function(prizeId: Types.ObjectId) {
  return this.find({ prizeId })
    .populate('userId', 'displayName level')
    .sort({ claimedAt: -1 });
};

claimSchema.statics.getUserStats = async function(userId: Types.ObjectId) {
  const stats = await this.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: null,
        totalClaims: { $sum: 1 },
        totalPoints: { $sum: '$pointsAwarded' },
        averageDistance: { $avg: '$distance' },
        validClaims: {
          $sum: {
            $cond: [
              {
                $and: [
                  '$validationChecks.distanceValid',
                  '$validationChecks.timeValid',
                  '$validationChecks.speedValid',
                  '$validationChecks.cooldownValid',
                  '$validationChecks.dailyLimitValid'
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalClaims: 0,
    totalPoints: 0,
    averageDistance: 0,
    validClaims: 0,
  };
};

export const Claim: Model<IClaim> = model<IClaim>('Claim', claimSchema);
export default Claim;
