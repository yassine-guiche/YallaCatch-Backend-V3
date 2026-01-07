/**
 * YallaCatch! Users Service
 */

import apiService from './api';
import { mapBackendUser, mapArray } from '../utils/mappers';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

/**
 * Obtenir la liste des utilisateurs avec filtres et pagination
 */
export async function getUsers(params = {}) {
  try {
    const response = await apiService.getUsers(params);
    
    // Mapper les utilisateurs backend vers format frontend
    const rawUsers = response.users || response.data?.users || response.data || [];
    const users = mapArray(rawUsers, mapBackendUser);
    
    return {
      items: users,
      total: response.total || response.pagination?.total || response.data?.total || users.length,
      page: response.page || response.pagination?.page || response.data?.page || 1,
      limit: response.limit || response.pagination?.limit || response.data?.limit || 20,
      hasMore: response.hasMore || response.pagination?.hasMore || response.data?.hasMore || false
    };
  } catch (error) {
    console.error('getUsers error:', error);
    throwNormalized(error, 'Impossible de lister les utilisateurs');
  }
}

/**
 * Obtenir un utilisateur par ID
 */
export async function getUserById(userId) {
  try {
    const response = await apiService.getUser(userId);
    const raw = response.user || response.data || response;
    const mapped = mapBackendUser(raw);
    const recentActivity = Array.isArray(raw?.recentActivity)
      ? raw.recentActivity.map((a) => ({
          ...a,
          claimedAt: a?.claimedAt ? new Date(a.claimedAt) : null,
        }))
      : [];
    return {
      ...mapped,
      stats: raw?.stats || {},
      recentActivity,
    };
  } catch (error) {
    console.error("getUserById error:", error);
    throwNormalized(error, "Impossible de charger l'utilisateur");
  }
}

/**
 * Mettre à jour le statut d'un utilisateur
 */
export async function setUserStatus(userId, action) {
  try {
    let status;
    
    switch (action) {
      case 'activate':
        await apiService.updateUser(userId, { status: 'active' });
        status = 'active';
        break;
      case 'deactivate':
        await apiService.updateUser(userId, { status: 'suspended' });
        status = 'suspended';
        break;
      case 'ban':
        await apiService.banUser(userId, 'Banni par admin', 'permanent');
        status = 'banned';
        break;
      default:
        throw new Error(`Action inconnue: ${action}`);
    }
    
    return status;
  } catch (error) {
    console.error('setUserStatus error:', error);
    throwNormalized(error, 'Impossible de mettre à jour le statut');
  }
}

/**
 * Bannir un utilisateur
 */
export async function banUser(userId, reason, durationHours) {
  try {
    const duration = typeof durationHours === 'number' ? durationHours : undefined;
    await apiService.banUser(userId, reason, duration);
    return { success: true };
  } catch (error) {
    console.error('banUser error:', error);
    throwNormalized(error, "Impossible de bannir l'utilisateur");
  }
}

/**
 * Débannir un utilisateur
 */
export async function unbanUser(userId) {
  try {
    await apiService.unbanUser(userId);
    return { success: true };
  } catch (error) {
    console.error('unbanUser error:', error);
    throwNormalized(error, "Impossible de débannir l'utilisateur");
  }
}

/**
 * Ajouter des points à un utilisateur
 */
export async function addUserPoints(userId, points, reason = 'Ajout manuel par admin') {
  try {
    await apiService.addUserPoints(userId, Number(points), reason);
    return { success: true };
  } catch (error) {
    console.error('addUserPoints error:', error);
    throwNormalized(error, "Impossible d'ajouter des points");
  }
}

/**
 * Mettre à jour un utilisateur
 */
export async function updateUser(userId, updates) {
  try {
    const response = await apiService.updateUser(userId, updates);
    return mapBackendUser(response.user || response.data);
  } catch (error) {
    console.error('updateUser error:', error);
    throwNormalized(error, "Impossible de mettre à jour l'utilisateur");
  }
}

/**
 * Supprimer un utilisateur
 */
export async function deleteUser(userId) {
  try {
    await apiService.deleteUser(userId);
    return { success: true };
  } catch (error) {
    console.error('deleteUser error:', error);
    throwNormalized(error, "Impossible de supprimer l'utilisateur");
  }
}

/**
 * Lister les utilisateurs avec filtres avancés et pagination
 */
export async function listUsers({
  status = 'all',
  level = 'all',
  city = 'all',
  search = '',
  pageSize = 20,
  cursor = null,
  orderByField = 'createdAt',
  orderDirection = 'desc',
} = {}) {
  try {
    // Construire les paramètres de requête
    const params = {
      limit: pageSize,
      sortBy: orderByField,
      order: orderDirection,
    };
    
    // Ajouter les filtres
    if (status && status !== 'all') {
      params.status = status;
    }
    
    if (level && level !== 'all') {
      params.level = level;
    }
    
    if (city && city !== 'all') {
      params.city = city;
    }
    
    if (search && search.trim()) {
      params.search = search.trim();
    }
    
    // Pagination par cursor (si supporté par le backend)
    if (cursor) {
      params.cursor = cursor;
    }
    
    const response = await apiService.getUsers(params);
    
    // Mapper les utilisateurs
    const users = mapArray(response.users || response.data || [], mapBackendUser);
    
    return {
      items: users,
      lastDoc: response.nextCursor || null,
      hasMore: response.hasMore || false,
      total: response.total || users.length
    };
  } catch (error) {
    console.error('listUsers error:', error);
    throwNormalized(error, 'Impossible de lister les utilisateurs');
  }
}

/**
 * Compter les utilisateurs avec filtres
 */
export async function countUsers({
  status = 'all',
  level = 'all',
  city = 'all',
  search = '',
} = {}) {
  try {
    const params = {};
    
    if (status && status !== 'all') {
      params.status = status;
    }
    
    if (level && level !== 'all') {
      params.level = level;
    }
    
    if (city && city !== 'all') {
      params.city = city;
    }
    
    if (search && search.trim()) {
      params.search = search.trim();
    }
    
    const response = await apiService.getUsers({ ...params, limit: 1 });
    return response.total || 0;
  } catch (error) {
    console.error('countUsers error:', error);
    return 0;
  }
}

/**
 * S'abonner aux mises à jour des utilisateurs en temps réel (via WebSocket)
 */
export function subscribeUsers(callback) {
  // Charger les utilisateurs initialement
  getUsers().then(result => {
    callback(result.items);
  }).catch(error => {
    console.error('subscribeUsers initial load error:', error);
    callback([]);
  });
  
  // TODO: Implémenter l'écoute WebSocket pour les mises à jour temps réel
  // import wsService from './websocket';
  // wsService.on('user_update', (data) => {
  //   // Recharger les utilisateurs ou mettre à jour localement
  // });
  
  // Retourner une fonction de désinscription
  return () => {
    // Désinscrire du WebSocket si implémenté
  };
}

/**
 * Obtenir les statistiques des utilisateurs
 */
export async function getUserStats() {
  try {
    const response = await apiService.getUserAnalytics({ period: '30d' });
    return response.stats || response.data || {};
  } catch (error) {
    console.error('getUserStats error:', error);
    return {};
  }
}

// Alias pour compatibilité
export const updateUserStatus = setUserStatus;
export const updateUserPoints = addUserPoints;

export default {
  getUsers,
  getUserById,
  setUserStatus,
  updateUserStatus,
  banUser,
  unbanUser,
  addUserPoints,
  updateUserPoints,
  updateUser,
  deleteUser,
  listUsers,
  countUsers,
  subscribeUsers,
  getUserStats,
};


