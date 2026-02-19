/**
 * YallaCatch! Prizes Service
 */

import apiService from './api';
import { mapBackendPrize, mapArray } from '../utils/mappers';

const ALLOWED_CATEGORIES = ['electronics', 'gaming', 'lifestyle', 'shopping', 'food', 'entertainment'];
const ALLOWED_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
// Backend accepts: 'standard', 'geo_crypto', 'nft', 'coupon', 'physical'
const ALLOWED_TYPES = ['standard', 'geo_crypto', 'nft', 'coupon', 'physical'];

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

/**
 * Lister les prix (pagination + filtres)
 */
export async function getPrizes(params = {}) {
  try {
    const normalizedParams = {
      ...params,
      page: params.page ? Number(params.page) : undefined,
      limit: params.limit ? Number(params.limit) : undefined,
    };

    const response = await apiService.getPrizes(normalizedParams);
    const prizes = mapArray(response.prizes || response.data || [], mapBackendPrize);
    const pagination = response.pagination || {};
    const stats = response.stats || {};
    const normalizedStats = {
      active: stats.active || 0,
      captured: stats.captured ?? stats.claimed ?? 0,
      expired: stats.expired || 0,
      inactive: stats.inactive || 0,
      revoked: stats.revoked || 0,
      total: stats.total || pagination.total || 0,
    };

    return {
      items: prizes,
      total: pagination.total || response.total || prizes.length,
      page: pagination.page || response.page || 1,
      limit: pagination.limit || response.limit || 20,
      pages: pagination.pages || Math.ceil((pagination.total || prizes.length) / (pagination.limit || 20)),
      hasMore: response.hasMore || false,
      // Stats for ALL prizes in database (not just current page)
      stats: normalizedStats,
    };
  } catch (error) {
    console.error('getPrizes error:', error);
    throwNormalized(error, 'Impossible de lister les prix');
  }
}

/**
 * Obtenir un prix par ID
 */
export async function getPrizeById(prizeId) {
  try {
    const response = await apiService.getPrize(prizeId);
    return mapBackendPrize(response.prize || response.data);
  } catch (error) {
    console.error('getPrizeById error:', error);
    throwNormalized(error, 'Impossible de charger le prix');
  }
}

/**
 * Créer un prix unique (placé sur la carte)
 */
export async function createPrize(prizeData) {
  try {
    const safeName = prizeData.name?.trim() || 'Nouveau prix';
    const safeDescription =
      (prizeData.description && prizeData.description.trim().slice(0, 500)) ||
      'Prix disponible sur la carte';
    const category = ALLOWED_CATEGORIES.includes(prizeData.category)
      ? prizeData.category
      : 'lifestyle';
    const rarity = ALLOWED_RARITIES.includes(prizeData.rarity) ? prizeData.rarity : 'common';
    const type = ALLOWED_TYPES.includes(prizeData.type) ? prizeData.type : 'physical';

    const lat = typeof prizeData.latitude === 'number' ? prizeData.latitude : 36.8065;
    const lng = typeof prizeData.longitude === 'number' ? prizeData.longitude : 10.1815;
    const radius = typeof prizeData.radius === 'number' ? prizeData.radius : 50;
    const value = Math.max(1, Number(prizeData.points || prizeData.value || 0));
    const quantity = Number.isFinite(Number(prizeData.quantity)) ? Number(prizeData.quantity) : 1;

    const metadata = {};
    if (prizeData.bonusMultiplier !== undefined) metadata.bonusMultiplier = Number(prizeData.bonusMultiplier);
    if (prizeData.rewardId) metadata.rewardId = prizeData.rewardId;
    if (prizeData.probability !== undefined) metadata.probability = Number(prizeData.probability);

    // Direct/hybrid reward mapping
    let directReward;
    if ((prizeData.contentType === 'reward' || prizeData.contentType === 'hybrid') && prizeData.rewardId) {
      const prob = prizeData.contentType === 'hybrid'
        ? (Number(prizeData.probability) || 0)
        : 1;
      directReward = {
        rewardId: prizeData.rewardId,
        autoRedeem: true,
        probability: prob,
      };
    }

    const backendData = {
      name: safeName,
      description: safeDescription,
      category,
      rarity,
      type,
      displayType: prizeData.displayType || 'standard',
      contentType: prizeData.contentType || 'points',
      value,
      quantity,
      imageUrl: prizeData.imageUrl || undefined,
      city: prizeData.city || 'Tunis',
      latitude: lat,
      longitude: lng,
      radius,
      status: prizeData.status || 'active',
      metadata: Object.keys(metadata).length ? metadata : undefined,
      ...(directReward ? { directReward } : {}),
    };

    const response = await apiService.post('/admin/prizes', backendData);
    return mapBackendPrize(response.prize || response.data || response);
  } catch (error) {
    console.error('createPrize error:', error);
    throwNormalized(error, 'Impossible de créer le prix');
  }
}

