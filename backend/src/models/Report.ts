import { Schema, model, Types } from 'mongoose';

/**
 * Report Model
 * 
 * Handles user reports for fraud, bugs, abuse, and other issues
 * Separate from Claim model for better data organization
 */

export interface IReport {
  userId: Types.ObjectId;
  reporterName?: string;
  reporterEmail?: string;
  
  // What is being reported
  captureId?: Types.ObjectId;
  prizeId?: Types.ObjectId;
  targetUserId?: Types.ObjectId;
  
  // Report details
  type: 'fraud' | 'bug' | 'abuse' | 'inappropriate_content' | 'spam' | 'other';
  category?: string;
  reason: string;
  description?: string;
  evidence?: string[]; // URLs to screenshots, videos, etc.
  
  // Location (if relevant)
  location?: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  
  // Status tracking
  status: 'pending' | 'investigating' | 'resolved' | 'rejected' | 'duplicate';
  priority: 'low' | 'medium' | 'high' | 'critical';
  
  // Resolution
  resolution?: string;
  resolvedBy?: Types.ObjectId; // Admin who resolved it
  resolvedAt?: Date;
  actionTaken?: string; // What action was taken
  
  // Metadata
  deviceInfo?: {
    platform: string;
    version: string;
    model?: string;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<IReport>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  reporterName: {
    type: String,
    trim: true,
  },
  reporterEmail: {
    type: String,
    trim: true,
    lowercase: true,
  },
  
  // What is being reported
  captureId: {
    type: Schema.Types.ObjectId,
    ref: 'Claim',
    sparse: true,
    index: true,
  },
  prizeId: {
    type: Schema.Types.ObjectId,
    ref: 'Prize',
    sparse: true,
    index: true,
  },
  targetUserId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    sparse: true,
    index: true,
  },
  
  // Report details
  type: {
    type: String,
    enum: ['fraud', 'bug', 'abuse', 'inappropriate_content', 'spam', 'other'],
    required: true,
    index: true,
  },
  category: {
    type: String,
    trim: true,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 2000,
  },
  evidence: [{
    type: String,
    trim: true,
  }],
  
  // Location
  location: {
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: {
      type: [Number],
      validate: {
        validator: function(coords: number[]) {
          return coords.length === 2 && 
                 coords[0] >= -180 && coords[0] <= 180 && 
                 coords[1] >= -90 && coords[1] <= 90;
        },
        message: 'Invalid coordinates',
      },
    },
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'investigating', 'resolved', 'rejected', 'duplicate'],
    default: 'pending',
    required: true,
    index: true,
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true,
  },
  
  // Resolution
  resolution: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
  resolvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    sparse: true,
  },
  resolvedAt: {
    type: Date,
    sparse: true,
  },
  actionTaken: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  
  // Metadata
  deviceInfo: {
    platform: String,
    version: String,
    model: String,
  },
}, {
  timestamps: true,
  collection: 'reports',
});

// Indexes
reportSchema.index({ userId: 1, createdAt: -1 });
reportSchema.index({ status: 1, priority: -1, createdAt: -1 });
reportSchema.index({ type: 1, status: 1 });
reportSchema.index({ captureId: 1, status: 1 });
reportSchema.index({ prizeId: 1, status: 1 });
reportSchema.index({ location: '2dsphere' });

// Virtual for age
reportSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime();
});

// Methods
reportSchema.methods.resolve = async function(
  adminId: Types.ObjectId,
  resolution: string,
  actionTaken?: string
) {
  this.status = 'resolved';
  this.resolution = resolution;
  this.resolvedBy = adminId;
  this.resolvedAt = new Date();
  if (actionTaken) {
    this.actionTaken = actionTaken;
  }
  return await this.save();
};

reportSchema.methods.reject = async function(
  adminId: Types.ObjectId,
  reason: string
) {
  this.status = 'rejected';
  this.resolution = reason;
  this.resolvedBy = adminId;
  this.resolvedAt = new Date();
  return await this.save();
};

reportSchema.methods.markAsDuplicate = async function(
  adminId: Types.ObjectId,
  originalReportId: Types.ObjectId
) {
  this.status = 'duplicate';
  this.resolution = `Duplicate of report ${originalReportId}`;
  this.resolvedBy = adminId;
  this.resolvedAt = new Date();
  return await this.save();
};

// Static methods
reportSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);
  
  const byType = await this.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
      },
    },
  ]);
  
  const avgResolutionTime = await this.aggregate([
    {
      $match: {
        status: 'resolved',
        resolvedAt: { $exists: true },
      },
    },
    {
      $project: {
        resolutionTime: {
          $subtract: ['$resolvedAt', '$createdAt'],
        },
      },
    },
    {
      $group: {
        _id: null,
        avgTime: { $avg: '$resolutionTime' },
      },
    },
  ]);
  
  return {
    byStatus: stats,
    byType,
    avgResolutionTimeMs: avgResolutionTime[0]?.avgTime || 0,
    avgResolutionTimeHours: (avgResolutionTime[0]?.avgTime || 0) / (1000 * 60 * 60),
  };
};

reportSchema.statics.getPendingReports = async function(limit = 50) {
  return await this.find({ status: 'pending' })
    .sort({ priority: -1, createdAt: 1 })
    .limit(limit)
    .populate('userId', 'displayName email')
    .populate('captureId')
    .populate('prizeId')
    .populate('targetUserId', 'displayName email');
};

export const Report = model<IReport>('Report', reportSchema);

