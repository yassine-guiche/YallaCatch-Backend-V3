import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import mongoose from 'mongoose';
import { Types } from 'mongoose';
import { z } from 'zod';
import AdMobView from '../../models/AdMobView';
import User from '../../models/User';
import { typedLogger } from '../../lib/typed-logger';
import { redisClient } from '../../config/redis';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { Settings } from '../../models/Settings';

// Default AdMob configuration (camelCase)
const DEFAULT_ADMOB_CONFIG = {
  maxRewardedAdsPerDay: 10,
  maxInterstitialAdsPerDay: 20,
  rewardedVideoPoints: 100,
  interstitialPoints: 20,
  rewardedVideoEcpm: 8.0, // $8 per 1000 views
  interstitialEcpm: 3.0, // $3 per 1000 views
  bannerEcpm: 0.5, // $0.50 per 1000 impressions
  rewardedCooldown: 300, // seconds
  interstitialCooldown: 180, // seconds
};

const AD_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let admobConfigCache = { ...DEFAULT_ADMOB_CONFIG };
let admobConfigFetchedAt = 0;

const AdmobConfigSchema = z.object({
  // maxRewardedAdsPerDay: Min 0 allows disabling rewarded ads; default 10 means at most 10 per day
  maxRewardedAdsPerDay: z.number().int().min(0, { message: 'maxRewardedAdsPerDay must be 0 or greater (0 to disable)' }).optional(),
  // maxInterstitialAdsPerDay: Min 0 allows disabling interstitials; default 20 means at most 20 per day
  maxInterstitialAdsPerDay: z.number().int().min(0, { message: 'maxInterstitialAdsPerDay must be 0 or greater (0 to disable)' }).optional(),
  // Points awarded per rewarded video watched (can be 0 for no reward)
  rewardedVideoPoints: z.number().int().nonnegative({ message: 'rewardedVideoPoints must be 0 or greater' }).optional(),
  // Points awarded per interstitial watched (can be 0 for no reward)
  interstitialPoints: z.number().int().nonnegative({ message: 'interstitialPoints must be 0 or greater' }).optional(),
  // Effective cost per mille (revenue per 1000 views) - must be non-negative
  rewardedVideoEcpm: z.number().nonnegative({ message: 'rewardedVideoEcpm must be 0 or greater (e.g., 8.0 for $8/1000 views)' }).optional(),
  interstitialEcpm: z.number().nonnegative({ message: 'interstitialEcpm must be 0 or greater (e.g., 3.0 for $3/1000 views)' }).optional(),
  bannerEcpm: z.number().nonnegative({ message: 'bannerEcpm must be 0 or greater (e.g., 0.5 for $0.50/1000 impressions)' }).optional(),
  // Cooldown in seconds before user can watch next ad (0 = no cooldown)
  rewardedCooldown: z.number().int().nonnegative({ message: 'rewardedCooldown must be 0 or greater (in seconds)' }).optional(),
  interstitialCooldown: z.number().int().nonnegative({ message: 'interstitialCooldown must be 0 or greater (in seconds)' }).optional(),
});

const normalizeConfig = (cfg: any) => {
  if (!cfg) return { ...DEFAULT_ADMOB_CONFIG };
  // Accept legacy UPPER_SNAKE keys while normalizing to camelCase
  return {
    maxRewardedAdsPerDay: cfg.maxRewardedAdsPerDay ?? cfg.MAX_REWARDED_ADS_PER_DAY ?? DEFAULT_ADMOB_CONFIG.maxRewardedAdsPerDay,
    maxInterstitialAdsPerDay: cfg.maxInterstitialAdsPerDay ?? cfg.MAX_INTERSTITIAL_ADS_PER_DAY ?? DEFAULT_ADMOB_CONFIG.maxInterstitialAdsPerDay,
    rewardedVideoPoints: cfg.rewardedVideoPoints ?? cfg.REWARDED_VIDEO_POINTS ?? DEFAULT_ADMOB_CONFIG.rewardedVideoPoints,
    interstitialPoints: cfg.interstitialPoints ?? cfg.INTERSTITIAL_POINTS ?? DEFAULT_ADMOB_CONFIG.interstitialPoints,
    rewardedVideoEcpm: cfg.rewardedVideoEcpm ?? cfg.REWARDED_VIDEO_ECPM ?? DEFAULT_ADMOB_CONFIG.rewardedVideoEcpm,
    interstitialEcpm: cfg.interstitialEcpm ?? cfg.INTERSTITIAL_ECPM ?? DEFAULT_ADMOB_CONFIG.interstitialEcpm,
    bannerEcpm: cfg.bannerEcpm ?? cfg.BANNER_ECPM ?? DEFAULT_ADMOB_CONFIG.bannerEcpm,
    rewardedCooldown: cfg.rewardedCooldown ?? cfg.REWARDED_COOLDOWN ?? DEFAULT_ADMOB_CONFIG.rewardedCooldown,
    interstitialCooldown: cfg.interstitialCooldown ?? cfg.INTERSTITIAL_COOLDOWN ?? DEFAULT_ADMOB_CONFIG.interstitialCooldown,
  };
};

