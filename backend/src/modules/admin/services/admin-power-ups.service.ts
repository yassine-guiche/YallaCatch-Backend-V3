import PowerUpModel, { IPowerUp } from '@/models/PowerUp.js';
import { Types } from 'mongoose';
import { CacheService } from '@/services/cache.js';
import { configService } from '@/services/config.js';
import { typedLogger } from '@/lib/typed-logger.js';

export interface CreatePowerUpDto {
  name: string;
  description: string;
  type: 'radar_boost' | 'double_points' | 'speed_boost' | 'shield' | 'time_extension';
  icon?: string;
  rarity?: 'common' | 'rare' | 'epic' | 'legendary';
  durationMs: number;
  dropRate: number;
  maxPerSession: number;
  maxInInventory: number;
  effects: IPowerUp['effects'];
  notes?: string;
}

export interface UpdatePowerUpDto {
  name?: string;
  description?: string;
  icon?: string;
  rarity?: string;
  durationMs?: number;
  dropRate?: number;
  maxPerSession?: number;
  maxInInventory?: number;
  effects?: IPowerUp['effects'];
  enabled?: boolean;
  notes?: string;
}

export class PowerUpAdminService {
  private static readonly CACHE_TTL = 600; // 10 minutes
  private static readonly POWER_UPS_CACHE_KEY = 'power-ups:list';
  private static readonly POWER_UP_CACHE_KEY = (id: string) => `power-up:${id}`;

  /**
   * Create a new power-up
   */
  static async createPowerUp(
    adminId: Types.ObjectId,
    data: CreatePowerUpDto
  ): Promise<IPowerUp> {
    try {
      // Validate drop rate
      if (data.dropRate < 0 || data.dropRate > 100) {
        throw new Error('Drop rate must be between 0 and 100');
      }

      // Validate effects based on type
      this.validateEffects(data.type, data.effects);

      const powerUp = new PowerUpModel({
        ...data,
        enabled: true, // Explicitly set enabled to true for new power-ups
        createdBy: adminId,
        lastModifiedBy: adminId,
        totalCreated: 0,
        totalClaimed: 0,
        activeInstances: 0,
        usageCount: 0,
      });

      await powerUp.save();

      // Update config
      await configService.updateConfigSection(
        'powerUps',
        { enabled: true },
        adminId.toString()
      );

      // Clear ALL power-up related caches (list and individual)
      await CacheService.invalidate('power-ups:*');
      await CacheService.invalidate('power-up:*');

      typedLogger.audit('PowerUp created successfully', {
        powerUpId: powerUp._id.toString(),
        name: powerUp.name,
        type: powerUp.type,
        rarity: powerUp.rarity,
        adminId: adminId.toString(),
        timestamp: new Date().toISOString(),
      });

      return powerUp;
    } catch (error) {
      typedLogger.error('Error creating power-up', {
        error: error instanceof Error ? error.message : String(error),
        adminId: adminId.toString(),
        data: { name: data.name, type: data.type },
      });
      throw error;
    }
  }

  /**
   * Get all power-ups with optional filtering
   */
  static async getAllPowerUps(filters?: {
    enabled?: boolean;
    type?: string;
    rarity?: string;
  }): Promise<IPowerUp[]> {
    try {
      const cacheKey = `${this.POWER_UPS_CACHE_KEY}:${JSON.stringify(filters || {})}`;

      // Try cache first
      const cached = await CacheService.get(cacheKey) as string | null;
      if (cached) {
        return JSON.parse(cached);
      }

      const query: Record<string, unknown> = {};
      if (filters?.enabled !== undefined) query.enabled = filters.enabled;
      if (filters?.type) query.type = filters.type;
      if (filters?.rarity) query.rarity = filters.rarity;

      const powerUps = await PowerUpModel.find(query).sort({ createdAt: -1 });

      // Cache results
      await CacheService.set(cacheKey, JSON.stringify(powerUps), { ttl: this.CACHE_TTL });

      typedLogger.debug('Power-ups fetched from database', {
        count: powerUps.length,
        filters: filters || {},
      });

      return powerUps;
    } catch (error) {
      typedLogger.error('Error fetching power-ups', {
        error: error instanceof Error ? error.message : String(error),
        filters: filters || {},
      });
      throw error;
    }
  }

