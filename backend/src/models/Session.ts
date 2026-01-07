import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILocationUpdate {
  coordinates: [number, number]; // [longitude, latitude]
  accuracy?: number;
  speed?: number;
  heading?: number;
  timestamp: Date;
}

export interface ISessionMetrics {
  distanceTraveled: number; // meters
  prizesFound: number;
  claimsAttempted: number;
  claimsSuccessful: number;
  powerUpsUsed: number;
  challengesCompleted: number;
  averageSpeed: number; // m/s
  maxSpeed: number; // m/s
  timeActive: number; // seconds (time actually moving/playing)
  timeIdle: number; // seconds (time stationary)
}

export interface ISessionRewards {
  basePoints: number;
  distanceBonus: number;
  timeBonus: number;
  discoveryBonus: number;
  challengeBonus: number;
  streakBonus: number;
  totalPoints: number;
}

export interface IAntiCheatFlags {
  speedViolations: number;
  teleportations: number;
  mockLocationDetected: boolean;
  suspiciousPatterns: string[];
  riskScore: number;
  flaggedForReview: boolean;
}

export interface ISession extends Document {
  _id: Types.ObjectId;
  sessionId: string; // Unique session identifier
  userId: string;
  deviceId: string;
  platform: 'iOS' | 'Android' | 'Unity' | 'Web';
  appVersion: string;
  
  // Session timing
  startTime: Date;
  endTime?: Date;
  duration?: number; // seconds
  
  // Location data
  initialLocation: {
    coordinates: [number, number];
    accuracy?: number;
    address?: string;
  };
  finalLocation?: {
    coordinates: [number, number];
    accuracy?: number;
    address?: string;
  };
  locationUpdates: ILocationUpdate[];
  
  // Session metrics
  metrics: ISessionMetrics;
  
  // Rewards earned
  rewards: ISessionRewards;
  
  // Anti-cheat data
  antiCheat: IAntiCheatFlags;
  
  // Session status
  status: 'active' | 'completed' | 'abandoned' | 'terminated';
  terminationReason?: string;
  
  // Network and device info
  networkInfo?: {
    connectionType: string; // wifi, cellular, etc.
    provider?: string;
    strength?: number;
  };
  deviceInfo?: {
    model?: string;
    osVersion?: string;
    batteryLevel?: number;
    isCharging?: boolean;
  };
  
  // Performance metrics
  performance?: {
    averageFPS?: number;
    memoryUsage?: number;
    crashCount?: number;
    errorCount?: number;
  };
  
  // Gameplay data
  gameplay?: {
    arModeUsed: boolean;
    mapModeUsed: boolean;
    tutorialCompleted?: boolean;
    featuresUsed: string[];
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const LocationUpdateSchema = new Schema<ILocationUpdate>({
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: function(coords: number[]) {
        return coords.length === 2 && 
               coords[0] >= -180 && coords[0] <= 180 && // longitude
               coords[1] >= -90 && coords[1] <= 90;     // latitude
      },
      message: 'Coordinates must be [longitude, latitude] within valid ranges'
    }
  },
  accuracy: {
    type: Number,
    min: 0,
  },
  speed: {
    type: Number,
    min: 0,
  },
  heading: {
    type: Number,
    min: 0,
    max: 360,
  },
  timestamp: {
    type: Date,
    required: true,
  },
});

const SessionMetricsSchema = new Schema<ISessionMetrics>({
  distanceTraveled: {
    type: Number,
    default: 0,
    min: 0,
  },
  prizesFound: {
    type: Number,
    default: 0,
    min: 0,
  },
  claimsAttempted: {
    type: Number,
    default: 0,
    min: 0,
  },
  claimsSuccessful: {
    type: Number,
    default: 0,
    min: 0,
  },
  powerUpsUsed: {
    type: Number,
    default: 0,
    min: 0,
  },
  challengesCompleted: {
    type: Number,
    default: 0,
    min: 0,
  },
  averageSpeed: {
    type: Number,
    default: 0,
    min: 0,
  },
  maxSpeed: {
    type: Number,
    default: 0,
    min: 0,
  },
  timeActive: {
    type: Number,
    default: 0,
    min: 0,
  },
  timeIdle: {
    type: Number,
    default: 0,
    min: 0,
  },
});

