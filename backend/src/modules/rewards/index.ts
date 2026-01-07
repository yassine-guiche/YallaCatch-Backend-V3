import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Reward } from '@/models/Reward';
import { Redemption } from '@/models/Redemption';
import { Code } from '@/models/Code';
import { User } from '@/models/User';
import { Partner } from '@/models/Partner';
import { typedLogger } from '@/lib/typed-logger';
import { RewardCategory, RedemptionStatus, CodeStatus } from '@/types';
import { checkIdempotency, setIdempotency } from '@/utils/idempotency';
import { normalizeError } from '@/utils/api-errors';

// Validation schemas
const getRewardsSchema = z.object({
  category: z.enum(Object.values(RewardCategory) as [string, ...string[]]).optional(),
  minCost: z.number().min(1).optional(),
  maxCost: z.number().min(1).optional(),
  popular: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(50),
  sort: z.enum(['pointsCost', 'name', 'popularity']).default('pointsCost')});

const searchRewardsSchema = z.object({
  query: z.string().min(1).max(100),
  category: z.enum(Object.values(RewardCategory) as [string, ...string[]]).optional(),
  limit: z.number().min(1).max(50).default(20)});

const redeemRewardSchema = z.object({
  rewardId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid reward ID'),
  idempotencyKey: z.string().min(1).max(100)});

const createRewardSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().min(10).max(500),
  category: z.enum(Object.values(RewardCategory) as [string, ...string[]]),
  pointsCost: z.number().min(1).max(100000),
  stockQuantity: z.number().min(1).max(10000),
  imageUrl: z.string().url().optional(),
  isPopular: z.boolean().default(false),
  partnerId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  metadata: z.record(z.any()).optional()});

const updateRewardSchema = createRewardSchema.partial();

const addStockSchema = z.object({
  quantity: z.number().min(1).max(1000)});

