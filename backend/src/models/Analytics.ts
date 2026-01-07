import { Schema, model, Model } from 'mongoose';
import { IAnalytics } from '@/types';

const analyticsSchema = new Schema<IAnalytics>({
  date: { type: Date, required: true, unique: true, index: true },
  metrics: {
    totalUsers: { type: Number, default: 0 },
    activeUsers: { type: Number, default: 0 },
    newUsers: { type: Number, default: 0 },
    totalPrizes: { type: Number, default: 0 },
    claimedPrizes: { type: Number, default: 0 },
    totalRewards: { type: Number, default: 0 },
    redeemedRewards: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    averageSessionTime: { type: Number, default: 0 },
    retentionRate: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
  },
  cityMetrics: {
    type: Schema.Types.Mixed,
    default: {},
  },
  generatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

export const Analytics: Model<IAnalytics> = model<IAnalytics>('Analytics', analyticsSchema);

export default Analytics;