// Alias
export async function addPrize(prizeData) {
  return createPrize(prizeData);
}

/**
 * Distribution en masse de prix (schéma /admin/batch)
 */
export async function addPrizesBatch(prizes) {
  try {
    if (!Array.isArray(prizes) || prizes.length === 0) {
      throw new Error("Aucune entrée fournie pour l'import");
    }

    const first = prizes[0];
    const safeCategory = ALLOWED_CATEGORIES.includes(first.category) ? first.category : 'lifestyle';
    const safeRarity = ALLOWED_RARITIES.includes(first.rarity || '') ? first.rarity : 'common';
    const safeType = ALLOWED_TYPES.includes(first.type) ? first.type : 'physical';
    const safeDescription =
      (first.description && first.description.trim().slice(0, 500)) ||
      'Distribution en masse de prix';

    const template = {
      title: first.name || 'Batch prize',
      description: safeDescription,
      category: safeCategory,
      type: safeType,
      rarity: safeRarity,
      displayType: first.displayType || 'standard',
      contentType: first.contentType || 'points',
      image: first.imageUrl || 'https://picsum.photos/200',
      content: {
        points: Number(first.points || first.pointsReward || 100),
        tags: first.tags || [],
      },
    };

    const locations = prizes.map((p, idx) => {
      const latitude = p.latitude ?? p.lat ?? 36.8065 + idx * 0.0001;
      const longitude = p.longitude ?? p.lng ?? 10.1815 + idx * 0.0001;
      const city = p.city || first.city || 'Tunis';
      return {
        latitude,
        longitude,
        city,
        address: p.address,
        radius: Number(p.radius || first.radius || 50),
      };
    });

    const payload = {
      template,
      locations,
      distributionMode: 'sequential',
    };

    const response = await apiService.distributePrizesBatch(payload);
    return mapArray(response.prizes || response.data || [], mapBackendPrize);
  } catch (error) {
    console.error('addPrizesBatch error:', error);
    throwNormalized(error, 'Distribution en masse impossible');
  }
}

/**
 * Mettre à jour un prix
 */
export async function updatePrize(prizeId, updates) {
  try {
    const backendUpdates = {
      name: updates.name,
      description: updates.description,
      category: updates.category,
      rarity: updates.rarity,
      type: updates.type,
      displayType: updates.displayType,
      contentType: updates.contentType,
      value: updates.pointsReward ?? updates.value,
      quantity: updates.quantity,
      imageUrl: updates.imageUrl,
      city: updates.city,
      latitude: updates.latitude,
      longitude: updates.longitude,
      radius: updates.radius,
      status:
        updates.isActive !== undefined
          ? updates.isActive
            ? 'active'
            : 'inactive'
          : updates.status,
      metadata: updates.metadata,
    };

    const response = await apiService.updatePrize(prizeId, backendUpdates);
    return mapBackendPrize(response.prize || response.data || response);
  } catch (error) {
    console.error('updatePrize error:', error);
    throwNormalized(error, 'Impossible de mettre à jour le prix');
  }
}

/**
 * Supprimer un prix
 */
export async function removePrize(prizeId) {
  try {
    await apiService.deletePrize(prizeId);
    return { success: true };
  } catch (error) {
    console.error('removePrize error:', error);
    throwNormalized(error, 'Impossible de supprimer le prix');
  }
}

export const deletePrize = removePrize;

/**
 * Opérations en masse
 */
export async function bulkUpdatePrizes(ids, action) {
  try {
    const promises = ids.map((id) => {
      switch (action) {
        case 'activate':
          return apiService.updatePrizeStatus(id, 'active');
        case 'deactivate':
          return apiService.updatePrizeStatus(id, 'inactive');
        case 'delete':
          return apiService.deletePrize(id);
        default:
          return Promise.resolve();
      }
    });

    await Promise.all(promises);
    return { success: true };
  } catch (error) {
    console.error('bulkUpdatePrizes error:', error);
    throwNormalized(error, 'Mise à jour groupée des prix impossible');
  }
}