async function getAdmobConfig(): Promise<typeof DEFAULT_ADMOB_CONFIG> {
  const now = Date.now();
  if (now - admobConfigFetchedAt < AD_CONFIG_CACHE_TTL && admobConfigCache) {
    return admobConfigCache;
  }

  try {
    const settings = await Settings.findOne({}, { 'custom.admob': 1 }).lean();
    const cfg = (settings as any)?.custom?.get?.('admob') || (settings as any)?.custom?.admob;
    if (cfg) {
      admobConfigCache = normalizeConfig(cfg);
      admobConfigFetchedAt = now;
      return admobConfigCache;
    }

    // No config stored yet: persist defaults once
    await Settings.findOneAndUpdate(
      {},
      { $set: { 'custom.admob': DEFAULT_ADMOB_CONFIG, updatedBy: 'system' } },
      { upsert: true }
    );
    admobConfigCache = { ...DEFAULT_ADMOB_CONFIG };
    admobConfigFetchedAt = now;
    return admobConfigCache;
  } catch (error) {
    typedLogger.warn('AdMob settings load failed, using defaults', { error: (error as any).message });
    admobConfigCache = { ...DEFAULT_ADMOB_CONFIG };
    admobConfigFetchedAt = now;
    return admobConfigCache;
  }
}

async function saveAdmobConfig(update: Partial<typeof DEFAULT_ADMOB_CONFIG>, adminId: string) {
  const current = await getAdmobConfig();
  const merged = { ...current, ...update };
  await Settings.findOneAndUpdate(
    {},
    { $set: { 'custom.admob': merged, updatedBy: adminId } },
    { upsert: true }
  );
  admobConfigCache = merged;
  admobConfigFetchedAt = Date.now();
  return merged;
}

interface AdMobRequestBody {
  adType: 'rewarded' | 'interstitial' | 'banner';
  adUnitId: string;
  completed: boolean;
  deviceInfo?: {
    platform: string;
    version: string;
    model?: string;
  };
  location?: {
    city?: string;
    country?: string;
  };
  metadata?: {
    sessionId?: string;
    placementId?: string;
  };
}

