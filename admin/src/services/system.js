/**
 * Service System - Gestion système avancée
 * APIs: 10 endpoints admin avancés
 */

import apiService from './api';

/**
 * Santé du système
 */
export async function getSystemHealth() {
  try {
    const response = await apiService.get('/admin/system/health');
    const data = response?.data || response || {};
    return data;
  } catch (error) {
    console.error('Erreur getSystemHealth:', error);
    // Return default structure on error
    return {
      api: { status: 'error', uptime: 'N/A' },
      mongodb: { status: 'error', connections: 0 },
      redis: { status: 'error', memory: 'N/A' }
    };
  }
}

/**
 * Métriques système
 */
export async function getSystemMetrics() {
  try {
    const response = await apiService.get('/admin/system/metrics');
    const data = response?.data || response || {};
    return data;
  } catch (error) {
    console.error('Erreur getSystemMetrics:', error);
    // Return default structure on error
    return {
      memory: { used: 'N/A', total: 'N/A', percentage: 0 },
      cpu: { usage: 0, cores: 0 },
      disk: { used: 'N/A', total: 'N/A', percentage: 0 },
      network: { incoming: 'N/A', outgoing: 'N/A', latency: '0ms' }
    };
  }
}

/**
 * Logs système
 */
export async function getSystemLogs(params = {}) {
  try {
    const response = await apiService.get('/admin/system/logs', params);
    return response.data;
  } catch (error) {
    console.error('Erreur getSystemLogs:', error);
    throw error;
  }
}

/**
 * Créer un backup
 */
export async function createBackup() {
  try {
    const response = await apiService.post('/admin/system/backup');
    return response.data;
  } catch (error) {
    console.error('Erreur createBackup:', error);
    throw error;
  }
}

/**
 * Restaurer un backup
 */
export async function restoreBackup(backupId) {
  try {
    const response = await apiService.post('/admin/system/restore', { backupId });
    return response.data;
  } catch (error) {
    console.error('Erreur restoreBackup:', error);
    throw error;
  }
}

/**
 * Récupérer les logs d'audit complets
 */
export async function getAuditLogs(params = {}) {
  try {
    const response = await apiService.get('/admin/audit-logs', { params });
    return {
      items: response.data.logs || response.data.items || [],
      total: response.data.total || 0
    };
  } catch (error) {
    console.error('Erreur getAuditLogs:', error);
    throw error;
  }
}

/**
 * Opérations en masse
 */
export async function bulkOperation(operation, data) {
  try {
    const response = await apiService.post('/admin/bulk-operations', {
      operation,
      data
    });
    return response.data;
  } catch (error) {
    console.error('Erreur bulkOperation:', error);
    throw error;
  }
}

/**
 * Générer un rapport
 */
export async function generateReport(reportType, params = {}) {
  try {
    const response = await apiService.get('/admin/reports/generate', {
      params: { type: reportType, ...params }
    });
    return response.data;
  } catch (error) {
    console.error('Erreur generateReport:', error);
    throw error;
  }
}

// ==================== MAINTENANCE MODE ====================
// NOTE: Maintenance functions are now centralized in gameControl.js
// Import from there instead: import { startMaintenance, stopMaintenance, getMaintenanceStatus } from './gameControl';
// These re-exports are kept for backward compatibility

import { startMaintenance, stopMaintenance, getMaintenanceStatus } from './gameControl';
export { startMaintenance, stopMaintenance, getMaintenanceStatus };

export default {
  getSystemHealth,
  getSystemMetrics,
  getSystemLogs,
  createBackup,
  restoreBackup,
  getAuditLogs,
  bulkOperation,
  generateReport,
  startMaintenance,
  stopMaintenance,
  getMaintenanceStatus
};
