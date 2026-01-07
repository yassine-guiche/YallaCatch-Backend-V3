/**
 * YallaCatch! Notifications Service
 */

import apiService from './api';
import { getSettings, updateSettings } from './settings';
import { mapBackendNotification, mapArray } from '../utils/mappers';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

/**
 * Obtenir la liste des notifications
 */
export async function getNotifications(params = {}) {
  try {
    const response = await apiService.getNotifications(params);
    const payload = response?.data || response;
    const dataBlock = payload?.data || {};
    const notifications = mapArray(
      payload?.notifications ||
      payload?.items ||
      dataBlock?.notifications ||
      dataBlock?.items ||
      payload?.data ||
      [],
      mapBackendNotification
    );
    
    return {
      items: notifications,
      total: payload?.total || payload?.pagination?.total || notifications.length,
      page: payload?.page || payload?.pagination?.page || 1,
      limit: payload?.limit || payload?.pagination?.limit || params.limit || 20,
      hasMore: payload?.hasMore || false
    };
  } catch (error) {
    console.error('getNotifications error:', error);
    throwNormalized(error, 'Impossible de récupérer les notifications');
  }
}

/**
 * Obtenir une notification par ID
 */
export async function getNotificationById(notificationId) {
  try {
    const response = await apiService.getNotification(notificationId);
    return mapBackendNotification(response.notification || response.data);
  } catch (error) {
    console.error('getNotificationById error:', error);
    return null;
  }
}

/**
 * Envoyer une notification à un utilisateur
 */
export async function sendNotification(form) {
  try {
    // Map UI to backend schema
    const channelMap = {
      push: 'push',
      email: 'email',
      sms: 'sms',
      in_app: 'in_app',
    };

    const backendData = {
      title: form.title,
      message: form.message,
      type: channelMap[form.channel || 'push'] || 'PUSH',
      targetUserIds: form.userId ? [form.userId] : (form.targetIds || []),
      data: { severity: form.type || 'info' },
    };

    // For broadcast to all users, use the broadcast endpoint instead
    if (form.target === 'all' || backendData.targetUserIds.length === 0) {
      const broadcastData = {
        title: form.title,
        message: form.message,
        type: channelMap[form.channel || 'push'] || 'PUSH',
        data: { severity: form.type || 'info' },
      };
      const response = await apiService.post('/admin/notifications/broadcast', broadcastData);
      return mapBackendNotification(response.notification || response.data || response);
    }

    const response = await apiService.sendNotification(backendData);
    return mapBackendNotification(response.notification || response.data);
  } catch (error) {
    console.error('sendNotification error:', error);
    throwNormalized(error, 'Impossible d’envoyer la notification');
  }
}

export async function scheduleNotification(form) {
  try {
    const channelMap = {
      push: 'push',
      email: 'email',
      sms: 'sms',
      in_app: 'in_app',
    };
    const backendData = {
      title: form.title,
      message: form.message,
      type: channelMap[form.channel || 'push'] || 'PUSH',
      targetType: form.target === 'all' ? 'all' : 'user',
      targetValue: form.userId || (Array.isArray(form.targetIds) ? form.targetIds[0] : undefined),
      scheduledFor: form.scheduledFor,
      metadata: { severity: form.type || 'info' },
    };
    const response = await apiService.scheduleNotification(backendData);
    return response.data || response;
  } catch (error) {
    console.error('scheduleNotification error:', error);
    throwNormalized(error, 'Impossible de planifier la notification');
  }
}

/**
 * Envoyer des notifications en masse
 */
export async function sendBulkNotifications(data) {
  try {
    const backendData = {
      userIds: data.userIds || [],
      filters: data.filters || {},
      type: data.type || 'info',
      title: data.title,
      message: data.message,
      data: data.data || {},
      channels: data.channels || ['push', 'in_app']
    };
    
    const response = await apiService.sendBulkNotifications(backendData);
    return {
      success: true,
      sent: response.sent || 0,
      failed: response.failed || 0
    };
  } catch (error) {
    console.error('sendBulkNotifications error:', error);
    throwNormalized(error, 'Impossible d’envoyer les notifications groupées');
  }
}

/**
 * Marquer une notification comme lue
 */
