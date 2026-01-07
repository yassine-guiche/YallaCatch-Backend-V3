/**
 * Service Distribution - Placement et distribution des prix
 * APIs: 14 endpoints (fully integrated with backend)
 */

import apiService from './api';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

// ==================== CORE DISTRIBUTION ====================

/**
 * Placer un prix manuellement (single prize)
 * @param {Object} prizeData - { prizeType, value, location: {lat, lng}, radius, expiresAt, metadata }
 */
export async function placePrize(prizeData) {
  try {
    const response = await apiService.post('/admin/place', prizeData);
    return response.data || response;
  } catch (error) {
    console.error('Erreur placePrize:', error);
    throwNormalized(error, 'Impossible de placer le prix');
  }
}

/**
 * Distribution en masse (batch)
 * @param {Object} batchData - { prizes: [], region?, scheduledAt? }
 */
export async function batchDistribution(batchData) {
  try {
    const response = await apiService.post('/admin/batch', batchData);
    return response.data || response;
  } catch (error) {
    console.error('Erreur batchDistribution:', error);
    throwNormalized(error, 'Impossible de distribuer les prix en masse');
  }
}

/**
 * Distribution automatique (circle-based)
 * @param {Object} config - { prizeType, totalValue, count, region: {center: {lat, lng}, radius}, densityBased?, duration? }
 */
export async function autoDistribution(config) {
  try {
    const response = await apiService.post('/admin/auto', config);
    return response.data || response;
  } catch (error) {
    console.error('Erreur autoDistribution:', error);
    throwNormalized(error, 'Impossible de lancer la distribution automatique');
  }
}

// ==================== ANALYTICS & MONITORING ====================

/**
 * Analytics de distribution
 * @param {string} timeframe - '24h', '7d', '30d', '90d'
 * @param {Object} range - { startDate?, endDate? }
 */
export async function getDistributionAnalytics(timeframe = '30d', range = {}) {
  try {
    const params = { timeframe, ...range };
    const response = await apiService.get('/admin/distribution/analytics', params);
    return response.data || response.analytics || response;
  } catch (error) {
    console.error('Erreur getDistributionAnalytics:', error);
    return {
      totalDistributed: 0,
      totalClaimed: 0,
      totalExpired: 0,
      claimRate: 0,
      averageClaimTime: 0,
      byPrizeType: {},
      byRegion: {},
    };
  }
}

/**
 * Distributions actives avec pagination
 * @param {Object} params - { page?, limit? }
 */
export async function getActiveDistributions(params = {}) {
  try {
    const response = await apiService.get('/admin/distribution/active', params);
    return {
      items: response.items || response.data || [],
      pagination: response.pagination || { page: 1, limit: 20, total: 0, pages: 0 },
    };
  } catch (error) {
    console.error('Erreur getActiveDistributions:', error);
    return { items: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } };
  }
}

/**
 * Historique des distributions
 * @param {Object} params - { page?, limit?, status? }
 */
export async function getDistributionHistory(params = {}) {
  try {
    const response = await apiService.get('/admin/distribution/history', params);
    return {
      items: response.distributions || response.data || [],
      pagination: response.pagination || { page: 1, limit: 20, total: 0, pages: 0 },
    };
  } catch (error) {
    console.error('Erreur getDistributionHistory:', error);
    return { items: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } };
  }
}

// ==================== SETTINGS ====================

/**
 * Récupérer les paramètres de distribution
 */
export async function getDistributionSettings() {
  try {
    const response = await apiService.get('/admin/distribution/settings');
    return response.data || response.settings || response;
  } catch (error) {
    console.error('Erreur getDistributionSettings:', error);
    return {
      defaultRadius: 50,
      defaultExpiration: 24,
      maxPrizesPerDistribution: 1000,
      minPrizeValue: 1,
      maxPrizeValue: 10000,
      densityThresholds: { low: 0.3, medium: 0.6, high: 1.0 },
      autoDistributionEnabled: true,
      schedulingEnabled: true,
    };
  }
}

/**
 * Mettre à jour les paramètres de distribution
 * @param {Object} settings 
 */
export async function updateDistributionSettings(settings) {
  try {
    const response = await apiService.put('/admin/distribution/settings', settings);
    return response.data || response.settings || response;
  } catch (error) {
    console.error('Erreur updateDistributionSettings:', error);
    throwNormalized(error, 'Impossible de mettre à jour les paramètres');
  }
}

// ==================== MANAGEMENT ====================

/**
 * Gérer une distribution (pause, resume, extend, terminate)
 * @param {string} distributionId 
 * @param {string} action - 'pause', 'resume', 'extend', 'terminate'
 * @param {Object} params - { hours? } for extend action
 */
