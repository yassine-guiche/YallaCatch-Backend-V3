import { Types } from 'mongoose';
import { Claim } from '@/models/Claim';
import { Redemption } from '@/models/Redemption';
import AdMobView from '@/models/AdMobView';
import { Code } from '@/models/Code';
import { AuditLog } from '@/models/AuditLog';
import { UserAchievement } from '@/models/UserAchievement';
import { AchievementRewardType } from '@/models/Achievement';
import { typedLogger } from '@/lib/typed-logger';
import { Metadata } from '@/types';

export type PointsHistoryEntryType =
  | 'CLAIM'
  | 'REDEMPTION'
  | 'ADMOB'
  | 'PROMO_CODE'
  | 'ADMIN_ADJUST'
  | 'ACHIEVEMENT';

export type PointsHistoryFilter =
  | 'all'
  | 'credit'
  | 'debit'
  | 'achievement'
  | 'claim';

export interface PointsHistoryEntry {
  id: string;
  type: PointsHistoryEntryType;
  amount: number;
  direction: 'credit' | 'debit';
  source: string;
  description: string;
  occurredAt: Date;
  metadata?: Metadata;
}

interface PointsHistoryOptions {
  page?: number;
  limit?: number;
  includeZero?: boolean;
  filter?: PointsHistoryFilter;
}

type PrizeSummary = {
  _id?: Types.ObjectId;
  name?: string;
  category?: string;
};

type RewardSummary = {
  _id?: Types.ObjectId;
  name?: string;
  category?: string;
  pointsCost?: number;
};

type CodeSummary = {
  code?: string;
};

type ClaimLean = {
  _id: Types.ObjectId;
  pointsAwarded?: number;
  claimedAt?: Date;
  createdAt?: Date;
  prizeId?: Types.ObjectId | PrizeSummary;
};

type RedemptionLean = {
  _id: Types.ObjectId;
  pointsSpent?: number;
  metadata?: Metadata;
  redeemedAt?: Date;
  createdAt?: Date;
  rewardId?: Types.ObjectId | RewardSummary;
  status?: string;
  codeId?: Types.ObjectId | CodeSummary;
};

type AdMobViewLean = {
  _id: Types.ObjectId;
  rewardAmount?: number;
  rewardedAt?: Date;
  viewedAt?: Date;
  createdAt?: Date;
  adType?: string;
  adUnitId?: string;
  revenue?: number;
};

type CodeLean = {
  _id: Types.ObjectId;
  pointsValue?: number;
  usedAt?: Date;
  updatedAt?: Date;
  createdAt?: Date;
  code: string;
  poolName?: string;
};

type AuditLogLean = {
  _id: Types.ObjectId;
  metadata?: Metadata;
  description?: string;
  timestamp?: Date;
  createdAt?: Date;
  userId?: Types.ObjectId;
};

type AchievementLean = {
  _id?: Types.ObjectId;
  name?: string;
  category?: string;
  rewards?: AchievementReward[];
};

type UserAchievementLean = {
  _id: Types.ObjectId;
  achievementId?: Types.ObjectId | AchievementLean;
  unlockedAt?: Date;
  updatedAt?: Date;
  createdAt?: Date;
};

const isPrizeSummary = (value: Types.ObjectId | PrizeSummary | undefined): value is PrizeSummary =>
  typeof value === 'object' && value !== null && !('toHexString' in value);

const isRewardSummary = (value: Types.ObjectId | RewardSummary | undefined): value is RewardSummary =>
  typeof value === 'object' && value !== null && !('toHexString' in value);

const isCodeSummary = (value: Types.ObjectId | CodeSummary | undefined): value is CodeSummary =>
  typeof value === 'object' && value !== null && !('toHexString' in value);

const isAchievementSummary = (
  value: Types.ObjectId | AchievementLean | undefined
): value is AchievementLean => typeof value === 'object' && value !== null && !('toHexString' in value);

