/**
 * YallaCatch! Rewards Service
 */

import apiService from './api';
import { mapBackendReward, mapBackendRedemption, mapArray } from '../utils/mappers';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

/**
 * S'abonner aux mises à jour des récompenses en temps réel
 */
export function subscribeRewards(callback, errorCallback) {
  // Charger initialement
  listRewards().then(result => {
    callback(result.items);
  }).catch(error => {
    console.error('subscribeRewards initial load error:', error);
    if (errorCallback) errorCallback(error);
  });

  // TODO: Implémenter WebSocket pour mises à jour temps réel
  // import wsService from './websocket';
  // wsService.on('reward_update', () => { /* recharger */ });

  return () => { }; // Fonction de désinscription
}

/**
 * Lister les récompenses avec pagination
 */
export async function listRewards({ pageSize = 50, cursor = null } = {}) {
  try {
    const params = {
      limit: pageSize,
      sortBy: 'createdAt',
      order: 'desc'
    };

    if (cursor) {
      params.page = parseInt(cursor) + 1;
    }

    const response = await apiService.getRewards(params);
    const items = mapArray(response.rewards || response.data || [], mapBackendReward);

    return {
      items,
      lastDoc: response.page?.toString() || null,
      hasMore: response.hasMore || false
    };
  } catch (error) {
    console.error('listRewards error:', error);
    throwNormalized(error, 'Impossible de lister les récompenses');
  }
}

/**
 * Obtenir les statistiques des récompenses
 */
export async function getRewardCounts() {
  try {
    const response = await apiService.getRewardAnalytics({ period: '30d' });
    return {
      total: response.stats?.total || 0,
      active: response.stats?.active || 0
    };
  } catch (error) {
    console.error('getRewardCounts error:', error);
    return { total: 0, active: 0 };
  }
}

/**
 * Ajouter une nouvelle récompense
 */
export async function addReward(reward) {
  try {
    const backendData = {
      name: reward.name,
      description: reward.description || 'No description provided',
      category: reward.category || 'voucher', // Default to valid enum: voucher, gift_card, physical, digital, experience
      pointsCost: Number(reward.pointsRequired || reward.pointsCost || 100),
      stockQuantity: Number(reward.quantity || reward.stockQuantity || 0),
      isActive: reward.isActive !== false, // Default to true
      isPopular: !!reward.isPopular,
      metadata: reward.metadata || {},
    };

    // Only include imageUrl if it's a valid URL
    const imageUrl = reward.imageUrl || reward.image;
    if (imageUrl && imageUrl.startsWith('http')) {
      backendData.imageUrl = imageUrl;
    }

    // Only include partnerId if valid
    const partnerId = reward.partner?.id || reward.partnerId;
    if (partnerId) {
      backendData.partnerId = partnerId;
    }

    if (reward.listingType) {
      backendData.listingType = reward.listingType;
    }

    const response = await apiService.createReward(backendData);
    return mapBackendReward(response.reward || response.data || response);
  } catch (error) {
    console.error('addReward error:', error);
    throwNormalized(error, 'Impossible de créer la récompense');
  }
}

/**
 * Mettre à jour une récompense
 */
export async function updateReward(id, data) {
  try {
    const backendData = {};

    if (data.name !== undefined) backendData.name = data.name;
    if (data.description !== undefined) backendData.description = data.description;
    if (data.category !== undefined) backendData.category = data.category;
    if (data.pointsRequired !== undefined) backendData.pointsCost = data.pointsRequired;
    if (data.pointsCost !== undefined) backendData.pointsCost = data.pointsCost;
    if (data.quantity !== undefined) backendData.stockQuantity = data.quantity;
    if (data.stockQuantity !== undefined) backendData.stockQuantity = data.stockQuantity;
    if (data.imageUrl !== undefined) backendData.imageUrl = data.imageUrl;
    if (data.isActive !== undefined) backendData.isActive = data.isActive;
    // validityPeriod is not supported by backend schema, store in metadata if needed
    if (data.metadata !== undefined) backendData.metadata = data.metadata;
    if (data.listingType !== undefined) backendData.listingType = data.listingType;

    const response = await apiService.updateReward(id, backendData);
    return mapBackendReward(response.reward || response.data);
  } catch (error) {
    console.error('updateReward error:', error);
    throwNormalized(error, 'Impossible de mettre à jour la récompense');
  }
}

/**
 * Supprimer une récompense
 */
