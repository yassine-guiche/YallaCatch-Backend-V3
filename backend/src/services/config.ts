import { Settings, ISettings } from '@/models/Settings';
import { CacheService } from './cache';
import { redisPubSub, redisPublisher } from '@/config/redis';
import { typedLogger } from '@/lib/typed-logger';
import { audit } from '@/lib/audit-logger';
import { EventEmitter } from 'events';

/**
 * Real-time Configuration Service
 * Provides hot-reloadable game configuration with Redis pub/sub
 * Eliminates need for server restart when changing game settings
 */

export interface ConfigChangeEvent {
  section: string;
  changes: Record<string, any>;
  changedBy: string;
  timestamp: number;
  version: number;
}

export class ConfigService extends EventEmitter {
  private static instance: ConfigService;
  private static readonly CACHE_TTL = 3600; // 1 hour
  private static readonly CONFIG_CHANNEL = 'game:config:changes';
  private static readonly CONFIG_VERSION_KEY = 'config:version';
  private configVersion = 0;
  private isSubscribed = false;

  private constructor() {
    super();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Initialize the config service (call on app startup)
   */
  async initialize(): Promise<void> {
    try {
      typedLogger.info('Initializing ConfigService');

      // Load initial config version from Redis
      const versionStr = await CacheService.get<number>(ConfigService.CONFIG_VERSION_KEY);
      this.configVersion = versionStr || 0;

      // Subscribe to config changes
      await this.subscribeToConfigChanges();

      typedLogger.info('ConfigService initialized', { version: this.configVersion });
    } catch (error) {
      typedLogger.error('ConfigService initialization failed', { error });
      throw error;
    }
  }

  /**
   * Subscribe to config change events via Redis pub/sub
   */
  private async subscribeToConfigChanges(): Promise<void> {
    if (this.isSubscribed) {
      return;
    }

    try {
      await redisPubSub.subscribe(ConfigService.CONFIG_CHANNEL, (err, count) => {
        if (err) {
          typedLogger.error('Failed to subscribe to config changes', { error: err.message });
        } else {
          typedLogger.info('Subscribed to config changes', { channels: count });
          this.isSubscribed = true;
        }
      });

      // Listen for messages
      redisPubSub.on('message', async (channel, message) => {
        if (channel === ConfigService.CONFIG_CHANNEL) {
          try {
            const event: ConfigChangeEvent = JSON.parse(message);
            this.configVersion = event.version;

            // Invalidate cache for this section
            await CacheService.invalidate(`config:${event.section}`);

            // Emit event to local listeners
            this.emit('configChanged', event);

            typedLogger.info('Config change received', {
              section: event.section,
              version: event.version,
              changedBy: event.changedBy,
            });
          } catch (error) {
            typedLogger.error('Failed to process config change', { error });
          }
        }
      });
    } catch (error) {
      typedLogger.error('Failed to subscribe to config changes', { error });
      throw error;
    }
  }

  /**
   * Get full game configuration
   */
  async getConfig(): Promise<Partial<ISettings> | null> {
    try {
      const cacheKey = 'config:full';

      // Try cache first
      const cached = await CacheService.get<Partial<ISettings>>(cacheKey);
      if (cached) {
        return cached;
      }

      // Fetch from database
      const settings = await Settings.findOne();
      if (!settings) {
        return null;
      }

      // Cache the result
      await CacheService.set(cacheKey, settings.toObject(), {
        ttl: ConfigService.CACHE_TTL,
        tags: ['config', 'game-settings'],
      });

      return settings.toObject();
    } catch (error) {
      typedLogger.error('Failed to get config', { error });
      throw error;
    }
  }

  /**
   * Get specific config section (game, antiCheat, rewards, etc.)
   */
  async getConfigSection<T = any>(section: string): Promise<T | null> {
    try {
      const cacheKey = `config:${section}`;

      // Try cache first
      const cached = await CacheService.get<T>(cacheKey);
      if (cached) {
        return cached;
      }

      // Fetch from database
      const settings = await Settings.findOne();
      if (!settings) {
        return null;
      }

      const sectionData = (settings as any)[section];
      if (!sectionData) {
        return null;
      }

      // Cache the section
      await CacheService.set(cacheKey, sectionData, {
        ttl: ConfigService.CACHE_TTL,
        tags: ['config', section],
      });

      return sectionData as T;
    } catch (error) {
      typedLogger.error('Failed to get config section', { error, section });
      throw error;
    }
  }

  /**
   * Get a specific config value with dot notation support
   * Example: getConfigValue('game.antiCheat.maxSpeedThreshold')
   */
  async getConfigValue<T = any>(path: string): Promise<T | undefined> {
    try {
      const [section, ...keys] = path.split('.');

      const sectionData = await this.getConfigSection(section);
      if (!sectionData) {
        return undefined;
      }

      let value: any = sectionData;
      for (const key of keys) {
        value = value?.[key];
        if (value === undefined) {
          return undefined;
        }
      }

      return value as T;
    } catch (error) {
      typedLogger.error('Failed to get config value', { error, path });
      throw error;
    }
  }

  /**
   * Update config section and broadcast change
   */
  async updateConfigSection(
    section: string,
    updates: Record<string, any>,
    adminId: string
  ): Promise<Partial<ISettings> | null> {
    try {
      typedLogger.info('Updating config section', { section, adminId });

      // Update database
      const updatePath = section;
      const settings = await Settings.findOneAndUpdate(
        {},
        {
          $set: { [updatePath]: updates },
          updatedBy: adminId,
        },
        { new: true, upsert: true }
      );

      if (!settings) {
        throw new Error('Failed to update settings');
      }

      // Increment version
      this.configVersion++;
      await CacheService.set(ConfigService.CONFIG_VERSION_KEY, this.configVersion, {
        ttl: 86400 * 30, // 30 days
      });

      // Clear all related caches
      await CacheService.invalidate(`config:${section}`);
      await CacheService.invalidate('config:full');

      // Broadcast change via Redis pub/sub
      const event: ConfigChangeEvent = {
        section,
        changes: updates,
        changedBy: adminId,
        timestamp: Date.now(),
        version: this.configVersion,
      };

      // Use redisPublisher (not redisPubSub which is in subscriber mode)
      await redisPublisher.publish(
        ConfigService.CONFIG_CHANNEL,
        JSON.stringify(event)
      );

      // Audit log for config updates
      await audit.settingsUpdated(adminId, section, {
        configSection: section,
        changesApplied: Object.keys(updates),
        version: this.configVersion,
      });

      typedLogger.info('Config section updated and broadcasted', {
        section,
        version: this.configVersion,
      });

      return settings.toObject();
    } catch (error) {
      typedLogger.error('Failed to update config section', { error, section });
      throw error;
    }
  }

  /**
   * Update specific config value
   */
  async updateConfigValue(
    path: string,
    value: any,
    adminId: string
  ): Promise<Partial<ISettings> | null> {
    try {
      const [section, ...keys] = path.split('.');

      // Get current section
      const sectionData = await this.getConfigSection(section);
      if (!sectionData && keys.length > 0) {
        throw new Error(`Config section ${section} not found`);
      }

      // Build nested update
      let updateObject = sectionData || {};
      if (keys.length > 0) {
        let current = updateObject;
        for (let i = 0; i < keys.length - 1; i++) {
          if (!current[keys[i]]) {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
      } else {
        updateObject = value;
      }

      return this.updateConfigSection(section, updateObject, adminId);
    } catch (error) {
      typedLogger.error('Failed to update config value', { error, path });
      throw error;
    }
  }

  /**
   * Get configuration history (changes over time)
   */
  async getConfigHistory(
    section?: string,
    limit: number = 50
  ): Promise<ConfigChangeEvent[]> {
    try {
      const cacheKey = section
        ? `config:history:${section}`
        : 'config:history:all';

      // Try cache first
      const cached = await CacheService.get<ConfigChangeEvent[]>(cacheKey);
      if (cached) {
        return cached.slice(0, limit);
      }

      // In a production system, you'd fetch from a dedicated history collection
      // For now, returning empty array
      return [];
    } catch (error) {
      typedLogger.error('Failed to get config history', { error });
      throw error;
    }
  }

  /**
   * Validate config changes before applying
   */
  async validateConfigUpdate(section: string, updates: Record<string, any>): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    // Validate game settings
    if (section === 'game') {
      if (updates.maxDailyClaims && updates.maxDailyClaims < 1) {
        errors.push('maxDailyClaims must be at least 1');
      }
      if (updates.claimCooldownMs && updates.claimCooldownMs < 100) {
        errors.push('claimCooldownMs must be at least 100ms');
      }
      if (updates.prizeDetectionRadiusM && updates.prizeDetectionRadiusM < 1) {
        errors.push('prizeDetectionRadiusM must be at least 1m');
      }
      if (updates.catchRadiusM && updates.catchRadiusM < 1) {
        errors.push('catchRadiusM must be at least 1m');
      }
      if (updates.visibleRadiusM && updates.visibleRadiusM < 1) {
        errors.push('visibleRadiusM must be at least 1m');
      }
      // Validate radius hierarchy if multiple are present
      if (updates.catchRadiusM && updates.visibleRadiusM && updates.catchRadiusM > updates.visibleRadiusM) {
        errors.push('catchRadiusM cannot be larger than visibleRadiusM');
      }
      if (updates.visibleRadiusM && updates.prizeDetectionRadiusM && updates.visibleRadiusM > updates.prizeDetectionRadiusM) {
        errors.push('visibleRadiusM cannot be larger than prizeDetectionRadiusM');
      }
    }

    // Validate anti-cheat settings
    if (section === 'antiCheat') {
      if (updates.riskScoreThreshold && (updates.riskScoreThreshold < 0 || updates.riskScoreThreshold > 100)) {
        errors.push('riskScoreThreshold must be between 0 and 100');
      }
    }

    // Validate progression settings
    if (section === 'progression') {
      if (updates.maxLevel && updates.maxLevel < 1) {
        errors.push('maxLevel must be at least 1');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Reload config from database (force refresh)
   */
  async reload(): Promise<void> {
    try {
      typedLogger.info('Force reloading config');

      // Clear all caches
      await CacheService.invalidate('config:');

      // Load fresh config
      await this.getConfig();

      typedLogger.info('Config reloaded successfully');
    } catch (error) {
      typedLogger.error('Failed to reload config', { error });
      throw error;
    }
  }

  /**
   * Check if a feature is enabled
   */
  async isFeatureEnabled(featureName: string): Promise<boolean> {
    try {
      const gameConfig = await this.getConfigSection('game');
      if (!gameConfig) return false;

      // Check power-ups
      if (featureName === 'powerUps') {
        return (gameConfig as any).powerUps?.enabled ?? false;
      }

      // Check anti-cheat
      if (featureName === 'antiCheat') {
        const acConfig = await this.getConfigSection('antiCheat');
        return (acConfig as any)?.enabled ?? false;
      }

      return false;
    } catch (error) {
      typedLogger.error('Failed to check feature', { error, featureName });
      return false;
    }
  }

  /**
   * Get current config version
   */
  getVersion(): number {
    return this.configVersion;
  }

  /**
   * Listen to config changes
   */
  onConfigChange(callback: (event: ConfigChangeEvent) => void): void {
    this.on('configChanged', callback);
  }
}

// Export singleton instance
export const configService = ConfigService.getInstance();
