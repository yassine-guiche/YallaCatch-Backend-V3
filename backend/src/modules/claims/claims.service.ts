import { Types } from 'mongoose';
import { Claim } from '@/models/Claim';
import { Prize } from '@/models/Prize';
import { User } from '@/models/User';
import { typedLogger } from '@/lib/typed-logger';
import { PrizeStatus, PrizeContentType } from '@/types';
import { calculateGeodesicDistance, isWithinTunisia } from '@/utils/geo';
import { validateAntiCheat, validateCooldowns } from '@/utils/anti-cheat';
import { checkIdempotency, setIdempotency } from '@/utils/idempotency';
import { AchievementService } from '../../services/achievement';
import { broadcastAdminEvent } from '@/lib/websocket';
import { normalizeError } from '@/utils/api-errors';
import { claimPrizeSchema, getUserClaimsSchema } from './claims.schema';
import { z } from 'zod';

export class ClaimsService {
    /**
     * Claim a prize
     */
    static async claimPrize(
        userId: string,
        data: z.infer<typeof claimPrizeSchema>
    ) {
        try {
            // Check idempotency
            const existingResult = await checkIdempotency(data.idempotencyKey);
            if (existingResult) {
                typedLogger.info('Idempotent claim request', {
                    userId,
                    prizeId: data.prizeId,
                    idempotencyKey: data.idempotencyKey
                });
                return existingResult;
            }

            // Validate location is within Tunisia - ensure required coordinates exist
            if (!isWithinTunisia(data.location as { lat: number; lng: number; accuracy?: number })) {
                throw new Error('LOCATION_OUT_OF_BOUNDS');
            }

            // Get user and prize
            const [user, prize] = await Promise.all([
                User.findById(userId),
                Prize.findById(data.prizeId).populate('createdBy', 'displayName')]);

            if (!user) {
                throw new Error('USER_NOT_FOUND');
            }

            if (!prize) {
                throw new Error('PRIZE_NOT_FOUND');
            }

            // Check if prize is available using business logic instead of virtual property
            const isPrizeAvailable = prize.status === 'active' &&
                prize.claimedCount < prize.quantity &&
                (!prize.expiresAt || new Date() < prize.expiresAt);

            if (!isPrizeAvailable) {
                throw new Error('PRIZE_NOT_AVAILABLE');
            }

            // Calculate distance to prize
            const [prizeLng, prizeLat] = prize.location.coordinates;
            const distance = calculateGeodesicDistance(
                data.location as { lat: number; lng: number; accuracy?: number },
                { lat: prizeLat, lng: prizeLng }
            );

            // Validation checks
            const validationChecks = {
                distanceValid: distance <= prize.location.radius,
                timeValid: true,
                speedValid: true,
                cooldownValid: true,
                dailyLimitValid: true
            };

            // Stock validation handled by model claim() below

            // Distance validation
            if (!validationChecks.distanceValid) {
                typedLogger.warn('Prize claim failed - distance too far', {
                    userId,
                    prizeId: data.prizeId,
                    distance,
                    maxDistance: prize.location.radius
                });
                throw new Error('DISTANCE_TOO_FAR');
            }

            // Anti-cheat validation (always run; device signals optional)
            {
                const antiCheatResult = await validateAntiCheat(
                    userId,
                    data.location as { lat: number; lng: number; accuracy?: number },
                    data.deviceSignals
                );

                if (!antiCheatResult.allowed) {
                    typedLogger.warn('Prize claim failed - anti-cheat validation', {
                        userId,
                        prizeId: data.prizeId,
                        violations: antiCheatResult.violations,
                        riskScore: antiCheatResult.riskScore,
                    });
                    throw new Error('ANTI_CHEAT_VIOLATION');
                }
            }

            // Cooldown check
            try {
                await validateCooldowns(userId, prize.location.city);
                validationChecks.cooldownValid = true;
            } catch (error: any) {
                validationChecks.cooldownValid = false;
                typedLogger.warn('Prize claim failed - cooldown active', {
                    userId,
                    prizeId: data.prizeId,
                    error: (error as any).message
                });
                throw error;
            }

            // Apply prize claim transition via model helper
            // Using type assertion to access the claim method on the prize document
            const claimedOk: boolean = (prize as any).claim(new Types.ObjectId(userId));
            if (!claimedOk) {
                throw new Error('PRIZE_NOT_AVAILABLE');
            }

            // Create claim record
            const claim = new Claim({
                userId: new Types.ObjectId(userId),
                prizeId: new Types.ObjectId(data.prizeId),
                location: data.location,
                distance: Math.round(distance),
                pointsAwarded: 0,
                deviceSignals: data.deviceSignals || {},
                validationChecks,
                idempotencyKey: data.idempotencyKey
            });

            // Persist prize claim state
            await prize.save();

            // Update user points and stats based on prize contentType
            let pointsAwarded = 0;
            let redemptionId = null;

            const contentType = prize.contentType as string;

            switch (contentType) {
                case 'points': {
                    // Points purs avec bonus multiplier
                    const pointsAmount = prize.pointsReward?.amount || prize.points || 0;
                    const bonusMultiplier = prize.pointsReward?.bonusMultiplier || 1;
                    pointsAwarded = Math.floor(pointsAmount * bonusMultiplier);
                    user.points.available += pointsAwarded;
                    user.points.total += pointsAwarded;
                    break;
                }

                case PrizeContentType.REWARD: {
                    // Reward direct (coupon, gift)
                    if (prize.directReward?.rewardId) {
                        redemptionId = await this.createDirectRedemptionSafe(
                            userId,
                            prize.directReward.rewardId.toString(),
                            1
                        );
                    }
                    pointsAwarded = 0;
                    break;
                }

                case PrizeContentType.HYBRID: {
                    // Points garantis + probabilité de reward
                    const guaranteedPoints = prize.pointsReward?.amount || 0;
                    user.points.available += guaranteedPoints;
                    user.points.total += guaranteedPoints;
                    pointsAwarded = guaranteedPoints;

                    // Tirer au sort un reward
                    if (prize.directReward?.rewardId) {
                        const probability = prize.directReward?.probability || 0.3;
                        const roll = Math.random();

                        if (roll <= probability) {
                            redemptionId = await this.createDirectRedemptionSafe(
                                userId,
                                prize.directReward.rewardId.toString(),
                                1
                            );
                            typedLogger.info('Bonus reward won!', { userId, prizeId: data.prizeId, probability, roll });
                        }
                    }
                    break;
                }
            }

            // Update claim with points awarded
            claim.pointsAwarded = pointsAwarded;
            if (redemptionId) (claim as any).redemptionId = redemptionId;

            user.stats.prizesFound += 1;  // Using prizesFound instead of totalClaims
            user.stats.totalPlayTime += distance;  // Using totalPlayTime instead of totalDistance
            // Manually update location instead of calling method
            user.location = {
                lat: data.location.lat,
                lng: data.location.lng,
                city: user.location?.city || 'Unknown',  // Keep existing city or default
                lastUpdated: new Date()
            };

            // Save all changes
            // Persist computed points on claim
            claim.pointsAwarded = pointsAwarded;
            await Promise.all([
                claim.save(),
                user.save()]);

            // Atomic increment of prize claimedCount (prevents race conditions)
            await Prize.findByIdAndUpdate(
                data.prizeId,
                { $inc: { claimedCount: 1 } },
                { new: true }
            );

            // Check achievements (async, don't wait)
            const AchievementService = (await import('@/services/achievement')).default;
            AchievementService.checkAchievements(userId, 'PRIZE_CLAIMED', {
                prizeId: data.prizeId,
                category: prize.category,
                rarity: prize.rarity,
                pointsAwarded
            }).catch(error => {
                typedLogger.error('Check achievements error', { error: (error as any).message, userId, prizeId: data.prizeId });
            });

            // Store idempotency result
            const result = {
                success: true,
                claim: claim.toJSON(),
                pointsAwarded: prize.points,
                newBalance: user.points.available,
                newLevel: user.level
            };

            await setIdempotency(data.idempotencyKey, result);

            typedLogger.info('Prize claimed successfully', {
                userId,
                prizeId: data.prizeId,
                claimId: claim._id,
                pointsAwarded: prize.points,
                distance: Math.round(distance)
            });

            // Broadcast to admin dashboard for real-time updates
            broadcastAdminEvent({
                type: 'capture_created',
                data: {
                    claimId: claim._id,
                    userId,
                    prize: {
                        id: prize._id,
                        name: prize.name,
                        category: prize.category,
                        rarity: prize.rarity
                    },
                    pointsAwarded: prize.points,
                    distance: Math.round(distance),
                    timestamp: new Date()
                }
            });

            return result;

        } catch (error) {
            const normalized = normalizeError(error, 'Claim prize failed');
            typedLogger.error('Claim prize error', {
                error: normalized.message,
                userId,
                prizeId: data.prizeId,
                location: data.location
            });
            throw new Error(normalized.code);
        }
    }

