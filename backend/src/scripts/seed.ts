import mongoose from 'mongoose';
import { config } from '@/config';
import { logger } from '@/lib/logger';
import { User } from '@/models/User';
import { Prize } from '@/models/Prize';
import { Reward } from '@/models/Reward';
import { Code } from '@/models/Code';
import { Notification } from '@/models/Notification';
import { Analytics } from '@/models/Analytics';
import { Distribution } from '@/models/Distribution';
import { Partner } from '@/models/Partner';
import { UserRole, Platform, PrizeCategory, RewardCategory, ListingType, PrizeRarity, PrizeType, PrizeStatus } from '@/types';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

/**
 * Seeding configuration
 */
interface SeedConfig {
  environment: string;
  clearExisting: boolean;
  createTestData: boolean;
  dataSize: 'minimal' | 'small' | 'medium' | 'large';
}

/**
 * Tunisian cities with coordinates
 */
const tunisianCities = [
  { name: 'Tunis', lat: 36.8065, lng: 10.1815, population: 1200000 },
  { name: 'Sfax', lat: 34.7406, lng: 10.7603, population: 330440 },
  { name: 'Sousse', lat: 35.8256, lng: 10.6369, population: 271428 },
  { name: 'Kairouan', lat: 35.6781, lng: 10.0963, population: 186653 },
  { name: 'Bizerte', lat: 37.2746, lng: 9.8739, population: 142966 },
  { name: 'Gabes', lat: 33.8815, lng: 10.0982, population: 130271 },
  { name: 'Ariana', lat: 36.8625, lng: 10.1956, population: 114486 },
  { name: 'Gafsa', lat: 34.425, lng: 8.7842, population: 95000 },
];

/**
 * Main seeding function
 */
async function seed(): Promise<void> {
  try {
    // Parse command line arguments
    const seedConfig: SeedConfig = {
      environment: process.env.NODE_ENV || 'development',
      clearExisting: process.argv.includes('--clear'),
      createTestData: process.argv.includes('--test-data'),
      dataSize: (process.argv.find(arg => arg.startsWith('--size='))?.split('=')[1] as any) || 'small',
    };

    logger.info({ seedConfig }, 'Starting database seeding');

    // Connect to database
    await mongoose.connect(config.MONGODB_URI);
    logger.info('Connected to MongoDB');

    // Clear existing data if requested
    if (seedConfig.clearExisting) {
      await clearDatabase();
    }

    // Create essential data
    await createAdminUsers();
    await createPartners();
    await createRewards();
    await createSystemNotifications();

    // Create test data if requested
    if (seedConfig.createTestData) {
      await createTestUsers(seedConfig.dataSize);
      await createTestPrizes(seedConfig.dataSize);
      await createTestClaims(seedConfig.dataSize);
      await createTestRedemptions(seedConfig.dataSize);
      await createAnalyticsData();
    }

    logger.info('Database seeding completed successfully');
    process.exit(0);

  } catch (error: any) {
    logger.error({ error: error.message }, 'Database seeding failed');
    process.exit(1);
  }
}

/**
 * Clear all collections
 */
async function clearDatabase(): Promise<void> {
  logger.info('Clearing existing database data');

  const collections = [
    'users', 'prizes', 'claims', 'rewards', 'redemptions', 'codes',
    'notifications', 'analytics', 'auditlogs', 'sessions', 'distributions', 'partners'
  ];

  for (const collection of collections) {
    try {
      if (!mongoose.connection.db) {
        throw new Error('Database connection not established');
      }
      await mongoose.connection.db.collection(collection).deleteMany({});
      logger.info(`Cleared collection: ${collection}`);
    } catch (error: any) {
      logger.warn({ error: error.message }, `Failed to clear collection ${collection}`);
    }
  }
}

/**
 * Create admin users
 */
