import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IGameSettings {
  maxDailyClaims: number;
  claimCooldownMs: number;
  maxSpeedMs: number;
  prizeDetectionRadiusM: number;
  pointsPerClaim: {
    common: number;
    rare: number;
    epic: number;
    legendary: number;
  };
  powerUps: {
    enabled: boolean;
    radarBoostDurationMs: number;
    doublePointsDurationMs: number;
    speedBoostDurationMs: number;
  };
  antiCheat: {
    enabled: boolean;
    maxSpeedThreshold: number;
    teleportThreshold: number;
    mockLocationDetection: boolean;
    riskScoreThreshold: number;
  };
}

export interface IRewardSettings {
  categories: string[];
  commissionRates: {
    [category: string]: number;
  };
  redemptionCooldownMs: number;
  maxRedemptionsPerDay: number;
  qrCodeExpirationMs: number;
  autoApprovalThreshold: number;
}

export interface INotificationSettings {
  pushNotifications: {
    enabled: boolean;
    batchSize: number;
    retryAttempts: number;
    retryDelayMs: number;
  };
  emailNotifications: {
    enabled: boolean;
    fromAddress: string;
    replyToAddress: string;
    templates: {
      [templateName: string]: string;
    };
  };
  smsNotifications: {
    enabled: boolean;
    provider: string;
    maxLength: number;
  };
}

export interface ISecuritySettings {
  jwt: {
    accessTokenExpirationMs: number;
    refreshTokenExpirationMs: number;
    issuer: string;
    audience: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
  };
  passwordPolicy: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    maxAge: number; // days
  };
  session: {
    maxConcurrentSessions: number;
    sessionTimeoutMs: number;
    extendOnActivity: boolean;
  };
}

export interface IBusinessSettings {
  currency: string;
  timezone: string;
  supportedLanguages: string[];
  defaultLanguage: string;
  businessHours: {
    [day: string]: {
      open: string;
      close: string;
      closed: boolean;
    };
  };
  contactInfo: {
    supportEmail: string;
    supportPhone: string;
    businessAddress: string;
  };
  legal: {
    termsOfServiceUrl: string;
    privacyPolicyUrl: string;
    cookiePolicyUrl: string;
  };
}

export interface IIntegrationSettings {
  maps: {
    provider: 'google' | 'mapbox' | 'osm';
    apiKey?: string;
    defaultZoom: number;
    maxZoom: number;
    minZoom: number;
  };
  analytics: {
    enabled: boolean;
    provider: string;
    trackingId?: string;
    customEvents: boolean;
  };
  payment: {
    enabled: boolean;
    providers: string[];
    currency: string;
    testMode: boolean;
  };
  social: {
    facebookAppId?: string;
    googleClientId?: string;
    twitterApiKey?: string;
    instagramClientId?: string;
  };
}

export interface IMaintenanceSettings {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  scheduledMaintenance?: {
    startTime: Date;
    endTime: Date;
    message: string;
  };
  allowedIPs: string[];
  bypassRoles: string[];
}

export interface ISettings extends Document {
  _id: Types.ObjectId;
  version: string;
  environment: 'development' | 'staging' | 'production';

  game: IGameSettings;
  rewards: IRewardSettings;
  notifications: INotificationSettings;
  security: ISecuritySettings;
  business: IBusinessSettings;
  integrations: IIntegrationSettings;
  maintenance: IMaintenanceSettings;

  // Feature flags
  features: {
    [featureName: string]: {
      enabled: boolean;
      rolloutPercentage?: number;
      allowedUsers?: string[];
      allowedRoles?: string[];
    };
  };

