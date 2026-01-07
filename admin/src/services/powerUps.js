/**
 * YallaCatch! Power-Ups Service
 * Manages power-up items for the game (radar boost, double points, etc.)
 */

import apiService from './api';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

/**
 * Get all power-ups with optional filters
 * @param {Object} params - { enabled?: boolean, type?: string, rarity?: string }
 */
export async function getPowerUps(params = {}) {
  try {
    const response = await apiService.get('/admin/power-ups', params);
    return {
      items: response.data || response.powerUps || [],
      count: response.count || 0,
      success: response.success ?? true,
    };
  } catch (error) {
    console.error('getPowerUps error:', error);
    throwNormalized(error, 'Impossible de récupérer les power-ups');
  }
}

/**
 * Get a single power-up by ID
 * @param {string} powerUpId 
 */
export async function getPowerUpById(powerUpId) {
  try {
    const response = await apiService.get(`/admin/power-ups/${powerUpId}`);
    return response.data || response.powerUp || response;
  } catch (error) {
    console.error('getPowerUpById error:', error);
    throwNormalized(error, 'Impossible de récupérer le power-up');
  }
}

/**
 * Create a new power-up
 * @param {Object} powerUpData - { name, description, type, durationMs, dropRate, maxPerSession, maxInInventory, effects, rarity?, icon?, notes? }
 */
export async function createPowerUp(powerUpData) {
  try {
    const response = await apiService.post('/admin/power-ups', powerUpData);
    return response.data || response.powerUp || response;
  } catch (error) {
    console.error('createPowerUp error:', error);
    throwNormalized(error, 'Impossible de créer le power-up');
  }
}

/**
 * Update an existing power-up
 * @param {string} powerUpId 
 * @param {Object} powerUpData 
 */
export async function updatePowerUp(powerUpId, powerUpData) {
  try {
    const response = await apiService.patch(`/admin/power-ups/${powerUpId}`, powerUpData);
    return response.data || response.powerUp || response;
  } catch (error) {
    console.error('updatePowerUp error:', error);
    throwNormalized(error, 'Impossible de mettre à jour le power-up');
  }
}

/**
 * Delete a power-up
 * @param {string} powerUpId 
 */
export async function deletePowerUp(powerUpId) {
  try {
    await apiService.delete(`/admin/power-ups/${powerUpId}`);
    return { success: true };
  } catch (error) {
    console.error('deletePowerUp error:', error);
    throwNormalized(error, 'Impossible de supprimer le power-up');
  }
}

/**
 * Toggle power-up enabled/disabled status
 * Uses PATCH endpoint to update the enabled field
 * @param {string} powerUpId 
 * @param {boolean} enabled - New enabled state
 */
export async function togglePowerUp(powerUpId, enabled) {
  try {
    const response = await apiService.patch(`/admin/power-ups/${powerUpId}`, { enabled });
    return response.data || response.powerUp || response;
  } catch (error) {
    console.error('togglePowerUp error:', error);
    throwNormalized(error, 'Impossible de basculer le statut du power-up');
  }
}

/**
 * Get power-up analytics
 * @param {string} powerUpId - Optional specific power-up ID, or 'all' for all analytics
 * @param {Object} params - { startDate?, endDate?, type? }
 */
export async function getPowerUpAnalytics(powerUpId = 'all', params = {}) {
  try {
    // If powerUpId is 'all' or not provided, get all analytics
    const endpoint = powerUpId === 'all' || !powerUpId 
      ? '/admin/power-ups/analytics/all' 
      : `/admin/power-ups/${powerUpId}/analytics`;
    
    const response = await apiService.get(endpoint, params);
    return response.data || response.analytics || {};
  } catch (error) {
    console.error('getPowerUpAnalytics error:', error);
    return {};
  }
}

/**
 * Power-up types enum for UI
 */
export const POWER_UP_TYPES = {
  RADAR_BOOST: 'radar_boost',
  DOUBLE_POINTS: 'double_points',
  SPEED_BOOST: 'speed_boost',
  SHIELD: 'shield',
  TIME_EXTENSION: 'time_extension',
};

/**
 * Power-up rarities enum for UI
 */
export const POWER_UP_RARITIES = {
  COMMON: 'common',
  RARE: 'rare',
  EPIC: 'epic',
  LEGENDARY: 'legendary',
};

export default {
  getPowerUps,
  getPowerUpById,
  createPowerUp,
  updatePowerUp,
  deletePowerUp,
  togglePowerUp,
  getPowerUpAnalytics,
  POWER_UP_TYPES,
  POWER_UP_RARITIES,
};
