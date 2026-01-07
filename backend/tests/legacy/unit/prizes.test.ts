import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { Prize } from '../../src/models/Prize';
import { User } from '../../src/models/User';
import { PrizeService } from '../../src/modules/prizes';
import { testUtils } from '../setup';
import { PrizeCategory, UserRole, Platform } from '../../src/types';

describe('PrizeService', () => {
  let testUser: any;

  beforeEach(async () => {
    // Create a test user for prize operations
    testUser = await testUtils.createTestUser({
      email: 'testuser@example.com',
      location: {
        type: 'Point',
        coordinates: [10.1815, 36.8065], // Tunis center
        city: 'Tunis',
      },
    });
  });

  describe('getNearbyPrizes', () => {
    beforeEach(async () => {
      // Create test prizes at various locations
      const prizes = [
        {
          name: 'Close Prize 1',
          location: { type: 'Point', coordinates: [10.1820, 36.8070] }, // ~50m away
          points: 50,
          category: PrizeCategory.FOOD,
        },
        {
          name: 'Close Prize 2', 
          location: { type: 'Point', coordinates: [10.1810, 36.8060] }, // ~50m away
          points: 25,
          category: PrizeCategory.SHOPPING,
        },
        {
          name: 'Medium Prize',
          location: { type: 'Point', coordinates: [10.1900, 36.8100] }, // ~800m away
          points: 100,
          category: PrizeCategory.ENTERTAINMENT,
        },
        {
          name: 'Far Prize',
          location: { type: 'Point', coordinates: [10.2500, 36.8500] }, // ~5km away
          points: 200,
          category: PrizeCategory.TRANSPORT,
        },
        {
          name: 'Expired Prize',
          location: { type: 'Point', coordinates: [10.1825, 36.8075] },
          points: 75,
          category: PrizeCategory.FOOD,
          status: 'expired',
        },
        {
          name: 'Claimed Prize',
          location: { type: 'Point', coordinates: [10.1825, 36.8075] },
          points: 75,
          category: PrizeCategory.FOOD,
          status: 'claimed',
        },
      ];

      for (const prizeData of prizes) {
        await testUtils.createTestPrize(prizeData);
      }
    });

    it('should return nearby active prizes within radius', async () => {
      const result = await PrizeService.getNearbyPrizes({
        lat: 36.8065,
        lng: 10.1815,
        radius: 1000, // 1km
        limit: 10,
        offset: 0,
      });

      expect(result.prizes).toHaveLength(3); // Close Prize 1, Close Prize 2, Medium Prize
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(false);

      // Verify all returned prizes are active
      result.prizes.forEach(prize => {
        expect(prize.status).toBe('active');
      });

      // Verify distances are calculated
      result.prizes.forEach(prize => {
        expect(prize.distance).toBeDefined();
        expect(prize.distance).toBeLessThanOrEqual(1000);
      });

      // Verify sorted by distance (closest first)
      for (let i = 1; i < result.prizes.length; i++) {
        expect(result.prizes[i].distance).toBeGreaterThanOrEqual(result.prizes[i-1].distance);
      }
    });

    it('should respect radius parameter', async () => {
      const result = await PrizeService.getNearbyPrizes({
        lat: 36.8065,
        lng: 10.1815,
        radius: 100, // 100m - should only get close prizes
        limit: 10,
        offset: 0,
      });

      expect(result.prizes).toHaveLength(2); // Only Close Prize 1 and Close Prize 2
      result.prizes.forEach(prize => {
        expect(prize.distance).toBeLessThanOrEqual(100);
      });
    });

    it('should respect limit and offset parameters', async () => {
      const result1 = await PrizeService.getNearbyPrizes({
        lat: 36.8065,
        lng: 10.1815,
        radius: 1000,
        limit: 2,
        offset: 0,
      });

      expect(result1.prizes).toHaveLength(2);
      expect(result1.hasMore).toBe(true);

      const result2 = await PrizeService.getNearbyPrizes({
        lat: 36.8065,
        lng: 10.1815,
        radius: 1000,
        limit: 2,
        offset: 2,
      });

      expect(result2.prizes).toHaveLength(1);
      expect(result2.hasMore).toBe(false);

      // Verify no overlap between pages
      const firstPageIds = result1.prizes.map(p => p._id.toString());
      const secondPageIds = result2.prizes.map(p => p._id.toString());
      expect(firstPageIds).not.toEqual(expect.arrayContaining(secondPageIds));
    });

    it('should filter by category', async () => {
      const result = await PrizeService.getNearbyPrizes({
        lat: 36.8065,
        lng: 10.1815,
        radius: 1000,
        category: PrizeCategory.FOOD,
        limit: 10,
        offset: 0,
      });

      expect(result.prizes).toHaveLength(1); // Only Close Prize 1
      expect(result.prizes[0].category).toBe(PrizeCategory.FOOD);
    });

    it('should filter by city', async () => {
      // Create a prize in a different city
      await testUtils.createTestPrize({
        name: 'Sfax Prize',
        location: { type: 'Point', coordinates: [10.7603, 34.7406] }, // Sfax
        city: 'Sfax',
        points: 100,
      });

      const result = await PrizeService.getNearbyPrizes({
        lat: 36.8065,
        lng: 10.1815,
        radius: 10000, // Large radius
        city: 'Tunis',
        limit: 10,
        offset: 0,
      });

      // Should not include Sfax prize
      result.prizes.forEach(prize => {
        expect(prize.city).toBe('Tunis');
      });
    });

    it('should validate coordinates', async () => {
      await expect(PrizeService.getNearbyPrizes({
        lat: 91, // Invalid latitude
        lng: 10.1815,
        radius: 1000,
        limit: 10,
        offset: 0,
      })).rejects.toThrow();

      await expect(PrizeService.getNearbyPrizes({
        lat: 36.8065,
        lng: 181, // Invalid longitude
        radius: 1000,
        limit: 10,
        offset: 0,
      })).rejects.toThrow();
    });

    it('should validate radius limits', async () => {
      await expect(PrizeService.getNearbyPrizes({
        lat: 36.8065,
        lng: 10.1815,
        radius: 50000, // Too large
        limit: 10,
        offset: 0,
      })).rejects.toThrow();

      await expect(PrizeService.getNearbyPrizes({
        lat: 36.8065,
        lng: 10.1815,
        radius: 0, // Too small
        limit: 10,
        offset: 0,
      })).rejects.toThrow();
    });
  });

  describe('getPrizeById', () => {
    let testPrize: any;

    beforeEach(async () => {
      testPrize = await testUtils.createTestPrize({
        name: 'Test Prize',
        description: 'A test prize for testing',
        points: 100,
      });
    });

    it('should return prize by valid ID', async () => {
      const result = await PrizeService.getPrizeById(testPrize._id.toString());

      expect(result).toBeDefined();
      expect(result._id.toString()).toBe(testPrize._id.toString());
      expect(result.name).toBe('Test Prize');
      expect(result.points).toBe(100);
    });

    it('should return null for non-existent ID', async () => {
      const fakeId = '507f1f77bcf86cd799439011'; // Valid ObjectId format
      const result = await PrizeService.getPrizeById(fakeId);

      expect(result).toBeNull();
    });

    it('should throw error for invalid ID format', async () => {
      await expect(PrizeService.getPrizeById('invalid-id'))
        .rejects
        .toThrow();
    });

    it('should not return inactive prizes', async () => {
      // Update prize to be inactive
      await Prize.findByIdAndUpdate(testPrize._id, { status: 'expired' });

      const result = await PrizeService.getPrizeById(testPrize._id.toString());
      expect(result).toBeNull();
    });
  });

  describe('claimPrize', () => {
    let testPrize: any;

    beforeEach(async () => {
      testPrize = await testUtils.createTestPrize({
        name: 'Claimable Prize',
        location: {
          type: 'Point',
          coordinates: [10.1820, 36.8070], // Close to test user
        },
        points: 100,
      });
    });

    it('should successfully claim a prize within range', async () => {
      const claimData = {
        userId: testUser._id.toString(),
        prizeId: testPrize._id.toString(),
        location: {
          lat: 36.8068,
          lng: 10.1818, // Within claim range
        },
        deviceSignals: {
          deviceId: 'test-device-123',
          platform: Platform.IOS,
          timestamp: new Date(),
        },
        idempotencyKey: 'test-claim-123',
      };

      const result = await PrizeService.claimPrize(claimData);

      expect(result.success).toBe(true);
      expect(result.pointsAwarded).toBe(100);
      expect(result.newTotal).toBe(testUser.points.total + 100);

      // Verify prize status updated
      const updatedPrize = await Prize.findById(testPrize._id);
      expect(updatedPrize?.status).toBe('claimed');
      expect(updatedPrize?.claimedBy?.toString()).toBe(testUser._id.toString());

      // Verify user points updated
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser?.points.total).toBe(testUser.points.total + 100);
      expect(updatedUser?.points.available).toBe(testUser.points.available + 100);
    });

    it('should reject claim if user is too far from prize', async () => {
      const claimData = {
        userId: testUser._id.toString(),
        prizeId: testPrize._id.toString(),
        location: {
          lat: 36.8200, // Too far from prize
          lng: 10.2000,
        },
        deviceSignals: {
          deviceId: 'test-device-123',
          platform: Platform.IOS,
          timestamp: new Date(),
        },
        idempotencyKey: 'test-claim-124',
      };

      await expect(PrizeService.claimPrize(claimData))
        .rejects
        .toThrow('OUT_OF_RANGE');
    });

    it('should reject claim if prize is already claimed', async () => {
      // First claim
      const claimData1 = {
        userId: testUser._id.toString(),
        prizeId: testPrize._id.toString(),
        location: {
          lat: 36.8068,
          lng: 10.1818,
        },
        deviceSignals: {
          deviceId: 'test-device-123',
          platform: Platform.IOS,
          timestamp: new Date(),
        },
        idempotencyKey: 'test-claim-125',
      };

      await PrizeService.claimPrize(claimData1);

      // Second claim attempt
      const claimData2 = {
        ...claimData1,
        idempotencyKey: 'test-claim-126',
      };

      await expect(PrizeService.claimPrize(claimData2))
        .rejects
        .toThrow('ALREADY_CLAIMED');
    });

    it('should reject claim if prize is expired', async () => {
      // Update prize to be expired
      await Prize.findByIdAndUpdate(testPrize._id, {
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });

      const claimData = {
        userId: testUser._id.toString(),
        prizeId: testPrize._id.toString(),
        location: {
          lat: 36.8068,
          lng: 10.1818,
        },
        deviceSignals: {
          deviceId: 'test-device-123',
          platform: Platform.IOS,
          timestamp: new Date(),
        },
        idempotencyKey: 'test-claim-127',
      };

      await expect(PrizeService.claimPrize(claimData))
        .rejects
        .toThrow('EXPIRED');
    });

    it('should handle idempotency correctly', async () => {
      const claimData = {
        userId: testUser._id.toString(),
        prizeId: testPrize._id.toString(),
        location: {
          lat: 36.8068,
          lng: 10.1818,
        },
        deviceSignals: {
          deviceId: 'test-device-123',
          platform: Platform.IOS,
          timestamp: new Date(),
        },
        idempotencyKey: 'test-claim-idempotent',
      };

      // First claim
      const result1 = await PrizeService.claimPrize(claimData);
      
      // Second claim with same idempotency key
      const result2 = await PrizeService.claimPrize(claimData);

      expect(result1).toEqual(result2);
      
      // Verify prize was only claimed once
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser?.points.total).toBe(testUser.points.total + 100); // Not doubled
    });

    it('should detect speed violations', async () => {
      // Create a claim with previous location data indicating high speed
      const claimData = {
        userId: testUser._id.toString(),
        prizeId: testPrize._id.toString(),
        location: {
          lat: 36.8068,
          lng: 10.1818,
        },
        deviceSignals: {
          deviceId: 'test-device-123',
          platform: Platform.IOS,
          timestamp: new Date(),
        },
        previousLocation: {
          lat: 36.7000, // Very far from current location
          lng: 10.0000,
          timestamp: new Date(Date.now() - 60000), // 1 minute ago
        },
        idempotencyKey: 'test-claim-speed',
      };

      await expect(PrizeService.claimPrize(claimData))
        .rejects
        .toThrow('SPEED_VIOLATION');
    });

    it('should enforce cooldown periods', async () => {
      // Create another user who recently claimed a prize
      const otherUser = await testUtils.createTestUser({
        email: 'other@example.com',
        lastClaimAt: new Date(Date.now() - 30000), // 30 seconds ago
      });

      const claimData = {
        userId: otherUser._id.toString(),
        prizeId: testPrize._id.toString(),
        location: {
          lat: 36.8068,
          lng: 10.1818,
        },
        deviceSignals: {
          deviceId: 'test-device-456',
          platform: Platform.ANDROID,
          timestamp: new Date(),
        },
        idempotencyKey: 'test-claim-cooldown',
      };

      await expect(PrizeService.claimPrize(claimData))
        .rejects
        .toThrow('COOLDOWN_ACTIVE');
    });
  });

  describe('createPrize', () => {
    it('should create a new prize with valid data', async () => {
      const prizeData = {
        name: 'New Test Prize',
        description: 'A newly created test prize',
        category: PrizeCategory.SHOPPING,
        points: 150,
        location: {
          lat: 36.8100,
          lng: 10.1900,
        },
        city: 'Tunis',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        createdBy: testUser._id.toString(),
      };

      const result = await PrizeService.createPrize(prizeData);

      expect(result).toBeDefined();
      expect(result.name).toBe(prizeData.name);
      expect(result.category).toBe(prizeData.category);
      expect(result.points).toBe(prizeData.points);
      expect(result.status).toBe('active');
      expect(result.location.coordinates).toEqual([prizeData.location.lng, prizeData.location.lat]);

      // Verify saved to database
      const savedPrize = await Prize.findById(result._id);
      expect(savedPrize).toBeTruthy();
    });

    it('should validate required fields', async () => {
      const invalidData = {
        // Missing name
        description: 'A test prize',
        category: PrizeCategory.FOOD,
        points: 50,
      };

      await expect(PrizeService.createPrize(invalidData as any))
        .rejects
        .toThrow();
    });

    it('should validate location coordinates', async () => {
      const invalidData = {
        name: 'Invalid Prize',
        category: PrizeCategory.FOOD,
        points: 50,
        location: {
          lat: 91, // Invalid latitude
          lng: 10.1815,
        },
      };

      await expect(PrizeService.createPrize(invalidData))
        .rejects
        .toThrow();
    });

    it('should validate points are positive', async () => {
      const invalidData = {
        name: 'Invalid Prize',
        category: PrizeCategory.FOOD,
        points: -10, // Negative points
        location: {
          lat: 36.8065,
          lng: 10.1815,
        },
      };

      await expect(PrizeService.createPrize(invalidData))
        .rejects
        .toThrow();
    });

    it('should enforce minimum distance between prizes', async () => {
      // Create first prize
      await testUtils.createTestPrize({
        name: 'First Prize',
        location: {
          type: 'Point',
          coordinates: [10.1815, 36.8065],
        },
      });

      // Try to create second prize too close
      const tooCloseData = {
        name: 'Too Close Prize',
        category: PrizeCategory.FOOD,
        points: 50,
        location: {
          lat: 36.8066, // Very close to first prize
          lng: 10.1816,
        },
      };

      await expect(PrizeService.createPrize(tooCloseData))
        .rejects
        .toThrow('TOO_CLOSE_TO_EXISTING_PRIZE');
    });
  });

  describe('updatePrize', () => {
    let testPrize: any;

    beforeEach(async () => {
      testPrize = await testUtils.createTestPrize({
        name: 'Updatable Prize',
        points: 100,
      });
    });

    it('should update prize with valid data', async () => {
      const updateData = {
        name: 'Updated Prize Name',
        points: 200,
        description: 'Updated description',
      };

      const result = await PrizeService.updatePrize(testPrize._id.toString(), updateData);

      expect(result).toBeDefined();
      expect(result.name).toBe(updateData.name);
      expect(result.points).toBe(updateData.points);
      expect(result.description).toBe(updateData.description);

      // Verify in database
      const updatedPrize = await Prize.findById(testPrize._id);
      expect(updatedPrize?.name).toBe(updateData.name);
    });

    it('should not allow updating claimed prizes', async () => {
      // Mark prize as claimed
      await Prize.findByIdAndUpdate(testPrize._id, { 
        status: 'claimed',
        claimedBy: testUser._id,
      });

      const updateData = {
        name: 'Should Not Update',
      };

      await expect(PrizeService.updatePrize(testPrize._id.toString(), updateData))
        .rejects
        .toThrow('CANNOT_UPDATE_CLAIMED_PRIZE');
    });

    it('should validate update data', async () => {
      const invalidData = {
        points: -50, // Invalid negative points
      };

      await expect(PrizeService.updatePrize(testPrize._id.toString(), invalidData))
        .rejects
        .toThrow();
    });
  });

  describe('deletePrize', () => {
    let testPrize: any;

    beforeEach(async () => {
      testPrize = await testUtils.createTestPrize({
        name: 'Deletable Prize',
      });
    });

    it('should soft delete unclaimed prize', async () => {
      const result = await PrizeService.deletePrize(testPrize._id.toString());

      expect(result.success).toBe(true);

      // Verify soft delete
      const deletedPrize = await Prize.findById(testPrize._id);
      expect(deletedPrize?.status).toBe('disabled');
      expect(deletedPrize?.deletedAt).toBeDefined();
    });

    it('should not allow deleting claimed prizes', async () => {
      // Mark prize as claimed
      await Prize.findByIdAndUpdate(testPrize._id, {
        status: 'claimed',
        claimedBy: testUser._id,
      });

      await expect(PrizeService.deletePrize(testPrize._id.toString()))
        .rejects
        .toThrow('CANNOT_DELETE_CLAIMED_PRIZE');
    });
  });
});
