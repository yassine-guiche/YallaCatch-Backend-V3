import { Types } from 'mongoose';
import { User } from '@/models/User';
import { Achievement, AchievementTrigger, AchievementConditionType } from '@/models/Achievement';
import { UserAchievement } from '@/models/UserAchievement';
import { Claim } from '@/models/Claim';
import { typedLogger } from '@/lib/typed-logger';

/**
 * Achievement Service
 * Gère le système d'achievements automatique
 */
export class AchievementService {
  /**
   * Vérifier et débloquer les achievements pour un événement
   */
  static async checkAchievements(
    userId: string,
    trigger: AchievementTrigger | string,
    context: any = {}
  ): Promise<void> {
    try {
      // Récupérer les achievements actifs liés à cet événement
      const achievements = await Achievement.find({
        trigger,
        isActive: true,
      }).lean();

      if (achievements.length === 0) {
        return;
      }

      // Récupérer l'utilisateur
      const user = await User.findById(userId);
      if (!user) {
        return;
      }

      // Vérifier chaque achievement
      for (const achievement of achievements) {
        const isUnlocked = await this.isUnlocked(userId, achievement._id.toString());

        if (isUnlocked) {
          continue; // Déjà débloqué
        }

        // Calculer la progression
        const progress = await this.calculateProgress(userId, achievement, context);

        // Mettre à jour ou créer UserAchievement
        await UserAchievement.findOneAndUpdate(
          { userId: new Types.ObjectId(userId), achievementId: achievement._id },
          {
            userId: new Types.ObjectId(userId),
            achievementId: achievement._id,
            progress,
            updatedAt: new Date(),
          },
          { upsert: true }
        );

        // Si 100%, débloquer
        if (progress >= 100) {
          await this.unlockAchievement(userId, achievement._id.toString(), achievement);
        }
      }
    } catch (error) {
      typedLogger.error('Check achievements error', { error: (error as any).message, userId, trigger });
    }
  }

