import { Types } from 'mongoose';
import { User, Prize, Claim, Distribution } from '@/models';
import { DistributionStatus, PrizeCategory, PrizeRarity, PrizeType, LocationType } from '@/types';
import { PrizeService } from '@/modules/prizes';
import { findNearestCity, clampToTunisia } from '@/utils/geo';
import { typedLogger } from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';

interface DistributionData {
  prizeType?: string;
  title?: string;
  description?: string;
  value?: number;
  points?: number;
  category?: PrizeCategory;
  rarity?: PrizeRarity;
  type?: PrizeType;
  image?: string;
  quantity?: number;
  status?: string;
  location?: { lat?: number; lng?: number; latitude?: number; longitude?: number; city?: string; address?: string };
  radius?: number;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

interface BulkDistributionData {
  prizes?: DistributionData[];
  template?: Record<string, any>;
  locations?: Array<{ latitude: number; longitude: number; city?: string; address?: string; radius?: number }>;
  distributionMode?: string;
  region?: string;
  scheduledAt?: Date;
}

interface AutoDistributionData {
  prizeType?: string;
  totalValue?: number;
  count?: number;
  region?: { center: { lat: number; lng: number }; radius: number };
  densityBased?: boolean;
  duration?: number;
}

interface DistributionAnalytics {
  totalDistributed: number;
  totalClaimed: number;
  totalExpired: number;
  claimRate: number;
  averageClaimTime: number;
  byPrizeType: Record<string, number>;
  byRegion: Record<string, number>;
}

const toPrizePayload = (
  adminId: string,
  payload: DistributionData & { city?: string }
) => {
  const rawLat =
    payload.location?.lat ??
    payload.location?.latitude ??
    36.8065;
  const rawLng =
    payload.location?.lng ??
    payload.location?.longitude ??
    10.1815;

  // Clamp coordinates to Tunisia bounds to prevent out-of-bounds errors
  const clamped = clampToTunisia({ lat: rawLat, lng: rawLng });
  const lat = clamped.lat;
  const lng = clamped.lng;

  const city =
    payload.location?.city ||
    payload.city ||
    findNearestCity({ lat, lng }) ||
    'Tunis';

  const points =
    payload.value ??
    payload.points ??
    payload.metadata?.prizeConfig?.content?.points ??
    payload.metadata?.prizeConfig?.points ??
    1;
  const safePoints = Math.max(1, Number(points) || 1);
  const quantity =
    payload.quantity ??
    payload.metadata?.distribution?.maxClaims ??
    1;

  return {
    name:
      payload.title ||
      payload.metadata?.prizeConfig?.title ||
      payload.prizeType ||
      'Spot Prize',
    description:
      payload.description ||
      payload.metadata?.prizeConfig?.description ||
      'Distribution prize',
    type: (payload.type as PrizeType) || PrizeType.PHYSICAL,
    category:
      (payload.category as PrizeCategory) || PrizeCategory.LIFESTYLE,
    rarity:
      (payload.rarity as PrizeRarity) || PrizeRarity.COMMON,
    points: safePoints,
    quantity,
    status: payload.status || 'active',
    imageUrl:
      payload.image ||
      (payload.metadata as any)?.prizeConfig?.image,
    location: {
      type: LocationType.GPS,
      coordinates: [lng, lat],
      radius: payload.radius ?? 50,
      city,
      address: payload.location?.address,
    },
    metadata: payload.metadata || {},
    createdBy: new Types.ObjectId(adminId),
  } as any;
};

export class DistributionService {
  // Backward-compatible aliases used by some callers/routes
  static placeSinglePrize(adminId: string, body: DistributionData) {
    return this.distributeSinglePrize(adminId, body);
  }

  static bulkDistribute(adminId: string, body: BulkDistributionData) {
    return this.distributeBulkPrizes(adminId, body);
  }

  static autoDistribute(adminId: string, body: AutoDistributionData) {
    return this.autoDistributePrizes(adminId, body);
  }

  static getAnalytics(adminId: string, timeframe: string, range?: { startDate?: string; endDate?: string }) {
    return this.getDistributionAnalytics(adminId, timeframe, range);
  }

