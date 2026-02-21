
import mongoose from 'mongoose';
import { config } from '@/config';
import { User } from '@/models/User';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';

async function verifyAdminLogin() {
    try {
        await mongoose.connect(config.MONGODB_URI);
        logger.info('Connected to MongoDB');

        const adminEmail = 'admin@yallacatch.tn';
        const password = 'AdminSecurePass123!@#';

        const user = await User.findOne({ email: adminEmail }).select('+passwordHash');

        if (!user) {
            logger.error('Admin user not found!');
            process.exit(1);
        }

        logger.info(`Found user: ${user.email}`);
        logger.info(`Stored Hash: ${user.passwordHash}`);

        const isMatch = await user.comparePassword(password);
        logger.info(`Method comparePassword match: ${isMatch}`);

        // Manual check
        const manualMatch = await bcrypt.compare(password, user.passwordHash || '');
        logger.info(`Manual bcrypt match: ${manualMatch}`);

        if (isMatch) {
            logger.info('SUCCESS: Password is correct in DB.');
        } else {
            logger.error('FAILURE: Password mismatch.');

            // Attempt to re-hash and save manually if it failed
            logger.info('Attempting to fix by manually hashing...');
            const newHash = await bcrypt.hash(password, 12);
            await User.updateOne({ _id: user._id }, { passwordHash: newHash });
            logger.info('Updated password hash manually via updateOne.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error verifying login:', error);
        process.exit(1);
    }
}

verifyAdminLogin();
