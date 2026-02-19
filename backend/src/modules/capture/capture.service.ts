
import { Prize } from '@/models/Prize';
import { User } from '@/models/User';
import { Claim } from '@/models/Claim';
import { typedLogger } from '@/lib/typed-logger';
import { calculateGeodesicDistance as calculateDistance } from '@/utils/geo';
import { validateAntiCheat as detectCheating } from '@/utils/anti-cheat';
import { MetricsService, GameMetrics } from '@/services/metrics';
import { z } from 'zod';
import mongoose, { Types } from 'mongoose';

import { PrizeType } from '@/types';

// Validation Schemas
export const CaptureAttemptSchema = z.object({
    prizeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid prize ID'),
    userLocation: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracy: z.number().optional()
    }),
    deviceSignals: z.object({
        magnetometer: z.boolean().optional(),
        accelerometer: z.boolean().optional(),
        gyroscope: z.boolean().optional()
    }).optional()
});

export const CaptureValidationSchema = z.object({
    prizeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid prize ID'),
    userLocation: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180)
    })
});

export class CaptureService {
    /**
     * Attempt to capture a prize
     * Validates distance, anti-cheat, inventory limits
     */
    static async attemptCapture(userId: string, data: z.infer<typeof CaptureAttemptSchema>) {
        const { prizeId, userLocation, deviceSignals } = data;

        // 1. Get prize and user
        const [prize, user] = await Promise.all([
            Prize.findById(prizeId),
            User.findById(userId)
        ]);

        if (!prize) throw new Error('Prize not found');
        if (!user) throw new Error('User not found');

        // 2. Check if prize is active and available
        if (prize.status !== 'active') throw new Error('Prize is not active');
        if (prize.quantity <= 0) throw new Error('Prize usage exhausted');

        // 3. Distance Check
        const coordinates = prize.location?.coordinates;
        if (prize.location && coordinates && coordinates.length >= 2) {
            // Create Coordinate objects matching the interface { lat: number, lng: number }
            const userCoords = { lat: userLocation.latitude, lng: userLocation.longitude };
            const prizeCoords = { lat: coordinates[1], lng: coordinates[0] };

            const distance = calculateDistance(userCoords, prizeCoords);

            // Max capture distance (e.g. 50m)
            const MAX_CAPTURE_DISTANCE = 50;
            if (distance > MAX_CAPTURE_DISTANCE) {
                throw new Error(`Too far from prize (${Math.round(distance)}m)`);
            }
        }

        // 4. Anti-Cheat Check
        // Fix: pass valid structure to detectCheating (DeviceSignals mismatch fix)
        // And correctly handle the result object (Logic fix)
        const antiCheatResult = await detectCheating(userId, {
            lat: userLocation.latitude,
            lng: userLocation.longitude
        }, {
            // Passing empty object as schema deviceSignals (magnetometer etc) 
            // don't match DeviceSignals interface (speed, mockLocation etc).
            // If we wanted to support them, we'd need to update types.
        });

        if (!antiCheatResult.allowed) {
            await MetricsService.recordMetric({
                name: 'game.cheat.detected',
                value: 1,
                userId,
                tags: { type: 'capture_validation_failed', reasons: antiCheatResult.violations.join(',') }
            });
            throw new Error('Suspicious activity detected');
        }

        // 5. Inventory check (max items)
        const inventoryCount = await Claim.countDocuments({
            userId,
            status: 'active'
        });
        const MAX_INVENTORY = 50;
        if (inventoryCount >= MAX_INVENTORY) {
            throw new Error('Inventory full');
        }

        // 6. Return success
        const points = prize.points || prize.pointsReward?.amount || 0;
        return {
            canCapture: true,
            difficulty: points > 1000 ? 'hard' : 'medium'
        };
    }

    /**
     * Pre-validation (lighter check before AR view)
     */
    static async preValidateCapture(userId: string, data: z.infer<typeof CaptureValidationSchema>) {
        return this.attemptCapture(userId, { ...data, deviceSignals: {} });
    }

    /**
     * Get AR Box Animation configuration
     */
    static async getBoxAnimation(prizeId: string) {
        const prize = await Prize.findById(prizeId);
        if (!prize) throw new Error('Prize not found');

        // Determine animation based on rarity/type
        let animationType = 'standard_box';
        const points = prize.points || prize.pointsReward?.amount || 0;

        if (points > 5000) animationType = 'golden_box';
        else if (prize.type === PrizeType.DIGITAL) animationType = 'digital_chest';

        return {
            animationId: animationType,
            assets: [
                `https://assets.yallacatch.com/animations/${animationType}.glb`,
                `https://assets.yallacatch.com/sounds/open_${animationType}.mp3`
            ]
        };
    }

    /**
     * Confirm Capture (Final Step)
     * Creates the Claim, decrements quantity, awards points
     */
    static async confirmCapture(userId: string, prizeId: string) {
        const prize = await Prize.findById(prizeId);
        if (!prize) {
            throw new Error('Prize not found');
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Re-fetch with lock/atomic check
            const currentPrize = await Prize.findById(prizeId).session(session);
            if (!currentPrize || currentPrize.quantity <= 0) {
                throw new Error('Prize no longer available');
            }

            // Decrement
            currentPrize.quantity -= 1;
            await currentPrize.save({ session });

            const points = currentPrize.points || currentPrize.pointsReward?.amount || 0;

            // Create Claim
            const claim = new Claim({
                userId,
                prizeId,
                platform: 'mobile', // Default
                status: 'active',
                claimedAt: new Date(),
                pointsAwarded: points
            });
            await claim.save({ session });

            // Add points to User
            await User.findByIdAndUpdate(userId, {
                $inc: { points: points, totalPoints: points }
            }, { session });

            await session.commitTransaction();

            // Metrics
            await MetricsService.recordMetric({
                name: 'game.capture.success',
                value: points,
                userId,
                tags: { prizeId, points: points.toString() }
            });

            return {
                success: true,
                claimId: claim._id,
                points: points,
                prize: currentPrize
            };

        } catch (e) {
            await session.abortTransaction();
            throw e;
        } finally {
            session.endSession();
        }
    }
}
