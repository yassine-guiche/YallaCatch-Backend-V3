import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../src/config/database';
import { User } from '../src/models/User';
import { UserRole, UserLevel } from '../src/types';

const seeds = [
  { email: 'admin@yallacatch.com', password: 'Admin@2024!', role: UserRole.SUPER_ADMIN, displayName: 'SuperAdmin' },
  { email: 'admin2@yallacatch.com', password: 'Admin@2024!', role: UserRole.ADMIN, displayName: 'Admin2' },
  { email: 'mod@yallacatch.com', password: 'Mod@2024!', role: UserRole.MODERATOR, displayName: 'Moderator' },
];

async function run() {
  await connectDB();
  for (const s of seeds) {
    const hash = await bcrypt.hash(s.password, 12);
    await User.updateOne(
      { email: s.email },
      {
        $set: {
          email: s.email,
          passwordHash: hash,
          role: s.role,
          displayName: s.displayName,
          level: UserLevel.BRONZE,
          points: { available: 0, total: 0, spent: 0 },
          stats: {
            prizesFound: 0,
            rewardsRedeemed: 0,
            sessionsCount: 0,
            totalPlayTime: 0,
            longestStreak: 0,
            currentStreak: 0,
            dailyClaimsCount: 0,
          },
        },
        $setOnInsert: {
          devices: [],
        },
      },
      { upsert: true }
    );
    console.log(`Seeded ${s.email} as ${s.role}`);
  }
  await disconnectDB();
}

run().catch(async (err) => {
  console.error('Failed seeding admins/moderators', err);
  await disconnectDB();
  process.exit(1);
});