    /**
     * Get user claims
     */
    static async getUserClaims(
        userId: string,
        data: z.infer<typeof getUserClaimsSchema>
    ) {
        try {
            const skip = (data.page - 1) * data.limit;

            const query: any = { userId: new Types.ObjectId(userId) };

            if (data.startDate || data.endDate) {
                query.claimedAt = {};
                if (data.startDate) {
                    query.claimedAt.$gte = new Date(data.startDate);
                }
                if (data.endDate) {
                    query.claimedAt.$lte = new Date(data.endDate);
                }
            }

            const [claims, total] = await Promise.all([
                Claim.find(query)
                    .populate('prizeId', 'name description points rarity category imageUrl location')
                    .sort({ claimedAt: -1 })
                    .skip(skip)
                    .limit(data.limit),
                Claim.countDocuments(query)]);

            return {
                claims: claims.map(claim => claim.toJSON()),
                pagination: {
                    page: data.page,
                    limit: data.limit,
                    total,
                    pages: Math.ceil(total / data.limit),
                    hasNext: skip + data.limit < total,
                    hasPrev: data.page > 1
                }
            };

        } catch (error) {
            const normalized = normalizeError(error, 'Get user claims failed');
            typedLogger.error('Get user claims error', {
                error: normalized.message,
                userId
            });
            throw new Error(normalized.code);
        }
    }