async function createAdminUsers(): Promise<void> {
  logger.info('Creating admin users');

  const adminUsers = [
    {
      email: config.ADMIN_EMAIL || 'admin@yallacatch.tn',
      password: config.ADMIN_PASSWORD || 'AdminSecurePass123!@#',
      displayName: 'System Administrator',
      role: UserRole.SUPER_ADMIN,
    },
    {
      email: 'moderator@yallacatch.tn',
      password: 'ModeratorSecurePass123!@#',
      displayName: 'Content Moderator',
      role: UserRole.MODERATOR,
    },
    {
      email: 'support@yallacatch.tn',
      password: 'SupportSecurePass123!@#',
      displayName: 'Customer Support',
      role: UserRole.ADMIN,
    },
  ];

  for (const userData of adminUsers) {
    const existingUser = await User.findOne({ email: userData.email });

    if (!existingUser) {
      const user = new User({
        email: userData.email,
        passwordHash: userData.password, // Hook will hash it
        displayName: userData.displayName,
        role: userData.role,
        level: 'diamond',
        points: {
          total: 1000000,
          available: 1000000,
          spent: 0,
        },
        location: {
          type: 'Point',
          coordinates: [tunisianCities[0].lng, tunisianCities[0].lat],
          city: tunisianCities[0].name,
        },
        devices: [{
          deviceId: `admin_${nanoid(10)}`,
          platform: Platform.WEB,
          lastUsed: new Date(),
          isActive: true,
        }],
        isEmailVerified: true,
        createdAt: new Date(),
        lastActive: new Date(),
      });

      await user.save();
      logger.info(`Created admin user: ${userData.email}`);
    } else {
      logger.info(`Admin user already exists: ${userData.email}`);
    }
  }
}

/**
 * Create partner companies
 */