  // Custom settings
  custom: {
    [key: string]: any;
  };

  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

const GameSettingsSchema = new Schema<IGameSettings>({
  maxDailyClaims: {
    type: Number,
    default: 50,
    min: 1,
    max: 1000,
  },
  claimCooldownMs: {
    type: Number,
    default: 300000, // 5 minutes
    min: 0,
  },
  maxSpeedMs: {
    type: Number,
    default: 15, // 15 m/s = 54 km/h
    min: 1,
    max: 50,
  },
  prizeDetectionRadiusM: {
    type: Number,
    default: 50, // 50 meters
    min: 10,
    max: 500,
  },
  pointsPerClaim: {
    common: {
      type: Number,
      default: 10,
      min: 1,
    },
    rare: {
      type: Number,
      default: 25,
      min: 1,
    },
    epic: {
      type: Number,
      default: 50,
      min: 1,
    },
    legendary: {
      type: Number,
      default: 100,
      min: 1,
    },
  },
  powerUps: {
    enabled: {
      type: Boolean,
      default: true,
    },
    radarBoostDurationMs: {
      type: Number,
      default: 600000, // 10 minutes
    },
    doublePointsDurationMs: {
      type: Number,
      default: 1800000, // 30 minutes
    },
    speedBoostDurationMs: {
      type: Number,
      default: 900000, // 15 minutes
    },
  },
  antiCheat: {
    enabled: {
      type: Boolean,
      default: true,
    },
    maxSpeedThreshold: {
      type: Number,
      default: 50, // m/s
    },
    teleportThreshold: {
      type: Number,
      default: 1000, // meters
    },
    mockLocationDetection: {
      type: Boolean,
      default: true,
    },
    riskScoreThreshold: {
      type: Number,
      default: 70,
      min: 0,
      max: 100,
    },
  },
});

const RewardSettingsSchema = new Schema<IRewardSettings>({
  categories: [{
    type: String,
    enum: ['food', 'shopping', 'entertainment', 'travel', 'technology', 'health', 'education', 'services'],
  }],
  commissionRates: {
    type: Map,
    of: Number,
    default: {
      food: 10,
      shopping: 15,
      entertainment: 12,
      travel: 8,
      technology: 20,
      health: 15,
      education: 10,
      services: 12,
    },
  },
  redemptionCooldownMs: {
    type: Number,
    default: 86400000, // 24 hours
  },
  maxRedemptionsPerDay: {
    type: Number,
    default: 5,
    min: 1,
  },
  qrCodeExpirationMs: {
    type: Number,
    default: 1800000, // 30 minutes
  },
  autoApprovalThreshold: {
    type: Number,
    default: 100, // points
    min: 0,
  },
});

const NotificationSettingsSchema = new Schema<INotificationSettings>({
  pushNotifications: {
    enabled: {
      type: Boolean,
      default: true,
    },
    batchSize: {
      type: Number,
      default: 1000,
      min: 1,
    },
    retryAttempts: {
      type: Number,
      default: 3,
      min: 0,
    },
    retryDelayMs: {
      type: Number,
      default: 5000,
      min: 1000,
    },
  },
  emailNotifications: {
    enabled: {
      type: Boolean,
      default: true,
    },
    fromAddress: {
      type: String,
      default: 'noreply@yallacatch.tn',
    },
    replyToAddress: {
      type: String,
      default: 'support@yallacatch.tn',
    },
    templates: {
      type: Map,
      of: String,
      default: {},
    },
  },
  smsNotifications: {
    enabled: {
      type: Boolean,
      default: false,
    },
    provider: {
      type: String,
      default: 'twilio',
    },
    maxLength: {
      type: Number,
      default: 160,
    },
  },
});

const SecuritySettingsSchema = new Schema<ISecuritySettings>({
  jwt: {
    accessTokenExpirationMs: {
      type: Number,
      default: 3600000, // 1 hour
    },
    refreshTokenExpirationMs: {
      type: Number,
      default: 2592000000, // 30 days
    },
    issuer: {
      type: String,
      default: 'yallacatch.tn',
    },
    audience: {
      type: String,
      default: 'yallacatch-app',
    },
  },
  rateLimit: {
    windowMs: {
      type: Number,
      default: 900000, // 15 minutes
    },
    maxRequests: {
      type: Number,
      default: 100,
    },
    skipSuccessfulRequests: {
      type: Boolean,
      default: true,
    },
  },
  passwordPolicy: {
    minLength: {
      type: Number,
      default: 8,
      min: 6,
    },
    requireUppercase: {
      type: Boolean,
      default: true,
    },
    requireLowercase: {
      type: Boolean,
      default: true,
    },
    requireNumbers: {
      type: Boolean,
      default: true,
    },
    requireSpecialChars: {
      type: Boolean,
      default: false,
    },
    maxAge: {
      type: Number,
      default: 90, // days
    },
  },
  session: {
    maxConcurrentSessions: {
      type: Number,
      default: 3,
    },
    sessionTimeoutMs: {
      type: Number,
      default: 86400000, // 24 hours
    },
    extendOnActivity: {
      type: Boolean,
      default: true,
    },
  },
});

const BusinessSettingsSchema = new Schema<IBusinessSettings>({
  currency: {
    type: String,
    default: 'TND',
  },
  timezone: {
    type: String,
    default: 'Africa/Tunis',
  },
  supportedLanguages: [{
    type: String,
    default: ['fr', 'ar', 'en'],
  }],
  defaultLanguage: {
    type: String,
    default: 'fr',
  },
  businessHours: {
    type: Map,
    of: {
      open: String,
      close: String,
      closed: Boolean,
    },
    default: {
      monday: { open: '09:00', close: '18:00', closed: false },
      tuesday: { open: '09:00', close: '18:00', closed: false },
      wednesday: { open: '09:00', close: '18:00', closed: false },
      thursday: { open: '09:00', close: '18:00', closed: false },
      friday: { open: '09:00', close: '18:00', closed: false },
      saturday: { open: '10:00', close: '16:00', closed: false },
      sunday: { open: '00:00', close: '00:00', closed: true },
    },
  },
  contactInfo: {
    supportEmail: {
      type: String,
      default: 'support@yallacatch.tn',
    },
    supportPhone: {
      type: String,
      default: '+216 XX XXX XXX',
    },
    businessAddress: {
      type: String,
      default: 'Tunis, Tunisia',
    },
  },
  legal: {
    termsOfServiceUrl: {
      type: String,
      default: 'https://yallacatch.tn/terms',
    },
    privacyPolicyUrl: {
      type: String,
      default: 'https://yallacatch.tn/privacy',
    },
    cookiePolicyUrl: {
      type: String,
      default: 'https://yallacatch.tn/cookies',
    },
  },
});

const IntegrationSettingsSchema = new Schema<IIntegrationSettings>({
  maps: {
    provider: {
      type: String,
      enum: ['google', 'mapbox', 'osm'],
      default: 'google',
    },
    apiKey: String,
    defaultZoom: {
      type: Number,
      default: 15,
      min: 1,
      max: 20,
    },
    maxZoom: {
      type: Number,
      default: 18,
      min: 1,
      max: 20,
    },
    minZoom: {
      type: Number,
      default: 10,
      min: 1,
      max: 20,
    },
  },
  analytics: {
    enabled: {
      type: Boolean,
      default: true,
    },
    provider: {
      type: String,
      default: 'google-analytics',
    },
    trackingId: String,
    customEvents: {
      type: Boolean,
      default: true,
    },
  },
  payment: {
    enabled: {
      type: Boolean,
      default: false,
    },
    providers: [{
      type: String,
      enum: ['stripe', 'paypal', 'flouci'],
    }],
    currency: {
      type: String,
      default: 'TND',
    },
    testMode: {
      type: Boolean,
      default: true,
    },
  },
  social: {
    facebookAppId: String,
    googleClientId: String,
    twitterApiKey: String,
    instagramClientId: String,
  },
});

const MaintenanceSettingsSchema = new Schema<IMaintenanceSettings>({
  maintenanceMode: {
    type: Boolean,
    default: false,
  },
  maintenanceMessage: {
    type: String,
    default: 'System is under maintenance. Please try again later.',
  },
  scheduledMaintenance: {
    startTime: Date,
    endTime: Date,
    message: String,
  },
  allowedIPs: [String],
  bypassRoles: [{
    type: String,
    enum: ['admin', 'moderator', 'developer'],
  }],
});

const SettingsSchema = new Schema<ISettings>({
  version: {
    type: String,
    required: true,
    default: '1.0.0',
  },
  environment: {
    type: String,
    enum: ['development', 'staging', 'production'],
    required: true,
    default: 'development',
  },
  game: {
    type: GameSettingsSchema,
    default: () => ({}),
  },
  rewards: {
    type: RewardSettingsSchema,
    default: () => ({}),
  },
  notifications: {
    type: NotificationSettingsSchema,
    default: () => ({}),
  },
  security: {
    type: SecuritySettingsSchema,
    default: () => ({}),
  },
  business: {
    type: BusinessSettingsSchema,
    default: () => ({}),
  },
  integrations: {
    type: IntegrationSettingsSchema,
    default: () => ({}),
  },
  maintenance: {
    type: MaintenanceSettingsSchema,
    default: () => ({}),
  },
  features: {
    type: Map,
    of: {
      enabled: {
        type: Boolean,
        default: true,
      },
      rolloutPercentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 100,
      },
      allowedUsers: [String],
      allowedRoles: [String],
    },
    default: {},
  },
  custom: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {},
  },
  createdBy: String,
  updatedBy: String,
}, {
  timestamps: true,
});

