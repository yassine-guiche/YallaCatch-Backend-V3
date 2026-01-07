/**
 * YallaCatch! Analytics Service
 */

import apiService from './api';
import { getDateRange } from '../utils/dates';

/**
 * Convert period format to backend expected format
 * Frontend can use '30d' or 'month', backend expects 'week', 'month', etc.
 */
function normalizePeriod(period) {
  const periodMap = {
    '1d': 'day',
    '7d': 'week',
    '30d': 'month',
    '90d': 'year',
    'day': 'day',
    'week': 'week',
    'month': 'month',
    'year': 'year'
  };
  return periodMap[period] || period || 'week';
}

/**
 * Obtenir toutes les analytics (fonction générale)
 */
export async function getAnalytics(period = 'week') {
  try {
    const normalizedPeriod = normalizePeriod(period);
    const response = await apiService.get('/admin/analytics/overview', { params: { period: normalizedPeriod } });
    return response.data?.data || response.data || {};
  } catch (error) {
    console.error('getAnalytics error:', error);
    return {};
  }
}

/**
 * Obtenir les analytics des utilisateurs
 */
export async function getUserAnalytics(period = 'week') {
  try {
    const response = await apiService.getUserAnalytics({ period });
    return response.stats || response.data || {};
  } catch (error) {
    console.error('getUserAnalytics error:', error);
    return {};
  }
}

/**
 * Obtenir les analytics des prix
 */
export async function getPrizeAnalytics(period = 'week') {
  try {
    const response = await apiService.getPrizeAnalytics({ period });
    return response.stats || response.data || {};
  } catch (error) {
    console.error('getPrizeAnalytics error:', error);
    return {};
  }
}

/**
 * Obtenir les analytics des récompenses
 */
export async function getRewardAnalytics(period = 'week') {
  try {
    const response = await apiService.getRewardAnalytics({ period });
    return response.stats || response.data || {};
  } catch (error) {
    console.error('getRewardAnalytics error:', error);
    return {};
  }
}

/**
 * Obtenir les analytics de revenus
 * Note: Using business analytics endpoint as getRevenueAnalytics is not available
 */
export async function getRevenueAnalytics(period = 'week') {
  try {
    // Use getBusinessAnalytics as fallback since getRevenueAnalytics doesn't exist
    const response = await apiService.getBusinessAnalytics({ period });
    return response.stats || response.data || {};
  } catch (error) {
    console.error('getRevenueAnalytics error:', error);
    return {};
  }
}

/**
 * Obtenir les métriques d'engagement
 */
export async function getEngagementMetrics(period = 'week') {
  try {
    const response = await apiService.getEngagementMetrics({ period });
    return response.metrics || response.data || {};
  } catch (error) {
    console.error('getEngagementMetrics error:', error);
    return {};
  }
}

/**
 * Obtenir les analytics de géolocalisation
 */
export async function getGeoAnalytics(period = '30d') {
  try {
    const response = await apiService.getGeoAnalytics({ period });
    return response.stats || response.data || {};
  } catch (error) {
    console.error('getGeoAnalytics error:', error);
    return {};
  }
}

/**
 * Obtenir la heatmap géographique
 */
export async function getGeoHeatmap(type = 'captures', bounds = null) {
  try {
    const params = { type };
    if (bounds) params.bounds = bounds;
    
    const response = await apiService.getGeoHeatmap(params);
    return response.heatmap || response.data || [];
  } catch (error) {
    console.error('getGeoHeatmap error:', error);
    return [];
  }
}

/**
 * Obtenir les analytics de rétention
 */
export async function getRetentionAnalytics(period = '30d') {
  try {
    const response = await apiService.getRetentionAnalytics({ period });
    return response.stats || response.data || {};
  } catch (error) {
    console.error('getRetentionAnalytics error:', error);
    return {};
  }
}

/**
 * Obtenir les analytics de conversion
 */
export async function getConversionAnalytics(period = '30d') {
  try {
    const response = await apiService.getConversionAnalytics({ period });
    return response.stats || response.data || {};
  } catch (error) {
    console.error('getConversionAnalytics error:', error);
    return {};
  }
}

/**
 * Obtenir les données pour les graphiques
 */
export async function getChartData(metric, period = '30d') {
  try {
    const { start, end } = getDateRange(period);
    
    const response = await apiService.getChartData({
      metric,
      startDate: start.toISOString(),
      endDate: end.toISOString()
    });
    
    return response.data || [];
  } catch (error) {
    console.error('getChartData error:', error);
    return [];
  }
}

/**
 * Exporter les analytics
 */
export async function exportAnalytics(type, period = '30d', format = 'csv') {
  try {
    const { start, end } = getDateRange(period);
    
    const response = await apiService.exportAnalytics({
      type,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      format
    });
    
    return response.url || response.data;
  } catch (error) {
    console.error('exportAnalytics error:', error);
    throw error;
  }
}

export default {
  getAnalytics,
  getUserAnalytics,
  getPrizeAnalytics,
  getRewardAnalytics,
  getRevenueAnalytics,
  getEngagementMetrics,
  getGeoAnalytics,
  getGeoHeatmap,
  getRetentionAnalytics,
  getConversionAnalytics,
  getChartData,
  exportAnalytics,
};
