import mongoose, { Schema, Document } from 'mongoose';

export interface IAdMobView extends Document {
  userId: mongoose.Types.ObjectId;
  adType: 'rewarded' | 'interstitial' | 'banner';
  adUnitId: string;
  rewardAmount: number;
  rewardType: 'points' | 'xp' | 'powerup';
  completed: boolean;
  revenue: number; // Estimated revenue in USD
  ecpm: number; // eCPM at the time of view
  deviceInfo: {
    platform: string;
    version: string;
    model?: string;
  };
  location?: {
    city?: string;
    country?: string;
  };
  viewedAt: Date;
  rewardedAt?: Date;
  metadata?: {
    sessionId?: string;
    placementId?: string;
    campaignId?: string;
  };
}

const AdMobViewSchema = new Schema<IAdMobView>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  adType: {
    type: String,
    enum: ['rewarded', 'interstitial', 'banner'],
    required: true,
    default: 'rewarded'
  },
  adUnitId: {
    type: String,
    required: true
  },
  rewardAmount: {
    type: Number,
    required: true,
    min: 0
  },
  rewardType: {
    type: String,
    enum: ['points', 'xp', 'powerup'],
    default: 'points'
  },
  completed: {
    type: Boolean,
    default: false
  },
  revenue: {
    type: Number,
    default: 0,
    min: 0
  },
  ecpm: {
    type: Number,
    default: 0,
    min: 0
  },
  deviceInfo: {
    platform: {
      type: String,
      required: true
    },
    version: String,
    model: String
  },
  location: {
    city: String,
    country: String
  },
  viewedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  rewardedAt: Date,
  metadata: {
    sessionId: String,
    placementId: String,
    campaignId: String
  }
}, {
  timestamps: true
});

// Indexes for analytics queries
AdMobViewSchema.index({ viewedAt: -1 });
AdMobViewSchema.index({ userId: 1, viewedAt: -1 });
AdMobViewSchema.index({ adType: 1, viewedAt: -1 });
AdMobViewSchema.index({ completed: 1, viewedAt: -1 });

// Compound index for revenue analytics
AdMobViewSchema.index({ viewedAt: -1, completed: 1, revenue: 1 });

export default mongoose.model<IAdMobView>('AdMobView', AdMobViewSchema);
