import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import AchievementService from '@/services/achievement';
import { Achievement } from '@/models/Achievement';
import { User } from '@/models/User';
import { typedLogger } from '@/lib/typed-logger';
import { Types } from 'mongoose';

// Define proper TypeScript interfaces
interface AchievementData {
  name: string;
  description: string;
  icon: string;
  category: 'explorer' | 'collector' | 'social' | 'master' | 'special';
  trigger: 'PRIZE_CLAIMED' | 'LEVEL_UP' | 'REWARD_REDEEMED' | 'FRIEND_ADDED' | 'STREAK_MILESTONE' | 'DISTANCE_MILESTONE' | 'MANUAL';
  condition: {
    type: 'TOTAL_CLAIMS' | 'TOTAL_POINTS' | 'LEVEL_REACHED' | 'STREAK_DAYS' | 'CATEGORY_CLAIMS' | 'RARITY_CLAIMS' | 'DISTANCE_TRAVELED' | 'FRIENDS_COUNT' | 'REWARDS_REDEEMED';
    target: number;
    category?: string;
    rarity?: string;
  };
  rewards: {
    type: 'POINTS' | 'POWER_UP' | 'COSMETIC' | 'TITLE' | 'BADGE';
    value: any;
    description: string;
  }[];
  isActive: boolean;
  isHidden: boolean;
  order: number;
}

interface UpdateAchievementData {
  name?: string;
  description?: string;
  icon?: string;
  category?: 'explorer' | 'collector' | 'social' | 'master' | 'special';
  trigger?: 'PRIZE_CLAIMED' | 'LEVEL_UP' | 'REWARD_REDEEMED' | 'FRIEND_ADDED' | 'STREAK_MILESTONE' | 'DISTANCE_MILESTONE' | 'MANUAL';
  condition?: {
    type: 'TOTAL_CLAIMS' | 'TOTAL_POINTS' | 'LEVEL_REACHED' | 'STREAK_DAYS' | 'CATEGORY_CLAIMS' | 'RARITY_CLAIMS' | 'DISTANCE_TRAVELED' | 'FRIENDS_COUNT' | 'REWARDS_REDEEMED';
    target: number;
    category?: string;
    rarity?: string;
  };
  rewards?: {
    type: 'POINTS' | 'POWER_UP' | 'COSMETIC' | 'TITLE' | 'BADGE';
    value: any;
    description: string;
  }[];
  isActive?: boolean;
  isHidden?: boolean;
  order?: number;
}

/**
 * Gamification Service
 * Handles achievements, challenges, and other gamification mechanics
 */
export class GamificationService {
  /**
   * Get user achievements
   */
  static async getUserAchievements(userId: string) {
    return await AchievementService.getUserAchievements(userId);
  }

  /**
   * Get recently unlocked achievements
   */
  static async getRecentlyUnlocked(userId: string, limit: number = 10) {
    return await AchievementService.getRecentlyUnlocked(userId, limit);
  }

  /**
   * Get all achievements (admin)
   */
  static async getAllAchievements() {
    try {
      const achievements = await Achievement.find({})
        .sort({ category: 1, order: 1 })
        .lean();

      return {
        achievements,
        total: achievements.length};
    } catch (error) {
      typedLogger.error('Get all achievements error', { error: (error as any).message });
      throw error;
    }
  }

  /**
   * Create achievement (admin)
   */
  static async createAchievement(data: AchievementData, adminId: string) {
    try {
      const achievement = new Achievement({
        ...data,
        createdBy: new Types.ObjectId(adminId),
        createdAt: new Date(),
        updatedAt: new Date()});
      await achievement.save();

      typedLogger.info('Achievement created', { achievementId: achievement._id, name: achievement.name });

      return {
        success: true,
        achievement: achievement.toJSON()};
    } catch (error) {
      typedLogger.error('Create achievement error', { error: (error as any).message, data });
      throw error;
    }
  }

  /**
   * Update achievement (admin)
   */
  static async updateAchievement(achievementId: string, data: UpdateAchievementData) {
    try {
      const achievement = await Achievement.findByIdAndUpdate(
        new Types.ObjectId(achievementId),
        { ...data, updatedAt: new Date() },
        { new: true, runValidators: true }
      );

      if (!achievement) {
        throw new Error('ACHIEVEMENT_NOT_FOUND');
      }

      typedLogger.info('Achievement updated', { achievementId: achievement._id, name: achievement.name });

      return {
        success: true,
        achievement: achievement.toJSON()};
    } catch (error) {
      typedLogger.error('Update achievement error', { error: (error as any).message, achievementId, data });
      throw error;
    }
  }

