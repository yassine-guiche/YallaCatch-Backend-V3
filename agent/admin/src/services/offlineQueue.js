/**
 * Service Offline Queue - Gestion de la file d'attente hors ligne
 * APIs: 2 endpoints admin
 */

import apiService from './api';

/**
 * Récupérer les éléments de la file d'attente hors ligne
 */
export async function getOfflineQueue(params = {}) {
  try {
    const response = await apiService.get('/admin/offline-queue', { params });
    // Handle various response structures
    const data = response?.data || response || {};
    return {
      items: data.items || data.data?.items || data.queue || [],
      total: data.total || data.data?.total || 0,
      page: data.page || data.data?.page || 1,
      limit: data.limit || data.data?.limit || 20
    };
  } catch (error) {
    console.error('Erreur getOfflineQueue:', error);
    return { items: [], total: 0, page: 1, limit: 20 };
  }
}

/**
 * Supprimer les éléments résolus de la file d'attente
 */
export async function clearResolvedQueue() {
  try {
    const response = await apiService.delete('/admin/offline-queue/clear');
    return response.data;
  } catch (error) {
    console.error('Erreur clearResolvedQueue:', error);
    throw error;
  }
}

export default {
  getOfflineQueue,
  clearResolvedQueue
};
