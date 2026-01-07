// Merged admin module - combines index.ts and admin-extended.ts
import { ARSession } from '@/models/ARSession';
import { Achievement } from '@/models/Achievement';
import { Analytics } from '@/models/Analytics';
import { AuditLog } from '@/models/AuditLog';
import { Claim } from '@/models/Claim';
import { Code } from '@/models/Code';
import { DeviceToken } from '@/models/DeviceToken';
import { Distribution } from '@/models/Distribution';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { Friendship } from '@/models/Friendship';
import FriendshipService from '@/services/friendship';
import { Redemption } from '@/models/Redemption';
import { CodeStatus, RedemptionStatus } from '@/types';
import { NotificationService } from '@/modules/notifications';
import { Notification } from '@/models/Notification';
import { NotificationStatus } from '@/types';
import { OfflineQueue } from '@/models/OfflineQueue';
import { Partner } from '@/models/Partner';
import { Prize } from '@/models/Prize';
import { PrizeService } from '@/modules/prizes';
import { Report } from '@/models/Report';
import { Reward } from '@/models/Reward';
import { Session } from '@/models/Session';
import { Settings } from '@/models/Settings';
import { Types } from 'mongoose';
import { User } from '@/models/User';
import { UsersService } from '@/modules/users';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { logger } from '@/lib/logger';
import typedLogger from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';
import { z } from 'zod';
import { AuditLog as AuditLogModel } from '@/models/AuditLog';
import mongoose from 'mongoose';

type AdminRequest<P = Record<string, any>, B = any, Q = any> = FastifyRequest<{
  Params: P;
  Body: B;
  Querystring: Q;
}>;

const logAdminAction = async (data: any) => {
  try {
    await (AuditLogModel as any).logAction({
      category: 'admin',
      severity: data.severity || 'low',
      success: data.success ?? true,
      timestamp: new Date(),
      ...data,
    });
  } catch {}
};



// Admin dashboard service
export class AdminService {
  static async getDashboardStats() {
    try {
      const [userStats, prizeStats, claimStats, rewardStats] = await Promise.all([
        User.aggregate([
          {
            $group: {
              _id: null,
              totalUsers: { $sum: 1 },
              activeUsers: {
                $sum: {
                  $cond: [
                    { $gte: ['$lastActive', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
                    1,
                    0
                  ]
                }
              },
              bannedUsers: { $sum: { $cond: ['$isBanned', 1, 0] } }}
          }
        ]),
        Prize.aggregate([
          {
            $group: {
              _id: null,
              totalPrizes: { $sum: 1 },
              activePrizes: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
              claimedPrizes: { $sum: { $cond: [{ $eq: ['$status', 'claimed'] }, 1, 0] } }}
          }
        ]),
        Claim.aggregate([
          {
            $group: {
              _id: null,
              totalClaims: { $sum: 1 },
              totalPointsAwarded: { $sum: '$pointsAwarded' },
              averageDistance: { $avg: '$distance' }}
          }
        ]),
        Reward.aggregate([
          {
            $group: {
              _id: null,
              totalRewards: { $sum: 1 },
              activeRewards: { $sum: { $cond: ['$isActive', 1, 0] } },
              totalStock: { $sum: '$stockQuantity' },
              availableStock: { $sum: '$stockAvailable' }}
          }
        ])]);

      // Redemptions summary (core + marketplace)
      let redemptionsSummary: any = { total: 0, core: 0, marketplace: 0 };
      let purchasesSummary: any = { total: 0, unredeemed: 0, redeemed: 0 };
      try {
        const coreCount = await Redemption.countDocuments({});
        const marketplaceCount = await Redemption.countDocuments({ 'metadata.source': 'marketplace' });
        const redeemed = await Redemption.countDocuments({ 'metadata.source': 'marketplace', status: 'FULFILLED' });
        const unredeemed = await Redemption.countDocuments({ 'metadata.source': 'marketplace', status: 'PENDING' });
        purchasesSummary = { total: marketplaceCount, unredeemed, redeemed };
        redemptionsSummary = { total: coreCount, core: coreCount - marketplaceCount, marketplace: marketplaceCount };
      } catch {}

      return {
        users: userStats[0] || { totalUsers: 0, activeUsers: 0, bannedUsers: 0 },
        prizes: prizeStats[0] || { totalPrizes: 0, activePrizes: 0, claimedPrizes: 0 },
        claims: claimStats[0] || { totalClaims: 0, totalPointsAwarded: 0, averageDistance: 0 },
        rewards: rewardStats[0] || { totalRewards: 0, activeRewards: 0, totalStock: 0, availableStock: 0 },
        redemptions: redemptionsSummary,
        purchases: purchasesSummary,
        timestamp: new Date().toISOString()};
    } catch (error) {
      typedLogger.error('Get dashboard stats error', { error: (error as any).message });
      throw error;
    }
  }

  static async getAuditLogs(options: any = {}) {
    try {
      const skip = ((options.page || 1) - 1) * (options.limit || 50);
      
      const query: any = {};
      if (options.userId) query.userId = options.userId;
      if (options.action) query.action = options.action;
      if (options.resource) query.resource = options.resource;
      
      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .populate('userId', 'displayName email')
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(options.limit || 50)
          .lean(),
        AuditLog.countDocuments(query)]);

      const safeLogs = (logs as any[]) || [];
      return {
        logs: safeLogs.map(log => ({
          id: log._id,
          user: log.userId,
          action: log.action,
          resource: log.resource,
          resourceId: log.resourceId,
          metadata: log.metadata,
          timestamp: log.timestamp,
          ip: log.ipAddress || log.ip,
          userAgent: log.userAgent,
        })),
        pagination: {
          page: options.page || 1,
          limit: options.limit || 50,
          total,
          pages: Math.ceil(total / (options.limit || 50))}};
    } catch (error) {
      typedLogger.error('Get audit logs error', { error: (error as any).message });
      throw error;
    }
  }

  /**
   * Log admin action for audit trail
   */
  static async logAdminAction(
    adminId: string,
    action: string,
    resource: string,
    resourceId: string,
    metadata: any,
    ip?: string,
    userAgent?: string
  ) {
    try {
      const auditLog = new AuditLog({
        userId: new Types.ObjectId(adminId),
        action,
        resource,
        resourceId,
        details: metadata,
        ipAddress: ip || '127.0.0.1',
        userAgent: userAgent || 'Admin Panel',
        timestamp: new Date()});

      await auditLog.save();
    } catch (error) {
      typedLogger.error('Log admin action error', { error: (error as any).message });
    }
  }
}

// Admin-specific reward management service
class AdminRewardService {
  /**
   * Get rewards with admin capabilities (all rewards regardless of availability)
   */
  static async getRewards(query: any = {}) {
    try {
      const page = parseInt(query.page) || 1;
      const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 50));
      const skip = (page - 1) * limit;

      const filterQuery: any = {};

      // Add query filters
      if (query.category) filterQuery.category = query.category;
      if (query.status && query.status !== 'all') {
        filterQuery.isActive = query.status === 'active';
      }
      if (query.minCost) filterQuery.pointsCost = { $gte: parseInt(query.minCost) };
      if (query.maxCost) {
        filterQuery.pointsCost = { ...filterQuery.pointsCost, $lte: parseInt(query.maxCost) };
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

      const pagination = {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: skip + limit < total,
        hasPrev: page > 1,
      };

      return {
        rewards: rewards.map(reward => reward.toJSON()),
        pagination,
        total,
      };
    } catch (error) {
      typedLogger.error('Admin get rewards error', { error: (error as any).message, query });
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
        stockAvailable: stockQuantity, // Initially all stock available
        stockReserved: 0,
        ...rest,
        createdBy: new Types.ObjectId(adminId),
      });

      await reward.save();

      // Log admin action
      await AdminService.logAdminAction(
        adminId,
        'create_reward',
        'reward',
        reward._id.toString(),
        { rewardId: reward._id, name: reward.name, pointsCost: reward.pointsCost }
      );

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
      const reward = await Reward.findById(rewardId);

      if (!reward) {
        throw new Error('REWARD_NOT_FOUND');
      }

      // Update fields
      Object.keys(data).forEach(key => {
        if (['name', 'description', 'category', 'pointsCost', 'imageUrl', 'isActive'].includes(key)) {
          (reward as any)[key] = data[key];
        }
      });

      // If we're updating stock quantity, adjust availability accordingly
      if (data.stockQuantity !== undefined) {
        const diff = data.stockQuantity - reward.stockQuantity;
        reward.stockQuantity = data.stockQuantity;
        reward.stockAvailable += diff; // Add the difference to available stock
      }

      // Update metadata
      reward.updatedBy = new Types.ObjectId(adminId);
      reward.updatedAt = new Date();

      await reward.save();

      // Log admin action
      await AdminService.logAdminAction(
        adminId,
        'update_reward',
        'reward',
        reward._id.toString(),
        { rewardId: reward._id, updates: Object.keys(data) }
      );

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
      const reward = await Reward.findById(rewardId);

      if (!reward) {
        throw new Error('REWARD_NOT_FOUND');
      }

      // Soft delete by deactivating
      reward.isActive = false;
      await reward.save();

      // Log admin action
      await AdminService.logAdminAction(
        adminId,
        'delete_reward',
        'reward',
        reward._id.toString(),
        { rewardId: reward._id }
      );

      typedLogger.info('Admin reward deleted', { adminId, rewardId: reward._id });

      return { success: true, deletedId: reward._id };
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

      // Update stock quantities
      const diff = quantity - reward.stockQuantity;
      reward.stockQuantity = quantity;
      reward.stockAvailable += diff;

      await reward.save();

      // Log admin action
      await AdminService.logAdminAction(
        adminId,
        'update_reward_stock',
        'reward',
        reward._id.toString(),
        { rewardId: reward._id, quantity, previousQuantity: reward.stockQuantity - diff }
      );

      typedLogger.info('Admin reward stock updated', { adminId, rewardId: reward._id, newQuantity: quantity });

      return reward.toJSON();
    } catch (error) {
      typedLogger.error('Admin update reward stock error', { error: (error as any).message, adminId, rewardId, quantity });
      throw error;
    }
  }
}

class AdminExtendedService {
  private static redis = redisClient;