// Indexes
SettingsSchema.index({ version: 1 });

// Ensure only one settings document per environment
SettingsSchema.index({ environment: 1 }, { unique: true });

// Virtual for checking if maintenance mode is active
SettingsSchema.virtual('isMaintenanceActive').get(function () {
  if (this.maintenance.maintenanceMode) return true;

  if (this.maintenance.scheduledMaintenance) {
    const now = new Date();
    return now >= this.maintenance.scheduledMaintenance.startTime &&
      now <= this.maintenance.scheduledMaintenance.endTime;
  }

  return false;
});

// Method to check if feature is enabled for user
SettingsSchema.methods.isFeatureEnabled = function (featureName: string, userId?: string, userRole?: string): boolean {
  const feature = this.features.get(featureName);
  if (!feature) return false;

  if (!feature.enabled) return false;

  // Check user-specific access
  if (feature.allowedUsers && feature.allowedUsers.length > 0) {
    return userId && feature.allowedUsers.includes(userId);
  }

  // Check role-specific access
  if (feature.allowedRoles && feature.allowedRoles.length > 0) {
    return userRole && feature.allowedRoles.includes(userRole);
  }

  // Check rollout percentage
  if (feature.rolloutPercentage < 100) {
    if (!userId) return false;

    // Use user ID to determine if they're in the rollout
    const hash = this.hashUserId(userId);
    return hash < feature.rolloutPercentage;
  }

  return true;
};