  /**
   * Delete achievement (admin)
   */
  static async deleteAchievement(achievementId: string) {
    try {
      const achievement = await Achievement.findByIdAndDelete(new Types.ObjectId(achievementId));

      if (!achievement) {
        throw new Error('ACHIEVEMENT_NOT_FOUND');
      }

      typedLogger.info('Achievement deleted', { achievementId: achievement._id, name: achievement.name });

      return {
        success: true,
        message: 'Achievement deleted'};
    } catch (error) {
      typedLogger.error('Delete achievement error', { error: (error as any).message, achievementId });
      throw error;
    }
  }
}

// Validation schemas
const achievementSchema = z.object({
  name: z.string().min(3).max(100),
  description: z.string().min(10).max(500),
  icon: z.string().url().optional().default(''),
  category: z.enum(['explorer', 'collector', 'social', 'master', 'special']),
  trigger: z.enum(['PRIZE_CLAIMED', 'LEVEL_UP', 'REWARD_REDEEMED', 'FRIEND_ADDED', 'STREAK_MILESTONE', 'DISTANCE_MILESTONE', 'MANUAL']),
  condition: z.object({
    type: z.enum(['TOTAL_CLAIMS', 'TOTAL_POINTS', 'LEVEL_REACHED', 'STREAK_DAYS', 'CATEGORY_CLAIMS', 'RARITY_CLAIMS', 'DISTANCE_TRAVELED', 'FRIENDS_COUNT', 'REWARDS_REDEEMED']),
    target: z.number().min(1),
    category: z.string().optional(),
    rarity: z.string().optional()}),
  rewards: z.array(z.object({
    type: z.enum(['POINTS', 'POWER_UP', 'COSMETIC', 'TITLE', 'BADGE']),
    value: z.any(),
    description: z.string().min(1)})).min(1),
  isActive: z.boolean().default(true),
  isHidden: z.boolean().default(false),
  order: z.number().default(0)});

const updateAchievementSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  description: z.string().min(10).max(500).optional(),
  icon: z.string().url().optional(),
  category: z.enum(['explorer', 'collector', 'social', 'master', 'special']).optional(),
  trigger: z.enum(['PRIZE_CLAIMED', 'LEVEL_UP', 'REWARD_REDEEMED', 'FRIEND_ADDED', 'STREAK_MILESTONE', 'DISTANCE_MILESTONE', 'MANUAL']).optional(),
  condition: z.object({
    type: z.enum(['TOTAL_CLAIMS', 'TOTAL_POINTS', 'LEVEL_REACHED', 'STREAK_DAYS', 'CATEGORY_CLAIMS', 'RARITY_CLAIMS', 'DISTANCE_TRAVELED', 'FRIENDS_COUNT', 'REWARDS_REDEEMED']),
    target: z.number().min(1),
    category: z.string().optional(),
    rarity: z.string().optional()}).optional(),
  rewards: z.array(z.object({
    type: z.enum(['POINTS', 'POWER_UP', 'COSMETIC', 'TITLE', 'BADGE']),
    value: z.any(),
    description: z.string().min(1)})).optional(),
  isActive: z.boolean().optional(),
  isHidden: z.boolean().optional(),
  order: z.number().optional()});

const achievementParamsSchema = z.object({
  achievementId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid achievement ID")});

export default async function gamificationRoutes(fastify: FastifyInstance) {
  // Get user achievements
  fastify.get('/achievements', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await GamificationService.getUserAchievements(request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get recently unlocked achievements
  fastify.get('/achievements/recent', {
    preHandler: [authenticate],
    schema: {
      querystring: z.object({
        limit: z.coerce.number().min(1).max(50).default(10)})
    }
  }, async (request: FastifyRequest<{ Querystring: { limit?: number } }>, reply: FastifyReply) => {
    try {
      const limit = request.query.limit || 10;
      const result = await GamificationService.getRecentlyUnlocked(request.user.sub, limit);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
}
