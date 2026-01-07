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
      prizes: { total: 0, active: 0, claimed: 0 },
      captures: { total: 0, today: 0, validated: 0, pending: 0 },
      rewards: { total: 0, active: 0 },
      redemptions: { total: 0, pending: 0, validated: 0 },
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
 */
export async function getSystemHealth() {
  try {
    // Try admin system health endpoint first (more detailed)
    const response = await apiService.getSystemHealth();
    const health = response.health || response.data || response;
    
    // Handle new structure: health.api, health.mongodb, health.redis
    const apiHealthy = health.api?.status === 'healthy';
    const mongoHealthy = health.mongodb?.status === 'healthy';
    const redisHealthy = health.redis?.status === 'healthy';
    
    // Fallback for old structure
    const mongoConnected = mongoHealthy || health.mongo === 'connected';
    const redisConnected = redisHealthy || health.redis === 'connected';
    
    return {
      status: mongoConnected && redisConnected ? 'healthy' : 'degraded',
      uptime: health.api?.uptimeSeconds || health.uptime || 0,
      services: {
        database: mongoConnected,
        cache: redisConnected,
      },
      timestamp: health.timestamp || new Date().toISOString()
    };
  } catch (error) {
    // Fallback to basic health check
    try {
      const response = await apiService.getHealthCheck();
      return {
        status: response.status === 'ok' ? 'healthy' : 'unknown',
        uptime: 0,
        services: {},
        timestamp: response.timestamp || new Date().toISOString()
      };
    } catch {
      console.error('getSystemHealth error:', error);
      return {
        status: 'error',
        uptime: 0,
        services: {},
        timestamp: new Date().toISOString()
      };
    }
  }
}

/**
 * Obtenir les métriques en temps réel
 */
export async function getRealtimeMetrics() {
  try {
    const response = await apiService.getMetrics();
    return response.metrics || response.data || {};
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
    const response = await apiService.getUserAnalytics({ period });
    return response.stats || response.data || {};
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
    const response = await apiService.getPrizeAnalytics({ period });
    return response.stats || response.data || {};
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
    const response = await apiService.getRewardAnalytics({ period });
    return response.stats || response.data || {};
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

