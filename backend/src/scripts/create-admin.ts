import bcrypt from 'bcryptjs';
import { connectDB, disconnectDB } from '../config/database';
import { User } from '../models/User';
import { UserRole, UserLevel } from '../types';

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@yallacatch.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@2024!';

  await connectDB();

  const existing = await User.findOne({ email });
  const passwordHash = await bcrypt.hash(password, 12);

  const currentTotal =
    typeof (existing as any)?.points === 'number'
      ? (existing as any).points || 0
      : existing?.points?.total || 0;

  const pointsObj = { available: 0, total: currentTotal, spent: 0 };

  const result = await User.updateOne(
    { email },
    {
      $set: {
        email,
        passwordHash,
        displayName: existing?.displayName || 'Admin',
        role: UserRole.ADMIN,
        level: UserLevel.BRONZE,
        points: pointsObj,
      },
      $setOnInsert: {
        devices: [],
      },
    },
    { upsert: true }
  );

  if (result.upsertedCount || result.matchedCount === 0) {
    console.log(`Admin created: ${email}`);
  } else {
    console.log(`Admin updated with new password: ${email}`);
  }
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('Failed to create admin', err);
  await disconnectDB();
  process.exit(1);
});
