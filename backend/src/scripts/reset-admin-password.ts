
import mongoose from 'mongoose';
import { config } from '@/config';
import { User } from '@/models/User';
import { logger } from '@/lib/logger';

async function resetAdminPassword() {
    try {
        await mongoose.connect(config.MONGODB_URI);
        logger.info('Connected to MongoDB');

        const adminEmail = 'admin@yallacatch.tn';
        const newPassword = 'AdminSecurePass123!@#';

        const user = await User.findOne({ email: adminEmail });

        if (!user) {
            logger.error('Admin user not found!');
            process.exit(1);
        }

        // Force update password
        user.passwordHash = newPassword;
        // The pre-save hook in User.ts will detect the change and hash it
        await user.save();

        logger.info(`Password for ${adminEmail} has been reset successfully.`);
        logger.info(`New Password: ${newPassword}`);

        process.exit(0);
    } catch (error) {
        console.error('Error resetting password:', error);
        process.exit(1);
    }
}

resetAdminPassword();
