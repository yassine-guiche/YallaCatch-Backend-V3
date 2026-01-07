import { Schema, model, Model } from 'mongoose';
import { IDistribution, DistributionStatus, PrizeType, PrizeCategory, PrizeRarity } from '@/types';

const distributionSchema = new Schema<IDistribution>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  targetArea: {
    type: {
      type: String,
      enum: ['city', 'polygon', 'circle'],
      required: true,
    },
    coordinates: {
      type: [[Number]],
      required: true,
    },
    city: String,
    radius: Number,
  },
  prizeTemplate: {
    name: { type: String, required: true },
    description: { type: String, required: true },
    type: { type: String, enum: Object.values(PrizeType), required: true },
    category: { type: String, enum: Object.values(PrizeCategory), required: true },
    points: { type: Number, required: true },
    rarity: { type: String, enum: Object.values(PrizeRarity), required: true },
    imageUrl: String,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  spacing: {
    type: Number,
    required: true,
    min: 10,
  },
  status: {
    type: String,
    enum: Object.values(DistributionStatus),
    default: DistributionStatus.DRAFT,
    index: true,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  undoExpiresAt: {
    type: Date,
    index: true,
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

export const Distribution: Model<IDistribution> = model<IDistribution>('Distribution', distributionSchema);
export default Distribution;