  static getSettings() {
    return this.getDistributionSettings();
  }

  static updateSettings(adminId: string, settings: Record<string, unknown>) {
    return this.updateDistributionSettings(adminId, settings);
  }

  // Alias used by routes (placeSinglePrize)
  static async distributeSinglePrize(adminId: string, distributionData: DistributionData) {
    try {
      const prizePayload = toPrizePayload(adminId, distributionData as any);
      const prize = await PrizeService.createPrize(adminId, prizePayload);

      const lat = distributionData.location?.lat ?? distributionData.location?.latitude ?? 36.8065;
      const lng = distributionData.location?.lng ?? distributionData.location?.longitude ?? 10.1815;
      const city = distributionData.location?.city || findNearestCity({ lat, lng });

      const distribution = await Distribution.create({
        name: distributionData.title || 'Single Prize Distribution',
        description: distributionData.description || 'Manual single prize placement',
        targetArea: {
          type: 'circle',
          coordinates: [[lng, lat]],
          city: city,
          radius: distributionData.radius || 50,
        },
        prizeTemplate: {
          name: distributionData.title || 'Prize',
          description: distributionData.description || 'Prize description',
          type: distributionData.type || 'physical',
          category: distributionData.category || 'lifestyle',
          points: distributionData.points || distributionData.value || 0,
          rarity: distributionData.rarity || 'common',
          imageUrl: distributionData.image,
        },
        quantity: 1,
        spacing: 50,
        prizes: [prize._id],
        createdBy: new Types.ObjectId(adminId),
        status: 'active',
        metadata: {
          totalValue: distributionData.value,
          region: `${lat},${lng}`,
          ...(distributionData.metadata || {}),
        },
      });

      await this.cachePrizeForProximity(prize as any);
      await this.trackDistributionMetrics(adminId, 'single', 1, distributionData.value);

      typedLogger.info('Single prize distributed', { adminId, prizeId: prize._id });

      return {
        success: true,
        distribution,
        prize,
        estimatedDiscoveryTime: this.estimateDiscoveryTime(distributionData.location),
      };
    } catch (error) {
      typedLogger.error('Failed to distribute single prize', { adminId, error });
      throw error;
    }
  }

