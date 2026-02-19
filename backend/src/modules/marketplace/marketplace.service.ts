import { Types } from 'mongoose';
import mongoose from 'mongoose';
import QRCode from 'qrcode';
import { User } from '@/models/User';
import { Partner } from '@/models/Partner';
import { AuditLog } from '@/models/AuditLog';
import { Reward } from '@/models/Reward';
import { Redemption } from '@/models/Redemption';
import { Code } from '@/models/Code';
import { redisClient } from '@/config/redis';
import { typedLogger } from '@/lib/typed-logger';
import { broadcastAdminEvent } from '@/lib/websocket';
import { RedemptionStatus, IRedemption, IReward, ListingType } from '@/types';
import { MarketplaceResponse, PurchaseResult } from './marketplace.types';

export class MarketplaceService {
    private static redis = redisClient;
    private static FILTER_CACHE_KEY = 'marketplace:filters:v1';

    /**
     * Get marketplace items with filtering and user context
     */
    static async getMarketplace(
        userId: string,
        filters: {
            category?: string;
            minPoints?: number;
            maxPoints?: number;
            location?: { latitude: number; longitude: number };
            search?: string;
            featured?: boolean;
            page?: number;
            limit?: number;
        } = {}
    ): Promise<MarketplaceResponse> {
        try {
            const {
                category,
                minPoints,
                maxPoints,
                location,
                search,
                featured,
                page = 1,
                limit = 20
            } = filters;
            const safeLimit = Math.min(100, Math.max(1, limit || 20));
            const safePage = Math.max(1, page || 1);

            // Build marketplace query
            const query: Record<string, unknown> = { isActive: true, stockAvailable: { $gt: 0 }, listingType: ListingType.MARKETPLACE_ITEM };
            if (category) query.category = category;
            if (minPoints !== undefined || maxPoints !== undefined) {
                const pointsCostFilter: Record<string, number> = {};
                if (minPoints !== undefined) pointsCostFilter.$gte = minPoints;
                if (maxPoints !== undefined) pointsCostFilter.$lte = maxPoints;
                query.pointsCost = pointsCostFilter;
            }
            if (featured) query.isPopular = true;
            if (search) {
                query.$text = { $search: search };
            }

            const [rewards, totalItems, user] = await Promise.all([
                Reward.find(query)
                    .populate('partnerId', 'name logo')
                    .sort({ isPopular: -1, createdAt: -1 })
                    .skip((safePage - 1) * safeLimit)
                    .limit(safeLimit)
                    .lean(),
                Reward.countDocuments(query),
                User.findById(userId).select('points').lean(),
            ]);

            const pointsAvailable = (user as { points?: { available?: number } } | null)?.points?.available || 0;
            const enhancedItems = rewards.map((r) => ({
                id: r._id.toString(),
                title: r.name,
                description: r.description,
                category: r.category,
                pointsCost: r.pointsCost,
                images: r.imageUrl ? [r.imageUrl] : [],
                partnerName: (r.partnerId as { name?: string } | undefined)?.name || null,
                partnerLogo: (r.partnerId as { logo?: string } | undefined)?.logo || null,
                canAfford: pointsAvailable >= r.pointsCost,
                stockStatus: this.getStockStatus(r.stockQuantity ?? -1, (r.stockQuantity ?? 0) - (r.stockAvailable ?? 0)),
                stockAvailable: r.stockAvailable ?? 0,
                savings: (r.metadata as { originalValue?: number } | undefined)?.originalValue ? ((r.metadata as { originalValue: number }).originalValue - (r.pointsCost * 0.01)) : null,
            }));

            const filters_data = await this.getFilterOptions();

            // Extract unique categories using a Set
            const categorySet = new Set<string>();
            for (const r of rewards) {
                categorySet.add(r.category);
            }
            const uniqueCategories = Array.from(categorySet);

            return {
                items: enhancedItems,
                categories: uniqueCategories,
                totalItems,
                filters: filters_data,
                userInfo: {
                    currentPoints: pointsAvailable,
                    canAfford: enhancedItems.filter(i => i.canAfford).length,
                    recentPurchases: 0
                }
            };
        } catch (error) {
            typedLogger.error('Get marketplace error', { error: error instanceof Error ? error.message : String(error), userId, filters });
            throw error;
        }
    }

