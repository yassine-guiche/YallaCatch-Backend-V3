
import { connectDB, disconnectDB } from '../config/database.js';
import PowerUp from '../models/PowerUp'; // Default import
import mongoose from 'mongoose';

async function checkPowerUps() {
    try {
        await connectDB();
        console.log('Connected to DB');

        // List all collections to see what we have
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));

        try {
            const count = await PowerUp.countDocuments();
            console.log(`PowerUps count: ${count}`);

            if (count > 0) {
                const items = await PowerUp.find().limit(5);
                console.log('Sample items:', JSON.stringify(items, null, 2));
            }
        } catch (e) {
            console.log("Error querying PowerUp model:", e.message);
            // Fallback to direct collection query if model fails
            const collection = mongoose.connection.db.collection('powerups');
            const countDirect = await collection.countDocuments();
            console.log(`Direct collection 'powerups' count: ${countDirect}`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await disconnectDB();
    }
}

checkPowerUps();
