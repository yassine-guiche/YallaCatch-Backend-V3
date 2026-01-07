import { Schema, model, Model, Document, Types } from 'mongoose';
import { IPrize, IPrizeModel, PrizeType, PrizeDisplayType, PrizeContentType, PrizeCategory, PrizeRarity, PrizeStatus, LocationType } from '@/types';
import { TUNISIA_BOUNDS, TUNISIA_CITIES } from '@/config';
import { typedLogger } from '@/lib/typed-logger';

// Define extended interface for Prize with virtuals and methods
interface IPrizeDocument extends IPrize, Document {
  rarityWeight: number;
  estimatedValue: number;
  findNearestCity(): string;
}

// Prize schema
const prizeSchema = new Schema<IPrize>({
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
  type: {
    type: String,
    enum: Object.values(PrizeType),
    required: true,
    index: true,
  },
  displayType: {
    type: String,
    enum: Object.values(PrizeDisplayType),
    default: PrizeDisplayType.STANDARD,
    index: true,
  },
  contentType: {
    type: String,
    enum: Object.values(PrizeContentType),
    default: PrizeContentType.POINTS,
    required: true,
    index: true,
  },
  category: {
    type: String,
    enum: Object.values(PrizeCategory),
    required: true,
    index: true,
  },
  points: {
    type: Number,
    required: false, // Now optional, use pointsReward instead
    min: 1,
    max: 10000,
    index: true,
  },
  pointsReward: {
    amount: {
      type: Number,
      min: 1,
      max: 10000,
    },
    bonusMultiplier: {
      type: Number,
      min: 1,
      max: 10,
      default: 1,
    },
  },
  directReward: {
    rewardId: {
      type: Schema.Types.ObjectId,
      ref: 'Reward',
    },
    autoRedeem: {
      type: Boolean,
      default: true,
    },
    probability: {
      type: Number,
      min: 0,
      max: 1,
      default: 1,
    },
  },
  rarity: {
    type: String,
    enum: Object.values(PrizeRarity),
    required: true,
    index: true,
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1,
    max: 1000,
  },
  claimedCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  location: {
    type: {
      type: String,
      enum: Object.values(LocationType),
      default: LocationType.GPS,
      required: true,
    },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
      validate: {
        validator: function(coords: number[]) {
          if (coords.length !== 2) return false;
          const [lng, lat] = coords;
          
          // Validate coordinates are within Tunisia bounds
          return lng >= TUNISIA_BOUNDS.west && 
                 lng <= TUNISIA_BOUNDS.east && 
                 lat >= TUNISIA_BOUNDS.south && 
                 lat <= TUNISIA_BOUNDS.north;
        },
        message: 'Coordinates must be within Tunisia bounds'
      }
    },
    radius: {
      type: Number,
      default: 50,
      min: 10,
      max: 500,
    },
    city: {
      type: String,
      required: true,
      enum: Object.keys(TUNISIA_CITIES),
      index: true,
    },
    address: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    markerUrl: {
      type: String,
      validate: {
        validator: function(url: string) {
          return !url || /^https?:\/\/.+/.test(url);
        },
        message: 'Invalid marker URL format'
      }
    },
    confidenceThreshold: {
      type: Number,
      min: 0.1,
      max: 1.0,
      default: 0.8,
    },
  },
  visibility: {
    startAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    endAt: {
      type: Date,
      index: true,
    },
  },
  expiresAt: {
    type: Date,
  },
  status: {
    type: String,
    enum: Object.values(PrizeStatus),
    default: PrizeStatus.ACTIVE,
    index: true,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  distributionId: {
    type: Schema.Types.ObjectId,
    ref: 'Distribution',
    index: true,
  },
  imageUrl: {
    type: String,
    validate: {
      validator: function(url: string) {
        return !url || /^https?:\/\/.+/.test(url);
      },
      message: 'Invalid image URL format'
    }
  },
  value: {
    type: Number,
    min: 0,
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
  }],
  capturedAt: {
    type: Date,
    index: true,
  },
  capturedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for optimal performance
prizeSchema.index({ 'location.coordinates': '2dsphere' });
prizeSchema.index({ 
  status: 1, 
  'visibility.startAt': 1, 
  'visibility.endAt': 1 
});
prizeSchema.index({ 'location.city': 1, status: 1 });
prizeSchema.index({ createdAt: -1 });
prizeSchema.index({ rarity: 1, category: 1 });
prizeSchema.index({ points: -1 });
prizeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound indexes for complex queries
prizeSchema.index({ 
  'location.city': 1, 
  status: 1, 
  rarity: 1 
});
prizeSchema.index({ 
  status: 1, 
  'visibility.startAt': 1, 
  'visibility.endAt': 1,
  expiresAt: 1 
});
prizeSchema.index({ 
  distributionId: 1, 
  status: 1 
});

// Text index for search
prizeSchema.index({ 
  name: 'text', 
  description: 'text', 
  tags: 'text' 
});

// Virtual fields
prizeSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.status === PrizeStatus.ACTIVE &&
         this.visibility.startAt <= now &&
         (!this.visibility.endAt || this.visibility.endAt > now) &&
         (!this.expiresAt || this.expiresAt > now);
});

