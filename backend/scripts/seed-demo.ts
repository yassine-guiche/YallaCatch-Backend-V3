import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '@/models/User';
import { Reward } from '@/models/Reward';
import { Partner } from '@/models/Partner';
import { Prize } from '@/models/Prize';
import {
  UserRole,
  PrizeType,
  PrizeContentType,
  PrizeCategory,
  PrizeRarity,
  PrizeStatus,
  LocationType,
  RewardCategory,
} from '@/types';
import { logger } from '@/lib/logger';
import { config } from '@/config';

/**
 * Seed demo data for the admin panel:
 * - 1 partner
 * - 5 users
 * - 5 rewards
 * - 3 prizes (GPS in Tunis)
 *
 * Run with:
 * npx ts-node -r tsconfig-paths/register scripts/seed-demo.ts
 */

const DEMO_PASSWORD = 'Passw0rd!';
const CITY = 'Tunis';
const COORDS: [number, number] = [10.1815, 36.8065]; // lng, lat (Tunis)

async function upsertUser(email: string, displayName: string, role: UserRole = UserRole.PLAYER) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, config.BCRYPT_ROUNDS);
  return User.findOneAndUpdate(
    { email },
    {
      email,
      displayName,
      role,
      passwordHash,
      points: { available: 500, total: 500, spent: 0 },
      level: 1,
      stats: { prizesFound: 0, totalPoints: 500 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertPartner() {
  return Partner.findOneAndUpdate(
    { name: 'Demo Partner' },
    {
      name: 'Demo Partner',
      category: 'retail',
      isActive: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertRewards(partnerId?: mongoose.Types.ObjectId) {
  const items = [
    { name: 'Gift Card 10', category: RewardCategory.SHOPPING, pointsCost: 200, stockQuantity: 50 },
    { name: 'Coffee Voucher', category: RewardCategory.FOOD, pointsCost: 80, stockQuantity: 100 },
    { name: 'Headset Discount', category: RewardCategory.ELECTRONICS, pointsCost: 400, stockQuantity: 30 },
    { name: 'Premium Skin', category: RewardCategory.GAMING, pointsCost: 250, stockQuantity: 70 },
    { name: 'Cinema Ticket', category: RewardCategory.LIFESTYLE, pointsCost: 150, stockQuantity: 60 },
  ];

  const created = [];
  for (const item of items) {
    const reward = await Reward.findOneAndUpdate(
      { name: item.name },
      {
        ...item,
        stockAvailable: item.stockQuantity,
        isActive: true,
        partnerId: partnerId || null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    created.push(reward);
  }
  return created;
}

async function upsertPrizes() {
  const prizes = [
    { name: 'Demo Chest', category: PrizeCategory.GAMING, rarity: PrizeRarity.COMMON, points: 50 },
    { name: 'Golden Voucher', category: PrizeCategory.SHOPPING, rarity: PrizeRarity.RARE, points: 120 },
    { name: 'Epic Loot', category: PrizeCategory.ELECTRONICS, rarity: PrizeRarity.EPIC, points: 200 },
  ];

  const created = [];
  for (const prize of prizes) {
    const doc = await Prize.findOneAndUpdate(
      { name: prize.name },
      {
        ...prize,
        description: 'Démo pour le panneau admin',
        type: PrizeType.DIGITAL,
        contentType: PrizeContentType.POINTS,
        displayType: 'standard',
        quantity: 10,
        status: PrizeStatus.ACTIVE,
        location: {
          type: LocationType.GPS,
          coordinates: COORDS,
          radius: 50,
          city: CITY,
          address: 'Tunis centre',
          confidenceThreshold: 0.8,
        },
        pointsReward: {
          amount: prize.points,
          bonusMultiplier: 1,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    created.push(doc);
  }
  return created;
}

async function run() {
  if (!config.MONGODB_URI) {
    throw new Error('Missing MONGODB_URI in environment');
  }

  await mongoose.connect(config.MONGODB_URI);
  logger.info('Connected to MongoDB for demo seed');

  const [partner] = await Promise.all([
    upsertPartner(),
    upsertUser('admin.demo@yallacatch.com', 'Admin Demo', UserRole.ADMIN),
    upsertUser('moderator.demo@yallacatch.com', 'Moderator Demo', UserRole.MODERATOR),
    upsertUser('player.one@yallacatch.com', 'Player One'),
    upsertUser('player.two@yallacatch.com', 'Player Two'),
    upsertUser('player.three@yallacatch.com', 'Player Three'),
  ]).then((res) => [res[0]]);

  await upsertRewards(partner?._id);
  await upsertPrizes();

  logger.info('Demo data seeded successfully', {
    partner: partner?._id,
  });
}

run()
  .catch((err) => {
    logger.error('Seed demo failed', { error: err.message });
    process.exit(1);
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