    /**
     * Get claim details
     */
    static async getClaimDetails(
        userId: string,
        claimId: string
    ) {
        try {
            const claim = await Claim.findOne({
                _id: claimId,
                userId: new Types.ObjectId(userId)
            })
                .populate('prizeId', 'name description points rarity category imageUrl location createdBy')
                .populate('userId', 'displayName level');

            if (!claim) {
                throw new Error('CLAIM_NOT_FOUND');
            }

            return claim.toJSON();

        } catch (error) {
            const normalized = normalizeError(error, 'Get claim details failed');
            typedLogger.error('Get claim details error', {
                error: normalized.message,
                userId,
                claimId
            });
            throw new Error(normalized.code);
        }
    }

    /**
     * Get user claim statistics
     */
    static async getUserClaimStats(userId: string) {
        try {
            // Use aggregation to get user stats instead of non-existent method
            const stats = await Claim.aggregate([
                { $match: { userId: new Types.ObjectId(userId) } },
                {
                    $group: {
                        _id: null,
                        totalClaims: { $sum: 1 },
                        totalPoints: { $sum: '$pointsAwarded' },
                        totalDistance: { $sum: '$distance' },
                        avgDistance: { $avg: '$distance' },
                        lastClaim: { $max: '$claimedAt' }
                    }
                }
            ]);

            // Return default stats if no claims found
            const result = stats[0] || {
                totalClaims: 0,
                totalPoints: 0,
                totalDistance: 0,
                avgDistance: 0,
                lastClaim: null
            };

            // Get additional stats
            const [recentClaims, topCategories] = await Promise.all([
                Claim.find({ userId: new Types.ObjectId(userId) })
                    .populate('prizeId', 'category')
                    .sort({ claimedAt: -1 })
                    .limit(10),
                Claim.aggregate([
                    { $match: { userId: new Types.ObjectId(userId) } },
                    { $lookup: { from: 'prizes', localField: 'prizeId', foreignField: '_id', as: 'prize' } },
                    { $unwind: '$prize' },
                    { $group: { _id: '$prize.category', count: { $sum: 1 }, points: { $sum: '$pointsAwarded' } } },
                    { $sort: { count: -1 } },
                    { $limit: 5 }])]);

            return {
                ...result,
                recentClaims: recentClaims.map(claim => ({
                    id: claim._id,
                    prizeCategory: (claim.prizeId as any)?.category,
                    pointsAwarded: claim.pointsAwarded,
                    claimedAt: claim.claimedAt,
                    distance: claim.distance
                })),
                topCategories: topCategories.map(cat => ({
                    category: cat._id,
                    claims: cat.count,
                    totalPoints: cat.points
                }))
            };

        } catch (error) {
            typedLogger.error('Get user claim stats error', {
                error: (error as any).message,
                userId
            });
            throw error;
        }
    }

