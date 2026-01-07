import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  
  // Who performed the action
  userId?: string;
  userEmail?: string;
  userRole?: string;
  sessionId?: string;
  
  // What action was performed
  action: string; // e.g., 'create', 'update', 'delete', 'login', 'claim_prize'
  resource: string; // e.g., 'user', 'prize', 'reward', 'session'
  resourceId?: string;
  
  // Action details
  description?: string;
  category: 'auth' | 'game' | 'admin' | 'system' | 'security' | 'business';
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  // Before and after state (for updates)
  previousData?: Record<string, any>;
  newData?: Record<string, any>;
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  
  // Request context
  requestId?: string;
  method?: string; // HTTP method
  endpoint?: string; // API endpoint
  userAgent?: string;
  ipAddress?: string;
  
  // Location context (for game actions)
  location?: {
    coordinates: [number, number]; // [longitude, latitude]
    city?: string;
    country?: string;
  };
  
  // Result and metadata
  success: boolean;
  errorMessage?: string;
  errorCode?: string;
  responseTime?: number; // milliseconds
  
  // Additional context
  metadata?: Record<string, any>;
  tags?: string[];
  
  // Compliance and retention
  retentionPeriod?: number; // days
  complianceFlags?: string[];
  
  timestamp: Date;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  // User information
  userId: {
    type: String,
    index: true,
  },
  userEmail: {
    type: String,
    index: true,
  },
  userRole: {
    type: String,
    enum: ['user', 'moderator', 'admin', 'super_admin', 'system'],
    index: true,
  },
  sessionId: {
    type: String,
    index: true,
  },
  
  // Action information
  action: {
    type: String,
    required: true,
    index: true,
    maxlength: 100,
  },
  resource: {
    type: String,
    required: true,
    index: true,
    maxlength: 50,
  },
  resourceId: {
    type: String,
    index: true,
  },
  
  // Action details
  description: {
    type: String,
    maxlength: 500,
  },
  category: {
    type: String,
    enum: ['auth', 'game', 'admin', 'system', 'security', 'business'],
    required: true,
    index: true,
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low',
    index: true,
  },
  
  // Data changes
  previousData: {
    type: Schema.Types.Mixed,
  },
  newData: {
    type: Schema.Types.Mixed,
  },
  changes: [{
    field: {
      type: String,
      required: true,
    },
    oldValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed,
  }],
  
  // Request context
  requestId: {
    type: String,
    index: true,
  },
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  },
  endpoint: {
    type: String,
    maxlength: 200,
  },
  userAgent: {
    type: String,
    maxlength: 500,
  },
  ipAddress: {
    type: String,
    index: true,
  },
  
  // Location context
  location: {
    coordinates: {
      type: [Number],
      validate: {
        validator: function(coords: number[]) {
          if (!coords || coords.length !== 2) return true; // Optional field
          return coords[0] >= -180 && coords[0] <= 180 && // longitude
                 coords[1] >= -90 && coords[1] <= 90;     // latitude
        },
        message: 'Coordinates must be [longitude, latitude] within valid ranges'
      }
    },
    city: String,
    country: String,
  },
  
  // Result information
  success: {
    type: Boolean,
    required: true,
    index: true,
  },
  errorMessage: {
    type: String,
    maxlength: 1000,
  },
  errorCode: {
    type: String,
    maxlength: 50,
  },
  responseTime: {
    type: Number,
    min: 0,
  },
  
  // Additional context
  metadata: {
    type: Schema.Types.Mixed,
  },
  tags: [{
    type: String,
    maxlength: 50,
  }],
  
  // Compliance
  retentionPeriod: {
    type: Number,
    default: 2555, // 7 years in days
    min: 1,
  },
  complianceFlags: [{
    type: String,
    enum: ['gdpr', 'pci', 'hipaa', 'sox', 'pii'],
  }],
  
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
});

// Compound indexes for common queries
AuditLogSchema.index({ userId: 1, timestamp: -1 });
AuditLogSchema.index({ category: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, resource: 1, timestamp: -1 });
AuditLogSchema.index({ severity: 1, timestamp: -1 });
AuditLogSchema.index({ success: 1, timestamp: -1 });
AuditLogSchema.index({ ipAddress: 1, timestamp: -1 });

// NOTE: TTL index removed - it was causing immediate deletion of logs
// Retention should be handled by a scheduled cleanup job instead

// Geospatial index for location-based queries
AuditLogSchema.index({ 'location.coordinates': '2dsphere' });

// Text index for searching descriptions and error messages
AuditLogSchema.index({
  description: 'text',
  errorMessage: 'text',
  action: 'text',
  resource: 'text',
});

// Virtual for formatted timestamp
AuditLogSchema.virtual('formattedTimestamp').get(function() {
  return this.timestamp.toISOString();
});

// Virtual for age in hours
AuditLogSchema.virtual('ageHours').get(function() {
  return Math.floor((Date.now() - this.timestamp.getTime()) / (1000 * 60 * 60));
});

// Virtual for checking if log is expired
AuditLogSchema.virtual('isExpired').get(function() {
  if (!this.retentionPeriod) return false;
  const expirationDate = new Date(this.createdAt.getTime() + (this.retentionPeriod * 24 * 60 * 60 * 1000));
  return Date.now() > expirationDate.getTime();
});

