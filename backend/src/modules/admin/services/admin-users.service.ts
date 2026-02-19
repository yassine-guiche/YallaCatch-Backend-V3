import { FilterQuery, Types } from 'mongoose';
import { IUserDocument, IPrizeDocument } from '@/types';
import { User } from '@/models';
import { Claim } from '@/models/Claim';
import { audit } from '@/lib/audit-logger';
import { typedLogger } from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';
import { UsersService } from '@/modules/users';
import { broadcastAdminEvent } from '@/lib/websocket';
import { NotificationService } from '@/modules/notifications';
import { NotificationType, NotificationTargetType } from '@/types';

interface GetUsersOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  level?: number;
}

export interface BanData {
  reason: string;
  duration?: number;
  notifyUser?: boolean;
}

class AdminUsersService {
  static async getUsers(options: GetUsersOptions = {}) {
    const { page = 1, limit = 20, search, status, level } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<IUserDocument> = {
      deletedAt: { $exists: false } // Exclude deleted users by default
    };

    if (search) {
      query.$or = [
        { displayName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { referralCode: { $regex: search.toUpperCase(), $options: 'i' } },
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
      const user = await User.findById(userId)
        .select('-password -refreshTokens')
        .populate('referredBy', 'displayName email') as IUserDocument;
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
      // Normalize points shape for UI
      const rawPoints: unknown = user.get('points');
      const numericPoints = typeof rawPoints === 'number' ? rawPoints : null;
      const pointsObj = (typeof rawPoints === 'object' && rawPoints !== null ? rawPoints : {}) as Record<string, unknown>;
      const points = {
        available: numericPoints ?? (pointsObj.available as number | undefined) ?? (pointsObj.total as number | undefined) ?? 0,
        total: numericPoints ?? (pointsObj.total as number | undefined) ?? (pointsObj.available as number | undefined) ?? 0,
        spent: (pointsObj.spent as number | undefined) ?? 0,
      };

      const result = {
        ...user.toJSON(),
        location: user.location || null,
        devices: user.devices || [],
        points,
        stats: {
          ...(user as { stats?: Record<string, unknown> }).stats,
          totalClaims:
            user.stats?.totalClaims ||
            user.stats?.prizesFound ||
            claimStats.totalClaims ||
            0,
          totalPoints: claimStats.totalPoints || user.stats?.totalPoints || points.total || 0,
          averageDistance: claimStats.averageDistance || 0,
          validClaims: claimStats.validClaims || 0,
        },
        recentActivity: recentActivity.map((claim) => {
          const prize = claim.prizeId as unknown as IPrizeDocument;
          return {
            id: claim._id,
            prizeName: prize?.name || 'Unknown Prize',
            prizeCategory: prize?.category || 'General',
            pointsAwarded: claim.pointsAwarded,
            claimedAt: claim.claimedAt,
          };
        }),
        banInfo: {
          isBanned: !!user.isBanned,
          reason: user.banReason || user.bannedReason || null,
          expiresAt: user.bannedUntil || user.banExpiresAt || null,
          bannedAt: user.bannedAt || null,
        },
        lastIp: user.lastIp || null,
        lastUserAgent: user.lastUserAgent || null,
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
    ).select('-password -refreshTokens') as IUserDocument;

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
    ).select('-password -refreshTokens') as IUserDocument;

    if (!user) {
      throw new Error('User not found');
    }

    await redisClient.del(`user:sessions:${userId}`);
    await redisClient.del(`user:tokens:${userId}`);

    // Use unified audit logger - writes to both Pino and MongoDB
    await audit.userBanned(adminId, userId, { reason, duration, bannedUntil, notifyUser });

    // Broadcast WebSocket event for real-time admin panel updates
    broadcastAdminEvent({
      type: 'user_banned',
      userId,
      user: {
        id: userId,
        isBanned: true,
        status: 'banned',
        banReason: reason,
        bannedAt: new Date(),
        bannedUntil,
      },
    });

    // Send push notification to banned user if notifyUser is true
    if (notifyUser !== false) {
      try {
        const durationText = bannedUntil
          ? `jusqu'au ${bannedUntil.toLocaleDateString('fr-FR')}`
          : 'définitivement';
        await NotificationService.sendNotification(adminId, {
          title: '⚠️ Compte suspendu',
          message: `Votre compte a été suspendu ${durationText}. Raison: ${reason}`,
          type: NotificationType.PUSH,
          targetType: NotificationTargetType.USER,
          targetValue: userId,
          metadata: { action: 'ban', reason, bannedUntil },
        });
        typedLogger.info('Ban notification sent to user', { userId, reason });
      } catch (notifError) {
        typedLogger.warn('Failed to send ban notification', { userId, error: notifError });
      }
    }

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
    ).select('-password -refreshTokens') as IUserDocument;

    if (!user) {
      throw new Error('User not found');
    }

    // Use unified audit logger - writes to both Pino and MongoDB
    await audit.userUnbanned(adminId, userId);

    // Broadcast WebSocket event for real-time admin panel updates
    broadcastAdminEvent({
      type: 'user_unbanned',
      userId,
      user: {
        id: userId,
        isBanned: false,
        status: 'active',
      },
    });

    return user;
  }

  static async adjustPoints(userId: string, points: number, reason: string, adminId: string) {
    try {
      const user = await User.findById(userId).select('-password -refreshTokens');

      if (!user) {
        throw new Error('User not found');
      }

      // Support legacy numeric points field
      const currentPoints = user.get('points');
      const pointsRecord = typeof currentPoints === 'object' && currentPoints !== null
        ? currentPoints as Record<string, unknown>
        : null;

      const available = typeof currentPoints === 'number'
        ? currentPoints
        : (Number(pointsRecord?.available) || 0);
      const total = typeof currentPoints === 'number'
        ? currentPoints
        : (Number(pointsRecord?.total) || 0);
      const spent = typeof currentPoints === 'number'
        ? 0
        : (Number(pointsRecord?.spent) || 0);

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
      ).select('-password -refreshTokens') as IUserDocument;

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
      ).select('-password -refreshTokens') as IUserDocument;

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

      // Broadcast WebSocket event for real-time admin panel updates
      broadcastAdminEvent({
        type: 'user_deleted',
        userId,
        user: {
          id: userId,
          status: 'deleted',
          deletedAt: new Date(),
        },
      });

      return user;
    } catch (error) {
      typedLogger.error('Failed to delete user', { userId, error });
      throw error;
    }
  }

  static async bulkDelete(userIds: string[], adminId: string) {
    try {
      const sanitizedIds = userIds.filter((id) => Types.ObjectId.isValid(id));
      if (sanitizedIds.length === 0) return { success: true, count: 0 };

      // Update users status to deleted
      const result = await User.updateMany(
        { _id: { $in: sanitizedIds } },
        {
          $set: {
            status: 'deleted',
            deletedAt: new Date(),
          },
        }
      );

      // Clear caches in parallel
      await Promise.all(
        sanitizedIds.flatMap((id) => [
          redisClient.del(`user:sessions:${id}`),
          redisClient.del(`user:tokens:${id}`),
        ])
      );

      // Log the bulk action
      await audit.custom({
        userId: adminId,
        userRole: 'admin',
        action: 'BULK_DELETE_USERS',
        resource: 'user',
        category: 'admin',
        severity: 'high',
        description: `Bulk deleted ${result.modifiedCount} users`,
        metadata: {
          requestedCount: userIds.length,
          deletedCount: result.modifiedCount,
          ids: sanitizedIds,
        },
      });

      return { success: true, count: result.modifiedCount, requested: userIds.length };
    } catch (error) {
      typedLogger.error('Failed to bulk delete users', { userIds, error });
      throw error;
    }
  }
}

export { AdminUsersService };
export default AdminUsersService;