async function createPartners(): Promise<void> {
  logger.info('Creating partner companies');

  const partners = [
    {
      name: 'Carrefour Tunisia',
      type: 'retail',
      contactEmail: 'partnership@carrefour.tn',
      contactPhone: '+216 71 123 456',
      website: 'https://carrefour.tn',
      description: 'Leading hypermarket chain in Tunisia',
      address: {
        street: 'Avenue Habib Bourguiba',
        city: 'Tunis',
        postalCode: '1000',
        country: 'Tunisia',
        location: {
          type: 'Point',
          coordinates: [10.1815, 36.8065],
        },
      },
      businessInfo: {
        registrationNumber: 'TN001234567',
        category: 'Retail',
        establishedYear: 2001,
      },
      contractDetails: {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2025-12-31'),
        commissionRate: 0.05,
        paymentTerms: 'Net 30',
      },
    },
    {
      name: 'Monoprix',
      type: 'retail',
      contactEmail: 'partenaires@monoprix.tn',
      contactPhone: '+216 71 234 567',
      website: 'https://monoprix.tn',
      description: 'Premium supermarket chain',
      address: {
        street: 'Avenue Mohamed V',
        city: 'Tunis',
        postalCode: '1002',
        country: 'Tunisia',
        location: {
          type: 'Point',
          coordinates: [10.1700, 36.8100],
        },
      },
    },
    {
      name: 'Géant',
      type: 'retail',
      contactEmail: 'contact@geant.tn',
      contactPhone: '+216 71 345 678',
      website: 'https://geant.tn',
      description: 'Hypermarket with wide product selection',
      address: {
        street: 'Centre Urbain Nord',
        city: 'Tunis',
        postalCode: '1082',
        country: 'Tunisia',
        location: {
          type: 'Point',
          coordinates: [10.1650, 36.8400],
        },
      },
    },
    {
      name: 'Tunisie Telecom',
      type: 'service',
      contactEmail: 'partnerships@tunisietelecom.tn',
      contactPhone: '+216 71 456 789',
      website: 'https://tunisietelecom.tn',
      description: 'National telecommunications provider',
    },
    {
      name: 'SNCFT',
      type: 'transport',
      contactEmail: 'commercial@sncft.tn',
      contactPhone: '+216 71 567 890',
      description: 'National railway company',
    },
  ];

  for (const partnerData of partners) {
    const existingPartner = await Partner.findOne({ name: partnerData.name });

    if (!existingPartner) {
      const partner = new Partner({
        ...partnerData,
        email: partnerData.contactEmail || (partnerData as any).email,
        contactPerson: {
          name: partnerData.name,
          email: partnerData.contactEmail || (partnerData as any).email,
          phone: partnerData.contactPhone || (partnerData as any).phone || '',
          position: 'Manager',
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await partner.save();
      logger.info(`Created partner: ${partnerData.name}`);
    } else {
      logger.info(`Partner already exists: ${partnerData.name}`);
    }
  }
}

/**
 * Create reward catalog
 */
/**
 * Create reward catalog (Game Rewards & Marketplace Items)
 */
async function createRewards(): Promise<void> {
  logger.info('Creating reward catalog (Rewards & Marketplace)');

  const partners = await Partner.find({ isActive: true });

  const items = [
    // --- GAME REWARDS (listingType: GAME_REWARD) ---
    {
      name: '10 TND Carrefour Voucher',
      description: 'Shopping voucher valid at any Carrefour store',
      category: RewardCategory.VOUCHER,
      pointsCost: 1000,
      stockQuantity: 1000,
      stockAvailable: 1000,
      partnerId: partners.find(p => p.name.includes('Carrefour'))?._id,
      partnerName: 'Carrefour Tunisia',
      expiryDays: 90,
      requiresApproval: false,
      maxRedemptionsPerUser: 5,
      listingType: ListingType.GAME_REWARD
    },
    {
      name: 'Pizza Hut Medium Pizza',
      description: 'Free medium pizza at Pizza Hut',
      category: RewardCategory.VOUCHER,
      pointsCost: 1200,
      stockQuantity: 200,
      stockAvailable: 200,
      expiryDays: 30,
      requiresApproval: false,
      maxRedemptionsPerUser: 3,
      listingType: ListingType.GAME_REWARD
    },
    {
      name: 'Starbucks Coffee Voucher',
      description: 'Free drink at Starbucks (up to 12 TND)',
      category: RewardCategory.VOUCHER,
      pointsCost: 600,
      stockQuantity: 300,
      stockAvailable: 300,
      expiryDays: 21,
      requiresApproval: false,
      maxRedemptionsPerUser: 5,
      listingType: ListingType.GAME_REWARD
    },
    {
      name: 'SNCFT Train Ticket',
      description: 'Free train ticket for intercity travel',
      category: RewardCategory.VOUCHER,
      pointsCost: 800,
      stockQuantity: 500,
      stockAvailable: 500,
      partnerId: partners.find(p => p.name.includes('SNCFT'))?._id,
      partnerName: 'SNCFT',
      expiryDays: 45,
      requiresApproval: false,
      maxRedemptionsPerUser: 10,
      listingType: ListingType.GAME_REWARD
    },

    // --- MARKETPLACE ITEMS (listingType: MARKETPLACE_ITEM) ---
    {
      name: 'iPhone 15 Pro Max',
      description: 'Brand new iPhone 15 Pro Max, 256GB, Titanium Blue',
      category: 'physical', // Using generic string as per frontend categories often used
      pointsCost: 500000,
      stockQuantity: 5,
      stockAvailable: 5,
      partnerId: null, // YallaCatch managed
      expiryDays: 365,
      requiresApproval: true,
      maxRedemptionsPerUser: 1,
      listingType: ListingType.MARKETPLACE_ITEM,
      isPopular: true
    },
    {
      name: 'PlayStation 5 Console',
      description: 'Sony PlayStation 5 Console (Disc Edition)',
      category: 'physical',
      pointsCost: 350000,
      stockQuantity: 10,
      stockAvailable: 10,
      expiryDays: 365,
      requiresApproval: true,
      maxRedemptionsPerUser: 1,
      listingType: ListingType.MARKETPLACE_ITEM,
      isPopular: true
    },
    {
      name: 'Netflix Premium (1 Year)',
      description: '12 Months of Netflix Premium Subscription (4K + HDR)',
      category: 'digital',
      pointsCost: 25000,
      stockQuantity: 50,
      stockAvailable: 50,
      expiryDays: 365,
      requiresApproval: false,
      maxRedemptionsPerUser: 1,
      listingType: ListingType.MARKETPLACE_ITEM,
      isPopular: false
    },
    {
      name: 'Monoprix Premium Gift Card (100 TND)',
      description: 'High value gift card for Monoprix',
      category: RewardCategory.GIFT_CARD,
      pointsCost: 10000,
      stockQuantity: 100,
      stockAvailable: 100,
      partnerId: partners.find(p => p.name.includes('Monoprix'))?._id,
      partnerName: 'Monoprix',
      expiryDays: 180,
      requiresApproval: true,
      maxRedemptionsPerUser: 2,
      listingType: ListingType.MARKETPLACE_ITEM
    },
    {
      name: 'Weekend Getaway in Hammamet',
      description: '2 nights for 2 people at a 5-star hotel in Hammamet',
      category: 'experience',
      pointsCost: 150000,
      stockQuantity: 20,
      stockAvailable: 20,
      expiryDays: 90,
      requiresApproval: true,
      maxRedemptionsPerUser: 1,
      listingType: ListingType.MARKETPLACE_ITEM,
      isPopular: true
    }
  ];

  for (const itemData of items) {
    const existingItem = await Reward.findOne({ name: itemData.name });

    if (!existingItem) {
      const reward = new Reward({
        ...itemData,
        isActive: true,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await reward.save();

      // Create codes for items that don't require approval and have stock
      if (!itemData.requiresApproval && itemData.stockQuantity > 0) {
        await createCodesForReward(reward._id, itemData.stockQuantity);
      }

      logger.info(`Created ${itemData.listingType}: ${itemData.name}`);
    } else {
      logger.info(`${itemData.listingType} already exists: ${itemData.name}`);
    }
  }
}

/**
 * Create codes for a reward
 */
async function createCodesForReward(rewardId: any, quantity: number): Promise<void> {
  const codes = [];
  const batchId = `batch_${nanoid(8)}`;

  for (let i = 0; i < quantity; i++) {
    codes.push({
      code: `YC${nanoid(8).toUpperCase()}`,
      rewardId,
      status: 'available',
      batchId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    });
  }

  await Code.insertMany(codes);
  logger.info(`Created ${quantity} codes for reward ${rewardId}`);
}

/**
 * Create system notifications
 */
async function createSystemNotifications(): Promise<void> {
  logger.info('Creating system notifications');

  const admin = await User.findOne({ role: UserRole.SUPER_ADMIN });
  if (!admin) {
    logger.warn('No admin found for system notifications');
  }

  const notifications = [
    {
      type: 'in_app',
      targetType: 'all',
      targetValue: 'all_users',
      title: 'Welcome to YallaCatch!',
      message: 'Start exploring and catching prizes around Tunisia. Good luck!',
      status: 'sent',
      sentAt: new Date(),
      createdBy: admin?._id,
      metadata: {
        priority: 'normal',
        category: 'welcome',
        tags: ['onboarding', 'welcome'],
      },
    },
    {
      type: 'push',
      targetType: 'city',
      targetValue: 'Tunis',
      title: 'New Prizes in Tunis!',
      message: 'Fresh prizes have been distributed in your area. Go catch them!',
      status: 'draft',
      createdBy: admin?._id,
      metadata: {
        priority: 'high',
        category: 'prizes',
        tags: ['prizes', 'tunis'],
      },
    },
  ];

  for (const notificationData of notifications) {
    const notification = new Notification({
      ...notificationData,
      createdAt: new Date(),
      deliveryStats: {
        totalTargets: 0,
        delivered: 0,
        failed: 0,
        opened: 0,
        clicked: 0,
      },
    });

    await notification.save();
    logger.info(`Created notification: ${notificationData.title}`);
  }
}

/**
 * Create test users
 */
async function createTestUsers(dataSize: string): Promise<void> {
  logger.info(`Creating test users (${dataSize} dataset)`);

  const userCounts: Record<string, number> = {
    minimal: 10,
    small: 50,
    medium: 200,
    large: 1000,
  };

  const count = userCounts[dataSize] || 50;
  const users = [];

  for (let i = 0; i < count; i++) {
    const city = tunisianCities[i % tunisianCities.length];
    const randomOffset = () => (Math.random() - 0.5) * 0.1; // ~5km radius

    users.push({
      email: `testuser${i + 1}@example.com`,
      displayName: `Test User ${i + 1}`,
      role: UserRole.PLAYER,
      level: ['bronze', 'silver', 'gold', 'platinum'][Math.floor(Math.random() * 4)],
      points: {
        total: Math.floor(Math.random() * 10000),
        available: Math.floor(Math.random() * 5000),
        spent: Math.floor(Math.random() * 5000),
      },
      location: {
        type: 'Point',
        coordinates: [
          city.lng + randomOffset(),
          city.lat + randomOffset(),
        ],
        city: city.name,
      },
      devices: [{
        deviceId: `device_${nanoid(10)}`,
        platform: [Platform.IOS, Platform.ANDROID, Platform.WEB][Math.floor(Math.random() * 3)],
        lastUsed: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        isActive: Math.random() > 0.2,
      }],
      createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
      lastActive: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    });
  }

  await User.insertMany(users);
  logger.info(`Created ${count} test users`);
}

/**
 * Create test prizes
 */
async function createTestPrizes(dataSize: string): Promise<void> {
  logger.info(`Creating test prizes (${dataSize} dataset)`);

  const prizeCounts: Record<string, number> = {
    minimal: 50,
    small: 200,
    medium: 1000,
    large: 5000,
  };

  const count = prizeCounts[dataSize] || 200;
  const prizes = [];
  const categories = Object.values(PrizeCategory);
  const rarities = Object.values(PrizeRarity);
  const prizeTypes = Object.values(PrizeType);
  const admin = await User.findOne({ role: UserRole.SUPER_ADMIN });

  if (!admin) {
    logger.error('No admin found to assign to prizes');
    return;
  }

  for (let i = 0; i < count; i++) {
    const city = tunisianCities[i % tunisianCities.length];
    const randomOffset = () => (Math.random() - 0.5) * 0.05; // ~2.5km radius

    prizes.push({
      name: `Prize ${i + 1}`,
      description: `Test prize number ${i + 1}`,
      type: prizeTypes[Math.floor(Math.random() * prizeTypes.length)],
      category: categories[Math.floor(Math.random() * categories.length)],
      rarity: rarities[Math.floor(Math.random() * rarities.length)],
      points: [100, 250, 500, 1000, 2500][Math.floor(Math.random() * 5)],
      location: {
        type: 'gps',
        coordinates: [
          city.lng + randomOffset(),
          city.lat + randomOffset(),
        ],
        city: city.name,
      },
      status: Math.random() > 0.1 ? PrizeStatus.ACTIVE : PrizeStatus.CAPTURED,
      createdBy: admin._id,
      expiresAt: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    });
  }



  for (const prizeData of prizes) {
    try {
      const prize = new Prize(prizeData);
      await prize.save();
    } catch (error: any) {
      logger.error({
        error: error.message,
        prizeName: prizeData.name,
        prizeCreatedBy: (prizeData as any).createdBy
      }, 'Failed to save prize');
      throw error;
    }
  }
  logger.info(`Created ${count} test prizes`);
}

/**
 * Create test claims and redemptions
 */
async function createTestClaims(dataSize: string): Promise<void> {
  // Implementation would create test claims based on existing users and prizes
  logger.info(`Creating test claims (${dataSize} dataset)`);
  // ... implementation details
}

async function createTestRedemptions(dataSize: string): Promise<void> {
  // Implementation would create test redemptions based on existing users and rewards
  logger.info(`Creating test redemptions (${dataSize} dataset)`);
  // ... implementation details
}

/**
 * Create analytics data
 */
async function createAnalyticsData(): Promise<void> {
  logger.info('Creating analytics data');

  const analytics = [
    {
      type: 'daily_summary',
      date: new Date(),
      period: 'daily',
      data: {
        metrics: {
          activeUsers: 1250,
          newUsers: 45,
          prizesCreated: 150,
          prizesClaimed: 89,
          redemptions: 23,
          revenue: 1250.50,
        },
        dimensions: {
          topCities: ['Tunis', 'Sfax', 'Sousse'],
          topCategories: ['food', 'shopping', 'entertainment'],
        },
      },
      generatedAt: new Date(),
      version: '1.0',
    },
  ];

  await Analytics.insertMany(analytics);
  logger.info('Created analytics data');
}

// Run seeding
seed().catch(error => {
  console.error('Fatal error during seeding:', error);
  process.exit(1);
});

export { seed };
