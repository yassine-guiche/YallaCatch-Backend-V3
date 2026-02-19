import AchievementService from '@/services/achievement';
import { Achievement } from '@/models/Achievement';
import { typedLogger } from '@/lib/typed-logger';
import { Types } from 'mongoose';
import { AchievementData, UpdateAchievementData } from './gamification.schema';

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
                total: achievements.length
            };
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
                updatedAt: new Date()
            });
            await achievement.save();

            typedLogger.info('Achievement created', { achievementId: achievement._id, name: achievement.name });

            return {
                success: true,
                achievement: achievement.toJSON()
            };
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
                achievement: achievement.toJSON()
            };
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
                message: 'Achievement deleted'
            };
        } catch (error) {
            typedLogger.error('Delete achievement error', { error: (error as any).message, achievementId });
            throw error;
        }
    }
}
