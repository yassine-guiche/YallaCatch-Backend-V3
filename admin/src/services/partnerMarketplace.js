/**
 * Partner Marketplace Service - partner-scoped CRUD and analytics
 */
import apiService from './api';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

export async function getMyItems() {
  try {
    const res = await apiService.get('/partner/marketplace/items');
    return res.items || res.data?.items || res.data || [];
  } catch (error) {
    console.error('getMyItems error:', error);
    throwNormalized(error, 'Impossible de charger vos items');
  }
}

export async function createMyItem(data) {
  try {
    const res = await apiService.post('/partner/marketplace/items', data);
    return res.item || res.data?.item || res.data;
  } catch (error) {
    console.error('createMyItem error:', error);
    throwNormalized(error, 'Impossible de créer l’item');
  }
}

export async function updateMyItem(id, data) {
  try {
    const res = await apiService.put(`/partner/marketplace/items/${id}`, data);
    return res.item || res.data?.item || res.data;
  } catch (error) {
    console.error('updateMyItem error:', error);
    throwNormalized(error, 'Impossible de mettre à jour l’item');
  }
}

export async function deleteMyItem(id) {
  try {
    await apiService.delete(`/partner/marketplace/items/${id}`);
    return { success: true };
  } catch (error) {
    console.error('deleteMyItem error:', error);
    throwNormalized(error, 'Impossible de supprimer l’item');
  }
}

export async function getMyAnalytics() {
  try {
    const res = await apiService.get('/partner/marketplace/analytics');
    return res.data || res;
  } catch (error) {
    console.error('getMyAnalytics error:', error);
    throwNormalized(error, 'Impossible de charger les analytics');
  }
}

export default {
  getMyItems,
  createMyItem,
  updateMyItem,
  deleteMyItem,
  getMyAnalytics,
};
