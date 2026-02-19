import { Types } from 'mongoose';
import { User, Prize, Claim, Reward, Redemption } from '@/models';
import { Analytics } from '@/models/Analytics';
import { AuditLog } from '@/models/AuditLog';
import { MetricsService } from '@/services/metrics';
import { typedLogger } from '@/lib/typed-logger';

export class AdminAnalyticsService {
  static async getAnalytics(startDate?: string, endDate?: string) {
    const query: Record<string, unknown> = {};

    if (startDate || endDate) {
      const dateQuery: { $gte?: Date; $lte?: Date } = {};
      if (startDate) dateQuery.$gte = new Date(startDate);
      if (endDate) dateQuery.$lte = new Date(endDate);
      query.date = dateQuery;
    }

    return Analytics.find(query).sort({ date: -1 });
  }

  static async generateDailyAnalytics(date: Date = new Date()) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [totalUsers, newUsers, totalClaims, totalRedemptions, claimsToday] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
      Claim.countDocuments(),
      Redemption.countDocuments(),
      Claim.countDocuments({ claimedAt: { $gte: startOfDay, $lte: endOfDay } })
    ]);

    const activeUsers = await User.countDocuments({
      lastActive: { $gte: startOfDay, $lte: endOfDay }
    });

    const analytics = await Analytics.findOneAndUpdate(
      { date: startOfDay },
      {
        date: startOfDay,
        totalUsers,
        newUsers,
        activeUsers,
        totalClaims,
        claimsToday,
        totalRedemptions,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    typedLogger.info('Daily analytics generated', { date: startOfDay });
    return analytics;
  }

  static async getOverview(period: string) {
    const { startDate, endDate } = this.parseTimeframe(period);

    const [
      activeUsers,
      totalCaptures,
      totalRedemptions,
      userGrowth,
      dailyActivity
    ] = await Promise.all([
      User.countDocuments({ lastActive: { $gte: startDate } }),
      Claim.countDocuments({ claimedAt: { $gte: startDate, $lte: endDate } }),
      Redemption.countDocuments({ redeemedAt: { $gte: startDate, $lte: endDate } }),
      this.getUserGrowthData(startDate, endDate),
      this.getDailyActivityData(startDate, endDate)
    ]);

    const conversionRate = totalCaptures > 0
      ? ((totalRedemptions / totalCaptures) * 100).toFixed(2)
      : '0.00';

    const revenueData = await Redemption.aggregate([
      { $match: { redeemedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: null, total: { $sum: '$pointsSpent' } } }
    ]);

    return {
      activeUsers,
      totalCaptures,
      conversionRate: parseFloat(conversionRate),
      revenue: revenueData[0]?.total || 0,
      dailyActivity,
      userGrowth
    };
  }

  static async getUsersAnalytics(period: string) {
    const { startDate, endDate } = this.parseTimeframe(period);

    const [totalUsers, newUsers, activeUsers, bannedUsers, topUsers, userGrowth] = await Promise.all([
      User.countDocuments({ deletedAt: { $exists: false } }),
      User.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, deletedAt: { $exists: false } }),
      User.countDocuments({ isBanned: { $ne: true }, deletedAt: { $exists: false } }), // Active status (not banned, not deleted)
      User.countDocuments({ isBanned: true, deletedAt: { $exists: false } }),
      this.getTopUsers(10),
      this.getUserGrowthData(startDate, endDate)
    ]);

    const retentionRate = totalUsers > 0
      ? ((activeUsers / totalUsers) * 100).toFixed(2)
      : '0.00';

    return {
      totalUsers,
      newUsers,
      activeUsers,
      bannedUsers,
      retentionRate: parseFloat(retentionRate),
      topUsers,
      userGrowth
    };
  }

  static async getPrizesAnalytics(period: string) {
    const { startDate, endDate } = this.parseTimeframe(period);

    const [totalPrizes, activePrizes, claimsByCategory, topPrizes] = await Promise.all([
      Prize.countDocuments(),
      Prize.countDocuments({ isActive: true }),
      this.getClaimsByCategory(startDate, endDate),
      this.getTopPrizes(startDate, endDate, 10)
    ]);

    const totalClaims = await Claim.countDocuments({
      claimedAt: { $gte: startDate, $lte: endDate }
    });

    return {
      totalPrizes,
      activePrizes,
      totalClaims,
      claimsByCategory,
      topPrizes
    };
  }

  static async getBusinessAnalytics(period: string) {
    const { startDate, endDate } = this.parseTimeframe(period);

    const [totalRedemptions, revenueByPartner, redemptionTrend] = await Promise.all([
      Redemption.countDocuments({ redeemedAt: { $gte: startDate, $lte: endDate } }),
      this.getRevenueByPartner(startDate, endDate),
      this.getRedemptionTrend(startDate, endDate)
    ]);

    const totalRevenue = await Redemption.aggregate([
      { $match: { redeemedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: null, total: { $sum: '$pointsSpent' } } }
    ]);

    return {
      totalRedemptions,
      totalRevenue: totalRevenue[0]?.total || 0,
      revenueByPartner,
      redemptionTrend
    };
  }

  static async getHeatmapData(period: string) {
    const { startDate, endDate } = this.parseTimeframe(period);

    const claims = await Claim.find({
      claimedAt: { $gte: startDate, $lte: endDate },
      'location.coordinates': { $exists: true }
    }).select('location claimedAt').lean();

    return claims.map(claim => {
      const claimWithLocation = claim as { location?: { coordinates?: number[] }; claimedAt?: Date };
      return {
        lat: claimWithLocation.location?.coordinates?.[1] || 0,
        lng: claimWithLocation.location?.coordinates?.[0] || 0,
        weight: 1,
        timestamp: claim.claimedAt
      };
    });
  }

  static async getRealTimeStats() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get real-time metrics from Redis via MetricsService
    const realTimeMetrics = await MetricsService.getRealTimeMetrics();

    // Aggregate DB stats for longer periods
    const [
      totalUsers,
      totalClaims, // Add total claims (all time)
      new24h,
      claims24h,
      pointsData,
      claimsLastHour
    ] = await Promise.all([
      User.countDocuments(),
      Claim.countDocuments(), // Check all time claims
      User.countDocuments({ createdAt: { $gte: twentyFourHoursAgo } }),
      Claim.countDocuments({ claimedAt: { $gte: twentyFourHoursAgo } }),
      Claim.aggregate([
        { $match: { claimedAt: { $gte: twentyFourHoursAgo } } },
        { $group: { _id: null, total: { $sum: '$pointsAwarded' } } }
      ]),
      Claim.countDocuments({ claimedAt: { $gte: oneHourAgo } })
    ]);

    // Use MetricsService or DB fallbacks
    return {
      activePlayers: (realTimeMetrics.business as any).activeUsers || 0, // Users active in last 15m (from Redis)
      active24h: (realTimeMetrics.business as any).dailyActiveUsers || 0,
      totalUsers,
      new24h,
      claims24h,
      claimsLastHour,
      points24h: pointsData[0]?.total || 0,
      prizesDistributed: totalClaims, // Map to all-time claims
      systemHealth: {
        cpu: (realTimeMetrics.system as any).cpuUsage?.user || 0,
        memory: (realTimeMetrics.system as any).memoryUsage?.heapUsed || 0,
        uptime: (realTimeMetrics.system as any).uptime || 0
      },
      unity: (realTimeMetrics as any).unity || {}
    };
  }

  private static async getUserGrowthData(startDate: Date, endDate: Date) {
    return User.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', count: 1, _id: 0 } }
    ]);
  }

  private static async getClaimsByCategory(startDate: Date, endDate: Date) {
    return Claim.aggregate([
      { $match: { claimedAt: { $gte: startDate, $lte: endDate } } },
      {
        $lookup: {
          from: 'prizes',
          localField: 'prizeId',
          foreignField: '_id',
          as: 'prize'
        }
      },
      { $unwind: { path: '$prize', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$prize.category',
          count: { $sum: 1 }
        }
      },
      { $project: { category: '$_id', count: 1, _id: 0 } }
    ]);
  }

  private static async getTopUsers(limit: number) {
    return User.find()
      .sort({ 'points.total': -1 })
      .limit(limit)
      .select('displayName email points stats.totalClaims avatar')
      .lean();
  }

  private static async getTopPrizes(startDate: Date, endDate: Date, limit: number) {
    return Claim.aggregate([
      { $match: { claimedAt: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: '$prizeId', claimCount: { $sum: 1 } } },
      { $sort: { claimCount: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'prizes',
          localField: '_id',
          foreignField: '_id',
          as: 'prize'
        }
      },
      { $unwind: '$prize' },
      {
        $project: {
          _id: 0,
          prizeId: '$_id',
          name: '$prize.name',
          category: '$prize.category',
          claimCount: 1
        }
      }
    ]);
  }

  private static async getRevenueByPartner(startDate: Date, endDate: Date) {
    return Redemption.aggregate([
      { $match: { redeemedAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: '$partnerId',
          totalRevenue: { $sum: '$pointsSpent' },
          redemptionCount: { $sum: 1 }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);
  }

  private static async getRedemptionTrend(startDate: Date, endDate: Date) {
    return Redemption.aggregate([
      { $match: { redeemedAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$redeemedAt' } },
          count: { $sum: 1 },
          revenue: { $sum: '$pointsSpent' }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', count: 1, revenue: 1, _id: 0 } }
    ]);
  }

  private static async getDailyActivityData(startDate: Date, endDate: Date) {
    // Get claims data by day
    const claimsData = await Claim.aggregate([
      { $match: { claimedAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$claimedAt' } },
          claims: { $sum: 1 },
          points: { $sum: '$pointsAwarded' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get redemptions data by day
    const redemptionsData = await Redemption.aggregate([
      { $match: { redeemedAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$redeemedAt' } },
          redemptions: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Create a map of dates with all data
    const dateMap = new Map<string, { date: string; claims: number; redemptions: number; points: number }>();

    // Initialize dates in range
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      dateMap.set(dateStr, { date: dateStr, claims: 0, redemptions: 0, points: 0 });
      current.setDate(current.getDate() + 1);
    }

    // Merge claims data
    for (const item of claimsData) {
      const existing = dateMap.get(item._id) || { date: item._id, claims: 0, redemptions: 0, points: 0 };
      existing.claims = item.claims;
      existing.points = item.points || 0;
      dateMap.set(item._id, existing);
    }

    // Merge redemptions data
    for (const item of redemptionsData) {
      const existing = dateMap.get(item._id) || { date: item._id, claims: 0, redemptions: 0, points: 0 };
      existing.redemptions = item.redemptions;
      dateMap.set(item._id, existing);
    }

    // Convert map to sorted array (uses "captures" key for frontend compatibility)
    return Array.from(dateMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        date: d.date,
        captures: d.claims,
        redemptions: d.redemptions,
        points: d.points
      }));
  }

  private static parseTimeframe(period: string): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case '24h':
      case 'day':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
      case 'month':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
      case 'year':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    return { startDate, endDate };
  }
}

export default AdminAnalyticsService;