prizeSchema.virtual('isAvailable').get(function() {
  return this.status === PrizeStatus.ACTIVE && this.claimedCount < this.quantity;
});

prizeSchema.virtual('isExpired').get(function() {
  const now = new Date();
  return (this.expiresAt && this.expiresAt <= now) ||
         (this.visibility.endAt && this.visibility.endAt <= now);
});

prizeSchema.virtual('remainingQuantity').get(function() {
  return Math.max(0, this.quantity - this.claimedCount);
});

prizeSchema.virtual('claimRate').get(function() {
  return this.quantity > 0 ? (this.claimedCount / this.quantity) * 100 : 0;
});

prizeSchema.virtual('rarityWeight').get(function() {
  const weights = {
    [PrizeRarity.COMMON]: 1,
    [PrizeRarity.UNCOMMON]: 2,
    [PrizeRarity.RARE]: 3,
    [PrizeRarity.EPIC]: 4,
    [PrizeRarity.LEGENDARY]: 5,
  };
  return weights[this.rarity] || 1;
});

prizeSchema.virtual('estimatedValue').get(function() {
  if (this.value) return this.value;

  // Estimate value based on points and rarity
  const baseValue = this.points * 0.1; // 10 points = 1 TND
  const rarityMultiplier = (this as any).rarityWeight;
  return Math.round(baseValue * rarityMultiplier * 100) / 100;
});

// Pre-save middleware
prizeSchema.pre('save', function(next) {
  try {
    // Auto-set city based on coordinates if not provided
    if (!this.location.city && this.location.coordinates) {
      this.location.city = (this as any).findNearestCity();
    }

    // Set expiration if not provided
    if (!this.expiresAt && this.isNew) {
      this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    }

    // Validate visibility dates
    if (this.visibility.endAt && this.visibility.startAt >= this.visibility.endAt) {
      throw new Error('End date must be after start date');
    }

    // Auto-capture if quantity reached
    if (this.claimedCount >= this.quantity && this.status === PrizeStatus.ACTIVE) {
      this.status = PrizeStatus.CAPTURED;
      this.capturedAt = new Date();
    }

    next();
  } catch (error) {
    typedLogger.error('Error in prize pre-save middleware', {
      error: (error as any).message,
      prizeId: this._id
    });
    next(error);
  }
});

// Instance methods
prizeSchema.methods.findNearestCity = function(): string {
  const [lng, lat] = this.location.coordinates;
  let nearestCity = 'Tunis';
  let minDistance = Infinity;
  
  Object.entries(TUNISIA_CITIES).forEach(([city, coords]) => {
    const distance = this.calculateDistance(lat, lng, coords.lat, coords.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearestCity = city;
    }
  });
  
  return nearestCity;
};

prizeSchema.methods.calculateDistance = function(
  lat1: number, lng1: number, 
  lat2: number, lng2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};

prizeSchema.methods.isWithinRadius = function(lat: number, lng: number): boolean {
  const [prizeLng, prizeLat] = this.location.coordinates;
  const distance = this.calculateDistance(lat, lng, prizeLat, prizeLng);
  return distance <= this.location.radius;
};

prizeSchema.methods.claim = function(userId: Types.ObjectId): boolean {
  if (!this.isAvailable) {
    return false;
  }
  
  this.claimedCount += 1;
  
  if (this.claimedCount >= this.quantity) {
    this.status = PrizeStatus.CAPTURED;
    this.capturedAt = new Date();
    this.capturedBy = userId;
  }
  
  return true;
};

prizeSchema.methods.activate = function(): void {
  if (this.status === PrizeStatus.INACTIVE) {
    this.status = PrizeStatus.ACTIVE;
    this.visibility.startAt = new Date();
  }
};

prizeSchema.methods.deactivate = function(): void {
  if (this.status === PrizeStatus.ACTIVE) {
    this.status = PrizeStatus.INACTIVE;
  }
};

prizeSchema.methods.revoke = function(): void {
  this.status = PrizeStatus.REVOKED;
};