const promoCodeSchema = z.object({
  code: z.string().min(4).max(64)
});

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
        stockAvailable: { $gt: 0 }};

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
          hasPrev: data.page > 1}};

    } catch (error) {
      const normalized = normalizeError(error, 'Get rewards failed');
      typedLogger.error('Get rewards error', {
        error: normalized.message,
        filters: data});
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
        total: rewards.length};

    } catch (error) {
      const normalized = normalizeError(error, 'Search rewards failed');
      typedLogger.error('Search rewards error', {
        error: normalized.message,
        query: data.query});
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
        isAvailable: reward.stockAvailable > 0};

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
        userId});
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
          idempotencyKey: data.idempotencyKey});
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
        idempotencyKey: data.idempotencyKey});

      // Deduct points from user
      if (user.points.available < reward.pointsCost) {
        throw new Error('INSUFFICIENT_POINTS');
      }
      user.points.available -= reward.pointsCost;
      user.points.spent += reward.pointsCost;
      user.stats.rewardsRedeemed = (user.stats.rewardsRedeemed || 0) + 1;

      // Update reward stock
      reward.stockAvailable -= 1;
      reward.stockReserved = (reward.stockReserved || 0) + 1; // Track reserved stock

      // Save all changes separately to avoid type issues in Promise.all
      // The code from reserveCode is already saved, so we just save the other documents
      await Promise.all([
        redemption.save(),
        user.save(),
        reward.save()
      ]);

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
            poolName: code.poolName} : null},
        newBalance: user.points.available,
        reward: {
          id: reward._id,
          name: reward.name,
          category: reward.category,
          partner: reward.partnerId}};

      // Store idempotency result
      await setIdempotency(data.idempotencyKey, result);

      typedLogger.info('Reward redeemed successfully', {
        userId,
        rewardId: data.rewardId,
        redemptionId: redemption._id,
        pointsSpent: reward.pointsCost,
        hasCode: !!code});

      return result;

    } catch (error) {
      typedLogger.error('Redeem reward error', {
        error: (error as any).message,
        userId,
        rewardId: data.rewardId});
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
        userId});
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
      // In a real implementation, this would add to a user's favorites list
      // For now, we'll just return the reward
      const reward = await Reward.findById(rewardId);
      if (!reward) {
        throw new Error('REWARD_NOT_FOUND');
      }

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
      // In a real implementation, this would remove from a user's favorites list
      // For now, we'll just return success
      const reward = await Reward.findById(rewardId);
      if (!reward) {
        throw new Error('REWARD_NOT_FOUND');
      }

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
      // For now, return an empty array - in a real system this would fetch from a user favorites collection
      return [];
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
        scannedAt: new Date()};

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

      const qrPayload = Buffer.from(JSON.stringify({
        type: 'yallacatch_redemption',
        code: codeDoc.code,
        redemptionId: redemption._id.toString(),
        rewardId: reward._id.toString(),
        partnerId: (reward as any).partnerId?._id?.toString() || null
      })).toString('base64');

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

    const pointsValue = codeDoc.pointsValue || 0;
    user.points.available += pointsValue;
    user.points.total += pointsValue;
    user.updateLevel?.();

    codeDoc.status = CodeStatus.USED;
    codeDoc.isUsed = true;
    codeDoc.usedBy = new Types.ObjectId(userId);
    codeDoc.usedAt = new Date();

    await Promise.all([user.save(), codeDoc.save()]);

    typedLogger.info('Promo code redeemed for points', {
      userId,
      code: codeDoc.code,
      points: pointsValue
    });

    return {
      success: true,
      type: 'points',
      pointsAwarded: pointsValue,
      newBalance: user.points.available
    };
  }

  /**
   * Get all partners
   */
  static async getPartners(options: any = {}): Promise<any[]> {
    try {
      const query: any = { isActive: true };

      if (options.category) {
        query.categories = { $in: [options.category] };
      }

      const partners = await Partner.find(query)
        .sort({ name: 1 })
        .limit(options.limit || 50);

      // Return plain objects with only active locations to keep maps clean for Unity/game clients
      return partners.map((p: any) => {
        const obj = typeof p.toObject === 'function' ? p.toObject() : p;
        return {
          ...obj,
          locations: (obj.locations || []).filter((loc: any) => loc.isActive !== false),
        };
      });
    } catch (error) {
      typedLogger.error('Get partners error', { error: (error as any).message, options });
      throw error;
    }
  }

  /**
   * Get partner locations
   */
  static async getPartnerLocations(partnerId: string): Promise<any[]> {
    try {
      const partner = await Partner.findById(partnerId);

      if (!partner) {
        throw new Error('PARTNER_NOT_FOUND');
      }

      return partner.locations || [];
    } catch (error) {
      typedLogger.error('Get partner locations error', { error: (error as any).message, partnerId });
      throw error;
    }
  }
}

/**
 * Rewards routes
 */
