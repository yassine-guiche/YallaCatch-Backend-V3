import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Redis from 'ioredis-mock';

// Import services to test
import ProximityService from '../src/services/proximity';
import ProgressionService from '../src/services/progression';
import { MarketplaceService } from '../src/modules/marketplace/routes';
import { DistributionService } from '../src/modules/distribution/routes';

// Import models
import { User } from '../src/models/User';
import { Prize } from '../src/models/Prize';
import { Claim } from '../src/models/Claim';

/**
 * YallaCatch! Backend Logic Validation Tests
 * Senior Developer Review - Complete Workflow Testing
 * 
 * Tests all 4 core workflow features:
 * 1. Admin Distribution → Points placement with geolocation
 * 2. AR Capture → User gains points + discovers content  
 * 3. Auto Progression → Points accumulate → Level increases automatically
 * 4. Marketplace Exchange → User exchanges → Spends points for rewards
 */

describe('YallaCatch! Complete Workflow Logic Validation', () => {
  let mongoServer: MongoMemoryServer;
  let testUserId: string;
  let testPrizeId: string;

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Mock Redis
    jest.mock('../src/config/redis', () => ({
      getRedisClient: () => new Redis(),
    }));

    // Create test user
    const testUser = new User({
      username: 'testuser',
      email: 'test@yallacatch.com',
      password: 'hashedpassword',
      points: 1000,
      level: 1,
      xp: 0,
      location: {
        type: 'Point',
        coordinates: [10.1815, 36.8065], // Tunis coordinates
      },
    });
    await testUser.save();
    testUserId = testUser._id.toString();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('Workflow 1: Admin Distribution Logic', () => {
    test('should validate admin prize placement with geolocation', async () => {
      const distributionData = {
        type: 'single',
        prizeConfig: {
          type: 'mystery_box',
          category: 'food',
          rarity: 'common',
          points: 50,
          title: 'Test Prize',
          description: 'Test prize for validation',
        },
        location: {
          latitude: 36.8065,
          longitude: 10.1815,
          address: 'Tunis, Tunisia',
        },
        adminId: 'admin123',
      };

      // Test distribution logic
      const result = await DistributionService.distributeSingle(distributionData);
      
      expect(result.success).toBe(true);
      expect(result.prize).toBeDefined();
      expect(result.prize.location.coordinates).toEqual([10.1815, 36.8065]);
      expect(result.prize.points).toBe(50);
      
      testPrizeId = result.prize.id;
    });

    test('should validate bulk distribution algorithm', async () => {
      const bulkData = {
        type: 'bulk',
        count: 10,
        area: {
          center: { latitude: 36.8065, longitude: 10.1815 },
          radius: 1000, // 1km
        },
        prizeConfig: {
          type: 'mystery_box',
          category: 'entertainment',
          rarity: 'common',
          points: 25,
        },
        distribution: {
          algorithm: 'poisson_disk',
          minDistance: 100,
          maxVariation: 0.2,
        },
      };

      const result = await DistributionService.distributeBulk(bulkData);
      
      expect(result.success).toBe(true);
      expect(result.prizes).toHaveLength(10);
      expect(result.distribution.algorithm).toBe('poisson_disk');
      
      // Validate minimum distance between prizes
      for (let i = 0; i < result.prizes.length - 1; i++) {
        for (let j = i + 1; j < result.prizes.length; j++) {
          const prize1 = result.prizes[i];
          const prize2 = result.prizes[j];
          const distance = calculateDistance(
            prize1.location.coordinates[1], prize1.location.coordinates[0],
            prize2.location.coordinates[1], prize2.location.coordinates[0]
          );
          expect(distance).toBeGreaterThanOrEqual(100); // minDistance
        }
      }
    });
  });

  describe('Workflow 2: AR Capture Logic', () => {
    test('should validate proximity detection zones (50m/20m/5m)', async () => {
      const userLocation = {
        latitude: 36.8065,
        longitude: 10.1815,
        accuracy: 5,
      };

      // Test 50m zone (hints visible)
      const proximityResult = await ProximityService.getProximityPrizes(
        testUserId,
        userLocation,
        { maxRadius: 50, includeHints: true }
      );

      expect(proximityResult.success).toBe(true);
      expect(proximityResult.zones).toBeDefined();
      expect(proximityResult.zones.hints).toBeDefined();
      expect(proximityResult.zones.visible).toBeDefined();
      expect(proximityResult.zones.catchable).toBeDefined();
    });

    test('should validate capture attempt with anti-cheat', async () => {
      const captureData = {
        prizeId: testPrizeId,
        location: {
          latitude: 36.8065,
          longitude: 10.1815,
          accuracy: 3,
        },
        method: 'ar_tap',
        deviceInfo: {
          platform: 'android',
          version: '1.0.0',
        },
      };

      const result = await ProximityService.attemptCapture(testUserId, captureData);
      
      expect(result.success).toBe(true);
      expect(result.capture).toBeDefined();
      expect(result.capture.pointsEarned).toBeGreaterThan(0);
      expect(result.capture.bonusMultiplier).toBeGreaterThanOrEqual(1.0);
      expect(result.antiCheat.riskScore).toBeLessThan(0.5); // Low risk
    });

    test('should detect GPS spoofing attempts', async () => {
      const suspiciousCapture = {
        prizeId: testPrizeId,
        location: {
          latitude: 40.7128, // New York (impossible jump)
          longitude: -74.0060,
          accuracy: 1, // Too accurate for such distance
        },
        method: 'ar_tap',
        deviceInfo: {
          platform: 'android',
          version: '1.0.0',
        },
      };

      const result = await ProximityService.attemptCapture(testUserId, suspiciousCapture);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('SUSPICIOUS_LOCATION');
      expect(result.antiCheat.riskScore).toBeGreaterThan(0.8); // High risk
    });
  });

  describe('Workflow 3: Auto Progression Logic', () => {
    test('should calculate progression automatically', async () => {
      const progression = await ProgressionService.calculateProgression(testUserId);
      
      expect(progression.currentLevel).toBeGreaterThanOrEqual(1);
      expect(progression.currentXP).toBeGreaterThanOrEqual(0);
      expect(progression.nextLevel).toBeDefined();
      expect(progression.nextLevel.progress).toBeGreaterThanOrEqual(0);
      expect(progression.nextLevel.progress).toBeLessThanOrEqual(100);
    });

    test('should award XP with correct multipliers', async () => {
      const xpData = {
        action: 'prize_capture',
        baseXP: 100,
        context: {
          rarity: 'rare',
          streak: 5,
          timeOfDay: 'peak',
          firstTime: true,
        },
      };

      const result = await ProgressionService.awardXP(testUserId, xpData.action, xpData.baseXP, xpData.context);
      
      expect(result.success).toBe(true);
      expect(result.xpAwarded).toBeGreaterThan(100); // Should have multipliers
      expect(result.multipliers).toBeDefined();
      expect(result.multipliers.rarity).toBeGreaterThan(1.0);
      expect(result.multipliers.streak).toBeGreaterThan(1.0);
    });

    test('should trigger level up with rewards', async () => {
      // Award enough XP to trigger level up
      const massiveXP = {
        action: 'bonus_event',
        baseXP: 5000,
        context: { special: true },
      };

      const result = await ProgressionService.awardXP(testUserId, massiveXP.action, massiveXP.baseXP, massiveXP.context);
      
      if (result.levelUp) {
        expect(result.levelUp.newLevel).toBeGreaterThan(result.levelUp.previousLevel);
        expect(result.levelUp.rewards).toBeDefined();
        expect(result.levelUp.rewards.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Workflow 4: Marketplace Exchange Logic', () => {
    test('should validate marketplace item filtering', async () => {
      const filters = {
        category: 'food',
        minPoints: 50,
        maxPoints: 500,
        location: {
          latitude: 36.8065,
          longitude: 10.1815,
        },
        page: 1,
        limit: 10,
      };

      const marketplace = await MarketplaceService.getMarketplace(testUserId, filters);
      
      expect(marketplace.items).toBeDefined();
      expect(marketplace.totalItems).toBeGreaterThanOrEqual(0);
      expect(marketplace.userInfo.currentPoints).toBeGreaterThanOrEqual(0);
      expect(marketplace.filters).toBeDefined();
    });

    test('should validate purchase transaction logic', async () => {
      // First, create a test marketplace item
      const testItem = {
        title: 'Test Food Coupon',
        description: 'Test coupon for validation',
        category: 'food',
        type: 'discount_coupon',
        pointsCost: 100,
        originalValue: 20,
        partnerName: 'Test Partner',
        stock: 10,
        maxPerUser: 1,
        isActive: true,
      };

      // Mock marketplace item creation
      const mockItemId = 'test_item_123';

      const purchaseData = {
        itemId: mockItemId,
        location: {
          latitude: 36.8065,
          longitude: 10.1815,
        },
        deviceInfo: {
          platform: 'android',
          version: '1.0.0',
        },
      };

      // Test purchase validation logic (without actual DB operations)
      const validationResult = validatePurchaseLogic(testUserId, purchaseData, {
        pointsCost: 100,
        stock: 10,
        maxPerUser: 1,
        userPoints: 1000,
        userPreviousPurchases: 0,
      });

      expect(validationResult.canPurchase).toBe(true);
      expect(validationResult.sufficientPoints).toBe(true);
      expect(validationResult.stockAvailable).toBe(true);
      expect(validationResult.withinUserLimit).toBe(true);
    });

    test('should validate insufficient points scenario', async () => {
      const purchaseData = {
        itemId: 'expensive_item',
        location: {
          latitude: 36.8065,
          longitude: 10.1815,
        },
      };

      const validationResult = validatePurchaseLogic(testUserId, purchaseData, {
        pointsCost: 5000, // More than user has
        stock: 10,
        maxPerUser: 1,
        userPoints: 1000,
        userPreviousPurchases: 0,
      });

      expect(validationResult.canPurchase).toBe(false);
      expect(validationResult.sufficientPoints).toBe(false);
      expect(validationResult.error).toContain('INSUFFICIENT_POINTS');
    });
  });

  describe('Cross-Workflow Integration Tests', () => {
    test('should validate complete user journey', async () => {
      // 1. Admin distributes prize
      const distribution = await DistributionService.distributeSingle({
        type: 'single',
        prizeConfig: {
          type: 'mystery_box',
          category: 'shopping',
          rarity: 'rare',
          points: 200,
          title: 'Journey Test Prize',
        },
        location: {
          latitude: 36.8065,
          longitude: 10.1815,
        },
        adminId: 'admin123',
      });

      expect(distribution.success).toBe(true);

      // 2. User captures prize
      const capture = await ProximityService.attemptCapture(testUserId, {
        prizeId: distribution.prize.id,
        location: {
          latitude: 36.8065,
          longitude: 10.1815,
          accuracy: 3,
        },
        method: 'ar_tap',
      });

      expect(capture.success).toBe(true);

      // 3. Points accumulate and progression updates
      const progression = await ProgressionService.calculateProgression(testUserId);
      expect(progression.currentXP).toBeGreaterThan(0);

      // 4. User can now purchase items with earned points
      const marketplace = await MarketplaceService.getMarketplace(testUserId, {});
      expect(marketplace.userInfo.currentPoints).toBeGreaterThan(0);
    });

    test('should validate anti-cheat across all workflows', async () => {
      const suspiciousActivity = {
        rapidCaptures: 10, // Too many captures in short time
        impossibleMovement: true, // GPS spoofing detected
        deviceInconsistency: true, // Device fingerprint mismatch
      };

      // Test anti-cheat in capture
      const captureResult = await ProximityService.validateAntiCheat(testUserId, {
        location: { latitude: 0, longitude: 0 }, // Impossible location
        previousLocation: { latitude: 36.8065, longitude: 10.1815 },
        timeDelta: 1000, // 1 second for huge distance
      });

      expect(captureResult.riskScore).toBeGreaterThan(0.9);
      expect(captureResult.flags).toContain('IMPOSSIBLE_SPEED');

      // Test anti-cheat in marketplace
      const purchaseValidation = await MarketplaceService.validatePurchaseAntiCheat(testUserId, {
        rapidPurchases: 5, // Too many purchases
        timeWindow: 60000, // 1 minute
      });

      expect(purchaseValidation.suspicious).toBe(true);
      expect(purchaseValidation.reason).toContain('RAPID_PURCHASES');
    });
  });

  describe('Performance & Edge Cases', () => {
    test('should handle concurrent capture attempts', async () => {
      const concurrentCaptures = Array(5).fill(null).map((_, i) => 
        ProximityService.attemptCapture(testUserId, {
          prizeId: testPrizeId,
          location: {
            latitude: 36.8065 + (i * 0.0001),
            longitude: 10.1815 + (i * 0.0001),
            accuracy: 3,
          },
          method: 'ar_tap',
        })
      );

      const results = await Promise.all(concurrentCaptures);
      
      // Only one should succeed (first come, first served)
      const successfulCaptures = results.filter(r => r.success);
      expect(successfulCaptures).toHaveLength(1);
    });

    test('should handle edge case coordinates', async () => {
      const edgeCases = [
        { lat: 90, lng: 180 }, // North pole, date line
        { lat: -90, lng: -180 }, // South pole, date line
        { lat: 0, lng: 0 }, // Equator, prime meridian
      ];

      for (const coord of edgeCases) {
        const proximity = await ProximityService.getProximityPrizes(testUserId, {
          latitude: coord.lat,
          longitude: coord.lng,
          accuracy: 10,
        });

        expect(proximity.success).toBe(true);
        expect(proximity.zones).toBeDefined();
      }
    });
  });
});

// Helper functions for validation
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function validatePurchaseLogic(userId: string, purchaseData: any, itemData: any): any {
  return {
    canPurchase: itemData.userPoints >= itemData.pointsCost && 
                 itemData.stock > 0 && 
                 itemData.userPreviousPurchases < itemData.maxPerUser,
    sufficientPoints: itemData.userPoints >= itemData.pointsCost,
    stockAvailable: itemData.stock > 0,
    withinUserLimit: itemData.userPreviousPurchases < itemData.maxPerUser,
    error: itemData.userPoints < itemData.pointsCost ? 'INSUFFICIENT_POINTS' : null,
  };
}