  /**
   * Calculer la progression d'un achievement
   */
  private static async calculateProgress(
    userId: string,
    achievement: any,
    context: any
  ): Promise<number> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return 0;
      }

      const { condition } = achievement;

      switch (condition.type) {
        case AchievementConditionType.TOTAL_CLAIMS:
          const totalClaims = (user as any).stats?.prizesFound || 0;
          return Math.min(100, (totalClaims / condition.target) * 100);

        case AchievementConditionType.TOTAL_POINTS:
          const totalPoints = user.points?.total || 0;
          return Math.min(100, (totalPoints / condition.target) * 100);

        case AchievementConditionType.LEVEL_REACHED:
          const levelMap: Record<string, number> = {
            bronze: 1,
            silver: 2,
            gold: 3,
            platinum: 4,
            diamond: 5
          };
          const currentLevel = levelMap[user.level] || 1;
          const targetLevel = condition.target;
          return currentLevel >= targetLevel ? 100 : 0;

        case AchievementConditionType.STREAK_DAYS:
          const streak = (user as any).stats?.currentStreak || 0;
          return Math.min(100, (streak / condition.target) * 100);

        case AchievementConditionType.CATEGORY_CLAIMS:
          // Compter les claims d'une catégorie spécifique
          const categoryClaims = await Claim.countDocuments({
            userId: new Types.ObjectId(userId),
          });
          // TODO: Filter by category when Prize is populated
          return Math.min(100, (categoryClaims / condition.target) * 100);

        case AchievementConditionType.RARITY_CLAIMS:
          // Compter les claims d'une rareté spécifique
          const rarityClaims = await Claim.countDocuments({
            userId: new Types.ObjectId(userId),
          });
          // TODO: Filter by rarity when Prize is populated
          return Math.min(100, (rarityClaims / condition.target) * 100);

        case AchievementConditionType.DISTANCE_TRAVELED:
          const distance = (user as any).stats?.totalDistance || 0;
          return Math.min(100, (distance / condition.target) * 100);

        case AchievementConditionType.FRIENDS_COUNT:
          const FriendshipService = (await import('./friendship')).default;
          const friendsCount = await FriendshipService.countFriends(userId);
          return Math.min(100, (friendsCount / condition.target) * 100);

        case AchievementConditionType.REWARDS_REDEEMED:
          const rewardsRedeemed = user.stats?.rewardsRedeemed || 0;
          return Math.min(100, (rewardsRedeemed / condition.target) * 100);

        default:
          return 0;
      }
    } catch (error) {
      typedLogger.error('Calculate progress error', { error: (error as any).message, userId, achievement: achievement._id });
      return 0;
    }
  }

  /**
   * Vérifier si un achievement est débloqué
   */
  private static async isUnlocked(userId: string, achievementId: string): Promise<boolean> {
    const userAchievement = await UserAchievement.findOne({
      userId: new Types.ObjectId(userId),
      achievementId: new Types.ObjectId(achievementId),
      unlockedAt: { $exists: true },
    });
    return !!userAchievement;
  }

  /**
   * Débloquer un achievement
   */
  private static async unlockAchievement(
    userId: string,
    achievementId: string,
    achievement: any
  ): Promise<void> {
    try {
      // Marquer comme débloqué
      await UserAchievement.findOneAndUpdate(
        { userId: new Types.ObjectId(userId), achievementId: new Types.ObjectId(achievementId) },
        {
          unlockedAt: new Date(),
          progress: 100,
        },
        { upsert: true }
      );

      // Accorder les récompenses
      await this.grantRewards(userId, achievement.rewards);

      typedLogger.info('Achievement unlocked', {
        userId,
        achievementId,
        achievementName: achievement.name,
        rewards: achievement.rewards,
      });
    } catch (error) {
      typedLogger.error('Unlock achievement error', { error: (error as any).message, userId, achievementId });
    }
  }

  /**
   * Accorder les récompenses d'un achievement
   */
  private static async grantRewards(userId: string, rewards: any[]): Promise<void> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return;
      }

      for (const reward of rewards) {
        switch (reward.type) {
          case 'POINTS':
            (user as any).addPoints(reward.value);
            typedLogger.info('Achievement reward granted: points', { userId, points: reward.value });
            break;

          case 'POWER_UP':
            // TODO: Implémenter le système de power-ups
            typedLogger.info('Achievement reward granted: power-up', { userId, powerUp: reward.value });
            break;

          case 'COSMETIC':
            // TODO: Implémenter le système de cosmétiques
            typedLogger.info('Achievement reward granted: cosmetic', { userId, cosmetic: reward.value });
            break;

          case 'TITLE':
            // TODO: Implémenter le système de titres
            typedLogger.info('Achievement reward granted: title', { userId, title: reward.value });
            break;

          case 'BADGE':
            // TODO: Implémenter le système de badges
            typedLogger.info('Achievement reward granted: badge', { userId, badge: reward.value });
            break;
        }
      }

      await user.save();
    } catch (error) {
      typedLogger.error('Grant rewards error', { error: (error as any).message, userId, rewards });
    }
  }

  /**
   * Récupérer tous les achievements d'un utilisateur
   */
  static async getUserAchievements(userId: string): Promise<any> {
    try {
      const [achievements, userAchievements] = await Promise.all([
        Achievement.find({ isActive: true, isHidden: false }).sort({ category: 1, order: 1 }).lean(),
        UserAchievement.find({ userId: new Types.ObjectId(userId) }).lean(),
      ]);

      // Mapper les achievements avec la progression
      const achievementsWithProgress = achievements.map(achievement => {
        const userAchievement = userAchievements.find(
          ua => ua.achievementId.toString() === achievement._id.toString()
        );

        return {
          ...achievement,
          progress: userAchievement?.progress || 0,
          unlockedAt: userAchievement?.unlockedAt || null,
          isUnlocked: !!userAchievement?.unlockedAt,
        };
      });

      const unlocked = achievementsWithProgress.filter(a => a.isUnlocked);
      const inProgress = achievementsWithProgress.filter(a => !a.isUnlocked && a.progress > 0);
      const locked = achievementsWithProgress.filter(a => a.progress === 0);

      return {
        achievements: achievementsWithProgress,
        unlocked,
        inProgress,
        locked,
        stats: {
          total: achievements.length,
          unlockedCount: unlocked.length,
          inProgressCount: inProgress.length,
          lockedCount: locked.length,
          completionPercentage: Math.round((unlocked.length / achievements.length) * 100),
        },
      };
    } catch (error) {
      typedLogger.error('Get user achievements error', { error: (error as any).message, userId });
      throw error;
    }
  }

  /**
   * Récupérer les achievements récemment débloqués
   */
  static async getRecentlyUnlocked(userId: string, limit: number = 10): Promise<any> {
    try {
      const recentlyUnlocked = await UserAchievement.find({
        userId: new Types.ObjectId(userId),
        unlockedAt: { $exists: true },
      })
      .populate('achievementId')
      .sort({ unlockedAt: -1 })
      .limit(limit)
      .lean();

      return {
        achievements: recentlyUnlocked,
        total: recentlyUnlocked.length,
      };
    } catch (error) {
      typedLogger.error('Get recently unlocked error', { error: (error as any).message, userId });
      throw error;
    }
  }
}

export default AchievementService;

