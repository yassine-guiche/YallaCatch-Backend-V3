/**
 * YallaCatch! Claims/Captures Service
 */

import apiService from './api';
import { mapBackendCapture, mapArray } from '../utils/mappers';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

/**
 * Obtenir la liste des captures
 */
export async function getCaptures(params = {}) {
  try {
    const response = await apiService.getCaptures(params);
    const captures = mapArray(response.captures || response.data || [], mapBackendCapture);
    
    return {
      items: captures,
      total: response.total || captures.length,
      hasMore: response.hasMore || false
    };
  } catch (error) {
    console.error('getCaptures error:', error);
    throwNormalized(error, 'Impossible de lister les captures');
  }
}

/**
 * Obtenir une capture par ID
 */
export async function getCaptureById(captureId) {
  try {
    const response = await apiService.getCapture(captureId);
    return mapBackendCapture(response.capture || response.data);
  } catch (error) {
    console.error('getCaptureById error:', error);
    return null;
  }
}

/**
 * Valider une capture
 */
export async function validateCapture(captureId, reason = '') {
  try {
    const response = await apiService.validateCapture(captureId, reason);
    return mapBackendCapture(response.capture || response.data);
  } catch (error) {
    console.error('validateCapture error:', error);
    throwNormalized(error, 'Impossible de valider la capture');
  }
}

/**
 * Rejeter une capture
 */
export async function rejectCapture(captureId, reason) {
  try {
    const response = await apiService.rejectCapture(captureId, reason);
    return mapBackendCapture(response.capture || response.data);
  } catch (error) {
    console.error('rejectCapture error:', error);
    throwNormalized(error, 'Impossible de rejeter la capture');
  }
}

/**
 * Lister les captures avec filtres
 */
export async function listCaptures({
  status = 'all',
  userId = null,
  prizeId = null,
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
      order: orderDirection
    };
    
    if (status !== 'all') {
      params.status = status;
    }
    
    if (userId) {
      params.userId = userId;
    }
    
    if (prizeId) {
      params.prizeId = prizeId;
    }
    
    if (search && search.trim()) {
      params.search = search.trim();
    }
    
    if (cursor) {
      params.page = parseInt(cursor) + 1;
    }
    
    const response = await apiService.getCaptures(params);
    const items = mapArray(response.captures || response.data || [], mapBackendCapture);
    
    return {
      items,
      lastDoc: response.page?.toString() || null,
      hasMore: response.hasMore || false
    };
  } catch (error) {
    console.error('listCaptures error:', error);
    throwNormalized(error, 'Impossible de filtrer les captures');
  }
}

/**
 * Compter les captures avec filtres
 */
export async function countCaptures({
  status = 'all',
  userId = null,
  prizeId = null,
  search = '',
} = {}) {
  try {
    const params = { limit: 1 };
    
    if (status !== 'all') params.status = status;
    if (userId) params.userId = userId;
    if (prizeId) params.prizeId = prizeId;
    if (search && search.trim()) params.search = search.trim();
    
    const response = await apiService.getCaptures(params);
    return response.total || 0;
  } catch (error) {
    console.error('countCaptures error:', error);
    return 0;
  }
}

/**
 * Obtenir les statistiques des captures
 */
export async function getCaptureStats(period = '30d') {
  try {
    const response = await apiService.getCaptureStats({ period });
    return response.stats || response.data || {};
  } catch (error) {
    console.error('getCaptureStats error:', error);
    return {};
  }
}

/**
 * Obtenir les signalements de captures
 */
export async function getCaptureReports(params = {}) {
  try {
    const response = await apiService.getCaptureReports(params);
    return {
      items: response.reports || response.data || [],
      total: response.total || 0,
      hasMore: response.hasMore || false
    };
  } catch (error) {
    console.error('getCaptureReports error:', error);
    return { items: [], total: 0, hasMore: false };
  }
}

/**
 * Traiter un signalement de capture
 */
export async function handleCaptureReport(reportId, action, notes = '') {
  try {
    const response = await apiService.handleCaptureReport(reportId, action, notes);
    return response.report || response.data;
  } catch (error) {
    console.error('handleCaptureReport error:', error);
    throwNormalized(error, 'Impossible de traiter le signalement');
  }
}

/**
 * Obtenir les captures en attente de validation
 */
export async function getPendingCaptures(limit = 20) {
  try {
    const response = await apiService.getCaptures({
      status: 'pending',
      limit,
      sortBy: 'createdAt',
      order: 'asc'
    });
    
    return mapArray(response.captures || response.data || [], mapBackendCapture);
  } catch (error) {
    console.error('getPendingCaptures error:', error);
    return [];
  }
}

/**
 * Valider plusieurs captures en masse
 */
export async function bulkValidateCaptures(captureIds, reason = '') {
  try {
    const promises = captureIds.map(id => apiService.validateCapture(id, reason));
    await Promise.all(promises);
    return { success: true, count: captureIds.length };
  } catch (error) {
    console.error('bulkValidateCaptures error:', error);
    throwNormalized(error, 'Validation groupée impossible');
  }
}

/**
 * Rejeter plusieurs captures en masse
 */
export async function bulkRejectCaptures(captureIds, reason) {
  try {
    const promises = captureIds.map(id => apiService.rejectCapture(id, reason));
    await Promise.all(promises);
    return { success: true, count: captureIds.length };
  } catch (error) {
    console.error('bulkRejectCaptures error:', error);
    throwNormalized(error, 'Rejet groupé impossible');
  }
}

export default {
  getCaptures,
  getCaptureById,
  validateCapture,
  rejectCapture,
  listCaptures,
  countCaptures,
  getCaptureStats,
  getCaptureReports,
  handleCaptureReport,
  getPendingCaptures,
  bulkValidateCaptures,
  bulkRejectCaptures,
};
