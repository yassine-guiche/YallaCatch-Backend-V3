import { User } from '@/models/User';
import { Claim } from '@/models/Claim';
import { Settings } from '@/models/Settings';
import { redisClient } from '@/config/redis';
import { typedLogger } from '@/lib/typed-logger';

/**
 * Progression Service (CLEANED VERSION)
 * ✅ Removed XP system (1-10 levels)
 * ✅ Uses only UserLevel system (Bronze/Silver/Gold/Platinum/Diamond)
 * Core Feature: Points accumulate → Level increases automatically
 */

export interface ProgressionResult {
  userId: string;
  currentLevel: string; // 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
  levelNumber: number; // 1-5
  points: {
    available: number;
    total: number;
    spent: number;
  };
  nextLevel: {
    level: string;
    requiredPoints: number;
    progress: number; // 0-100%
    pointsToNext: number;
  } | null;
  stats: {
    totalClaims: number;
    totalPoints: number;
    averagePointsPerClaim: number;
    streakDays: number;
    favoriteCategory: string;
  };
}

export interface LevelUpdateResult {
  leveledUp: boolean;
  newLevel: string;
  progress: number;
  nextLevel: {
    level: string;
    requiredPoints: number;
    pointsToNext: number;
  } | null;
}

export class ProgressionService {
  private static redis = redisClient;
  
  // UserLevel thresholds
  private static readonly DEFAULT_LEVEL_THRESHOLDS = {
    bronze: 0,
    silver: 1000,
    gold: 5000,
    platinum: 15000,
    diamond: 50000,
  };

  // Cached settings to avoid frequent DB hits
  private static cachedThresholds: Record<string, number> | null = null;
  private static lastFetchedAt = 0;
  private static readonly CACHE_TTL_MS = 60_000; // 1 minute

  /**
   * Calculate user progression based on current points
   */
  static async calculateProgression(userId: string): Promise<ProgressionResult> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Get user's points
      const points = {
        available: user.points.available || 0,
        total: user.points.total || 0,
        spent: user.points.spent || 0,
      };
      
      // Get current level info
      const thresholds = await this.getLevelThresholds();
      const currentLevel = user.level || 'bronze';
      const levelNumber = this.getLevelNumber(currentLevel);
      
      // Calculate next level info
      const nextLevel = this.getNextLevelInfo(currentLevel, points.total, thresholds);
      
      // Get user statistics
      const stats = await this.getUserStats(userId);
      