  /**
   * Get single power-up by ID
   */
  static async getPowerUpById(powerUpId: string | Types.ObjectId): Promise<IPowerUp> {
    try {
      const cacheKey = this.POWER_UP_CACHE_KEY(powerUpId.toString());

      // Try cache first
      const cached = await CacheService.get(cacheKey) as string | null;
      if (cached) {
        return JSON.parse(cached);
      }

      const powerUp = await PowerUpModel.findById(powerUpId);
      if (!powerUp) {
        throw new Error(`PowerUp not found: ${powerUpId}`);
      }

      // Cache result
      await CacheService.set(cacheKey, JSON.stringify(powerUp), { ttl: this.CACHE_TTL });

      typedLogger.debug('Power-up retrieved', {
        powerUpId: powerUpId.toString(),
        name: powerUp.name,
      });

      return powerUp;
    } catch (error) {
      typedLogger.error('Error fetching power-up by ID', {
        powerUpId: powerUpId.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update power-up
   */
  static async updatePowerUp(
    powerUpId: string | Types.ObjectId,
    adminId: Types.ObjectId,
    data: UpdatePowerUpDto
  ): Promise<IPowerUp> {
    try {
      // Validate drop rate if provided
      if (data.dropRate !== undefined) {
        if (data.dropRate < 0 || data.dropRate > 100) {
          throw new Error('Drop rate must be between 0 and 100');
        }
      }

      // Validate effects if provided
      const existingPowerUp = await this.getPowerUpById(powerUpId);
      if (data.effects) {
        const typeToValidate = (data as Record<string, unknown>).type as string || existingPowerUp.type;
        this.validateEffects(typeToValidate, data.effects);
      }

      const powerUp = await PowerUpModel.findByIdAndUpdate(
        powerUpId,
        {
          ...data,
          lastModifiedBy: adminId,
        },
        { new: true, runValidators: true }
      );

      if (!powerUp) {
        throw new Error(`PowerUp not found: ${powerUpId}`);
      }

      // Clear cache
      await CacheService.invalidate(`power-up:${powerUpId}`, 'power-ups');

      typedLogger.audit('PowerUp updated via API', {
        powerUpId: powerUpId.toString(),
        adminId: adminId.toString(),
        changedFields: Object.keys(data),
        timestamp: new Date().toISOString(),
      });

      return powerUp;
    } catch (error) {
      typedLogger.error('Error updating power-up', {
        powerUpId: powerUpId.toString(),
        adminId: adminId.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update power-up drop rate
   */
  static async updateDropRate(
    powerUpId: string | Types.ObjectId,
    adminId: Types.ObjectId,
    dropRate: number
  ): Promise<IPowerUp> {
    if (dropRate < 0 || dropRate > 100) {
      typedLogger.warn('Invalid drop rate provided', {
        powerUpId: powerUpId.toString(),
        dropRate,
        adminId: adminId.toString(),
      });
      throw new Error('Drop rate must be between 0 and 100');
    }

    return this.updatePowerUp(powerUpId, adminId, { dropRate });
  }

  /**
   * Delete power-up
   */
  static async deletePowerUp(
    powerUpId: string | Types.ObjectId,
    adminId: Types.ObjectId
  ): Promise<void> {
    try {
      const result = await PowerUpModel.findByIdAndDelete(powerUpId);

      if (!result) {
        throw new Error(`PowerUp not found: ${powerUpId}`);
      }

      // Clear cache
      await CacheService.invalidate(`power-up:${powerUpId}`, 'power-ups');

      typedLogger.audit('PowerUp deleted', {
        powerUpId: powerUpId.toString(),
        adminId: adminId.toString(),
        deletedName: result.name,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      typedLogger.error('Error deleting power-up', {
        powerUpId: powerUpId.toString(),
        adminId: adminId.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;

    }
  }

  /**
   * Get power-up analytics
   */
  static async getPowerUpAnalytics(powerUpId: string | Types.ObjectId) {
    const powerUp = await this.getPowerUpById(powerUpId);

    // Calculate metrics
    const claimRate =
      powerUp.totalCreated > 0
        ? (powerUp.totalClaimed / powerUp.totalCreated) * 100
        : 0;
    const adoptionRate =
      powerUp.totalClaimed > 0
        ? (powerUp.activeInstances / powerUp.totalClaimed) * 100
        : 0;

    return {
      powerUpId: powerUp._id,
      name: powerUp.name,
      type: powerUp.type,
      rarity: powerUp.rarity,
      stats: {
        totalCreated: powerUp.totalCreated,
        totalClaimed: powerUp.totalClaimed,
        activeInstances: powerUp.activeInstances,
        usageCount: powerUp.usageCount,
      },
      metrics: {
        claimRate: Math.round(claimRate * 100) / 100,
        adoptionRate: Math.round(adoptionRate * 100) / 100,
        averageUsagePerSession: Math.round(powerUp.averageUsagePerSession * 100) / 100,
      },
      configuration: {
        enabled: powerUp.enabled,
        dropRate: powerUp.dropRate,
        durationMs: powerUp.durationMs,
        maxPerSession: powerUp.maxPerSession,
        maxInInventory: powerUp.maxInInventory,
      },
    };
  }

  /**
   * Get all power-ups analytics
   */
  static async getAllPowerUpsAnalytics() {
    const powerUps = await this.getAllPowerUps({ enabled: true });

    const analytics = await Promise.all(
      powerUps.map(pu => this.getPowerUpAnalytics(pu._id))
    );

    const summary = {
      totalPowerUps: analytics.length,
      totalCreated: analytics.reduce((sum, a) => sum + a.stats.totalCreated, 0),
      totalClaimed: analytics.reduce((sum, a) => sum + a.stats.totalClaimed, 0),
      totalActiveInstances: analytics.reduce((sum, a) => sum + a.stats.activeInstances, 0),
      totalUsageCount: analytics.reduce((sum, a) => sum + a.stats.usageCount, 0),
      averageClaimRate: Math.round(
        analytics.reduce((sum, a) => sum + a.metrics.claimRate, 0) / analytics.length * 100
      ) / 100,
      averageAdoptionRate: Math.round(
        analytics.reduce((sum, a) => sum + a.metrics.adoptionRate, 0) / analytics.length * 100
      ) / 100,
      byRarity: {
        common: analytics.filter(a => a.rarity === 'common').length,
        rare: analytics.filter(a => a.rarity === 'rare').length,
        epic: analytics.filter(a => a.rarity === 'epic').length,
        legendary: analytics.filter(a => a.rarity === 'legendary').length,
      },
      byType: {
        radar_boost: analytics.filter(a => a.type === 'radar_boost').length,
        double_points: analytics.filter(a => a.type === 'double_points').length,
        speed_boost: analytics.filter(a => a.type === 'speed_boost').length,
        shield: analytics.filter(a => a.type === 'shield').length,
        time_extension: analytics.filter(a => a.type === 'time_extension').length,
      },
    };

    return {
      summary,
      powerUps: analytics,
    };
  }

  /**
   * Validate power-up effects based on type
   */
  private static validateEffects(type: string, effects: IPowerUp['effects']) {
    if (!effects) {
      throw new Error('Effects are required');
    }

    switch (type) {
      case 'radar_boost':
        if (!effects.radarBoost?.radiusMultiplier) {
          throw new Error('radarBoost.radiusMultiplier required for radar_boost type');
        }
        if (effects.radarBoost.radiusMultiplier < 1 || effects.radarBoost.radiusMultiplier > 5) {
          throw new Error('radiusMultiplier must be between 1 and 5');
        }
        break;

      case 'double_points':
        if (!effects.doublePoints?.pointsMultiplier) {
          throw new Error('doublePoints.pointsMultiplier required for double_points type');
        }
        if (effects.doublePoints.pointsMultiplier < 1.5 || effects.doublePoints.pointsMultiplier > 10) {
          throw new Error('pointsMultiplier must be between 1.5 and 10');
        }
        break;

      case 'speed_boost':
        if (!effects.speedBoost?.speedMultiplier) {
          throw new Error('speedBoost.speedMultiplier required for speed_boost type');
        }
        if (effects.speedBoost.speedMultiplier < 1.1 || effects.speedBoost.speedMultiplier > 3) {
          throw new Error('speedMultiplier must be between 1.1 and 3');
        }
        break;

      case 'shield':
        if (!effects.shield?.damageMitigation) {
          throw new Error('shield.damageMitigation required for shield type');
        }
        if (effects.shield.damageMitigation < 0 || effects.shield.damageMitigation > 1) {
          throw new Error('damageMitigation must be between 0 and 1');
        }
        break;

      case 'time_extension':
        if (!effects.timeExtension?.additionalTimeMs) {
          throw new Error('timeExtension.additionalTimeMs required for time_extension type');
        }
        if (effects.timeExtension.additionalTimeMs < 1000 || effects.timeExtension.additionalTimeMs > 600000) {
          throw new Error('additionalTimeMs must be between 1000 and 600000');
        }
        break;

      default:
        throw new Error(`Unknown power-up type: ${type}`);
    }
  }
}

export default PowerUpAdminService;
