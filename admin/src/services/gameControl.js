/**
 * YallaCatch! Game Control Service
 * Admin control over game sessions, real-time monitoring, and game mechanics
 * 
 * API Base: /admin/game-control/game/* (backend prefix: game-control, route prefix: game)
 */

import apiService from './api';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

// Base path for game control routes
const GAME_CONTROL_BASE = '/admin/game-control/game';

// ==================== GAME SESSIONS ====================

/**
 * Get active game sessions
 * @param {Object} params - { page?, limit?, userId?, city? }
 */
export async function getActiveSessions(params = {}) {
  try {
    const response = await apiService.get(`${GAME_CONTROL_BASE}/sessions/active`, params);
    return {
      items: response.data?.sessions || response.sessions || [],
      pagination: response.data?.pagination || response.pagination || { page: 1, limit: 20, total: 0 },
      success: true,
    };
  } catch (error) {
    console.error('getActiveSessions error:', error);
    return { items: [], pagination: { page: 1, limit: 20, total: 0 }, success: false };
  }
}

/**
 * Get session history
 * @param {Object} params - { page?, limit?, userId?, startDate?, endDate? }
 */
export async function getSessionHistory(params = {}) {
  try {
    const response = await apiService.get(`${GAME_CONTROL_BASE}/sessions/history`, params);
    return {
      items: response.data?.sessions || response.sessions || [],
      pagination: response.data?.pagination || response.pagination || { page: 1, limit: 20, total: 0 },
    };
  } catch (error) {
    console.error('getSessionHistory error:', error);
    return { items: [], pagination: { page: 1, limit: 20, total: 0 } };
  }
}

/**
 * Get details of a specific session
 * @param {string} sessionId 
 */
export async function getSessionDetails(sessionId) {
  try {
    const response = await apiService.get(`${GAME_CONTROL_BASE}/sessions/${sessionId}`);
    return response.data || response.session || response;
  } catch (error) {
    console.error('getSessionDetails error:', error);
    throwNormalized(error, 'Impossible de récupérer les détails de la session');
  }
}

/**
 * Force end a game session (admin action)
 * @param {string} sessionId 
 * @param {string} reason - Reason for forced termination
 */
