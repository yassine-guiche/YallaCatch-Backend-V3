import { FastifyInstance, FastifyRequest } from 'fastify';
import { requireOnline } from '@/middleware/require-online';
import { authenticate, requireAdmin, requireRole } from '@/middleware/auth';
import { z } from 'zod';
import { User } from '@/models/User';
import { Partner } from '@/models/Partner';
import { AuditLog } from '@/models/AuditLog';
import { Reward } from '@/models/Reward';
import { Redemption } from '@/models/Redemption';
import { Code } from '@/models/Code';
import { RewardsService } from '@/modules/rewards';
import { typedLogger } from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';
import mongoose from 'mongoose';
import { Types } from 'mongoose';
import { RedemptionStatus, IRedemption, IReward, IUser, UserRole } from '@/types';
import { broadcastAdminEvent } from '@/lib/websocket';

/**
 * Marketplace Module
 * Core Feature 4: Utilisateur échange → Dépense points contre récompenses
 * Complete marketplace system for exchanging points for real rewards
 */

// Unified with core Reward/Redemption: legacy marketplace schemas removed.

// Request schemas
const PurchaseItemSchema = z.object({
  itemId: z.string(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)}).optional(),
  deviceInfo: z.object({
    platform: z.string(),
    version: z.string()}).optional()});

const RedeemItemSchema = z.object({
  redemptionCode: z.string(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)}),
  verificationCode: z.string().optional()});

// Enhanced marketplace item type for API responses
export interface MarketplaceItem {
  id: string;
  title: string;
  description: string;
  category: string;
  pointsCost: number;
  images: string[];
  partnerName: string | null;
  partnerLogo: string | null;
  canAfford: boolean;
  stockStatus: string;
  savings: number | null;
}

export interface MarketplaceResponse {
  items: MarketplaceItem[];
  categories: string[];
  totalItems: number;
  filters: {
    priceRanges: { min: number; max: number; label: string }[];
    categories: { name: string; count: number }[];
    partners: { id: string; name?: string; count: number }[];
  };
  userInfo: {
    currentPoints: number;
    canAfford: number;
    recentPurchases: number;
  };
}

// Purchased item details for redemption
export interface PurchasedItemDetails {
  title: string;
  description: string;
  partnerName?: string;
  originalValue?: number;
  currency: string;
}

