import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { buildApp } from '../../src/server';
import { User } from '../../src/models/User';
import { Prize } from '../../src/models/Prize';
import { Reward } from '../../src/models/Reward';
import { Code } from '../../src/models/Code';
import { generateKeyPair } from 'crypto';
import { promisify } from 'util';

const generateKeyPairAsync = promisify(generateKeyPair);

describe('Complete Game Flow E2E Tests', () => {
  let app: FastifyInstance;
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    // Setup test environment
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.NODE_ENV = 'test';

    // Generate test keys
    const { privateKey, publicKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    process.env.JWT_PRIVATE_KEY_BASE64 = Buffer.from(privateKey).toString('base64');
    process.env.JWT_PUBLIC_KEY_BASE64 = Buffer.from(publicKey).toString('base64');

    await mongoose.connect(mongoUri);
    app = await buildApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    await app.close();
  });

  beforeEach(async () => {
    // Clean all collections
    await User.deleteMany({});
    await Prize.deleteMany({});
    await Reward.deleteMany({});
    await Code.deleteMany({});
  });

  describe('Complete User Journey', () => {
    it('should complete full game flow: register -> find prizes -> claim -> redeem rewards', async () => {
      // Step 1: User Registration
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'player@example.com',
          password: 'password123',
          displayName: 'Test Player',
          deviceId: 'device123',
          platform: 'ios',
          fcmToken: 'fcm_token_123',
        },
      });

      expect(registerResponse.statusCode).toBe(201);
      const registerData = JSON.parse(registerResponse.body);
      expect(registerData.success).toBe(true);
      
      const authToken = registerData.data.accessToken;
      const userId = registerData.data.user.id;

      // Step 2: Update user location
      const updateLocationResponse = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/profile',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: {
          location: {
            latitude: 36.8065,
            longitude: 10.1815,
            city: 'tunis',
            accuracy: 10,
          },
        },
      });

      expect(updateLocationResponse.statusCode).toBe(200);

      // Step 3: Admin creates prizes
      // First make user an admin
      await User.findByIdAndUpdate(userId, { role: 'admin' });

      const createPrizeResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/prizes',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Coffee Shop Reward',
          description: 'Free coffee at local cafe',
          category: 'food',
          points: 50,
          latitude: 36.8070,
          longitude: 10.1820,
          city: 'tunis',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      expect(createPrizeResponse.statusCode).toBe(201);
      const prizeData = JSON.parse(createPrizeResponse.body);
      const prizeId = prizeData.data.id;

      // Step 4: User finds nearby prizes
      // Switch back to regular user
      await User.findByIdAndUpdate(userId, { role: 'user' });

      const nearbyPrizesResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/prizes/nearby?latitude=36.8065&longitude=10.1815&radius=1000',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(nearbyPrizesResponse.statusCode).toBe(200);
      const nearbyData = JSON.parse(nearbyPrizesResponse.body);
      expect(nearbyData.data.prizes).toHaveLength(1);
      expect(nearbyData.data.prizes[0].id).toBe(prizeId);

      // Step 5: User claims the prize
      const claimResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/claims',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: {
          prizeId,
          location: {
            latitude: 36.8070,
            longitude: 10.1820,
            accuracy: 5,
          },
          idempotencyKey: 'claim_test_123',
        },
      });

      expect(claimResponse.statusCode).toBe(201);
      const claimData = JSON.parse(claimResponse.body);
      expect(claimData.success).toBe(true);
      expect(claimData.data.pointsAwarded).toBe(50);

      // Step 6: Check user's updated points
      const profileResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/users/profile',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(profileResponse.statusCode).toBe(200);
      const profileData = JSON.parse(profileResponse.body);
      expect(profileData.data.points.total).toBe(50);
      expect(profileData.data.points.available).toBe(50);

      // Step 7: Admin creates rewards and codes
      await User.findByIdAndUpdate(userId, { role: 'admin' });

      const createRewardResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/rewards/admin',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Coffee Voucher',
          description: '20% discount on coffee',
          category: 'food',
          pointsCost: 40,
          stockQuantity: 100,
        },
      });

      expect(createRewardResponse.statusCode).toBe(201);
      const rewardData = JSON.parse(createRewardResponse.body);
      const rewardId = rewardData.data.id;

      // Create codes for the reward
      const codes = Array.from({ length: 10 }, (_, i) => ({
        rewardId,
        code: `COFFEE${i.toString().padStart(3, '0')}`,
        poolName: 'coffee_pool',
        status: 'available',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }));

      await Code.insertMany(codes);

      // Step 8: User views available rewards
      await User.findByIdAndUpdate(userId, { role: 'user' });

      const rewardsResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/rewards',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(rewardsResponse.statusCode).toBe(200);
      const rewardsListData = JSON.parse(rewardsResponse.body);
      expect(rewardsListData.data.rewards).toHaveLength(1);
      expect(rewardsListData.data.rewards[0].id).toBe(rewardId);

      // Step 9: User redeems a reward
      const redeemResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/rewards/${rewardId}/redeem`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: {
          idempotencyKey: 'redeem_test_123',
        },
      });

      expect(redeemResponse.statusCode).toBe(201);
      const redeemData = JSON.parse(redeemResponse.body);
      expect(redeemData.success).toBe(true);
      expect(redeemData.data.redemption.pointsSpent).toBe(40);
      expect(redeemData.data.redemption.code).toBeDefined();
      expect(redeemData.data.newBalance).toBe(10); // 50 - 40

      // Step 10: Check user's final state
      const finalProfileResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/users/profile',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(finalProfileResponse.statusCode).toBe(200);
      const finalProfileData = JSON.parse(finalProfileResponse.body);
      expect(finalProfileData.data.points.total).toBe(50);
      expect(finalProfileData.data.points.available).toBe(10);
      expect(finalProfileData.data.points.spent).toBe(40);
      expect(finalProfileData.data.stats.totalClaims).toBe(1);
      expect(finalProfileData.data.stats.totalRedemptions).toBe(1);

      // Step 11: Check user's redemption history
      const redemptionsResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/rewards/my-redemptions',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(redemptionsResponse.statusCode).toBe(200);
      const redemptionsData = JSON.parse(redemptionsResponse.body);
      expect(redemptionsData.data.redemptions).toHaveLength(1);
      expect(redemptionsData.data.redemptions[0].pointsSpent).toBe(40);
      expect(redemptionsData.data.redemptions[0].status).toBe('fulfilled');
    });

    it('should handle anti-cheat validation', async () => {
      // Register user
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'cheater@example.com',
          password: 'password123',
          displayName: 'Potential Cheater',
          deviceId: 'device456',
          platform: 'android',
          fcmToken: 'fcm_token_456',
        },
      });

      const registerData = JSON.parse(registerResponse.body);
      const authToken = registerData.data.accessToken;
      const userId = registerData.data.user.id;

      // Create a prize
      await User.findByIdAndUpdate(userId, { role: 'admin' });

      const createPrizeResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/prizes',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Test Prize',
          description: 'A test prize',
          category: 'food',
          points: 50,
          latitude: 36.8065,
          longitude: 10.1815,
          city: 'tunis',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      const prizeData = JSON.parse(createPrizeResponse.body);
      const prizeId = prizeData.data.id;

      // Switch back to user
      await User.findByIdAndUpdate(userId, { role: 'user' });

      // Try to claim from too far away (should fail anti-cheat)
      const claimResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/claims',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: {
          prizeId,
          location: {
            latitude: 36.9000, // Too far from prize location
            longitude: 10.3000,
            accuracy: 5,
          },
          idempotencyKey: 'cheat_attempt_123',
        },
      });

      expect(claimResponse.statusCode).toBe(400);
      const claimData = JSON.parse(claimResponse.body);
      expect(claimData.error).toBe('LOCATION_TOO_FAR');
    });

    it('should handle insufficient points for redemption', async () => {
      // Register user
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'poor@example.com',
          password: 'password123',
          displayName: 'Poor Player',
          deviceId: 'device789',
          platform: 'ios',
          fcmToken: 'fcm_token_789',
        },
      });

      const registerData = JSON.parse(registerResponse.body);
      const authToken = registerData.data.accessToken;
      const userId = registerData.data.user.id;

      // Create expensive reward
      await User.findByIdAndUpdate(userId, { role: 'admin' });

      const createRewardResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/rewards/admin',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: {
          name: 'Expensive Reward',
          description: 'Very expensive reward',
          category: 'shopping',
          pointsCost: 1000, // User has 0 points
          stockQuantity: 10,
        },
      });

      const rewardData = JSON.parse(createRewardResponse.body);
      const rewardId = rewardData.data.id;

      // Switch back to user
      await User.findByIdAndUpdate(userId, { role: 'user' });

      // Try to redeem without enough points
      const redeemResponse = await app.inject({
        method: 'POST',
        url: `/api/v1/rewards/${rewardId}/redeem`,
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: {
          idempotencyKey: 'poor_attempt_123',
        },
      });

      expect(redeemResponse.statusCode).toBe(400);
      const redeemData = JSON.parse(redeemResponse.body);
      expect(redeemData.error).toBe('INSUFFICIENT_POINTS');
    });
  });
});
