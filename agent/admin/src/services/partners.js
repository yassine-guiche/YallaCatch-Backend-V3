/**
 * Service Partners - Gestion des partenaires commerciaux
 * APIs: 6 endpoints
 */

import apiService from './api';
import { mapBackendPartner, mapFrontendPartner } from '../utils/mappers';

/**
 * Récupérer la liste des partenaires
 */
export async function getPartners(params = {}) {
  try {
    const normalizedParams = {
      ...params,
      page: params.page ? Number(params.page) : undefined,
      limit: params.limit ? Number(params.limit) : undefined,
    };

    const response = await apiService.get('/admin/partners', { params: normalizedParams });

    // Handle different response structures
    const data = response.data || response;
    const partnersArray = data.partners || data.items || data || [];

    return {
      items: Array.isArray(partnersArray) ? partnersArray.map(mapBackendPartner) : [],
      total: data.pagination?.total || data.total || 0,
      page: data.pagination?.page || data.page || 1,
      limit: data.pagination?.limit || data.limit || normalizedParams.limit || 20,
      pages: data.pagination?.pages || 1,
    };
  } catch (error) {
    console.error('Erreur getPartners:', error);
    return { items: [], total: 0, page: 1, limit: 20, pages: 1 };
  }
}

/**
 * Récupérer un partenaire par ID
 */
export async function getPartnerById(partnerId) {
  try {
    const response = await apiService.get(`/admin/partners/${partnerId}`);
    return mapBackendPartner(response.data.partner || response.data);
  } catch (error) {
    console.error('Erreur getPartnerById:', error);
    throw error;
  }
}

/**
 * Créer un nouveau partenaire
 */
export async function createPartner(partnerData) {
  try {
    const mapped = mapFrontendPartner(partnerData);
    const response = await apiService.post('/admin/partners', mapped);
    const payload = response.data || response;
    return {
      partner: mapBackendPartner(payload.partner || payload),
      credentials: payload.credentials || null,
    };
  } catch (error) {
    console.error('Erreur createPartner:', error);
    throw error;
  }
}

/**
 * Mettre à jour un partenaire
 */
export async function updatePartner(partnerId, partnerData) {
  try {
    const mapped = mapFrontendPartner(partnerData);
    const response = await apiService.put(`/admin/partners/${partnerId}`, mapped);
    // Handle various response structures safely
    const payload = response?.data || response;
    if (!payload) {
      throw new Error('Empty response from server');
    }
    return mapBackendPartner(payload.partner || payload);
  } catch (error) {
    console.error('Erreur updatePartner:', error);
    throw error;
  }
}

/**
 * Supprimer un partenaire
 */
export async function deletePartner(partnerId) {
  try {
    await apiService.delete(`/admin/partners/${partnerId}`);
    return { success: true };
  } catch (error) {
    console.error('Erreur deletePartner:', error);
    throw error;
  }
}

/**
 * Récupérer les statistiques d'un partenaire
 */
export async function getPartnerStats(partnerId, limitRecent = 5) {
  try {
    const response = await apiService.get(`/admin/partners/${partnerId}/stats`, {
      params: { limitRecent }
    });
    const payload = response?.data || response;
    return payload?.data || payload?.stats || payload;
  } catch (error) {
    console.error('Erreur getPartnerStats:', error);
    throw error;
  }
}

/**
 * Récupérer l'email / userId du compte portail partenaire
 */
export async function getPartnerCredentials(partnerId) {
  try {
    const response = await apiService.get(`/admin/partners/${partnerId}/credentials`);
    return response.data.credentials;
  } catch (error) {
    console.error('Erreur getPartnerCredentials:', error);
    throw error;
  }
}

/**
 * Réinitialiser le mot de passe portail partenaire
 */
export async function resetPartnerCredentials(partnerId, newPassword) {
  try {
    const response = await apiService.post(`/admin/partners/${partnerId}/reset-credentials`, {
      newPassword,
    });
    const payload = response.data || response || {};
    return payload.credentials || payload.data?.credentials || payload;
  } catch (error) {
    console.error('Erreur resetPartnerCredentials:', error);
    throw error;
  }
}

