import mongoose from 'mongoose';
import { config } from '../src/config';
import { logger } from '../src/lib/logger';
import { User } from '../src/models/User';
import { Prize } from '../src/models/Prize';
import { Reward } from '../src/models/Reward';
import { Code } from '../src/models/Code';
import { Notification } from '../src/models/Notification';
import { Analytics } from '../src/models/Analytics';
import { Distribution } from '../src/models/Distribution';
import { Partner } from '../src/models/Partner';
import { UserRole, Platform, PrizeCategory, RewardCategory } from '../src/types';
import argon2 from 'argon2';
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
  { name: 'Gabès', lat: 33.8815, lng: 10.0982, population: 130271 },
  { name: 'Ariana', lat: 36.8625, lng: 10.1956, population: 114486 },
  { name: 'La Manouba', lat: 36.8089, lng: 10.0969, population: 99294 },
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

    logger.info('Starting database seeding', seedConfig);

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

  } catch (error) {
    logger.error('Database seeding failed', { error: error.message });
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
      await mongoose.connection.db.collection(collection).deleteMany({});
      logger.info(`Cleared collection: ${collection}`);
    } catch (error) {
      logger.warn(`Failed to clear collection ${collection}`, { error: error.message });
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
      const passwordHash = await argon2.hash(userData.password);
      
      const user = new User({
        email: userData.email,
        passwordHash,
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
async function createRewards(): Promise<void> {
  logger.info('Creating reward catalog');

  const partners = await Partner.find({ isActive: true });
  
  const rewards = [
    // Carrefour rewards
    {
      name: '10 TND Carrefour Voucher',
      description: 'Shopping voucher valid at any Carrefour store',
      category: RewardCategory.SHOPPING,
      pointsCost: 1000,
      stockTotal: 1000,
      stockAvailable: 1000,
      partnerId: partners.find(p => p.name.includes('Carrefour'))?._id,
      partnerName: 'Carrefour Tunisia',
      expiryDays: 90,
      requiresApproval: false,
      maxRedemptionsPerUser: 5,
    },
    {
      name: '25 TND Carrefour Voucher',
      description: 'Shopping voucher valid at any Carrefour store',
      category: RewardCategory.SHOPPING,
      pointsCost: 2500,
      stockTotal: 500,
      stockAvailable: 500,
      partnerId: partners.find(p => p.name.includes('Carrefour'))?._id,
      partnerName: 'Carrefour Tunisia',
      expiryDays: 90,
      requiresApproval: false,
      maxRedemptionsPerUser: 3,
    },
    // Monoprix rewards
    {
      name: '15 TND Monoprix Gift Card',
      description: 'Gift card for premium shopping at Monoprix',
      category: RewardCategory.SHOPPING,
      pointsCost: 1500,
      stockTotal: 300,
      stockAvailable: 300,
      partnerId: partners.find(p => p.name.includes('Monoprix'))?._id,
      partnerName: 'Monoprix',
      expiryDays: 60,
      requiresApproval: true,
      maxRedemptionsPerUser: 2,
    },
    // Digital rewards
    {
      name: 'Netflix 1 Month Subscription',
      description: 'One month Netflix premium subscription',
      category: RewardCategory.ENTERTAINMENT,
      pointsCost: 3000,
      stockTotal: 100,
      stockAvailable: 100,
      expiryDays: 30,
      requiresApproval: true,
      maxRedemptionsPerUser: 1,
    },
    {
      name: 'Spotify Premium 3 Months',
      description: 'Three months of Spotify Premium',
      category: RewardCategory.ENTERTAINMENT,
      pointsCost: 2500,
      stockTotal: 200,
      stockAvailable: 200,
      expiryDays: 30,
      requiresApproval: true,
      maxRedemptionsPerUser: 1,
    },
    // Transport rewards
    {
      name: 'SNCFT Train Ticket',
      description: 'Free train ticket for intercity travel',
      category: RewardCategory.TRANSPORT,
      pointsCost: 800,
      stockTotal: 500,
      stockAvailable: 500,
      partnerId: partners.find(p => p.name.includes('SNCFT'))?._id,
      partnerName: 'SNCFT',
      expiryDays: 45,
      requiresApproval: false,
      maxRedemptionsPerUser: 10,
    },
    // Food rewards
    {
      name: 'Pizza Hut Medium Pizza',
      description: 'Free medium pizza at Pizza Hut',
      category: RewardCategory.FOOD,
      pointsCost: 1200,
      stockTotal: 200,
      stockAvailable: 200,
      expiryDays: 30,
      requiresApproval: false,
      maxRedemptionsPerUser: 3,
    },
    {
      name: 'Starbucks Coffee Voucher',
      description: 'Free drink at Starbucks (up to 12 TND)',
      category: RewardCategory.FOOD,
      pointsCost: 600,
      stockTotal: 300,
      stockAvailable: 300,
      expiryDays: 21,
      requiresApproval: false,
      maxRedemptionsPerUser: 5,
    },
  ];

  for (const rewardData of rewards) {
    const existingReward = await Reward.findOne({ name: rewardData.name });
    
    if (!existingReward) {
      const reward = new Reward({
        ...rewardData,
        isActive: true,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await reward.save();
      
      // Create codes for rewards that don't require approval
      if (!rewardData.requiresApproval && rewardData.stockTotal) {
        await createCodesForReward(reward._id, rewardData.stockTotal);
      }
      
      logger.info(`Created reward: ${rewardData.name}`);
    } else {
      logger.info(`Reward already exists: ${rewardData.name}`);
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

  const notifications = [
    {
      type: 'in_app',
      targetType: 'all',
      targetValue: 'all_users',
      title: 'Welcome to YallaCatch!',
      message: 'Start exploring and catching prizes around Tunisia. Good luck!',
      status: 'sent',
      sentAt: new Date(),
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

  const userCounts = {
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

  const prizeCounts = {
    minimal: 50,
    small: 200,
    medium: 1000,
    large: 5000,
  };

  const count = prizeCounts[dataSize] || 200;
  const prizes = [];
  const categories = Object.values(PrizeCategory);

  for (let i = 0; i < count; i++) {
    const city = tunisianCities[i % tunisianCities.length];
    const randomOffset = () => (Math.random() - 0.5) * 0.05; // ~2.5km radius
    
    prizes.push({
      name: `Prize ${i + 1}`,
      description: `Test prize number ${i + 1}`,
      category: categories[Math.floor(Math.random() * categories.length)],
      points: [10, 25, 50, 100, 250][Math.floor(Math.random() * 5)],
      location: {
        type: 'Point',
        coordinates: [
          city.lng + randomOffset(),
          city.lat + randomOffset(),
        ],
      },
      city: city.name,
      status: Math.random() > 0.1 ? 'active' : 'claimed',
      expiresAt: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    });
  }

  await Prize.insertMany(prizes);
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

// Run seeding if this file is executed directly
if (require.main === module) {
  seed();
}

export { seed };