// Helper method to hash user ID for rollout percentage
SettingsSchema.methods.hashUserId = function (userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash) % 100;
};

// Method to get setting by path
SettingsSchema.methods.getSetting = function (path: string): any {
  const keys = path.split('.');
  let current = this.toObject();

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }

  return current;
};

// Method to set setting by path
SettingsSchema.methods.setSetting = function (path: string, value: any): void {
  const keys = path.split('.');
  let current = this;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!current[key]) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
};

// Static method to get current settings for environment
SettingsSchema.statics.getCurrentSettings = function (environment: string = 'production') {
  return this.findOne({ environment }).exec();
};

// Static method to initialize default settings
SettingsSchema.statics.initializeDefaults = function (environment: string = 'production') {
  return this.findOneAndUpdate(
    { environment },
    { environment },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
};

// Pre-save middleware to validate settings
SettingsSchema.pre('save', function (next) {
  // Validate game settings
  if (this.game.maxSpeedMs > 100) {
    return next(new Error('Max speed cannot exceed 100 m/s'));
  }

  // Validate security settings
  if (this.security.jwt.accessTokenExpirationMs > this.security.jwt.refreshTokenExpirationMs) {
    return next(new Error('Access token expiration cannot exceed refresh token expiration'));
  }

  // Validate business hours
  const businessHours = this.business.businessHours;
  for (const [day, hours] of Object.entries(businessHours)) {
    if (!hours.closed && (!hours.open || !hours.close)) {
      return next(new Error(`Business hours for ${day} are incomplete`));
    }
  }

  next();
});

export const Settings = (mongoose.models.Settings as mongoose.Model<ISettings>) || mongoose.model<ISettings>('Settings', SettingsSchema);
