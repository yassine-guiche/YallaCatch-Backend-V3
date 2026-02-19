/**
 * Activity Log Service
 * Handles activity logging using Node.js backend
 */

import api from './api';

/**
 * Log an activity
 * @param {object} params
 * @param {object} params.actor - Actor information (id, email, name)
 * @param {string} params.action - Action performed
 * @param {object} params.target - Target information
 * @param {object} params.details - Additional details
 * @param {string} params.message - Human-readable message
 * @param {string} params.type - Activity type
 * @returns {Promise<object>}
 */
export async function logActivity({
  actor = {},
  action = '',
  target = {},
  details = {},
  message = '',
  type = 'admin_activity',
}) {
  try {
    const payload = {
      type,
      action,
      message,
      actor: {
        id: actor.id || null,
        email: actor.email || null,
        name: actor.name || null,
      },
      target,
      details,
    };

    const response = await api.post('/admin/activity-logs', payload);
    
    if (response.success) {
      return response.data;
    } else {
      throw new Error(response.error || 'Failed to log activity');
    }
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw - activity logging should not break the app
    return null;
  }
}

/**
 * Get activity logs with optional filters
 * @param {object} options
 * @param {number} options.limit - Maximum number of logs to retrieve
 * @param {string} options.action - Filter by action
 * @param {string} options.actorEmail - Filter by actor email
 * @param {number} options.page - Page number for pagination
 * @returns {Promise<Array>}
 */
export async function getActivityLogs({ 
  limit = 50, 
  action = null, 
  actorEmail = null,
  page = 1,
} = {}) {
  try {
    const params = {
      limit,
      page,
    };
    
    if (action) {
      params.action = action;
    }
    
    if (actorEmail) {
      params.actorEmail = actorEmail;
    }

    const response = await api.get('/admin/activity-logs', params);
    
    // Backend returns { logs, total, page, limit } directly
    if (response && response.logs) {
      return {
        logs: response.logs || [],
        total: response.total || 0,
        page: response.page || page,
        limit: response.limit || limit,
      };
    }
    
    // Handle wrapped response { success: true, data: { logs, ... } }
    if (response.success && response.data) {
      return {
        logs: response.data.logs || [],
        total: response.data.pagination?.total || response.data.total || 0,
        page: response.data.pagination?.page || response.page || page,
        limit: response.data.pagination?.limit || response.limit || limit,
      };
    }
    
    if (Array.isArray(response)) {
      return { logs: response, total: response.length, page, limit };
    }
    
    throw new Error(response.error || 'Failed to fetch activity logs');
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    return { logs: [], total: 0, page, limit };
  }
}

/**
 * Subscribe to activity logs (polling-based)
 * This is a compatibility function for components expecting real-time updates
 * @param {Function} callback 
 * @param {object} options - Same as getActivityLogs options
 * @returns {Function} Unsubscribe function
 */
export function subscribeActivityLogs(callback, options = {}) {
  let isActive = true;
  
  // Fetch immediately
  getActivityLogs(options).then(logs => {
    if (isActive) {
      callback(logs);
    }
  });
  
  // Poll every 10 seconds
  const intervalId = setInterval(async () => {
    if (isActive) {
      const logs = await getActivityLogs(options);
      callback(logs);
    }
  }, 10000);
  
  // Return unsubscribe function
  return () => {
    isActive = false;
    clearInterval(intervalId);
  };
}

/**
 * Get activity statistics
 * @returns {Promise<object>}
 */
export async function getActivityStatistics() {
  try {
    const response = await api.get('/admin/activity-logs/statistics');
    
    if (response.success && response.data) {
      return response.data;
    } else {
      throw new Error(response.error || 'Failed to fetch activity statistics');
    }
  } catch (error) {
    console.error('Error fetching activity statistics:', error);
    return {
      total: 0,
      today: 0,
      thisWeek: 0,
      byAction: [],
      byActor: [],
    };
  }
}

/**
 * Clear old activity logs
 * @param {number} daysToKeep - Number of days of logs to keep
 * @returns {Promise<number>} Number of logs deleted
 */
export async function clearOldActivityLogs(daysToKeep = 90) {
  try {
    const response = await api.delete('/admin/activity-logs/clear', {
      data: { daysToKeep },
    });
    
    if (response.success && response.data) {
      return response.data.deleted || 0;
    } else {
      throw new Error(response.error || 'Failed to clear activity logs');
    }
  } catch (error) {
    console.error('Error clearing activity logs:', error);
    throw error;
  }
}

/**
 * Export activity logs to CSV
 * @param {object} options - Same as getActivityLogs options
 * @returns {Promise<Blob>}
 */
export async function exportActivityLogs(options = {}) {
  try {
    const response = await api.get('/admin/activity-logs/export', {
      params: options,
      responseType: 'blob',
    });
    
    return response;
  } catch (error) {
    console.error('Error exporting activity logs:', error);
    throw error;
  }
}