export default async function admobRoutes(fastify: FastifyInstance) {
  // Check if user can watch an ad
  fastify.get('/available', {
    preHandler: [authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = await getAdmobConfig();
      const userId = request.user.sub;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Count ads watched today
      const [rewardedCount, interstitialCount] = await Promise.all([
        AdMobView.countDocuments({
          userId,
          adType: 'rewarded',
          completed: true,
          viewedAt: { $gte: today }
        }),
        AdMobView.countDocuments({
          userId,
          adType: 'interstitial',
          completed: true,
          viewedAt: { $gte: today }
        })
      ]);

      // Check cooldowns
      const rewardedCooldownKey = `admob:cooldown:rewarded:${userId}`;
      const interstitialCooldownKey = `admob:cooldown:interstitial:${userId}`;

      const [rewardedCooldown, interstitialCooldown] = await Promise.all([
        redisClient.get(rewardedCooldownKey),
        redisClient.get(interstitialCooldownKey)
      ]);

      const canWatchRewarded = rewardedCount < config.maxRewardedAdsPerDay && !rewardedCooldown;
      const canWatchInterstitial = interstitialCount < config.maxInterstitialAdsPerDay && !interstitialCooldown;

      return reply.send({
        success: true,
        data: {
          rewarded: {
            available: canWatchRewarded,
            remaining: Math.max(0, config.maxRewardedAdsPerDay - rewardedCount),
            cooldownSeconds: rewardedCooldown ? parseInt(rewardedCooldown) : 0,
            rewardAmount: config.rewardedVideoPoints
          },
          interstitial: {
            available: canWatchInterstitial,
            remaining: Math.max(0, config.maxInterstitialAdsPerDay - interstitialCount),
            cooldownSeconds: interstitialCooldown ? parseInt(interstitialCooldown) : 0,
            rewardAmount: config.interstitialPoints
          },
          todayStats: {
            rewardedWatched: rewardedCount,
            interstitialWatched: interstitialCount
          }
        }
      });
    } catch (error) {
      typedLogger.error('Error checking ad availability:', { error: (error as any).message });
      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to check ad availability'
      });
    }
  });

  // Record ad view and give reward
  fastify.post('/reward', {
    preHandler: [authenticate]
  }, async (request: FastifyRequest<{ Body: AdMobRequestBody }>, reply: FastifyReply) => {
    try {
      const config = await getAdmobConfig();
      const userId = request.user.sub;
      const { adType, adUnitId, completed, deviceInfo, location, metadata } = request.body;

      // Validate ad type
      if (!['rewarded', 'interstitial'].includes(adType)) {
        return reply.status(400).send({
          success: false,
          error: 'INVALID_AD_TYPE',
          message: 'Only rewarded and interstitial ads can give rewards'
        });
      }

      // Check if ad was completed
      if (!completed) {
        return reply.status(400).send({
          success: false,
          error: 'AD_NOT_COMPLETED',
          message: 'Ad must be completed to receive reward'
        });
      }

      // Check daily limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayCount = await AdMobView.countDocuments({
        userId,
        adType,
        completed: true,
        viewedAt: { $gte: today }
      });

      const maxAds = adType === 'rewarded'
        ? config.maxRewardedAdsPerDay
        : config.maxInterstitialAdsPerDay;

      if (todayCount >= maxAds) {
        return reply.status(429).send({
          success: false,
          error: 'DAILY_LIMIT_REACHED',
          message: `You have reached the daily limit of ${maxAds} ${adType} ads`
        });
      }

      // Check cooldown
      const cooldownKey = `admob:cooldown:${adType}:${userId}`;
      const cooldown = await redisClient.get(cooldownKey);

      if (cooldown) {
        return reply.status(429).send({
          success: false,
          error: 'COOLDOWN_ACTIVE',
          message: `Please wait ${cooldown} seconds before watching another ad`,
          retryAfter: parseInt(cooldown)
        });
      }

      // Calculate reward and revenue
      const rewardAmount = adType === 'rewarded'
        ? config.rewardedVideoPoints
        : config.interstitialPoints;

      const ecpm = adType === 'rewarded'
        ? config.rewardedVideoEcpm
        : config.interstitialEcpm;

      const revenue = ecpm / 1000; // Revenue per view

      // Create ad view record
      const adView = await AdMobView.create({
        userId,
        adType,
        adUnitId,
        rewardAmount,
        rewardType: 'points',
        completed: true,
        revenue,
        ecpm,
        deviceInfo: deviceInfo || { platform: 'unknown', version: 'unknown' },
        location,
        viewedAt: new Date(),
        rewardedAt: new Date(),
        metadata
      });

      // Give reward to user
      const user = await User.findByIdAndUpdate(
        userId,
        {
          $inc: { points: rewardAmount },
          $push: {
            pointsHistory: {
              amount: rewardAmount,
              reason: `AdMob ${adType} video`,
              timestamp: new Date()
            }
          }
        },
        { new: true }
      );

      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'USER_NOT_FOUND'
        });
      }

      // Set cooldown
      const cooldownSeconds = adType === 'rewarded'
        ? config.rewardedCooldown
        : config.interstitialCooldown;

      await redisClient.setex(cooldownKey, cooldownSeconds, cooldownSeconds.toString());

      typedLogger.info(`User ${userId} watched ${adType} ad and earned ${rewardAmount} points`);

      return reply.send({
        success: true,
        data: {
          rewardAmount,
          rewardType: 'points',
          newBalance: user.points,
          adViewId: adView._id,
          cooldownSeconds
        }
      });
    } catch (error) {
      typedLogger.error('Error processing ad reward:', { error: (error as any).message });
      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to process ad reward'
      });
    }
  });

  // Get user's ad stats
  fastify.get('/stats', {
    preHandler: [authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = request.user.sub;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [todayStats, allTimeStats, last7Days] = await Promise.all([
        // Today's stats
        AdMobView.aggregate([
          {
            $match: {
              userId: new Types.ObjectId(userId),
              viewedAt: { $gte: today }
            }
          },
          {
            $group: {
              _id: '$adType',
              count: { $sum: 1 },
              completed: { $sum: { $cond: ['$completed', 1, 0] } },
              totalReward: { $sum: '$rewardAmount' }
            }
          }
        ]),

        // All-time stats
        AdMobView.aggregate([
          {
            $match: {
              userId: new Types.ObjectId(userId)
            }
          },
          {
            $group: {
              _id: null,
              totalViews: { $sum: 1 },
              totalCompleted: { $sum: { $cond: ['$completed', 1, 0] } },
              totalRewards: { $sum: '$rewardAmount' }
            }
          }
        ]),

        // Last 7 days trend
        AdMobView.aggregate([
          {
            $match: {
              userId: new mongoose.Types.ObjectId(userId),
              viewedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            }
          },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$viewedAt' }
              },
              count: { $sum: 1 },
              rewards: { $sum: '$rewardAmount' }
            }
          },
          { $sort: { _id: 1 } }
        ])
      ]);

      return reply.send({
        success: true,
        data: {
          today: todayStats,
          allTime: allTimeStats[0] || { totalViews: 0, totalCompleted: 0, totalRewards: 0 },
          last7Days
        }
      });
    } catch (error) {
      typedLogger.error('Error fetching ad stats:', { error: (error as any).message });
      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch ad stats'
      });
    }
  });

  // Admin: Get AdMob analytics
  fastify.get('/analytics', {
    preHandler: [authenticate, requireAdmin]
  }, async (request: FastifyRequest<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      groupBy?: 'day' | 'week' | 'month';
    }
  }>, reply: FastifyReply) => {
    try {
      const { startDate, endDate, groupBy = 'day' } = request.query;

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

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
                $dateToString: { format: '%Y-%m-%d', date: '$viewedAt' }
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

      return reply.send({
        success: true,
        data: {
          overall: overallStats[0] || {
            totalViews: 0,
            totalCompleted: 0,
            totalRevenue: 0,
            totalRewards: 0,
            avgEcpm: 0
          },
          byAdType: adTypeStats,
          dailyTrend,
          topUsers,
          dateRange: { start, end }
        }
      });
    } catch (error) {
      typedLogger.error('Error fetching AdMob analytics:', { error: (error as any).message });
      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch AdMob analytics'
      });
    }
  });

  // Admin: Update AdMob configuration
  fastify.patch('/config', {
    preHandler: [authenticate, requireAdmin],
    schema: { body: AdmobConfigSchema.partial() }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;
      const parsed = AdmobConfigSchema.partial().parse(body);
      const adminId = (request as any).user?.sub || 'admin';
      const updated = await saveAdmobConfig(parsed, adminId);
      typedLogger.info('AdMob configuration updated by admin', { adminId });
      return reply.send({ success: true, data: updated });
    } catch (error) {
      typedLogger.error('Error updating AdMob config:', { error: (error as any).message });
      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to update AdMob configuration'
      });
    }
  });

  // Admin: Get current configuration
  fastify.get('/config', {
    preHandler: [authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const [config, settings] = await Promise.all([
      getAdmobConfig(),
      Settings.findOne({}, { updatedAt: 1, updatedBy: 1 }).lean()
    ]);
    return reply.send({
      success: true,
      data: {
        ...config,
        updatedAt: settings?.updatedAt?.toISOString?.() || (admobConfigFetchedAt ? new Date(admobConfigFetchedAt).toISOString() : undefined),
        updatedBy: settings?.updatedBy || 'unknown',
      }
    });
  });
}