  // Alias used by routes (bulkDistribute)
  static async distributeBulkPrizes(adminId: string, bulkData: BulkDistributionData) {
    try {
      // Support both legacy { prizes: [] } and new { template, locations } payloads
      let prizeInputs: DistributionData[] = [];
      if (Array.isArray(bulkData.prizes) && bulkData.prizes.length > 0) {
        prizeInputs = bulkData.prizes as DistributionData[];
      } else if (bulkData.template && Array.isArray(bulkData.locations)) {
        prizeInputs = bulkData.locations.map((loc) => ({
          ...bulkData.template,
          location: {
            lat: (loc as any).lat ?? loc.latitude,
            lng: (loc as any).lng ?? loc.longitude,
            city: loc.city,
            address: loc.address,
          },
          radius: loc.radius,
          value: (bulkData.template as any).content?.points ?? (bulkData.template as any).points,
          metadata: {
            prizeConfig: bulkData.template,
            distribution: { mode: bulkData.distributionMode },
          },
        }));
      }

      const prizes = await Promise.all(
        prizeInputs.map(async (prizeData) => {
          const prizePayload = toPrizePayload(adminId, {
            ...prizeData,
            status: bulkData.scheduledAt ? 'scheduled' : 'active',
          } as any);
          const prize = await PrizeService.createPrize(adminId, prizePayload);
          await this.cachePrizeForProximity(prize as any);
          return prize;
        })
      );

      const totalValue = prizeInputs.reduce((sum, p) => sum + (p.value ?? p.points ?? 0), 0);

      // Extract template info for Distribution record
      const templateInfo = bulkData.template || prizeInputs[0] || {};
      const firstLocation = bulkData.locations?.[0] || prizeInputs[0]?.location || {};
      const centerLat = (firstLocation as any).lat ?? (firstLocation as any).latitude ?? 36.8065;
      const centerLng = (firstLocation as any).lng ?? (firstLocation as any).longitude ?? 10.1815;

      const distribution = await Distribution.create({
        name: (templateInfo as any).title || (templateInfo as any).name || 'Bulk Distribution',
        description: (templateInfo as any).description || 'Bulk prize distribution',
        targetArea: {
          type: 'circle',
          coordinates: [[centerLng, centerLat]],
          city: (firstLocation as any).city || findNearestCity({ lat: centerLat, lng: centerLng }),
          radius: (firstLocation as any).radius || 500,
        },
        prizeTemplate: {
          name: (templateInfo as any).title || (templateInfo as any).name || 'Bulk Prize',
          description: (templateInfo as any).description || 'Distribution prize',
          type: (templateInfo as any).type || PrizeType.PHYSICAL,
          category: (templateInfo as any).category || PrizeCategory.LIFESTYLE,
          points: (templateInfo as any).content?.points || (templateInfo as any).points || totalValue / prizes.length || 100,
          rarity: (templateInfo as any).rarity || PrizeRarity.COMMON,
          imageUrl: (templateInfo as any).image || (templateInfo as any).imageUrl,
        },
        quantity: prizes.length,
        spacing: 50, // Default spacing between prizes
        createdBy: new Types.ObjectId(adminId),
        status: bulkData.scheduledAt ? 'scheduled' : 'active',
        metadata: {
          scheduledAt: bulkData.scheduledAt,
          totalValue,
          region: bulkData.region || 'global',
          prizeIds: prizes.map((p) => p._id),
          distributionMode: bulkData.distributionMode,
        },
      });

      await this.trackDistributionMetrics(adminId, 'bulk', prizes.length, totalValue);

      typedLogger.info('Bulk prizes distributed', { adminId, count: prizes.length });

      return {
        success: true,
        distribution,
        prizes,
        summary: this.generateDistributionSummary(prizes),
      };
    } catch (error) {
      typedLogger.error('Failed to distribute bulk prizes', { adminId, error });
      throw error;
    }
  }

  // Alias used by routes (autoDistribute)
  static async autoDistributePrizes(adminId: string, autoData: AutoDistributionData) {
    try {
      const safeAuto = {
        prizeType: autoData.prizeType || 'generic',
        totalValue: autoData.totalValue ?? 0,
        count: autoData.count ?? 1,
        region: autoData.region || { center: { lat: 0, lng: 0 }, radius: 1 },
        densityBased: autoData.densityBased,
        duration: autoData.duration,
      };
      const optimalDistribution = await this.calculateOptimalDistribution(safeAuto);
      const prizes: any[] = [];

      for (const location of optimalDistribution.locations) {
        const baseValue = safeAuto.totalValue / (safeAuto.count || 1);
        const prizeValue = safeAuto.densityBased
          ? this.scaleByDensity(baseValue, location.density)
          : baseValue;

        const prizePayload = toPrizePayload(adminId, {
          title: `Auto ${safeAuto.prizeType}`,
          description: 'Auto-distributed prize',
          value: this.applyRandomVariation(prizeValue, 0.1),
          location: { lat: location.lat, lng: location.lng },
          radius: 50,
          rarity: PrizeRarity.COMMON,
          category: PrizeCategory.LIFESTYLE,
          type: PrizeType.PHYSICAL,
          metadata: { autoDistributed: true, density: location.density },
        } as any);

        const prize = await PrizeService.createPrize(adminId, prizePayload as any);

        await this.cachePrizeForProximity(prize);
        prizes.push(prize);
      }

      const distribution = await Distribution.create({
        name: `Auto ${safeAuto.prizeType} Distribution`,
        description: `Automated distribution of ${prizes.length} prizes`,
        targetArea: {
          type: 'circle',
          coordinates: [[safeAuto.region.center.lng, safeAuto.region.center.lat]],
          city: 'Auto Region',
          radius: safeAuto.region.radius * 1000 // Convert km to meters
        },
        prizeTemplate: {
          name: `Auto ${safeAuto.prizeType}`,
          description: 'Auto-distributed prize',
          type: PrizeType.PHYSICAL,
          category: PrizeCategory.LIFESTYLE,
          points: Math.round(safeAuto.totalValue / (safeAuto.count || 1)),
          rarity: PrizeRarity.COMMON
        },
        quantity: prizes.length,
        spacing: 50,
        prizes: prizes.map((p) => p._id),
        createdBy: new Types.ObjectId(adminId),
        status: 'active',
        metadata: {
          autoConfig: autoData,
          totalValue: autoData.totalValue,
          region: `${autoData.region.center.lat},${autoData.region.center.lng}`,
          prizeCount: prizes.length
        },
      });

      await this.trackDistributionMetrics(adminId, 'auto', prizes.length, autoData.totalValue);

      typedLogger.info('Auto distribution completed', { adminId, count: prizes.length });

      return {
        success: true,
        distribution,
        prizes,
        coverage: optimalDistribution.coverage,
      };
    } catch (error) {
      typedLogger.error('Failed to auto distribute prizes', { adminId, error });
      throw error;
    }
  }