export async function removeReward(id) {
  try {
    await apiService.deleteReward(id);
    return { success: true };
  } catch (error) {
    console.error('removeReward error:', error);
    throwNormalized(error, 'Impossible de supprimer la récompense');
  }
}

/**
 * Opérations en masse sur les récompenses
 */
export async function bulkUpdateRewards(ids, action) {
  try {
    const promises = ids.map(id => {
      switch (action) {
        case 'activate':
          return apiService.updateReward(id, { isActive: true });
        case 'deactivate':
          return apiService.updateReward(id, { isActive: false });
        case 'delete':
          return apiService.deleteReward(id);
        default:
          return Promise.resolve();
      }
    });

    await Promise.all(promises);
    return { success: true };
  } catch (error) {
    console.error('bulkUpdateRewards error:', error);
    throwNormalized(error, 'Mise à jour groupée des récompenses impossible');
  }
}

/**
 * Obtenir une récompense par ID
 */
export async function getRewardById(id) {
  try {
    const response = await apiService.getReward(id);
    return mapBackendReward(response.reward || response.data);
  } catch (error) {
    const normalized = apiService.normalizeError(error, 'Impossible de récupérer la récompense');
    console.error('getRewardById error:', normalized);
    return null;
  }
}

/**
 * Lister les récompenses avec filtres
 */
export async function listRewardsFiltered({
  status = 'all',
  category = 'all',
  search = '',
  pageSize = 50,
  cursor = null,
  listingType = null,
} = {}) {
  try {
    const params = {
      limit: pageSize
    };

    if (status !== 'all') {
      params.status = status;
    }

    if (category !== 'all') {
      params.category = category;
    }

    if (search && search.trim()) {
      params.search = search.trim();
    }

    if (cursor) {
      params.page = parseInt(cursor) + 1;
    }

    if (listingType) {
      params.listingType = listingType;
    }

    const response = await apiService.getRewards(params);
    const items = mapArray(response.rewards || response.data || [], mapBackendReward);

    return {
      items,
      lastDoc: response.page?.toString() || null,
      hasMore: response.hasMore || false
    };
  } catch (error) {
    console.error('listRewardsFiltered error:', error);
    throwNormalized(error, 'Impossible de filtrer les récompenses');
  }
}

/**
 * Compter les récompenses avec filtres
 */
export async function countRewards({
  status = 'all',
  category = 'all',
  search = '',
} = {}) {
  try {
    const params = { limit: 1 };

    if (status !== 'all') params.status = status;
    if (category !== 'all') params.category = category;
    if (search && search.trim()) params.search = search.trim();

    const response = await apiService.getRewards(params);
    return response.total || 0;
  } catch (error) {
    console.error('countRewards error:', error);
    return 0;
  }
}

/**
 * Obtenir les catégories du marketplace
 */
export async function getMarketplaceCategories() {
  try {
    const response = await apiService.getMarketplaceCategories();
    return response.categories || response.data || [];
  } catch (error) {
    console.error('getMarketplaceCategories error:', error);
    return [];
  }
}

/**
 * Obtenir les récompenses vedettes
 */
export async function getFeaturedRewards() {
  try {
    const response = await apiService.getFeaturedRewards();
    const items = mapArray(response.rewards || response.data || [], mapBackendReward);
    return items;
  } catch (error) {
    console.error('getFeaturedRewards error:', error);
    return [];
  }
}

/**
 * Obtenir l'historique des échanges du marketplace
 */
export async function getMarketplaceHistory(params = {}) {
  try {
    const response = await apiService.getMarketplaceHistory(params);
    const items = mapArray(response.exchanges || response.data || [], mapBackendRedemption);

    return {
      items,
      total: response.total || items.length,
      hasMore: response.hasMore || false
    };
  } catch (error) {
    console.error('getMarketplaceHistory error:', error);
    return { items: [], total: 0, hasMore: false };
  }
}

// Alias pour compatibilité
export const getRewards = listRewards;
export const createReward = addReward;
export const deleteReward = removeReward;

export default {
  subscribeRewards,
  listRewards,
  getRewards,
  getRewardCounts,
  addReward,
  createReward,
  updateReward,
  removeReward,
  deleteReward,
  bulkUpdateRewards,
  getRewardById,
  listRewardsFiltered,
  countRewards,
  getMarketplaceCategories,
  getFeaturedRewards,
  getMarketplaceHistory,
};
