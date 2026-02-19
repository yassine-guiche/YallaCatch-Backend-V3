/**
 * Service Marketplace - Gestion du marketplace et des items
 */
import apiService from './api';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

// Liste des items marketplace (admin)
export async function getMarketplaceItems(params = {}) {
  try {
    const response = await apiService.get('/admin/marketplace/items', { params });
    const data = response?.data?.data ?? response?.data ?? response ?? {};
    return {
      items: data.items || data.rewards || (Array.isArray(data) ? data : []),
      total: data.total || data.pagination?.total || (data.items?.length || 0),
      page: data.page || data.pagination?.page || 1,
      limit: data.limit || data.pagination?.limit || params.limit || 20,
    };
  } catch (error) {
    console.error('Erreur getMarketplaceItems:', error);
    throwNormalized(error, 'Impossible de récupérer les items marketplace');
  }
}

// Détail d'un item marketplace
export async function getMarketplaceItemById(itemId) {
  try {
    const response = await apiService.get(`/admin/marketplace/items/${itemId}`);
    const data = response.data?.data || response.data;
    return data?.item || data;
  } catch (error) {
    console.error('Erreur getMarketplaceItemById:', error);
    throwNormalized(error, "Impossible de charger l'item marketplace");
  }
}

// Création
export async function createMarketplaceItem(itemData) {
  try {
    const payload = { ...itemData, listingType: 'MARKETPLACE_ITEM' };
    const response = await apiService.post('/admin/marketplace/items', payload);
    const data = response.data?.data || response.data;
    return data?.item || data;
  } catch (error) {
    console.error('Erreur createMarketplaceItem:', error);
    throwNormalized(error, "Impossible de créer l'item marketplace");
  }
}

// Mise à jour
export async function updateMarketplaceItem(itemId, itemData) {
  try {
    const response = await apiService.put(`/admin/marketplace/items/${itemId}`, itemData);
    const data = response.data?.data || response.data;
    return data?.item || data;
  } catch (error) {
    console.error('Erreur updateMarketplaceItem:', error);
    throwNormalized(error, "Impossible de mettre à jour l'item marketplace");
  }
}

// Suppression
export async function deleteMarketplaceItem(itemId) {
  try {
    await apiService.delete(`/admin/marketplace/items/${itemId}`);
    return { success: true };
  } catch (error) {
    console.error('Erreur deleteMarketplaceItem:', error);
    throwNormalized(error, "Impossible de supprimer l'item marketplace");
  }
}

// Catégories - Must match backend RewardCategory enum
export async function getMarketplaceCategories() {
  try {
    const response = await apiService.get('/marketplace/categories');
    const data = response.data?.data || response.data || {};
    return data.categories || data || [];
  } catch (error) {
    console.error('Erreur getMarketplaceCategories:', error);
    // Fallback: RewardCategory enum values from backend
    return [
      { value: 'voucher', label: "Bon d'Achat" },
      { value: 'gift_card', label: 'Carte Cadeau' },
      { value: 'physical', label: 'Produit Physique' },
      { value: 'digital', label: 'Produit Numérique' },
      { value: 'experience', label: 'Expérience' },
    ];
  }
}

// Analytics marketplace
export async function getMarketplaceAnalytics(timeframe = '30d') {
  try {
    const response = await apiService.get('/admin/marketplace/stats', { params: { timeframe } });
    return response.data?.data || response.data || {};
  } catch (error) {
    console.error('Erreur getMarketplaceAnalytics:', error);
    throwNormalized(error, 'Impossible de récupérer les analytics marketplace');
  }
}

// Achats/redemptions marketplace
export async function getMarketplacePurchases(params = {}) {
  try {
    const response = await apiService.get('/admin/marketplace/redemptions', { params });
    const data = response.data?.data || response.data || {};
    return {
      items: data.redemptions || data.items || [],
      total: data.total || data.pagination?.total || (data.redemptions?.length || 0),
    };
  } catch (error) {
    console.error('Erreur getMarketplacePurchases:', error);
    throwNormalized(error, 'Impossible de récupérer les achats marketplace');
  }
}

// Achat (test)
export async function purchaseMarketplaceItem(itemId, quantity = 1) {
  try {
    const response = await apiService.post('/marketplace/purchase', { itemId, quantity });
    const data = response.data?.data || response.data || {};
    return data.purchase || data;
  } catch (error) {
    const info = apiService.getErrorInfo(error, "Impossible d'acheter l'item marketplace");
    if (info.code === 'OUT_OF_STOCK' || info.code === 'REWARD_NOT_AVAILABLE') {
      throw apiService.normalizeError({ ...error, code: info.code, message: 'Stock insuffisant ou récompense indisponible' });
    }
    console.error('Erreur purchaseMarketplaceItem:', info);
    throwNormalized(error, "Impossible d'acheter l'item marketplace");
  }
}

// Get pending items for approval
export async function getPendingItems(params = {}) {
  try {
    const response = await apiService.get('/admin/marketplace/pending', { params });
    const data = response?.data?.data ?? response?.data ?? response ?? {};
    return {
      items: data.items || (Array.isArray(data) ? data : []),
      total: data.total || (data.items?.length || 0),
      page: data.page || 1,
      limit: data.limit || params.limit || 20,
    };
  } catch (error) {
    console.error('Erreur getPendingItems:', error);
    throwNormalized(error, 'Impossible de récupérer les items en attente');
  }
}

// Approve a marketplace item
export async function approveMarketplaceItem(itemId) {
  try {
    const response = await apiService.post(`/admin/marketplace/items/${itemId}/approve`);
    const data = response.data?.data || response.data;
    return data?.item || data;
  } catch (error) {
    console.error('Erreur approveMarketplaceItem:', error);
    throwNormalized(error, "Impossible d'approuver l'item");
  }
}

// Reject a marketplace item
export async function rejectMarketplaceItem(itemId, reason = '') {
  try {
    const response = await apiService.post(`/admin/marketplace/items/${itemId}/reject`, { reason });
    const data = response.data?.data || response.data;
    return data?.item || data;
  } catch (error) {
    console.error('Erreur rejectMarketplaceItem:', error);
    throwNormalized(error, "Impossible de rejeter l'item");
  }
}

export default {
  getMarketplaceItems,
  getMarketplaceItemById,
  createMarketplaceItem,
  updateMarketplaceItem,
  deleteMarketplaceItem,
  getMarketplaceCategories,
  getMarketplaceAnalytics,
  getMarketplacePurchases,
  purchaseMarketplaceItem,
  getPendingItems,
  approveMarketplaceItem,
  rejectMarketplaceItem,
};
