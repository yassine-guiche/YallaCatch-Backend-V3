import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPartnerLocation {
  _id?: Types.ObjectId;
  name: string;
  address: string;
  city: string;
  coordinates: [number, number]; // [longitude, latitude]
  phone?: string;
  hours?: {
    monday?: string;
    tuesday?: string;
    wednesday?: string;
    thursday?: string;
    friday?: string;
    saturday?: string;
    sunday?: string;
  };
  isActive: boolean;
  features?: string[]; // e.g., ['parking', 'wifi', 'accessibility']
}

export interface IPartnerMethods {
  addLocation(locationData: Partial<IPartnerLocation>): Promise<IPartner>;
  updateLocation(locationId: string | Types.ObjectId, updateData: Partial<IPartnerLocation>): Promise<IPartner>;
  removeLocation(locationId: string | Types.ObjectId): Promise<IPartner>;
  getLocationsByCity(city: string): IPartnerLocation[];
  updateMetrics(redemptionValue: number, rating?: number): Promise<IPartner>;
}

export interface IPartner extends Document, IPartnerMethods {
  _id: Types.ObjectId;
  name: string;
  description: string;
  logo?: string;
  website?: string;
  phone?: string;
  email?: string;
  contactEmail?: string;
  categories: string[]; // e.g., ['food', 'shopping', 'entertainment']
  locations: IPartnerLocation[];
  isActive: boolean;
  status: 'pending' | 'active' | 'inactive';
  contractStartDate?: Date;
  contractEndDate?: Date;
  commissionRate?: number; // Percentage
  paymentTerms?: string;
  contactPerson?: {
    name: string;
    email: string;
    phone: string;
    position?: string;
  };
  businessHours?: {
    timezone: string;
    defaultHours: {
      open: string;
      close: string;
    };
  };
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
  };
  documents?: {
    businessLicense?: string;
    taxId?: string;
    bankDetails?: string;
  };
  metrics?: {
    totalRedemptions: number;
    totalRevenue: number;
    averageRating: number;
    lastActivityAt?: Date;
  };
  settings?: {
    autoApproveRedemptions: boolean;
    maxDailyRedemptions?: number;
    notificationPreferences: {
      email: boolean;
      sms: boolean;
      webhook?: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

const PartnerLocationSchema = new Schema<IPartnerLocation>({
  name: {
    type: String,
    required: true,
    maxlength: 100,
  },
  address: {
    type: String,
    required: true,
    maxlength: 200,
  },
  city: {
    type: String,
    required: true,
    maxlength: 50,
    index: true,
  },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: function (coords: number[]) {
        return coords.length === 2 &&
          coords[0] >= -180 && coords[0] <= 180 && // longitude
          coords[1] >= -90 && coords[1] <= 90;     // latitude
      },
      message: 'Coordinates must be [longitude, latitude] within valid ranges'
    }
  },
  phone: {
    type: String,
    maxlength: 20,
  },
  hours: {
    monday: String,
    tuesday: String,
    wednesday: String,
    thursday: String,
    friday: String,
    saturday: String,
    sunday: String,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  features: [{
    type: String,
    enum: ['parking', 'wifi', 'accessibility', 'delivery', 'takeaway', 'outdoor_seating', 'air_conditioning']
  }],
});

const PartnerSchema = new Schema<IPartner>({
  name: {
    type: String,
    required: true,
    maxlength: 100,
    index: true,
  },
  description: {
    type: String,
    maxlength: 500,
  },
  logo: {
    type: String, // URL to logo image
  },
  website: {
    type: String,
    validate: {
      validator: function (url: string) {
        if (!url) return true;
        return /^https?:\/\/.+/.test(url);
      },
      message: 'Website must be a valid URL'
    }
  },
  phone: {
    type: String,
    maxlength: 20,
  },
  email: {
    type: String,
    validate: {
      validator: function (email: string) {
        if (!email) return true;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      },
      message: 'Invalid email format'
    }
  },
  categories: [{
    type: String,
    enum: ['food', 'shopping', 'entertainment', 'travel', 'technology', 'health', 'education', 'services'],
    required: true,
  }],
  locations: [PartnerLocationSchema],
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'inactive'],
    default: 'active',
    index: true,
  },
  contractStartDate: {
    type: Date,
  },
  contractEndDate: {
    type: Date,
  },
  commissionRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 10, // 10% default commission
  },
  paymentTerms: {
    type: String,
    enum: ['net_15', 'net_30', 'net_45', 'net_60'],
    default: 'net_30',
  },
  contactPerson: {
    name: {
      type: String,
      required: false,
      maxlength: 100,
    },
    email: {
      type: String,
      required: false,
      validate: {
        validator: function (email: string) {
          if (!email) return true;
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        },
        message: 'Invalid email format'
      }
    },
    phone: {
      type: String,
      required: false,
      maxlength: 20,
    },
    position: {
      type: String,
      maxlength: 50,
    },
  },
  businessHours: {
    timezone: {
      type: String,
      default: 'Africa/Tunis',
    },
    defaultHours: {
      open: {
        type: String,
        default: '09:00',
      },
      close: {
        type: String,
        default: '18:00',
      },
    },
  },
  socialMedia: {
    facebook: String,
    instagram: String,
    twitter: String,
    linkedin: String,
  },
  documents: {
    businessLicense: String,
    taxId: String,
    bankDetails: String,
  },
  metrics: {
    totalRedemptions: {
      type: Number,
      default: 0,
    },
    totalRevenue: {
      type: Number,
      default: 0,
    },
    averageRating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    lastActivityAt: Date,
  },
  settings: {
    autoApproveRedemptions: {
      type: Boolean,
      default: true,
    },
    maxDailyRedemptions: {
      type: Number,
      min: 1,
      default: 100,
    },
    notificationPreferences: {
      email: {
        type: Boolean,
        default: true,
      },
      sms: {
        type: Boolean,
        default: false,
      },
      webhook: String,
    },
  },
  createdBy: {
    type: String,
  },
  updatedBy: {
    type: String,
  },
}, {
  timestamps: true,
});