    /**
     * Purchase/redeem an item with points
     */
    static async purchaseItem(userId: string, purchaseData: {
        itemId: string;
        location?: { latitude: number; longitude: number };
        deviceInfo?: { platform: string; version: string };
    }): Promise<PurchaseResult> {
        try {
            const { itemId, location, deviceInfo } = purchaseData;

            // Get item and user
            const [item, user] = await Promise.all([
                Reward.findById(itemId).populate('partnerId', 'name logo'),
                User.findById(userId)
            ]);

            if (!item || !item.isActive) {
                throw new Error('ITEM_NOT_AVAILABLE');
            }

            if (!user) {
                throw new Error('USER_NOT_FOUND');
            }

            // Check if user is guest
            if (user.isGuest) {
                throw new Error('GUEST_CANNOT_REDEEM');
            }

            // Validate user can afford item
            const userAvailablePoints = user.points?.available || 0;
            const itemCost = item.pointsCost || 0;
            if (userAvailablePoints < itemCost) {
                throw new Error('INSUFFICIENT_POINTS');
            }

            // Check stock availability - properly validate quantities exist
            const itemStockQuantity = item.stockQuantity || 0;
            const itemStockAvailable = item.stockAvailable || 0;
            if (itemStockQuantity !== -1 && itemStockAvailable <= 0) {
                throw new Error('OUT_OF_STOCK');
            }

            // Check user purchase limit - convert userId to ObjectId for query
            const userRedemptions = await Redemption.countDocuments({
                userId: new Types.ObjectId(userId),
                rewardId: item._id,
                status: { $in: ['PENDING', 'FULFILLED', 'CANCELLED'] }
            });

            const maxPurchases = (item.metadata as Record<string, unknown> | undefined)?.maxPerUser as number || Number.MAX_SAFE_INTEGER;
            if (userRedemptions >= maxPurchases) {
                throw new Error('MAX_PURCHASES_EXCEEDED');
            }

            // Check location restrictions
            if (location && item.metadata?.availableLocations && item.metadata.availableLocations.length > 0) {
                const isLocationValid = await this.validateLocation(location, item.metadata.availableLocations);
                if (!isLocationValid) {
                    throw new Error('LOCATION_NOT_SUPPORTED');
                }
            }

            // Generate redemption code from the code pools first
            const redemptionCode = await Code.reserveCode(item._id, new Types.ObjectId(userId));
            if (!redemptionCode) {
                throw new Error('FAILED_TO_GENERATE_REDEMPTION_CODE');
            }

            // Generate QR code using the redemption code from Code model
            const qrCodeData = await this.generateQRCode(redemptionCode.code, item._id.toString());

            // Calculate validity period
            const validUntil = new Date();
            validUntil.setDate(validUntil.getDate() + (item.metadata?.usageValidityDays || 30));

            // Compute partner commission and settlement metadata - validate item.partnerId exists before use
            let commissionRate = 0;
            if (item.partnerId) {
                try {
                    const partner = await Partner.findById(item.partnerId);
                    if (partner) {
                        commissionRate = (partner as { commissionRate?: number }).commissionRate || 0;
                    }
                } catch {
                    // Default to 0 commission rate if partner lookup fails
                    commissionRate = 0;
                }
            }
            const POINTS_TO_CURRENCY_RATE = 0.01; // TODO: move to config/settings
            const itemPointsCost = item.pointsCost || 0;
            const grossValue = +(itemPointsCost * POINTS_TO_CURRENCY_RATE).toFixed(2);
            const platformShare = +(grossValue * (commissionRate / 100)).toFixed(2);
            const partnerShare = +(grossValue - platformShare).toFixed(2);

            // Create redemption record with proper typing
            const redemption = new Redemption({
                userId: new Types.ObjectId(userId),
                rewardId: item._id,
                pointsSpent: itemPointsCost,
                status: 'PENDING',
                codeId: redemptionCode._id,
                redeemedAt: undefined,
                idempotencyKey: `${userId}-${item._id.toString()}-${Date.now()}`,
                metadata: {
                    source: 'marketplace',
                    commissionRateApplied: commissionRate,
                    grossValue,
                    partnerShare,
                    platformShare,
                    redemptionCode: redemptionCode.code
                }
            });

            // Execute transaction with MongoDB session
            const session = await mongoose.startSession();
            session.startTransaction();

            try {
                // Save redemption with session
                await redemption.save({ session });

                // Update user points and stats with session (using properly typed values)
                await User.findByIdAndUpdate(userId, {
                    $inc: {
                        'points.available': -itemPointsCost,
                        'points.spent': itemPointsCost,
                        'stats.totalRedemptions': 1,
                        'stats.totalPointsSpent': itemPointsCost
                    },
                    $push: {
                        'purchaseHistory': {
                            rewardId: item._id,
                            pointsSpent: itemPointsCost,
                            purchasedAt: new Date()
                        }
                    }
                }, { session });

                // Update item stock with session - use proper item ID instead of undefined var
                await Reward.findByIdAndUpdate(item._id, {
                    $inc: {
                        stockReserved: 1,
                        stockAvailable: -1
                    }
                }, { session });

                // Commit transaction
                await session.commitTransaction();
            } catch (error) {
                // Rollback transaction on error
                await session.abortTransaction();
                throw error;
            } finally {
                // End session
                session.endSession();
            }

            // Log purchase
            typedLogger.info('Item purchased successfully', {
                userId,
                itemId,
                pointsSpent: item.pointsCost,
                redemptionId: redemption._id.toString()
            });

            // Audit log
            try {
                // Create audit log using the model directly since TypeScript doesn't recognize the static method
                const auditLog = new AuditLog({
                    userId: new Types.ObjectId(userId),
                    action: 'marketplace_purchase',
                    resource: 'reward',
                    resourceId: item._id.toString(),
                    category: 'business',
                    severity: 'low',
                    success: true,
                    description: `Purchased ${item.name} for ${item.pointsCost} points`,
                    metadata: {
                        commissionRate,
                        grossValue,
                        partnerShare,
                        platformShare,
                        redemptionId: redemption._id.toString()
                    },
                    timestamp: new Date()
                });
                await auditLog.save();
            } catch { }

            // Track purchase analytics
            await this.trackPurchaseAnalytics(userId, item, redemption);

            // Trigger achievements (async, don't wait)
            import('@/services/achievement').then(({ default: AchievementService }) => {
                AchievementService.checkAchievements(userId, 'REWARD_REDEEMED', {
                    rewardId: item._id.toString(),
                    pointsSpent: item.pointsCost,
                    redemptionId: redemption._id.toString()
                }).catch(error => {
                    typedLogger.error('Check achievements error (REWARD_REDEEMED)', { error: error instanceof Error ? error.message : String(error), userId });
                });
            });

            // Broadcast to admin dashboard for real-time updates
            broadcastAdminEvent({
                type: 'redemption_created',
                data: {
                    redemptionId: redemption._id.toString(),
                    userId,
                    reward: {
                        id: item._id.toString(),
                        name: item.name,
                        category: item.category,
                        pointsCost: item.pointsCost
                    },
                    status: redemption.status,
                    timestamp: new Date()
                }
            });

            return {
                success: true,
                redemption: {
                    id: redemption._id.toString(),
                    code: redemptionCode.code,  // Using the actual redemption code from the Code model
                    qrCode: qrCodeData,  // Including the QR code data
                    item: {
                        title: item.name,
                        description: item.description,
                        partnerName: (item.partnerId as { name?: string } | undefined)?.name,
                        originalValue: (item.metadata as Record<string, unknown> | undefined)?.originalValue as number | undefined,
                        currency: 'TND'
                    },  // Default currency
                    validUntil: validUntil.toISOString(), // Using the calculated validity period
                    howToRedeem: item.metadata?.howToRedeem || 'Show this QR code to partner for redemption'
                },
                userBalance: {
                    previousPoints: user.points?.available || 0,
                    pointsSpent: item.pointsCost,
                    remainingPoints: (user.points?.available || 0) - item.pointsCost
                },
                message: `Successfully purchased ${item.name}! Show the QR code to a partner for redemption.`
            };
        } catch (error) {
            typedLogger.error('Purchase item error', { error: error instanceof Error ? error.message : String(error), userId, purchaseData });
            throw error;
        }
    }

