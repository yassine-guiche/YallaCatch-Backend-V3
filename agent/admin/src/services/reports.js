/**
 * YallaCatch! Reports Service
 * Admin management of user reports and moderation
 * 
 * CANONICAL SERVICE for all report/moderation operations
 * Uses apiService base methods for consistency
 */

import apiService from './api';

const throwNormalized = (error, fallback) => {
  throw apiService.normalizeError(error, fallback);
};

/**
 * Get all reports with filtering
 * @param {Object} params - { page?, limit?, status?, type?, userId? }
 */
export async function getReports(params = {}) {
  try {
    const response = await apiService.get('/admin/reports', params);
    const reports = response?.data?.reports || response?.reports || response?.data || [];
    return {
      items: reports,
      total: response?.total || reports.length,
      success: response?.success ?? true,
      pagination: response?.pagination || { page: 1, limit: 20, total: reports.length }
    };
  } catch (error) {
    console.error('getReports error:', error);
    return { items: [], total: 0, success: false, pagination: { page: 1, limit: 20, total: 0 } };
  }
}

/**
 * Get a specific report by ID
 * @param {string} reportId 
 */
export async function getReportById(reportId) {
  try {
    const response = await apiService.get(`/admin/reports/${reportId}`);
    return response?.data?.report || response?.report || response?.data || response;
  } catch (error) {
    console.error('getReportById error:', error);
    throwNormalized(error, 'Impossible de récupérer le rapport');
  }
}

/**
 * Handle/resolve a report
 * @param {string} reportId 
 * @param {string} action - 'resolve' | 'reject' | 'dismiss'
 * @param {string} notes - Admin notes for the resolution
 */
export async function handleReport(reportId, action, notes = '') {
  try {
    let response;
    if (action === 'resolve') {
      response = await apiService.patch(`/admin/reports/${reportId}/resolve`, { notes });
    } else if (action === 'reject' || action === 'dismiss') {
      response = await apiService.patch(`/admin/reports/${reportId}/dismiss`, { notes });
    } else {
      throw new Error('Unsupported report action: ' + action);
    }
    return {
      success: response?.success ?? true,
      ...response?.data || response
    };
  } catch (error) {
    console.error('handleReport error:', error);
    throwNormalized(error, 'Impossible de traiter le rapport');
  }
}

/**
 * Resolve a report (shorthand)
 * @param {string} reportId 
 * @param {string} notes 
 */
export async function resolveReport(reportId, notes = '') {
  return handleReport(reportId, 'resolve', notes);
}

/**
 * Reject a report (shorthand)
 * @param {string} reportId 
 * @param {string} notes 
 */
export async function rejectReport(reportId, notes = '') {
  return handleReport(reportId, 'reject', notes);
}

/**
 * Dismiss a report (shorthand)
 * @param {string} reportId 
 * @param {string} notes 
 */
export async function dismissReport(reportId, notes = '') {
  return handleReport(reportId, 'dismiss', notes);
}

/**
 * Get report statistics
 */
export async function getReportStats() {
  try {
    const response = await apiService.get('/admin/reports/stats');
    return response?.data || response || {
      total: 0,
      pending: 0,
      resolved: 0,
      rejected: 0,
      byType: {}
    };
  } catch (error) {
    console.error('getReportStats error:', error);
    return { total: 0, pending: 0, resolved: 0, rejected: 0, byType: {} };
  }
}

/**
 * Get reports for a specific user
 * @param {string} userId 
 * @param {Object} params - { page?, limit?, status? }
 */
export async function getReportsByUser(userId, params = {}) {
  try {
    const response = await apiService.get(`/admin/reports/user/${userId}`, params);
    const reports = response?.data?.reports || response?.reports || response?.data || [];
    return {
      items: reports,
      total: response?.total || reports.length
    };
  } catch (error) {
    console.error('getReportsByUser error:', error);
    return { items: [], total: 0 };
  }
}

/**
 * Get reports for a specific capture/claim
 * @param {string} captureId 
 */
export async function getReportsByCapture(captureId) {
  try {
    const response = await apiService.get(`/admin/reports/capture/${captureId}`);
    const reports = response?.data?.reports || response?.reports || response?.data || [];
    return {
      items: reports,
      total: reports.length
    };
  } catch (error) {
    console.error('getReportsByCapture error:', error);
    return { items: [], total: 0 };
  }
}

export default {
  getReports,
  getReportById,
  handleReport,
  resolveReport,
  rejectReport,
  dismissReport,
  getReportStats,
  getReportsByUser,
  getReportsByCapture
};