  /**
   * Get real-time dashboard statistics
   */
  static async getRealTimeStats() {
    try {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        totalUsers,
        activeUsers24h,
        newUsers24h,
        totalClaims24h,
        totalPoints24h,
        activeSessions,
        systemHealth
      ] = await Promise.all([
        User.countDocuments({ isBanned: false }),
        User.countDocuments({ lastActive: { $gte: last24h } }),
        User.countDocuments({ createdAt: { $gte: last24h } }),
        Claim.countDocuments({ claimedAt: { $gte: last24h } }),
        Claim.aggregate([
          { $match: { claimedAt: { $gte: last24h } } },
          { $group: { _id: null, total: { $sum: '$pointsAwarded' } } }
        ]),
        this.getActiveSessions(),
        this.getSystemHealth()]);

      return {
        users: {
          total: totalUsers,
          active24h: activeUsers24h,
          new24h: newUsers24h},
        activity: {
          claims24h: totalClaims24h,
          points24h: totalPoints24h[0]?.total || 0,
          activeSessions: activeSessions.count},
        system: systemHealth,
        timestamp: now.toISOString()};
    } catch (error) {
      typedLogger.error('Get real-time stats error', { error: (error as any).message });
      throw error;
    }
  }

  /**
   * Get user management data
   */
  static async getUsers(options: any) {
    try {
      const { page, limit, search, status, level } = options;
      const skip = (page - 1) * limit;

      // Build query
      const query: any = {};
      
      if (status !== 'all') {
        switch (status) {
          case 'banned':
            query.isBanned = true;
            break;
          case 'active':
            query.lastActive = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
            query.isBanned = false;
            break;
          case 'inactive':
            query.lastActive = { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
            query.isBanned = false;
            break;
        }
      }

      if (level) {
        query.level = level;
      }

      if (search) {
        query.$or = [
          { displayName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }];
      }

      const [users, total] = await Promise.all([
        User.find(query)
          .select('displayName email level points stats lastActive createdAt isBanned banReason avatar')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        User.countDocuments(query)]);

      return {
        users: users.map(user => ({
          id: user._id,
          displayName: user.displayName,
          email: user.email,
          level: user.level,
          points: user.points,
          totalClaims: user.stats?.prizesFound || 0,  // Using prizesFound instead of non-existent totalClaims
          totalDistance: user.stats?.totalPlayTime || 0,  // Using totalPlayTime as substitute for missing totalDistance field
          lastActive: user.lastActive,
          createdAt: user.createdAt,
          isBanned: user.isBanned,
          banReason: user.banReason,
          avatar: user.avatar})),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)}};
    } catch (error) {
      typedLogger.error('Get users error', { error: (error as any).message, options });
      throw error;
    }
  }

  /**
   * Admin: get a single user profile (reuses user-facing profile logic for consistency)
   */
  static async getUserProfile(userId: string) {
    return UsersService.getProfile(userId);
  }

  /**
   * Admin: update a user's profile (reuses user-facing validation to stay aligned)
   */
  static async updateUserProfile(userId: string, payload: any) {
    return UsersService.updateProfile(userId, payload);
  }

  /**
   * Ban user
   */
  static async banUser(userId: string, banData: any, adminId: string) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('USER_NOT_FOUND');

      const banUntil = banData.duration 
        ? new Date(Date.now() + banData.duration * 60 * 60 * 1000)
        : null; // Permanent if no duration

      await User.findByIdAndUpdate(userId, {
        isBanned: true,
        banReason: banData.reason,
        bannedAt: new Date(),
        banUntil,
        bannedBy: adminId});

      // Invalidate all user sessions
      const sessionKeys = await this.redis.keys(`session:*${userId}*`);
      if (sessionKeys.length > 0) {
        await this.redis.del(...sessionKeys);
      }

      // Log admin action
      await AdminExtendedService.logAdminAction(adminId, 'ban_user', 'user', userId, {
        reason: banData.reason,
        duration: banData.duration,
        targetUser: user.email});

      // Send notification if requested
      if (banData.notifyUser) {
        const { PushNotificationService } = await import('@/services/push-notifications');
        await PushNotificationService.sendToUser(
          userId,
          {
            title: 'Compte Suspendu',
            body: banData.duration
              ? `Votre compte a été suspendu pour ${banData.duration} heures. Raison: ${banData.reason}`
              : `Votre compte a été banni définitivement. Raison: ${banData.reason}`,
            data: {
              type: 'account_ban',
              reason: banData.reason,
              duration: banData.duration?.toString(),
              banUntil: banUntil?.toISOString()},
            priority: 'high'}
        );
      }

      typedLogger.info('User banned', { userId, adminId, reason: banData.reason });

      return { success: true, banUntil };
    } catch (error) {
      typedLogger.error('Ban user error', { error: (error as any).message, userId, adminId });
      throw error;
    }
  }

  /**
   * Unban user
   */
  static async unbanUser(userId: string, adminId: string) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('USER_NOT_FOUND');
      if (!user.isBanned) throw new Error('USER_NOT_BANNED');

      await User.findByIdAndUpdate(userId, {
        isBanned: false,
        banReason: null,
        bannedAt: null,
        banUntil: null,
        bannedBy: null,
        unbannedAt: new Date(),
        unbannedBy: adminId});

      // Log admin action
      await AdminExtendedService.logAdminAction(adminId, 'unban_user', 'user', userId, {
        targetUser: user.email});

      typedLogger.info('User unbanned', { userId, adminId });

      return { success: true };
    } catch (error) {
      typedLogger.error('Unban user error', { error: (error as any).message, userId, adminId });
      throw error;
    }
  }

  /**
   * Get prize management data
   */
  
  static async getPrizes(options: any = {}) {
    try {
      const { page = 1, limit = 20, status = 'all', category } = options;
      const skip = (page - 1) * limit;

      const query: any = {};
      
      if (status !== 'all') {
        query.status = status;
      }

      if (category) {
        query.category = category;
      }

      const [prizes, total] = await Promise.all([
        Prize.find(query)
          .populate('createdBy', 'displayName email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Prize.countDocuments(query)]);

      return {
        prizes: prizes.map(prize => ({
          id: prize._id,
          title: prize.name,
          description: prize.description,
          category: prize.category,
          points: prize.points,
          rarity: prize.rarity,
          location: {
            latitude: prize.location.coordinates[1],
            longitude: prize.location.coordinates[0],
            address: prize.location.address},
          status: prize.status,
          claimsCount: prize.claimedCount || 0,
          maxClaims: prize.quantity,
          expiresAt: prize.expiresAt,
          createdAt: prize.createdAt,
          createdBy: prize.createdBy})),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)}};
    } catch (error) {
      typedLogger.error('Get prizes error', { error: (error as any).message, options });
      throw error;
    }
  }

  /**
   * Create new prize
   */
  static async createPrize(prizeData: any, adminId: string) {
    try {
      // Map admin payload to PrizeService schema
      const mapped = {
        name: prizeData.title || prizeData.name,
        description: prizeData.description,
        type: prizeData.type || 'treasure',
        category: prizeData.category,
        points: prizeData.points,
        rarity: prizeData.rarity,
        quantity: prizeData.quantity || prizeData.maxClaims || 1,
        location: {
          type: 'gps',
          coordinates: [
            prizeData.location?.longitude ?? prizeData.location?.coordinates?.[0],
            prizeData.location?.latitude ?? prizeData.location?.coordinates?.[1]
          ],
          radius: prizeData.location?.radius || 50,
          city: prizeData.location?.city,
          address: prizeData.location?.address,
          markerUrl: prizeData.location?.markerUrl,
          confidenceThreshold: prizeData.location?.confidenceThreshold || 0.8
        },
        visibility: prizeData.visibility,
        expiresAt: prizeData.expiresAt,
        imageUrl: prizeData.imageUrl,
        value: prizeData.value,
        tags: prizeData.tags || []
      };

      const created = await PrizeService.createPrize(adminId, mapped as any);
      const createdId = (created as any)?._id || (created as any)?.id || (created as any)?.prizeId;

      // Log admin action
      await AdminExtendedService.logAdminAction(adminId, 'create_prize', 'prize', createdId?.toString(), {
        title: prizeData.title || mapped.name,
        category: prizeData.category,
        points: prizeData.points});

      typedLogger.info('Prize created', { prizeId: createdId, adminId, name: prizeData.title || mapped.name });

      return { success: true, prizeId: createdId };
    } catch (error) {
      typedLogger.error('Create prize error', { error: (error as any).message, prizeData, adminId });
      throw error;
    }
  }

  /**
   * Update prize
   */
  static async updatePrize(prizeId: string, updateData: any, adminId: string) {
    try {
      const mapped: any = { ...updateData };
      if (updateData.location) {
        mapped.location = {
          type: 'gps',
          coordinates: [
            updateData.location.longitude ?? updateData.location.coordinates?.[0],
            updateData.location.latitude ?? updateData.location.coordinates?.[1]
          ],
          radius: updateData.location.radius,
          city: updateData.location.city,
          address: updateData.location.address,
          markerUrl: updateData.location.markerUrl,
          confidenceThreshold: updateData.location.confidenceThreshold
        };
      }

      const updatedPrize = await PrizeService.updatePrize(adminId, prizeId, mapped);

      // Log admin action
      await AdminExtendedService.logAdminAction(adminId, 'update_prize', 'prize', prizeId, {
        changes: updateData});

      typedLogger.info('Prize updated', { prizeId, adminId });

      return { success: true, prize: updatedPrize };
    } catch (error) {
      typedLogger.error('Update prize error', { error: (error as any).message, prizeId, adminId });
      throw error;
    }
  }

  /**
   * Delete prize
   */
  static async deletePrize(prizeId: string, adminId: string) {
    try {
      const result = await PrizeService.deletePrize(adminId, prizeId);

      // Log admin action
      await AdminExtendedService.logAdminAction(adminId, 'delete_prize', 'prize', prizeId, {
        hadClaims: (result as any)?.hadClaims ?? false});

      typedLogger.info('Prize deleted', { prizeId, adminId, hadClaims: (result as any)?.hadClaims ?? false });

      return { success: true };
    } catch (error) {
      typedLogger.error('Delete prize error', { error: (error as any).message, prizeId, adminId });
      throw error;
    }
  }

  /**
   * Get analytics data
   */
  static async getAnalytics(timeRange: string = '7d') {
    try {
      const now = new Date();
      let startDate: Date;

      switch (timeRange) {
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      const [userGrowth, claimsByCategory, topUsers, revenueData] = await Promise.all([
        this.getUserGrowthData(startDate),
        this.getClaimsByCategory(startDate),
        this.getTopUsers(10),
        this.getRevenueData(startDate)]);

      return {
        timeRange,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        userGrowth,
        claimsByCategory,
        topUsers,
        revenue: revenueData};
    } catch (error) {
      typedLogger.error('Get analytics error', { error: (error as any).message, timeRange });
      throw error;
    }
  }

  /**
   * Send notification
   */
  static async sendNotification(notificationData: any, adminId: string) {
    try {
      let targetUsers: string[] = [];

      // Determine target users
      switch (notificationData.target) {
        case 'all':
          const allUsers = await User.find({ isBanned: false }).select('_id');
          targetUsers = allUsers.map(u => u._id.toString());
          break;
        
        case 'active':
          const activeUsers = await User.find({
            isBanned: false,
            lastActive: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }).select('_id');
          targetUsers = activeUsers.map(u => u._id.toString());
          break;
        
        case 'level':
          if (notificationData.data?.level) {
            const levelUsers = await User.find({
              isBanned: false,
              level: notificationData.data.level
            }).select('_id');
            targetUsers = levelUsers.map(u => u._id.toString());
          }
          break;
        
        case 'location':
          if (notificationData.data?.location) {
            const { latitude, longitude, radius } = notificationData.data.location;
            // Find users within radius (in kilometers)
            const radiusInMeters = radius * 1000;
            const locationUsers = await User.find({
              isBanned: false,
              'location.coordinates': {
                $near: {
                  $geometry: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                  },
                  $maxDistance: radiusInMeters
                }
              }
            }).select('_id');
            targetUsers = locationUsers.map(u => u._id.toString());
          }
          break;
        
        case 'specific':
          targetUsers = notificationData.data?.userIds || [];
          break;
      }

      // Store notification for processing
      const notification = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        targetUsers,
        createdBy: adminId,
        createdAt: new Date().toISOString(),
        scheduleAt: notificationData.scheduleAt || new Date().toISOString(),
        status: 'pending'};

      // Store in Redis for processing
      await this.redis.lpush('notification_queue', JSON.stringify(notification));

      // Log admin action
      await AdminExtendedService.logAdminAction(adminId, 'send_notification', 'notification', notification.id, {
        type: notificationData.type,
        target: notificationData.target,
        userCount: targetUsers.length});

      typedLogger.info('Notification queued', { 
        notificationId: notification.id, 
        adminId, 
        targetCount: targetUsers.length 
      });

      return { 
        success: true, 
        notificationId: notification.id,
        targetUserCount: targetUsers.length 
      };
    } catch (error) {
      typedLogger.error('Send notification error', { error: (error as any).message, notificationData, adminId });
      throw error;
    }
  }

  /**
   * Get system logs
   */
  static async getSystemLogs(options: any = {}) {
    try {
      const { page = 1, limit = 50, level = 'all', source = 'all' } = options;
      
      // This would typically read from log files or a logging service
      // For now, return audit logs as system logs
      return this.getAuditLogs({ page, limit });
    } catch (error) {
      typedLogger.error('Get system logs error', { error: (error as any).message, options });
      throw error;
    }
  }

  /**
   * Create system backup
   */
  static async createBackup(adminId: string) {
    try {
      const backupId = `backup_${Date.now()}`;
      
      // Queue backup job
      const backupJob = {
        id: backupId,
        type: 'full_backup',
        createdBy: adminId,
        createdAt: new Date().toISOString(),
        status: 'pending'};

      await this.redis.lpush('backup_queue', JSON.stringify(backupJob));

      // Log admin action
      await AdminExtendedService.logAdminAction(adminId, 'create_backup', 'system', backupId, {});

      typedLogger.info('Backup job queued', { backupId, adminId });

      return { success: true, backupId };
    } catch (error) {
      typedLogger.error('Create backup error', { error: (error as any).message, adminId });
      throw error;
    }
  }

  // Helper methods
  private static async getActiveSessions() {
    try {
      const sessionKeys = await this.redis.keys('session:*');
      return { count: sessionKeys.length };
    } catch (error) {
      return { count: 0 };
    }
  }

  private static async getSystemHealth() {
    try {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      return {
        uptime: Math.floor(uptime),
        memory: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
          total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
          usage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100), // %
        },
        status: 'healthy'};
    } catch (error) {
      return { status: 'error', error: (error as any).message };
    }
  }

  public static async logAdminAction(
    adminId: string,
    action: string,
    resource: string,
    resourceId: string,
    metadata: any,
    ip?: string,
    userAgent?: string
  ) {
    try {
      const auditLog = new AuditLog({
        userId: new Types.ObjectId(adminId),
        action,
        resource,
        resourceId,
        details: metadata,
        ipAddress: ip || '127.0.0.1',
        userAgent: userAgent || 'Admin Panel',
        timestamp: new Date()});

      await auditLog.save();
    } catch (error) {
      typedLogger.error('Log admin action error', { error: (error as any).message });
    }
  }

  private static async getUserGrowthData(startDate: Date) {
    try {
      const userGrowth = await User.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
        }
      ]);

      return userGrowth.map(item => ({
        date: new Date(item._id.year, item._id.month - 1, item._id.day).toISOString().split('T')[0],
        count: item.count}));
    } catch (error) {
      typedLogger.error('Get user growth data error', { error: (error as any).message });
      return [];
    }
  }

  private static async getClaimsByCategory(startDate: Date) {
    try {
      const claimsByCategory = await Claim.aggregate([
        {
          $match: {
            claimedAt: { $gte: startDate }
          }
        },
        {
          $lookup: {
            from: 'prizes',
            localField: 'prizeId',
            foreignField: '_id',
            as: 'prize'
          }
        },
        {
          $unwind: '$prize'
        },
        {
          $group: {
            _id: '$prize.category',
            count: { $sum: 1 },
            totalPoints: { $sum: '$pointsAwarded' }
          }
        }
      ]);

      return claimsByCategory.map(item => ({
        category: item._id,
        claims: item.count,
        totalPoints: item.totalPoints}));
    } catch (error) {
      typedLogger.error('Get claims by category error', { error: (error as any).message });
      return [];
    }
  }

  private static async getTopUsers(limit: number) {
    try {
      const topUsers = await User.find({ isBanned: false })
        .select('displayName level points stats.prizesFound')
        .sort({ points: -1 })
        .limit(limit);

      return topUsers.map((user, index) => ({
        rank: index + 1,
        displayName: user.displayName,
        level: user.level,
        points: user.points,
        totalClaims: user.stats?.prizesFound || 0}));
    } catch (error) {
      typedLogger.error('Get top users error', { error: (error as any).message });
      return [];
    }
  }

  private static async getRevenueData(startDate: Date) {
    try {
      // This would calculate revenue from redemptions, partnerships, etc.
      // For now, return mock data
      return {
        totalRevenue: 0,
        redemptions: 0,
        partnerships: 0};
    } catch (error) {
      typedLogger.error('Get revenue data error', { error: (error as any).message });
      return { totalRevenue: 0, redemptions: 0, partnerships: 0 };
    }
  }

  private static async getAuditLogs(options: any = {}) {
    try {
      const { page = 1, limit = 50 } = options;
      const skip = (page - 1) * limit;

      const [logs, total] = await Promise.all([
        AuditLog.find({})
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments({})]);

      const safeLogs = (logs as any[]) || [];
      return {
        logs: safeLogs.map(log => ({
          id: log._id,
          user: log.userId,
          action: log.action,
          resource: log.resource,
          resourceId: log.resourceId,
          metadata: log.metadata,
          timestamp: log.timestamp,
          ip: log.ipAddress || log.ip,
          userAgent: log.userAgent})),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)}};
    } catch (error) {
      typedLogger.error('Get audit logs error', { error: (error as any).message });
      throw error;
    }
  }
}

const UserManagementSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['all', 'active', 'banned', 'inactive']).default('all'),
  level: z.string().optional()});

const BanUserSchema = z.object({
  reason: z.string().min(1).max(500),
  duration: z.number().min(1).optional(), // hours, if not provided = permanent
  notifyUser: z.boolean().default(true)});

const PrizeManagementSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  category: z.enum(['food', 'shopping', 'entertainment', 'travel', 'technology', 'health', 'education']),
  points: z.number().min(1).max(10000),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    address: z.string().optional()}),
  expiresAt: z.string().datetime(),
  maxClaims: z.number().min(1).default(1),
  isActive: z.boolean().default(true)});

const NotificationSchema = z.object({
  type: z.enum(['push', 'email', 'sms', 'in-app']),
  target: z.enum(['all', 'active', 'level', 'location', 'specific']),
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
  data: z.object({
    userIds: z.array(z.string()).optional(),
    level: z.string().optional(),
    location: z.object({
      latitude: z.number(),
      longitude: z.number(),
      radius: z.number(), // km
    }).optional()}).optional(),
  scheduleAt: z.string().datetime().optional()});

// Analytics Service (merged from analytics module)
class AnalyticsService {
  static async getAnalytics(startDate?: string, endDate?: string) {
    try {
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const analytics = await Analytics.find({
        date: { $gte: start, $lte: end }
      }).sort({ date: -1 });

      return {
        analytics: analytics.map(a => a.toJSON()),
        period: { start, end },
        total: analytics.length};
    } catch (error: any) {
      typedLogger.error('Get analytics error', { error: (error as any).message });
      throw error;
    }
  }

