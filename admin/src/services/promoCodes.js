/**
 * YallaCatch! Promo Codes Service
 * Admin management of promotional codes
 * 
 * CANONICAL SERVICE for all promo code operations
 * Uses apiService base methods for consistency
 */

import apiService from './api';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

/**
 * Get all promo codes with pagination
 * @param {Object} params - { page?, limit?, status?, prefix? }
 */
export async function getCodes(params = {}) {
  try {
    const response = await apiService.get('/admin/codes', params);
    const codes = response?.data?.codes || response?.codes || response?.data || [];
    return {
      items: codes,
      total: response?.total || codes.length,
      page: response?.page || 1,
      limit: response?.limit || 50,
      hasMore: response?.hasMore || false,
      pagination: response?.pagination || { page: 1, limit: 50, total: codes.length }
    };
  } catch (error) {
    console.error('getCodes error:', error);
    return { items: [], total: 0, page: 1, limit: 50, hasMore: false, pagination: { page: 1, limit: 50, total: 0 } };
  }
}

/**
 * Generate new promo codes
 * @param {Object} data - { count, prefix, pointsValue, expiresAt }
 */
export async function generateCodes(data) {
  try {
    const payload = {
      count: data.count || 1,
      prefix: data.prefix || 'YALLA',
      pointsValue: data.pointsValue || 100,
      expiresAt: data.expiresAt || undefined
    };
    const response = await apiService.post('/admin/codes/generate', payload);
    return {
      success: response?.success ?? true,
      codes: response?.codes || response?.data || [],
      count: response?.count || payload.count,
      message: response?.message || 'Codes générés avec succès'
    };
  } catch (error) {
    console.error('generateCodes error:', error);
    throwNormalized(error, 'Impossible de générer les codes promo');
  }
}

/**
 * Get a specific code by ID
 * @param {string} codeId 
 */
export async function getCodeById(codeId) {
  try {
    const response = await apiService.get(`/admin/codes/${codeId}`);
    return response?.data?.code || response?.code || response?.data || response;
  } catch (error) {
    console.error('getCodeById error:', error);
    throwNormalized(error, 'Impossible de récupérer le code');
  }
}

/**
 * Deactivate a promo code
 * @param {string} codeId 
 */
export async function deactivateCode(codeId) {
  try {
    const response = await apiService.patch(`/admin/codes/${codeId}/deactivate`);
    return {
      success: response?.success ?? true,
      message: 'Code désactivé avec succès'
    };
  } catch (error) {
    console.error('deactivateCode error:', error);
    throwNormalized(error, 'Impossible de désactiver le code');
  }
}

/**
 * Revoke/delete a promo code permanently
 * @param {string} codeId 
 */
export async function revokeCode(codeId) {
  try {
    const response = await apiService.delete(`/admin/codes/${codeId}`);
    return {
      success: response?.success ?? true,
      message: 'Code révoqué avec succès'
    };
  } catch (error) {
    console.error('revokeCode error:', error);
    throwNormalized(error, 'Impossible de révoquer le code');
  }
}

/**
 * Get promo code statistics
 */
export async function getCodeStats() {
  try {
    const response = await apiService.get('/admin/codes/stats');
    return response?.data || response || {
      total: 0,
      used: 0,
      active: 0,
      expired: 0
    };
  } catch (error) {
    console.error('getCodeStats error:', error);
    return { total: 0, used: 0, active: 0, expired: 0 };
  }
}

/**
 * Validate a promo code (check if valid and unused)
 * @param {string} code - The code string to validate
 */
export async function validateCode(code) {
  try {
    const response = await apiService.post('/admin/codes/validate', { code });
    return response?.data || response;
  } catch (error) {
    console.error('validateCode error:', error);
    throwNormalized(error, 'Code invalide ou expiré');
  }
}

export default {
  getCodes,
  generateCodes,
  getCodeById,
  deactivateCode,
  revokeCode,
  getCodeStats,
  validateCode
};