const SessionRewardsSchema = new Schema<ISessionRewards>({
  basePoints: {
    type: Number,
    default: 0,
    min: 0,
  },
  distanceBonus: {
    type: Number,
    default: 0,
    min: 0,
  },
  timeBonus: {
    type: Number,
    default: 0,
    min: 0,
  },
  discoveryBonus: {
    type: Number,
    default: 0,
    min: 0,
  },
  challengeBonus: {
    type: Number,
    default: 0,
    min: 0,
  },
  streakBonus: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalPoints: {
    type: Number,
    default: 0,
    min: 0,
  },
});

const AntiCheatFlagsSchema = new Schema<IAntiCheatFlags>({
  speedViolations: {
    type: Number,
    default: 0,
    min: 0,
  },
  teleportations: {
    type: Number,
    default: 0,
    min: 0,
  },
  mockLocationDetected: {
    type: Boolean,
    default: false,
  },
  suspiciousPatterns: [{
    type: String,
  }],
  riskScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  flaggedForReview: {
    type: Boolean,
    default: false,
  },
});

const SessionSchema = new Schema<ISession>({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  deviceId: {
    type: String,
    required: true,
    index: true,
  },
  platform: {
    type: String,
    enum: ['iOS', 'Android', 'Unity', 'Web'],
    required: true,
  },
  appVersion: {
    type: String,
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
    index: true,
  },
  endTime: {
    type: Date,
  },
  duration: {
    type: Number,
    min: 0,
  },
  initialLocation: {
    coordinates: {
      type: [Number],
      required: true,
    },
    accuracy: Number,
    address: String,
  },
  finalLocation: {
    coordinates: [Number],
    accuracy: Number,
    address: String,
  },
  locationUpdates: [LocationUpdateSchema],
  metrics: {
    type: SessionMetricsSchema,
    default: () => ({}),
  },
  rewards: {
    type: SessionRewardsSchema,
    default: () => ({}),
  },
  antiCheat: {
    type: AntiCheatFlagsSchema,
    default: () => ({}),
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned', 'terminated'],
    default: 'active',
    index: true,
  },
  terminationReason: {
    type: String,
  },
  networkInfo: {
    connectionType: String,
    provider: String,
    strength: Number,
  },
  deviceInfo: {
    model: String,
    osVersion: String,
    batteryLevel: Number,
    isCharging: Boolean,
  },
  performance: {
    averageFPS: Number,
    memoryUsage: Number,
    crashCount: {
      type: Number,
      default: 0,
    },
    errorCount: {
      type: Number,
      default: 0,
    },
  },
  gameplay: {
    arModeUsed: {
      type: Boolean,
      default: false,
    },
    mapModeUsed: {
      type: Boolean,
      default: false,
    },
    tutorialCompleted: Boolean,
    featuresUsed: [String],
  },
}, {
  timestamps: true,
});

// Compound indexes for performance
SessionSchema.index({ userId: 1, startTime: -1 });
SessionSchema.index({ status: 1, startTime: -1 });
SessionSchema.index({ platform: 1, startTime: -1 });
SessionSchema.index({ 'antiCheat.flaggedForReview': 1 });
SessionSchema.index({ 'initialLocation.coordinates': '2dsphere' });

// Virtual for session efficiency (claims successful / claims attempted)
SessionSchema.virtual('efficiency').get(function() {
  if (this.metrics.claimsAttempted === 0) return 0;
  return (this.metrics.claimsSuccessful / this.metrics.claimsAttempted) * 100;
});

// Virtual for average speed in km/h
SessionSchema.virtual('averageSpeedKmh').get(function() {
  return this.metrics.averageSpeed * 3.6; // Convert m/s to km/h
});

// Method to add location update
SessionSchema.methods.addLocationUpdate = function(locationData: Partial<ILocationUpdate>) {
  this.locationUpdates.push({
    ...locationData,
    timestamp: locationData.timestamp || new Date(),
  });
  
  // Update metrics if this is not the first location
  if (this.locationUpdates.length > 1) {
    this.updateMetricsFromLocation();
  }
  
  return this.save();
};

