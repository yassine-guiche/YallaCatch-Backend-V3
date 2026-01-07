import { FastifyInstance } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import { Types } from 'mongoose';
import { User } from '@/models/User';
import { Claim } from '@/models/Claim';
import { Achievement } from '@/models/Achievement';
import { RedisCache } from '@/config/redis';
import { typedLogger } from '@/lib/typed-logger';
import { UserLevel } from '@/types';
import { TUNISIA_CITIES } from '@/config';

// Validation schemas
const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
  preferences: z.object({
    language: z.enum(['ar', 'fr', 'en']).optional(),
    theme: z.enum(['light', 'dark']).optional(),
    notifications: z.object({
      push: z.boolean().optional(),
      email: z.boolean().optional(),
      sms: z.boolean().optional()}).optional(),
    privacy: z.object({
      showOnLeaderboard: z.boolean().optional(),
      shareLocation: z.boolean().optional()}).optional()}).optional()});

const getLeaderboardSchema = z.object({
  city: z.enum(Object.keys(TUNISIA_CITIES) as [string, ...string[]]).optional(),
  level: z.enum(Object.values(UserLevel) as [string, ...string[]]).optional(),
  timeframe: z.enum(['daily', 'weekly', 'monthly', 'all-time']).default('weekly'),
  limit: z.number().min(1).max(100).default(50)});

/**
 * Users service
 */
export class UsersService {
  /**
   * Get user profile
   */
  static async getProfile(userId: string) {
    try {
      // Try cache first to reduce DB load
      const cacheKey = `user:profile:${userId}`;
      const cached = await RedisCache.get<any>(cacheKey);
      if (cached) return cached;

      const user = await User.findById(userId).select('-password');
      
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Get additional stats
      const claimStats = await Claim.aggregate([
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
                      '$validationChecks.dailyLimitValid'
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);

      const [resolvedClaimStats, recentActivity] = await Promise.all([
        Promise.resolve(claimStats[0] || {
          totalClaims: 0,
          totalPoints: 0,
          averageDistance: 0,
          validClaims: 0,
        }),
        Claim.find({ userId: new Types.ObjectId(userId) })
          .populate('prizeId', 'name category points')
          .sort({ claimedAt: -1 })
          .limit(5)]);

      const result = {
        ...user.toJSON(),
        stats: {
          ...user.stats,
          totalClaims: (user as any).stats?.totalClaims || resolvedClaimStats.totalClaims || user.stats.prizesFound || 0,  // Use database field if exists, else calculated value or fallback
          ...resolvedClaimStats},
        recentActivity: recentActivity.map(claim => ({
          id: claim._id,
          prizeName: (claim.prizeId as any)?.name || 'Unknown Prize',
          prizeCategory: (claim.prizeId as any)?.category || 'General',
          pointsAwarded: claim.pointsAwarded,
          claimedAt: claim.claimedAt}))};

      // Cache briefly (60s) for hot reads (best-effort)
      try { await RedisCache.set(cacheKey, result, 60); } catch {}

      return result;

    } catch (error) {
      typedLogger.error('Get profile error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId});
      throw error;
    }
  }

  /**
   * Update user profile
   */
  static async updateProfile(
    userId: string,
    data: z.infer<typeof updateProfileSchema>
  ) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Update fields
      if (data.displayName) {
        user.displayName = data.displayName;
      }

      if (data.email) {
        // Check if email is already taken
        const existingUser = await User.findOne({
          email: data.email,
          _id: { $ne: userId }});
        
        if (existingUser) {
          throw new Error('EMAIL_ALREADY_EXISTS');
        }
        
        user.email = data.email;
      }

      if (data.preferences) {
        // Handle preferences individually due to structural differences between Zod schema and User model
        // The User model expects preferences.notifications as a boolean, but schema defines it as an object

        // Handle language: schema has string literals but model expects Language enum
        if (data.preferences.language) {
          // Convert string to Language enum
          const { Language } = await import('@/types');
          switch (data.preferences.language) {
            case 'fr':
              user.preferences.language = Language.FR;
              break;
            case 'ar':
              user.preferences.language = Language.AR;
              break;
            case 'en':
              user.preferences.language = Language.EN;
              break;
            default:
              user.preferences.language = Language.FR; // default fallback
          }
        }

        // Handle theme: schema has string literals but model expects Theme enum
        if (data.preferences.theme) {
          const { Theme } = await import('@/types');
          user.preferences.theme = data.preferences.theme === 'dark' ? Theme.DARK : Theme.LIGHT;
        }

        // Handle notifications: schema has it as an object but model expects a boolean
        if (data.preferences.notifications) {
          // If notifications is an object with specific settings, determine overall notification preference
          if (typeof data.preferences.notifications === 'object' && data.preferences.notifications !== null) {
            // User gets notifications if at least one notification type is enabled
            const notificationObj = data.preferences.notifications as any;
            user.preferences.notifications = !!(notificationObj.push || notificationObj.email || notificationObj.sms);
          } else {
            // If it's already a boolean, assign it directly
            user.preferences.notifications = !!data.preferences.notifications;
          }
        }

        // Note: privacy settings from schema are not stored in User model, only in request validation
      }

      await user.save();

      typedLogger.info('Profile updated', {
        userId,
        updates: Object.keys(data)});

      // Invalidate cached profile (best-effort)
      try { await RedisCache.del(`user:profile:${userId}`); } catch {}

      return user.toJSON();

    } catch (error) {
      typedLogger.error('Update profile error', {
        error: (error as Error).message,
        userId});
      throw error;
    }
  }

