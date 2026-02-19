/**
 * Service Friendships - Gestion des relations d'amitié
 * APIs: 2 endpoints admin
 */

import apiService from './api';

/**
 * Récupérer les relations d'amitié
 */
export async function getFriendships(params = {}) {
  try {
    const response = await apiService.get('/admin/friendships', { params });
    const data = response?.data || response || {};
    return {
      friendships: data.friendships || [],
      total: data.total || 0,
      page: data.page || 1,
      limit: data.limit || 20
    };
  } catch (error) {
    console.error('Erreur getFriendships:', error);
    return { friendships: [], total: 0, page: 1, limit: 20 };
  }
}

/**
 * Supprimer une relation d'amitié
 */
export async function deleteFriendship(friendshipId) {
  try {
    const response = await apiService.delete(`/admin/friendships/${friendshipId}`);
    return response.data;
  } catch (error) {
    console.error('Erreur deleteFriendship:', error);
    throw error;
  }
}

export default {
  getFriendships,
  deleteFriendship
};