type AchievementReward = {
  type: AchievementRewardType;
  value: unknown;
  description?: string;
};

const isPointsReward = (
  reward: AchievementReward
): reward is AchievementReward & { value: number } =>
  reward.type === AchievementRewardType.POINTS && typeof reward.value === 'number';

export class PointsHistoryService {
  static async getUserHistory(userId: string, options: PointsHistoryOptions = {
    // Empty block
  }) {
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.min(100, Math.max(1, Number(options.limit || 50)));
    const includeZero = options.includeZero === true;
    const filter: PointsHistoryFilter = options.filter || 'all';
    const fetchCount = limit * page;
    const truncated = false;

    const userObjectId = new Types.ObjectId(userId);

    try {
      const adViewMatch = {
        userId: userObjectId,
        ...(includeZero ? {
    // Empty block
  } : { rewardAmount: { $ne: 0 } }),
      };
      const adjustmentMatch = {
        action: { $in: ['POINTS_ADDED', 'POINTS_DEDUCTED'] },
        resource: 'user',
        $or: [
          { resourceId: userId },
          { 'metadata.targetUserId': userId },
        ],
        ...(includeZero ? {
    // Empty block
  } : { 'metadata.points': { $ne: 0 } }),
      };

      const [
        claims,
        redemptions,
        adViews,
        codes,
        adjustments,
        achievements,
        claimCount,
        redemptionCount,
        codeCount,
        adViewCountsAgg,
        adjustmentCountsAgg,
        achievementCountAgg,
      ] = await Promise.all([
        Claim.find({ userId: userObjectId, status: { $ne: 'rejected' } })
          .populate('prizeId', 'name category points')
          .sort({ claimedAt: -1 })
          .limit(fetchCount)
          .lean<ClaimLean[]>(),
        Redemption.find({ userId: userObjectId })
          .populate('rewardId', 'name category pointsCost')
          .populate('codeId', 'code')
          .sort({ redeemedAt: -1 })
          .limit(fetchCount)
          .lean<RedemptionLean[]>(),
        AdMobView.find(adViewMatch)
          .sort({ viewedAt: -1 })
          .limit(fetchCount)
          .lean<AdMobViewLean[]>(),
        Code.find({
          usedBy: userObjectId,
          pointsValue: { $gt: 0 },
        })
          .sort({ usedAt: -1 })
          .limit(fetchCount)
          .lean<CodeLean[]>(),
        AuditLog.find(adjustmentMatch)
          .sort({ timestamp: -1 })
          .limit(fetchCount)
          .lean<AuditLogLean[]>(),
        UserAchievement.find({ userId: userObjectId, unlockedAt: { $exists: true } })
          .populate('achievementId', 'name rewards category')
          .sort({ unlockedAt: -1 })
          .limit(fetchCount)
          .lean<UserAchievementLean[]>(),
        Claim.countDocuments({ userId: userObjectId, status: { $ne: 'rejected' } }),
        Redemption.countDocuments({ userId: userObjectId }),
        Code.countDocuments({
          usedBy: userObjectId,
          pointsValue: { $gt: 0 },
        }),
        AdMobView.aggregate<Array<Record<string, number>>>([
          { $match: adViewMatch },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              positive: {
                $sum: {
                  $cond: [{ $gt: ['$rewardAmount', 0] }, 1, 0],
                },
              },
              negative: {
                $sum: {
                  $cond: [{ $lt: ['$rewardAmount', 0] }, 1, 0],
                },
              },
            },
          },
        ]),
        AuditLog.aggregate<Array<Record<string, number>>>([
          { $match: adjustmentMatch },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              positive: {
                $sum: {
                  $cond: [{ $gt: ['$metadata.points', 0] }, 1, 0],
                },
              },
              negative: {
                $sum: {
                  $cond: [{ $lt: ['$metadata.points', 0] }, 1, 0],
                },
              },
            },
          },
        ]),
        UserAchievement.aggregate<Array<Record<string, number>>>([
          { $match: { userId: userObjectId, unlockedAt: { $exists: true } } },
          {
            $lookup: {
              from: 'achievements',
              localField: 'achievementId',
              foreignField: '_id',
              as: 'achievement',
            },
          },
          { $unwind: '$achievement' },
          {
            $match: {
              'achievement.rewards': {
                $elemMatch: {
                  type: AchievementRewardType.POINTS,
                  value: { $gt: 0 },
                },
              },
            },
          },
          { $count: 'total' },
        ]),
      ] as const);

      const claimEntries: PointsHistoryEntry[] = claims.map((claim) => {
        const prize = isPrizeSummary(claim.prizeId) ? claim.prizeId : undefined;
        return {
          id: claim._id.toString(),
        type: 'CLAIM',
        amount: claim.pointsAwarded || 0,
        direction: 'credit',
        source: 'claim',
          description: `Prize claim: ${prize?.name || 'Unknown prize'}`,
        occurredAt: claim.claimedAt ?? claim.createdAt ?? new Date(),
        metadata: {
            prizeId: prize?._id || claim.prizeId,
          category: prize?.category,
        },
        };
      });

      const redemptionEntries: PointsHistoryEntry[] = redemptions.map((redemption) => {
        const reward = isRewardSummary(redemption.rewardId) ? redemption.rewardId : undefined;
        const code = isCodeSummary(redemption.codeId) ? redemption.codeId : undefined;
        const source = redemption.metadata && typeof redemption.metadata === 'object'
          ? (redemption.metadata as Metadata).source
          : undefined;
        return {
          id: redemption._id.toString(),
        type: 'REDEMPTION',
        amount: -Math.abs(redemption.pointsSpent || 0),
        direction: 'debit',
          source: typeof source === 'string' ? source : 'reward',
          description: `Redeemed reward: ${reward?.name || 'Reward'}`,
        occurredAt: redemption.redeemedAt ?? redemption.createdAt ?? new Date(),
        metadata: {
            rewardId: reward?._id || redemption.rewardId,
            category: reward?.category,
          status: redemption.status,
            code: code?.code,
        },
        };
      });

      const adViewEntries: PointsHistoryEntry[] = adViews.map((view) => ({
        id: view._id.toString(),
        type: 'ADMOB',
        amount: view.rewardAmount || 0,
        direction: view.rewardAmount >= 0 ? 'credit' : 'debit',
        source: 'admob',
        description: `AdMob ${view.adType} reward`,
        occurredAt: view.rewardedAt ?? view.viewedAt ?? view.createdAt ?? new Date(),
        metadata: {
          adType: view.adType,
          adUnitId: view.adUnitId,
          revenue: view.revenue,
        },
      }));

      const codeEntries: PointsHistoryEntry[] = codes.map((code) => ({
        id: code._id.toString(),
        type: 'PROMO_CODE',
        amount: code.pointsValue || 0,
        direction: 'credit',
        source: 'promo_code',
        description: `Promo code redeemed: ${code.code}`,
        occurredAt: code.usedAt ?? code.updatedAt ?? code.createdAt ?? new Date(),
        metadata: {
          code: code.code,
          poolName: code.poolName,
        },
      }));

      const adjustmentEntries: PointsHistoryEntry[] = adjustments.map((log) => {
        const pointsValue = typeof log.metadata?.points === 'number' ? log.metadata.points : 0;
        return {
          id: log._id.toString(),
        type: 'ADMIN_ADJUST',
          amount: pointsValue,
          direction: pointsValue >= 0 ? 'credit' : 'debit',
        source: 'admin',
        description: log.description || 'Admin point adjustment',
        occurredAt: log.timestamp ?? log.createdAt ?? new Date(),
        metadata: {
            reason: log.metadata?.reason,
          adminId: log.userId,
        },
        };
      });

      const achievementEntries: PointsHistoryEntry[] = achievements
        .map((entry) => {
          const achievement = isAchievementSummary(entry.achievementId) ? entry.achievementId : undefined;
          const rewards = Array.isArray(achievement?.rewards) ? achievement.rewards : [];
          const pointsReward = rewards
            .filter(isPointsReward)
            .reduce((sum, reward) => sum + reward.value, 0);

          // Ensure direction is always 'credit' | 'debit' (never string)
          let direction: 'credit' | 'debit' = 'credit';
          if (typeof pointsReward === 'number' && pointsReward < 0) {
            direction = 'debit';
          }

          return {
            id: entry._id.toString(),
            type: 'ACHIEVEMENT' as PointsHistoryEntryType,
            amount: pointsReward,
            direction,
            source: 'achievement',
            description: `Achievement unlocked: ${achievement?.name || 'Unknown achievement'}`,
            occurredAt: entry.unlockedAt ?? entry.updatedAt ?? entry.createdAt ?? new Date(),
            metadata: {
              achievementId: achievement?._id || entry.achievementId,
              category: achievement?.category,
              rewardPoints: pointsReward,
            },
          };
        })
        .filter((entry) => includeZero || entry.amount !== 0);

      const items = [
        ...claimEntries,
        ...redemptionEntries,
        ...adViewEntries,
        ...codeEntries,
        ...adjustmentEntries,
        ...achievementEntries,
      ].filter((entry) => includeZero || entry.amount !== 0);

      const filteredItems = filter === 'all'
        ? items
        : items.filter((entry) => {
            if (filter === 'credit') return entry.direction === 'credit';
            if (filter === 'debit') return entry.direction === 'debit';
            if (filter === 'achievement') return entry.type === 'ACHIEVEMENT';
            if (filter === 'claim') return entry.type === 'CLAIM';
            return true;
          });

      filteredItems.sort((a, b) => {
        const aTime = new Date(a.occurredAt).getTime();
        const bTime = new Date(b.occurredAt).getTime();
        return bTime - aTime;
      });

      const adViewCounts =
        (adViewCountsAgg?.[0] as { total?: number; positive?: number; negative?: number } | undefined) || {
    // Empty block
  };
      const adjustmentCounts =
        (adjustmentCountsAgg?.[0] as { total?: number; positive?: number; negative?: number } | undefined) || {
    // Empty block
  };
      const adViewCount = Number(adViewCounts.total || 0);
      const adViewCreditCount = Number(adViewCounts.positive || 0);
      const adViewDebitCount = Number(adViewCounts.negative || 0);
      const adjustmentCount = Number(adjustmentCounts.total || 0);
      const adjustmentCreditCount = Number(adjustmentCounts.positive || 0);
      const adjustmentDebitCount = Number(adjustmentCounts.negative || 0);

      const achievementCounts = achievementCountAgg?.[0] as { total?: number } | undefined;
      const achievementCount = Number(achievementCounts?.total || 0);
      const totalAll = claimCount + redemptionCount + adViewCount + codeCount + adjustmentCount + achievementCount;
      const total = (() => {
        if (filter === 'claim') return claimCount;
        if (filter === 'achievement') return achievementCount;
        if (filter === 'credit') {
          return claimCount + codeCount + achievementCount + adViewCreditCount + adjustmentCreditCount;
        }
        if (filter === 'debit') {
          return redemptionCount + adViewDebitCount + adjustmentDebitCount;
        }
        return totalAll;
      })();
      const start = (page - 1) * limit;
      const pagedItems = filteredItems.slice(start, start + limit);

      return {
        items: pagedItems,
        pagination: {
          page,
          limit,
          total,
          pages: Math.max(1, Math.ceil(total / limit)),
          hasMore: start + pagedItems.length < total,
          truncated,
        },
      };
    } catch (error) {
      typedLogger.error('Points history error', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      throw error;
    }
  }
}
