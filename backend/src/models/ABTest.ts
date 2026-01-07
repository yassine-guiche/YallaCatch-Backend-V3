import { Schema, model, Document } from 'mongoose';

export interface IVariant {
  name: string;
  trafficAllocation: number; // percentage 0-100
  config: Record<string, any>;
  conversions: number;
  impressions: number;
}

export interface IABTest extends Document {
  name: string;
  description?: string;
  type: 'feature' | 'ui' | 'mechanics' | 'rewards' | 'pricing';
  status: 'draft' | 'active' | 'paused' | 'ended';
  variants: IVariant[];
  metrics: {
    metricName: string;
    baseline: number;
    targetImprovement: number;
    significance: number;
    winner?: string;
  }[];
  startDate: Date;
  endDate?: Date;
  winnerVariant?: string;
  sampleSize: number;
  confidenceLevel: number; // e.g., 0.95 for 95%
  createdBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ABTestSchema = new Schema<IABTest>(
  {
    name: { type: String, required: true, unique: true },
    description: String,
    type: { type: String, enum: ['feature', 'ui', 'mechanics', 'rewards', 'pricing'], required: true },
    status: { type: String, enum: ['draft', 'active', 'paused', 'ended'], default: 'draft' },
    variants: [
      {
        name: { type: String, required: true },
        trafficAllocation: { type: Number, required: true, min: 0, max: 100 },
        config: Schema.Types.Mixed,
        conversions: { type: Number, default: 0 },
        impressions: { type: Number, default: 0 }
      }
    ],
    metrics: [
      {
        metricName: String,
        baseline: Number,
        targetImprovement: Number,
        significance: { type: Number, default: 0 },
        winner: String
      }
    ],
    startDate: { type: Date, required: true },
    endDate: Date,
    winnerVariant: String,
    sampleSize: { type: Number, default: 1000 },
    confidenceLevel: { type: Number, default: 0.95 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Index for faster queries
ABTestSchema.index({ status: 1, startDate: -1 });
ABTestSchema.index({ type: 1 });

export const ABTest = model<IABTest>('ABTest', ABTestSchema);
