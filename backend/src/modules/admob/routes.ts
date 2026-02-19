import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import mongoose, { Types } from 'mongoose';
import AdMobView from '../../models/AdMobView';
import User from '../../models/User';
import { typedLogger } from '../../lib/typed-logger';
import { redisClient } from '../../config/redis';
import { authenticate } from '../../middleware/auth';
import { getAdmobConfig } from './config';

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
          // Original data (consumed by admin panel)
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
          },
          // Unity AdMobConfigResponse shape
          rewardedAd: {
            unitId: process.env.ADMOB_REWARDED_UNIT_ID || '',
            enabled: canWatchRewarded,
            cooldownSeconds: config.rewardedCooldown,
          },
          interstitialAd: {
            unitId: process.env.ADMOB_INTERSTITIAL_UNIT_ID || '',
            enabled: canWatchInterstitial,
            cooldownSeconds: config.interstitialCooldown,
          },
          bannerAd: {
            unitId: process.env.ADMOB_BANNER_UNIT_ID || '',
            enabled: true,
            cooldownSeconds: 0,
          },
          dailyRewardLimit: config.maxRewardedAdsPerDay,
          rewardPerAd: config.rewardedVideoPoints,
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
          $inc: { 'points.available': rewardAmount, 'points.total': rewardAmount },
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

}
