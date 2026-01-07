import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../src/app';
import { testUtils } from '../setup';

describe('Profile Endpoints (Users canonical, Auth deprecated)', () => {
  let app: FastifyInstance;
  let user: any;
  let accessToken: string;

  beforeAll(async () => {
    // Ensure Redis utilities are initialized for caching in tests
    const { connectRedis, initializeRedisUtilities } = await import('../../src/config/redis');
    const redisClient = await connectRedis();
    initializeRedisUtilities(redisClient);

    app = await createApp();
    await app.ready();

    user = await testUtils.createTestUser({ displayName: 'Profile Tester' });
    accessToken = await testUtils.generateTestToken({ sub: user._id.toString(), role: 'player' });
  });

  afterAll(async () => {
    await app.close();
    const { disconnectRedis } = await import('../../src/config/redis');
    await disconnectRedis();
  });

  it('GET /api/v1/users/profile returns enriched profile and caches it', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users/profile',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.displayName).toBe('Profile Tester');
    expect(body.data.stats).toBeDefined();
    expect(Array.isArray(body.data.recentActivity)).toBe(true);

    // Verify Redis cache was written (keyPrefix 'yallacatch:' is applied by client)
    // Use the test Redis client without prefix
    // @ts-ignore - provided by tests/setup.ts
    const exists = await global.testRedisClient.exists(`yallacatch:user:profile:${user._id.toString()}`);
    expect(exists).toBe(1);
  });

  it('GET /api/v1/auth/profile delegates to UsersService and sets deprecation headers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/profile',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['deprecation']).toBeDefined();
    expect(String(res.headers['deprecation']).toLowerCase()).toBe('true');
    expect(String(res.headers['link'] || '')).toContain('/api/v1/users/profile');

    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.displayName).toBe('Profile Tester');
  });

  it('PATCH /api/v1/auth/profile updates via UsersService and deprecates route', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { displayName: 'Profile Tester Updated' },
    });

    expect(res.statusCode).toBe(200);
    expect(String(res.headers['deprecation']).toLowerCase()).toBe('true');
    expect(String(res.headers['link'] || '')).toContain('/api/v1/users/profile');

    // Fetch from canonical endpoint to verify update
    const res2 = await app.inject({
      method: 'GET',
      url: '/api/v1/users/profile',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const body2 = JSON.parse(res2.body);
    expect(body2.success).toBe(true);
    expect(body2.data.displayName).toBe('Profile Tester Updated');
  });
});