prizeSchema.methods.extend = function(hours: number): void {
  if (!this.expiresAt) {
    this.expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  } else {
    this.expiresAt = new Date(this.expiresAt.getTime() + hours * 60 * 60 * 1000);
  }
};

prizeSchema.methods.updateLocation = function(
  lat: number, 
  lng: number, 
  radius?: number
): void {
  this.location.coordinates = [lng, lat];
  this.location.city = (this as any).findNearestCity();
  
  if (radius) {
    this.location.radius = radius;
  }
};

// Static methods
prizeSchema.statics.findNearby = function(
  lat: number, 
  lng: number, 
  radiusKm: number = 5,
  options: any = {}
) {
  const query: any = {
    'location.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [lng, lat]
        },
        $maxDistance: radiusKm * 1000 // Convert to meters
      }
    },
    status: PrizeStatus.ACTIVE,
    'visibility.startAt': { $lte: new Date() },
    $and: [
      {
        $or: [
          { 'visibility.endAt': { $exists: false } },
          { 'visibility.endAt': { $gt: new Date() } }
        ]
      },
      {
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: { $gt: new Date() } }
        ]
      }
    ]
  };
  
  if (options.category) {
    query.category = options.category;
  }
  
  if (options.rarity) {
    query.rarity = options.rarity;
  }
  
  if (options.minPoints) {
    query.points = { $gte: options.minPoints };
  }
  
  if (options.maxPoints) {
    query.points = { ...query.points, $lte: options.maxPoints };
  }
  
  return this.find(query)
    .limit(options.limit || 50)
    .sort({ points: -1 });
};

prizeSchema.statics.findByCity = function(city: string, options: any = {}) {
  const query: any = {
    'location.city': city,
    status: PrizeStatus.ACTIVE,
    'visibility.startAt': { $lte: new Date() },
    $or: [
      { 'visibility.endAt': { $exists: false } },
      { 'visibility.endAt': { $gt: new Date() } }
    ]
  };
  
  return this.find(query)
    .limit(options.limit || 100)
    .sort(options.sort || { points: -1 });
};

prizeSchema.statics.findExpired = function() {
  const now = new Date();
  return this.find({
    $or: [
      { expiresAt: { $lte: now } },
      { 'visibility.endAt': { $lte: now } }
    ],
    status: { $ne: PrizeStatus.EXPIRED }
  });
};

prizeSchema.statics.findByDistribution = function(distributionId: Types.ObjectId) {
  return this.find({ distributionId });
};

prizeSchema.statics.getStatsByCity = async function() {
  return this.aggregate([
    {
      $group: {
        _id: '$location.city',
        totalPrizes: { $sum: 1 },
        activePrizes: {
          $sum: {
            $cond: [{ $eq: ['$status', PrizeStatus.ACTIVE] }, 1, 0]
          }
        },
        claimedPrizes: {
          $sum: {
            $cond: [{ $eq: ['$status', PrizeStatus.CAPTURED] }, 1, 0]
          }
        },
        totalPoints: { $sum: '$points' },
        averagePoints: { $avg: '$points' },
        rarityDistribution: { $push: '$rarity' }
      }
    },
    { $sort: { totalPrizes: -1 } }
  ]);
};

prizeSchema.statics.getHeatmapData = async function(city?: string) {
  const match: any = {
    status: PrizeStatus.ACTIVE,
    'visibility.startAt': { $lte: new Date() }
  };
  
  if (city) {
    match['location.city'] = city;
  }
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          lat: { $round: [{ $arrayElemAt: ['$location.coordinates', 1] }, 3] },
          lng: { $round: [{ $arrayElemAt: ['$location.coordinates', 0] }, 3] }
        },
        count: { $sum: 1 },
        totalPoints: { $sum: '$points' },
        averagePoints: { $avg: '$points' }
      }
    },
    {
      $project: {
        _id: 0,
        lat: '$_id.lat',
        lng: '$_id.lng',
        count: 1,
        totalPoints: 1,
        averagePoints: { $round: ['$averagePoints', 0] }
      }
    }
  ]);
};

prizeSchema.statics.cleanupExpired = async function() {
  const result = await this.updateMany(
    {
      $or: [
        { expiresAt: { $lte: new Date() } },
        { 'visibility.endAt': { $lte: new Date() } }
      ],
      status: { $ne: PrizeStatus.EXPIRED }
    },
    { 
      $set: { 
        status: PrizeStatus.EXPIRED 
      } 
    }
  );
  
  typedLogger.info('Expired prizes cleaned up', { 
    modifiedCount: result.modifiedCount 
  });
  
  return result;
};

// Create and export the model
export const Prize: IPrizeModel = model<IPrize, IPrizeModel>('Prize', prizeSchema);
export default Prize;