export async function markAsRead(notificationId) {
  try {
    const response = await apiService.markNotificationRead(notificationId);
    return mapBackendNotification(response.notification || response.data);
  } catch (error) {
    console.error('markAsRead error:', error);
    throwNormalized(error, 'Impossible de marquer la notification comme lue');
  }
}

/**
 * Supprimer une notification
 */
export async function deleteNotification(notificationId) {
  try {
    await apiService.deleteNotification(notificationId);
    return { success: true };
  } catch (error) {
    console.error('deleteNotification error:', error);
    throwNormalized(error, 'Impossible de supprimer la notification');
  }
}

/**
 * Lister les notifications avec filtres
 */
export async function listNotifications({
  status = 'all',
  type = 'all',
  userId = null,
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
    
    if (type !== 'all') {
      params.type = type;
    }
    
    if (userId) {
      params.userId = userId;
    }
    
    if (search && search.trim()) {
      params.search = search.trim();
    }
    
    if (cursor) {
      params.page = parseInt(cursor) + 1;
    }
    
    const response = await apiService.getNotifications(params);
    const items = mapArray(response.notifications || response.data || [], mapBackendNotification);
    
    return {
      items,
      lastDoc: response.page?.toString() || null,
      hasMore: response.hasMore || false
    };
  } catch (error) {
    console.error('listNotifications error:', error);
    throw error;
  }
}

/**
 * Obtenir les statistiques des notifications
 */
export async function getNotificationStats(period = 'month') {
  try {
    const response = await apiService.getNotificationAdminStats({ period });
    return response.data || response.stats || {};
  } catch (error) {
    console.error('getNotificationStats error:', error);
    return {};
  }
}

// ==================== TEMPLATES (via Settings) ====================

function ensureTemplatesShape(settings) {
  const custom = settings?.custom || {};
  const templates = custom.notificationsTemplates || { push: [], email: [], sms: [], in_app: [] };
  return { custom, templates };
}


/**
 * Obtenir les modèles de notifications
 */
export async function getNotificationTemplates() {
  try {
    const response = await apiService.getNotificationTemplates();
    // Backend might not have this endpoint, return default structure
    const data = response?.templates || response?.data || [];
    
    // If API returns an array, organize by channel
    if (Array.isArray(data)) {
      const organized = { push: [], email: [], sms: [], in_app: [] };
      data.forEach(tpl => {
        const channel = (tpl.channel || tpl.type || 'push').toLowerCase().replace('-', '_');
        if (organized[channel]) {
          organized[channel].push(tpl);
        }
      });
      return organized;
    }
    
    // If already organized by channel
    return {
      push: data.push || [],
      email: data.email || [],
      sms: data.sms || [],
      in_app: data.in_app || []
    };
  } catch (error) {
    console.error('getNotificationTemplates error:', error);
    // Return empty structure to avoid crashes
    return { push: [], email: [], sms: [], in_app: [] };
  }
}

/**
 * Créer un modèle de notification
 */
export async function createNotificationTemplate(template) {
  try {
    const response = await apiService.createNotificationTemplate(template);
    return response.template || response.data;
  } catch (error) {
    console.error('createNotificationTemplate error:', error);
    throwNormalized(error, 'Impossible de créer le modèle');
  }
}

/**
 * Mettre à jour un modèle de notification
 */
export async function updateNotificationTemplate(templateId, template) {
  try {
    const response = await apiService.updateNotificationTemplate(templateId, template);
    return response.template || response.data || response;
  } catch (error) {
    console.error('updateNotificationTemplate error:', error);
    throwNormalized(error, 'Impossible de mettre à jour le modèle');
  }
}

/**
 * Supprimer un modèle de notification
 */
export async function deleteNotificationTemplate(templateId) {
  try {
    const response = await apiService.deleteNotificationTemplate(templateId);
    return response.data || response;
  } catch (error) {
    console.error('deleteNotificationTemplate error:', error);
    throwNormalized(error, 'Impossible de supprimer le modèle');
  }
}

export default {
  getNotifications,
  getNotificationById,
  sendNotification,
  sendBulkNotifications,
  markAsRead,
  deleteNotification,
  listNotifications,
  getNotificationStats,
  getNotificationTemplates,
  createNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  scheduleNotification,
};