export default async function rewardsRoutes(fastify: FastifyInstance) {
  // Get available rewards
  fastify.get('/', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await RewardsService.getRewards(request.query);
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const normalized = normalizeError(error, 'Get rewards failed');
      reply.code(500).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()});
    }
  });

  // Search rewards
  fastify.get('/search', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await RewardsService.searchRewards(request.query);
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const normalized = normalizeError(error, 'Search rewards failed');
      reply.code(500).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()});
    }
  });

  // Get reward details
  fastify.get('/:rewardId', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['rewardId'],
        properties: {
          rewardId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { rewardId: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await RewardsService.getRewardDetails(
        request.params.rewardId,
        request.user.sub
      );
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const normalized = normalizeError(error, 'Get reward failed');
      const statusCode = normalized.code === 'REWARD_NOT_FOUND' ? 404 : 400;
      reply.code(statusCode).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()});
    }
  });

  // Redeem a reward
  fastify.post('/:rewardId/redeem', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['rewardId'],
        properties: {
          rewardId: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        required: ['idempotencyKey'],
        properties: {
          idempotencyKey: { type: 'string', minLength: 1, maxLength: 100 }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { rewardId: string };
    Body: { idempotencyKey: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await RewardsService.redeemReward(
        request.user.sub,
        {
          rewardId: request.params.rewardId,
          idempotencyKey: request.body.idempotencyKey}
      );
      
      reply.code(201).send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const normalized = normalizeError(error, 'Redeem reward failed');
      const statusCodes: Record<string, number> = {
        USER_NOT_FOUND: 404,
        REWARD_NOT_FOUND: 404,
        REWARD_NOT_AVAILABLE: 409,
        OUT_OF_STOCK: 409,
        INSUFFICIENT_POINTS: 400,
      };
      const statusCode = statusCodes[normalized.code] || 500;
      reply.code(statusCode).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()});
    }
  });

  // Get user redemptions
  fastify.get('/my-redemptions', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await RewardsService.getUserRedemptions(
        request.user.sub,
        request.query
      );
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const normalized = normalizeError(error, 'Get redemptions failed');
      reply.code(500).send({
        success: false,
        error: normalized.code,
        message: normalized.message,
        timestamp: new Date().toISOString()});
    }
  });

  // ========================================
  // Routes from rewards-extended.ts (9 routes)
  // ========================================
  // Get reward categories
  fastify.get('/categories', async (request, reply) => {
    try {
      const result = await RewardsService.getRewardCategories();
      reply.send({ success: true, data: result });
    } catch (error) {
      const normalized = normalizeError(error, 'Get categories failed');
      reply.code(500).send({ success: false, error: normalized.code, message: normalized.message });
    }
  });

  // Get featured rewards
  fastify.get('/featured', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
            default: 10
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { limit?: number };
  }>, reply: FastifyReply) => {
    try {
      const result = await RewardsService.getFeaturedRewards(request.query.limit || 10);
      reply.send({ success: true, data: result });
    } catch (error) {
      const normalized = normalizeError(error, 'Get featured rewards failed');
      reply.code(500).send({ success: false, error: normalized.code, message: normalized.message });
    }
  });

  // Add to favorites
  fastify.post('/favorites', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['rewardId'],
        properties: {
          rewardId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: { rewardId: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await RewardsService.addToFavorites(
        request.user.sub,
        request.body.rewardId
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Remove from favorites
  fastify.delete('/favorites/:rewardId', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['rewardId'],
        properties: {
          rewardId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { rewardId: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await RewardsService.removeFromFavorites(
        request.user.sub,
        request.params.rewardId
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Get favorite rewards
  fastify.get('/favorites', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await RewardsService.getFavoriteRewards(request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get redemption history
  fastify.get('/history', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          status: {
            type: 'string',
            enum: ['all', 'active', 'used', 'expired'],
            default: 'all'
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { page?: number; limit?: number; status?: 'all' | 'active' | 'used' | 'expired' };
  }>, reply: FastifyReply) => {
    try {
      const result = await RewardsService.getRedemptionHistory(request.user.sub, request.query);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Scan QR code
  const qrScanSchema = {
    body: {
      type: 'object',
      required: ['qrCode'],
      properties: {
        qrCode: { type: 'string' },
        location: {
          type: 'object',
          properties: {
            lat: { type: 'number' },
            lng: { type: 'number' }
          }
        }
      }
    }
  };

  const qrScanHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    try {
      const result = await RewardsService.scanQRCode(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  };

  // Keep legacy path but allow partner users too (authZ is enforced in service)
  fastify.post('/qr-scan', {
    preHandler: [authenticate],
    schema: qrScanSchema
  }, qrScanHandler);

  // New explicit path with slash for consistency with frontend helpers
  fastify.post('/qr/scan', {
    preHandler: [authenticate],
    schema: qrScanSchema
  }, qrScanHandler);

  // Partner self-serve location update (partner role only)
  const partnerLocationSchema = z.object({
    locationId: z.string().optional(),
    name: z.string().min(1).max(100),
    address: z.string().min(1).max(200),
    city: z.string().min(1).max(50),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    phone: z.string().max(20).optional(),
    isActive: z.boolean().optional(),
    features: z.array(z.string()).optional(),
  });

  fastify.post('/partners/me/location', {
    preHandler: [authenticate],
  }, async (request: FastifyRequest<{ Body: z.infer<typeof partnerLocationSchema> }>, reply: FastifyReply) => {
    try {
      const { UserRole } = await import('@/types');
      const user = await User.findById(request.user.sub);
      if (!user || (user as any).role !== UserRole.PARTNER || !user.partnerId) {
        return reply.code(403).send({ success: false, error: 'FORBIDDEN' });
      }

      const payload = partnerLocationSchema.parse((request as any).body || {});
      const partner = await Partner.findById(user.partnerId);
      if (!partner) {
        return reply.code(404).send({ success: false, error: 'PARTNER_NOT_FOUND' });
      }

      if (payload.locationId) {
        // Update existing location
        const loc = (partner as any).locations.id(payload.locationId);
        if (!loc) {
          return reply.code(404).send({ success: false, error: 'LOCATION_NOT_FOUND' });
        }
        loc.name = payload.name;
        loc.address = payload.address;
        loc.city = payload.city;
        (loc as any).coordinates = [payload.lng, payload.lat];
        if (payload.phone !== undefined) loc.phone = payload.phone;
        if (payload.isActive !== undefined) loc.isActive = payload.isActive;
        if (payload.features) (loc as any).features = payload.features;
      } else {
        // Add new location
        partner.locations.push({
          name: payload.name,
          address: payload.address,
          city: payload.city,
          coordinates: [payload.lng, payload.lat],
          phone: payload.phone,
          isActive: payload.isActive ?? true,
          features: payload.features,
        } as any);
      }

      await partner.save();

      return reply.send({
        success: true,
        data: {
          partnerId: partner._id,
          locations: partner.locations,
        }
      });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: error.message || 'LOCATION_UPDATE_FAILED' });
    }
  });

  // Redeem promo code (points-only or reward -> QR)
  fastify.post('/promo/redeem', {
    preHandler: [authenticate],
    schema: {
      body: promoCodeSchema
    }
  }, async (request: FastifyRequest<{ Body: { code: string } }>, reply: FastifyReply) => {
    try {
      const result = await RewardsService.redeemPromoCode(request.user.sub, request.body);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Pending redemptions (admin or partner scoped)
  fastify.get('/redemptions/pending', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          partnerId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { limit?: number; partnerId?: string } }>, reply: FastifyReply) => {
    try {
      const { UserRole } = await import('@/types');
      const user = await User.findById(request.user.sub);
      const isAdmin = user && [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MODERATOR].includes((user as any).role);
      const limit = Math.min(Math.max((request.query.limit as number) || 50, 1), 200);

      const redemptionQuery: any = { status: RedemptionStatus.PENDING };

      // If partner user, force filter by their partnerId
      if (user?.partnerId && (user as any).role === UserRole.PARTNER) {
        redemptionQuery['rewardId'] = { $exists: true };
      }

      const partnerFilter = (user?.partnerId && (user as any).role === UserRole.PARTNER)
        ? user.partnerId.toString()
        : request.query.partnerId;

      const populateReward: any = {
        path: 'rewardId',
        select: 'name category partnerId',
        populate: { path: 'partnerId', select: 'name' }
      };

      if (partnerFilter) {
        populateReward.match = { partnerId: new Types.ObjectId(partnerFilter) };
      }

      let redemptions = await Redemption.find(redemptionQuery)
        .populate(populateReward)
        .populate('userId', 'displayName email')
        .sort({ createdAt: 1 })
        .limit(limit)
        .lean();

      // Filter out redemptions whose reward partnerId doesn't match (after populate)
      if (partnerFilter) {
        redemptions = redemptions.filter(r => (r as any).rewardId?.partnerId);
      }

      // If non-admin/non-partner, forbid
      if (!isAdmin && (!(user?.partnerId) || (user as any).role !== UserRole.PARTNER)) {
        return reply.code(403).send({ success: false, error: 'FORBIDDEN' });
      }

      return reply.send({
        success: true,
        data: redemptions.map((r: any) => ({
          id: r._id,
          user: r.userId,
          reward: r.rewardId,
          status: r.status,
          createdAt: r.createdAt
        }))
      });
    } catch (error) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get partners
  fastify.get('/partners', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          category: { type: 'string' },
          city: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { page?: number; limit?: number; category?: string; city?: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await RewardsService.getPartners(request.query);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Partner dashboard stats (admin or partner scoped)
  fastify.get('/partners/stats', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          partnerId: { type: 'string' },
          limitRecent: { type: 'integer', minimum: 1, maximum: 50, default: 5 }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { partnerId?: string; limitRecent?: number } }>, reply: FastifyReply) => {
    try {
      const { UserRole } = await import('@/types');
      const user = await User.findById(request.user.sub);
      const limitRecent = Math.min(Math.max((request.query.limitRecent as number) || 5, 1), 50);

      let partnerId: string | undefined = request.query.partnerId;
      if (user && (user as any).role === UserRole.PARTNER) {
        partnerId = user.partnerId?.toString();
      }
      if (!partnerId) {
        return reply.code(400).send({ success: false, error: 'PARTNER_ID_REQUIRED' });
      }

      const rewardsForPartner = await Reward.find({ partnerId: new Types.ObjectId(partnerId) }).select('_id category');
      const rewardIds = rewardsForPartner.map(r => r._id);
      if (!rewardIds.length) {
        return reply.send({
          success: true,
          data: { totals: { pending: 0, fulfilled: 0, cancelled: 0, total: 0 }, byCategory: [], recent: [] }
        });
      }

      const [statusAgg, categoryAgg, recent] = await Promise.all([
        Redemption.aggregate([
          { $match: { rewardId: { $in: rewardIds } } },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        Redemption.aggregate([
          { $match: { rewardId: { $in: rewardIds } } },
          {
            $lookup: {
              from: 'rewards',
              localField: 'rewardId',
              foreignField: '_id',
              as: 'reward'
            }
          },
          { $unwind: '$reward' },
          { $group: { _id: '$reward.category', count: { $sum: 1 } } }
        ]),
        Redemption.find({ rewardId: { $in: rewardIds } })
          .populate('rewardId', 'name category')
          .populate('userId', 'displayName email')
          .sort({ createdAt: -1 })
          .limit(limitRecent)
          .lean()
      ]);

      const totals: any = {
        pending: statusAgg.find(s => s._id === RedemptionStatus.PENDING)?.count || 0,
        fulfilled: statusAgg.find(s => s._id === RedemptionStatus.FULFILLED)?.count || 0,
        cancelled: statusAgg.find(s => s._id === RedemptionStatus.CANCELLED)?.count || 0,
      };
      totals.total = totals.pending + totals.fulfilled + totals.cancelled;

      return reply.send({
        success: true,
        data: {
          totals,
          byCategory: categoryAgg.map(c => ({ category: c._id, count: c.count })),
          recent: recent.map((r: any) => ({
            id: r._id,
            status: r.status,
            createdAt: r.createdAt,
            reward: r.rewardId ? { id: r.rewardId._id, name: r.rewardId.name, category: r.rewardId.category } : null,
            user: r.userId ? { id: r.userId._id, displayName: r.userId.displayName, email: r.userId.email } : null,
          })),
        }
      });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message || 'PARTNER_STATS_FAILED' });
    }
  });

  // Partner self locations (for portal map/list)
  fastify.get('/partners/me/locations', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          partnerId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Querystring: { partnerId?: string } }>, reply: FastifyReply) => {
    try {
      const { UserRole } = await import('@/types');
      const user = await User.findById(request.user.sub);

      let partnerId: string | undefined = request.query.partnerId;
      if (user && (user as any).role === UserRole.PARTNER) {
        partnerId = user.partnerId?.toString();
      }

      if (!partnerId) {
        return reply.code(400).send({ success: false, error: 'PARTNER_ID_REQUIRED' });
      }

      const partner = await Partner.findById(partnerId);
      if (!partner) {
        return reply.code(404).send({ success: false, error: 'PARTNER_NOT_FOUND' });
      }

      return reply.send({
        success: true,
        data: partner.locations || [],
        partner: { id: partner._id, name: partner.name }
      });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: error.message || 'PARTNER_LOCATIONS_FAILED' });
    }
  });

  // Get partner locations
  fastify.get('/partners/:partnerId/locations', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['partnerId'],
        properties: {
          partnerId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { partnerId: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await RewardsService.getPartnerLocations(request.params.partnerId);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
}
