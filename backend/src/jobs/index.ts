import { logger } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';
import { Analytics } from '@/models/Analytics';
import { Prize } from '@/models/Prize';
import { User } from '@/models/User';
import { Reward } from '@/models/Reward';
import { Claim } from '@/models/Claim';
import { Notification } from '@/models/Notification';
import { NotificationStatus } from '@/types';
import notificationsRoutes from '@/modules/notifications/index';
import { NotificationService } from '@/modules/notifications';

// Service function to generate daily analytics
async function generateDailyAnalytics() {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    // Gather metrics for the day
    const [
      userMetrics,
      prizeMetrics,
      claimMetrics,
      rewardMetrics
    ] = await Promise.all([
      // User metrics
      User.aggregate([{
        $match: {
          $or: [
            { createdAt: { $gte: startOfDay, $lt: endOfDay } },
            { lastActive: { $gte: startOfDay, $lt: endOfDay } }
          ]
        }
      }, {
        $group: {
          _id: null,
          totalUsers: { $sum: 1 },
          activeUsers: {
            $sum: { $cond: [{ $gte: ['$lastActive', startOfDay] }, 1, 0] }
          }
        }
      }]),

      // Prize metrics
      Prize.aggregate([{
        $match: { createdAt: { $gte: startOfDay, $lt: endOfDay } }
      }, {
        $group: { _id: null, totalPrizes: { $sum: 1 } }
      }]),

      // Claim metrics
      Claim.aggregate([{
        $match: { claimedAt: { $gte: startOfDay, $lt: endOfDay } }
      }, {
        $group: {
          _id: null,
          totalClaims: { $sum: 1 },
          totalPoints: { $sum: '$pointsAwarded' }
        }
      }]),

      // Reward metrics
      Reward.aggregate([{
        $match: { createdAt: { $gte: startOfDay, $lt: endOfDay } }
      }, {
        $group: { _id: null, totalRewards: { $sum: 1 } }
      }])
    ]);

    // Prepare the analytics data
    const analyticsData = {
      date: startOfDay,
      metrics: {
        totalUsers: userMetrics[0]?.totalUsers || 0,
        activeUsers: userMetrics[0]?.activeUsers || 0,
        newUsers: userMetrics[0]?.totalUsers || 0,
        totalPrizes: prizeMetrics[0]?.totalPrizes || 0,
        claimedPrizes: claimMetrics[0]?.totalClaims || 0,
        totalRewards: rewardMetrics[0]?.totalRewards || 0,
        redeemedRewards: 0, // Would need redemption aggregation
        totalPoints: claimMetrics[0]?.totalPoints || 0,
        averageSessionTime: 0, // Would need session data
        retentionRate: 0,
        conversionRate: 0,
      },
      generatedAt: new Date(),
    };

    // Save or update the analytics record
    const existingRecord = await Analytics.findOne({ date: startOfDay });
    if (existingRecord) {
      Object.assign(existingRecord, analyticsData);
      await existingRecord.save();
    } else {
      await Analytics.create(analyticsData);
    }

    typedLogger.info('Daily analytics generated', { date: startOfDay.toISOString() });
    return analyticsData;
  } catch (error) {
    typedLogger.error('Error generating daily analytics', { error: (error as any).message });
    throw error;
  }
}

export async function startScheduledJobs() {
  try {
    // Start daily analytics job
    setInterval(async () => {
      try {
        await generateDailyAnalytics();
        typedLogger.info('Daily analytics generated');
      } catch (error) {
        typedLogger.error('Daily analytics job error', { error: (error as any).message });
      }
    }, 24 * 60 * 60 * 1000); // Every 24 hours

    // Start expired prizes cleanup job
    setInterval(async () => {
      try {
        const result = await Prize.deleteMany({
          expiresAt: { $lt: new Date() },
          status: 'active'
        });
        
        if (result.deletedCount > 0) {
          typedLogger.info('Expired prizes cleaned up', { count: result.deletedCount });
        }
      } catch (error) {
        typedLogger.error('Expired prizes cleanup job error', { error: (error as any).message });
      }
    }, 60 * 60 * 1000); // Every hour

    // Start ban expiry check job
    setInterval(async () => {
      try {
        const result = await User.updateMany(
          {
            isBanned: true,
            banExpiresAt: { $lt: new Date() }
          },
          {
            $unset: { banExpiresAt: 1, banReason: 1 },
            $set: { isBanned: false }
          }
        );
        
        if (result.modifiedCount > 0) {
          typedLogger.info('Expired bans lifted', { count: result.modifiedCount });
        }
      } catch (error) {
        typedLogger.error('Ban expiry check job error', { error: (error as any).message });
      }
    }, 60 * 60 * 1000); // Every hour

    typedLogger.info('Scheduled jobs started');
  } catch (error) {
    typedLogger.error('Failed to start scheduled jobs', { error: (error as any).message });
    throw error;
  }
}

// Process scheduled notifications every minute
setInterval(async () => {
  try {
    const now = new Date();
    const due = await Notification.find({ status: NotificationStatus.SCHEDULED, scheduledFor: { $lte: now } });
    for (const n of due) {
      try {
        await (NotificationService as any).processNotification(n);
        n.status = NotificationStatus.SENT as any;
        (n as any).sentAt = new Date();
        await n.save();
      } catch (err: any) {
        (n as any).status = NotificationStatus.FAILED as any;
        await n.save();
        typedLogger.error('Scheduled notification send failed', { id: n._id, error: err.message });
      }
    }
  } catch (err: any) {
    typedLogger.error('Scheduled notifications job error', { error: err.message });
  }
}, 60 * 1000);