// Method to update metrics based on location data
SessionSchema.methods.updateMetricsFromLocation = function() {
  if (this.locationUpdates.length < 2) return;
  
  const locations = this.locationUpdates;
  let totalDistance = 0;
  let totalSpeed = 0;
  let maxSpeed = 0;
  
  for (let i = 1; i < locations.length; i++) {
    const prev = locations[i - 1];
    const curr = locations[i];
    
    // Calculate distance using Haversine formula
    const distance = this.calculateDistance(
      prev.coordinates[1], prev.coordinates[0],
      curr.coordinates[1], curr.coordinates[0]
    );
    
    totalDistance += distance;
    
    // Calculate speed
    const timeDiff = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000; // seconds
    if (timeDiff > 0) {
      const speed = distance / timeDiff;
      totalSpeed += speed;
      maxSpeed = Math.max(maxSpeed, speed);
    }
  }
  
  this.metrics.distanceTraveled = totalDistance;
  this.metrics.averageSpeed = locations.length > 1 ? totalSpeed / (locations.length - 1) : 0;
  this.metrics.maxSpeed = maxSpeed;
};

// Method to calculate distance between two points
SessionSchema.methods.calculateDistance = function(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = this.toRadians(lat2 - lat1);
  const dLon = this.toRadians(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Helper method to convert degrees to radians
SessionSchema.methods.toRadians = function(degrees: number): number {
  return degrees * (Math.PI / 180);
};

// Method to end session
SessionSchema.methods.endSession = function(reason?: string) {
  this.endTime = new Date();
  this.duration = Math.floor((this.endTime.getTime() - this.startTime.getTime()) / 1000);
  this.status = reason === 'abandoned' ? 'abandoned' : 'completed';
  if (reason) {
    this.terminationReason = reason;
  }
  
  // Set final location to last location update
  if (this.locationUpdates.length > 0) {
    const lastLocation = this.locationUpdates[this.locationUpdates.length - 1];
    this.finalLocation = {
      coordinates: lastLocation.coordinates,
      accuracy: lastLocation.accuracy,
    };
  }
  
  return this.save();
};

// Method to flag for anti-cheat review
SessionSchema.methods.flagForReview = function(reason: string) {
  this.antiCheat.flaggedForReview = true;
  this.antiCheat.suspiciousPatterns.push(reason);
  return this.save();
};

// Static method to get user session statistics
SessionSchema.statics.getUserStats = function(userId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        userId: userId,
        startTime: { $gte: startDate },
        status: { $in: ['completed', 'abandoned'] }
      }
    },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        totalDuration: { $sum: '$duration' },
        totalDistance: { $sum: '$metrics.distanceTraveled' },
        totalPrizesFound: { $sum: '$metrics.prizesFound' },
        totalClaims: { $sum: '$metrics.claimsSuccessful' },
        averageSessionDuration: { $avg: '$duration' },
        averageDistance: { $avg: '$metrics.distanceTraveled' },
        averageSpeed: { $avg: '$metrics.averageSpeed' },
      }
    }
  ]);
};

// Static method to get platform statistics
SessionSchema.statics.getPlatformStats = function(days: number = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        startTime: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$platform',
        sessionCount: { $sum: 1 },
        averageDuration: { $avg: '$duration' },
        averageDistance: { $avg: '$metrics.distanceTraveled' },
        completionRate: {
          $avg: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
          }
        }
      }
    }
  ]);
};

// Static method to get sessions flagged for review
SessionSchema.statics.getFlaggedSessions = function(limit: number = 50) {
  return this.find({
    'antiCheat.flaggedForReview': true
  })
  .sort({ startTime: -1 })
  .limit(limit)
  .populate('userId', 'displayName email');
};

// Pre-save middleware
SessionSchema.pre('save', function(next) {
  // Calculate duration if session is ended
  if (this.endTime && this.startTime && !this.duration) {
    this.duration = Math.floor((this.endTime.getTime() - this.startTime.getTime()) / 1000);
  }
  
  // Calculate total rewards
  if (this.rewards) {
    this.rewards.totalPoints = 
      this.rewards.basePoints +
      this.rewards.distanceBonus +
      this.rewards.timeBonus +
      this.rewards.discoveryBonus +
      this.rewards.challengeBonus +
      this.rewards.streakBonus;
  }
  
  next();
});

export const Session = (mongoose.models.Session as mongoose.Model<ISession>) || mongoose.model<ISession>('Session', SessionSchema);
