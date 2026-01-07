import { Types } from 'mongoose';
import { User } from '@/models';
import { Claim } from '@/models/Claim';
import { audit } from '@/lib/audit-logger';
import { typedLogger } from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';
import { UsersService } from '@/modules/users';

interface GetUsersOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  level?: number;
}

interface BanData {
  reason: string;
  duration?: number;
  notifyUser?: boolean;
}

class AdminUsersService {
  static async getUsers(options: GetUsersOptions = {}) {
    const { page = 1, limit = 20, search, status, level } = options;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    if (status && status !== 'all') {
      switch (status) {
        case 'banned':
          query.isBanned = true;
          break;
        case 'active':
          query.isBanned = { $ne: true };
          break;
        case 'suspended':
          query.status = 'suspended';
          break;
        case 'inactive':
          query.isBanned = { $ne: true };
          query.status = { $in: ['inactive', 'active', null] };
          break;
      }
    }

    if (level !== undefined) {
      query.level = level;
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -refreshTokens')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    return {
      users,
      total,
      page,
      limit,
      hasMore: skip + users.length < total,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  static async getUserProfile(userId: string) {
    try {
      const user = await User.findById(userId).select('-password -refreshTokens');
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Claim stats + recent activity (similar to UsersService but returned directly for admin)
      const claimStatsAgg = await Claim.aggregate([
        { $match: { userId: new Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            totalClaims: { $sum: 1 },
            totalPoints: { $sum: '$pointsAwarded' },
            averageDistance: { $avg: '$distance' },
            validClaims: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      '$validationChecks.distanceValid',
                      '$validationChecks.timeValid',
                      '$validationChecks.speedValid',
                      '$validationChecks.cooldownValid',
                      '$validationChecks.dailyLimitValid',
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);

      const claimStats = claimStatsAgg[0] || {
        totalClaims: 0,
        totalPoints: 0,
        averageDistance: 0,
        validClaims: 0,
      };

      const recentActivity = await Claim.find({ userId: new Types.ObjectId(userId) })
        .populate('prizeId', 'name category points')
        .sort({ claimedAt: -1 })
        .limit(5);

      // Normalize points shape for UI
      const rawPoints: any = (user as any).points;
      const numericPoints = typeof rawPoints === 'number' ? rawPoints : null;
      const pointsObj = typeof rawPoints === 'object' && rawPoints !== null ? rawPoints : {};
      const points = {
        available: numericPoints ?? pointsObj.available ?? pointsObj.total ?? 0,
        total: numericPoints ?? pointsObj.total ?? pointsObj.available ?? 0,
        spent: pointsObj.spent ?? 0,
      };

      const result = {
        ...user.toJSON(),
        location: (user as any).location || null,
        devices: (user as any).devices || [],
        points,
        stats: {
          ...(user as any).stats,
          totalClaims:
            (user as any).stats?.totalClaims ||
            (user as any).stats?.prizesFound ||
            claimStats.totalClaims ||
            0,
          totalPoints: claimStats.totalPoints || (user as any).stats?.totalPoints || points.total || 0,
          averageDistance: claimStats.averageDistance || 0,
          validClaims: claimStats.validClaims || 0,
        },
        recentActivity: recentActivity.map((claim) => ({
          id: claim._id,
          prizeName: (claim.prizeId as any)?.name || 'Unknown Prize',
          prizeCategory: (claim.prizeId as any)?.category || 'General',
          pointsAwarded: claim.pointsAwarded,
          claimedAt: claim.claimedAt,
        })),
        banInfo: {
          isBanned: !!(user as any).isBanned,
          reason: (user as any).banReason || (user as any).bannedReason || null,
          expiresAt: (user as any).bannedUntil || (user as any).banExpiresAt || (user as any).banUntil || null,
          bannedAt: (user as any).bannedAt || null,
        },
        lastIp: (user as any).lastIp || (user as any).ipAddress || null,
        lastUserAgent: (user as any).lastUserAgent || null,
      };

      return result;
    } catch (error) {
      typedLogger.error('Admin get user profile error', { userId, error });
      throw error;
    }
  }

  static async updateUserProfile(userId: string, payload: Record<string, unknown>, adminId: string) {
    // For admin updates, we can update more fields than regular users
    const allowedFields = ['displayName', 'email', 'level', 'status'];
    const updates: Record<string, unknown> = {};
    
    for (const field of allowedFields) {
      if (payload[field] !== undefined) {
        updates[field] = payload[field];
      }
    }
    
    if (Object.keys(updates).length === 0) {
      throw new Error('No valid fields to update');
    }
    
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -refreshTokens');
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Invalidate cache
    await redisClient.del(`user:profile:${userId}`);
    
    // Audit log for user profile update
    await audit.custom(adminId, 'UPDATE_USER_PROFILE', 'user', userId, {
      updatedFields: Object.keys(updates),
      changes: updates,
      displayName: user.displayName,
    });
    
    return user;
  }

  static async banUser(userId: string, banData: BanData, adminId: string) {
    const { reason, duration, notifyUser } = banData;

    // duration is in hours from UI; store as absolute date if provided
    const bannedUntil = typeof duration === 'number'
      ? new Date(Date.now() + duration * 60 * 60 * 1000)
      : null;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        status: 'banned',
        isBanned: true,
        bannedAt: new Date(),
        bannedUntil,
        banReason: reason,
      },
      { new: true }
    ).select('-password -refreshTokens');

    if (!user) {
      throw new Error('User not found');
    }

    await redisClient.del(`user:sessions:${userId}`);
    await redisClient.del(`user:tokens:${userId}`);

    // Use unified audit logger - writes to both Pino and MongoDB
    await audit.userBanned(adminId, userId, { reason, duration, bannedUntil, notifyUser });

    return user;
  }

  static async unbanUser(userId: string, adminId: string) {
    const user = await User.findByIdAndUpdate(
      userId,
      {
        status: 'active',
        isBanned: false,
        $unset: { bannedAt: 1, bannedUntil: 1, banReason: 1 },
      },
      { new: true }
    ).select('-password -refreshTokens');

    if (!user) {
      throw new Error('User not found');
    }

    // Use unified audit logger - writes to both Pino and MongoDB
    await audit.userUnbanned(adminId, userId);

    return user;
  }

  static async adjustPoints(userId: string, points: number, reason: string, adminId: string) {
    try {
      const user = await User.findById(userId).select('-password -refreshTokens');

      if (!user) {
        throw new Error('User not found');
      }

      // Support legacy numeric points field
      const currentPoints = (user as any).points;
      const available = typeof currentPoints === 'number'
        ? currentPoints
        : currentPoints?.available ?? 0;
      const total = typeof currentPoints === 'number'
        ? currentPoints
        : currentPoints?.total ?? 0;
      const spent = typeof currentPoints === 'number'
        ? 0
        : currentPoints?.spent ?? 0;

      const newAvailable = available + points;
      if (newAvailable < 0) {
        throw new Error('INSUFFICIENT_POINTS');
      }

      const newPoints = {
        available: newAvailable,
        total: total + Math.max(points, 0),
        spent: spent + Math.max(-points, 0),
      };

      // Use findByIdAndUpdate for reliable nested field updates
      const updated = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            'points.available': newPoints.available,
            'points.total': newPoints.total,
            'points.spent': newPoints.spent,
          },
        },
        { new: true, runValidators: false }
      ).select('-password -refreshTokens');

      if (!updated) {
        throw new Error('Failed to update user points');
      }

      typedLogger.info('Points adjusted for user', {
        userId,
        oldAvailable: available,
        newAvailable: newPoints.available,
        adjustment: points,
        reason,
      });

      // Use unified audit logger - writes to both Pino and MongoDB
      await audit.pointsAdjusted(adminId, userId, { points, reason, newBalance: newPoints.available });

      return updated;
    } catch (error) {
      typedLogger.error('Failed to adjust user points', { userId, points, error });
      throw error;
    }
  }

  static async deleteUser(userId: string, adminId: string) {
    try {
      const user = await User.findByIdAndUpdate(
        userId,
        {
          status: 'deleted',
          deletedAt: new Date(),
        },
        { new: true }
      ).select('-password -refreshTokens');

      if (!user) {
        throw new Error('User not found');
      }

      await redisClient.del(`user:sessions:${userId}`);
      await redisClient.del(`user:tokens:${userId}`);

      // Audit log for user deletion
      await audit.custom(adminId, 'DELETE_USER', 'user', userId, {
        displayName: user.displayName,
        email: user.email,
        deletedAt: new Date().toISOString(),
      });

      return user;
    } catch (error) {
      typedLogger.error('Failed to delete user', { userId, error });
      throw error;
    }
  }
}

export { AdminUsersService };
export default AdminUsersService;
