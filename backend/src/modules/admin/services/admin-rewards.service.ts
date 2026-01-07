import { Reward } from '@/models/Reward';
import { audit } from '@/lib/audit-logger';
import { Types } from 'mongoose';
import { typedLogger } from '@/lib/typed-logger';

export interface RewardQueryOptions {
  page?: number;
  limit?: number;
  category?: string;
  status?: string;
  minCost?: number;
  maxCost?: number;
  search?: string;
}

export class AdminRewardsService {
  /**
   * Get rewards with admin capabilities (all rewards regardless of availability)
   */
  static async getRewards(query: RewardQueryOptions = {}) {
    try {
      const page = parseInt(String(query.page)) || 1;
      const limit = Math.min(100, Math.max(1, parseInt(String(query.limit)) || 50));
      const skip = (page - 1) * limit;

      const filterQuery: any = {};

      if (query.category) filterQuery.category = query.category;
      if (query.status && query.status !== 'all') {
        filterQuery.isActive = query.status === 'active';
      }
      if (query.minCost) filterQuery.pointsCost = { $gte: parseInt(String(query.minCost)) };
      if (query.maxCost) {
        filterQuery.pointsCost = { ...filterQuery.pointsCost, $lte: parseInt(String(query.maxCost)) };
      }
      if (query.search) {
        filterQuery.$or = [
          { name: { $regex: query.search, $options: 'i' } },
          { description: { $regex: query.search, $options: 'i' } },
        ];
      }

      const [rewards, total] = await Promise.all([
        Reward.find(filterQuery)
          .populate('partnerId', 'name logoUrl')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Reward.countDocuments(filterQuery),
      ]);

      return {
        rewards: rewards.map(reward => reward.toJSON()),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: skip + limit < total,
          hasPrev: page > 1,
        },
        total,
      };
    } catch (error) {
      typedLogger.error('Admin get rewards error', { error: (error as any).message, query });
      throw error;
    }
  }

  /**
   * Get single reward by ID
   */
  static async getReward(rewardId: string) {
    try {
      // Validate ObjectId
      if (!Types.ObjectId.isValid(rewardId)) {
        throw new Error('REWARD_NOT_FOUND');
      }

      const reward = await Reward.findById(rewardId).populate('partnerId', 'name logoUrl');
      if (!reward) {
        throw new Error('REWARD_NOT_FOUND');
      }
      return reward.toJSON();
    } catch (error) {
      typedLogger.error('Admin get reward error', { error: (error as any).message, rewardId });
      throw error;
    }
  }

  /**
   * Create a new reward
   */
  static async createReward(adminId: string, data: any) {
    try {
      const { name, description, category, pointsCost, stockQuantity, ...rest } = data;

      const reward = new Reward({
        name,
        description,
        category,
        pointsCost,
        stockQuantity,
        stockAvailable: stockQuantity,
        stockReserved: 0,
        ...rest,
        createdBy: new Types.ObjectId(adminId),
      });

      await reward.save();
      await this.logAction(adminId, 'create_reward', reward._id.toString(), {
        rewardId: reward._id,
        name: reward.name,
        pointsCost: reward.pointsCost,
      });

      typedLogger.info('Admin reward created', { adminId, rewardId: reward._id, name });

      return reward.toJSON();
    } catch (error) {
      typedLogger.error('Admin create reward error', { error: (error as any).message, adminId, data });
      throw error;
    }
  }

  /**
   * Update an existing reward
   */
  static async updateReward(adminId: string, rewardId: string, data: any) {
    try {
      // Validate ObjectId
      if (!Types.ObjectId.isValid(rewardId)) {
        throw new Error('REWARD_NOT_FOUND');
      }

      // Build update object with allowed fields only
      const allowedFields = ['name', 'description', 'category', 'pointsCost', 'imageUrl', 'isActive', 'isPopular'];
      const updateData: any = {};
      
      Object.keys(data).forEach(key => {
        if (allowedFields.includes(key) && data[key] !== undefined) {
          updateData[key] = data[key];
        }
      });

      // Handle stockQuantity separately (need to update stockAvailable too)
      if (data.stockQuantity !== undefined) {
        updateData.stockQuantity = data.stockQuantity;
        // We'll use $inc for stockAvailable if needed, but for simplicity set directly
      }

      // Only set updatedBy if adminId is a valid ObjectId
      if (Types.ObjectId.isValid(adminId)) {
        updateData.updatedBy = new Types.ObjectId(adminId);
      }

      // Use findByIdAndUpdate to avoid triggering full validation on legacy documents
      const reward = await Reward.findByIdAndUpdate(
        rewardId,
        { $set: updateData },
        { new: true, runValidators: false } // Don't run validators on update
      );

      if (!reward) {
        throw new Error('REWARD_NOT_FOUND');
      }

      await this.logAction(adminId, 'update_reward', reward._id.toString(), {
        rewardId: reward._id,
        updates: Object.keys(data),
      });

      typedLogger.info('Admin reward updated', { adminId, rewardId: reward._id });

      return reward.toJSON();
    } catch (error) {
      typedLogger.error('Admin update reward error', { error: (error as any).message, adminId, rewardId, data });
      throw error;
    }
  }

  /**
   * Delete a reward (soft delete)
   */
  static async deleteReward(adminId: string, rewardId: string) {
    try {
      // Validate ObjectId
      if (!Types.ObjectId.isValid(rewardId)) {
        throw new Error('REWARD_NOT_FOUND');
      }

      // Use updateOne to avoid triggering full validation on legacy documents
      const result = await Reward.updateOne(
        { _id: rewardId },
        { $set: { isActive: false } }
      );

      if (result.matchedCount === 0) {
        throw new Error('REWARD_NOT_FOUND');
      }

      await this.logAction(adminId, 'delete_reward', rewardId, { rewardId });

      typedLogger.info('Admin reward deleted', { adminId, rewardId });

      return { success: true, deletedId: rewardId };
    } catch (error) {
      typedLogger.error('Admin delete reward error', { error: (error as any).message, adminId, rewardId });
      throw error;
    }
  }

  /**
   * Update reward stock
   */
  static async updateRewardStock(adminId: string, rewardId: string, quantity: number) {
    try {
      const reward = await Reward.findById(rewardId);
      if (!reward) {
        throw new Error('REWARD_NOT_FOUND');
      }

      const previousQuantity = reward.stockQuantity;
      const diff = quantity - reward.stockQuantity;
      reward.stockQuantity = quantity;
      reward.stockAvailable = Math.max(0, reward.stockAvailable + diff);

      await reward.save();

      await this.logAction(adminId, 'update_reward_stock', reward._id.toString(), {
        rewardId: reward._id,
        quantity,
        previousQuantity,
      });

      typedLogger.info('Admin reward stock updated', { adminId, rewardId: reward._id, newQuantity: quantity });

      return reward.toJSON();
    } catch (error) {
      typedLogger.error('Admin update reward stock error', { error: (error as any).message, adminId, rewardId, quantity });
      throw error;
    }
  }

  /**
   * Get rewards analytics
   */
  static async getRewardAnalytics(period: string = '30d') {
    try {
      const days = parseInt(String(period).replace('d', '')) || 30;
      const start = new Date();
      start.setDate(start.getDate() - days);

      const [byCategory, lowStock] = await Promise.all([
        Reward.aggregate([
          { $match: { createdAt: { $gte: start } } },
          { $group: { _id: '$category', count: { $sum: 1 }, avgCost: { $avg: '$pointsCost' } } },
        ]),
        (Reward as any).getLowStockRewards?.(10) || Reward.find({ isActive: true, stockAvailable: { $lte: 10, $gt: 0 } }).limit(10),
      ]);

      return {
        byCategory,
        lowStock: Array.isArray(lowStock) ? lowStock.map((r: any) => ({
          id: r._id,
          name: r.name,
          stockAvailable: r.stockAvailable,
        })) : [],
      };
    } catch (error) {
      typedLogger.error('Get reward analytics error', { error: (error as any).message, period });
      throw error;
    }
  }

  /**
   * Log admin action for audit trail
   */
  private static async logAction(adminId: string, action: string, resourceId: string, details: any) {
    // Use unified audit logger - writes to both Pino and MongoDB
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action: action.toUpperCase(),
      resource: 'reward',
      resourceId,
      category: 'admin',
      severity: action.includes('delete') ? 'medium' : 'low',
      metadata: details,
    });
  }
}

export default AdminRewardsService;