// Indexes for performance
// Indexes (avoid duplicates with inline indexes)
PartnerSchema.index({ email: 1 }, { unique: true, sparse: true });
PartnerSchema.index({ 'contactPerson.email': 1 }, { sparse: true });
PartnerSchema.index({ categories: 1 });
PartnerSchema.index({ isActive: 1, categories: 1, createdAt: -1 });
PartnerSchema.index({ 'locations.coordinates': '2dsphere' });
PartnerSchema.index({ createdAt: -1 });

// Virtual for active locations count
PartnerSchema.virtual('activeLocationsCount').get(function () {
  return this.locations.filter(location => location.isActive).length;
});

// Virtual for total locations count
PartnerSchema.virtual('totalLocationsCount').get(function () {
  return this.locations.length;
});

// Method to add location
PartnerSchema.methods.addLocation = function (locationData: Partial<IPartnerLocation>) {
  this.locations.push(locationData);
  return this.save();
};

// Method to update location
PartnerSchema.methods.updateLocation = function (locationId: string | Types.ObjectId, updateData: Partial<IPartnerLocation>) {
  const location = this.locations.id(locationId);
  if (location) {
    Object.assign(location, updateData);
    return this.save();
  }
  throw new Error('Location not found');
};

// Method to remove location
PartnerSchema.methods.removeLocation = function (locationId: string | Types.ObjectId) {
  this.locations.pull({ _id: locationId });
  return this.save();
};

// Method to get locations by city
PartnerSchema.methods.getLocationsByCity = function (city: string) {
  return this.locations.filter(location =>
    location.city.toLowerCase() === city.toLowerCase() && location.isActive
  );
};

// Method to get nearby locations
PartnerSchema.statics.findNearbyPartners = function (longitude: number, latitude: number, maxDistance: number = 5000) {
  return this.find({
    isActive: true,
    'locations.coordinates': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance
      }
    }
  });
};

// Method to update metrics
PartnerSchema.methods.updateMetrics = function (redemptionValue: number, rating?: number) {
  this.metrics.totalRedemptions += 1;
  this.metrics.totalRevenue += redemptionValue;
  this.metrics.lastActivityAt = new Date();

  if (rating) {
    // Calculate new average rating
    const currentTotal = this.metrics.averageRating * (this.metrics.totalRedemptions - 1);
    this.metrics.averageRating = (currentTotal + rating) / this.metrics.totalRedemptions;
  }

  return this.save();
};

// Static method to get partners by category
PartnerSchema.statics.findByCategory = function (category: string) {
  return this.find({
    categories: category,
    isActive: true
  });
};

// Static method to get partners statistics
PartnerSchema.statics.getStatistics = function () {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalPartners: { $sum: 1 },
        activePartners: {
          $sum: { $cond: ['$isActive', 1, 0] }
        },
        totalLocations: {
          $sum: { $size: '$locations' }
        },
        totalRedemptions: {
          $sum: '$metrics.totalRedemptions'
        },
        totalRevenue: {
          $sum: '$metrics.totalRevenue'
        },
        averageRating: {
          $avg: '$metrics.averageRating'
        }
      }
    }
  ]);
};

// Pre-save middleware to update timestamps
PartnerSchema.pre('save', function (next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

// Define Static Methods Interface
export interface IPartnerModel extends mongoose.Model<IPartner> {
  findNearbyPartners(longitude: number, latitude: number, maxDistance?: number): mongoose.Query<IPartner[], IPartner>;
  findByCategory(category: string): mongoose.Query<IPartner[], IPartner>;
  getStatistics(): mongoose.Aggregate<any[]>;
}

export const Partner = (mongoose.models.Partner as IPartnerModel) || mongoose.model<IPartner, IPartnerModel>('Partner', PartnerSchema);