// Method to add tag
AuditLogSchema.methods.addTag = function(tag: string) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to remove tag
AuditLogSchema.methods.removeTag = function(tag: string) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

// Method to check if action is sensitive
AuditLogSchema.methods.isSensitive = function(): boolean {
  const sensitiveActions = [
    'login_failed',
    'password_change',
    'account_delete',
    'admin_access',
    'data_export',
    'ban_user',
    'unban_user',
    'system_config_change',
  ];
  
  return sensitiveActions.includes(this.action) || 
         this.severity === 'critical' ||
         this.complianceFlags.length > 0;
};

// Static method to log action
AuditLogSchema.statics.logAction = function(logData: Partial<IAuditLog>) {
  const auditLog = new this({
    ...logData,
    timestamp: logData.timestamp || new Date(),
  });
  
  return auditLog.save();
};

// Static method to get user activity
AuditLogSchema.statics.getUserActivity = function(userId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({
    userId,
    timestamp: { $gte: startDate }
  })
  .sort({ timestamp: -1 })
  .limit(1000);
};

// Static method to get security events
AuditLogSchema.statics.getSecurityEvents = function(hours: number = 24) {
  const startDate = new Date();
  startDate.setHours(startDate.getHours() - hours);
  
  return this.find({
    $or: [
      { category: 'security' },
      { severity: { $in: ['high', 'critical'] } },
      { success: false, action: { $regex: /login|auth/ } },
    ],
    timestamp: { $gte: startDate }
  })
  .sort({ timestamp: -1 });
};

// Static method to get failed actions by IP
AuditLogSchema.statics.getFailedActionsByIP = function(ipAddress: string, hours: number = 1) {
  const startDate = new Date();
  startDate.setHours(startDate.getHours() - hours);
  
  return this.countDocuments({
    ipAddress,
    success: false,
    timestamp: { $gte: startDate }
  });
};

// Static method to get statistics
AuditLogSchema.statics.getStatistics = function(days: number = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalActions: { $sum: 1 },
        successfulActions: {
          $sum: { $cond: ['$success', 1, 0] }
        },
        failedActions: {
          $sum: { $cond: ['$success', 0, 1] }
        },
        uniqueUsers: { $addToSet: '$userId' },
        uniqueIPs: { $addToSet: '$ipAddress' },
        categoriesCount: {
          $push: '$category'
        },
        severityCount: {
          $push: '$severity'
        }
      }
    },
    {
      $project: {
        totalActions: 1,
        successfulActions: 1,
        failedActions: 1,
        successRate: {
          $multiply: [
            { $divide: ['$successfulActions', '$totalActions'] },
            100
          ]
        },
        uniqueUserCount: { $size: '$uniqueUsers' },
        uniqueIPCount: { $size: '$uniqueIPs' },
        categoriesCount: 1,
        severityCount: 1
      }
    }
  ]);
};

// Static method to cleanup expired logs
AuditLogSchema.statics.cleanupExpiredLogs = function() {
  const now = new Date();
  
  return this.deleteMany({
    $expr: {
      $lt: [
        { $add: ['$createdAt', { $multiply: ['$retentionPeriod', 24 * 60 * 60 * 1000] }] },
        now
      ]
    }
  });
};

// Static method to get audit trail for resource
AuditLogSchema.statics.getAuditTrail = function(resource: string, resourceId: string) {
  return this.find({
    resource,
    resourceId
  })
  .sort({ timestamp: -1 })
  .populate('userId', 'displayName email');
};

// Pre-save middleware to set default values and validate
AuditLogSchema.pre('save', function(next) {
  // Set default timestamp if not provided
  if (!this.timestamp) {
    this.timestamp = new Date();
  }
  
  // Auto-detect severity based on action and success
  if (!this.severity || this.severity === 'low') {
    if (!this.success) {
      if (this.action.includes('login') || this.action.includes('auth')) {
        this.severity = 'medium';
      } else if (this.action.includes('delete') || this.action.includes('ban')) {
        this.severity = 'high';
      }
    }
    
    if (this.category === 'security') {
      this.severity = 'high';
    }
  }
  
  // Add compliance flags based on action
  if (!this.complianceFlags) {
    this.complianceFlags = [];
  }
  
  if (this.action.includes('personal_data') || this.action.includes('profile')) {
    if (!this.complianceFlags.includes('gdpr')) {
      this.complianceFlags.push('gdpr');
    }
  }
  
  if (this.action.includes('payment') || this.action.includes('card')) {
    if (!this.complianceFlags.includes('pci')) {
      this.complianceFlags.push('pci');
    }
  }
  
  next();
});

// Post-save middleware for real-time alerts
AuditLogSchema.post('save', function(doc) {
  // Send real-time alerts for critical events
  if (doc.severity === 'critical' || (doc.category === 'security' && !doc.success)) {
    // Log critical events for monitoring
    console.log('AUDIT_CRITICAL_EVENT', {
      logId: doc._id,
      action: doc.action,
      resource: doc.resource,
      userId: doc.userId,
      ipAddress: doc.ipAddress,
      timestamp: doc.timestamp,
    });
  }
});

export const AuditLog = (mongoose.models.AuditLog as mongoose.Model<IAuditLog>) || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