    /**
     * Get user's redemption history
     */
    static async getUserRedemptions(
        userId: string,
        filters: { status?: string; page?: number; limit?: number } = {}
    ): Promise<{ redemptions: unknown[]; totalCount: number; summary: Record<string, number> }> {
        try {
            const { status, page = 1, limit = 20 } = filters;

            const query: Record<string, unknown> = { userId };
            if (status) query.status = status;

            // Query only marketplace redemptions
            const marketplaceQuery = { ...query, 'metadata.source': 'marketplace' };

            const [redemptions, totalCount] = await Promise.all([
                Redemption.find(marketplaceQuery)
                    .populate('rewardId', 'name description category pointsCost imageUrl')
                    .sort({ createdAt: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
                    .lean(),
                Redemption.countDocuments(marketplaceQuery)
            ]);

            // Enhance redemptions with status info
            const enhancedRedemptions = redemptions.map(redemption => {
                // The redemption object should already have populated fields via populate() call

                // Calculate expiration based on creation date + 30 days
                const isExpired = redemption.createdAt ?
                    new Date().getTime() - new Date(redemption.createdAt).getTime() > 30 * 24 * 60 * 60 * 1000 :
                    false;  // 30 days validity

                const daysRemaining = redemption.createdAt ?
                    this.getDaysRemaining(new Date(new Date(redemption.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000)) :
                    30; // Default 30 days remaining

                const canRedeem = redemption.status === RedemptionStatus.PENDING &&
                    !isExpired; // Can redeem if not expired (within 30 days)

                return {
                    ...redemption,
                    isExpired,
                    daysRemaining,
                    canRedeem
                };
            });

            return {
                redemptions: enhancedRedemptions,
                totalCount,
                summary: {
                    total: totalCount,
                    pending: redemptions.filter(r => r.status === RedemptionStatus.PENDING).length,
                    confirmed: redemptions.filter(r => r.status === RedemptionStatus.FULFILLED).length,
                    redeemed: redemptions.filter(r => r.status === RedemptionStatus.FULFILLED).length,
                    expired: redemptions.filter(r =>
                        r.status === RedemptionStatus.CANCELLED
                    ).length
                }
            };
        } catch (error) {
            typedLogger.error('Get user redemptions error', { error: error instanceof Error ? error.message : String(error), userId, filters });
            throw error;
        }
    }

    /**
     * Redeem an item at partner location
     */
    static async redeemItem(redemptionData: { redemptionCode: string; location: { latitude: number; longitude: number } }): Promise<{ success: boolean; message: string }> {
        try {
            const { redemptionCode, location } = redemptionData;

            // Find redemption by code (this field doesn't exist in Redemption model, so we use id)
            // The marketplace uses the Redemption model, but redemption codes are handled differently
            // So we'll find by id or skip this method since it may be deprecated
            throw new Error('METHOD_DEPRECATED: redemption codes are handled differently in the new system');
        } catch (error) {
            typedLogger.error('Redeem item error', { error: error instanceof Error ? error.message : String(error), redemptionData });
            throw error;
        }
    }

    /**
     * Get marketplace analytics for admin
     */
    static async getMarketplaceAnalytics(timeframe: string = '30d'): Promise<Record<string, unknown>> {
        try {
            const days = parseInt(timeframe.replace('d', ''));
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const [
                totalRedemptions,
                totalPointsSpent,
                topItems,
                categoryStats,
                revenueByPartner
            ] = await Promise.all([
                Redemption.countDocuments({ createdAt: { $gte: startDate } }),
                Redemption.aggregate([
                    { $match: { createdAt: { $gte: startDate } } },
                    { $group: { _id: null, total: { $sum: '$pointsSpent' } } }
                ]),
                this.getTopItems(startDate),
                this.getCategoryStats(startDate),
                this.getRevenueByPartner(startDate)]);

            return {
                overview: {
                    totalRedemptions,
                    totalPointsSpent: totalPointsSpent[0]?.total || 0,
                    averagePointsPerRedemption: totalRedemptions > 0 ?
                        Math.round((totalPointsSpent[0]?.total || 0) / totalRedemptions) : 0
                },
                topItems,
                categoryStats,
                revenueByPartner,
                timeframe,
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            typedLogger.error('Get marketplace analytics error', { error: error instanceof Error ? error.message : String(error), timeframe });
            throw error;
        }
    }

    // Private helper methods
    private static async getUserPurchaseCount(userId: string): Promise<number> {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            return await Redemption.countDocuments({
                userId,
                createdAt: { $gte: today }
            });
        } catch (error) {
            return 0;
        }
    }

    private static getTimeRemaining(validUntil: Date): string | null {
        const now = new Date();
        const diff = validUntil.getTime() - now.getTime();

        if (diff <= 0) return 'Expired';

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        if (days > 0) return `${days} days`;
        return `${hours} hours`;
    }

    private static getDaysRemaining(validUntil: Date): number {
        const now = new Date();
        const diff = validUntil.getTime() - now.getTime();
        return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    }

    private static getStockStatus(stock: number, totalRedemptions: number): string {
        if (stock === -1) return 'unlimited';

        const remaining = stock - totalRedemptions;
        if (remaining <= 0) return 'out_of_stock';
        if (remaining <= 5) return 'low_stock';
        return 'in_stock';
    }

    private static async getFilterOptions(location?: { latitude: number; longitude: number }): Promise<{ priceRanges: { min: number; max: number; label: string }[]; categories: { name: string; count: number }[]; partners: { id: string; name?: string; count: number }[] }> {
        try {
            // Try short-lived cache first
            if (this.redis) {
                try {
                    const cached = await this.redis.get(this.FILTER_CACHE_KEY);
                    if (cached) {
                        return JSON.parse(cached);
                    }
                } catch { }
            }

            const [priceRanges, categories, partners] = await Promise.all([
                this.getPriceRanges(),
                this.getCategoryOptions(),
                this.getPartnerOptions()]);

            const payload = { priceRanges, categories, partners };

            // Cache for a few minutes to reduce aggregation load
            if (this.redis) {
                try {
                    await this.redis.set(this.FILTER_CACHE_KEY, JSON.stringify(payload), 'EX', 300); // 5 minutes
                } catch { }
            }

            return payload;
        } catch (error) {
            return { priceRanges: [], categories: [], partners: [] };
        }
    }

    private static async getPriceRanges(): Promise<{ min: number; max: number; label: string }[]> {
        return [
            { min: 0, max: 100, label: 'Under 100 points' },
            { min: 100, max: 500, label: '100-500 points' },
            { min: 500, max: 1000, label: '500-1000 points' },
            { min: 1000, max: 5000, label: '1000-5000 points' },
            { min: 5000, max: 999999, label: '5000+ points' }];
    }

    public static async getCategoryOptions(): Promise<{ name: string; count: number }[]> {
        try {
            const categories = await Reward.aggregate([
                { $match: { isActive: true, listingType: ListingType.MARKETPLACE_ITEM } },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);

            return categories.map(cat => ({
                name: cat._id,
                count: cat.count
            }));
        } catch (error) {
            return [];
        }
    }

    private static async getPartnerOptions(): Promise<{ id: string; name?: string; count: number }[]> {
        try {
            const partners = await Reward.aggregate([
                { $match: { isActive: true, listingType: ListingType.MARKETPLACE_ITEM, partnerId: { $exists: true } } },
                { $group: { _id: '$partnerId', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 20 }
            ]);

            return partners.map(p => ({ id: p._id, count: p.count }));
        } catch (error) {
            return [];
        }
    }

    private static async validateLocation(
        userLocation: { latitude: number; longitude: number },
        availableLocations: { coordinates: { coordinates: [number, number] }; radius: number }[]
    ): Promise<boolean> {
        try {
            for (const location of availableLocations) {
                const distance = this.calculateDistance(
                    userLocation.latitude,
                    userLocation.longitude,
                    location.coordinates.coordinates[1],
                    location.coordinates.coordinates[0]
                );

                if (distance <= location.radius) {
                    return true;
                }
            }
            return false;
        } catch (error) {
            return true; // Fail open
        }
    }

    private static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const R = 6371000; // Earth's radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private static generateRedemptionCode(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    private static generateVerificationCode(): string {
        return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    }

    private static async generateQRCode(redemptionCode: string, itemId: string): Promise<string> {
        try {
            // Generate QR code data payload
            const qrData = JSON.stringify({
                type: 'yallacatch_redemption',
                code: redemptionCode,
                itemId: itemId.toString(),
                timestamp: Date.now()
            });

            // Generate actual QR code as data URL (PNG image, base64 encoded)
            const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
                errorCorrectionLevel: 'M',
                type: 'image/png',
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });

            return qrCodeDataUrl;
        } catch (error) {
            typedLogger.error('Generate QR code error', { error: error instanceof Error ? error.message : String(error), redemptionCode });
            return '';
        }
    }

    private static async trackPurchaseAnalytics(userId: string, item: IReward, redemption: IRedemption): Promise<void> {
        try {
            const analyticsKey = `marketplace_analytics:${new Date().toISOString().split('T')[0]}`;
            await this.redis.hincrby(analyticsKey, 'total_purchases', 1);
            await this.redis.hincrby(analyticsKey, `category_${item.category}`, 1);
            await this.redis.hincrby(analyticsKey, 'total_points_spent', item.pointsCost);
            await this.redis.expire(analyticsKey, 30 * 24 * 60 * 60); // 30 days
        } catch (error) {
            typedLogger.error('Track purchase analytics error', { error: error instanceof Error ? error.message : String(error), userId });
        }
    }

    private static async getTopItems(startDate: Date): Promise<{ title: string; partnerName: string; count: number; totalPoints: number }[]> {
        try {
            return await Redemption.aggregate([
                { $match: { createdAt: { $gte: startDate }, 'metadata.source': 'marketplace' } },
                {
                    $group: {
                        _id: '$rewardId',
                        count: { $sum: 1 },
                        totalPoints: { $sum: '$pointsSpent' }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: 'rewards',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'reward'
                    }
                },
                { $unwind: '$reward' },
                {
                    $lookup: {
                        from: 'partners',
                        localField: 'reward.partnerId',
                        foreignField: '_id',
                        as: 'partner'
                    }
                },
                {
                    $project: {
                        title: '$reward.name',
                        partnerName: { $arrayElemAt: ['$partner.name', 0] },
                        count: 1,
                        totalPoints: 1
                    }
                }
            ]);
        } catch (error) {
            return [];
        }
    }

    private static async getCategoryStats(startDate: Date): Promise<{ category: string; count: number; percentage: number }[]> {
        try {
            const result = await Redemption.aggregate([
                { $match: { createdAt: { $gte: startDate }, 'metadata.source': 'marketplace' } },
                {
                    $lookup: {
                        from: 'rewards',
                        localField: 'rewardId',
                        foreignField: '_id',
                        as: 'reward'
                    }
                },
                { $unwind: '$reward' },
                {
                    $group: {
                        _id: '$reward.category',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } }
            ]);

            const total = result.reduce((acc, curr) => acc + curr.count, 0);

            return result.map(cat => ({
                category: cat._id,
                count: cat.count,
                percentage: total > 0 ? Math.round((cat.count / total) * 100) : 0
            }));
        } catch (error) {
            return [];
        }
    }

    private static async getRevenueByPartner(startDate: Date): Promise<{ partnerId: string; partnerName: string; revenue: number; platformFee: number }[]> {
        // TODO: Implement proper revenue aggregation by partner
        // The original implementation was incomplete/debug code
        return [];
    }
}
