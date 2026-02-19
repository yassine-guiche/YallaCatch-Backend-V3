/**
 * YallaCatch! Dashboard Service
 */

import apiService from './api';
import { mapBackendDashboardStats } from '../utils/mappers';

/**
 * Obtenir les statistiques du dashboard
 */
export async function getDashboardStats(period = '7d') {
  try {
    const response = await apiService.getDashboardStats({ period });
    // Extract stats from normalized response
    const stats = response.stats || response.data || {};
    return mapBackendDashboardStats(stats);
  } catch (error) {
    console.error('getDashboardStats error:', error);
    return {
      users: { total: 0, active: 0, new: 0, online: 0 },
      prizes: { total: 0, active: 0, claimed: 0, captured: 0 },
      captures: { total: 0, today: 0, validated: 0, pending: 0 },
      rewards: { total: 0, active: 0 },
      redemptions: { total: 0, core: 0, marketplace: 0 },
      purchases: { total: 0, unredeemed: 0, redeemed: 0 },
      revenue: { total: 0, today: 0, thisMonth: 0 },
      activity: [],
      recentCaptures: [],
      recentRedemptions: []
    };
  }
}

/**
 * Obtenir l'activité récente
 */
export async function getRecentActivity(limit = 10) {
  try {
    const response = await apiService.getAuditLogs({
      limit,
      sortBy: 'createdAt',
      order: 'desc'
    });
    
    return response.logs || response.data || [];
  } catch (error) {
    console.error('getRecentActivity error:', error);
    return [];
  }
}

/**
 * Obtenir la santé du système
 * Uses same endpoint as system.js for consistency
 */
export async function getSystemHealth() {
  try {
    const response = await apiService.get('/admin/system/health');
    const data = response?.data || response || {};
    
    // Check MongoDB and Redis status
    const mongoStatus = data.mongodb?.status;
    const redisStatus = data.redis?.status;
    
    const mongoHealthy = mongoStatus === 'pass' || mongoStatus === 'healthy' || mongoStatus === 'ok';
    const redisHealthy = redisStatus === 'pass' || redisStatus === 'healthy' || redisStatus === 'ok';
    
    return {
      status: (mongoHealthy && redisHealthy) ? 'healthy' : 'degraded',
      uptime: data.uptime || 0,
      services: {        cache: redisHealthy,
      },
      timestamp: new Date().toISOString(),
      details: data // Include full details for SystemManagement page
    };
  } catch (error) {
    console.error('getSystemHealth error:', error);
    return {
      status: 'unknown',
      uptime: 0,
      services: {
        database: false,
        cache: false,
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Obtenir les métriques en temps réel
 */
export async function getRealtimeMetrics() {
  try {
    const response = await apiService.get('/admin/dashboard/real-time');
    return response.data || response || {};
  } catch (error) {
    console.error('getRealtimeMetrics error:', error);
    return {};
  }
}

/**
 * Obtenir les statistiques des utilisateurs
 */
export async function getUserStats(period = '30d') {
  try {
    const response = await apiService.get('/admin/analytics/users', { period });
    return response.data || response || {};
  } catch (error) {
    console.error('getUserStats error:', error);
    return {};
  }
}

/**
 * Obtenir les statistiques des prix
 */
export async function getPrizeStats(period = '30d') {
  try {
    const response = await apiService.get('/admin/analytics/prizes', { period });
    return response.data || response || {};
  } catch (error) {
    console.error('getPrizeStats error:', error);
    return {};
  }
}

/**
 * Obtenir les statistiques des récompenses
 */
export async function getRewardStats(period = '30d') {
  try {
    const response = await apiService.get('/admin/analytics/rewards', { period });
    return response.data || response || {};
  } catch (error) {
    console.error('getRewardStats error:', error);
    return {};
  }
}

export default {
  getDashboardStats,
  getRecentActivity,
  getSystemHealth,
  getRealtimeMetrics,
  getUserStats,
  getPrizeStats,
  getRewardStats,
};
