import { z } from 'zod';
import { Types } from 'mongoose';
import { Reward } from '@/models/Reward';
import { Redemption } from '@/models/Redemption';
import { Code } from '@/models/Code';
import { User } from '@/models/User';
import { typedLogger } from '@/lib/typed-logger';
import { broadcastAdminEvent } from '@/lib/websocket';
import { RewardCategory, RedemptionStatus, CodeStatus, ListingType } from '@/types';
import { checkIdempotency, setIdempotency } from '@/utils/idempotency';
import { normalizeError } from '@/utils/api-errors';
import QRCode from 'qrcode';
import {
    getRewardsSchema,
    searchRewardsSchema,
    redeemRewardSchema,
    createRewardSchema,
    updateRewardSchema,
    addStockSchema
} from './rewards.schema';

/**
 * Rewards service
 */
export class RewardsService {
    /**
     * Get available rewards
     */
    static async getRewards(data: z.infer<typeof getRewardsSchema>) {
        try {
            const skip = (data.page - 1) * data.limit;

            const query: any = {
                isActive: true,
                stockAvailable: { $gt: 0 },
                listingType: data.listingType || ListingType.GAME_REWARD
            };

            if (data.category) query.category = data.category;
            if (data.maxCost) query.pointsCost = { ...query.pointsCost, $lte: data.maxCost };
            if (data.minCost) {
                query.pointsCost = { ...query.pointsCost, $gte: data.minCost };
            }

            // Build sort object
            let sort: any = {};
            if (data.sort === 'popularity') {
                sort = { 'stats.redemptionsCount': -1 }; // Sort by redemption count
            } else if (data.sort === 'pointsCost') {
                sort = { pointsCost: 1 };
            } else {
                sort = { name: 1 };
            }

            const [rewards, total] = await Promise.all([
                Reward.find(query)
                    .populate('partnerId', 'name logoUrl')
                    .sort(sort)
                    .skip(skip)
                    .limit(data.limit),
                Reward.countDocuments(query)
            ]);

            return {
                rewards: rewards.map(reward => {
                    // Add isAvailable property to match expected format
                    return {
                        ...reward.toJSON(),
                        isAvailable: reward.stockAvailable > 0
                    };
                }),
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
            const normalized = normalizeError(error, 'Get rewards failed');
            typedLogger.error('Get rewards error', {
                error: normalized.message,
                filters: data
            });
            throw new Error(normalized.code);
        }
    }

    /**
     * Search rewards
     */
    static async searchRewards(data: z.infer<typeof searchRewardsSchema>) {
        try {
            const query: any = {
                $text: { $search: data.query },  // Assumes a text index is created on name and description
                isActive: true,
                stockAvailable: { $gt: 0 }
            };

            if (data.category) query.category = data.category;

            const rewards = await Reward.find(query)
                .populate('partnerId', 'name logoUrl')
                .limit(data.limit);

            return {
                rewards: rewards.map(reward => ({
                    ...reward.toJSON(),
                    isAvailable: reward.stockAvailable > 0
                })),
                query: data.query,
                total: rewards.length
            };

        } catch (error) {
            const normalized = normalizeError(error, 'Search rewards failed');
            typedLogger.error('Search rewards error', {
                error: normalized.message,
                query: data.query
            });
            throw new Error(normalized.code);
        }
    }

    /**
     * Get reward details
     */
    static async getRewardDetails(rewardId: string, userId?: string) {
        try {
            const reward = await Reward.findById(rewardId)
                .populate('partnerId', 'name logoUrl website');

            if (!reward) {
                throw new Error('REWARD_NOT_FOUND');
            }

            const result: any = {
                ...reward.toJSON(),
                canRedeem: reward.stockAvailable > 0,
                isAvailable: reward.stockAvailable > 0
            };

            // Check if user can afford this reward
            if (userId) {
                const user = await User.findById(userId);
                if (user) {
                    result.canAfford = user.points.available >= reward.pointsCost;
                    result.canRedeem = result.canRedeem && result.canAfford;
                }
            }

            return result;

        } catch (error) {
            const normalized = normalizeError(error, 'Get reward details failed');
            typedLogger.error('Get reward details error', {
                error: normalized.message,
                rewardId,
                userId
            });
            throw new Error(normalized.code);
        }
    }

    /**
     * Redeem a reward
     */
    static async redeemReward(
        userId: string,
        data: z.infer<typeof redeemRewardSchema>
    ) {
        try {
            // Check idempotency
            const existingResult = await checkIdempotency(data.idempotencyKey);
            if (existingResult) {
                typedLogger.info('Idempotent redemption request', {
                    userId,
                    rewardId: data.rewardId,
                    idempotencyKey: data.idempotencyKey
                });
                return existingResult;
            }

            // Get user and reward
            const [user, reward] = await Promise.all([
                User.findById(userId),
                Reward.findById(data.rewardId).populate('partnerId', 'name')]);

            if (!user) {
                throw new Error('USER_NOT_FOUND');
            }

            if (!reward) {
                throw new Error('REWARD_NOT_FOUND');
            }

            if (reward.stockAvailable <= 0) {
                throw new Error('REWARD_NOT_AVAILABLE');
            }

            if (user.points.available < reward.pointsCost) {
                throw new Error('INSUFFICIENT_POINTS');
            }

            // Check stock availability
            if (reward.stockAvailable < 1) {
                throw new Error('OUT_OF_STOCK');
            }

            // ATOMIC: Reserve stock first (will fail if stock < 1)
            const reservedReward = await Reward.atomicReserveStock(data.rewardId, 1);
            if (!reservedReward) {
                throw new Error('OUT_OF_STOCK');
            }

            try {
                // ATOMIC: Deduct points from user (will fail if insufficient)
                const updatedUser = await User.atomicSpendPoints(userId, reward.pointsCost);
                if (!updatedUser) {
                    // Rollback stock reservation
                    await Reward.atomicReleaseReservation(data.rewardId, 1);
                    throw new Error('INSUFFICIENT_POINTS');
                }

                // Try to get a code for this reward
                const code = await Code.reserveCode(
                    new Types.ObjectId(data.rewardId),
                    new Types.ObjectId(userId)
                );

                // Create redemption record
                const redemption = new Redemption({
                    userId: new Types.ObjectId(userId),
                    rewardId: new Types.ObjectId(data.rewardId),
                    pointsSpent: reward.pointsCost,
                    status: RedemptionStatus.PENDING,
                    codeId: code?._id,
                    idempotencyKey: data.idempotencyKey
                });

                await redemption.save();

                // ATOMIC: Confirm redemption (move from reserved to confirmed)
                await Reward.atomicConfirmRedemption(data.rewardId, 1);

                // Prepare result
                const result = {
                    success: true,
                    redemption: {
                        id: redemption._id,
                        status: redemption.status,
                        pointsSpent: redemption.pointsSpent,
                        redeemedAt: redemption.createdAt,
                        code: code ? {
                            id: code._id,
                            code: code.code,
                            poolName: code.poolName
                        } : null
                    },
                    newBalance: user.points.available,
                    reward: {
                        id: reward._id,
                        name: reward.name,
                        category: reward.category,
                        partner: reward.partnerId
                    }
                };

                // Store idempotency result
                await setIdempotency(data.idempotencyKey, result);

                typedLogger.info('Reward redeemed successfully', {
                    userId,
                    rewardId: data.rewardId,
                    redemptionId: redemption._id,
                    pointsSpent: reward.pointsCost,
                    hasCode: !!code
                });

                return result;

            } catch (innerError) {
                // Rollback stock reservation on any failure
                await Reward.atomicReleaseReservation(data.rewardId, 1);
                throw innerError;
            }

        } catch (error) {
            typedLogger.error('Redeem reward error', {
                error: (error as any).message,
                userId,
                rewardId: data.rewardId
            });
            throw error;
        }
    }

    /**
     * Get user redemptions
     */
    static async getUserRedemptions(userId: string, options: any = {}) {
        try {
            const page = options.page || 1;
            const limit = options.limit || 20;
            const skip = (page - 1) * limit;

            const query: any = {
                userId: new Types.ObjectId(userId)
            };

            const [redemptions, total] = await Promise.all([
                Redemption.find(query)
                    .populate('rewardId', 'name description pointsCost')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit),
                Redemption.countDocuments(query)
            ]);

            return {
                redemptions: redemptions.map(redemption => redemption.toJSON()),
                total,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit),
                    hasNext: skip + limit < total,
                    hasPrev: page > 1
                }
            };

        } catch (error) {
            typedLogger.error('Get user redemptions error', {
                error: (error as any).message,
                userId
            });
            throw error;
        }
    }


    /**
     * Get reward categories
     */
    static async getRewardCategories(): Promise<string[]> {
        try {
            const categories = await Reward.distinct('category');
            return categories as string[];
        } catch (error) {
            typedLogger.error('Get reward categories error', { error: (error as any).message });
            throw error;
        }
    }

    /**
     * Get featured rewards
     */
    static async getFeaturedRewards(limit: number = 10): Promise<any[]> {
        try {
            return await Reward.find({
                isPopular: true,
                isActive: true,
                stockAvailable: { $gt: 0 }
            })
                .sort({ pointsCost: 1 }) // cheapest first
                .limit(limit);
        } catch (error) {
            typedLogger.error('Get featured rewards error', { error: (error as any).message });
            throw error;
        }
    }

    /**
     * Add reward to favorites
     */
    static async addToFavorites(userId: string, rewardId: string): Promise<any> {
        try {
            // Validate reward exists
            const reward = await Reward.findById(rewardId);
            if (!reward) {
                throw new Error('REWARD_NOT_FOUND');
            }

            // Add to user's favorites using $addToSet (prevents duplicates)
            await (User as any).findByIdAndUpdate(userId, {
                $addToSet: { favorites: rewardId }
            });

            return { success: true, rewardId, message: 'Added to favorites' };
        } catch (error) {
            typedLogger.error('Add to favorites error', { error: (error as any).message, userId, rewardId });
            throw error;
        }
    }

    /**
     * Remove reward from favorites
     */
    static async removeFromFavorites(userId: string, rewardId: string): Promise<any> {
        try {
            // Validate reward exists
            const reward = await Reward.findById(rewardId);
            if (!reward) {
                throw new Error('REWARD_NOT_FOUND');
            }

            // Remove from user's favorites using $pull
            await (User as any).findByIdAndUpdate(userId, {
                $pull: { favorites: rewardId }
            });

            return { success: true, rewardId, message: 'Removed from favorites' };
        } catch (error) {
            typedLogger.error('Remove from favorites error', { error: (error as any).message, userId, rewardId });
            throw error;
        }
    }

    /**
     * Get user's favorite rewards
     */
    static async getFavoriteRewards(userId: string): Promise<any[]> {
        try {
            // Populate favorites from User model
            const user = await (User as any).findById(userId).populate('favorites');

            if (!user) {
                throw new Error('USER_NOT_FOUND');
            }

            return user.favorites || [];
        } catch (error) {
            typedLogger.error('Get favorite rewards error', { error: (error as any).message, userId });
            throw error;
        }
    }

    /**
     * Get redemption history for user
     */
    static async getRedemptionHistory(userId: string, options: any = {}): Promise<any> {
        try {
            const page = options.page || 1;
            const limit = options.limit || 20;
            const skip = (page - 1) * limit;

            const query: any = { userId: new Types.ObjectId(userId) };

            // Apply status filter if provided
            if (options.status && options.status !== 'all') {
                if (options.status === 'active') {
                    query.status = { $in: [RedemptionStatus.PENDING] };  // Only pending redemptions are "active"
                } else if (options.status === 'used') {
                    query.status = RedemptionStatus.FULFILLED;
                } else if (options.status === 'expired') {
                    // This would require checking expiration dates
                    // For now, we'll skip this since expiration logic isn't fully defined
                }
            }

            const [redemptions, total] = await Promise.all([
                Redemption.find(query)
                    .populate('rewardId', 'name description pointsCost')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit),
                Redemption.countDocuments(query)
            ]);

            return {
                redemptions: redemptions.map(r => ({
                    id: r._id,
                    reward: r.rewardId,
                    pointsSpent: r.pointsSpent,
                    status: r.status,
                    createdAt: r.createdAt
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    hasMore: skip + limit < total
                }
            };
        } catch (error) {
            typedLogger.error('Get redemption history error', { error: (error as any).message, userId });
            throw error;
        }
    }

    /**
     * Scan QR code for redemption
     */
    static async scanQRCode(userId: string, data: any): Promise<any> {
        try {
            // Decode QR code data from base64
            let qrData: any;

            try {
                // Try to decode from base64
                if (data.qrCode.startsWith('ey') || data.qrCode.length > 100) { // Likely base64 encoded
                    const decodedStr = Buffer.from(data.qrCode, 'base64').toString('utf-8');
                    qrData = JSON.parse(decodedStr);
                } else {
                    // Direct JSON string
                    qrData = JSON.parse(data.qrCode);
                }
            } catch (parseError) {
                // If parsing fails, treat the qrCode as a direct code
                qrData = {
                    type: 'yallacatch_redemption',
                    code: data.qrCode,
                    itemId: data.itemId || null,
                    timestamp: Date.now()
                };
            }

            // Validate QR code data
            if (!qrData.code) {
                throw new Error('INVALID_QR_CODE_MISSING_CODE');
            }

            if (qrData.type !== 'yallacatch_redemption') {
                throw new Error('INVALID_QR_CODE_TYPE');
            }

            // First, get the current user to check authorization
            const currentUser = await User.findById(userId);
            if (!currentUser) {
                throw new Error('USER_NOT_FOUND');
            }

            // Find the redemption associated with this code
            // Check if this is a marketplace redemption first
            let redemption = await Redemption.findOne({
                'metadata.redemptionCode': qrData.code,
                status: RedemptionStatus.PENDING
            });

            // If not found in marketplace, try searching in the Code model
            if (!redemption) {
                const code = await Code.findOne({
                    code: qrData.code,
                    status: CodeStatus.AVAILABLE
                });

                if (code) {
                    redemption = await Redemption.findOne({
                        codeId: code._id,
                        status: RedemptionStatus.PENDING
                    });
                }
            }

            if (!redemption) {
                throw new Error('REDEMPTION_NOT_FOUND_OR_ALREADY_FULFILLED');
            }

            // Check redemption status
            if (redemption.status === RedemptionStatus.FULFILLED) {
                throw new Error('REDEMPTION_ALREADY_FULFILLED');
            }

            if (redemption.status === RedemptionStatus.CANCELLED) {
                throw new Error('REDEMPTION_CANCELLED');
            }

            // Authorization check: Only the original user or an authorized partner can scan
            const redemptionUser = await User.findById(redemption.userId);
            if (!redemptionUser) {
                throw new Error('REDEMPTION_USER_NOT_FOUND');
            }

            const reward = await Reward.findById(redemption.rewardId).populate('partnerId', 'name');
            if (!reward) {
                throw new Error('REWARD_NOT_FOUND');
            }

            const { UserRole } = await import('@/types');
            const isAdminOrMod = [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MODERATOR].includes(currentUser.role as any);
            const isSameUser = redemption.userId.toString() === userId;
            const isPartnerUser = currentUser.role === UserRole.PARTNER
                && currentUser.partnerId
                && reward.partnerId
                && currentUser.partnerId.toString() === (reward as any).partnerId._id?.toString();

            if (!isAdminOrMod && !isPartnerUser && !isSameUser) {
                throw new Error('UNAUTHORIZED_REDEMPTION_SCAN');
            }

            // Update redemption status to FULFILLED
            redemption.status = RedemptionStatus.FULFILLED;
            redemption.fulfilledAt = new Date();
            // Set fulfilledBy field (assuming it exists in the schema)
            (redemption as any).fulfilledBy = new Types.ObjectId(userId); // This could be partner or user depending on who scanned

            await redemption.save();

            // Update user redemption stats
            const redeemedUser = await User.findById(redemption.userId);
            if (redeemedUser) {
                (redeemedUser as any).stats.redemptionsFulfilled = ((redeemedUser as any).stats.redemptionsFulfilled || 0) + 1;
                await redeemedUser.save();
            }

            // Log redemption fulfillment
            typedLogger.info('QR code redemption fulfilled', {
                redemptionId: redemption._id,
                code: qrData.code,
                userId: userId,
                fulfilledBy: userId,
                fulfilledAt: redemption.fulfilledAt
            });

            // Notify partner/admins of fulfillment
            broadcastAdminEvent({
                type: 'redemption_fulfilled',
                data: {
                    redemptionId: redemption._id,
                    userId: redemption.userId,
                    rewardId: redemption.rewardId,
                    fulfilledBy: userId,
                    partnerId: (reward as any).partnerId?._id || (reward as any).partnerId,
                    timestamp: new Date()
                }
            });

            return {
                success: true,
                redemption: {
                    id: redemption._id,
                    status: redemption.status,
                    pointsSpent: redemption.pointsSpent,
                    fulfilledAt: redemption.fulfilledAt,
                    rewardId: redemption.rewardId,
                    reward: {
                        id: reward._id,
                        name: reward.name,
                        partner: (reward as any).partnerId || null
                    }
                },
                data: qrData,
                userId,
                scannedAt: new Date()
            };

        } catch (error) {
            typedLogger.error('Scan QR code error', { error: (error as any).message, userId, data });
            throw error;
        }
    }

    /**
     * Redeem a promo code (points-only or reward -> QR)
     */
    static async redeemPromoCode(userId: string, data: { code: string }) {
        const codeStr = (data.code || '').trim().toUpperCase();
        if (!codeStr) {
            throw new Error('INVALID_CODE');
        }

        const codeDoc = await Code.findOne({
            code: codeStr,
            isActive: true,
            status: CodeStatus.AVAILABLE,
            $or: [
                { expiresAt: { $exists: false } },
                { expiresAt: { $gt: new Date() } }
            ]
        });

        if (!codeDoc) {
            throw new Error('CODE_NOT_AVAILABLE');
        }

        // Reward-linked promo code: create redemption and return QR payload
        if (codeDoc.rewardId) {
            const reward = await Reward.findById(codeDoc.rewardId).populate('partnerId', 'name');
            if (!reward) {
                throw new Error('REWARD_NOT_FOUND');
            }
            if ((reward as any).stockAvailable <= 0) {
                throw new Error('REWARD_NOT_AVAILABLE');
            }

            const redemption = new Redemption({
                userId: new Types.ObjectId(userId),
                rewardId: reward._id,
                pointsSpent: 0,
                status: RedemptionStatus.PENDING,
                codeId: codeDoc._id,
                idempotencyKey: `promo-${codeDoc._id}-${userId}-${Date.now()}`,
                metadata: { redemptionCode: codeDoc.code }
            });

            (reward as any).stockAvailable = Math.max(0, (reward as any).stockAvailable - 1);
            (reward as any).stockReserved = ((reward as any).stockReserved || 0) + 1;

            codeDoc.status = CodeStatus.USED;
            codeDoc.isUsed = true;
            codeDoc.usedBy = new Types.ObjectId(userId);
            codeDoc.usedAt = new Date();

            await Promise.all([
                redemption.save(),
                reward.save(),
                codeDoc.save()
            ]);

            const qrData = JSON.stringify({
                type: 'yallacatch_redemption',
                code: codeDoc.code,
                redemptionId: redemption._id.toString(),
                rewardId: reward._id.toString(),
                partnerId: (reward as any).partnerId?._id?.toString() || null
            });

            // Generate actual QR code as data URL (PNG image)
            const qrPayload = await QRCode.toDataURL(qrData, {
                errorCorrectionLevel: 'M',
                type: 'image/png',
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });

            typedLogger.info('Promo code redeemed for reward', {
                userId,
                code: codeDoc.code,
                rewardId: reward._id,
                redemptionId: redemption._id
            });

            return {
                success: true,
                type: 'reward',
                redemption: {
                    id: redemption._id,
                    status: redemption.status,
                    code: codeDoc.code,
                    reward: {
                        id: reward._id,
                        name: reward.name,
                        category: reward.category,
                        partner: (reward as any).partnerId || null
                    }
                },
                qr: qrPayload
            };
        }

        // Points-only promo code
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('USER_NOT_FOUND');
        }

        const points = codeDoc.pointsValue || 0;
        if (points > 0) {
            // atomicAddPoints only takes 2 arguments (userId, points)
            await User.atomicAddPoints(userId, points);

            codeDoc.status = CodeStatus.USED;
            codeDoc.isUsed = true;
            codeDoc.usedBy = new Types.ObjectId(userId);
            codeDoc.usedAt = new Date();
            await codeDoc.save();

            typedLogger.info('Promo code redeemed for points', {
                userId,
                code: codeDoc.code,
                points
            });

            return {
                success: true,
                type: 'points',
                points,
                newBalance: user.points.available + points
            };
        }

        return {
            success: false,
            error: 'INVALID_CODE_TYPE'
        };
    }
}
