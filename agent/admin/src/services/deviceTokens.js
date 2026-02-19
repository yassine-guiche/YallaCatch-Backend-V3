/**
 * Service Device Tokens - Gestion des tokens de notification push
 * APIs: 3 endpoints admin
 */

import apiService from './api';

/**
 * Récupérer les tokens de notification
 */
export async function getDeviceTokens(params = {}) {
  try {
    const response = await apiService.get('/admin/device-tokens', { params });
    // Handle various response structures
    const data = response?.data || response || {};
    return {
      tokens: data.tokens || data.data?.tokens || [],
      total: data.total || data.data?.total || 0,
      page: data.page || data.data?.page || 1,
      limit: data.limit || data.data?.limit || 20
    };
  } catch (error) {
    console.error('Erreur getDeviceTokens:', error);
    return { tokens: [], total: 0, page: 1, limit: 20 };
  }
}

/**
 * Récupérer les statistiques des tokens
 */
export async function getDeviceTokenStats() {
  try {
    const response = await apiService.get('/admin/device-tokens/stats');
    // Handle various response structures
    const data = response?.data || response || {};
    return {
      total: data.total || data.data?.total || 0,
      byPlatform: data.byPlatform || data.data?.byPlatform || []
    };
  } catch (error) {
    console.error('Erreur getDeviceTokenStats:', error);
    return { total: 0, byPlatform: [] };
  }
}

/**
 * Révoquer un token de notification
 */
export async function revokeDeviceToken(tokenId) {
  try {
    const response = await apiService.delete(`/admin/device-tokens/${tokenId}`);
    return response.data;
  } catch (error) {
    console.error('Erreur revokeDeviceToken:', error);
    throw error;
  }
}

export default {
  getDeviceTokens,
  getDeviceTokenStats,
  revokeDeviceToken
};
