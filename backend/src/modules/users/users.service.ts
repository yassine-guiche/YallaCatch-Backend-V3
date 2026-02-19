import { Types, FilterQuery } from 'mongoose';
import { User } from '@/models/User';
import { Claim } from '@/models/Claim';
import { Achievement } from '@/models/Achievement';
import { RedisCache } from '@/config/redis';
import { typedLogger } from '@/lib/typed-logger';
import { UserLevel, IUserDocument, IPrize } from '@/types';
import { z } from 'zod'; // Needed for type inference
import {
    updateProfileSchema,
    getLeaderboardSchema
} from './users.schema';

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
            const cached = await RedisCache.get<unknown>(cacheKey); // TODO: Type this properly
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

            // Normalize points shape for UI robustness
            const rawPoints: any = user.get('points');
            const numericPoints = typeof rawPoints === 'number' ? rawPoints : null;
            const pointsObj = (typeof rawPoints === 'object' && rawPoints !== null ? rawPoints : {}) as any;
            const normalizedPoints = {
                available: numericPoints ?? pointsObj.available ?? pointsObj.total ?? 0,
                total: numericPoints ?? pointsObj.total ?? pointsObj.available ?? 0,
                spent: pointsObj.spent ?? 0,
            };

            const result = {
                ...user.toJSON(),
                points: normalizedPoints,
                stats: {
                    ...user.stats,
                    totalClaims: user.stats.totalClaims || resolvedClaimStats.totalClaims || user.stats.prizesFound || 0,
                    ...resolvedClaimStats,
                    totalPoints: normalizedPoints.total
                },
                recentActivity: recentActivity.map(claim => ({
                    id: claim._id,
                    prizeName: (claim.prizeId as unknown as IPrize)?.name || 'Unknown Prize',
                    prizeCategory: (claim.prizeId as unknown as IPrize)?.category || 'General',
                    pointsAwarded: claim.pointsAwarded,
                    claimedAt: claim.claimedAt
                }))
            };

            // Cache briefly (60s) for hot reads (best-effort)
            try { await RedisCache.set(cacheKey, result, 60); } catch { /* best effort */ }

            return result;

        } catch (error) {
            typedLogger.error('Get profile error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
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
                    _id: { $ne: userId }
                });

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
                        const notificationObj = data.preferences.notifications;
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
                updates: Object.keys(data)
            });

            // Invalidate cached profile (best-effort)
            try { await RedisCache.del(`user:profile:${userId}`); } catch { /* best effort */ }

            return user.toJSON();

        } catch (error) {
            typedLogger.error('Update profile error', {
                error: (error as Error).message,
                userId
            });
            throw error;
        }
    }

    /**
     * Get leaderboard
     */
    static async getLeaderboard(data: z.infer<typeof getLeaderboardSchema>) {
        try {
            const query: FilterQuery<IUserDocument> = {
                'preferences.privacy.showOnLeaderboard': { $ne: false },
                isBanned: false,
                deletedAt: { $exists: false }
            };

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
                    totalClaims: user.stats.totalClaims || 0,  // Use database field or fallback to 0
                    city: user.location.city,
                    joinedAt: user.createdAt
                })),
                timeframe: data.timeframe,
                city: data.city,
                level: data.level,
                total: users.length
            };

        } catch (error) {
            typedLogger.error('Get leaderboard error', {
                error: (error as Error).message,
                filters: data
            });
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
                    joinedAt: user.createdAt
                },
                points: user.points,
                stats: {
                    ...user.stats,
                    totalClaims: user.stats.totalClaims || resolvedClaimStats.totalClaims || user.stats.prizesFound || 0, // Use database field if exists, else calculated value or fallback
                    ...resolvedClaimStats
                },
                rank: rankInfo,
                levelProgress,
                achievements: achievements || []
            };

        } catch (error) {
            typedLogger.error('Get user stats error', {
                error: (error as Error).message,
                userId
            });
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
                deletedAt: { $exists: false }
            }) + 1;

            // City rank
            const cityRank = user.location.city ? await User.countDocuments({
                'points.total': { $gt: user.points.total },
                'location.city': user.location.city,
                isBanned: false,
                deletedAt: { $exists: false }
            }) + 1 : null;

            return {
                global: globalRank,
                city: cityRank,
                cityName: user.location.city
            };

        } catch (error) {
            typedLogger.error('Get user rank error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId
            });
            return null;
        }
    }

    /**
     * Get level progress
     */
    static getLevelProgress(user: IUserDocument) {
        const levels = Object.values(UserLevel) as UserLevel[];
        const currentLevelIndex = levels.indexOf(user.level);

        if (currentLevelIndex === -1 || currentLevelIndex === levels.length - 1) {
            return {
                currentLevel: user.level,
                nextLevel: null,
                progress: 100,
                pointsToNext: 0,
                pointsForNext: 0
            };
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
            pointsForNext
        };
    }
}
