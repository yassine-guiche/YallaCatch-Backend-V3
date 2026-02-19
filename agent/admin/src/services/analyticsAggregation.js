/**
 * Analytics Aggregation Service
 * Handles analytics data aggregation using Node.js backend
 * 
 * This service preserves the original function signatures for compatibility
 */

import api from './api';

/**
 * Calculate overview metrics from backend
 * @returns {Promise<object>}
 */
export async function calculateOverviewMetrics() {
  try {
    const response = await api.get('/analytics/overview');
    
    if (response.success && response.data) {
      return response.data;
    } else {
      throw new Error(response.error || 'Failed to fetch overview metrics');
    }
  } catch (error) {
    console.error('Error calculating overview metrics:', error);
    return {
      totalUsers: 0,
      activeUsers: 0,
      conversionRate: 0,
      revenueGenerated: 0,
      totalPrizes: 0,
      capturedPrizes: 0,
    };
  }
}

/**
 * Calculate city distribution from backend
 * @returns {Promise<Array>}
 */
export async function calculateCityDistribution() {
  try {
    const response = await api.get('/analytics/city-distribution');
    
    if (response.success && response.data) {
      return response.data.distribution || [];
    } else {
      throw new Error(response.error || 'Failed to fetch city distribution');
    }
  } catch (error) {
    console.error('Error calculating city distribution:', error);
    return [];
  }
}

/**
 * Calculate level distribution from backend
 * @returns {Promise<Array>}
 */
export async function calculateLevelDistribution() {
  try {
    const response = await api.get('/analytics/level-distribution');
    
    if (response.success && response.data) {
      return response.data.distribution || [];
    } else {
      throw new Error(response.error || 'Failed to fetch level distribution');
    }
  } catch (error) {
    console.error('Error calculating level distribution:', error);
    return [];
  }
}

/**
 * Calculate user growth data
 * @param {number} days - Number of days to include
 * @returns {Promise<Array>}
 */
export async function calculateUserGrowth(days = 7) {
  try {
    const response = await api.get('/analytics/user-growth', {
      params: { days },
    });
    
    if (response.success && response.data) {
      return response.data.growth || [];
    } else {
      throw new Error(response.error || 'Failed to fetch user growth');
    }
  } catch (error) {
    console.error('Error calculating user growth:', error);
    return [];
  }
}

/**
 * Calculate prize activity data
 * @param {number} days - Number of days to include
 * @returns {Promise<Array>}
 */
export async function calculatePrizeActivity(days = 7) {
  try {
    const response = await api.get('/analytics/prize-activity', {
      params: { days },
    });
    
    if (response.success && response.data) {
      return response.data.activity || [];
    } else {
      throw new Error(response.error || 'Failed to fetch prize activity');
    }
  } catch (error) {
    console.error('Error calculating prize activity:', error);
    return [];
  }
}

/**
 * Calculate engagement metrics
 * @returns {Promise<object>}
 */
export async function calculateEngagementMetrics() {
  try {
    const response = await api.get('/analytics/engagement');
    
    if (response.success && response.data) {
      return response.data;
    } else {
      throw new Error(response.error || 'Failed to fetch engagement metrics');
    }
  } catch (error) {
    console.error('Error calculating engagement metrics:', error);
    return {
      dailyActiveUsers: 0,
      weeklyActiveUsers: 0,
      monthlyActiveUsers: 0,
      avgSessionsPerUser: 0,
      avgPrizesPerUser: 0,
      bounceRate: 0,
    };
  }
}

/**
 * Calculate revenue data
 * @returns {Promise<Array>}
 */
export async function calculateRevenueData() {
  try {
    const response = await api.get('/analytics/revenue');
    
    if (response.success && response.data) {
      return response.data.revenue || [];
    } else {
      throw new Error(response.error || 'Failed to fetch revenue data');
    }
  } catch (error) {
    console.error('Error calculating revenue data:', error);
    return [];
  }
}

/**
 * Aggregate all analytics data
 * @returns {Promise<object>}
 */
export async function aggregateAllAnalytics() {
  try {
    const response = await api.get('/analytics/aggregate');
    
    if (response.success && response.data) {
      return {
        ...response.data,
        timestamp: new Date().toISOString(),
      };
    } else {
      throw new Error(response.error || 'Failed to aggregate analytics');
    }
  } catch (error) {
    console.error('Error aggregating all analytics:', error);
    return {
      overview: null,
      cityDistribution: [],
      levelDistribution: [],
      userGrowth: [],
      prizeActivity: [],
      engagementMetrics: null,
      revenueData: [],
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Generate and store daily analytics
 * @returns {Promise<object>}
 */
export async function generateDailyAnalytics() {
  try {
    const response = await api.post('/analytics/generate-daily');
    
    if (response.success && response.data) {
      return response.data;
    } else {
      throw new Error(response.error || 'Failed to generate daily analytics');
    }
  } catch (error) {
    console.error('Error generating daily analytics:', error);
    return null;
  }
}

/**
 * Get analytics for a specific date
 * @param {Date} date 
 * @returns {Promise<object>}
 */
export async function getAnalyticsForDate(date) {
  try {
    const dateStr = date.toISOString().split('T')[0];
    
    const response = await api.get('/analytics/date', {
      params: { date: dateStr },
    });
    
    if (response.success && response.data) {
      return response.data;
    } else {
      throw new Error(response.error || 'Failed to fetch analytics for date');
    }
  } catch (error) {
    console.error('Error fetching analytics for date:', error);
    return null;
  }
}

/**
 * Get analytics summary for a period
 * @param {string} period - 'today', 'week', 'month', 'year'
 * @returns {Promise<object>}
 */
export async function getAnalyticsSummary(period = 'today') {
  try {
    const response = await api.get('/analytics/summary', {
      params: { period },
    });
    
    if (response.success && response.data) {
      return response.data;
    } else {
      throw new Error(response.error || 'Failed to fetch analytics summary');
    }
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    return {
      users: { total: 0, active: 0, new: 0 },
      captures: { total: 0, successful: 0, failed: 0 },
      rewards: { total: 0, redeemed: 0, pending: 0 },
      revenue: { total: 0, today: 0 },
    };
  }
}

// Helper functions for date calculations (kept for compatibility)
function getStartOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfMonth(date = new Date()) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export { getStartOfDay, getStartOfWeek, getStartOfMonth };