  static async generateDailyAnalytics(date: Date = new Date()) {
    try {
      const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

      const [userMetrics, prizeMetrics, claimMetrics] = await Promise.all([
        User.aggregate([
          {
            $group: {
              _id: null,
              totalUsers: { $sum: 1 },
              activeUsers: {
                $sum: {
                  $cond: [
                    { $gte: ['$lastActive', startOfDay] },
                    1,
                    0
                  ]
                }
              },
              newUsers: {
                $sum: {
                  $cond: [
                    { $gte: ['$createdAt', startOfDay] },
                    1,
                    0
                  ]
                }
              }}
          }
        ]),
        Prize.aggregate([
          {
            $group: {
              _id: null,
              totalPrizes: { $sum: 1 },
              claimedPrizes: {
                $sum: {
                  $cond: [
                    { $and: [
                      { $eq: ['$status', 'captured'] },
                      { $gte: ['$capturedAt', startOfDay] }
                    ]},
                    1,
                    0
                  ]
                }
              }}
          }
        ]),
        Claim.aggregate([
          { $match: { claimedAt: { $gte: startOfDay, $lt: endOfDay } } },
          {
            $group: {
              _id: null,
              totalClaims: { $sum: 1 },
              totalPoints: { $sum: '$pointsAwarded' },
              averageDistance: { $avg: '$distance' }}
          }
        ])]);

      const metrics = {
        totalUsers: userMetrics[0]?.totalUsers || 0,
        activeUsers: userMetrics[0]?.activeUsers || 0,
        newUsers: userMetrics[0]?.newUsers || 0,
        totalPrizes: prizeMetrics[0]?.totalPrizes || 0,
        claimedPrizes: prizeMetrics[0]?.claimedPrizes || 0,
        totalRewards: 0,
        redeemedRewards: 0,
        totalPoints: claimMetrics[0]?.totalPoints || 0,
        averageSessionTime: 0,
        retentionRate: 0,
        conversionRate: 0};

      // Save or update analytics
      await Analytics.findOneAndUpdate(
        { date: startOfDay },
        { metrics, generatedAt: new Date() },
        { upsert: true }
      );

      return metrics;
    } catch (error: any) {
      typedLogger.error('Generate daily analytics error', { error: (error as any).message });
      throw error;
    }
  }
}

// Partners Service (merged from partners module)
class PartnersService {
  static async createPartner(adminId: string, data: any) {
    try {
      const partner = new Partner({
        ...data,
        createdBy: adminId});

      await partner.save();

      typedLogger.info('Partner created', {
        partnerId: partner._id,
        adminId,
        name: partner.name});

      return partner.toJSON();
    } catch (error: any) {
      typedLogger.error('Create partner error', { error: (error as any).message, adminId });
      throw error;
    }
  }

  static async getPartners(options: any = {}) {
    try {
      const skip = ((options.page || 1) - 1) * (options.limit || 50);
      
      const query: any = {};
      if (options.isActive !== undefined) {
        query.isActive = options.isActive;
      }

      const [partners, total] = await Promise.all([
        Partner.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(options.limit || 50),
        Partner.countDocuments(query)]);

      return {
        partners: partners.map(p => p.toJSON()),
        pagination: {
          page: options.page || 1,
          limit: options.limit || 50,
          total,
          pages: Math.ceil(total / (options.limit || 50))}};
    } catch (error: any) {
      typedLogger.error('Get partners error', { error: (error as any).message });
      throw error;
    }
  }
}

// Helper alias for routes (keeps type inference stable)
const AdminUsersService: any = AdminService;

