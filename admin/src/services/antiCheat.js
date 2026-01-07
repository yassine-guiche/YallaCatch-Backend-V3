/**
 * YallaCatch! Anti-Cheat Service
 * Monitors and manages fraud detection, flagged claims, and user risk assessment
 */

import apiService from './api';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

/**
 * Get flagged claims with optional filters
 * @param {Object} params - { page?, limit?, severity?, status?, startDate?, endDate? }
 */
export async function getFlaggedClaims(params = {}) {
  try {
    const response = await apiService.get('/admin/anti-cheat/flagged-claims', params);
    return {
      items: response.data || response.claims || [],
      total: response.total || 0,
      page: response.page || 1,
      limit: response.limit || 20,
      success: response.success ?? true,
    };
  } catch (error) {
    console.error('getFlaggedClaims error:', error);
    throwNormalized(error, 'Impossible de récupérer les claims signalés');
  }
}

/**
 * Get user risk assessment
 * @param {string} userId
 */
export async function getUserRisk(userId) {
  try {
    const response = await apiService.get(`/admin/anti-cheat/user-risk/${userId}`);
    return response.data || response.risk || response;
  } catch (error) {
    console.error('getUserRisk error:', error);
    throwNormalized(error, "Impossible d'évaluer le risque utilisateur");
  }
}

/**
 * Get anti-cheat metrics/statistics
 * @param {Object} params - { period?: string }
 */
export async function getMetrics(params = {}) {
  try {
    const response = await apiService.get('/admin/anti-cheat/metrics', params);
    return response.data || response.metrics || {};
  } catch (error) {
    console.error('getMetrics error:', error);
    return {};
  }
}

/**
 * Get detected fraud patterns
 * @param {Object} params - { type?, severity?, limit? }
 */
export async function getPatterns(params = {}) {
  try {
    const response = await apiService.get('/admin/anti-cheat/patterns', params);
    const data = response.data || response.patterns || {};
    return {
      patterns: data.patterns || data || [],
      recommendations: data.recommendations || [],
      success: response.success ?? true,
    };
  } catch (error) {
    console.error('getPatterns error:', error);
    return { patterns: [], recommendations: [], success: false };
  }
}

/**
 * Override a flagged claim decision
 * @param {Object} data - { claimId, decision: 'approve'|'reject', reason?, notes? }
 */
export async function overrideClaim(data) {
  try {
    const response = await apiService.post('/admin/anti-cheat/override-claim', {
      claimId: data.claimId,
      decision: data.decision,
      notes: data.reason || data.notes,
    });
    return response.data || response;
  } catch (error) {
    console.error('overrideClaim error:', error);
    throwNormalized(error, 'Impossible de modifier la décision du claim');
  }
}

/**
 * Get anti-cheat settings
 */
export async function getSettings() {
  try {
    const response = await apiService.get('/admin/anti-cheat/settings');
    return response.data || response.settings || {};
  } catch (error) {
    console.error('getSettings error:', error);
    return {};
  }
}

/**
 * Update anti-cheat settings
 * @param {Object} settings - Anti-cheat configuration
 */
export async function updateSettings(settings) {
  try {
    const response = await apiService.patch('/admin/anti-cheat/settings', settings);
    return response.data || response.settings || response;
  } catch (error) {
    console.error('updateSettings error:', error);
    throwNormalized(error, 'Impossible de mettre à jour les paramètres anti-triche');
  }
}

/**
 * Get recent fraud alerts
 * @param {Object} params - { limit?, severity? }
 */
export async function getRecentAlerts(params = {}) {
  try {
    const response = await apiService.get('/admin/anti-cheat/recent-alerts', params);
    return {
      items: response.data?.alerts || response.alerts || response.data || [],
      count: response.data?.count,
      success: response.success ?? true,
    };
  } catch (error) {
    console.error('getRecentAlerts error:', error);
    return { items: [], count: 0, success: false };
  }
}

/**
 * Export anti-cheat report
 * @param {Object} params - { format?: 'csv'|'json', startDate?, endDate?, type? }
 */
export async function exportReport(params = {}) {
  try {
    const response = await apiService.get('/admin/anti-cheat/export-report', params);
    return response.data || response;
  } catch (error) {
    console.error('exportReport error:', error);
    throwNormalized(error, "Impossible d'exporter le rapport anti-triche");
  }
}

/**
 * Fraud severity levels for UI
 */
export const FRAUD_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

/**
 * Fraud pattern types for UI
 */
export const FRAUD_PATTERNS = {
  LOCATION_SPOOFING: 'location_spoofing',
  RAPID_CLAIMS: 'rapid_claims',
  DEVICE_MANIPULATION: 'device_manipulation',
  MULTIPLE_ACCOUNTS: 'multiple_accounts',
  BOT_BEHAVIOR: 'bot_behavior',
  TIME_MANIPULATION: 'time_manipulation',
};

/**
 * Override actions for UI
 */
export const OVERRIDE_ACTIONS = {
  APPROVE: 'approve',
  REJECT: 'reject',
};

export default {
  getFlaggedClaims,
  getUserRisk,
  getMetrics,
  getPatterns,
  overrideClaim,
  getSettings,
  updateSettings,
  getRecentAlerts,
  exportReport,
  FRAUD_SEVERITY,
  FRAUD_PATTERNS,
  OVERRIDE_ACTIONS,
};
