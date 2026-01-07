import { MongoClient, Db } from 'mongodb';
import { logger } from '../src/lib/logger';

export async function up(db: Db): Promise<void> {
  logger.info('Running migration: 001_initial_setup');

  try {
    // Create collections with validation schemas
    await db.createCollection('users', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['email', 'displayName', 'role', 'level'],
          properties: {
            email: { bsonType: 'string' },
            displayName: { bsonType: 'string' },
            role: { enum: ['user', 'admin', 'super_admin'] },
            level: { enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond'] },
            points: {
              bsonType: 'object',
              properties: {
                total: { bsonType: 'number', minimum: 0 },
                available: { bsonType: 'number', minimum: 0 },
                spent: { bsonType: 'number', minimum: 0 },
              }
            },
            location: {
              bsonType: 'object',
              properties: {
                type: { enum: ['Point'] },
                coordinates: {
                  bsonType: 'array',
                  items: { bsonType: 'number' },
                  minItems: 2,
                  maxItems: 2
                },
                city: { bsonType: 'string' },
                accuracy: { bsonType: 'number' }
              }
            }
          }
        }
      }
    });

    await db.createCollection('prizes', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['name', 'category', 'points', 'location', 'status'],
          properties: {
            name: { bsonType: 'string' },
            category: { enum: ['food', 'shopping', 'entertainment', 'transport', 'health', 'education', 'services', 'other'] },
            points: { bsonType: 'number', minimum: 1 },
            location: {
              bsonType: 'object',
              properties: {
                type: { enum: ['Point'] },
                coordinates: {
                  bsonType: 'array',
                  items: { bsonType: 'number' },
                  minItems: 2,
                  maxItems: 2
                }
              }
            },
            status: { enum: ['active', 'claimed', 'expired', 'disabled'] }
          }
        }
      }
    });

    await db.createCollection('claims');
    await db.createCollection('rewards');
    await db.createCollection('redemptions');
    await db.createCollection('codes');
    await db.createCollection('notifications');
    await db.createCollection('analytics');
    await db.createCollection('auditlogs');
    await db.createCollection('sessions');
    await db.createCollection('distributions');
    await db.createCollection('partners');

    // Create indexes for optimal performance
    await createIndexes(db);

    logger.info('Migration 001_initial_setup completed successfully');
  } catch (error) {
    logger.error('Migration 001_initial_setup failed', { error: error.message });
    throw error;
  }
}

export async function down(db: Db): Promise<void> {
  logger.info('Rolling back migration: 001_initial_setup');

  const collections = [
    'users', 'prizes', 'claims', 'rewards', 'redemptions', 'codes',
    'notifications', 'analytics', 'auditlogs', 'sessions', 'distributions', 'partners'
  ];

  for (const collection of collections) {
    try {
      await db.dropCollection(collection);
    } catch (error) {
      // Collection might not exist, continue
    }
  }

  logger.info('Migration 001_initial_setup rolled back successfully');
}

async function createIndexes(db: Db): Promise<void> {
  // Users indexes
  await db.collection('users').createIndexes([
    { key: { email: 1 }, unique: true },
    { key: { 'location.coordinates': '2dsphere' } },
    { key: { 'location.city': 1 } },
    { key: { level: 1 } },
    { key: { 'points.total': -1 } },
    { key: { lastActive: -1 } },
    { key: { createdAt: -1 } },
    { key: { role: 1 } },
    { key: { isBanned: 1 } }
  ]);

  // Prizes indexes
  await db.collection('prizes').createIndexes([
    { key: { 'location.coordinates': '2dsphere' } },
    { key: { category: 1 } },
    { key: { status: 1 } },
    { key: { city: 1 } },
    { key: { expiresAt: 1 } },
    { key: { createdAt: -1 } },
    { key: { points: 1 } },
    { key: { partnerId: 1 } }
  ]);

  // Claims indexes
  await db.collection('claims').createIndexes([
    { key: { userId: 1, claimedAt: -1 } },
    { key: { prizeId: 1 } },
    { key: { status: 1 } },
    { key: { claimedAt: -1 } },
    { key: { 'location.coordinates': '2dsphere' } },
    { key: { pointsAwarded: -1 } }
  ]);

  // Rewards indexes
  await db.collection('rewards').createIndexes([
    { key: { category: 1 } },
    { key: { pointsCost: 1 } },
    { key: { isActive: 1 } },
    { key: { stockAvailable: -1 } },
    { key: { partnerId: 1 } },
    { key: { createdAt: -1 } }
  ]);

  // Redemptions indexes
  await db.collection('redemptions').createIndexes([
    { key: { userId: 1, redeemedAt: -1 } },
    { key: { rewardId: 1 } },
    { key: { status: 1 } },
    { key: { redeemedAt: -1 } },
    { key: { idempotencyKey: 1 }, unique: true }
  ]);

  // Codes indexes
  await db.collection('codes').createIndexes([
    { key: { code: 1 }, unique: true },
    { key: { rewardId: 1 } },
    { key: { status: 1 } },
    { key: { expiresAt: 1 } },
    { key: { usedBy: 1 } }
  ]);

  // Notifications indexes
  await db.collection('notifications').createIndexes([
    { key: { targetType: 1, targetValue: 1 } },
    { key: { status: 1 } },
    { key: { scheduledFor: 1 } },
    { key: { createdAt: -1 } },
    { key: { sentAt: -1 } }
  ]);

  // Analytics indexes
  await db.collection('analytics').createIndexes([
    { key: { date: -1 } },
    { key: { type: 1 } },
    { key: { generatedAt: -1 } }
  ]);

  // Audit logs indexes
  await db.collection('auditlogs').createIndexes([
    { key: { userId: 1, timestamp: -1 } },
    { key: { action: 1 } },
    { key: { resource: 1 } },
    { key: { timestamp: -1 } }
  ]);

  // Sessions indexes
  await db.collection('sessions').createIndexes([
    { key: { userId: 1 } },
    { key: { refreshToken: 1 }, unique: true },
    { key: { expiresAt: 1 } },
    { key: { deviceId: 1 } }
  ]);

  // Distributions indexes
  await db.collection('distributions').createIndexes([
    { key: { status: 1 } },
    { key: { createdAt: -1 } },
    { key: { undoExpiresAt: 1 } },
    { key: { createdBy: 1 } }
  ]);

  // Partners indexes
  await db.collection('partners').createIndexes([
    { key: { name: 1 } },
    { key: { isActive: 1 } },
    { key: { createdAt: -1 } },
    { key: { contactEmail: 1 } }
  ]);

  logger.info('All indexes created successfully');
}
