import { Schema, model, Model, Document, Types } from 'mongoose';
import { ICode, CodeStatus } from '@/types';

// Extend the ICode interface to include custom static methods
interface CodeModel extends Model<ICode> {
  findAvailable(rewardId: Types.ObjectId, poolName?: string): Promise<ICode | null>;
  reserveCode(rewardId: Types.ObjectId, userId: Types.ObjectId, poolName?: string): Promise<ICode | null>;
}

const codeSchema = new Schema<ICode>({
  code: {
    type: String,
    required: true,
    unique: true,
    index: true,
    uppercase: true,
  },
  poolName: {
    type: String,
    required: false,  // Optional for promo codes
    index: true,
  },
  rewardId: {
    type: Schema.Types.ObjectId,
    ref: 'Reward',
    required: false,  // Optional for promo codes
    index: true,
  },
  // Promo code specific fields
  pointsValue: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isUsed: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: Object.values(CodeStatus),
    default: CodeStatus.AVAILABLE,
    index: true,
  },
  reservedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  reservedAt: {
    type: Date,
    index: true,
  },
  usedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },
  usedAt: {
    type: Date,
    index: true,
  },
  expiresAt: {
    type: Date,
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

// Indexes
codeSchema.index({ rewardId: 1, status: 1 });
codeSchema.index({ poolName: 1, status: 1 });
codeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static methods
codeSchema.statics.findAvailable = function(rewardId: Types.ObjectId, poolName?: string) {
  const query: any = {
    rewardId,
    status: CodeStatus.AVAILABLE,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  };
  
  if (poolName) {
    query.poolName = poolName;
  }
  
  return this.findOne(query);
};

codeSchema.statics.reserveCode = async function(rewardId: Types.ObjectId, userId: Types.ObjectId, poolName?: string) {
  // Use Code model directly instead of 'this' to avoid typing issues
  const CodeModel = this as any as CodeModel;
  const code = await CodeModel.findAvailable(rewardId, poolName);
  if (!code) return null;

  code.status = CodeStatus.RESERVED;
  code.reservedBy = userId;
  code.reservedAt = new Date();
  await code.save();

  return code;
};

export const Code: CodeModel = model<ICode, CodeModel>('Code', codeSchema);
export default Code;