export interface PurchaseResult {
  success: boolean;
  redemption: {
    id: string;
    code: string;
    qrCode: string;
    item: PurchasedItemDetails;
    validUntil: string;
    howToRedeem: string;
  };
  userBalance: {
    previousPoints: number;
    pointsSpent: number;
    remainingPoints: number;
  };
  message: string;
}

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

      // Build sponsored reward query
      const query: Record<string, unknown> = { isActive: true, stockAvailable: { $gt: 0 }, 'metadata.isSponsored': true };
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
          recentPurchases: 0 } };
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
            'stats.totalPointsSpent': itemPointsCost},
          $push: {
            'purchaseHistory': {
              rewardId: item._id,
              pointsSpent: itemPointsCost,
              purchasedAt: new Date()}
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
        redemptionId: redemption._id.toString()});

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
      } catch {}

      // Track purchase analytics
      await this.trackPurchaseAnalytics(userId, item, redemption);

      // Trigger achievements (async, don't wait)
      import('@/services/achievement').then(({ default: AchievementService }) => {
        AchievementService.checkAchievements(userId, 'REWARD_REDEEMED', {
          rewardId: item._id.toString(),
          pointsSpent: item.pointsCost,
          redemptionId: redemption._id.toString()}).catch(error => {
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
            currency: 'TND'},  // Default currency
          validUntil: validUntil.toISOString(), // Using the calculated validity period
          howToRedeem: item.metadata?.howToRedeem || 'Show this QR code to partner for redemption'},
        userBalance: {
          previousPoints: user.points?.available || 0,
          pointsSpent: item.pointsCost,
          remainingPoints: (user.points?.available || 0) - item.pointsCost},
        message: `Successfully purchased ${item.name}! Show the QR code to a partner for redemption.`};
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
          ).length}};
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
            Math.round((totalPointsSpent[0]?.total || 0) / totalRedemptions) : 0},
        topItems,
        categoryStats,
        revenueByPartner,
        timeframe,
        generatedAt: new Date().toISOString()};
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
        } catch {}
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
        } catch {}
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

  private static async getCategoryOptions(): Promise<{ name: string; count: number }[]> {
    try {
      const categories = await Reward.aggregate([
        { $match: { isActive: true, 'metadata.isSponsored': true } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      return categories.map(cat => ({
        name: cat._id,
        count: cat.count }));
    } catch (error) {
      return [];
    }
  }

  private static async getPartnerOptions(): Promise<{ id: string; name?: string; count: number }[]> {
    try {
      const partners = await Reward.aggregate([
        { $match: { isActive: true, 'metadata.isSponsored': true, partnerId: { $exists: true } } },
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
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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
      // In a real implementation, use a QR code library like 'qrcode'
      const qrData = {
        type: 'yallacatch_redemption',
        code: redemptionCode,
        itemId: itemId.toString(),
        timestamp: Date.now()};
      
      // Return base64 encoded QR code data
      return Buffer.from(JSON.stringify(qrData)).toString('base64');
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
        { $group: {
          _id: '$rewardId',
          count: { $sum: 1 },
          totalPoints: { $sum: '$pointsSpent' }
        }},
        { $lookup: {
          from: 'rewards',
          localField: '_id',
          foreignField: '_id',
          as: 'item'
        }},
        { $unwind: '$item' },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: {
          title: '$item.name',
          partnerName: '$item.partnerId',
          count: 1,
          totalPoints: 1
        }}
      ]);
    } catch (error) {
      return [];
    }
  }

  private static async getCategoryStats(startDate: Date): Promise<{ _id: string; count: number; totalPoints: number }[]> {
    try {
      return await Redemption.aggregate([
        { $match: { createdAt: { $gte: startDate }, 'metadata.source': 'marketplace' } },
        { $lookup: {
          from: 'rewards',
          localField: 'rewardId',
          foreignField: '_id',
          as: 'item'
        }},
        { $unwind: '$item' },
        { $group: {
          _id: '$item.category',
          count: { $sum: 1 },
          totalPoints: { $sum: '$pointsSpent' }
        }},
        { $sort: { count: -1 } }
      ]);
    } catch (error) {
      return [];
    }
  }

  private static async getRevenueByPartner(startDate: Date): Promise<{ _id: string; count: number; totalPoints: number }[]> {
    try {
      return await Redemption.aggregate([
        { $match: { createdAt: { $gte: startDate }, 'metadata.source': 'marketplace' } },
        { $lookup: {
          from: 'rewards',
          localField: 'rewardId',
          foreignField: '_id',
          as: 'item'
        }},
        { $unwind: '$item' },
        { $group: {
          _id: '$item.partnerId',
          count: { $sum: 1 },
          totalPoints: { $sum: '$pointsSpent' }
        }},
        { $sort: { totalPoints: -1 } },
        { $limit: 10 }
      ]);
    } catch (error) {
      return [];
    }
  }
}

export default async function marketplaceRoutes(fastify: FastifyInstance) {
  // Get marketplace items
  fastify.get('/', {
    preHandler: [authenticate],
    schema: {
      querystring: z.object({
        category: z.string().optional(),
        minPoints: z.number().optional(),
        maxPoints: z.number().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        search: z.string().optional(),
        featured: z.boolean().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20)
      })
    }
  }, async (request: FastifyRequest<{ Querystring: {
    category?: string;
    minPoints?: string;
    maxPoints?: string;
    latitude?: string;
    longitude?: string;
    search?: string;
    featured?: string;
    page?: string;
    limit?: string;
  } }>, reply) => {
    try {
      const query = request.query;
      const safePage = Math.max(1, parseInt(query.page) || 1);
      const safeLimit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
      const location = query.latitude && query.longitude ? {
        latitude: parseFloat(query.latitude),
        longitude: parseFloat(query.longitude)} : undefined;

      const result = await MarketplaceService.getMarketplace((request as FastifyRequest & { user: { sub: string } }).user.sub, {
        category: query.category,
        minPoints: query.minPoints ? parseInt(query.minPoints) : undefined,
        maxPoints: query.maxPoints ? parseInt(query.maxPoints) : undefined,
        search: query.search,
        featured: query.featured ? query.featured === 'true' : undefined,
        page: safePage,
        limit: safeLimit,
        location});
      reply.header('Cache-Control', 'private, max-age=120').send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Purchase item (requires online connection)
  fastify.post('/purchase', {
    preHandler: [authenticate, requireOnline],
    schema: {
      body: z.object({
        rewardId: z.string().optional(),
        itemId: z.string().optional(), // backward compatibility
        idempotencyKey: z.string().optional(),
        location: z.object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180)
        }).optional(),
        deviceInfo: z.object({
          platform: z.string(),
          version: z.string()
        }).optional()
      })
    }
  }, async (request: FastifyRequest<{ Body: { rewardId?: string; itemId?: string; idempotencyKey?: string; location?: { latitude: number; longitude: number }; deviceInfo?: { platform: string; version: string } } }> & { user: { sub: string } }, reply) => {
    try {
      const body = request.body || {};
      const rewardId = body.rewardId || body.itemId; // backward compatibility
      if (!rewardId) {
        return reply.code(400).send({ success: false, error: 'REWARD_ID_REQUIRED' });
      }

      const reward = await Reward.findById(rewardId);
      if (!reward || !reward.isActive) {
        return reply.code(404).send({ success: false, error: 'REWARD_NOT_AVAILABLE' });
      }

      // Idempotency
      const idempotencyKey = body.idempotencyKey || `marketplace-${request.user.sub}-${rewardId}-${Date.now()}`;

      // Perform core redemption
      const res = await RewardsService.redeemReward(request.user.sub, {
        rewardId: rewardId.toString(),
        idempotencyKey,
      });

      // Compute commission and settlement metadata
      let commissionRate = 0;
      try {
        if (reward.partnerId) {
          const partner = await Partner.findById(reward.partnerId);
          commissionRate = (partner as { commissionRate?: number } | null)?.commissionRate ?? 0;
        }
      } catch {}
      const POINTS_TO_CURRENCY_RATE = 0.01; // TODO: move to Settings
      const grossValue = +(reward.pointsCost * POINTS_TO_CURRENCY_RATE).toFixed(2);
      const platformShare = +(grossValue * (commissionRate / 100)).toFixed(2);
      const partnerShare = +(grossValue - platformShare).toFixed(2);

      try {
        const redemptionResponse = res as { redemption?: { id?: string; metadata?: Record<string, unknown> }; redemptionId?: string };
        await Redemption.findByIdAndUpdate(new Types.ObjectId(redemptionResponse?.redemption?.id || redemptionResponse?.redemptionId), {
          $set: {
            metadata: {
              ...(redemptionResponse?.redemption?.metadata || {}),
              source: 'marketplace',
              partnerId: reward.partnerId || null,
              commissionRateApplied: commissionRate,
              pointsToCurrencyRate: POINTS_TO_CURRENCY_RATE,
              grossValue,
              partnerShare,
              platformShare,
            },
          },
        });
      } catch {}

      return reply.send({ success: true, data: res });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Get user redemptions
  fastify.get('/redemptions', {
    preHandler: [authenticate],
    schema: {
      querystring: z.object({
        status: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20)
      })
    }
  }, async (request: FastifyRequest<{ Querystring: { status?: string; page?: string; limit?: string } }> & { user: { sub: string } }, reply) => {
    try {
      const q = request.query || {};
      const page = Math.max(1, parseInt(q.page || '1') || 1);
      const limit = Math.min(100, Math.max(1, parseInt(q.limit || '20') || 20));
      const skip = (page - 1) * limit;
      const query: Record<string, unknown> = { userId: new Types.ObjectId(request.user.sub), 'metadata.source': 'marketplace' };
      if (q.status && q.status !== 'all') query.status = q.status;

      const [items, total] = await Promise.all([
        Redemption.find(query)
          .populate('rewardId', 'name pointsCost category imageUrl')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Redemption.countDocuments(query),
      ]);

      reply.send({ success: true, data: { redemptions: items, total, page, limit, hasMore: skip + limit < total } });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // Redeem item (for partners)
  // Deprecated: partner redeem endpoint; use /rewards/qr-scan instead
  fastify.post('/redeem', {}, async (request, reply) => {
    return reply.code(410).send({ success: false, error: 'ENDPOINT_DEPRECATED', message: 'Use /api/v1/rewards/qr-scan' });
  });

  // Get marketplace analytics (admin only)
  fastify.get('/analytics', {
    preHandler: [authenticate],
    schema: {
      querystring: z.object({
        timeframe: z.string().default('30d')
      })
    }
  }, async (request: FastifyRequest<{ Querystring: { timeframe?: string } }>, reply) => {
    try {
      const days = parseInt((request.query?.timeframe || '30d').replace('d', '')) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const pipeline = [
        { $match: { createdAt: { $gte: startDate }, 'metadata.source': 'marketplace' } },
        { $group: { _id: null, total: { $sum: 1 }, pointsSpent: { $sum: '$pointsSpent' } } },
      ];
      const [agg] = await Redemption.aggregate(pipeline);
      reply.send({ success: true, data: { totalRedemptions: agg?.total || 0, totalPointsSpent: agg?.pointsSpent || 0, timeframe: `${days}d` } });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ✨ NEW: Get marketplace categories (for admin panel)
  fastify.get('/categories', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const categories = await Reward.aggregate([
        { $match: { isActive: true, metadata: { $exists: true }, 'metadata.isSponsored': true } },
        { 
          $group: { 
            _id: '$category', 
            count: { $sum: 1 },
            description: { $first: '$categoryDescription' }
          }
        },
        { $sort: { count: -1 }}
      ]);

      const formattedCategories = categories.map(cat => ({
        id: cat._id,
        name: cat._id,
        slug: cat._id.toLowerCase().replace(/\s+/g, '-'),
        rewardCount: cat.count,
        description: cat.description || `Catégorie ${cat._id}`}));

      return reply.send({ success: true, categories: formattedCategories, total: categories.length });
    } catch (error) {
      return reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  // ✨ NEW: Get featured rewards (for admin panel)
  fastify.get('/featured', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const featured = await Reward.find({ isActive: true, isPopular: true, metadata: { $exists: true }, 'metadata.isSponsored': true })
      .sort({ popularity: -1, createdAt: -1 })
      .limit(20)
      .lean();

      reply.send({ success: true, rewards: featured, total: featured.length });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });


  // ✨ NEW: Get marketplace history (for admin panel)
  fastify.get('/history', {
    preHandler: [authenticate],
    schema: {
      querystring: z.object({
        status: z.enum(['completed', 'pending', 'cancelled', 'all']).default('all'),
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(20)
      })
    }
  }, async (request: FastifyRequest<{ Querystring: { status?: 'completed' | 'pending' | 'cancelled' | 'all'; page?: number; limit?: number } }>, reply) => {
    try {
      const { status, page = 1, limit = 20 } = request.query;
      const safePage = Math.max(1, page || 1);
      const safeLimit = Math.min(100, Math.max(1, limit || 20));
      const query: Record<string, unknown> = { 'metadata.source': 'marketplace' };
      if (status && status !== 'all') query.status = status;
      const [history, total] = await Promise.all([
        Redemption.find(query)
          .populate('userId', 'displayName email')
          .populate('rewardId', 'name pointsCost category imageUrl')
          .sort({ createdAt: -1 })
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .lean(),
        Redemption.countDocuments(query)]);

      const formattedHistory = history.map(item => {
        // Type assertion for populated fields
        const populatedUser = item.userId as any;
        const populatedReward = item.rewardId as any;

        return {
          id: item._id,
          userId: populatedUser?._id,
          user: {
            id: populatedUser?._id,
            username: populatedUser?.displayName,
            email: populatedUser?.email},
          rewardId: populatedReward?._id,
          reward: {
            id: populatedReward?._id,
            name: populatedReward?.name,
            pointsCost: populatedReward?.pointsCost,
            category: populatedReward?.category,
            imageUrl: populatedReward?.imageUrl},
          status: item.status,
          pointsSpent: item.pointsSpent || populatedReward?.pointsCost,
          redeemedAt: item.redeemedAt,
          createdAt: item.createdAt};
      });

      reply.send({ 
        success: true, 
        history: formattedHistory, 
        total,
        page: safePage,
        limit: safeLimit,
        hasMore: total > safePage * safeLimit
      });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  /**
   * Partner self-service marketplace (CRUD + analytics)
   */
  const PartnerItemSchema = z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1),
    pointsCost: z.number().int().min(0),
    stockQuantity: z.number().int().min(0),
    imageUrl: z.string().url().optional().or(z.literal('')).transform(v => v || undefined),
    isActive: z.boolean().optional(),
    isPopular: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  const ensurePartner = (request: FastifyRequest) => {
    const user = request.user as { role?: UserRole; partnerId?: string } | undefined;
    if (!user || user.role !== UserRole.PARTNER || !user.partnerId) {
      throw new Error('PARTNER_ONLY');
    }
    return user.partnerId;
  };

  // NOTE: Partner self-service routes were moved to /api/v1/partner/marketplace/*.
}
