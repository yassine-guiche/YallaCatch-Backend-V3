import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../src/app';
import { testUtils } from '../setup';
import { User } from '../../src/models/User';
import { Prize } from '../../src/models/Prize';
import { UserRole, Platform, PrizeCategory } from '../../src/types';

describe('API Integration Tests', () => {
  let app: FastifyInstance;
  let testUser: any;
  let testToken: string;
  let adminUser: any;
  let adminToken: string;

  beforeAll(async () => {
    // Create Fastify app
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Create test user
    testUser = await testUtils.createTestUser({
      email: 'testuser@example.com',
      displayName: 'Test User',
      points: {
        total: 1000,
        available: 1000,
        spent: 0,
      },
    });

    testToken = await testUtils.generateTestToken({
      sub: testUser._id.toString(),
      role: 'player',
    });

    // Create admin user
    adminUser = await testUtils.createTestUser({
      email: 'admin@example.com',
      displayName: 'Admin User',
      role: UserRole.ADMIN,
    });

    adminToken = await testUtils.generateTestToken({
      sub: adminUser._id.toString(),
      role: 'admin',
    });
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/auth/guest-login', () => {
      it('should create guest user successfully', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/guest-login',
          payload: {
            deviceId: 'test-device-123',
            platform: 'ios',
            fcmToken: 'fcm-token-123',
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
        expect(body.user).toBeDefined();
        expect(body.user.isGuest).toBe(true);
        expect(body.tokens.accessToken).toBeDefined();
        expect(body.tokens.refreshToken).toBeDefined();
        expect(body.sessionId).toBeDefined();
      });

      it('should validate required fields', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/guest-login',
          payload: {
            // Missing deviceId
            platform: 'ios',
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should validate location coordinates', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/guest-login',
          payload: {
            deviceId: 'test-device-123',
            platform: 'ios',
            location: {
              lat: 91, // Invalid latitude
              lng: 10.1815,
              city: 'Tunis',
            },
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('POST /api/auth/register', () => {
      it('should register new user successfully', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: {
            email: 'newuser@example.com',
            password: 'StrongPassword123!',
            displayName: 'New User',
            deviceId: 'new-device-123',
            platform: 'android',
          },
        });

        expect(response.statusCode).toBe(201);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.user.email).toBe('newuser@example.com');
        expect(body.user.isGuest).toBe(false);
        expect(body.tokens.accessToken).toBeDefined();
      });

      it('should reject duplicate email', async () => {
        // Create first user
        await app.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: {
            email: 'duplicate@example.com',
            password: 'StrongPassword123!',
            displayName: 'First User',
            deviceId: 'device-1',
            platform: 'ios',
          },
        });

        // Try to create second user with same email
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: {
            email: 'duplicate@example.com',
            password: 'StrongPassword123!',
            displayName: 'Second User',
            deviceId: 'device-2',
            platform: 'android',
          },
        });

        expect(response.statusCode).toBe(409);
        
        const body = JSON.parse(response.body);
        expect(body.error).toBe('EMAIL_ALREADY_EXISTS');
      });

      it('should validate password strength', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: {
            email: 'weak@example.com',
            password: '123', // Too weak
            displayName: 'Weak User',
            deviceId: 'device-weak',
            platform: 'ios',
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('POST /api/auth/login', () => {
      beforeEach(async () => {
        // Register a user for login tests
        await app.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: {
            email: 'logintest@example.com',
            password: 'LoginPassword123!',
            displayName: 'Login Test User',
            deviceId: 'login-device',
            platform: 'ios',
          },
        });
      });

      it('should login with valid credentials', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: {
            email: 'logintest@example.com',
            password: 'LoginPassword123!',
            deviceId: 'login-device-2',
            platform: 'android',
          },
        });

        expect(response.statusCode).toBe(200);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.user.email).toBe('logintest@example.com');
        expect(body.tokens.accessToken).toBeDefined();
      });

      it('should reject invalid credentials', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: {
            email: 'logintest@example.com',
            password: 'WrongPassword',
            deviceId: 'login-device-2',
            platform: 'android',
          },
        });

        expect(response.statusCode).toBe(401);
        
        const body = JSON.parse(response.body);
        expect(body.error).toBe('INVALID_CREDENTIALS');
      });
    });

    describe('POST /api/auth/refresh', () => {
      let refreshToken: string;

      beforeEach(async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/register',
          payload: {
            email: 'refresh@example.com',
            password: 'RefreshPassword123!',
            displayName: 'Refresh User',
            deviceId: 'refresh-device',
            platform: 'ios',
          },
        });

        const body = JSON.parse(response.body);
        refreshToken = body.tokens.refreshToken;
      });

      it('should refresh tokens with valid refresh token', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          payload: {
            refreshToken,
          },
        });

        expect(response.statusCode).toBe(200);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.tokens.accessToken).toBeDefined();
        expect(body.tokens.refreshToken).toBeDefined();
        expect(body.tokens.refreshToken).not.toBe(refreshToken); // Should be rotated
      });

      it('should reject invalid refresh token', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          payload: {
            refreshToken: 'invalid-token',
          },
        });

        expect(response.statusCode).toBe(401);
      });
    });
  });

  describe('Prize Endpoints', () => {
    let testPrize: any;

    beforeEach(async () => {
      // Create test prizes
      testPrize = await testUtils.createTestPrize({
        name: 'API Test Prize',
        location: {
          type: 'Point',
          coordinates: [10.1820, 36.8070], // Close to test user
        },
        points: 100,
        category: PrizeCategory.FOOD,
      });

      // Create some more prizes for testing
      await testUtils.createTestPrize({
        name: 'Far Prize',
        location: {
          type: 'Point',
          coordinates: [10.2500, 36.8500], // Far from test user
        },
        points: 200,
        category: PrizeCategory.SHOPPING,
      });
    });

    describe('GET /api/prizes/nearby', () => {
      it('should return nearby prizes for authenticated user', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/prizes/nearby?lat=36.8065&lng=10.1815&radius=1000',
          headers: {
            authorization: `Bearer ${testToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.prizes).toBeDefined();
        expect(Array.isArray(body.data.prizes)).toBe(true);
        expect(body.data.total).toBeDefined();
        expect(body.data.hasMore).toBeDefined();

        // Verify prize data structure
        if (body.data.prizes.length > 0) {
          const prize = body.data.prizes[0];
          expect(prize._id).toBeDefined();
          expect(prize.name).toBeDefined();
          expect(prize.points).toBeDefined();
          expect(prize.distance).toBeDefined();
          expect(prize.location).toBeDefined();
        }
      });

      it('should require authentication', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/prizes/nearby?lat=36.8065&lng=10.1815&radius=1000',
        });

        expect(response.statusCode).toBe(401);
      });

      it('should validate query parameters', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/prizes/nearby', // Missing required parameters
          headers: {
            authorization: `Bearer ${testToken}`,
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should respect radius parameter', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/prizes/nearby?lat=36.8065&lng=10.1815&radius=100', // Small radius
          headers: {
            authorization: `Bearer ${testToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        
        const body = JSON.parse(response.body);
        body.data.prizes.forEach((prize: any) => {
          expect(prize.distance).toBeLessThanOrEqual(100);
        });
      });

      it('should filter by category', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/prizes/nearby?lat=36.8065&lng=10.1815&radius=1000&category=${PrizeCategory.FOOD}`,
          headers: {
            authorization: `Bearer ${testToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        
        const body = JSON.parse(response.body);
        body.data.prizes.forEach((prize: any) => {
          expect(prize.category).toBe(PrizeCategory.FOOD);
        });
      });
    });

    describe('GET /api/prizes/:id', () => {
      it('should return prize by ID for authenticated user', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/prizes/${testPrize._id}`,
          headers: {
            authorization: `Bearer ${testToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.prize._id).toBe(testPrize._id.toString());
        expect(body.data.prize.name).toBe('API Test Prize');
      });

      it('should return 404 for non-existent prize', async () => {
        const fakeId = '507f1f77bcf86cd799439011';
        const response = await app.inject({
          method: 'GET',
          url: `/api/prizes/${fakeId}`,
          headers: {
            authorization: `Bearer ${testToken}`,
          },
        });

        expect(response.statusCode).toBe(404);
      });

      it('should require authentication', async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/prizes/${testPrize._id}`,
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('POST /api/prizes/:id/claim', () => {
      it('should claim prize successfully', async () => {
        const response = await app.inject({
          method: 'POST',
          url: `/api/prizes/${testPrize._id}/claim`,
          headers: {
            authorization: `Bearer ${testToken}`,
          },
          payload: {
            location: {
              lat: 36.8068,
              lng: 10.1818, // Close to prize location
            },
            deviceSignals: {
              deviceId: 'test-device-123',
              platform: 'ios',
              timestamp: new Date().toISOString(),
            },
            idempotencyKey: 'test-claim-api-123',
          },
        });

        expect(response.statusCode).toBe(200);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.pointsAwarded).toBe(100);
        expect(body.data.newTotal).toBe(1100); // Original 1000 + 100

        // Verify prize is now claimed
        const updatedPrize = await Prize.findById(testPrize._id);
        expect(updatedPrize?.status).toBe('claimed');
      });

      it('should reject claim if too far from prize', async () => {
        const response = await app.inject({
          method: 'POST',
          url: `/api/prizes/${testPrize._id}/claim`,
          headers: {
            authorization: `Bearer ${testToken}`,
          },
          payload: {
            location: {
              lat: 36.9000, // Too far from prize
              lng: 10.3000,
            },
            deviceSignals: {
              deviceId: 'test-device-123',
              platform: 'ios',
              timestamp: new Date().toISOString(),
            },
            idempotencyKey: 'test-claim-api-124',
          },
        });

        expect(response.statusCode).toBe(400);
        
        const body = JSON.parse(response.body);
        expect(body.error).toBe('OUT_OF_RANGE');
      });

      it('should handle idempotency correctly', async () => {
        const claimPayload = {
          location: {
            lat: 36.8068,
            lng: 10.1818,
          },
          deviceSignals: {
            deviceId: 'test-device-123',
            platform: 'ios',
            timestamp: new Date().toISOString(),
          },
          idempotencyKey: 'test-claim-idempotent-api',
        };

        // First claim
        const response1 = await app.inject({
          method: 'POST',
          url: `/api/prizes/${testPrize._id}/claim`,
          headers: {
            authorization: `Bearer ${testToken}`,
          },
          payload: claimPayload,
        });

        expect(response1.statusCode).toBe(200);

        // Second claim with same idempotency key
        const response2 = await app.inject({
          method: 'POST',
          url: `/api/prizes/${testPrize._id}/claim`,
          headers: {
            authorization: `Bearer ${testToken}`,
          },
          payload: claimPayload,
        });

        expect(response2.statusCode).toBe(200);
        expect(response1.body).toBe(response2.body);
      });
    });

    describe('POST /api/prizes (Admin only)', () => {
      it('should create prize as admin', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/prizes',
          headers: {
            authorization: `Bearer ${adminToken}`,
          },
          payload: {
            name: 'Admin Created Prize',
            description: 'A prize created by admin',
            category: PrizeCategory.ENTERTAINMENT,
            points: 150,
            location: {
              lat: 36.8100,
              lng: 10.1900,
            },
            city: 'Tunis',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        });

        expect(response.statusCode).toBe(201);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.prize.name).toBe('Admin Created Prize');
        expect(body.data.prize.createdBy).toBe(adminUser._id.toString());
      });

      it('should reject non-admin users', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/prizes',
          headers: {
            authorization: `Bearer ${testToken}`, // Regular user token
          },
          payload: {
            name: 'Unauthorized Prize',
            category: PrizeCategory.FOOD,
            points: 50,
            location: {
              lat: 36.8065,
              lng: 10.1815,
            },
          },
        });

        expect(response.statusCode).toBe(403);
      });
    });
  });

  describe('User Endpoints', () => {
    describe('GET /api/users/profile', () => {
      it('should return user profile for authenticated user', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/users/profile',
          headers: {
            authorization: `Bearer ${testToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.user._id).toBe(testUser._id.toString());
        expect(body.data.user.email).toBe('testuser@example.com');
        expect(body.data.user.points).toBeDefined();
      });

      it('should require authentication', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/users/profile',
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('PUT /api/users/profile', () => {
      it('should update user profile', async () => {
        const response = await app.inject({
          method: 'PUT',
          url: '/api/users/profile',
          headers: {
            authorization: `Bearer ${testToken}`,
          },
          payload: {
            displayName: 'Updated Test User',
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
        expect(body.data.user.displayName).toBe('Updated Test User');
        expect(body.data.user.location.city).toBe('Sfax');
      });

      it('should validate update data', async () => {
        const response = await app.inject({
          method: 'PUT',
          url: '/api/users/profile',
          headers: {
            authorization: `Bearer ${testToken}`,
          },
          payload: {
            displayName: '', // Invalid empty name
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on auth endpoints', async () => {
      // Make multiple requests quickly
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: {
              email: 'ratelimit@example.com',
              password: 'wrongpassword',
              deviceId: 'rate-device',
              platform: 'ios',
            },
          })
        );
      }

      const responses = await Promise.all(promises);
      
      // Should have at least one rate limited response
      const rateLimitedResponses = responses.filter(r => r.statusCode === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: {
          'content-type': 'application/json',
        },
        payload: '{invalid json}',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle missing content-type', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: 'not json',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return proper error format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/nonexistent-endpoint',
      });

      expect(response.statusCode).toBe(404);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('CORS', () => {
    it('should include CORS headers', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/auth/login',
        headers: {
          origin: 'https://yallacatch.tn',
        },
      });

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
      expect(response.headers['access-control-allow-headers']).toBeDefined();
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });
  });
});