export async function forceEndSession(sessionId, reason) {
  try {
    const response = await apiService.request(`${GAME_CONTROL_BASE}/sessions/${sessionId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason })
    });
    return response.data || response;
  } catch (error) {
    console.error('forceEndSession error:', error);
    throwNormalized(error, 'Impossible de terminer la session');
  }
}

// ==================== LEADERBOARDS ====================

/**
 * Get global leaderboard
 * @param {Object} params - { type?: 'points'|'claims'|'distance'|'level', limit?, city? }
 */
export async function getLeaderboard(params = {}) {
  try {
    const response = await apiService.get(`${GAME_CONTROL_BASE}/leaderboard`, params);
    return {
      items: response.data?.leaderboard || response.leaderboard || [],
      type: params.type || 'points',
    };
  } catch (error) {
    console.error('getLeaderboard error:', error);
    return { items: [], type: params.type || 'points' };
  }
}

/**
 * Reset leaderboard (admin action)
 * @param {string} type - Type of leaderboard to reset
 * @param {string} scope - 'global' or specific city
 */
export async function resetLeaderboard(type, scope = 'global') {
  try {
    // Backend requires confirm: true for this destructive action
    const response = await apiService.post(`${GAME_CONTROL_BASE}/leaderboard/reset`, { type, scope, confirm: true });
    return response.data || response;
  } catch (error) {
    console.error('resetLeaderboard error:', error);
    throwNormalized(error, 'Impossible de réinitialiser le classement');
  }
}

// ==================== DAILY CHALLENGES ====================

/**
 * Get configured daily challenges
 */
export async function getDailyChallenges() {
  try {
    const response = await apiService.get(`${GAME_CONTROL_BASE}/challenges`);
    return {
      items: response.data?.challenges || response.challenges || [],
    };
  } catch (error) {
    console.error('getDailyChallenges error:', error);
    return { items: [] };
  }
}

/**
 * Create or update a daily challenge template
 * @param {Object} challengeData - { id, title, description, type, target, reward }
 */
export async function updateChallenge(challengeData) {
  try {
    const response = await apiService.post(`${GAME_CONTROL_BASE}/challenges`, challengeData);
    return response.data || response;
  } catch (error) {
    console.error('updateChallenge error:', error);
    throwNormalized(error, 'Impossible de mettre à jour le défi');
  }
}

/**
 * Delete a challenge template
 * @param {string} challengeId 
 */
export async function deleteChallenge(challengeId) {
  try {
    await apiService.delete(`${GAME_CONTROL_BASE}/challenges/${challengeId}`);
    return { success: true };
  } catch (error) {
    console.error('deleteChallenge error:', error);
    throwNormalized(error, 'Impossible de supprimer le défi');
  }
}

// ==================== GAME SETTINGS ====================

/**
 * Get game settings
 */
export async function getGameSettings() {
  try {
    const response = await apiService.get('/admin/settings/game');
    return response.data || response;
  } catch (error) {
    console.error('getGameSettings error:', error);
    return {};
  }
}

/**
 * Update game settings
 * @param {Object} settings - { claimRadiusMeters?, maxDailyClaims?, speedLimitKmh?, cooldownSeconds? }
 */
export async function updateGameSettings(settings) {
  try {
    const response = await apiService.patch('/admin/settings/game', settings);
    return response.data || response;
  } catch (error) {
    console.error('updateGameSettings error:', error);
    throwNormalized(error, 'Impossible de mettre à jour les paramètres du jeu');
  }
}

/**
 * Get anti-cheat settings
 */
export async function getAntiCheatSettings() {
  try {
    const response = await apiService.get('/admin/settings/anti-cheat');
    return response.data || response;
  } catch (error) {
    console.error('getAntiCheatSettings error:', error);
    return {};
  }
}

/**
 * Update anti-cheat settings
 * @param {Object} settings 
 */
export async function updateAntiCheatSettings(settings) {
  try {
    const response = await apiService.patch('/admin/settings/anti-cheat', settings);
    return response.data || response;
  } catch (error) {
    console.error('updateAntiCheatSettings error:', error);
    throwNormalized(error, 'Impossible de mettre à jour les paramètres anti-triche');
  }
}

// ==================== REAL-TIME MONITORING ====================

/**
 * Get real-time game stats
 */
export async function getRealTimeStats() {
  try {
    const response = await apiService.get('/admin/dashboard/real-time');
    return response.data || response;
  } catch (error) {
    console.error('getRealTimeStats error:', error);
    return {
      activePlayers: 0,
      activeSessions: 0,
      claimsLastHour: 0,
      prizesDistributed: 0,
    };
  }
}

/**
 * Get player heatmap data
 * @param {Object} params - { city?, timeframe? }
 */
export async function getPlayerHeatmap(params = {}) {
  try {
    const response = await apiService.get('/admin/analytics/heatmap', params);
    return response.data || response;
  } catch (error) {
    console.error('getPlayerHeatmap error:', error);
    return { points: [] };
  }
}

// ==================== MAINTENANCE MODE ====================

/**
 * Start maintenance mode
 * @param {string} message - Message to display to users
 */
export async function startMaintenance(message) {
  try {
    const response = await apiService.post('/admin/maintenance/start', { message });
    return response.data || response;
  } catch (error) {
    console.error('startMaintenance error:', error);
    throwNormalized(error, 'Impossible de démarrer la maintenance');
  }
}

/**
 * Stop maintenance mode
 */
export async function stopMaintenance() {
  try {
    const response = await apiService.post('/admin/maintenance/stop');
    return response.data || response;
  } catch (error) {
    console.error('stopMaintenance error:', error);
    throwNormalized(error, 'Impossible d\'arrêter la maintenance');
  }
}

/**
 * Get maintenance status
 */
export async function getMaintenanceStatus() {
  try {
    const response = await apiService.get('/admin/game-control/maintenance/status');
    return response.data || response;
  } catch (error) {
    console.error('getMaintenanceStatus error:', error);
    return { active: false, message: null };
  }
}

// ==================== UNITY PERFORMANCE METRICS ====================

/**
 * Get real-time Unity game metrics
 */
export async function getUnityRealtimeMetrics() {
  try {
    const response = await apiService.get('/game/metrics/realtime');
    return response.data || response;
  } catch (error) {
    console.error('getUnityRealtimeMetrics error:', error);
    return {
      activeSessions: 0,
      averageFrameRate: 0,
      averageLatency: 0,
      crashRate: 0,
    };
  }
}

/**
 * Get Unity performance report
 * @param {Object} params - { start?, end? } ISO date strings
 */
export async function getUnityPerformanceReport(params = {}) {
  try {
    const response = await apiService.get('/game/metrics/unity-performance', params);
    return response.data || response;
  } catch (error) {
    console.error('getUnityPerformanceReport error:', error);
    return {
      averageFrameRate: 0,
      averageLatency: 0,
      averageBatteryUsage: 0,
      totalSessions: 0,
      totalCrashes: 0,
      crashRate: 0,
      performanceByPlatform: [],
    };
  }
}

/**
 * Generate metrics report (daily/weekly/monthly)
 * @param {string} period - 'daily' | 'weekly' | 'monthly'
 */
export async function generateMetricsReport(period = 'daily') {
  try {
    const response = await apiService.get(`/admin/analytics/metrics-report`, { period });
    return response.data || response;
  } catch (error) {
    console.error('generateMetricsReport error:', error);
    return null;
  }
}

export default {
  // Sessions
  getActiveSessions,
  getSessionHistory,
  getSessionDetails,
  forceEndSession,
  // Leaderboards
  getLeaderboard,
  resetLeaderboard,
  // Challenges
  getDailyChallenges,
  updateChallenge,
  deleteChallenge,
  // Settings
  getGameSettings,
  updateGameSettings,
  getAntiCheatSettings,
  updateAntiCheatSettings,
  // Monitoring
  getRealTimeStats,
  getPlayerHeatmap,
  // Maintenance
  startMaintenance,
  stopMaintenance,
  getMaintenanceStatus,
  // Unity Metrics
  getUnityRealtimeMetrics,
  getUnityPerformanceReport,
  generateMetricsReport,
};