export default async function adminRoutes(fastify: FastifyInstance) {
  // Get dashboard statistics
  fastify.get('/dashboard', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const result = await AdminService.getDashboardStats();
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get audit logs
  fastify.get('/audit-logs', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const result = await AdminService.getAuditLogs(request.query);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== Admin: Users ====================
  fastify.get('/users', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const result = await AdminUsersService.getUsers(request.query as any);
      const pagination = result.pagination || {};
      const total = pagination.total ?? result.users.length;
      const limit = pagination.limit ?? result.users.length;
      const page = pagination.page ?? 1;
      const hasMore = typeof pagination.pages === 'number'
        ? page < pagination.pages
        : page * limit < total;
      reply.send({
        success: true,
        users: result.users || [],
        total,
        page,
        limit,
        hasMore,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.get('/users/:userId', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: AdminRequest<{ userId: string }>, reply) => {
    try {
      const { userId } = request.params;
      const result = await AdminUsersService.getUserProfile(userId);
      reply.send({ success: true, data: result });
    } catch (error: any) {
      const statusCode = (error as any).message === 'USER_NOT_FOUND' ? 404 : 500;
      reply.code(statusCode).send({ success: false, error: (error as any).message });
    }
  });

  fastify.patch('/users/:userId', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: AdminRequest<{ userId: string }, any>, reply) => {
    try {
      const { userId } = request.params;
      const result = await AdminUsersService.updateUserProfile(userId, request.body);
      reply.send({ success: true, data: result });
    } catch (error: any) {
      const statusCodes: Record<string, number> = {
        'USER_NOT_FOUND': 404,
        'EMAIL_ALREADY_EXISTS': 409,
      };
      const statusCode = statusCodes[(error as any).message] || 500;
      reply.code(statusCode).send({ success: false, error: (error as any).message });
    }
  });

  fastify.post('/users/:userId/ban', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: AdminRequest<{ userId: string }, { reason?: string; duration?: number }>, reply) => {
    try {
      const { reason, duration } = request.body || {};
      if (!reason) {
        return reply.code(400).send({ success: false, error: 'REASON_REQUIRED' });
      }
      const result = await AdminUsersService.banUser(request.params.userId, { reason, duration }, request.user.sub);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      const statusCodes: Record<string, number> = {
        'USER_NOT_FOUND': 404,
        'CANNOT_BAN_SUPER_ADMIN': 403,
      };
      const statusCode = statusCodes[(error as any).message] || 500;
      return reply.code(statusCode).send({ success: false, error: (error as any).message });
    }
  });

  fastify.post('/users/:userId/unban', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: AdminRequest<{ userId: string }>, reply) => {
    try {
      const result = await AdminUsersService.unbanUser(request.params.userId, request.user.sub);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      const statusCode = (error as any).message === 'USER_NOT_FOUND' ? 404 : 500;
      return reply.code(statusCode).send({ success: false, error: (error as any).message });
    }
  });

  // Adjust user points (add or subtract) with audit-friendly response
  fastify.post('/users/:userId/points', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: AdminRequest<{ userId: string }, { points?: number; reason?: string }>, reply) => {
    try {
      const { points, reason } = request.body || {};
      if (typeof points !== 'number' || points === 0) {
        return reply.code(400).send({ success: false, error: 'INVALID_POINTS_VALUE' });
      }

      const user = await User.findById(request.params.userId);
      if (!user) {
        return reply.code(404).send({ success: false, error: 'USER_NOT_FOUND' });
      }

      let applied = 0;
      if (points > 0) {
        user.addPoints(points);
        applied = points;
      } else {
        const spend = Math.abs(points);
        const ok = user.spendPoints(spend);
        if (!ok) {
          return reply.code(400).send({ success: false, error: 'INSUFFICIENT_POINTS' });
        }
        applied = -spend;
      }

      await user.save();

      // Audit log
      try {
        await (AuditLog as any).logAction({
          userId: (request as any).user?.sub,
          action: applied > 0 ? 'add_points' : 'deduct_points',
          resource: 'user',
          resourceId: user._id.toString(),
          category: 'admin',
          severity: 'low',
          success: true,
          description: `Admin adjusted points by ${applied}`,
          metadata: { reason: reason || null, newBalance: (user as any).points?.available },
        } as any);
      } catch {}

      return reply.send({
        success: true,
        data: {
          userId: user._id,
          delta: applied,
          balance: user.points?.available || 0,
          reason: reason || null,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      try {
        await (AuditLog as any).logAction({
          userId: (request as any).user?.sub,
          action: 'adjust_points_failed',
          resource: 'user',
          resourceId: request.params.userId,
          category: 'admin',
          severity: 'medium',
          success: false,
          errorMessage: (error as any).message,
          metadata: { reason: (request.body as any)?.reason },
        } as any);
      } catch {}
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.delete('/users/:userId', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: AdminRequest<{ userId: string }>, reply) => {
    try {
      const user = await User.findById(request.params.userId);
      if (!user) {
        return reply.code(404).send({ success: false, error: 'USER_NOT_FOUND' });
      }
      user.softDelete();
      await user.save();
      return reply.send({ success: true, data: { id: user._id } });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== Admin: Prizes ====================
  fastify.get('/prizes', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const q: any = (request.query as any) || {};
      const page = Math.max(1, parseInt(q.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(q.limit) || 50));
      const skip = (page - 1) * limit;
      const query: any = {};
      if (q.status) query.status = q.status;
      if (q.category) query.category = q.category;
      if (q.rarity) query.rarity = q.rarity;
      if (q.city) query['location.city'] = q.city;
      if (q.search) {
        query.$or = [
          { name: { $regex: q.search, $options: 'i' } },
          { description: { $regex: q.search, $options: 'i' } },
        ];
      }
      const [items, total] = await Promise.all([
        Prize.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Prize.countDocuments(query),
      ]);
      reply.send({
        success: true,
        prizes: items.map(p => p.toJSON()),
        total,
        page,
        limit,
        hasMore: skip + limit < total,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.get('/prizes/:prizeId', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: AdminRequest<{ prizeId: string }>, reply) => {
    try {
      const prize = await Prize.findById(request.params.prizeId);
      if (!prize) {
        return reply.code(404).send({ success: false, error: 'PRIZE_NOT_FOUND' });
      }
      return reply.send({ success: true, data: prize.toJSON() });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.patch('/prizes/:prizeId', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: AdminRequest<{ prizeId: string }, any>, reply) => {
    try {
      const result = await PrizeService.updatePrize(
        request.user.sub,
        request.params.prizeId,
        request.body
      );
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      const statusCodes: Record<string, number> = {
        'PRIZE_NOT_FOUND': 404,
        'COORDINATES_OUT_OF_BOUNDS': 400,
      };
      const statusCode = statusCodes[(error as any).message] || 500;
      return reply.code(statusCode).send({ success: false, error: (error as any).message });
    }
  });

  fastify.delete('/prizes/:prizeId', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: AdminRequest<{ prizeId: string }>, reply) => {
    try {
      const result = await PrizeService.deletePrize(
        request.user.sub,
        request.params.prizeId
      );
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      const statusCode = (error as any).message === 'PRIZE_NOT_FOUND' ? 404 : 500;
      return reply.code(statusCode).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== Admin: Notifications ====================
  fastify.get('/notifications', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const result = await NotificationService.getNotifications(request.query as any);
      reply.send({
        success: true,
        notifications: (result as any).notifications || [],
        total: (result as any).pagination?.total || ((result as any).notifications || []).length,
        hasMore: !!(result as any).pagination && ((result as any).pagination.page * (result as any).pagination.limit < (result as any).pagination.total),
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.post('/notifications/send', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: {
      body: z.object({
        title: z.string(),
        message: z.string(),
        type: z.string().optional(),
        targetType: z.string().optional(),
        targetValue: z.string().optional(),
        scheduledFor: z.string().optional(),
        deliveryMethod: z.enum(['push', 'email', 'inapp', 'all']).optional(),
        metadata: z.record(z.any()).optional(),
      })
    }
  }, async (request, reply) => {
    try {
      const payload = request.body as any;
      const result = await NotificationService.sendNotification(
        request.user.sub,
        payload
      );
      await logAdminAction({
        userId: request.user.sub,
        action: 'send_notification',
        resource: 'notification',
        severity: 'medium',
        success: true,
        metadata: payload,
      });
      reply.code(201).send({ success: true, data: result });
    } catch (error: any) {
      await logAdminAction({
        userId: (request as any).user?.sub,
        action: 'send_notification',
        resource: 'notification',
        severity: 'medium',
        success: false,
        errorMessage: (error as any).message,
      });
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Broadcast notifications (ALL users)
  fastify.post('/notifications/broadcast', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: {
      body: z.object({
        title: z.string(),
        message: z.string(),
        type: z.string().optional(),
        scheduledFor: z.string().optional(),
        metadata: z.record(z.any()).optional(),
      })
    }
  }, async (request, reply) => {
    try {
      const body: any = (request as any).body || {};
      const payload = {
        title: body.title,
        message: body.message,
        type: (body.type || 'push'),
        targetType: 'all',
        scheduledFor: body.scheduledFor,
      } as any;
      const result = await NotificationService.sendNotification((request as any).user.sub, payload);
      await logAdminAction({
        userId: (request as any).user?.sub,
        action: 'broadcast_notification',
        resource: 'notification',
        severity: 'medium',
        success: true,
        metadata: payload,
      });
      reply.code(201).send({ success: true, data: result });
    } catch (error: any) {
      await logAdminAction({
        userId: (request as any).user?.sub,
        action: 'broadcast_notification',
        resource: 'notification',
        severity: 'medium',
        success: false,
        errorMessage: (error as any).message,
      });
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== Admin: Rewards ====================
  // List rewards
  fastify.get('/rewards', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const result: any = await AdminRewardService.getRewards(request.query as any);
      const pagination = result?.pagination || {};
      reply.send({
        success: true,
        rewards: result?.rewards || [],
        total: pagination.total || (result?.rewards?.length || 0),
        page: pagination.page || 1,
        limit: pagination.limit || (result?.rewards?.length || 0),
        hasMore: pagination.hasNext || false,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Rewards analytics
  fastify.get('/rewards/analytics', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const timeframe = (request.query as any)?.period || '30d';
      const days = parseInt(String(timeframe).replace('d', '')) || 30;
      const start = new Date();
      start.setDate(start.getDate() - days);
      const [counts, lowStock] = await Promise.all([
        Reward.aggregate([
          { $match: { createdAt: { $gte: start } } },
          { $group: { _id: '$category', count: { $sum: 1 }, avgCost: { $avg: '$pointsCost' } } },
        ]),
        (Reward as any).getLowStockRewards(10),
      ]);
      reply.send({ success: true, data: { byCategory: counts, lowStock: lowStock.map(r => ({ id: r._id, name: r.name, stockAvailable: r.stockAvailable })) } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Create reward
  fastify.post('/rewards', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: AdminRequest<{}, any>, reply) => {
    try {
      const result = await AdminRewardService.createReward(request.user.sub, request.body);
      await logAdminAction({
        userId: request.user.sub,
        action: 'create_reward',
        resource: 'reward',
        resourceId: (result as any)?._id?.toString?.(),
        severity: 'medium',
        success: true,
        metadata: { payload: request.body },
      });
      return reply.code(201).send({ success: true, data: result });
    } catch (error: any) {
      await logAdminAction({
        userId: (request as any).user?.sub,
        action: 'create_reward',
        resource: 'reward',
        severity: 'medium',
        success: false,
        errorMessage: (error as any).message,
      });
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Update reward
  fastify.patch('/rewards/:rewardId', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: AdminRequest<{ rewardId: string }, any>, reply) => {
    try {
      const result = await AdminRewardService.updateReward(
        request.user.sub,
        request.params.rewardId,
        request.body
      );
      await logAdminAction({
        userId: request.user.sub,
        action: 'update_reward',
        resource: 'reward',
        resourceId: request.params.rewardId,
        severity: 'medium',
        success: true,
        metadata: { updates: request.body },
      });
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      const statusCode = (error as any).message === 'REWARD_NOT_FOUND' ? 404 : 500;
      await logAdminAction({
        userId: (request as any).user?.sub,
        action: 'update_reward',
        resource: 'reward',
        resourceId: request.params.rewardId,
        severity: 'medium',
        success: false,
        errorMessage: (error as any).message,
      });
      return reply.code(statusCode).send({ success: false, error: (error as any).message });
    }
  });

  // Delete reward (soft delete)
  fastify.delete('/rewards/:rewardId', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: AdminRequest<{ rewardId: string }>, reply) => {
    try {
      const rewardModel = (await import('@/models/Reward')).default as any;
      const reward = await rewardModel.findById((request as any).params.rewardId);
      if (!reward) {
        return reply.code(404).send({ success: false, error: 'REWARD_NOT_FOUND' });
      }
      reward.isActive = false;
      await reward.save();
      return reply.send({ success: true, data: { id: reward._id, isActive: reward.isActive } });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== Admin: Settings ====================
  // Get settings
  fastify.get('/settings', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const settings = await Settings.findOne({}).sort({ updatedAt: -1 });
      reply.send({ success: true, data: settings || {} });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Update settings (partial)
  fastify.patch('/settings', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const adminId = (request as any).user?.sub;
      const update = (request as any).body || {};
      const settings = await Settings.findOneAndUpdate(
        {},
        { ...update, updatedBy: adminId },
        { new: true, upsert: true }
      );
      reply.send({ success: true, data: settings });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Progression settings
  const ProgressionSettingsSchema = z.object({
    levels: z.array(z.object({
      name: z.string(),
      threshold: z.number().min(0),
    })).min(1),
  });

  fastify.get('/settings/progression', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (_request, reply) => {
    try {
      const settings = await Settings.findOne({}, { 'custom.progression': 1 });
      const progression = (settings as any)?.custom?.get?.('progression') || (settings as any)?.custom?.progression || null;
      reply.send({ success: true, data: progression });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.patch('/settings/progression', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: ProgressionSettingsSchema }
  }, async (request: AdminRequest<{}, z.infer<typeof ProgressionSettingsSchema>>, reply) => {
    try {
      const body = request.body;
      const adminId = request.user.sub;
      const settings = await Settings.findOneAndUpdate(
        {},
        { $set: { 'custom.progression': body, updatedBy: adminId } },
        { new: true, upsert: true }
      );
      reply.send({ success: true, data: (settings as any)?.custom?.progression || body });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Anti-cheat settings
  const AntiCheatSettingsSchema = z.object({
    captureFrequencyPerMinute: z.number().min(1).default(10),
    maxSpeedMps: z.number().min(1).default(50),
    validationScoreFloor: z.number().min(0).max(1).default(0.3),
    gpsAccuracyThreshold: z.number().min(1).default(50),
    penalties: z.object({
      deviceChange: z.number().min(0).max(1).default(0.1),
      trackingNotTracking: z.number().min(0).max(1).default(0.2),
      lowLight: z.number().min(0).max(1).default(0.1),
      lowAccuracy: z.number().min(0).max(1).default(0.1),
    }).default({}),
  });

  fastify.get('/settings/anti-cheat', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (_request, reply) => {
    try {
      const settings = await Settings.findOne({}, { 'custom.antiCheat': 1 });
      const antiCheat = (settings as any)?.custom?.get?.('antiCheat') || (settings as any)?.custom?.antiCheat || null;
      reply.send({ success: true, data: antiCheat });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.patch('/settings/anti-cheat', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: AntiCheatSettingsSchema }
  }, async (request: AdminRequest<{}, z.infer<typeof AntiCheatSettingsSchema>>, reply) => {
    try {
      const body = request.body;
      const adminId = request.user.sub;
      const settings = await Settings.findOneAndUpdate(
        {},
        { $set: { 'custom.antiCheat': body, updatedBy: adminId } },
        { new: true, upsert: true }
      );
      reply.send({ success: true, data: (settings as any)?.custom?.antiCheat || body });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Game tuning settings
  const GameSettingsSchema = z.object({
    claimRadiusMeters: z.number().min(1).default(50),
    maxDailyClaims: z.number().min(1).default(50),
    speedLimitKmh: z.number().min(1).default(120),
    cooldownSeconds: z.number().min(0).default(60),
    levelUpMultiplier: z.number().min(0.1).default(1.5),
  });

  fastify.get('/settings/game', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (_request, reply) => {
    try {
      const settings = await Settings.findOne({}, { 'custom.game': 1 });
      const game = (settings as any)?.custom?.get?.('game') || (settings as any)?.custom?.game || null;
      reply.send({ success: true, data: game });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.patch('/settings/game', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: GameSettingsSchema }
  }, async (request: AdminRequest<{}, z.infer<typeof GameSettingsSchema>>, reply) => {
    try {
      const body = request.body;
      const adminId = request.user.sub;
      const settings = await Settings.findOneAndUpdate(
        {},
        { $set: { 'custom.game': body, updatedBy: adminId } },
        { new: true, upsert: true }
      );
      reply.send({ success: true, data: (settings as any)?.custom?.game || body });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Offline settings
  const OfflineSettingsSchema = z.object({
    maxQueueAgeMinutes: z.number().min(1).default(1440),
    maxBatchSize: z.number().min(1).default(100),
    retryLimit: z.number().min(0).default(5),
    retryBackoffMs: z.number().min(0).default(2000),
  });

  fastify.get('/settings/offline', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (_request, reply) => {
    try {
      const settings = await Settings.findOne({}, { 'custom.offline': 1 });
      const offline = (settings as any)?.custom?.get?.('offline') || (settings as any)?.custom?.offline || null;
      reply.send({ success: true, data: offline });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.patch('/settings/offline', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: OfflineSettingsSchema }
  }, async (request: AdminRequest<{}, z.infer<typeof OfflineSettingsSchema>>, reply) => {
    try {
      const body = request.body;
      const adminId = request.user.sub;
      const settings = await Settings.findOneAndUpdate(
        {},
        { $set: { 'custom.offline': body, updatedBy: adminId } },
        { new: true, upsert: true }
      );
      reply.send({ success: true, data: (settings as any)?.custom?.offline || body });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // System: clear cache
  fastify.post('/system/cache/clear', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (_request, reply) => {
    try {
      const { RedisCache } = await import('@/config/redis');
      await RedisCache.clear();
      reply.send({ success: true, message: 'Cache cleared' });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== Admin: System ====================
  // Health summary
  fastify.get('/system/health', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const mongo = mongoose.connection?.readyState === 1 ? 'connected' : 'disconnected';
      const redis = (require('@/config/redis') as any).redisClient?.status || 'unknown';
      reply.send({ success: true, data: { mongo, redis, uptime: process.uptime(), timestamp: new Date().toISOString() } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Basic metrics
  fastify.get('/system/metrics', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const os = await import('os');
      const [users, prizes, claims, rewards] = await Promise.all([
        User.countDocuments({}),
        Prize.countDocuments({}),
        Claim.countDocuments({}),
        Reward.countDocuments({}),
      ]);
      const totalMem = (os as any).default.totalmem();
      const usedMem = process.memoryUsage().rss;
      const memPct = totalMem ? Math.round((usedMem / totalMem) * 100) : 0;
      const cpuCores = (os as any).default.cpus()?.length || 1;
      const data = {
        users, prizes, claims, rewards,
        memory: { used: usedMem, total: totalMem, percentage: memPct },
        cpu: { usage: 0, cores: cpuCores },
        disk: { used: 'N/A', total: 'N/A', percentage: 0 },
        network: { inbound: 0, outbound: 0, latency: 0 },
      };
      reply.send({ success: true, data });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // System logs (alias)
  fastify.get('/system/logs', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const q: any = (request.query as any) || {};
      const limit = Math.min(1000, Math.max(1, parseInt(q.limit) || 200));
      const logs = await AuditLog.find({}).sort({ timestamp: -1 }).limit(limit);
      reply.send({ success: true, data: logs });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Backup and restore (stubs)
  fastify.post('/system/backup', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const backupId = `bk_${Date.now()}`;
      reply.send({ success: true, data: { backupId } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.post('/system/restore', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const body: any = (request as any).body || {};
      reply.send({ success: true, data: { restoredFrom: body.backupId || null } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Maintenance mode
  fastify.post('/maintenance/start', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const body: any = (request as any).body || {};
      const adminId = (request as any).user?.sub;
      const settings = await Settings.findOneAndUpdate(
        {},
        { maintenance: { maintenanceMode: true, maintenanceMessage: body.message || 'Maintenance en cours' }, updatedBy: adminId },
        { new: true, upsert: true }
      );
      reply.send({ success: true, data: { maintenance: settings.maintenance } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.post('/maintenance/stop', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = (request as any).user?.sub;
      const settings = await Settings.findOneAndUpdate(
        {},
        { maintenance: { maintenanceMode: false, maintenanceMessage: '' }, updatedBy: adminId },
        { new: true, upsert: true }
      );
      reply.send({ success: true, data: { maintenance: settings.maintenance } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== Admin: Activity Logs (aliases) ====================
  // Create an activity log entry
  fastify.post('/activity-logs', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const body = (request as any).body || {};
      const adminUser = (request as any).user || {};
      const log = await (AuditLog as any).logAction({
        userId: adminUser.sub,
        userEmail: adminUser.email,
        userRole: 'admin',
        action: body.action || 'admin_activity',
        resource: (body.target && body.target.type) || 'admin',
        resourceId: (body.target && (body.target.id || body.target.resourceId)) || undefined,
        description: body.message || body.description,
        category: 'admin',
        severity: 'low',
        success: true,
        metadata: body.details || body.metadata || {},
      });
      reply.code(201).send({ success: true, data: log });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== Admin: Captures Aliases ====================
  // List captures (alias to claims)
  fastify.get('/captures', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const q: any = (request.query as any) || {};
      const page = Math.max(1, parseInt(q.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(q.limit) || 50));
      const skip = (page - 1) * limit;
      const query: any = {};
      if (q.status) query.status = q.status;
      if (q.userId) query.userId = q.userId;
      if (q.prizeId) query.prizeId = q.prizeId;
      const [claims, total] = await Promise.all([
        Claim.find(query).populate('userId', 'displayName email').populate('prizeId', 'name category')
          .sort({ createdAt: -1 }).skip(skip).limit(limit),
        Claim.countDocuments(query),
      ]);
      reply.send({ success: true, data: { captures: claims, total, page, limit } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Validate capture (alias)
  fastify.post('/captures/:id/validate', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]
  }, async (request, reply) => {
    try {
      const claim = await Claim.findById((request.params as any).id);
      if (!claim) return reply.code(404).send({ success: false, error: 'CAPTURE_NOT_FOUND' });
      (claim as any).metadata = { ...(claim as any).metadata, adminValidation: { isValid: true, validatedBy: (request as any).user.sub, validatedAt: new Date() } };
      await claim.save();
      return reply.send({ success: true, data: claim });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Reject capture (alias)
  fastify.post('/captures/:id/reject', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]
  }, async (request, reply) => {
    try {
      const claim = await Claim.findById((request.params as any).id);
      if (!claim) return reply.code(404).send({ success: false, error: 'CAPTURE_NOT_FOUND' });

      const reason = (request.body as any)?.reason || 'Rejected by admin';
      const adminId = (request as any).user.sub;
      const currentMeta = (claim as any).metadata || {};
      (claim as any).metadata = {
        ...currentMeta,
        adminValidation: {
          isValid: false,
          reason,
          rejectedBy: adminId,
          rejectedAt: new Date(),
        },
      };
      await claim.save();
      return reply.send({ success: true, data: claim });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  //  ts analytics (basic)
  fastify.get('/captures/analytics', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const days = parseInt(String(((request.query as any)?.period || '30d')).replace('d', '')) || 30;
      const start = new Date(); start.setDate(start.getDate() - days);
      const stats = await Claim.aggregate([
        { $match: { createdAt: { $gte: start } } },
        { $group: { _id: null, total: { $sum: 1 }, avgDistance: { $avg: '$distance' }, pointsAwarded: { $sum: '$pointsAwarded' } } },
      ]);
      reply.send({ success: true, data: stats?.[0] || { total: 0, avgDistance: 0, pointsAwarded: 0 } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Captures analytics (rich) - moved from capture module
  fastify.get('/captures/stats', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: FastifyRequest, reply) => {
    try {
      const ClaimModel = mongoose.models.Claim || mongoose.model('Claim');

      const [total, validated, rejected, pending] = await Promise.all([
        ClaimModel.countDocuments(),
        ClaimModel.countDocuments({ status: 'validated' }),
        ClaimModel.countDocuments({ status: 'rejected' }),
        ClaimModel.countDocuments({ status: 'pending' })]);

      const validationRate = total > 0 ? ((validated / total) * 100).toFixed(1) : 0;

      const confidenceAgg = await ClaimModel.aggregate([
        { $group: { _id: null, avgScore: { $avg: '$confidenceScore' } } }
      ]);
      const avgConfidenceScore = confidenceAgg[0]?.avgScore || 0;

      const antiCheat = {
        gpsSpoofing: await ClaimModel.countDocuments({ 'antiCheat.gpsSpoofing': true }),
        abnormalSpeed: await ClaimModel.countDocuments({ 'antiCheat.abnormalSpeed': true }),
        suspiciousPatterns: await ClaimModel.countDocuments({ 'antiCheat.suspiciousPattern': true })};

      const processingTimeAgg = await ClaimModel.aggregate([
        {
          $match: {
            status: 'validated',
            validatedAt: { $exists: true },
            claimedAt: { $exists: true }}
        },
        {
          $project: {
            processingTime: {
              $divide: [
                { $subtract: ['$validatedAt', '$claimedAt'] },
                1000 * 60 * 60 // hours
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: '$processingTime' }
          }
        }
      ]);
      const avgProcessingTime = processingTimeAgg[0]?.avgTime
        ? parseFloat(processingTimeAgg[0].avgTime.toFixed(2))
        : 0;

      const stats = {
        total,
        validated,
        rejected,
        pending,
        validationRate: typeof validationRate === 'string' ? parseFloat(validationRate) : validationRate,
        avgConfidenceScore: parseFloat(avgConfidenceScore.toFixed(2)),
        avgProcessingTime,
        antiCheat};

      reply.send({ success: true, data: stats });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Capture reports (admin) - moved from capture module
  fastify.get('/captures/reports', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request: FastifyRequest<{ Querystring: { status?: string; page?: string; limit?: string } }>, reply) => {
    try {
      const { status, page = '1', limit = '20' } = request.query;
      const pageNum = parseInt(page as string, 10) || 1;
      const limitNum = parseInt(limit as string, 10) || 20;

      const query: any = {};
      if (status && status !== 'all') {
        query.status = status;
      }

      const [reports, total] = await Promise.all([
        Report.find(query)
          .populate('userId', 'displayName email')
          .populate('captureId')
          .populate('prizeId', 'title location')
          .sort({ priority: -1, createdAt: -1 })
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum),
        Report.countDocuments(query)]);

      reply.send({
        success: true,
        data: {
          reports,
          total,
          page: pageNum,
          limit: limitNum,
          hasMore: total > pageNum * limitNum
        }
      });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Resolve/reject capture report (admin)
  fastify.post('/captures/reports', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: {
      body: z.object({
        reportId: z.string(),
        action: z.enum(['resolve', 'reject']),
        notes: z.string().optional()
      })
    }
  }, async (request: FastifyRequest<{ Body: { reportId: string; action: 'resolve' | 'reject'; notes?: string } }>, reply) => {
    try {
      const { reportId, action, notes } = request.body;
      const report = await Report.findById(reportId);
      if (!report) {
        return reply.code(404).send({ success: false, error: 'Report not found' });
      }

      if (action === 'resolve') {
        await (report as any).resolve(request.user.sub, notes || 'Resolved by admin');
      } else {
        await (report as any).reject(request.user.sub, notes || 'Rejected by admin');
      }

      return reply.send({ success: true, data: report.toJSON() });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== Admin: Redemptions (aliases) ====================
  // List redemptions (core)
  fastify.get('/redemptions', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const q: any = (request.query as any) || {};
      const page = Math.max(1, parseInt(q.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(q.limit) || 50));
      const skip = (page - 1) * limit;
      const query: any = {};
      if (q.status && q.status !== 'all') query.status = q.status;
      const [items, total] = await Promise.all([
        Redemption.find(query).populate('userId', 'displayName email').populate('rewardId', 'name category pointsCost')
          .sort({ createdAt: -1 }).skip(skip).limit(limit),
        Redemption.countDocuments(query),
      ]);
      return reply.send({ success: true, data: { redemptions: items, total, page, limit } });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Validate redemption (core)
  fastify.post('/redemptions/:id/validate', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const redemption = await Redemption.findById((request.params as any).id);
      if (!redemption) return reply.code(404).send({ success: false, error: 'REDEMPTION_NOT_FOUND' });
      (redemption as any).fulfill?.();
      await redemption.save();
      return reply.send({ success: true, data: redemption });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== Admin: Analytics ====================
  fastify.get('/analytics/users', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const days = parseInt(String(((request.query as any)?.period || '30d')).replace('d', '')) || 30;
      const start = new Date(); start.setDate(start.getDate() - days);
      const [userMetrics] = await Promise.all([
        User.aggregate([
          { $group: { _id: null, total: { $sum: 1 }, active7d: { $sum: { $cond: [{ $gte: ['$lastActive', new Date(Date.now() - 7*864e5)] }, 1, 0] } }, newUsers: { $sum: { $cond: [{ $gte: ['$createdAt', start] }, 1, 0] } } } } ])
      ]);
      reply.send({ success: true, data: userMetrics || { total: 0, active7d: 0, newUsers: 0 } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.get('/analytics/prizes', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const days = parseInt(String(((request.query as any)?.period || '30d')).replace('d', '')) || 30;
      const start = new Date(); start.setDate(start.getDate() - days);
      const stats = await Claim.aggregate([
        { $match: { createdAt: { $gte: start } } },
        { $group: { _id: '$prizeId', count: { $sum: 1 }, totalPoints: { $sum: '$pointsAwarded' } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]);
      reply.send({ success: true, data: { topPrizes: stats } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.get('/analytics/business', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const days = parseInt(String(((request.query as any)?.period || '30d')).replace('d', '')) || 30;
      const start = new Date(); start.setDate(start.getDate() - days);
      const [totals, byPartner] = await Promise.all([
        Redemption.aggregate([
          { $match: { createdAt: { $gte: start } } },
          { $group: { _id: null, redemptions: { $sum: 1 }, points: { $sum: '$pointsSpent' }, gross: { $sum: { $ifNull: ['$metadata.grossValue', 0] } }, partnerShare: { $sum: { $ifNull: ['$metadata.partnerShare', 0] } }, platformShare: { $sum: { $ifNull: ['$metadata.platformShare', 0] } } } } ]),
        Redemption.aggregate([
          { $match: { createdAt: { $gte: start } } },
          { $group: { _id: '$metadata.partnerId', redemptions: { $sum: 1 }, gross: { $sum: { $ifNull: ['$metadata.grossValue', 0] } } } },
          { $sort: { redemptions: -1 } },
          { $limit: 20 },
        ]),
      ]);
      reply.send({ success: true, data: { overview: totals?.[0] || {}, topPartners: byPartner } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  fastify.get('/analytics/heatmap', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const days = parseInt(String(((request.query as any)?.period || '30d')).replace('d', '')) || 30;
      const start = new Date(); start.setDate(start.getDate() - days);
      // Use claims with location to produce simple heatmap points
      const points = await Claim.find({ createdAt: { $gte: start } }).select('location').limit(5000);
      const heatmap = points.filter(p => p.location && (p.location as any).lat !== undefined).map(p => ({ lat: (p.location as any).lat, lng: (p.location as any).lng, weight: 1 }));
      reply.send({ success: true, data: { heatmap } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // List activity logs
  fastify.get('/activity-logs', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const q: any = (request.query as any) || {};
      const page = Math.max(1, parseInt(q.page) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(q.limit) || 50));
      const skip = (page - 1) * limit;
      const query: any = {};
      if (q.action) query.action = q.action;
      if (q.actorEmail) query.userEmail = q.actorEmail;
      const [logs, total] = await Promise.all([
        (AuditLog as any).find(query).sort({ timestamp: -1 }).skip(skip).limit(limit),
        (AuditLog as any).countDocuments(query),
      ]);
      reply.send({ success: true, data: { logs, page, limit, total } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Activity logs statistics
  fastify.get('/activity-logs/statistics', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const stats = await (AuditLog as any).getStatistics(7);
      reply.send({ success: true, data: stats?.[0] || {} });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Clear old activity logs
  fastify.delete('/activity-logs/clear', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const body: any = (request as any).body || {};
      const daysToKeep = parseInt(body.daysToKeep) || 90;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysToKeep);
      const result = await (AuditLog as any).deleteMany({ createdAt: { $lt: cutoff } });
      reply.send({ success: true, data: { deleted: result.deletedCount || 0 } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Export activity logs (JSON)
  fastify.get('/activity-logs/export', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const q: any = (request.query as any) || {};
      const limit = Math.min(5000, Math.max(1, parseInt(q.limit) || 1000));
      const logs = await (AuditLog as any).find({}).sort({ timestamp: -1 }).limit(limit);
      reply.headers({ 'Content-Type': 'application/json' });
      reply.send({ success: true, data: logs });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ========================================
  // Routes from admin-extended.ts (61 routes)
  // ========================================
  // Real-time dashboard stats
  fastify.get('/dashboard/real-time', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const result = await AdminExtendedService.getRealTimeStats();
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // User management routes removed (duplicates of lines 1117-1262)

  // Ban/unban/prizes routes removed (duplicates of lines 1163-1362)

  // Create prize
  fastify.post('/prizes', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const result = await AdminExtendedService.createPrize(request.body, request.user.sub);
      return reply.code(201).send({ success: true, data: result });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Update prize
  fastify.put('/prizes/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const result = await AdminExtendedService.updatePrize(
        (request.params as any).id,
        request.body,
        request.user.sub
      );
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // DELETE /prizes/:id, GET /analytics, POST /notifications/send removed (duplicates)

  // System logs
  fastify.get('/logs', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const result = await AdminExtendedService.getSystemLogs(request.query);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Create backup
  fastify.post('/backup/create', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const result = await AdminExtendedService.createBackup(request.user.sub);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== CLAIMS MANAGEMENT ====================
  
  // Get all claims with filters
  fastify.get('/claims', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { page = 1, limit = 20, status, userId, prizeId, startDate, endDate } = request.query as any;
      
      const query: any = {};
      if (status) query.status = status;
      if (userId) query.userId = userId;
      if (prizeId) query.prizeId = prizeId;
      if (startDate || endDate) {
        query.claimedAt = {};
        if (startDate) query.claimedAt.$gte = new Date(startDate);
        if (endDate) query.claimedAt.$lte = new Date(endDate);
      }
      
      const [claims, total] = await Promise.all([
        Claim.find(query)
          .populate('userId', 'username email avatar')
          .populate('prizeId', 'title category points')
          .sort({ claimedAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Claim.countDocuments(query)]);
      
      return reply.send({
        success: true,
        data: {
          claims,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)}}});
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Get claim details
  fastify.get('/claims/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const claim = await Claim.findById((request.params as any).id)
        .populate('userId', 'username email avatar level points')
        .populate('prizeId', 'title description category points location');
      
      if (!claim) {
        return reply.code(404).send({ success: false, error: 'Claim not found' });
      }
      
      return reply.send({ success: true, data: claim });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Validate/Invalidate claim
  fastify.patch('/claims/:id/validate', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { isValid, reason } = request.body as any;
      const adminId = request.user.sub;
      const id = (request.params as any).id;
      
      const claim = await Claim.findById(id);
      if (!claim) {
        return reply.code(404).send({ success: false, error: 'Claim not found' });
      }
      
      // Store validation in metadata
      claim.metadata = {
        ...claim.metadata,
        adminValidation: {
          isValid,
          validatedBy: adminId,
          validatedAt: new Date(),
          reason: reason || null}};
      
      await claim.save();
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        isValid ? 'validate_claim' : 'reject_claim',
        'claim',
        claim._id.toString(),
        { reason, claimId: claim._id }
      );
      
      return reply.send({ success: true, data: claim });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Get claims statistics
  fastify.get('/claims/stats', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { startDate, endDate } = request.query as any;
      
      const dateFilter: any = {};
      if (startDate || endDate) {
        dateFilter.claimedAt = {};
        if (startDate) dateFilter.claimedAt.$gte = new Date(startDate);
        if (endDate) dateFilter.claimedAt.$lte = new Date(endDate);
      }
      
      const stats = await Claim.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalClaims: { $sum: 1 },
            totalPoints: { $sum: '$pointsAwarded' },
            avgDistance: { $avg: '$distance' },
            validClaims: { $sum: { $cond: [{ $eq: ['$status', 'validated'] }, 1, 0] } },
            rejectedClaims: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } }}}]);
      
      return reply.send({ success: true, data: stats[0] || {} });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // ==================== REWARDS MANAGEMENT ====================
  // GET /rewards, POST /rewards, PUT /rewards/:id, DELETE /rewards/:id removed (duplicates of lines 1413-1496)
  
  // Update reward stock
  fastify.patch('/rewards/:id/stock', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { stockQuantity, stockAvailable } = request.body as any;
      const adminId = request.user.sub;
      
      const reward = await Reward.findById((request.params as any).id);
      if (!reward) {
        return reply.code(404).send({ success: false, error: 'Reward not found' });
      }
      
      if (stockQuantity !== undefined) reward.stockQuantity = stockQuantity;
      if (stockAvailable !== undefined) reward.stockAvailable = stockAvailable;
      
      await reward.save();
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'update_reward_stock',
        'reward',
        reward._id.toString(),
        { rewardId: reward._id, stockQuantity, stockAvailable }
      );
      
      return reply.send({ success: true, data: reward });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });



  // ==================== ACHIEVEMENTS MANAGEMENT ====================
  
  // Get all achievements
  fastify.get('/achievements', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { page = 1, limit = 20, category, isActive } = request.query as any;
      
      const query: any = {};
      if (category) query.category = category;
      if (isActive !== undefined) query.isActive = isActive === 'true';
      
      const [achievements, total] = await Promise.all([
        Achievement.find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Achievement.countDocuments(query)]);
      
      return reply.send({
        success: true,
        data: {
          achievements,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)}}});
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get achievement by id
  fastify.get('/achievements/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { id } = (request.params as any);
      const achievement = await Achievement.findById(id);

      if (!achievement) {
        return reply.code(404).send({ success: false, error: 'Achievement not found' });
      }

      return reply.send({ success: true, data: achievement });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Create achievement
  fastify.post('/achievements', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const achievement = new Achievement(request.body);
      await achievement.save();
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'create_achievement',
        'achievement',
        achievement._id.toString(),
        { achievementId: achievement._id, name: achievement.name }
      );
      
      return reply.send({ success: true, data: achievement });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Update achievement
  fastify.put('/achievements/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const achievement = await Achievement.findByIdAndUpdate(
        (request.params as any).id,
        request.body,
        { new: true }
      );
      
      if (!achievement) {
        return reply.code(404).send({ success: false, error: 'Achievement not found' });
      }
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'update_achievement',
        'achievement',
        achievement._id.toString(),
        { achievementId: achievement._id, name: achievement.name }
      );
      
      return reply.send({ success: true, data: achievement });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Delete achievement
  fastify.delete('/achievements/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const achievement = await Achievement.findByIdAndDelete((request.params as any).id);
      
      if (!achievement) {
        return reply.code(404).send({ success: false, error: 'Achievement not found' });
      }
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'delete_achievement',
        'achievement',
        achievement._id.toString(),
        { achievementId: achievement._id, name: achievement.name }
      );
      
      return reply.send({ success: true, message: 'Achievement deleted successfully' });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // ==================== MARKETPLACE MANAGEMENT ====================
  
  // Get all marketplace items
  fastify.get('/marketplace/items', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { page = 1, limit = 20, category, isActive } = request.query as any;
      
      const query: any = {};
      if (category) query.category = category;
      if (isActive !== undefined) query.isActive = isActive === 'true';
      
      const [items, total] = await Promise.all([
        Reward.find(query)
          .populate('partnerId', 'name logo')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Reward.countDocuments(query)]);
      
      return reply.send({
        success: true,
        data: {
          items,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)}}});
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Create marketplace item (maps to Reward)
  fastify.post('/marketplace/items', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = (request as any).user.sub;
      const body = (request as any).body || {};
      const reward = new Reward({
        name: body.name || body.title,
        description: body.description,
        category: body.category || 'shopping',
        pointsCost: body.pointsCost || 0,
        stockQuantity: body.stockQuantity || body.stock || 0,
        stockAvailable: body.stockQuantity || body.stock || 0,
        imageUrl: body.imageUrl || body.image || '',
        partnerId: body.partnerId || null,
        metadata: { ...(body.metadata || {}), isSponsored: true },
        createdBy: adminId,
      } as any);
      await reward.save();
      return reply.code(201).send({ success: true, data: reward });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Update marketplace item (Reward)
  fastify.put('/marketplace/items/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = (request as any).user.sub;
      const updates = (request as any).body || {};
      const reward = await Reward.findByIdAndUpdate(
        (request.params as any).id,
        {
          ...(updates || {}),
          updatedBy: adminId,
        },
        { new: true }
      );
      if (!reward) return reply.code(404).send({ success: false, error: 'Reward not found' });
      return reply.send({ success: true, data: reward });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Schedule notification (admin)
  fastify.post('/notifications/schedule', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const body: any = (request as any).body || {};
      const channel = String(body.type || body.channel || 'PUSH').toUpperCase();
      const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
      if (!scheduledFor || isNaN(scheduledFor.getTime())) {
        return reply.code(400).send({ success: false, error: 'INVALID_SCHEDULED_FOR' });
      }

      const doc = new Notification({
        title: body.title,
        message: body.message,
        type: channel,
        targetType: body.targetType || (body.userId ? 'user' : 'all'),
        targetValue: body.targetValue || body.userId,
        status: NotificationStatus.SCHEDULED,
        scheduledFor,
        createdBy: (request as any).user.sub,
        metadata: body.metadata || {},
      });
      await doc.save();
      await logAdminAction({
        userId: (request as any).user?.sub,
        action: 'schedule_notification',
        resource: 'notification',
        severity: 'medium',
        success: true,
        metadata: { channel, targetType: doc.targetType, scheduledFor },
      });
      return reply.code(201).send({ success: true, data: doc });
    } catch (error: any) {
      await logAdminAction({
        userId: (request as any).user?.sub,
        action: 'schedule_notification',
        resource: 'notification',
        severity: 'medium',
        success: false,
        errorMessage: (error as any).message,
      });
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Notifications stats (admin)
  fastify.get('/notifications/stats', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]}, async (request, reply) => {
    try {
      const period = ((request.query as any)?.period || '30d') as string;
      const days = parseInt(String(period).replace('d', '')) || 30;
      const now = new Date();
      const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [totalSent, sentToday, sentThisWeek, scheduled, failed] = await Promise.all([
        Notification.countDocuments({ status: NotificationStatus.SENT, sentAt: { $gte: start } }),
        Notification.countDocuments({ status: NotificationStatus.SENT, sentAt: { $gte: startOfDay } }),
        Notification.countDocuments({ status: NotificationStatus.SENT, sentAt: { $gte: startOfWeek } }),
        Notification.countDocuments({ status: NotificationStatus.SCHEDULED }),
        Notification.countDocuments({ status: NotificationStatus.FAILED }),
      ]);

      reply.send({ success: true, data: { totalSent, sentToday, sentThisWeek, scheduled, failed, openRate: 0 } });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Unlock achievement for user (admin)
  fastify.post('/achievements/unlock', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const body: any = (request as any).body || {};
      const userId = body.userId;
      const achievementId = body.achievementId;
      if (!userId || !achievementId) {
        return reply.code(400).send({ success: false, error: 'MISSING_PARAMS' });
      }

      const { UserAchievement } = await import('@/models/UserAchievement');
      const { Types } = await import('mongoose');
      const result = await UserAchievement.findOneAndUpdate(
        { userId: new Types.ObjectId(userId), achievementId: new Types.ObjectId(achievementId) },
        { $set: { unlockedAt: new Date() } },
        { upsert: true, new: true }
      );

      await AdminExtendedService.logAdminAction(
        (request as any).user.sub,
        'unlock_achievement',
        'achievement',
        achievementId,
        { userId, achievementId }
      );

      return reply.send({ success: true, data: { userId, achievementId, unlockedAt: (result as any).unlockedAt } });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get marketplace item by id (Reward)
  fastify.get('/marketplace/items/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const item = await Reward.findById((request.params as any).id)
        .populate('partnerId', 'name logo');
      if (!item) return reply.code(404).send({ success: false, error: 'Reward not found' });
      return reply.send({ success: true, data: item });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Delete marketplace item (Reward)
  fastify.delete('/marketplace/items/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const deleted = await Reward.findByIdAndDelete((request.params as any).id);
      if (!deleted) return reply.code(404).send({ success: false, error: 'Reward not found' });
      return reply.send({ success: true, message: 'Item deleted' });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: (error as any).message });
    }
  });
  
  // Get all redemptions
  fastify.get('/marketplace/redemptions', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { page = 1, limit = 20, status, userId, rewardId } = request.query as any;
      
      const query: any = {};
      if (status) query.status = status;
      if (userId) query.userId = userId;
      if (rewardId) query.rewardId = rewardId;
      
      const [redemptions, total] = await Promise.all([
        Redemption.find({ ...query, 'metadata.source': 'marketplace' })
          .populate('userId', 'username email')
          .populate('rewardId', 'name category pointsCost')
          .sort({ redeemedAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Redemption.countDocuments({ ...query, 'metadata.source': 'marketplace' })]);
      
      return reply.send({
        success: true,
        data: {
          redemptions,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)}}});
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Marketplace stats (purchases vs redemptions, values)
  fastify.get('/marketplace/stats', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const MR = (require('mongoose') as any).models.MarketplaceRedemption;
      if (!MR) return reply.send({ success: true, data: { totalPurchases: 0, redeemed: 0, unredeemed: 0, totals: { grossValue: 0, partnerShare: 0, platformShare: 0 } } });

      const [totalPurchases, redeemed, unredeemed, sums] = await Promise.all([
        MR.countDocuments({}),
        MR.countDocuments({ status: 'redeemed' }),
        MR.countDocuments({ status: { $in: ['pending', 'confirmed'] } }),
        MR.aggregate([
          {
            $group: {
              _id: null,
              grossValue: { $sum: { $ifNull: ['$grossValue', 0] } },
              partnerShare: { $sum: { $ifNull: ['$partnerShare', 0] } },
              platformShare: { $sum: { $ifNull: ['$platformShare', 0] } },
            },
          },
        ]),
      ]);

      const totals = sums?.[0] || { grossValue: 0, partnerShare: 0, platformShare: 0 };
      return reply.send({ success: true, data: { totalPurchases, redeemed, unredeemed, totals } });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Validate redemption (QR code scanned)
  fastify.patch('/marketplace/redemptions/:id/validate', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const redemption = await Redemption.findById((request.params as any).id);
      
      if (!redemption) {
        return reply.code(404).send({ success: false, error: 'Redemption not found' });
      }
      
      redemption.status = RedemptionStatus.FULFILLED;
      redemption.redeemedAt = new Date();
      redemption.redeemedBy = new Types.ObjectId(adminId);
      
      await redemption.save();
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'validate_redemption',
        'redemption',
        redemption._id.toString(),
        { redemptionId: redemption._id }
      );
      
      return reply.send({ success: true, data: redemption });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // ==================== PARTNERS MANAGEMENT ====================
  
  // Get all partners
  fastify.get('/partners', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { page = 1, limit = 20, isActive, category } = request.query as any;
      
      const query: any = {};
      if (isActive !== undefined) query.isActive = isActive === 'true';
      if (category) query.category = category;
      
      const [partners, total] = await Promise.all([
        Partner.find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Partner.countDocuments(query)]);
      
      return reply.send({
        success: true,
        data: {
          partners,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)}}});
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get single partner
  fastify.get('/partners/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const partner = await Partner.findById((request.params as any).id);
      if (!partner) return reply.code(404).send({ success: false, error: 'PARTNER_NOT_FOUND' });
      return reply.send({ success: true, data: partner });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Create partner
  fastify.post('/partners', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const partner = new Partner(request.body);
      await partner.save();
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'create_partner',
        'partner',
        partner._id.toString(),
        { partnerId: partner._id, name: partner.name }
      );
      
      return reply.send({ success: true, data: partner });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Update partner
  fastify.put('/partners/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const partner = await Partner.findByIdAndUpdate(
        (request.params as any).id,
        request.body,
        { new: true }
      );
      
      if (!partner) {
        return reply.code(404).send({ success: false, error: 'Partner not found' });
      }
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'update_partner',
        'partner',
        partner._id.toString(),
        { partnerId: partner._id, name: partner.name }
      );
      
      return reply.send({ success: true, data: partner });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Delete partner
  fastify.delete('/partners/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const partner = await Partner.findByIdAndDelete((request.params as any).id);
      
      if (!partner) {
        return reply.code(404).send({ success: false, error: 'Partner not found' });
      }
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'delete_partner',
        'partner',
        partner._id.toString(),
        { partnerId: partner._id, name: partner.name }
      );
      
      return reply.send({ success: true, message: 'Partner deleted successfully' });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // ==================== DISTRIBUTION MANAGEMENT ====================
  
  // Get distribution settings
  fastify.get('/distribution/settings', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const settings = await Settings.findOne({ type: 'distribution' });
      return reply.send({ success: true, data: settings || {} });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Update distribution settings
  fastify.put('/distribution/settings', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const settings = await Settings.findOneAndUpdate(
        { type: 'distribution' },
        { ...(request.body as any), updatedBy: adminId },
        { new: true, upsert: true }
      );
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'update_distribution_settings',
        'settings',
        settings._id.toString(),
        { settingsId: settings._id }
      );
      
      return reply.send({ success: true, data: settings });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Get distribution history
  fastify.get('/distribution/history', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { page = 1, limit = 20 } = request.query as any;
      
      const [distributions, total] = await Promise.all([
        Distribution.find()
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Distribution.countDocuments()]);
      
      return reply.send({
        success: true,
        data: {
          distributions,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)}}});
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Trigger manual distribution
  fastify.post('/distribution/trigger', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const { city, count, category } = request.body as any;
      
      // Create distribution record
      const distribution = new Distribution({
        type: 'manual',
        triggeredBy: adminId,
        city,
        count,
        category,
        status: 'pending'});
      
      await distribution.save();
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'trigger_distribution',
        'distribution',
        distribution._id.toString(),
        { distributionId: distribution._id, city, count, category }
      );
      
      return reply.send({ success: true, data: distribution });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== REPORTS MANAGEMENT ====================
  
  // Get all reports
  fastify.get('/reports', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { page = 1, limit = 20, status, type } = request.query as any;
      const query: any = {};
      
      if (status) query.status = status;
      if (type) query.type = type;
      
      const [reports, total] = await Promise.all([
        Report.find(query)
          .populate('reporterId', 'username email avatar')
          .populate('reportedUserId', 'username email avatar')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Report.countDocuments(query)]);
      
      return reply.send({
        success: true,
        data: {
          reports,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)}}});
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Get report details
  fastify.get('/reports/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const report = await Report.findById((request.params as any).id)
        .populate('reporterId', 'username email avatar level')
        .populate('reportedUserId', 'username email avatar level');
      
      if (!report) {
        return reply.code(404).send({ success: false, error: 'Report not found' });
      }
      
      return reply.send({ success: true, data: report });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Resolve report
  fastify.patch('/reports/:id/resolve', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { action, notes } = request.body as any;
      const adminId = request.user.sub;
      
      const report = await Report.findById((request.params as any).id);
      
      if (!report) {
        return reply.code(404).send({ success: false, error: 'Report not found' });
      }
      
      report.status = 'resolved';
      report.resolvedBy = new Types.ObjectId(adminId);
      report.resolvedAt = new Date();
      report.resolution = notes;
      report.actionTaken = action;
      
      await report.save();
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'resolve_report',
        'report',
        report._id.toString(),
        { reportId: report._id, action, notes }
      );
      
      return reply.send({ success: true, data: report });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Dismiss report
  fastify.patch('/reports/:id/dismiss', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { reason } = request.body as any;
      const adminId = request.user.sub;
      
      const report = await Report.findById((request.params as any).id);
      
      if (!report) {
        return reply.code(404).send({ success: false, error: 'Report not found' });
      }
      
      report.status = 'rejected';
      report.resolvedBy = new Types.ObjectId(adminId);
      report.resolvedAt = new Date();
      report.resolution = reason;
      report.actionTaken = 'dismissed';
      
      await report.save();
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'dismiss_report',
        'report',
        report._id.toString(),
        { reportId: report._id, reason }
      );
      
      return reply.send({ success: true, data: report });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Get reports statistics
  fastify.get('/reports/stats', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const stats = await Report.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
            dismissed: { $sum: { $cond: [{ $eq: ['$status', 'dismissed'] }, 1, 0] } }}}]);
      
      return reply.send({ success: true, data: stats[0] || {} });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== SESSIONS MANAGEMENT ====================
  
  // Get active sessions
  fastify.get('/sessions/active', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { page = 1, limit = 20 } = request.query as any;
      
      const [sessions, total] = await Promise.all([
        Session.find({ active: true })
          .populate('userId', 'username email avatar')
          .sort({ lastActivity: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Session.countDocuments({ active: true })]);
      
      return reply.send({
        success: true,
        data: {
          sessions,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)}}});
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Terminate session
  fastify.delete('/sessions/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const session = await Session.findByIdAndUpdate(
        (request.params as any).id,
        { active: false, endedAt: new Date() },
        { new: true }
      );
      
      if (!session) {
        return reply.code(404).send({ success: false, error: 'Session not found' });
      }
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'terminate_session',
        'session',
        session._id.toString(),
        { sessionId: session._id, userId: session.userId }
      );
      
      return reply.send({ success: true, message: 'Session terminated successfully' });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Get sessions statistics
  fastify.get('/sessions/stats', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const stats = await Session.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: ['$active', 1, 0] } },
            avgDuration: { $avg: { $subtract: ['$endedAt', '$startedAt'] } }}}]);
      
      return reply.send({ success: true, data: stats[0] || {} });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== FRIENDSHIPS MANAGEMENT ====================
  
  // Get all friendships
  fastify.get('/friendships', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { page = 1, limit = 20, status } = request.query as any;
      const query: any = {};
      
      if (status) query.status = status;
      
      const [friendships, total] = await Promise.all([
        Friendship.find(query)
          .populate('userId', 'username email avatar')
          .populate('friendId', 'username email avatar')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Friendship.countDocuments(query)]);
      
      return reply.send({
        success: true,
        data: {
          friendships,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)}}});
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Remove friendship (moderation)
  fastify.delete('/friendships/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const result = await FriendshipService.adminRemoveFriendship(
        adminId,
        (request.params as any).id
      );

      try {
        await AdminExtendedService.logAdminAction(
          adminId,
          'remove_friendship',
          'friendship',
          (request.params as any).id,
          {
            friendshipId: (request.params as any).id,
            userId: result.userIds.userId,
            friendId: result.userIds.friendId
          }
        );
      } catch {}

      return reply.send({ success: true, data: result });
    } catch (error: any) {
      try {
        await AdminExtendedService.logAdminAction(
          (request as any).user?.sub,
          'remove_friendship_failed',
          'friendship',
          (request.params as any).id,
          { error: (error as any).message }
        );
      } catch {}

      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== REWARDS: PARTNER/ADMIN QR SCAN ====================
  // Partner or admin can fulfill a redemption by scanning a QR code
  fastify.post('/rewards/qr-scan', {
    preHandler: [authenticate, requireAdmin],
    schema: {
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
    }
  }, async (request: AdminRequest<{}, { qrCode: string; location?: { lat: number; lng: number } }>, reply) => {
    const adminId = request.user.sub;
    try {
      const { qrCode } = request.body;

      // Find redemption by QR code (marketplace metadata first)
      let redemption = await Redemption.findOne({
        'metadata.redemptionCode': qrCode,
        status: RedemptionStatus.PENDING
      });

      // Fallback: Code model lookup if needed
      if (!redemption) {
        const code = await Code.findOne({ code: qrCode, status: CodeStatus.AVAILABLE });
        if (code) {
          redemption = await Redemption.findOne({ codeId: code._id, status: RedemptionStatus.PENDING });
        }
      }

      if (!redemption) {
        return reply.code(404).send({ success: false, error: 'REDEMPTION_NOT_FOUND_OR_ALREADY_FULFILLED' });
      }

      // Update redemption status to fulfilled
      redemption.status = RedemptionStatus.FULFILLED;
      redemption.fulfilledAt = new Date();
      (redemption as any).fulfilledBy = new Types.ObjectId(adminId);
      await redemption.save();

      // Log audit
      try {
        await AdminExtendedService.logAdminAction(
          adminId,
          'fulfill_redemption_qr',
          'redemption',
          redemption._id.toString(),
          { qrCode, location: request.body.location || null }
        );
      } catch {}

      return reply.send({
        success: true,
        data: {
          redemptionId: redemption._id,
          status: redemption.status,
          fulfilledAt: redemption.fulfilledAt
        }
      });
    } catch (error: any) {
      try {
        await AdminExtendedService.logAdminAction(
          adminId,
          'fulfill_redemption_qr_failed',
          'redemption',
          undefined,
          { error: (error as any).message }
        );
      } catch {}
      return reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== CODES MANAGEMENT (Marketplace) ====================
  
  // Get all codes
  fastify.get('/codes', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { page = 1, limit = 20, status, rewardId } = request.query as any;
      const query: any = {};
      
      if (status) query.status = status;
      if (rewardId) query.rewardId = rewardId;
      
      const [codes, total] = await Promise.all([
        Code.find(query)
          .populate('rewardId', 'name type pointsCost')
          .populate('userId', 'username email')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        Code.countDocuments(query)]);
      
      return reply.send({
        success: true,
        data: {
          codes,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)}}});
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Generate codes batch
  fastify.post('/codes/generate', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { rewardId, count = 10, expiresIn = 30 } = request.body as any;
      const adminId = request.user.sub;
      
      const codes = [];
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresIn);
      
      for (let i = 0; i < count; i++) {
        const code = new Code({
          code: generateUniqueCode(),
          rewardId,
          status: 'active',
          expiresAt,
          createdBy: adminId});
        await code.save();
        codes.push(code);
      }
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'generate_codes',
        'code',
        rewardId,
        { rewardId, count, expiresIn }
      );
      
      return reply.send({ success: true, data: codes });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Deactivate code
  fastify.patch('/codes/:id/deactivate', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const code = await Code.findByIdAndUpdate(
        (request.params as any).id,
        { status: 'inactive' },
        { new: true }
      );
      
      if (!code) {
        return reply.code(404).send({ success: false, error: 'Code not found' });
      }
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'deactivate_code',
        'code',
        code._id.toString(),
        { codeId: code._id, code: code.code }
      );
      
      return reply.send({ success: true, data: code });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== AR SESSIONS MANAGEMENT ====================
  
  // Get AR sessions
  fastify.get('/ar-sessions', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { page = 1, limit = 20, userId, prizeId } = request.query as any;
      const query: any = {};
      
      if (userId) query.userId = userId;
      if (prizeId) query.prizeId = prizeId;
      
      const [sessions, total] = await Promise.all([
        ARSession.find(query)
          .populate('userId', 'username email avatar')
          .populate('prizeId', 'title category')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        ARSession.countDocuments(query)]);
      
      return reply.send({
        success: true,
        data: {
          sessions,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)}}});
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Get AR sessions statistics
  fastify.get('/ar-sessions/stats', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const stats = await ARSession.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            avgDuration: { $avg: { $subtract: ['$endedAt', '$startedAt'] } },
            totalScreenshots: { $sum: '$screenshotCount' }}}]);
      
      return reply.send({ success: true, data: stats[0] || {} });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== OFFLINE QUEUE MANAGEMENT ====================
  
  // Get offline queue items
  fastify.get('/offline-queue', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { page = 1, limit = 20, status, userId } = request.query as any;
      const query: any = {};
      
      if (status) query.status = status;
      if (userId) query.userId = userId;
      
      const [items, total] = await Promise.all([
        OfflineQueue.find(query)
          .populate('userId', 'username email')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        OfflineQueue.countDocuments(query)]);
      
      return reply.send({
        success: true,
        data: {
          items,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)}}});
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Clear offline queue (resolved/failed items)
  fastify.delete('/offline-queue/clear', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const result = await OfflineQueue.deleteMany({
        status: { $in: ['synced', 'failed'] }});
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'clear_offline_queue',
        'offline_queue',
        'bulk',
        { deletedCount: result.deletedCount }
      );
      
      return reply.send({ success: true, message: `Cleared ${result.deletedCount} items` });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ==================== DEVICE TOKENS MANAGEMENT ====================
  
  // Get device tokens
  fastify.get('/device-tokens', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const { page = 1, limit = 20, platform, userId } = request.query as any;
      const query: any = { active: true };
      
      if (platform) query.platform = platform;
      if (userId) query.userId = userId;
      
      const [tokens, total] = await Promise.all([
        DeviceToken.find(query)
          .populate('userId', 'username email')
          .sort({ lastUsed: -1 })
          .skip((page - 1) * limit)
          .limit(limit),
        DeviceToken.countDocuments(query)]);
      
      return reply.send({
        success: true,
        data: {
          tokens,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)}}});
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Revoke device token
  fastify.delete('/device-tokens/:id', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const adminId = request.user.sub;
      const token = await DeviceToken.findByIdAndUpdate(
        (request.params as any).id,
        { active: false },
        { new: true }
      );
      
      if (!token) {
        return reply.code(404).send({ success: false, error: 'Device token not found' });
      }
      
      // Log admin action
      await AdminExtendedService.logAdminAction(
        adminId,
        'revoke_device_token',
        'device_token',
        token._id.toString(),
        { tokenId: token._id, userId: token.userId, platform: token.platform }
      );
      
      return reply.send({ success: true, message: 'Device token revoked successfully' });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
  
  // Get device tokens statistics
  fastify.get('/device-tokens/stats', {
    preHandler: [authenticate, requireAdmin]}, async (request, reply) => {
    try {
      const stats = await DeviceToken.aggregate([
        {
          $group: {
            _id: '$platform',
            count: { $sum: 1 },
            active: { $sum: { $cond: ['$active', 1, 0] } }}}]);
      
      return reply.send({ success: true, data: stats });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Helper function to generate unique codes
  function generateUniqueCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
      if ((i + 1) % 4 === 0 && i < 11) code += '-';
    }
    return code;
  }

  // ========================================
  // Analytics Routes (merged from analytics module)
  // ========================================

  // GET /admin/analytics - Get analytics data
  fastify.get('/analytics', {
    preHandler: [authenticate, requireAdmin]
  }, async (request, reply) => {
    try {
      const { startDate, endDate } = request.query as any;
      const result = await AnalyticsService.getAnalytics(startDate, endDate);
      reply.send({ success: true, data: result });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // POST /admin/analytics/generate - Generate daily analytics
  fastify.post('/analytics/generate', {
    preHandler: [authenticate, requireAdmin]
  }, async (request, reply) => {
    try {
      const result = await AnalyticsService.generateDailyAnalytics();
      reply.send({ success: true, data: result });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Admin analytics overview (period-based)
  const AnalyticsOverviewSchema = z.object({
    period: z.string().optional().default('30d'),
  });

  fastify.get('/analytics/overview', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { querystring: AnalyticsOverviewSchema }
  }, async (request: FastifyRequest<{ Querystring: z.infer<typeof AnalyticsOverviewSchema> }>, reply) => {
    try {
      const { period = '30d' } = request.query;
      const days = parseInt(String(period).replace('d', '')) || 30;
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - days);

      // Active users in window
      const [activeUsers, totalCaptures, revenueAgg, activity] = await Promise.all([
        User.countDocuments({ lastActive: { $gte: start } }),
        Claim.countDocuments({ claimedAt: { $gte: start } }),
        Redemption.aggregate([
          { $match: { redeemedAt: { $gte: start }, status: { $in: ['FULFILLED', 'fulfilled'] } } },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$metadata.grossValue', 0] } } } }
        ]),
        Claim.aggregate([
          { $match: { claimedAt: { $gte: start } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$claimedAt' } },
              value: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ])
      ]);

      // Simple conversion rate heuristic: captures / active users
      const conversionRate = activeUsers > 0 ? Math.min(100, (totalCaptures / activeUsers) * 100) : 0;
      const revenue = revenueAgg?.[0]?.total || 0;

      reply.send({
        success: true,
        data: {
          activeUsers,
          totalCaptures,
          conversionRate: Number(conversionRate.toFixed(1)),
          revenue,
          dailyActivity: activity.map((d: any) => ({ date: d._id, value: d.value })),
          period: { start: start.toISOString(), end: end.toISOString(), days }
        }
      });
    } catch (error: any) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ========================================
  // Partners Routes (merged from partners module)
  // ========================================

  // POST /partners, GET /partners removed (duplicates of lines 2415-2530)

// ========================================
// Distribution Service (merged from distribution module)
// ========================================

  // Distribution payload schemas
  const LocationSchema = z.object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    radius: z.number().optional(),
  });

  const PrizeConfigSchema = z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    type: z.string(),
    rarity: z.string(),
    image: z.string().optional(),
    content: z.object({
      points: z.number(),
    }).passthrough(),
  }).passthrough();

  const DistributionConfigSchema = z.object({
    spawnRadius: z.number().min(1),
    quantity: z.number().min(1),
    maxClaims: z.number().min(1),
    respawnInterval: z.number().min(0),
    duration: z.number().min(1),
  });

  const SingleDistributionSchema = z.object({
    location: LocationSchema,
    prizeConfig: PrizeConfigSchema,
    distribution: DistributionConfigSchema,
    targeting: z.record(z.any()).optional(),
    metadata: z.record(z.any()).optional(),
  });

  const BulkDistributionSchema = z.object({
    template: z.object({
      prizeConfig: PrizeConfigSchema,
      distribution: DistributionConfigSchema,
      targeting: z.record(z.any()).optional(),
      metadata: z.record(z.any()).optional(),
    }),
    locations: z.array(LocationSchema).min(1),
    distributionMode: z.enum(['random_variation', 'scaled_by_density', 'identical']).default('identical'),
  });

  const AutoDistributionSchema = z.object({
    region: z.object({
      center: z.object({ latitude: z.number(), longitude: z.number() }),
      radius: z.number().min(0.1),
    }),
    density: z.object({
      prizesPerKm2: z.number().min(0.001),
      minDistance: z.number().min(0),
      adaptToDensity: z.boolean().optional(),
    }),
    prizeTemplate: z.object({
      prizeConfig: PrizeConfigSchema,
      distribution: DistributionConfigSchema,
      targeting: z.record(z.any()).optional(),
      metadata: z.record(z.any()).optional(),
    }),
  });

  const ManageDistributionSchema = z.object({
    action: z.enum(['pause', 'resume', 'extend', 'modify_points', 'terminate']),
    params: z.any().optional(),
  });

  class DistributionService {
  private static redis = redisClient;

  /**
   * Distribute a single prize at specific coordinates
   */
  static async distributeSinglePrize(adminId: string, distributionData: any) {
    try {
      const { location, prizeConfig, distribution, targeting, metadata } = distributionData;

      // Validate admin permissions
      const admin = await User.findById(adminId);
      if (!admin || !['admin', 'moderator'].includes(admin.role)) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
      }

      // Create the prize with distribution settings
      const prize = new Prize({
        title: prizeConfig.title,
        description: prizeConfig.description,
        category: prizeConfig.category,
        type: prizeConfig.type,
        points: prizeConfig.content.points,
        rarity: prizeConfig.rarity,
        image: prizeConfig.image,
        location: {
          type: 'Point',
          coordinates: [location.longitude, location.latitude],
          address: location.address,
          city: location.city,
          country: location.country},
        distribution: {
          spawnRadius: distribution.spawnRadius,
          quantity: distribution.quantity,
          maxClaims: distribution.maxClaims,
          currentClaims: 0,
          respawnInterval: distribution.respawnInterval,
          lastRespawn: new Date()},
        targeting: targeting || {},
        content: prizeConfig.content,
        status: 'active',
        expiresAt: new Date(Date.now() + distribution.duration * 1000),
        createdBy: adminId,
        metadata: {
          ...metadata,
          distributionId: `dist_${adminId}_${Date.now()}`,
          coordinates: [location.longitude, location.latitude]}});

      await prize.save();

      // Cache for quick proximity queries
      await this.cachePrizeForProximity(prize);

      // Log distribution event
      typedLogger.info('Prize distributed', {
        adminId,
        prizeId: prize._id,
        location: [location.latitude, location.longitude],
        points: prizeConfig.content.points,
        duration: distribution.duration});

      // Track distribution metrics
      await this.trackDistributionMetrics(adminId, prize);

      return {
        prizeId: prize._id,
        distributionId: prize.metadata.distributionId,
        location: {
          latitude: location.latitude,
          longitude: location.longitude},
        expiresAt: prize.expiresAt,
        estimatedDiscoveryTime: await this.estimateDiscoveryTime(location)};
    } catch (error) {
      typedLogger.error('Distribute single prize error', { error: (error as any).message, adminId, distributionData });
      throw error;
    }
  }

  /**
   * Bulk distribute prizes across multiple locations
   */
  static async distributeBulkPrizes(adminId: string, bulkData: any) {
    try {
      const { template, locations, distributionMode } = bulkData;

      const admin = await User.findById(adminId);
      if (!admin || !['admin', 'moderator'].includes(admin.role)) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
      }

      const distributedPrizes = [];
      const batchId = `bulk_${adminId}_${Date.now()}`;

      for (let i = 0; i < locations.length; i++) {
        const location = locations[i];
        
        // Apply distribution mode variations
        let prizeConfig = { ...template.prizeConfig };
        if (distributionMode === 'random_variation') {
          prizeConfig = await this.applyRandomVariation(prizeConfig);
        } else if (distributionMode === 'scaled_by_density') {
          prizeConfig = await this.scaleByDensity(prizeConfig, location);
        }

        const distributionData = {
          location,
          prizeConfig,
          distribution: template.distribution,
          targeting: template.targeting,
          metadata: {
            ...template.metadata,
            batchId,
            batchIndex: i}};

        const result = await this.distributeSinglePrize(adminId, distributionData);
        distributedPrizes.push(result);

        // Small delay to avoid overwhelming the system
        if (i % 10 === 0 && i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      typedLogger.info('Bulk distribution completed', {
        adminId,
        batchId,
        totalPrizes: distributedPrizes.length,
        mode: distributionMode});

      return {
        batchId,
        totalDistributed: distributedPrizes.length,
        prizes: distributedPrizes,
        summary: await this.generateDistributionSummary(distributedPrizes)};
    } catch (error) {
      typedLogger.error('Distribute bulk prizes error', { error: (error as any).message, adminId, bulkData });
      throw error;
    }
  }

  /**
   * Auto-distribute prizes in a region based on density algorithms
   */
  static async autoDistributePrizes(adminId: string, autoData: any) {
    try {
      const { region, density, prizeTemplate } = autoData;

      const admin = await User.findById(adminId);
      if (!admin || !['admin', 'moderator'].includes(admin.role)) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
      }

      // Calculate optimal distribution points
      const distributionPoints = await this.calculateOptimalDistribution(region, density);
      
      // Create bulk distribution data
      const bulkData = {
        template: prizeTemplate,
        locations: distributionPoints,
        distributionMode: density.adaptToDensity ? 'scaled_by_density' : 'identical'};

      const result = await this.distributeBulkPrizes(adminId, bulkData);

      typedLogger.info('Auto distribution completed', {
        adminId,
        region: region.center,
        radius: region.radius,
        generatedPoints: distributionPoints.length,
        density: density.prizesPerKm2});

      return {
        ...result,
        autoGenerated: true,
        region,
        density,
        algorithm: 'poisson_disk_sampling'};
    } catch (error) {
      typedLogger.error('Auto distribute prizes error', { error: (error as any).message, adminId, autoData });
      throw error;
    }
  }

  /**
   * Get distribution analytics for admin dashboard
   */
  static async getDistributionAnalytics(adminId: string, timeframe: string = '24h') {
    try {
      const admin = await User.findById(adminId);
      if (!admin || !['admin', 'moderator'].includes(admin.role)) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
      }

      const timeframeDuration = this.parseTimeframe(timeframe);
      const startDate = new Date(Date.now() - timeframeDuration);

      const analytics = await Promise.all([
        this.getDistributionStats(adminId, startDate),
        this.getDiscoveryStats(startDate),
        this.getGeographicDistribution(startDate),
        this.getPerformanceMetrics(startDate)]);

      return {
        timeframe,
        distribution: analytics[0],
        discovery: analytics[1],
        geographic: analytics[2],
        performance: analytics[3],
        generatedAt: new Date().toISOString()};
    } catch (error) {
      typedLogger.error('Get distribution analytics error', { error: (error as any).message, adminId, timeframe });
      throw error;
    }
  }

  /**
   * Manage active distributions (pause, resume, modify)
   */
  static async manageDistribution(adminId: string, distributionId: string, action: string, params: any = {}) {
    try {
      const admin = await User.findById(adminId);
      if (!admin || !['admin', 'moderator'].includes(admin.role)) {
        throw new Error('INSUFFICIENT_PERMISSIONS');
      }

      const prizes = await Prize.find({ 'metadata.distributionId': distributionId });
      if (prizes.length === 0) {
        throw new Error('DISTRIBUTION_NOT_FOUND');
      }

      let updateData: any = {};
      let result: any = {};

      switch (action) {
        case 'pause':
          updateData = { status: 'paused', pausedAt: new Date() };
          result.message = 'Distribution paused';
          break;

        case 'resume':
          updateData = { status: 'active', $unset: { pausedAt: 1 } };
          result.message = 'Distribution resumed';
          break;

        case 'extend':
          const extensionTime = params.extensionHours * 60 * 60 * 1000;
          updateData = { $inc: { expiresAt: extensionTime } };
          result.message = `Distribution extended by ${params.extensionHours} hours`;
          break;

        case 'modify_points':
          updateData = { 'content.points': params.newPoints };
          result.message = `Points updated to ${params.newPoints}`;
          break;

        case 'terminate':
          updateData = { status: 'terminated', terminatedAt: new Date() };
          result.message = 'Distribution terminated';
          break;

        default:
          throw new Error('INVALID_ACTION');
      }

      await Prize.updateMany(
        { 'metadata.distributionId': distributionId },
        updateData
      );

      // Update cache
      for (const prize of prizes) {
        await this.updatePrizeCache(prize._id.toString(), updateData);
      }

      typedLogger.info('Distribution managed', {
        adminId,
        distributionId,
        action,
        affectedPrizes: prizes.length});

      return {
        ...result,
        distributionId,
        affectedPrizes: prizes.length,
        action,
        timestamp: new Date().toISOString()};
    } catch (error) {
      typedLogger.error('Manage distribution error', { error: (error as any).message, adminId, distributionId, action });
      throw error;
    }
  }

  // Private helper methods
  private static async cachePrizeForProximity(prize: any): Promise<void> {
    try {
      const cacheKey = `proximity:prize:${prize._id}`;
      const cacheData = {
        id: prize._id.toString(),
        coordinates: prize.location.coordinates,
        points: prize.points,
        rarity: prize.rarity,
        spawnRadius: prize.distribution.spawnRadius,
        expiresAt: prize.expiresAt};

      await this.redis.setex(cacheKey, 86400, JSON.stringify(cacheData)); // 24h cache

      // Add to geospatial index for proximity queries
      await this.redis.geoadd(
        'prizes:geo',
        prize.location.coordinates[0], // longitude
        prize.location.coordinates[1], // latitude
        prize._id.toString()
      );
    } catch (error) {
      typedLogger.error('Cache prize for proximity error', { error: (error as any).message, prizeId: prize._id });
    }
  }

  private static async trackDistributionMetrics(adminId: string, prize: any): Promise<void> {
    try {
      const metricsKey = `metrics:distribution:${adminId}:${new Date().toISOString().split('T')[0]}`;
      await this.redis.hincrby(metricsKey, 'total_distributed', 1);
      await this.redis.hincrby(metricsKey, `category_${prize.category}`, 1);
      await this.redis.hincrby(metricsKey, `rarity_${prize.rarity}`, 1);
      await this.redis.expire(metricsKey, 30 * 24 * 60 * 60); // 30 days
    } catch (error) {
      typedLogger.error('Track distribution metrics error', { error: (error as any).message, adminId });
    }
  }

  private static async estimateDiscoveryTime(location: any): Promise<number> {
    try {
      // Simple estimation based on population density and historical data
      // In a real implementation, this would use ML models
      const baseDiscoveryTime = 3600; // 1 hour base
      const randomFactor = Math.random() * 0.5 + 0.75; // 0.75 to 1.25 multiplier
      return Math.round(baseDiscoveryTime * randomFactor);
    } catch (error) {
      return 3600; // Default 1 hour
    }
  }

  private static async applyRandomVariation(prizeConfig: any): Promise<any> {
    const variation = { ...prizeConfig };
    
    // Vary points by ±20%
    const pointsVariation = 0.8 + Math.random() * 0.4;
    variation.content.points = Math.round(variation.content.points * pointsVariation);
    
    // Randomly adjust rarity
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    const currentIndex = rarities.indexOf(variation.rarity);
    const newIndex = Math.max(0, Math.min(rarities.length - 1, currentIndex + (Math.random() > 0.5 ? 1 : -1)));
    variation.rarity = rarities[newIndex];
    
    return variation;
  }

  private static async scaleByDensity(prizeConfig: any, location: any): Promise<any> {
    try {
      // This would typically use external APIs to determine population density
      // For now, use a simple heuristic
      const scaled = { ...prizeConfig };
      
      // Simulate density check (in real implementation, use Google Places API, etc.)
      const densityFactor = Math.random() * 2; // 0 to 2x multiplier
      scaled.content.points = Math.round(scaled.content.points * (0.5 + densityFactor));
      
      return scaled;
    } catch (error) {
      return prizeConfig;
    }
  }

  private static async calculateOptimalDistribution(region: any, density: any): Promise<any[]> {
    try {
      const { center, radius } = region;
      const { prizesPerKm2, minDistance } = density;
      
      // Calculate area
      const areaKm2 = Math.PI * radius * radius;
      const totalPrizes = Math.round(areaKm2 * prizesPerKm2);
      
      // Generate points using Poisson disk sampling algorithm
      const points = [];
      const maxAttempts = totalPrizes * 10;
      let attempts = 0;
      
      while (points.length < totalPrizes && attempts < maxAttempts) {
        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * radius;
        
        const lat = center.latitude + (distance * Math.cos(angle)) / 111.32;
        const lng = center.longitude + (distance * Math.sin(angle)) / (111.32 * Math.cos(center.latitude * Math.PI / 180));
        
        // Check minimum distance constraint
        const tooClose = points.some(point => {
          const dist = this.calculateDistance(lat, lng, point.latitude, point.longitude);
          return dist < minDistance;
        });
        
        if (!tooClose) {
          points.push({
            latitude: lat,
            longitude: lng,
            address: `Auto-generated location ${points.length + 1}`});
        }
        
        attempts++;
      }
      
      return points;
    } catch (error) {
      typedLogger.error('Calculate optimal distribution error', { error: (error as any).message, region, density });
      return [];
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

  private static parseTimeframe(timeframe: string): number {
    const unit = timeframe.slice(-1);
    const value = parseInt(timeframe.slice(0, -1));
    
    switch (unit) {
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      case 'w': return value * 7 * 24 * 60 * 60 * 1000;
      default: return 24 * 60 * 60 * 1000; // Default 24h
    }
  }

  private static async getDistributionStats(adminId: string, startDate: Date): Promise<any> {
    try {
      const prizes = await Prize.find({
        createdBy: adminId,
        createdAt: { $gte: startDate }});

      return {
        totalDistributed: prizes.length,
        byCategory: this.groupBy(prizes, 'category'),
        byRarity: this.groupBy(prizes, 'rarity'),
        totalPoints: prizes.reduce((sum, p) => sum + p.points, 0),
        averagePoints: prizes.length > 0 ? prizes.reduce((sum, p) => sum + p.points, 0) / prizes.length : 0};
    } catch (error) {
      return {};
    }
  }

  private static async getDiscoveryStats(startDate: Date): Promise<any> {
    try {
      const byDistribution = await Claim.aggregate([
        { $match: { claimedAt: { $gte: startDate } } },
        {
          $lookup: {
            from: 'prizes',
            localField: 'prizeId',
            foreignField: '_id',
            as: 'prize'
          }
        },
        { $unwind: '$prize' },
        {
          $group: {
            _id: '$prize.metadata.distributionId',
            totalClaims: { $sum: 1 }
          }
        }
      ]);

      const totals = byDistribution.reduce((acc, d) => acc + d.totalClaims, 0);

      return {
        totalDiscovered: totals,
        totalClaimed: totals,
        discoveryRate: byDistribution.length,
        byDistribution
      };
    } catch (error) {
      return { totalDiscovered: 0, totalClaimed: 0, discoveryRate: 0, byDistribution: [] };
    }
  }

  private static async getGeographicDistribution(startDate: Date): Promise<any> {
    try {
      const prizes = await Prize.find(
        { createdAt: { $gte: startDate }, 'metadata.distributionId': { $exists: true } },
        { location: 1, metadata: 1 }
      );

      const cities: Record<string, number> = {};
      const coords: any[] = [];
      prizes.forEach((p: any) => {
        if (p.location?.city) {
          cities[p.location.city] = (cities[p.location.city] || 0) + 1;
        }
        if (p.location?.coordinates) {
          coords.push({ lat: p.location.coordinates[1], lng: p.location.coordinates[0], id: p._id });
        }
      });

      return { cities, coordinates: coords };
    } catch (error) {
      return { cities: {}, coordinates: [] };
    }
  }

  private static async getPerformanceMetrics(startDate: Date): Promise<any> {
    try {
      const totalPrizes = await Prize.countDocuments({ createdAt: { $gte: startDate }, 'metadata.distributionId': { $exists: true } });
      const totalClaims = await Claim.countDocuments({ claimedAt: { $gte: startDate } });
      return {
        totalPrizes,
        totalClaims,
        claimsPerPrize: totalPrizes > 0 ? totalClaims / totalPrizes : 0
      };
    } catch (error) {
      return { totalPrizes: 0, totalClaims: 0, claimsPerPrize: 0 };
    }
  }

  public static async getActiveDistributions(adminId: string) {
    const admin = await User.findById(adminId);
    if (!admin || !['admin', 'moderator'].includes(admin.role)) {
      throw new Error('INSUFFICIENT_PERMISSIONS');
    }

    const grouped = await Prize.aggregate([
      { $match: { 'metadata.distributionId': { $exists: true }, status: 'active' } },
      {
        $group: {
          _id: '$metadata.distributionId',
          totalPrizes: { $sum: 1 },
          totalClaims: { $sum: { $ifNull: ['$claimedCount', 0] } },
          minExpiresAt: { $min: '$expiresAt' },
          cities: { $addToSet: '$location.city' }
        }
      },
      { $sort: { totalPrizes: -1 } }
    ]);

    return grouped.map(g => ({
      distributionId: g._id,
      totalPrizes: g.totalPrizes,
      totalClaims: g.totalClaims,
      remaining: Math.max(0, g.totalPrizes - g.totalClaims),
      earliestExpiry: g.minExpiresAt,
      cities: (g.cities || []).filter(Boolean),
    }));
  }

  private static async generateDistributionSummary(prizes: any[]): Promise<any> {
    return {
      totalPrizes: prizes.length,
      totalPoints: prizes.reduce((sum, p) => sum + (p.points || 0), 0),
      averagePoints: prizes.length > 0 ? prizes.reduce((sum, p) => sum + (p.points || 0), 0) / prizes.length : 0,
      geographicSpread: {
        minLat: Math.min(...prizes.map(p => p.location?.latitude || 0)),
        maxLat: Math.max(...prizes.map(p => p.location?.latitude || 0)),
        minLng: Math.min(...prizes.map(p => p.location?.longitude || 0)),
        maxLng: Math.max(...prizes.map(p => p.location?.longitude || 0))}};
  }

  private static async updatePrizeCache(prizeId: string, updateData: any): Promise<void> {
    try {
      const cacheKey = `proximity:prize:${prizeId}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const data = JSON.parse(cached);
        Object.assign(data, updateData);
        await this.redis.setex(cacheKey, 86400, JSON.stringify(data));
      }
    } catch (error) {
      typedLogger.error('Update prize cache error', { error: (error as any).message, prizeId });
    }
  }

  private static groupBy(array: any[], key: string): Record<string, number> {
    return array.reduce((groups, item) => {
      const group = item[key] || 'unknown';
      groups[group] = (groups[group] || 0) + 1;
      return groups;
    }, {});
  }
}


  // ========================================
  // Distribution Routes (merged from distribution module)
  // ========================================

  // Single prize distribution (canonical)
  fastify.post('/place', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: SingleDistributionSchema }
  }, async (request, reply) => {
    try {
      const result = await DistributionService.distributeSinglePrize((request as any).user.sub, (request as any).body);
      try {
        await (AuditLog as any).logAction({
          userId: (request as any).user?.sub,
          action: 'distribute_single_prize',
          resource: 'distribution',
          category: 'admin',
          severity: 'medium',
          success: true,
          metadata: { payload: (request as any).body },
        });
      } catch {}
      reply.send({ success: true, data: result });
    } catch (error: any) {
      try {
        await (AuditLog as any).logAction({
          userId: (request as any).user?.sub,
          action: 'distribute_single_prize',
          resource: 'distribution',
          category: 'admin',
          severity: 'medium',
          success: false,
          errorMessage: (error as any).message,
        });
      } catch {}
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Bulk prize distribution (canonical)
  fastify.post('/batch', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: BulkDistributionSchema }
  }, async (request, reply) => {
    try {
      const result = await DistributionService.distributeBulkPrizes((request as any).user.sub, (request as any).body);
      await logAdminAction({
        userId: (request as any).user?.sub,
        action: 'distribution_bulk',
        resource: 'distribution',
        severity: 'medium',
        success: true,
        metadata: { payload: (request as any).body },
      });
      reply.send({ success: true, data: result });
    } catch (error: any) {
      await logAdminAction({
        userId: (request as any).user?.sub,
        action: 'distribution_bulk',
        resource: 'distribution',
        severity: 'medium',
        success: false,
        errorMessage: (error as any).message,
      });
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Auto distribution
  fastify.post('/auto', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: { body: AutoDistributionSchema }
  }, async (request, reply) => {
    try {
      const result = await DistributionService.autoDistributePrizes(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Distribution analytics (renamed from /analytics to avoid conflict with general analytics)
  fastify.get('/distribution/analytics', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: {
      querystring: z.object({
        timeframe: z.string().default('24h')
      })
    }
  }, async (request: AdminRequest<{}, any, { timeframe?: string }>, reply) => {
    try {
      const timeframe = (request.query as any)?.timeframe;
      const result = await DistributionService.getDistributionAnalytics(request.user.sub, timeframe);
      reply.send({ success: true, data: result });
    } catch (error) {
      try {
        await (AuditLog as any).logAction({
          userId: (request as any).user?.sub,
          action: 'distribution_analytics',
          resource: 'distribution',
          category: 'admin',
          severity: 'low',
          success: false,
          errorMessage: (error as any).message,
          metadata: { timeframe: (request.query as any)?.timeframe },
        });
      } catch {}
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Active distributions summary
  fastify.get('/distribution/active', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]
  }, async (request, reply) => {
    try {
      const result = await DistributionService.getActiveDistributions(request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Manage distribution
  fastify.post('/manage/:distributionId', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
    schema: {
      params: z.object({
        distributionId: z.string()
      }),
      body: ManageDistributionSchema
    }
  }, async (request: AdminRequest<{ distributionId: string }, { action: 'pause' | 'resume' | 'extend' | 'modify_points' | 'terminate'; params?: any }>, reply) => {
    try {
      const result = await DistributionService.manageDistribution(
        request.user.sub,
        request.params.distributionId,
        request.body.action,
        request.body.params
      );
      try {
        await (AuditLog as any).logAction({
          userId: (request as any).user?.sub,
          action: `distribution_${request.body.action}`,
          resource: 'distribution',
          resourceId: request.params.distributionId,
          category: 'admin',
          severity: 'medium',
          success: true,
          metadata: { params: request.body.params },
        });
      } catch {}
      reply.send({ success: true, data: result });
    } catch (error) {
      try {
        await (AuditLog as any).logAction({
          userId: (request as any).user?.sub,
          action: `distribution_${(request.body as any)?.action || 'unknown'}`,
          resource: 'distribution',
          resourceId: request.params.distributionId,
          category: 'admin',
          severity: 'medium',
          success: false,
          errorMessage: (error as any).message,
        });
      } catch {}
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });
}