  static async getDistributionAnalytics(
    adminId: string,
    timeframe: string,
    _range?: { startDate?: string; endDate?: string }
  ): Promise<DistributionAnalytics> {
    try {
      const { startDate, endDate } = this.parseTimeframe(timeframe);

      const distributions: any[] = await Distribution.find({
        createdAt: { $gte: startDate, $lte: endDate },
      }) as any;

      const prizeIds = distributions.flatMap((d) => d.prizes || []);
      const prizes = await Prize.find({ _id: { $in: prizeIds } });
      const claims = await Claim.find({
        prizeId: { $in: prizeIds },
        createdAt: { $gte: startDate, $lte: endDate },
      });

      const totalDistributed = prizes.length;
      const totalClaimed = claims.length;
      const totalExpired = prizes.filter((p) => p.status === 'expired').length;

      const claimTimes = claims
        .filter((c) => c.claimedAt)
        .map((c) => {
          const prize = prizes.find((p) => p._id.equals((c as any).prizeId));
          return prize ? new Date(c.claimedAt).getTime() - new Date(prize.createdAt).getTime() : 0;
        })
        .filter((t) => t > 0);

      const byPrizeType: Record<string, number> = {};
      const byRegion: Record<string, number> = {};

      prizes.forEach((prize) => {
        byPrizeType[prize.type] = (byPrizeType[prize.type] || 0) + 1;
      });

      distributions.forEach((dist) => {
        const region = dist.region || 'unknown';
        const prizeCount = dist.prizeCount || 0;
        byRegion[region] = (byRegion[region] || 0) + prizeCount;
      });

      return {
        totalDistributed,
        totalClaimed,
        totalExpired,
        claimRate: totalDistributed > 0 ? (totalClaimed / totalDistributed) * 100 : 0,
        averageClaimTime: claimTimes.length > 0 ? claimTimes.reduce((a, b) => a + b, 0) / claimTimes.length : 0,
        byPrizeType,
        byRegion,
      };
    } catch (error) {
      typedLogger.error('Failed to get distribution analytics', { adminId, error });
      throw error;
    }
  }