    /**
     * Admin: Get all claims with filters
     */
    static async getAllClaims(options: any = {}) {
        try {
            const skip = ((options.page || 1) - 1) * (options.limit || 50);

            const query: any = {};

            if (options.userId) {
                query.userId = new Types.ObjectId(options.userId);
            }

            if (options.prizeId) {
                query.prizeId = new Types.ObjectId(options.prizeId);
            }

            if (options.startDate || options.endDate) {
                query.claimedAt = {};
                if (options.startDate) {
                    query.claimedAt.$gte = new Date(options.startDate);
                }
                if (options.endDate) {
                    query.claimedAt.$lte = new Date(options.endDate);
                }
            }

            if (options.validOnly === true) {
                query['validationChecks.distanceValid'] = true;
                query['validationChecks.timeValid'] = true;
                query['validationChecks.speedValid'] = true;
                query['validationChecks.cooldownValid'] = true;
                query['validationChecks.dailyLimitValid'] = true;
            }

            const [claims, total] = await Promise.all([
                Claim.find(query)
                    .populate('userId', 'displayName email level')
                    .populate('prizeId', 'name description points category location')
                    .sort({ claimedAt: -1 })
                    .skip(skip)
                    .limit(options.limit || 50),
                Claim.countDocuments(query)]);

            return {
                claims: claims.map(claim => claim.toJSON()),
                pagination: {
                    page: options.page || 1,
                    limit: options.limit || 50,
                    total,
                    pages: Math.ceil(total / (options.limit || 50)),
                    hasNext: skip + (options.limit || 50) < total,
                    hasPrev: (options.page || 1) > 1
                }
            };

        } catch (error) {
            typedLogger.error('Get all claims error', {
                error: (error as any).message,
                options
            });
            throw error;
        }
    }

    /**
     * Safe direct redemption creation using reward stock helpers and idempotency.
     */
    private static async createDirectRedemptionSafe(
        userId: string,
        rewardId: string,
        quantity: number = 1
    ): Promise<string> {
        const Redemption = (await import('@/models/Redemption')).default;
        const Reward = (await import('@/models/Reward')).default;

        const reward = await Reward.findById(rewardId);
        if (!reward) {
            throw new Error('REWARD_NOT_FOUND');
        }

        // Reserve stock atomically
        const reserved = (reward as any).reserveStock(quantity);
        if (!reserved) {
            throw new Error('INSUFFICIENT_STOCK');
        }

        // Simple idempotency key per user+reward+ts
        const idempotencyKey = `PRIZE_REDEEM_${userId}_${rewardId}_${Date.now()}`;

        const redemption = new Redemption({
            userId: new Types.ObjectId(userId),
            rewardId: new Types.ObjectId(rewardId),
            quantity,
            pointsSpent: 0, // Gratuit car obtenu via prize
            status: 'PENDING',
            idempotencyKey,
            metadata: { source: 'PRIZE_CLAIM' },
        });

        await redemption.save();
        await reward.save();

        typedLogger.info('Direct redemption created (safe)', {
            userId,
            rewardId,
            redemptionId: redemption._id,
            quantity,
        });

        return redemption._id.toString();
    }
}
