import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../src/app';
import { testUtils } from '../setup';
import { User } from '../../src/models/User';
import { Prize } from '../../src/models/Prize';
import { Reward } from '../../src/models/Reward';
import { PrizeCategory, RewardCategory } from '../../src/types';

describe('User Journey E2E Tests', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Complete User Journey: Guest to Registered User', () => {
    let guestTokens: any;
    let guestUser: any;
    let sessionId: string;

    it('Step 1: Should create guest account', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/guest-login',
        payload: {
          deviceId: 'journey-device-123',
          platform: 'ios',
          fcmToken: 'fcm-journey-123',
          location: {
            lat: 36.8065,
            lng: 10.1815,
            city: 'Tunis',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user.isGuest).toBe(true);
      expect(body.user.displayName).toMatch(/^Player_/);
      
      guestTokens = body.tokens;
      guestUser = body.user;
      sessionId = body.sessionId;
    });

    it('Step 2: Should explore nearby prizes as guest', async () => {
      // Create some test prizes first
      await testUtils.createTestPrize({
        name: 'Journey Prize 1',
        location: {
          type: 'Point',
          coordinates: [10.1820, 36.8070], // Close to user
        },
        points: 50,
        category: PrizeCategory.FOOD,
      });

      await testUtils.createTestPrize({
        name: 'Journey Prize 2',
        location: {
          type: 'Point',
          coordinates: [10.1825, 36.8075], // Also close
        },
        points: 75,
        category: PrizeCategory.SHOPPING,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/prizes/nearby?lat=36.8065&lng=10.1815&radius=1000',
        headers: {
          authorization: `Bearer ${guestTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.prizes.length).toBeGreaterThan(0);
      expect(body.data.prizes[0].distance).toBeDefined();
    });

    it('Step 3: Should claim a prize as guest', async () => {
      // Get the first prize
      const prizesResponse = await app.inject({
        method: 'GET',
        url: '/api/prizes/nearby?lat=36.8065&lng=10.1815&radius=1000',
        headers: {
          authorization: `Bearer ${guestTokens.accessToken}`,
        },
      });

      const prizesBody = JSON.parse(prizesResponse.body);
      const firstPrize = prizesBody.data.prizes[0];

      // Claim the prize
      const claimResponse = await app.inject({
        method: 'POST',
        url: `/api/prizes/${firstPrize._id}/claim`,
        headers: {
          authorization: `Bearer ${guestTokens.accessToken}`,
        },
        payload: {
          location: {
            lat: 36.8068,
            lng: 10.1818,
          },
          deviceSignals: {
            deviceId: 'journey-device-123',
            platform: 'ios',
            timestamp: new Date().toISOString(),
          },
          idempotencyKey: 'journey-claim-1',
        },
      });

      expect(claimResponse.statusCode).toBe(200);
      
      const claimBody = JSON.parse(claimResponse.body);
      expect(claimBody.success).toBe(true);
      expect(claimBody.data.pointsAwarded).toBe(firstPrize.points);
      expect(claimBody.data.newTotal).toBe(firstPrize.points); // Guest started with 0
    });

    it('Step 4: Should convert guest to registered user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'journey@example.com',
          password: 'JourneyPassword123!',
          displayName: 'Journey User',
          deviceId: 'journey-device-123', // Same device as guest
          platform: 'ios',
        },
      });

      expect(response.statusCode).toBe(201);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user.id).toBe(guestUser.id); // Should be same user
      expect(body.user.email).toBe('journey@example.com');
      expect(body.user.isGuest).toBe(false);
      expect(body.user.points.total).toBeGreaterThan(0); // Should retain points
      
      // Update tokens for next steps
      guestTokens = body.tokens;
    });

    it('Step 5: Should view profile after registration', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/users/profile',
        headers: {
          authorization: `Bearer ${guestTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe('journey@example.com');
      expect(body.data.user.isGuest).toBe(false);
      expect(body.data.user.points.total).toBeGreaterThan(0);
    });

    it('Step 6: Should update profile information', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/users/profile',
        headers: {
          authorization: `Bearer ${guestTokens.accessToken}`,
        },
        payload: {
          displayName: 'Updated Journey User',
          location: {
            lat: 34.7406,
            lng: 10.7603,
            city: 'Sfax',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.user.displayName).toBe('Updated Journey User');
      expect(body.data.user.location.city).toBe('Sfax');
    });

    it('Step 7: Should explore rewards catalog', async () => {
      // Create test rewards
      await testUtils.createTestReward({
        name: 'Journey Reward 1',
        pointsCost: 100,
        category: RewardCategory.SHOPPING,
        stockAvailable: 10,
      });

      await testUtils.createTestReward({
        name: 'Journey Reward 2',
        pointsCost: 200,
        category: RewardCategory.FOOD,
        stockAvailable: 5,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/rewards?limit=10&offset=0',
        headers: {
          authorization: `Bearer ${guestTokens.accessToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.rewards.length).toBeGreaterThan(0);
      expect(body.data.rewards[0].pointsCost).toBeDefined();
      expect(body.data.rewards[0].stockAvailable).toBeDefined();
    });

    it('Step 8: Should logout successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          authorization: `Bearer ${guestTokens.accessToken}`,
        },
        payload: {
          refreshToken: guestTokens.refreshToken,
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('Step 9: Should login again with registered credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'journey@example.com',
          password: 'JourneyPassword123!',
          deviceId: 'journey-device-456', // Different device
          platform: 'android',
        },
      });

      expect(response.statusCode).toBe(200);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.user.email).toBe('journey@example.com');
      expect(body.user.points.total).toBeGreaterThan(0); // Points preserved
    });
  });

  describe('Prize Hunting Journey', () => {
    let userTokens: any;
    let userId: string;
    let testPrizes: any[] = [];

    beforeEach(async () => {
      // Create a registered user
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'hunter@example.com',
          password: 'HunterPassword123!',
          displayName: 'Prize Hunter',
          deviceId: 'hunter-device-123',
          platform: 'ios',
        },
      });

      const registerBody = JSON.parse(registerResponse.body);
      userTokens = registerBody.tokens;
      userId = registerBody.user.id;

      // Create multiple prizes for hunting
      const prizeLocations = [
        { lat: 36.8070, lng: 10.1820, points: 50, category: PrizeCategory.FOOD },
        { lat: 36.8075, lng: 10.1825, points: 75, category: PrizeCategory.SHOPPING },
        { lat: 36.8080, lng: 10.1830, points: 100, category: PrizeCategory.ENTERTAINMENT },
        { lat: 36.8085, lng: 10.1835, points: 125, category: PrizeCategory.TRANSPORT },
      ];

      for (let i = 0; i < prizeLocations.length; i++) {
        const location = prizeLocations[i];
        const prize = await testUtils.createTestPrize({
          name: `Hunt Prize ${i + 1}`,
          location: {
            type: 'Point',
            coordinates: [location.lng, location.lat],
          },
          points: location.points,
          category: location.category,
        });
        testPrizes.push(prize);
      }
    });

    it('Should complete a prize hunting session', async () => {
      let totalPoints = 0;

      // Hunt each prize
      for (let i = 0; i < testPrizes.length; i++) {
        const prize = testPrizes[i];
        
        // Get prize details
        const prizeResponse = await app.inject({
          method: 'GET',
          url: `/api/prizes/${prize._id}`,
          headers: {
            authorization: `Bearer ${userTokens.accessToken}`,
          },
        });

        expect(prizeResponse.statusCode).toBe(200);

        // Claim the prize
        const claimResponse = await app.inject({
          method: 'POST',
          url: `/api/prizes/${prize._id}/claim`,
          headers: {
            authorization: `Bearer ${userTokens.accessToken}`,
          },
          payload: {
            location: {
              lat: prize.location.coordinates[1] + 0.0001, // Slightly offset but within range
              lng: prize.location.coordinates[0] + 0.0001,
            },
            deviceSignals: {
              deviceId: 'hunter-device-123',
              platform: 'ios',
              timestamp: new Date().toISOString(),
            },
            idempotencyKey: `hunt-claim-${i}`,
          },
        });

        expect(claimResponse.statusCode).toBe(200);
        
        const claimBody = JSON.parse(claimResponse.body);
        expect(claimBody.success).toBe(true);
        
        totalPoints += prize.points;
        expect(claimBody.data.newTotal).toBe(totalPoints);

        // Small delay between claims to avoid rate limiting
        await testUtils.wait(100);
      }

      // Verify final user state
      const profileResponse = await app.inject({
        method: 'GET',
        url: '/api/users/profile',
        headers: {
          authorization: `Bearer ${userTokens.accessToken}`,
        },
      });

      const profileBody = JSON.parse(profileResponse.body);
      expect(profileBody.data.user.points.total).toBe(totalPoints);
      expect(profileBody.data.user.points.available).toBe(totalPoints);
    });

    it('Should handle concurrent claim attempts gracefully', async () => {
      const prize = testPrizes[0];
      
      // Attempt to claim same prize multiple times concurrently
      const claimPromises = [];
      for (let i = 0; i < 3; i++) {
        claimPromises.push(
          app.inject({
            method: 'POST',
            url: `/api/prizes/${prize._id}/claim`,
            headers: {
              authorization: `Bearer ${userTokens.accessToken}`,
            },
            payload: {
              location: {
                lat: prize.location.coordinates[1] + 0.0001,
                lng: prize.location.coordinates[0] + 0.0001,
              },
              deviceSignals: {
                deviceId: 'hunter-device-123',
                platform: 'ios',
                timestamp: new Date().toISOString(),
              },
              idempotencyKey: `concurrent-claim-${i}`,
            },
          })
        );
      }

      const responses = await Promise.all(claimPromises);
      
      // Only one should succeed
      const successfulResponses = responses.filter(r => r.statusCode === 200);
      const failedResponses = responses.filter(r => r.statusCode !== 200);
      
      expect(successfulResponses.length).toBe(1);
      expect(failedResponses.length).toBe(2);
    });
  });

  describe('Reward Redemption Journey', () => {
    let userTokens: any;
    let testReward: any;

    beforeEach(async () => {
      // Create user with enough points
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'redeemer@example.com',
          password: 'RedeemerPassword123!',
          displayName: 'Reward Redeemer',
          deviceId: 'redeemer-device-123',
          platform: 'android',
        },
      });

      const registerBody = JSON.parse(registerResponse.body);
      userTokens = registerBody.tokens;

      // Give user points by updating database directly
      await User.findByIdAndUpdate(registerBody.user.id, {
        $set: {
          'points.total': 1000,
          'points.available': 1000,
        },
      });

      // Create test reward
      testReward = await testUtils.createTestReward({
        name: 'Redemption Test Reward',
        pointsCost: 500,
        category: RewardCategory.SHOPPING,
        stockAvailable: 5,
        requiresApproval: false,
      });
    });

    it('Should complete reward redemption flow', async () => {
      // Step 1: Browse rewards
      const browseResponse = await app.inject({
        method: 'GET',
        url: '/api/rewards',
        headers: {
          authorization: `Bearer ${userTokens.accessToken}`,
        },
      });

      expect(browseResponse.statusCode).toBe(200);
      
      const browseBody = JSON.parse(browseResponse.body);
      expect(browseBody.data.rewards.length).toBeGreaterThan(0);

      // Step 2: Get reward details
      const detailsResponse = await app.inject({
        method: 'GET',
        url: `/api/rewards/${testReward._id}`,
        headers: {
          authorization: `Bearer ${userTokens.accessToken}`,
        },
      });

      expect(detailsResponse.statusCode).toBe(200);

      // Step 3: Redeem reward
      const redeemResponse = await app.inject({
        method: 'POST',
        url: `/api/rewards/${testReward._id}/redeem`,
        headers: {
          authorization: `Bearer ${userTokens.accessToken}`,
        },
        payload: {
          idempotencyKey: 'redemption-test-123',
        },
      });

      expect(redeemResponse.statusCode).toBe(200);
      
      const redeemBody = JSON.parse(redeemResponse.body);
      expect(redeemBody.success).toBe(true);
      expect(redeemBody.data.pointsDeducted).toBe(500);
      expect(redeemBody.data.newAvailable).toBe(500); // 1000 - 500

      // Step 4: Check redemption history
      const historyResponse = await app.inject({
        method: 'GET',
        url: '/api/users/redemptions',
        headers: {
          authorization: `Bearer ${userTokens.accessToken}`,
        },
      });

      expect(historyResponse.statusCode).toBe(200);
      
      const historyBody = JSON.parse(historyResponse.body);
      expect(historyBody.data.redemptions.length).toBe(1);
      expect(historyBody.data.redemptions[0].rewardId).toBe(testReward._id.toString());
    });
  });

  describe('Error Recovery Scenarios', () => {
    let userTokens: any;

    beforeEach(async () => {
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'recovery@example.com',
          password: 'RecoveryPassword123!',
          displayName: 'Recovery User',
          deviceId: 'recovery-device-123',
          platform: 'ios',
        },
      });

      const registerBody = JSON.parse(registerResponse.body);
      userTokens = registerBody.tokens;
    });

    it('Should handle network interruption during claim', async () => {
      const prize = await testUtils.createTestPrize({
        name: 'Recovery Prize',
        location: {
          type: 'Point',
          coordinates: [10.1820, 36.8070],
        },
        points: 100,
      });

      // Simulate network interruption by making same request twice
      const claimPayload = {
        location: {
          lat: 36.8068,
          lng: 10.1818,
        },
        deviceSignals: {
          deviceId: 'recovery-device-123',
          platform: 'ios',
          timestamp: new Date().toISOString(),
        },
        idempotencyKey: 'recovery-claim-123',
      };

      // First request (simulates interrupted request)
      const firstResponse = await app.inject({
        method: 'POST',
        url: `/api/prizes/${prize._id}/claim`,
        headers: {
          authorization: `Bearer ${userTokens.accessToken}`,
        },
        payload: claimPayload,
      });

      expect(firstResponse.statusCode).toBe(200);

      // Second request (simulates retry after network recovery)
      const secondResponse = await app.inject({
        method: 'POST',
        url: `/api/prizes/${prize._id}/claim`,
        headers: {
          authorization: `Bearer ${userTokens.accessToken}`,
        },
        payload: claimPayload,
      });

      // Should return same result due to idempotency
      expect(secondResponse.statusCode).toBe(200);
      expect(firstResponse.body).toBe(secondResponse.body);
    });

    it('Should handle token refresh gracefully', async () => {
      // Use refresh token to get new access token
      const refreshResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: {
          refreshToken: userTokens.refreshToken,
        },
      });

      expect(refreshResponse.statusCode).toBe(200);
      
      const refreshBody = JSON.parse(refreshResponse.body);
      const newAccessToken = refreshBody.tokens.accessToken;

      // Use new token for API call
      const profileResponse = await app.inject({
        method: 'GET',
        url: '/api/users/profile',
        headers: {
          authorization: `Bearer ${newAccessToken}`,
        },
      });

      expect(profileResponse.statusCode).toBe(200);

      // Old token should still work for a short period (grace period)
      const oldTokenResponse = await app.inject({
        method: 'GET',
        url: '/api/users/profile',
        headers: {
          authorization: `Bearer ${userTokens.accessToken}`,
        },
      });

      // This might be 200 or 401 depending on grace period implementation
      expect([200, 401]).toContain(oldTokenResponse.statusCode);
    });
  });

  describe('Performance and Load Scenarios', () => {
    it('Should handle multiple concurrent users', async () => {
      const userPromises = [];
      
      // Create multiple users concurrently
      for (let i = 0; i < 5; i++) {
        userPromises.push(
          app.inject({
            method: 'POST',
            url: '/api/auth/register',
            payload: {
              email: `load-user-${i}@example.com`,
              password: 'LoadPassword123!',
              displayName: `Load User ${i}`,
              deviceId: `load-device-${i}`,
              platform: 'ios',
            },
          })
        );
      }

      const responses = await Promise.all(userPromises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(201);
      });
    });

    it('Should handle rapid API calls from single user', async () => {
      // Register user
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          email: 'rapid@example.com',
          password: 'RapidPassword123!',
          displayName: 'Rapid User',
          deviceId: 'rapid-device-123',
          platform: 'ios',
        },
      });

      const registerBody = JSON.parse(registerResponse.body);
      const token = registerBody.tokens.accessToken;

      // Make rapid API calls
      const apiPromises = [];
      for (let i = 0; i < 10; i++) {
        apiPromises.push(
          app.inject({
            method: 'GET',
            url: '/api/users/profile',
            headers: {
              authorization: `Bearer ${token}`,
            },
          })
        );
      }

      const apiResponses = await Promise.all(apiPromises);
      
      // Most should succeed, some might be rate limited
      const successfulResponses = apiResponses.filter(r => r.statusCode === 200);
      const rateLimitedResponses = apiResponses.filter(r => r.statusCode === 429);
      
      expect(successfulResponses.length).toBeGreaterThan(0);
      // Rate limiting might kick in
      expect(successfulResponses.length + rateLimitedResponses.length).toBe(10);
    });
  });
});