  static async getActiveDistributions(adminId: string, opts?: { page?: number; limit?: number }) {
    try {
      const page = opts?.page || 1;
      const limit = opts?.limit || 20;
      const skip = (page - 1) * limit;

      // Ensure Distribution model is available
      if (!Distribution || typeof Distribution.find !== 'function') {
        typedLogger.error('Distribution model not available');
        return {
          items: [],
          pagination: { page, limit, total: 0, pages: 0 },
        };
      }

      const [distributionsResult, total] = await Promise.all([
        Distribution.find({ status: DistributionStatus.ACTIVE })
          .populate('createdBy', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Distribution.countDocuments({ status: DistributionStatus.ACTIVE }),
      ] as any);

      // Defensive: ensure distributions is an array
      const distributions = Array.isArray(distributionsResult) ? distributionsResult : [];

      const enrichedDistributions = await Promise.all(
        distributions.map(async (dist) => {
          const distAny = dist as any;
          const prizeIds = distAny.prizes || [];

          // Defensive: ensure Prize model is available
          let prizes: any[] = [];
          if (Prize && typeof Prize.find === 'function' && prizeIds.length > 0) {
            try {
              prizes = await Prize.find({ _id: { $in: prizeIds } }) || [];
            } catch (err) {
              typedLogger.warn('Failed to fetch prizes for distribution', { distributionId: distAny._id, err });
            }
          }

          const claimedCount = Array.isArray(prizes) ? prizes.filter((p) => (p as any).status === 'claimed').length : 0;
          const activeCount = Array.isArray(prizes) ? prizes.filter((p) => (p as any).status === 'active').length : 0;

          return {
            ...distAny.toObject?.() ?? distAny,
            claimedCount,
            activeCount,
            claimRate: prizes.length > 0 ? (claimedCount / prizes.length) * 100 : 0,
          };
        })
      );

      return {
        items: enrichedDistributions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      typedLogger.error('Failed to get active distributions', { adminId, error });
      throw error;
    }
  }

  static async manageDistribution(
    adminId: string,
    distributionId: string,
    action: string,
    params?: Record<string, unknown>
  ) {
    try {
      const distribution = await Distribution.findById(distributionId);
      if (!distribution) {
        throw new Error('Distribution not found');
      }

      const distAny = distribution as any;

      switch (action) {
        case 'pause':
          distAny.status = DistributionStatus.ACTIVE; // keep enum; flag prizes paused separately
          await Prize.updateMany({ _id: { $in: distAny.prizes || [] } }, { status: 'paused' as any });
          break;

        case 'resume':
          distAny.status = DistributionStatus.ACTIVE;
          await Prize.updateMany(
            { _id: { $in: distAny.prizes || [] }, status: 'paused' },
            { status: 'active' }
          );
          break;

        case 'extend': {
          const extensionHours = (params?.hours as number) || 24;
          await Prize.updateMany(
            { _id: { $in: distAny.prizes || [] } },
            { $inc: { expiresAt: extensionHours * 60 * 60 * 1000 } }
          );
          break;
        }

        case 'terminate':
          distAny.status = DistributionStatus.CANCELLED;
          await Prize.updateMany(
            { _id: { $in: distAny.prizes || [] }, status: { $in: ['active', 'paused'] } },
            { status: 'terminated' as any }
          );
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      await (distAny.save?.() ?? distAny);

      typedLogger.info('Distribution managed', { adminId, distributionId, action });

      return { success: true, distribution, action };
    } catch (error) {
      typedLogger.error('Failed to manage distribution', { adminId, distributionId, action, error });
      throw error;
    }
  }

  static async getDistributionHistory(page: number = 1, limit: number = 20, status?: string) {
    try {
      const skip = (page - 1) * limit;
      const query: Record<string, unknown> = {};
      if (status) query.status = status;

      const [distributions, total] = await Promise.all([
        Distribution.find(query)
          .populate('createdBy', 'name email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        Distribution.countDocuments(query),
      ]);

      return {
        distributions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      typedLogger.error('Failed to get distribution history', { error });
      throw error;
    }
  }

  static async getDistributionSettings() {
    try {
      const cacheKey = 'distribution:settings';
      const cached = await redisClient.get(cacheKey);

      if (cached) {
        return JSON.parse(cached);
      }

      const settings = {
        defaultRadius: 50,
        defaultExpiration: 24,
        maxPrizesPerDistribution: 1000,
        minPrizeValue: 1,
        maxPrizeValue: 10000,
        densityThresholds: { low: 0.3, medium: 0.6, high: 1.0 },
        autoDistributionEnabled: true,
        schedulingEnabled: true,
      };

      await redisClient.setex(cacheKey, 3600, JSON.stringify(settings));

      return settings;
    } catch (error) {
      typedLogger.error('Failed to get distribution settings', { error });
      throw error;
    }
  }

  static async updateDistributionSettings(adminId: string, settings: Record<string, unknown>) {
    try {
      const cacheKey = 'distribution:settings';
      await redisClient.setex(cacheKey, 3600, JSON.stringify(settings));
      typedLogger.info('Distribution settings updated', { adminId });
      return settings;
    } catch (error) {
      typedLogger.error('Failed to update distribution settings', { adminId, error });
      throw error;
    }
  }

  static async triggerManualDistribution(adminId: string, type: string, config: Record<string, unknown>) {
    try {
      const distribution = await Distribution.create({
        type,
        createdBy: new Types.ObjectId(adminId),
        status: 'pending',
        metadata: config || {},
        prizes: [],
      });
      typedLogger.info('Manual distribution trigger created', { adminId, distributionId: distribution._id });
      return { success: true, distribution };
    } catch (error) {
      typedLogger.error('Failed to trigger manual distribution', { adminId, error });
      throw error;
    }
  }

  private static async cachePrizeForProximity(prize: any) {
    try {
      const geoKey = 'prizes:geo';
      const [lng, lat] = prize.location.coordinates;
      await redisClient.geoadd(geoKey, lng, lat, prize._id.toString());
      await redisClient.setex(`prize:${prize._id}`, 3600, JSON.stringify(prize.toObject()));
    } catch (error) {
      typedLogger.warn('Failed to cache prize for proximity', { prizeId: prize._id, error });
    }
  }

  private static async trackDistributionMetrics(
    adminId: string,
    type: string,
    count: number,
    value: number
  ) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const metricsKey = `metrics:distribution:${today}`;

      await redisClient.hincrby(metricsKey, `${type}:count`, count);
      await redisClient.hincrby(metricsKey, `${type}:value`, Math.round(value));
      await redisClient.hincrby(metricsKey, 'total:count', count);
      await redisClient.hincrby(metricsKey, 'total:value', Math.round(value));
      await redisClient.expire(metricsKey, 7 * 24 * 60 * 60);
    } catch (error) {
      typedLogger.warn('Failed to track distribution metrics', { adminId, error });
    }
  }

  private static estimateDiscoveryTime(location: { lat?: number; lng?: number }): number {
    const baseTime = 30;
    const variation = Math.random() * 60;
    return Math.round(baseTime + variation);
  }

  private static applyRandomVariation(value: number, percentage: number): number {
    const variation = value * percentage * (Math.random() * 2 - 1);
    return Math.round(value + variation);
  }

  private static scaleByDensity(baseValue: number, density: number): number {
    const scaleFactor = 0.5 + density * 0.5;
    return Math.round(baseValue * scaleFactor);
  }

  private static async calculateOptimalDistribution(autoData: AutoDistributionData) {
    const locations: Array<{ lat: number; lng: number; density: number }> = [];
    const { center, radius } = autoData.region;

    for (let i = 0; i < autoData.count; i++) {
      const angle = (2 * Math.PI * i) / autoData.count;
      const r = radius * Math.sqrt(Math.random());
      const lat = center.lat + (r / 111000) * Math.cos(angle);
      const lng = center.lng + (r / (111000 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(angle);
      const density = Math.random();

      locations.push({ lat, lng, density });
    }

    return {
      locations,
      coverage: (locations.length / autoData.count) * 100,
    };
  }

  private static calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private static parseTimeframe(timeframe: string): { startDate: Date; endDate: Date } {
    const endDate = new Date();
    let startDate = new Date();

    switch (timeframe) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    return { startDate, endDate };
  }

  private static generateDistributionSummary(prizes: any[]) {
    const byType: Record<string, { count: number; totalValue: number }> = {};

    prizes.forEach((prize) => {
      if (!byType[prize.type]) {
        byType[prize.type] = { count: 0, totalValue: 0 };
      }
      byType[prize.type].count++;
      byType[prize.type].totalValue += prize.value;
    });

    return {
      totalPrizes: prizes.length,
      totalValue: prizes.reduce((sum, p) => sum + p.value, 0),
      byType,
    };
  }
}

export { DistributionService as AdminDistributionService };
export default DistributionService;
