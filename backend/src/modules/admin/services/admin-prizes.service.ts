import { Types } from 'mongoose';
import { Prize } from '@/models';
import { PrizeService } from '@/modules/prizes';
import { audit } from '@/lib/audit-logger';
import { typedLogger } from '@/lib/typed-logger';
import { PrizeCategory, PrizeRarity, PrizeType, LocationType } from '@/types';
import { findNearestCity } from '@/utils/geo';

interface GetPrizesOptions {
  page?: number;
  limit?: number;
  status?: string;
  category?: string;
  rarity?: string;
  city?: string;
  search?: string;
}

export class AdminPrizesService {
  static async getPrizes(options: GetPrizesOptions) {
    const {
      page = 1,
      limit = 20,
      status,
      category,
      rarity,
      city,
      search,
    } = options;

    const query: Record<string, unknown> = {};

    if (status) {
      query.status = status;
    }

    if (category) {
      query.category = category;
    }

    if (rarity) {
      query.rarity = rarity;
    }

    if (city) {
      query.city = city;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'sponsor.name': { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [prizes, total, statsAggregation] = await Promise.all([
      Prize.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Prize.countDocuments(query),
      // Get stats for ALL prizes (not filtered)
      Prize.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Transform aggregation to stats object
    const stats = {
      active: 0,
      captured: 0,
      expired: 0,
      inactive: 0,
      revoked: 0,
      total: 0
    };
    statsAggregation.forEach((item: { _id: string; count: number }) => {
      if (item._id in stats) {
        (stats as any)[item._id] = item.count;
      }
      stats.total += item.count;
    });

    return {
      prizes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      stats,
    };
  }

  static async getPrize(prizeId: string) {
    if (!Types.ObjectId.isValid(prizeId)) {
      throw new Error('Invalid prize ID');
    }

    const prize = await Prize.findById(prizeId).lean();

    if (!prize) {
      throw new Error('Prize not found');
    }

    return prize;
  }

  static async createPrize(prizeData: Record<string, unknown>, adminId: string) {
    try {
      const p = prizeData as any;
      const lat = typeof p.latitude === 'number' ? p.latitude : 36.8065;
      const lng = typeof p.longitude === 'number' ? p.longitude : 10.1815;
      const city = p.city || findNearestCity({ lat, lng });
      const rewardId = p.directReward?.rewardId || p.metadata?.rewardId;
      const probability = p.directReward?.probability ?? p.metadata?.probability ?? (p.contentType === 'hybrid' ? 0.5 : 1);
      const safePoints = Math.max(1, Number(p.value ?? p.points ?? p.pointsReward?.amount ?? 0) || 1);

      const mappedData = {
        name: p.name as string,
        description: (p.description as string) || 'Reward to discover on the map',
        type: (p.type as string) || PrizeType.PHYSICAL,
        displayType: (p.displayType as string) || 'standard',
        contentType: (p.contentType as string) || 'points',
        category: ([...Object.values(PrizeCategory)].includes(p.category) ? p.category : PrizeCategory.LIFESTYLE) as PrizeCategory,
        rarity: ([...Object.values(PrizeRarity)].includes(p.rarity) ? p.rarity : PrizeRarity.COMMON) as PrizeRarity,
        points: safePoints,
        pointsReward: {
          amount: safePoints,
          bonusMultiplier: (p.metadata?.bonusMultiplier as number) || 1,
        },
        directReward: rewardId ? {
          rewardId: new Types.ObjectId(rewardId as string),
          autoRedeem: true,
          probability: probability,
        } : undefined,
        quantity: (p.quantity as number) ?? 1,
        createdBy: new Types.ObjectId(adminId),
        location: {
          type: LocationType.GPS,
          coordinates: [lng, lat],
          radius: (p.radius as number) ?? 50,
          city,
          address: p.address as string | undefined,
          markerUrl: p.markerUrl as string | undefined,
          confidenceThreshold: (p.confidenceThreshold as number) ?? 0.8
        },
        visibility: p.visibility,
        expiresAt: p.expiresAt as Date | undefined,
        imageUrl: p.imageUrl as string | undefined,
        value: (p.value as number) ?? 0,
        tags: (p.tags as string[]) || [],
        status: (p.status as string) || 'active',
        metadata: p.metadata as Record<string, unknown> | undefined,
      };

      const prize = await PrizeService.createPrize(adminId, mappedData as any);

      await this.logAction(adminId, 'CREATE_PRIZE', prize._id.toString(), {
        prizeName: prize.name,
      });

      typedLogger.info('Admin created prize', {
        adminId,
        prizeId: prize._id,
        prizeName: prize.name,
      });

      return prize;
    } catch (error) {
      typedLogger.error('Failed to create prize', { adminId, error });
      throw error;
    }
  }

  static async updatePrize(
    updateData: Record<string, unknown>,
    prizeId: string,
    adminId: string
  ) {
    if (!Types.ObjectId.isValid(prizeId)) {
      throw new Error('Invalid prize ID');
    }

    try {
      const prize = await PrizeService.updatePrize(adminId, prizeId, updateData);

      if (!prize) {
        throw new Error('Prize not found');
      }

      await this.logAction(adminId, 'UPDATE_PRIZE', prizeId, {
        updatedFields: Object.keys(updateData),
      });

      typedLogger.info('Admin updated prize', {
        adminId,
        prizeId,
        updatedFields: Object.keys(updateData),
      });

      return prize;
    } catch (error) {
      typedLogger.error('Failed to update prize', { adminId, prizeId, error });
      throw error;
    }
  }

  static async deletePrize(prizeId: string, adminId: string) {
    if (!Types.ObjectId.isValid(prizeId)) {
      throw new Error('Invalid prize ID');
    }

    try {
      const prize = await Prize.findById(prizeId);

      if (!prize) {
        throw new Error('Prize not found');
      }
      if (!prize.createdBy) {
        (prize as any).createdBy = new Types.ObjectId(adminId);
      }

      const prizeName = prize.name;

      await PrizeService.deletePrize(adminId, prizeId);

      await this.logAction(adminId, 'DELETE_PRIZE', prizeId, {
        prizeName,
      });

      typedLogger.info('Admin deleted prize', {
        adminId,
        prizeId,
        prizeName,
      });

      return { success: true, deletedPrizeId: prizeId };
    } catch (error) {
      typedLogger.error('Failed to delete prize', { adminId, prizeId, error });
      throw error;
    }
  }

  private static async logAction(
    adminId: string,
    action: string,
    prizeId: string,
    details: Record<string, unknown>
  ) {
    // Use unified audit logger - writes to both Pino and MongoDB
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action,
      resource: 'prize',
      resourceId: prizeId,
      category: 'admin',
      severity: action.includes('DELETE') ? 'medium' : 'low',
      metadata: details,
    });
  }

  // Find nearby prizes for admin map/debug
  static async getNearbyPrizes(lat: number, lng: number, radius: number = 5000) {
    const point = {
      type: 'Point',
      coordinates: [lng, lat]
    };

    const prizes = await Prize.find({
      'location.coordinates': {
        $near: {
          $geometry: point as any,
          $maxDistance: radius
        }
      },
      isActive: true
    })
      .limit(50)
      .lean();

    return prizes;
  }
}

export default AdminPrizesService;