/**
 * Récupérer les offres d'un partenaire
 */
export async function getPartnerOffers(partnerId) {
  try {
    const response = await apiService.get(`/admin/partners/${partnerId}/offers`);
    return response.data.offers || [];
  } catch (error) {
    console.error('Erreur getPartnerOffers:', error);
    throw error;
  }
}

/**
 * Ajouter un emplacement à un partenaire (admin)
 */
export async function addPartnerLocation(partnerId, location) {
  try {
    const response = await apiService.post(`/admin/partners/${partnerId}/locations`, location);
    const payload = response.data || response;
    return payload.data || payload.location || payload;
  } catch (error) {
    console.error('Erreur addPartnerLocation:', error);
    throw error;
  }
}

/**
 * Mettre à jour un emplacement d'un partenaire (admin)
 */
export async function updatePartnerLocation(partnerId, locationId, update) {
  try {
    const response = await apiService.put(`/admin/partners/${partnerId}/locations/${locationId}`, update);
    const payload = response.data || response;
    return payload.data || payload.location || payload;
  } catch (error) {
    console.error('Erreur updatePartnerLocation:', error);
    throw error;
  }
}

/**
 * Récupérer les emplacements d'un partenaire (admin)
 */
export async function getPartnerLocationsAdmin(partnerId) {
  try {
    const response = await apiService.get(`/admin/partners/${partnerId}/locations`);
    const payload = response.data || response;
    return payload.data || payload.locations || [];
  } catch (error) {
    console.error('Erreur getPartnerLocationsAdmin:', error);
    throw error;
  }
}

/**
 * Obtenir les analytics globales des partenaires
 * @param {Object} params - { period?: string }
 */
export async function getPartnerAnalytics(params = {}) {
  try {
    const response = await apiService.get('/admin/partners/analytics', { params });
    const payload = response?.data || response;
    return payload.stats || payload.data || payload || {};
  } catch (error) {
    console.error('getPartnerAnalytics error:', error);
    return {};
  }
}

/**
 * Obtenir les catégories de partenaires disponibles
 * @returns {Array<{value: string, label: string}>}
 */
export function getPartnerCategories() {
  return [
    { value: 'food', label: 'Restauration' },
    { value: 'shopping', label: 'Shopping' },
    { value: 'entertainment', label: 'Divertissement' },
    { value: 'travel', label: 'Voyage' },
    { value: 'technology', label: 'Technologie' },
    { value: 'health', label: 'Santé' },
    { value: 'education', label: 'Éducation' },
    { value: 'services', label: 'Services' }
  ];
}

/**
 * Obtenir les partenaires à proximité d'un emplacement
 */
export async function getNearbyPartners(params = {}) {
  try {
    const response = await apiService.get('/admin/partners/nearby', { params });
    const data = response.data || response;
    const items = data.partners || data.items || data || [];
    return Array.isArray(items) ? items.map(mapBackendPartner) : [];
  } catch (error) {
    console.error('Erreur getNearbyPartners:', error);
    return [];
  }
}

/**
 * Approuver un partenaire
 */
export async function approvePartner(partnerId) {
  try {
    const response = await apiService.post(`/admin/partners/${partnerId}/approve`);
    return response.data || response;
  } catch (error) {
    console.error('Erreur approvePartner:', error);
    throw error;
  }
}

export default {
  getPartners,
  getPartnerById,
  createPartner,
  updatePartner,
  deletePartner,
  getPartnerStats,
  getPartnerCredentials,
  resetPartnerCredentials,
  addPartnerLocation,
  updatePartnerLocation,
  getPartnerLocationsAdmin,
  getPartnerOffers,
  getPartnerAnalytics,
  getPartnerCategories,
  getNearbyPartners,
  approvePartner,
};