      return {
        userId,
        currentLevel,
        levelNumber,
        points,
        nextLevel,
        stats,
      };
    } catch (error) {
      typedLogger.error('Calculate progression error', { error: (error as any).message, userId });
      throw error;
    }
  }

  /**
   * Update a user's level based on total points; returns level change + progress.
   * Accepts either a user id or a hydrated user document to avoid an extra lookup.
   */
  static async updateLevelForUser(userOrId: string | any): Promise<LevelUpdateResult> {
    try {
      const user = typeof userOrId === 'string'
        ? await User.findById(userOrId)
        : userOrId;

      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      const thresholds = await this.getLevelThresholds();
      const totalPoints = user.points?.total ?? user.points ?? 0;
      const currentLevel = user.level || 'bronze';

      // Determine next level info
      const levels = Object.keys(thresholds);
      const currentIndex = levels.indexOf(currentLevel);
      const nextLevel = currentIndex >= 0 && currentIndex < levels.length - 1
        ? levels[currentIndex + 1]
        : null;

      const nextThreshold = nextLevel ? thresholds[nextLevel] : null;
      const currentThreshold = thresholds[currentLevel] ?? 0;

      // Find highest level attainable with current points
      let newLevel = currentLevel;
      for (const level of levels) {
        if (totalPoints >= thresholds[level]) {
          newLevel = level;
        }
      }

      // Compute progress toward the next level (if any)
      let progress = 100;
      let pointsToNext = 0;
      if (nextLevel && nextThreshold !== null) {
        const span = nextThreshold - currentThreshold || 1;
        progress = Math.min(100, Math.round(((totalPoints - currentThreshold) / span) * 100));
        pointsToNext = Math.max(0, nextThreshold - totalPoints);
      }

      const leveledUp = newLevel !== currentLevel;
      if (leveledUp) {
        user.level = newLevel;
        await user.save();
      }

      return {
        leveledUp,
        newLevel,
        progress,
        nextLevel: nextLevel
          ? { level: nextLevel, requiredPoints: nextThreshold!, pointsToNext }
          : null,
      };
    } catch (error) {
      typedLogger.error('Update level error', { error: (error as any).message, userId: typeof userOrId === 'string' ? userOrId : userOrId?._id });
      throw error;
    }
  }

  /**
   * Get level number from level name
   */
  private static getLevelNumber(level: string): number {
    const levelMap = {
      bronze: 1,
      silver: 2,
      gold: 3,
      platinum: 4,
      diamond: 5,
    };
    return levelMap[level] || 1;
  }

  /**
   * Get next level information
   */
  private static getNextLevelInfo(currentLevel: string, totalPoints: number, thresholds: Record<string, number>) {
    const levels = Object.keys(thresholds);
    const currentIndex = levels.indexOf(currentLevel);
    
    if (currentIndex === levels.length - 1) {
      // Max level reached
      return null;
    }
    
    const nextLevel = levels[currentIndex + 1];
    const currentThreshold = thresholds[currentLevel];
    const nextThreshold = thresholds[nextLevel];
    
    const pointsToNext = Math.max(0, nextThreshold - totalPoints);
    const progress = Math.min(100, Math.round(((totalPoints - currentThreshold) / (nextThreshold - currentThreshold)) * 100));
    
    return {
      level: nextLevel,
      requiredPoints: nextThreshold,
      progress,
      pointsToNext,
    };
  }

  /**
   * Get user statistics
   */
  private static async getUserStats(userId: string) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return {
          totalClaims: 0,
          totalPoints: 0,
          averagePointsPerClaim: 0,
          streakDays: 0,
          favoriteCategory: 'unknown',
        };
      }

      const totalClaims = user.stats?.prizesFound || 0;
      const totalPoints = user.points.total || 0;
      const averagePointsPerClaim = totalClaims > 0 ? Math.round(totalPoints / totalClaims) : 0;
      const streakDays = user.stats?.currentStreak || 0;
      const favoriteCategory = user.stats?.favoriteCity || 'unknown';

      return {
        totalClaims,
        totalPoints,
        averagePointsPerClaim,
        streakDays,
        favoriteCategory,
      };
    } catch (error) {
      typedLogger.error('Get user stats error', { error: (error as any).message, userId });
      return {
        totalClaims: 0,
        totalPoints: 0,
        averagePointsPerClaim: 0,
        streakDays: 0,
        favoriteCategory: 'unknown',
      };
    }
  }

  /**
   * Load level thresholds from Settings.custom.progression.levels or fallback defaults.
   */
  private static async getLevelThresholds(): Promise<Record<string, number>> {
    const now = Date.now();
    if (this.cachedThresholds && (now - this.lastFetchedAt) < this.CACHE_TTL_MS) {
      return this.cachedThresholds;
    }

    try {
      const settings = await Settings.findOne({}, { 'custom.progression': 1 }).lean();
      const levels = (settings as any)?.custom?.get?.('progression')?.levels || (settings as any)?.custom?.progression?.levels;

      if (Array.isArray(levels) && levels.length > 0) {
        // Normalize into record, sorted by threshold
        const normalized: Record<string, number> = {};
        levels
          .filter((lvl: any) => typeof lvl?.name === 'string' && typeof lvl?.threshold === 'number')
          .sort((a: any, b: any) => a.threshold - b.threshold)
          .forEach((lvl: any) => { normalized[lvl.name] = lvl.threshold; });

        if (Object.keys(normalized).length > 0) {
          this.cachedThresholds = normalized;
          this.lastFetchedAt = now;
          return normalized;
        }
      }
    } catch (error) {
      typedLogger.warn('Progression settings load failed, using defaults', { error: (error as any).message });
    }

    this.cachedThresholds = this.DEFAULT_LEVEL_THRESHOLDS;
    this.lastFetchedAt = now;
    return this.DEFAULT_LEVEL_THRESHOLDS;
  }

  /**
   * Get user streak days
   */
  private static async getUserStreakDays(userId: string): Promise<number> {
    try {
      const user = await User.findById(userId);
      return user?.stats?.currentStreak || 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get progression leaderboard
   */
  static async getLeaderboard(limit: number = 100): Promise<any[]> {
    try {
      const users = await User.find({ role: 'user' })
        .select('displayName level points stats')
        .sort({ 'points.total': -1 })
        .limit(limit)
        .lean();

      return users.map((user, index) => {
        return {
          rank: index + 1,
          userId: user._id,
          displayName: user.displayName,
          level: user.level,
          levelNumber: this.getLevelNumber(user.level),
          points: user.points.total,
          totalClaims: user.stats?.prizesFound || 0,
        };
      });
    } catch (error) {
      typedLogger.error('Get progression leaderboard error', { error: (error as any).message, limit });
      return [];
    }
  }
}
