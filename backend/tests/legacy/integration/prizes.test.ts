import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { buildApp } from '../../src/server';
import { User } from '../../src/models/User';
import { Prize } from '../../src/models/Prize';
import { generateKeyPair } from 'crypto';
import { promisify } from 'util';

const generateKeyPairAsync = promisify(generateKeyPair);

describe('Prizes API Integration Tests', () => {
  let app: FastifyInstance;
  let mongoServer: MongoMemoryServer;
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Setup test database
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
    // Clean database
    await User.deleteMany({});
    await Prize.deleteMany({});

    // Create test user and get auth token
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'password123',
        displayName: 'Test User',
        deviceId: 'device123',
        platform: 'ios',
        fcmToken: 'fcm_token_123',
      },
    });

    const registerData = JSON.parse(registerResponse.body);
    authToken = registerData.data.accessToken;
    userId = registerData.data.user.id;

    // Update user location for proximity tests
    await User.findByIdAndUpdate(userId, {
      location: {
        type: 'Point',
        coordinates: [10.1815, 36.8065], // Tunis coordinates
        city: 'tunis',
        accuracy: 10,
      },
    });
  });

  describe('GET /api/v1/prizes/nearby', () => {
    beforeEach(async () => {
      // Create test prizes
      const prizes = [
        {
          name: 'Coffee Shop Prize',
          description: 'Free coffee',
          category: 'food',
          points: 50,
          location: {
            type: 'Point',
            coordinates: [10.1820, 36.8070], // Close to user
          },
          city: 'tunis',
          status: 'active',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        {
          name: 'Shopping Mall Prize',
          description: 'Discount voucher',
          category: 'shopping',
          points: 100,
          location: {
            type: 'Point',
            coordinates: [10.2000, 36.8200], // Far from user
          },
          city: 'tunis',
          status: 'active',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        {
          name: 'Expired Prize',
          description: 'This should not appear',
          category: 'entertainment',
          points: 75,
          location: {
            type: 'Point',
            coordinates: [10.1825, 36.8075],
          },
          city: 'tunis',
          status: 'expired',
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      ];

      await Prize.insertMany(prizes);
    });

    it('should return nearby prizes within radius', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/prizes/nearby?latitude=36.8065&longitude=10.1815&radius=1000',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.body);
      expect(data.success).toBe(true);
      expect(data.data.prizes).toHaveLength(1);
      expect(data.data.prizes[0].name).toBe('Coffee Shop Prize');
      expect(data.data.prizes[0].distance).toBeDefined();
      expect(data.data.prizes[0].distance).toBeLessThan(1000);
    });

    it('should filter by category', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/prizes/nearby?latitude=36.8065&longitude=10.1815&radius=5000&category=shopping',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.body);
      expect(data.success).toBe(true);
      expect(data.data.prizes).toHaveLength(1);
      expect(data.data.prizes[0].category).toBe('shopping');
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/prizes/nearby?latitude=36.8065&longitude=10.1815&radius=1000',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should validate coordinates', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/prizes/nearby?latitude=invalid&longitude=10.1815&radius=1000',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should limit results', async () => {
      // Create many prizes
      const prizes = Array.from({ length: 20 }, (_, i) => ({
        name: `Prize ${i}`,
        description: `Description ${i}`,
        category: 'food',
        points: 50,
        location: {
          type: 'Point',
          coordinates: [10.1815 + i * 0.001, 36.8065 + i * 0.001],
        },
        city: 'tunis',
        status: 'active',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }));

      await Prize.insertMany(prizes);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/prizes/nearby?latitude=36.8065&longitude=10.1815&radius=5000&limit=5',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.body);
      expect(data.data.prizes.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/v1/prizes/city/:city', () => {
    beforeEach(async () => {
      const prizes = [
        {
          name: 'Tunis Prize 1',
          description: 'Prize in Tunis',
          category: 'food',
          points: 50,
          location: {
            type: 'Point',
            coordinates: [10.1815, 36.8065],
          },
          city: 'tunis',
          status: 'active',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        {
          name: 'Sfax Prize 1',
          description: 'Prize in Sfax',
          category: 'shopping',
          points: 75,
          location: {
            type: 'Point',
            coordinates: [10.7600, 34.7400],
          },
          city: 'sfax',
          status: 'active',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      ];

      await Prize.insertMany(prizes);
    });

    it('should return prizes for specific city', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/prizes/city/tunis',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      
      const data = JSON.parse(response.body);
      expect(data.success).toBe(true);
      expect(data.data.prizes).toHaveLength(1);
      expect(data.data.prizes[0].city).toBe('tunis');
    });

    it('should validate city parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/prizes/city/invalid_city',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/prizes (Admin)', () => {
    beforeEach(async () => {
      // Make user an admin
      await User.findByIdAndUpdate(userId, { role: 'admin' });
    });

    it('should create a new prize', async () => {
      const prizeData = {
        name: 'New Test Prize',
        description: 'A test prize for integration testing',
        category: 'entertainment',
        points: 100,
        latitude: 36.8065,
        longitude: 10.1815,
        city: 'tunis',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/prizes',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: prizeData,
      });

      expect(response.statusCode).toBe(201);
      
      const data = JSON.parse(response.body);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe(prizeData.name);
      expect(data.data.category).toBe(prizeData.category);
      expect(data.data.points).toBe(prizeData.points);

      // Verify prize was saved to database
      const savedPrize = await Prize.findById(data.data.id);
      expect(savedPrize).toBeTruthy();
      expect(savedPrize?.name).toBe(prizeData.name);
    });

    it('should require admin role', async () => {
      // Remove admin role
      await User.findByIdAndUpdate(userId, { role: 'user' });

      const prizeData = {
        name: 'New Test Prize',
        description: 'A test prize',
        category: 'entertainment',
        points: 100,
        latitude: 36.8065,
        longitude: 10.1815,
        city: 'tunis',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/prizes',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: prizeData,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate prize data', async () => {
      const invalidPrizeData = {
        name: '', // Invalid: empty name
        description: 'A test prize',
        category: 'invalid_category', // Invalid category
        points: -10, // Invalid: negative points
        latitude: 200, // Invalid: out of range
        longitude: 10.1815,
        city: 'tunis',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/prizes',
        headers: {
          authorization: `Bearer ${authToken}`,
          'content-type': 'application/json',
        },
        payload: invalidPrizeData,
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