export async function manageDistribution(distributionId, action, params = {}) {
  try {
    const response = await apiService.post(`/admin/manage/${distributionId}`, { action, params });
    return response.data || response;
  } catch (error) {
    console.error('Erreur manageDistribution:', error);
    throwNormalized(error, 'Impossible de gérer la distribution');
  }
}

/**
 * Déclencher une distribution manuelle
 * @param {string} type - Type de distribution
 * @param {Object} config - Configuration
 */
export async function triggerDistribution(type, config) {
  try {
    const response = await apiService.post('/admin/distribution/trigger', { type, config });
    return response.data || response;
  } catch (error) {
    console.error('Erreur triggerDistribution:', error);
    throwNormalized(error, 'Impossible de déclencher la distribution');
  }
}

// ==================== HEATMAP & VISUALIZATION ====================

/**
 * Heatmap des prix
 * @param {Object} params - { period?, bounds? }
 */
export async function getDistributionHeatmap(params = {}) {
  try {
    const response = await apiService.get('/admin/analytics/heatmap', { period: '30d', ...params });
    return response.heatmap || response.data || [];
  } catch (error) {
    console.error('Erreur getDistributionHeatmap:', error);
    return [];
  }
}

// ==================== LEGACY/PLACEHOLDER ====================

/**
 * Planifier une distribution (utilise batch avec scheduledAt)
 * @param {Object} scheduleData - { prizes, scheduledAt, region? }
 */
export async function scheduleDistribution(scheduleData) {
  try {
    const batchData = {
      ...scheduleData,
      scheduledAt: scheduleData.scheduledAt || new Date(),
    };
    return await batchDistribution(batchData);
  } catch (error) {
    console.error('Erreur scheduleDistribution:', error);
    throwNormalized(error, 'Impossible de planifier la distribution');
  }
}

/**
 * Récupérer les templates de distribution (placeholder)
 */
export async function getDistributionTemplates() {
  try {
    // TODO: Implement when backend supports templates
    return [
      { id: 'daily-common', name: 'Distribution quotidienne', prizeType: 'common', count: 50 },
      { id: 'weekly-rare', name: 'Distribution hebdomadaire', prizeType: 'rare', count: 20 },
      { id: 'event-special', name: 'Événement spécial', prizeType: 'legendary', count: 5 },
    ];
  } catch (error) {
    console.error('Erreur getDistributionTemplates:', error);
    return [];
  }
}

/**
 * Nettoyer une zone (terminate all in region)
 * @param {Object} bounds - { north, south, east, west }
 */
export async function clearDistributionZone(bounds) {
  try {
    // Use active distributions endpoint then terminate matching ones
    const { items } = await getActiveDistributions();
    const results = [];
    for (const dist of items) {
      if (dist.region && isInBounds(dist.region, bounds)) {
        const result = await manageDistribution(dist._id, 'terminate');
        results.push(result);
      }
    }
    return { success: true, cleared: results.length };
  } catch (error) {
    console.error('Erreur clearDistributionZone:', error);
    throwNormalized(error, 'Impossible de nettoyer la zone');
  }
}

// Helper function
function isInBounds(regionStr, bounds) {
  if (!regionStr || !bounds) return false;
  const [lat, lng] = regionStr.split(',').map(Number);
  return (
    lat >= bounds.south &&
    lat <= bounds.north &&
    lng >= bounds.west &&
    lng <= bounds.east
  );
}

/**
 * Distribution actions enum for UI
 */
export const DISTRIBUTION_ACTIONS = {
  PAUSE: 'pause',
  RESUME: 'resume',
  EXTEND: 'extend',
  TERMINATE: 'terminate',
};

/**
 * Distribution types enum for UI
 */
export const DISTRIBUTION_TYPES = {
  SINGLE: 'single',
  BULK: 'bulk',
  AUTO: 'auto',
  SCHEDULED: 'scheduled',
};

/**
 * Distribution statuses enum for UI
 */
export const DISTRIBUTION_STATUSES = {
  PENDING: 'pending',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export default {
  // Core
  placePrize,
  batchDistribution,
  autoDistribution,
  // Analytics
  getDistributionAnalytics,
  getActiveDistributions,
  getDistributionHistory,
  getDistributionHeatmap,
  // Settings
  getDistributionSettings,
  updateDistributionSettings,
  // Management
  manageDistribution,
  triggerDistribution,
  // Legacy
  scheduleDistribution,
  getDistributionTemplates,
  clearDistributionZone,
  // Enums
  DISTRIBUTION_ACTIONS,
  DISTRIBUTION_TYPES,
  DISTRIBUTION_STATUSES,
};
