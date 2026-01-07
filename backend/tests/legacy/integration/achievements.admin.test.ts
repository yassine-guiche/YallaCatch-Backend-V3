import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createApp } from '../../src/app';
import { testUtils } from '../setup';
import { Achievement } from '../../src/models/Achievement';

describe('Admin Achievements API', () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const adminUser = await testUtils.createTestUser({
      email: 'admin-achievements@example.com',
      displayName: 'Admin Tester',
      role: 'admin',
    });

    adminToken = await testUtils.generateTestToken({
      sub: adminUser._id.toString(),
      role: 'admin',
    });
  });

  it('GET /api/v1/admin/achievements/:id returns the achievement', async () => {
    const ach = await Achievement.create({
      name: 'Test Achievement',
      description: 'Integration test achievement',
      icon: '🏆',
      category: 'explorer',
      trigger: 'PRIZE_CLAIMED',
      condition: { type: 'TOTAL_CLAIMS', target: 1 },
      rewards: [{ type: 'POINTS', value: 50, description: '50 bonus points' }],
      isActive: true,
      isHidden: false,
      order: 0,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/achievements/${ach._id.toString()}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data._id).toBe(ach._id.toString());
    expect(body.data.name).toBe('Test Achievement');
  });

  it('GET /api/v1/admin/achievements/:id returns 404 for unknown id', async () => {
    const unknownId = '6568f6ccf1a2b3c4d5e6f7a9';
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/achievements/${unknownId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('POST /api/v1/admin/achievements/unlock unlocks achievement for a user', async () => {
    const user = await testUtils.createTestUser({ email: 'unlockme@example.com' });
    const ach = await Achievement.create({
      name: 'BA Unlock',
      description: 'Manually unlocked by admin',
      icon: '🏅',
      category: 'explorer',
      trigger: 'MANUAL',
      condition: { type: 'TOTAL_CLAIMS', target: 1 },
      rewards: [{ type: 'POINTS', value: 10, description: '10 points' }],
      isActive: true,
      isHidden: false,
      order: 0,
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/achievements/unlock`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: { userId: user._id.toString(), achievementId: ach._id.toString() },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.userId).toBe(user._id.toString());
    expect(body.data.achievementId).toBe(ach._id.toString());
    expect(body.data.unlockedAt).toBeDefined();
  });
});