  /**
   * Get leaderboard
   */
  static async getLeaderboard(data: z.infer<typeof getLeaderboardSchema>) {
    try {
      const query: any = {
        'preferences.privacy.showOnLeaderboard': { $ne: false },
        isBanned: false,
        deletedAt: { $exists: false }};

      if (data.city) {
        query['location.city'] = data.city;
      }

      if (data.level) {
        query.level = data.level;
      }

      // Add timeframe filter for recent activity
      if (data.timeframe !== 'all-time') {
        const now = new Date();
        let startDate: Date;

        switch (data.timeframe) {
          case 'daily':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'weekly':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'monthly':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        }

        query.lastActive = { $gte: startDate };
      }

      const users = await User.find(query).select('-password')
        .select('displayName level points.total stats.totalClaims location.city createdAt')
        .sort({ 'points.total': -1, 'stats.totalClaims': -1 })
        .limit(data.limit);

      return {
        leaderboard: users.map((user, index) => ({
          rank: index + 1,
          id: user._id,
          displayName: user.displayName,
          level: user.level,
          totalPoints: user.points.total,
          totalClaims: (user.stats as any).totalClaims || 0,  // Use database field or fallback to 0
          city: user.location.city,
          joinedAt: user.createdAt})),
        timeframe: data.timeframe,
        city: data.city,
        level: data.level,
        total: users.length};

    } catch (error) {
      typedLogger.error('Get leaderboard error', {
        error: (error as Error).message,
        filters: data});
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  static async getUserStats(userId: string) {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Get detailed statistics
      const claimStats = await Claim.aggregate([
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
                      '$validationChecks.dailyLimitValid'
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]);

      const [resolvedClaimStats, rankInfo, levelProgress, achievements] = await Promise.all([
        Promise.resolve(claimStats[0] || {
          totalClaims: 0,
          totalPoints: 0,
          averageDistance: 0,
          validClaims: 0,
        }),
        this.getUserRank(userId),
        this.getLevelProgress(user),
        Achievement.find({ userId: user._id })]);

      return {
        user: {
          id: user._id,
          displayName: user.displayName,
          level: user.level,
          joinedAt: user.createdAt},
        points: user.points,
        stats: {
          ...user.stats,
          totalClaims: (user.stats as any).totalClaims || resolvedClaimStats.totalClaims || user.stats.prizesFound || 0, // Use database field if exists, else calculated value or fallback
          ...resolvedClaimStats},
        rank: rankInfo,
        levelProgress,
        achievements: achievements || []};

    } catch (error) {
      typedLogger.error('Get user stats error', {
        error: (error as Error).message,
        userId});
      throw error;
    }
  }

  /**
   * Get user rank
   */
  static async getUserRank(userId: string) {
    try {
      const user = await User.findById(userId);
      if (!user) return null;

      // Global rank
      const globalRank = await User.countDocuments({
        'points.total': { $gt: user.points.total },
        isBanned: false,
        deletedAt: { $exists: false }}) + 1;

      // City rank
      const cityRank = user.location.city ? await User.countDocuments({
        'points.total': { $gt: user.points.total },
        'location.city': user.location.city,
        isBanned: false,
        deletedAt: { $exists: false }}) + 1 : null;

      return {
        global: globalRank,
        city: cityRank,
        cityName: user.location.city};

    } catch (error) {
      typedLogger.error('Get user rank error', {
        error: (error as any).message,
        userId});
      return null;
    }
  }

  /**
   * Get level progress
   */
  static getLevelProgress(user: any) {
    const levels = Object.values(UserLevel);
    const currentLevelIndex = levels.indexOf(user.level);
    
    if (currentLevelIndex === -1 || currentLevelIndex === levels.length - 1) {
      return {
        currentLevel: user.level,
        nextLevel: null,
        progress: 100,
        pointsToNext: 0,
        pointsForNext: 0};
    }

    const nextLevel = levels[currentLevelIndex + 1];
    const pointsForNext = User.getPointsForLevel(nextLevel);
    const pointsToNext = Math.max(0, pointsForNext - user.points.total);
    const progress = Math.min(100, (user.points.total / pointsForNext) * 100);

    return {
      currentLevel: user.level,
      nextLevel,
      progress: Math.round(progress),
      pointsToNext,
      pointsForNext};
  }
}

/**
 * Users routes
 */
export default async function usersRoutes(fastify: FastifyInstance) {
  // Get user profile
  fastify.get('/profile', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await UsersService.getProfile(request.user.sub);
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const statusCode = (error as any).message === 'USER_NOT_FOUND' ? 404 : 500;
      
      reply.code(statusCode).send({
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()});
    }
  });

  // Update user profile
  fastify.patch('/profile', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await UsersService.updateProfile(
        request.user.sub,
        request.body
      );
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const statusCodes = {
        'USER_NOT_FOUND': 404,
        'EMAIL_ALREADY_EXISTS': 409};
      
      const statusCode = statusCodes[(error as any).message] || 500;
      
      reply.code(statusCode).send({
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()});
    }
  });

  // Get leaderboard
  fastify.get('/leaderboard', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await UsersService.getLeaderboard(request.query);
      
      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      reply.code(500).send({
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()});
    }
  });

  // Get user statistics
  fastify.get('/stats', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await UsersService.getUserStats(request.user.sub);

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const statusCode = (error as any).message === 'USER_NOT_FOUND' ? 404 : 500;

      reply.code(statusCode).send({
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()});
    }
  });

  // NOTE: Admin routes (ban, unban, get all users) have been moved to admin module to eliminate duplication
  // and maintain proper separation of concerns between user and admin functionality
}
