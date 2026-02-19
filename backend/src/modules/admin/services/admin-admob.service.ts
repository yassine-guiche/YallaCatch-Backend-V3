import AdMobView from '@/models/AdMobView';
import { typedLogger } from '@/lib/typed-logger';

export class AdminAdMobService {
    static async getAnalytics(startDate?: string, endDate?: string, groupBy: string = 'day') {
        const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
        const end = endDate ? new Date(endDate) : new Date();

        const groupFormat = groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';

        // Overall stats
        const [overallStats, adTypeStats, dailyTrend] = await Promise.all([
            AdMobView.aggregate([
                {
                    $match: {
                        viewedAt: { $gte: start, $lte: end }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalViews: { $sum: 1 },
                        totalCompleted: { $sum: { $cond: ['$completed', 1, 0] } },
                        totalRevenue: { $sum: '$revenue' },
                        totalRewards: { $sum: '$rewardAmount' },
                        avgEcpm: { $avg: '$ecpm' }
                    }
                }
            ]),

            // Stats by ad type
            AdMobView.aggregate([
                {
                    $match: {
                        viewedAt: { $gte: start, $lte: end }
                    }
                },
                {
                    $group: {
                        _id: '$adType',
                        views: { $sum: 1 },
                        completed: { $sum: { $cond: ['$completed', 1, 0] } },
                        revenue: { $sum: '$revenue' },
                        rewards: { $sum: '$rewardAmount' }
                    }
                }
            ]),

            // Daily trend
            AdMobView.aggregate([
                {
                    $match: {
                        viewedAt: { $gte: start, $lte: end }
                    }
                },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: groupFormat, date: '$viewedAt' }
                        },
                        views: { $sum: 1 },
                        completed: { $sum: { $cond: ['$completed', 1, 0] } },
                        revenue: { $sum: '$revenue' },
                        rewards: { $sum: '$rewardAmount' }
                    }
                },
                { $sort: { _id: 1 } }
            ])
        ]);

        // Top users
        const topUsers = await AdMobView.aggregate([
            {
                $match: {
                    viewedAt: { $gte: start, $lte: end },
                    completed: true
                }
            },
            {
                $group: {
                    _id: '$userId',
                    views: { $sum: 1 },
                    rewards: { $sum: '$rewardAmount' }
                }
            },
            { $sort: { views: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            {
                $project: {
                    userId: '$_id',
                    username: { $arrayElemAt: ['$user.username', 0] },
                    views: 1,
                    rewards: 1
                }
            }
        ]);

        return {
            overview: overallStats[0] || {
                totalViews: 0,
                totalCompleted: 0,
                totalRevenue: 0,
                totalRewards: 0,
                avgEcpm: 0
            },
            byType: adTypeStats,
            trend: dailyTrend,
            topUsers
        };
    }
}
