/**
 * Redemptions Service
 * Handles reward redemptions using Node.js backend
 */

import api from './api';
import { logActivity } from './activity';

const throwNormalized = (error, fallback) => {
  throw api.normalizeError(error, fallback);
};

/**
 * List redemptions with optional filters
 * @param {object} options
 * @param {string} options.status - Filter by status ('all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled')
 * @param {string} options.userId - Filter by user ID
 * @param {number} options.limit - Maximum number of items to return
 * @param {number} options.page - Page number for pagination
 * @returns {Promise<{items: Array, total: number, hasMore: boolean}>}
 */
export async function listRedemptions({ 
  status = 'all', 
  userId = null, 
  limit = 50, 
  page = 1,
} = {}) {
  try {
    const params = { limit, page };
    if (status && status !== 'all') params.status = status;
    if (userId) params.userId = userId;

    const response = await api.get('/marketplace/redemptions', params);
    const data = response.data || response;
    return {
      items: data.redemptions || data.items || [],
      total: data.total || 0,
      hasMore: data.hasMore || false,
      page: data.page || 1,
    };
  } catch (error) {
    console.error('Error listing redemptions:', error);
    const normalized = api.normalizeError(error, 'Impossible de récupérer les redemptions');
    return { items: [], total: 0, hasMore: false, error: normalized };
  }
}

/**
 * Get a single redemption by ID
 * @param {string} redemptionId 
 * @returns {Promise<object|null>}
 */
export async function getRedemption(redemptionId) {
  try {
    const response = await api.get(`/marketplace/redemptions/${redemptionId}`);
    return response.data || response;
  } catch (error) {
    console.error('Error fetching redemption:', error);
    return null;
  }
}

/**
 * Update redemption status
 * @param {string} redemptionId 
 * @param {string} status - New status
 * @param {object} actor - Actor performing the action
 * @returns {Promise<object>}
 */
export async function updateRedemptionStatus(redemptionId, status, actor = {}) {
  try {
    const response = await api.patch(`/marketplace/redemptions/${redemptionId}/status`, {
      status,
    });
    
    const data = response.data || response;
    await logActivity({
      actor,
      action: 'redemption_status_updated',
      target: { type: 'redemption', id: redemptionId },
      details: { newStatus: status },
      message: `Redemption status updated to ${status}`,
    });
    
    return data;
  } catch (error) {
    console.error('Error updating redemption status:', error);
    throwNormalized(error, 'Impossible de mettre à jour le statut du rachat');
  }
}

/**
 * Update tracking information for a redemption
 * @param {string} redemptionId 
 * @param {object} tracking - Tracking information
 * @param {string} tracking.carrier - Carrier name
 * @param {string} tracking.trackingNumber - Tracking number
 * @param {string} tracking.status - Tracking status
 * @param {object} actor - Actor performing the action
 * @returns {Promise<object>}
 */
export async function updateRedemptionTracking(redemptionId, tracking, actor = {}) {
  try {
    const response = await api.patch(`/marketplace/redemptions/${redemptionId}/tracking`, {
      tracking,
    });
    
    const data = response.data || response;
    await logActivity({
      actor,
      action: 'redemption_tracking_updated',
      target: { type: 'redemption', id: redemptionId },
      details: { tracking },
      message: `Tracking updated: ${tracking.carrier} - ${tracking.trackingNumber}`,
    });
    
    return data;
  } catch (error) {
    console.error('Error updating redemption tracking:', error);
    throwNormalized(error, 'Impossible de mettre à jour le suivi');
  }
}

/**
 * Cancel a redemption
 * @param {string} redemptionId 
 * @param {string} reason - Cancellation reason
 * @param {object} actor - Actor performing the action
 * @returns {Promise<object>}
 */
export async function cancelRedemption(redemptionId, reason, actor = {}) {
  try {
    const response = await api.post(`/marketplace/redemptions/${redemptionId}/cancel`, {
      reason,
    });
    
    const data = response.data || response;
    await logActivity({
      actor,
      action: 'redemption_cancelled',
      target: { type: 'redemption', id: redemptionId },
      details: { reason },
      message: `Redemption cancelled: ${reason}`,
    });
    
    return data;
  } catch (error) {
    console.error('Error cancelling redemption:', error);
    throwNormalized(error, 'Impossible d’annuler le rachat');
  }
}

/**
 * Get redemption statistics
 * @returns {Promise<object>}
 */
export async function getRedemptionStatistics() {
  try {
    const response = await api.get('/marketplace/redemptions/statistics');
    
    if (response.success && response.data) {
      return response.data;
    }
    return response.data || response;
  } catch (error) {
    console.error('Error fetching redemption statistics:', error);
    return {
      total: 0,
      pending: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    };
  }
}

/**
 * Export redemptions to CSV
 * @param {object} filters - Same filters as listRedemptions
 * @returns {Promise<Blob>}
 */
export async function exportRedemptions(filters = {}) {
  try {
    const response = await api.get('/marketplace/redemptions/export', {
      params: filters,
      responseType: 'blob',
    });
    
    return response;
  } catch (error) {
    console.error('Error exporting redemptions:', error);
    throw error;
  }
}

/**
 * Bulk update redemption statuses
 * @param {Array<string>} redemptionIds 
 * @param {string} status 
 * @param {object} actor 
 * @returns {Promise<object>}
 */
export async function bulkUpdateRedemptionStatus(redemptionIds, status, actor = {}) {
  try {
    const response = await api.post('/marketplace/redemptions/bulk-update', {
      redemptionIds,
      status,
    });
    
    if (response.success && response.data) {
      // Log activity
      await logActivity({
        actor,
        action: 'redemptions_bulk_updated',
        target: { type: 'redemptions', count: redemptionIds.length },
        details: { newStatus: status },
        message: `Bulk updated ${redemptionIds.length} redemptions to ${status}`,
      });
      
      return response.data;
    } else {
      throw new Error(response.error || 'Failed to bulk update redemptions');
    }
  } catch (error) {
    console.error('Error bulk updating redemptions:', error);
    throw error;
  }
}