/**
 * Lister les prix avec filtres avancés et pagination
 */
export async function listPrizes({ pageSize = 50, cursor = null } = {}) {
  try {
    const params = {
      limit: pageSize,
      sortBy: 'createdAt',
      order: 'desc',
    };

    if (cursor) {
      params.cursor = cursor;
    }

    const response = await apiService.getPrizes(params);
    const prizes = mapArray(response.prizes || response.data || [], mapBackendPrize);

    return {
      items: prizes,
      lastDoc: response.nextCursor || null,
      hasMore: response.hasMore || false,
    };
  } catch (error) {
    console.error('listPrizes error:', error);
    throwNormalized(error, 'Impossible de lister les prix');
  }
}

/**
 * Lister les prix avec filtres
 */
export async function listPrizesFiltered({
  status = 'all',
  type = 'all',
  zone = 'all',
  search = '',
  pageSize = 50,
  cursor = null,
  orderByField = 'createdAt',
  orderDirection = 'desc',
} = {}) {
  try {
    const params = {
      limit: pageSize,
      sortBy: orderByField,
      order: orderDirection,
    };

    if (status !== 'all') {
      params.status = status;
    }

    if (type !== 'all') {
      params.type = type;
    }

    if (zone !== 'all') {
      params.city = zone;
    }

    if (search && search.trim()) {
      params.search = search.trim();
    }

    if (cursor) {
      params.cursor = cursor;
    }

    const response = await apiService.getPrizes(params);
    const prizes = mapArray(response.prizes || response.data || [], mapBackendPrize);

    return {
      items: prizes,
      lastDoc: response.nextCursor || null,
      hasMore: response.hasMore || false,
    };
  } catch (error) {
    console.error('listPrizesFiltered error:', error);
    throwNormalized(error, 'Impossible de filtrer les prix');
  }
}

/**
 * Compter les prix avec filtres
 */
export async function countPrizes({ status = 'all', type = 'all', zone = 'all', search = '' } = {}) {
  try {
    const params = { limit: 1 };

    if (status !== 'all') {
      params.status = status;
    }

    if (type !== 'all') {
      params.type = type;
    }

    if (zone !== 'all') {
      params.city = zone;
    }

    if (search && search.trim()) {
      params.search = search.trim();
    }

    const response = await apiService.getPrizes(params);
    return response.total || 0;
  } catch (error) {
    console.error('countPrizes error:', error);
    return 0;
  }
}

/**
 * Statistiques simples
 */
export async function getPrizeCounts() {
  try {
    const response = await apiService.getPrizeAnalytics({ period: '30d' });
    return {
      total: response.stats?.total || 0,
      active: response.stats?.active || 0,
      claimed: response.stats?.claimed || 0,
    };
  } catch (error) {
    console.error('getPrizeCounts error:', error);
    return { total: 0, active: 0, claimed: 0 };
  }
}

/**
 * Obtenir les prix à proximité d'une localisation
 */
export async function getNearbyPrizes(latitude, longitude, radius = 5000) {
  try {
    const response = await apiService.getNearbyPrizes({ latitude, longitude, radius });
    return mapArray(response.prizes || response.data || [], mapBackendPrize);
  } catch (error) {
    console.error('getNearbyPrizes error:', error);
    throw error;
  }
}

/**
 * S'abonner aux mises à jour des prix en temps réel
 */
export function subscribePrizes(callback, errorCallback) {
  // Charger initialement
  getPrizes().then(result => {
    callback(result.items || []);
  }).catch(error => {
    console.error('subscribePrizes initial load error:', error);
    if (errorCallback) errorCallback(error);
  });
  
  // TODO: Implémenter WebSocket pour mises à jour temps réel
  return () => {}; // Fonction de désinscription
}

export default {
  getPrizes,
  getPrizeById,
  addPrize,
  createPrize,
  addPrizesBatch,
  updatePrize,
  removePrize,
  deletePrize,
  bulkUpdatePrizes,
  listPrizes,
  listPrizesFiltered,
  countPrizes,
  getPrizeCounts,
  subscribePrizes,
  getNearbyPrizes,
};
