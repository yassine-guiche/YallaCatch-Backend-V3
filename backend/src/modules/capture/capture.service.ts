
import { Prize } from '@/models/Prize';
import { User } from '@/models/User';
import { Claim } from '@/models/Claim';
import { typedLogger } from '@/lib/typed-logger';
import { calculateGeodesicDistance as calculateDistance } from '@/utils/geo';
import { validateAntiCheat as detectCheating } from '@/utils/anti-cheat';
import { MetricsService, GameMetrics } from '@/services/metrics';
import { z } from 'zod';
import mongoose, { Types } from 'mongoose';
import { broadcastAdminEvent } from '@/lib/websocket';
import { PrizeContentType } from '@/types';

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
        const prizeType = (prize as any).type as string; // Accessing type safely

        if (points > 5000) animationType = 'golden_box';
        else if (prizeType === 'digital') animationType = 'digital_chest';

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
     * Creates the Claim, decrements quantity, awards points/rewards
     */
    static async confirmCapture(userId: string, prizeId: string) {
        // Validate ID format first
        if (!Types.ObjectId.isValid(prizeId)) {
            throw new Error('Invalid prize ID format');
        }

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

            // Decrement quantity
            currentPrize.quantity -= 1;
            await currentPrize.save({ session });

            // Create basic Claim record first
            const claim = new Claim({
                userId,
                prizeId,
                platform: 'mobile', // Default
                status: 'active',
                claimedAt: new Date(),
                pointsAwarded: 0 // Will be updated below
            });
            await claim.save({ session });

            // Process Prize Content Type (Points, Reward, Hybrid)
            const user = await User.findById(userId).session(session);
            if (!user) throw new Error('User not found');

            let pointsAwarded = 0;
            let redemptionId = null;
            const contentType = currentPrize.contentType as string;

            switch (contentType) {
                case 'points': {
                    // Points only
                    const pointsAmount = currentPrize.pointsReward?.amount || currentPrize.points || 0;
                    const bonusMultiplier = currentPrize.pointsReward?.bonusMultiplier || 1;
                    pointsAwarded = Math.floor(pointsAmount * bonusMultiplier);
                    user.points.available += pointsAwarded;
                    user.points.total += pointsAwarded;
                    break;
                }

                case PrizeContentType.REWARD: {
                    // Direct Reward (Physical/Digital Item)
                    if (currentPrize.directReward?.rewardId) {
                        // Create Redemption record outside this transaction (safe helper handled below)
                        // We mark it for creation after we secure the prize claim
                        redemptionId = 'PENDING_CREATION';
                    }
                    pointsAwarded = 0;
                    break;
                }

                case PrizeContentType.HYBRID: {
                    // Points + Chance of Reward
                    const guaranteedPoints = currentPrize.pointsReward?.amount || 0;
                    user.points.available += guaranteedPoints;
                    user.points.total += guaranteedPoints;
                    pointsAwarded = guaranteedPoints;

                    // Random roll for reward
                    if (currentPrize.directReward?.rewardId) {
                        const probability = currentPrize.directReward?.probability || 0.3;
                        const roll = Math.random();

                        if (roll <= probability) {
                            redemptionId = 'PENDING_CREATION';
                            typedLogger.info('Bonus reward won in hybrid capture!', { userId, prizeId, probability, roll });
                        }
                    }
                    break;
                }

                default: {
                    // Fallback to basic points if contentType is missing or unknown
                    const defaultPoints = currentPrize.points || 0;
                    user.points.available += defaultPoints;
                    user.points.total += defaultPoints;
                    pointsAwarded = defaultPoints;
                }
            }

            // Update stats
            user.stats.prizesFound += 1;
            claim.pointsAwarded = pointsAwarded;

            await user.save({ session });
            await claim.save({ session });
            await session.commitTransaction();

            // --- Post-Transaction Actions ---

            // 1. Handle Redemption Creation (safe outside transaction to avoid cross-collection transaction complexity if not needed)
            if (redemptionId === 'PENDING_CREATION' && currentPrize.directReward?.rewardId) {
                try {
                    const realRedemptionId = await this.createDirectRedemptionSafe(
                        userId,
                        currentPrize.directReward.rewardId.toString(),
                        1
                    );

                    // Update claim with redemption ID
                    await Claim.findByIdAndUpdate(claim._id, { $set: { redemptionId: realRedemptionId } });
                    redemptionId = realRedemptionId;
                } catch (err: any) {
                    typedLogger.error('Failed to create redemption after capture', {
                        userId,
                        claimId: claim._id,
                        error: err.message
                    });
                    // Don't fail the whole request, but log it. User got the prize claim but missed the reward item.
                    // Ideally we should have a recovery mechanism here.
                }
            }

            // 2. Metrics
            await MetricsService.recordMetric({
                name: 'game.capture.success',
                value: pointsAwarded,
                userId,
                tags: { prizeId, points: pointsAwarded.toString() }
            });

            // 3. Achievements (Async)
            const AchievementService = (await import('@/services/achievement')).default;
            AchievementService.checkAchievements(userId, 'PRIZE_CLAIMED', {
                prizeId,
                category: currentPrize.category,
                rarity: currentPrize.rarity,
                pointsAwarded
            }).catch(err => {
                typedLogger.error('Check achievements error', { error: (err as any).message, userId, prizeId });
            });

            // 4. Broadcast Admin Event
            broadcastAdminEvent({
                type: 'capture_created',
                data: {
                    claimId: claim._id,
                    userId,
                    prize: {
                        id: currentPrize._id,
                        name: currentPrize.name,
                        category: currentPrize.category,
                        rarity: currentPrize.rarity
                    },
                    pointsAwarded,
                    timestamp: new Date()
                }
            });

            return {
                success: true,
                claimId: claim._id,
                points: pointsAwarded,
                prize: currentPrize,
                redemptionId: redemptionId !== 'PENDING_CREATION' ? redemptionId : null
            };

        } catch (e) {
            if (session.inTransaction()) {
                await session.abortTransaction();
            }
            throw e;
        } finally {
            session.endSession();
        }
    }

    /**
     * Helper to create a redemption record safely (similar to ClaimsService)
     */
    private static async createDirectRedemptionSafe(
        userId: string,
        rewardId: string,
        quantity: number = 1
    ): Promise<string> {
        const Redemption = (await import('@/models/Redemption')).default;
        const Reward = (await import('@/models/Reward')).default;
        // Using any to avoid complicated circular dependency imports for types if strictly typed
        // In a real scenario, we'd import the model interface

        const reward = await Reward.findById(rewardId);
        if (!reward) throw new Error('REWARD_NOT_FOUND');

        // Reserve stock
        const reserved = (reward as any).reserveStock ? (reward as any).reserveStock(quantity) : true;
        if (!reserved) throw new Error('INSUFFICIENT_STOCK');

        const idempotencyKey = `CAPTURE_REDEEM_${userId}_${rewardId}_${Date.now()}`;

        const redemption = new Redemption({
            userId: new Types.ObjectId(userId),
            rewardId: new Types.ObjectId(rewardId),
            quantity,
            pointsSpent: 0,
            status: 'PENDING',
            idempotencyKey,
            metadata: { source: 'AR_CAPTURE' },
        });

        await redemption.save();
        await reward.save();

        return redemption._id.toString();
    }
}
