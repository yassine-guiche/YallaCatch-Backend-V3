import { MongoClient, Db } from 'mongodb';
import { logger } from '../src/lib/logger';

export async function up(db: Db): Promise<void> {
  logger.info('Running migration 003: Complete indexes and initial data');

  try {
    // Create comprehensive indexes for all collections

    // Users collection indexes
    await db.collection('users').createIndexes([
      { key: { email: 1 }, unique: true },
      { key: { phoneNumber: 1 }, sparse: true },
      { key: { role: 1 } },
      { key: { isActive: 1 } },
      { key: { isBanned: 1 } },
      { key: { createdAt: -1 } },
      { key: { lastActive: -1 } },
      { key: { 'profile.city': 1 } },
      { key: { 'profile.governorate': 1 } },
      { key: { 'gamification.level': -1 } },
      { key: { 'gamification.totalPoints': -1 } },
      { key: { 'gamification.totalClaims': -1 } },
      { key: { displayName: 'text', email: 'text' } },
    ]);

    // Prizes collection indexes
    await db.collection('prizes').createIndexes([
      { key: { location: '2dsphere' } },
      { key: { isActive: 1 } },
      { key: { type: 1 } },
      { key: { rarity: 1 } },
      { key: { city: 1 } },
      { key: { governorate: 1 } },
      { key: { createdAt: -1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      { key: { 'schedule.isActive': 1 } },
      { key: { 'schedule.startTime': 1, 'schedule.endTime': 1 } },
      { key: { partnerId: 1 } },
      { key: { createdBy: 1 } },
    ]);

    // Claims collection indexes
    await db.collection('claims').createIndexes([
      { key: { userId: 1, createdAt: -1 } },
      { key: { prizeId: 1 } },
      { key: { status: 1 } },
      { key: { createdAt: -1 } },
      { key: { location: '2dsphere' } },
      { key: { city: 1 } },
      { key: { governorate: 1 } },
      { key: { userId: 1, status: 1 } },
      { key: { prizeId: 1, status: 1 } },
      { key: { 'verification.verifiedAt': -1 } },
    ]);

    // Rewards collection indexes
    await db.collection('rewards').createIndexes([
      { key: { category: 1 } },
      { key: { isActive: 1 } },
      { key: { pointsRequired: 1 } },
      { key: { createdAt: -1 } },
      { key: { partnerId: 1 } },
      { key: { 'availability.startDate': 1, 'availability.endDate': 1 } },
      { key: { title: 'text', description: 'text' } },
    ]);

    // Redemptions collection indexes
    await db.collection('redemptions').createIndexes([
      { key: { userId: 1, createdAt: -1 } },
      { key: { rewardId: 1 } },
      { key: { status: 1 } },
      { key: { createdAt: -1 } },
      { key: { qrCode: 1 }, unique: true, sparse: true },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      { key: { partnerId: 1 } },
    ]);

    // Partners collection indexes
    await db.collection('partners').createIndexes([
      { key: { name: 1 } },
      { key: { categories: 1 } },
      { key: { isActive: 1 } },
      { key: { 'locations.coordinates': '2dsphere' } },
      { key: { 'locations.city': 1 } },
      { key: { createdAt: -1 } },
      { key: { 'contactPerson.email': 1 } },
    ]);

    // Sessions collection indexes
    await db.collection('sessions').createIndexes([
      { key: { sessionId: 1 }, unique: true },
      { key: { userId: 1, startTime: -1 } },
      { key: { status: 1, startTime: -1 } },
      { key: { platform: 1, startTime: -1 } },
      { key: { 'antiCheat.flaggedForReview': 1 } },
      { key: { 'initialLocation.coordinates': '2dsphere' } },
      { key: { deviceId: 1 } },
      { key: { startTime: -1 } },
    ]);

    // Notifications collection indexes
    await db.collection('notifications').createIndexes([
      { key: { userId: 1, createdAt: -1 } },
      { key: { type: 1 } },
      { key: { isRead: 1 } },
      { key: { createdAt: -1 } },
      { key: { scheduledFor: 1 }, sparse: true },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0, sparse: true },
    ]);

    // Analytics collection indexes
    await db.collection('analytics').createIndexes([
      { key: { date: -1 } },
      { key: { type: 1, date: -1 } },
      { key: { userId: 1, date: -1 } },
      { key: { city: 1, date: -1 } },
      { key: { governorate: 1, date: -1 } },
    ]);

    // Settings collection indexes
    await db.collection('settings').createIndexes([
      { key: { environment: 1 }, unique: true },
      { key: { version: 1 } },
    ]);

    // Audit logs collection indexes
    await db.collection('auditlogs').createIndexes([
      { key: { userId: 1, timestamp: -1 } },
      { key: { category: 1, timestamp: -1 } },
      { key: { action: 1, resource: 1, timestamp: -1 } },
      { key: { severity: 1, timestamp: -1 } },
      { key: { success: 1, timestamp: -1 } },
      { key: { ipAddress: 1, timestamp: -1 } },
      { key: { 'location.coordinates': '2dsphere' } },
      { key: { description: 'text', errorMessage: 'text', action: 'text', resource: 'text' } },
      { key: { timestamp: -1 } },
      { 
        key: { createdAt: 1 }, 
        expireAfterSeconds: 0,
        partialFilterExpression: { retentionPeriod: { $exists: true } }
      },
    ]);

    // Codes collection indexes (for QR codes, verification codes, etc.)
    await db.collection('codes').createIndexes([
      { key: { code: 1 }, unique: true },
      { key: { type: 1 } },
      { key: { userId: 1 } },
      { key: { isUsed: 1 } },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0 },
      { key: { createdAt: -1 } },
    ]);

    // Distributions collection indexes (for prize distributions)
    await db.collection('distributions').createIndexes([
      { key: { city: 1 } },
      { key: { governorate: 1 } },
      { key: { isActive: 1 } },
      { key: { scheduledFor: 1 } },
      { key: { createdAt: -1 } },
      { key: { createdBy: 1 } },
    ]);

    logger.info('All indexes created successfully');

    // Insert initial system settings
    const defaultSettings = {
      environment: 'production',
      version: '1.0.0',
      game: {
        maxDailyClaims: 50,
        claimCooldownMs: 300000, // 5 minutes
        maxSpeedMs: 15, // 54 km/h
        prizeDetectionRadiusM: 50,
        pointsPerClaim: {
          common: 10,
          rare: 25,
          epic: 50,
          legendary: 100,
        },
        powerUps: {
          enabled: true,
          radarBoostDurationMs: 600000, // 10 minutes
          doublePointsDurationMs: 1800000, // 30 minutes
          speedBoostDurationMs: 900000, // 15 minutes
        },
        antiCheat: {
          enabled: true,
          maxSpeedThreshold: 50, // m/s
          teleportThreshold: 1000, // meters
          mockLocationDetection: true,
          riskScoreThreshold: 70,
        },
      },
      rewards: {
        categories: ['food', 'shopping', 'entertainment', 'travel', 'technology', 'health', 'education', 'services'],
        commissionRates: {
          food: 10,
          shopping: 15,
          entertainment: 12,
          travel: 8,
          technology: 20,
          health: 15,
          education: 10,
          services: 12,
        },
        redemptionCooldownMs: 86400000, // 24 hours
        maxRedemptionsPerDay: 5,
        qrCodeExpirationMs: 1800000, // 30 minutes
        autoApprovalThreshold: 100,
      },
      notifications: {
        pushNotifications: {
          enabled: true,
          batchSize: 1000,
          retryAttempts: 3,
          retryDelayMs: 5000,
        },
        emailNotifications: {
          enabled: true,
          fromAddress: 'noreply@yallacatch.tn',
          replyToAddress: 'support@yallacatch.tn',
          templates: {},
        },
        smsNotifications: {
          enabled: false,
          provider: 'twilio',
          maxLength: 160,
        },
      },
      security: {
        jwt: {
          accessTokenExpirationMs: 3600000, // 1 hour
          refreshTokenExpirationMs: 2592000000, // 30 days
          issuer: 'yallacatch.tn',
          audience: 'yallacatch-app',
        },
        rateLimit: {
          windowMs: 900000, // 15 minutes
          maxRequests: 100,
          skipSuccessfulRequests: true,
        },
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: false,
          maxAge: 90, // days
        },
        session: {
          maxConcurrentSessions: 3,
          sessionTimeoutMs: 86400000, // 24 hours
          extendOnActivity: true,
        },
      },
      business: {
        currency: 'TND',
        timezone: 'Africa/Tunis',
        supportedLanguages: ['fr', 'ar', 'en'],
        defaultLanguage: 'fr',
        businessHours: {
          monday: { open: '09:00', close: '18:00', closed: false },
          tuesday: { open: '09:00', close: '18:00', closed: false },
          wednesday: { open: '09:00', close: '18:00', closed: false },
          thursday: { open: '09:00', close: '18:00', closed: false },
          friday: { open: '09:00', close: '18:00', closed: false },
          saturday: { open: '10:00', close: '16:00', closed: false },
          sunday: { open: '00:00', close: '00:00', closed: true },
        },
        contactInfo: {
          supportEmail: 'support@yallacatch.tn',
          supportPhone: '+216 XX XXX XXX',
          businessAddress: 'Tunis, Tunisia',
        },
        legal: {
          termsOfServiceUrl: 'https://yallacatch.tn/terms',
          privacyPolicyUrl: 'https://yallacatch.tn/privacy',
          cookiePolicyUrl: 'https://yallacatch.tn/cookies',
        },
      },
      integrations: {
        maps: {
          provider: 'google',
          defaultZoom: 15,
          maxZoom: 18,
          minZoom: 10,
        },
        analytics: {
          enabled: true,
          provider: 'google-analytics',
          customEvents: true,
        },
        payment: {
          enabled: false,
          providers: ['flouci'],
          currency: 'TND',
          testMode: true,
        },
        social: {},
      },
      maintenance: {
        maintenanceMode: false,
        maintenanceMessage: 'System is under maintenance. Please try again later.',
        allowedIPs: [],
        bypassRoles: ['admin', 'developer'],
      },
      features: {
        gameMode: {
          enabled: true,
          rolloutPercentage: 100,
        },
        arMode: {
          enabled: true,
          rolloutPercentage: 80,
        },
        socialFeatures: {
          enabled: false,
          rolloutPercentage: 0,
        },
        powerUps: {
          enabled: true,
          rolloutPercentage: 100,
        },
        achievements: {
          enabled: true,
          rolloutPercentage: 100,
        },
      },
      custom: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection('settings').updateOne(
      { environment: 'production' },
      { $setOnInsert: defaultSettings },
      { upsert: true }
    );

    // Insert default admin user
    const adminUser = {
      email: 'admin@yallacatch.tn',
      password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj9.nElwlxoa', // 'admin123' hashed
      displayName: 'System Administrator',
      role: 'admin',
      isActive: true,
      isBanned: false,
      isEmailVerified: true,
      profile: {
        firstName: 'System',
        lastName: 'Administrator',
        city: 'Tunis',
        governorate: 'Tunis',
        country: 'Tunisia',
        language: 'fr',
        timezone: 'Africa/Tunis',
      },
      gamification: {
        level: 1,
        totalPoints: 0,
        totalClaims: 0,
        achievements: [],
        streaks: {
          current: 0,
          longest: 0,
        },
      },
      preferences: {
        notifications: {
          email: true,
          push: true,
          sms: false,
        },
        privacy: {
          profileVisible: false,
          locationSharing: false,
        },
        game: {
          soundEnabled: true,
          vibrationEnabled: true,
          arModeEnabled: true,
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      lastActive: new Date(),
    };

    await db.collection('users').updateOne(
      { email: 'admin@yallacatch.tn' },
      { $setOnInsert: adminUser },
      { upsert: true }
    );

    // Insert sample partner data
    const samplePartners = [
      {
        name: 'McDonald\'s Tunisia',
        description: 'Fast food restaurant chain',
        logo: 'https://example.com/mcdonalds-logo.png',
        website: 'https://mcdonalds.tn',
        phone: '+216 71 123 456',
        email: 'contact@mcdonalds.tn',
        categories: ['food'],
        locations: [
          {
            name: 'McDonald\'s Tunis Centre',
            address: 'Avenue Habib Bourguiba, Tunis',
            city: 'Tunis',
            coordinates: [10.1815, 36.8065],
            phone: '+216 71 123 456',
            isActive: true,
            features: ['parking', 'wifi', 'accessibility'],
          },
          {
            name: 'McDonald\'s Sousse',
            address: 'Avenue Tahar Sfar, Sousse',
            city: 'Sousse',
            coordinates: [10.6411, 35.8256],
            phone: '+216 73 123 456',
            isActive: true,
            features: ['parking', 'wifi'],
          },
        ],
        isActive: true,
        contractStartDate: new Date(),
        contractEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        commissionRate: 10,
        paymentTerms: 'net_30',
        contactPerson: {
          name: 'Ahmed Ben Ali',
          email: 'ahmed@mcdonalds.tn',
          phone: '+216 71 123 456',
          position: 'Marketing Manager',
        },
        businessHours: {
          timezone: 'Africa/Tunis',
          defaultHours: {
            open: '07:00',
            close: '23:00',
          },
        },
        socialMedia: {
          facebook: 'https://facebook.com/mcdonalds.tn',
          instagram: 'https://instagram.com/mcdonalds_tn',
        },
        metrics: {
          totalRedemptions: 0,
          totalRevenue: 0,
          averageRating: 0,
        },
        settings: {
          autoApproveRedemptions: true,
          maxDailyRedemptions: 100,
          notificationPreferences: {
            email: true,
            sms: false,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Carrefour Tunisia',
        description: 'Hypermarket and retail chain',
        logo: 'https://example.com/carrefour-logo.png',
        website: 'https://carrefour.tn',
        phone: '+216 71 789 012',
        email: 'contact@carrefour.tn',
        categories: ['shopping'],
        locations: [
          {
            name: 'Carrefour Lac 2',
            address: 'Centre Commercial Lac 2, Tunis',
            city: 'Tunis',
            coordinates: [10.2277, 36.8626],
            phone: '+216 71 789 012',
            isActive: true,
            features: ['parking', 'accessibility'],
          },
        ],
        isActive: true,
        contractStartDate: new Date(),
        contractEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        commissionRate: 15,
        paymentTerms: 'net_30',
        contactPerson: {
          name: 'Fatma Trabelsi',
          email: 'fatma@carrefour.tn',
          phone: '+216 71 789 012',
          position: 'Partnership Manager',
        },
        businessHours: {
          timezone: 'Africa/Tunis',
          defaultHours: {
            open: '08:00',
            close: '22:00',
          },
        },
        metrics: {
          totalRedemptions: 0,
          totalRevenue: 0,
          averageRating: 0,
        },
        settings: {
          autoApproveRedemptions: true,
          maxDailyRedemptions: 200,
          notificationPreferences: {
            email: true,
            sms: false,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    for (const partner of samplePartners) {
      await db.collection('partners').updateOne(
        { email: partner.email },
        { $setOnInsert: partner },
        { upsert: true }
      );
    }

    // Insert sample reward data
    const sampleRewards = [
      {
        title: 'Big Mac Menu',
        description: 'Get a free Big Mac menu at McDonald\'s',
        pointsRequired: 500,
        category: 'food',
        imageUrl: 'https://example.com/bigmac.jpg',
        partnerId: null, // Will be updated after partner insertion
        isActive: true,
        availability: {
          startDate: new Date(),
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
          maxRedemptions: 1000,
          currentRedemptions: 0,
        },
        terms: [
          'Valid for 30 days from redemption',
          'Cannot be combined with other offers',
          'Valid at participating locations only',
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        title: '10% Discount at Carrefour',
        description: 'Get 10% discount on your next purchase at Carrefour',
        pointsRequired: 300,
        category: 'shopping',
        imageUrl: 'https://example.com/carrefour-discount.jpg',
        partnerId: null,
        isActive: true,
        availability: {
          startDate: new Date(),
          endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
          maxRedemptions: 500,
          currentRedemptions: 0,
        },
        terms: [
          'Minimum purchase of 50 TND required',
          'Valid for 15 days from redemption',
          'Cannot be combined with other promotions',
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    for (const reward of sampleRewards) {
      await db.collection('rewards').updateOne(
        { title: reward.title },
        { $setOnInsert: reward },
        { upsert: true }
      );
    }

    // Create initial analytics data structure
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const initialAnalytics = {
      date: today,
      type: 'daily_summary',
      data: {
        users: {
          total: 1, // admin user
          new: 1,
          active: 1,
        },
        prizes: {
          total: 0,
          claimed: 0,
          active: 0,
        },
        rewards: {
          total: 2, // sample rewards
          redeemed: 0,
        },
        partners: {
          total: 2, // sample partners
          active: 2,
        },
        sessions: {
          total: 0,
          completed: 0,
          averageDuration: 0,
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection('analytics').updateOne(
      { date: today, type: 'daily_summary' },
      { $setOnInsert: initialAnalytics },
      { upsert: true }
    );

    logger.info('Initial data inserted successfully');

    // Create geospatial indexes for location-based queries
    await db.collection('prizes').createIndex({ location: '2dsphere' });
    await db.collection('claims').createIndex({ location: '2dsphere' });
    await db.collection('partners').createIndex({ 'locations.coordinates': '2dsphere' });
    await db.collection('sessions').createIndex({ 'initialLocation.coordinates': '2dsphere' });
    await db.collection('auditlogs').createIndex({ 'location.coordinates': '2dsphere' });

    logger.info('Geospatial indexes created successfully');

    // Validate all collections exist and have proper structure
    const collections = await db.listCollections().toArray();
    const expectedCollections = [
      'users', 'prizes', 'claims', 'rewards', 'redemptions', 
      'partners', 'sessions', 'notifications', 'analytics', 
      'settings', 'auditlogs', 'codes', 'distributions'
    ];

    for (const expectedCollection of expectedCollections) {
      const exists = collections.some(col => col.name === expectedCollection);
      if (!exists) {
        // Create empty collection to ensure it exists
        await db.createCollection(expectedCollection);
        logger.info(`Created missing collection: ${expectedCollection}`);
      }
    }

    logger.info('Migration 003 completed successfully');

  } catch (error) {
    logger.error('Migration 003 failed:', error);
    throw error;
  }
}

export async function down(db: Db): Promise<void> {
  logger.info('Rolling back migration 003: Complete indexes and initial data');

  try {
    // Drop all indexes (except _id)
    const collections = ['users', 'prizes', 'claims', 'rewards', 'redemptions', 
                        'partners', 'sessions', 'notifications', 'analytics', 
                        'settings', 'auditlogs', 'codes', 'distributions'];

    for (const collectionName of collections) {
      try {
        await db.collection(collectionName).dropIndexes();
        logger.info(`Dropped indexes for collection: ${collectionName}`);
      } catch (error) {
        logger.warn(`Failed to drop indexes for ${collectionName}:`, error.message);
      }
    }

    // Remove initial data
    await db.collection('settings').deleteOne({ environment: 'production' });
    await db.collection('users').deleteOne({ email: 'admin@yallacatch.tn' });
    await db.collection('partners').deleteMany({ 
      email: { $in: ['contact@mcdonalds.tn', 'contact@carrefour.tn'] }
    });
    await db.collection('rewards').deleteMany({ 
      title: { $in: ['Big Mac Menu', '10% Discount at Carrefour'] }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await db.collection('analytics').deleteOne({ 
      date: today, 
      type: 'daily_summary' 
    });

    logger.info('Migration 003 rollback completed successfully');

  } catch (error) {
    logger.error('Migration 003 rollback failed:', error);
    throw error;
  }
}
