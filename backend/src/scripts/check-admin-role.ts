
import { User } from '@/models/User';
import mongoose from 'mongoose';
import { config } from '@/config';

(async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(config.MONGODB_URI);

        const email = 'admin@yallacatch.com';
        const user = await User.findOne({ email });

        if (user) {
            console.log('User found:', {
                id: user._id,
                email: user.email,
                role: user.role,
                displayName: user.displayName
            });
        } else {
            console.log('User NOT found:', email);
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
})();
