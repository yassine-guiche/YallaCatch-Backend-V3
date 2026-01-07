/**
 * YallaCatch! Config Service
 * Manages dynamic configuration, feature flags, and config versioning
 */

import apiService from './api';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

// ==================== VERSION MANAGEMENT ====================

/**
 * Get current configuration version
 */
export async function getConfigVersion() {
  try {
    const response = await apiService.get('/admin/config/version');
    return response.data || response.version || response;
  } catch (error) {
    console.error('getConfigVersion error:', error);
    return { version: 'unknown', lastUpdated: null };
  }
}

/**
 * Reload configuration from source
 */
export async function reloadConfig() {
  try {
    const response = await apiService.post('/admin/config/reload');
    return response.data || response;
  } catch (error) {
    console.error('reloadConfig error:', error);
    throwNormalized(error, 'Impossible de recharger la configuration');
  }
}

/**
 * Get configuration change history
 * @param {Object} params - { page?, limit?, startDate?, endDate? }
 */
export async function getConfigHistory(params = {}) {
  try {
    const response = await apiService.get('/admin/config/history', params);
    return {
      items: response.data || response.history || [],
      pagination: response.pagination || { page: 1, limit: 20, total: 0 },
    };
  } catch (error) {
    console.error('getConfigHistory error:', error);
    return { items: [], pagination: { page: 1, limit: 20, total: 0 } };
  }
}

// ==================== ACTIVE CONFIG ====================

/**
 * Get the currently active configuration
 */
export async function getActiveConfig() {
  try {
    const response = await apiService.get('/admin/config/active');
    return response.data || response.config || {};
  } catch (error) {
    console.error('getActiveConfig error:', error);
    return {};
  }
}

/**
 * Validate a configuration object before applying
 * @param {Object} config - Configuration to validate
 */
export async function validateConfig(config) {
  try {
    const response = await apiService.post('/admin/config/validate', config);
    return {
      valid: response.valid ?? response.success ?? true,
      errors: response.errors || [],
      warnings: response.warnings || [],
    };
  } catch (error) {
    console.error('validateConfig error:', error);
    return { valid: false, errors: [error.message], warnings: [] };
  }
}

// ==================== CONFIG VALUES ====================

/**
 * Get a specific configuration value by path
 * @param {string} path - Dot-notation path (e.g., 'game.prizes.defaultRadius')
 */
export async function getConfigValue(path) {
  try {
    const response = await apiService.get(`/admin/config/value/${encodeURIComponent(path)}`);
    return response.data || response.value;
  } catch (error) {
    console.error('getConfigValue error:', error);
    return null;
  }
}

/**
 * Update a specific configuration value by path
 * @param {string} path - Dot-notation path
 * @param {any} value - New value
 */
export async function updateConfigValue(path, value) {
  try {
    const response = await apiService.patch(`/admin/config/value/${encodeURIComponent(path)}`, { value });
    return response.data || response;
  } catch (error) {
    console.error('updateConfigValue error:', error);
    throwNormalized(error, 'Impossible de mettre à jour la valeur de configuration');
  }
}

// ==================== FEATURE FLAGS ====================

/**
 * Get a specific feature flag status
 * @param {string} featureName - Name of the feature
 */
export async function getFeatureFlag(featureName) {
  try {
    const response = await apiService.get(`/admin/config/feature/${encodeURIComponent(featureName)}`);
    return {
      name: featureName,
      enabled: response.enabled ?? response.data?.enabled ?? false,
      config: response.config || response.data?.config || {},
    };
  } catch (error) {
    console.error('getFeatureFlag error:', error);
    return { name: featureName, enabled: false, config: {} };
  }
}

/**
 * Toggle a feature flag
 * @param {string} featureName 
 * @param {boolean} enabled 
 */
export async function toggleFeatureFlag(featureName, enabled) {
  try {
    const response = await apiService.patch(`/admin/config/value/features.${featureName}`, { value: enabled });
    return response.data || response;
  } catch (error) {
    console.error('toggleFeatureFlag error:', error);
    throwNormalized(error, 'Impossible de modifier le feature flag');
  }
}

/**
 * Get all feature flags
 */
export async function getAllFeatureFlags() {
  try {
    const response = await apiService.get('/admin/config/value/features');
    return response.data || response.value || {};
  } catch (error) {
    console.error('getAllFeatureFlags error:', error);
    return {};
  }
}

// ==================== PRESETS ====================

/**
 * Common configuration paths for quick access
 */
export const CONFIG_PATHS = {
  // Game settings
  PRIZE_DEFAULT_RADIUS: 'game.prizes.defaultRadius',
  PRIZE_DEFAULT_EXPIRATION: 'game.prizes.defaultExpiration',
  MAX_DAILY_CLAIMS: 'game.claims.maxDaily',
  CLAIM_COOLDOWN: 'game.claims.cooldownMinutes',
  
  // Anti-cheat
  ANTI_CHEAT_ENABLED: 'security.antiCheat.enabled',
  LOCATION_TOLERANCE: 'security.antiCheat.locationTolerance',
  VELOCITY_CHECK: 'security.antiCheat.velocityCheck',
  
  // Progression
  XP_MULTIPLIER: 'progression.xpMultiplier',
  LEVEL_CAP: 'progression.levelCap',
  
  // Features
  FEATURE_AR_MODE: 'features.arMode',
  FEATURE_OFFLINE_MODE: 'features.offlineMode',
  FEATURE_SOCIAL: 'features.social',
  FEATURE_MARKETPLACE: 'features.marketplace',
  FEATURE_POWER_UPS: 'features.powerUps',
  FEATURE_AB_TESTING: 'features.abTesting',
};

/**
 * Feature flag names
 */
export const FEATURE_FLAGS = {
  AR_MODE: 'arMode',
  OFFLINE_MODE: 'offlineMode',
  SOCIAL: 'social',
  MARKETPLACE: 'marketplace',
  POWER_UPS: 'powerUps',
  AB_TESTING: 'abTesting',
  ANTI_CHEAT: 'antiCheat',
  PUSH_NOTIFICATIONS: 'pushNotifications',
  DAILY_CHALLENGES: 'dailyChallenges',
  LEADERBOARD: 'leaderboard',
};

export default {
  // Version
  getConfigVersion,
  reloadConfig,
  getConfigHistory,
  // Active config
  getActiveConfig,
  validateConfig,
  // Values
  getConfigValue,
  updateConfigValue,
  // Feature flags
  getFeatureFlag,
  toggleFeatureFlag,
  getAllFeatureFlags,
  // Constants
  CONFIG_PATHS,
  FEATURE_FLAGS,
};
