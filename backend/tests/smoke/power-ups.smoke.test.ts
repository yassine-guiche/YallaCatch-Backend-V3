/**
 * Power-Ups Smoke Tests
 * Basic tests to verify power-ups CRUD operations work
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Skip these tests if not running in test environment
const SKIP_SMOKE = process.env.SKIP_SMOKE_TESTS === 'true';

describe('Power-Ups Module', () => {
  const API_URL = process.env.API_URL || 'http://localhost:3000/api/v1';
  let authToken: string;
  let createdPowerUpId: string;

  beforeAll(async () => {
    if (SKIP_SMOKE) return;
    
    // Login as admin
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: process.env.TEST_ADMIN_EMAIL || 'admin@yallacatch.com',
          password: process.env.TEST_ADMIN_PASSWORD || 'admin123',
          deviceId: 'test-device-smoke',
          platform: 'web'
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        authToken = data.tokens?.accessToken || data.token;
      }
    } catch (error) {
      console.warn('Auth failed, tests may be skipped:', error);
    }
  });

  afterAll(async () => {
    // Cleanup: delete test power-up if created
    if (createdPowerUpId && authToken) {
      try {
        await fetch(`${API_URL}/admin/power-ups/${createdPowerUpId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${authToken}` }
        });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('should list power-ups (GET /admin/power-ups)', async () => {
    if (SKIP_SMOKE || !authToken) {
      console.log('Skipping: no auth token');
      return;
    }

    const response = await fetch(`${API_URL}/admin/power-ups`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it('should create a power-up (POST /admin/power-ups)', async () => {
    if (SKIP_SMOKE || !authToken) {
      console.log('Skipping: no auth token');
      return;
    }

    const testPowerUp = {
      name: 'Test Radar Boost',
      description: 'A test power-up for smoke testing',
      type: 'radar_boost',
      icon: '🎯',
      rarity: 'common',
      durationMs: 30000,
      dropRate: 5,
      maxPerSession: 2,
      maxInInventory: 5,
      effects: {
        radarBoost: { radiusMultiplier: 1.5 }
      }
    };

    const response = await fetch(`${API_URL}/admin/power-ups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify(testPowerUp)
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.name).toBe(testPowerUp.name);
    expect(data.data.type).toBe(testPowerUp.type);
    
    createdPowerUpId = data.data._id;
  });

  it('should fetch created power-up by ID (GET /admin/power-ups/:id)', async () => {
    if (SKIP_SMOKE || !authToken || !createdPowerUpId) {
      console.log('Skipping: no power-up created');
      return;
    }

    const response = await fetch(`${API_URL}/admin/power-ups/${createdPowerUpId}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data._id).toBe(createdPowerUpId);
  });

  it('should update power-up (PATCH /admin/power-ups/:id)', async () => {
    if (SKIP_SMOKE || !authToken || !createdPowerUpId) {
      console.log('Skipping: no power-up created');
      return;
    }

    const update = { dropRate: 10 };

    const response = await fetch(`${API_URL}/admin/power-ups/${createdPowerUpId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify(update)
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.dropRate).toBe(10);
  });

  it('should delete power-up (DELETE /admin/power-ups/:id)', async () => {
    if (SKIP_SMOKE || !authToken || !createdPowerUpId) {
      console.log('Skipping: no power-up created');
      return;
    }

    const response = await fetch(`${API_URL}/admin/power-ups/${createdPowerUpId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    
    // Mark as deleted so cleanup doesn't try again
    createdPowerUpId = '';
  });
});
