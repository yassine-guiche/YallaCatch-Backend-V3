/**
 * YallaCatch! Settings Service
 * 
 * Manages system settings, game configuration, progression, anti-cheat, and offline settings.
 * 
 * NOTE: Partner management functions are now in partners.js service.
 * Import from there: import { getPartners, createPartner, updatePartner, deletePartner } from './partners';
 */

import apiService from './api';

/**
 * Obtenir les paramètres système
 */
export async function getSettings() {
  try {
    const response = await apiService.getSettings();
    return response.settings || response.data || {};
  } catch (error) {
    console.error('getSettings error:', error);
    return {};
  }
}

/**
 * Mettre à jour les paramètres système
 */
export async function updateSettings(updates) {
  try {
    const response = await apiService.updateSettings(updates);
    return response.settings || response.data;
  } catch (error) {
    console.error('updateSettings error:', error);
    throw error;
  }
}

// --------- FINE-GRAINED SETTINGS ---------

export async function getProgressionSettings() {
  const res = await apiService.get('/admin/settings/progression');
  return res.data || res.settings || res;
}

export async function updateProgressionSettings(payload) {
  const res = await apiService.patch('/admin/settings/progression', payload);
  return res.data || res.settings || res;
}

export async function getAntiCheatSettings() {
  const res = await apiService.get('/admin/settings/anti-cheat');
  return res.data || res.settings || res;
}

export async function updateAntiCheatSettings(payload) {
  const res = await apiService.patch('/admin/settings/anti-cheat', payload);
  return res.data || res.settings || res;
}

export async function getGameSettings() {
  const res = await apiService.get('/admin/settings/game');
  return res.data || res.settings || res;
}

export async function updateGameSettings(payload) {
  const res = await apiService.patch('/admin/settings/game', payload);
  return res.data || res.settings || res;
}

export async function getOfflineSettings() {
  const res = await apiService.get('/admin/settings/offline');
  return res.data || res.settings || res;
}

export async function updateOfflineSettings(payload) {
  const res = await apiService.patch('/admin/settings/offline', payload);
  return res.data || res.settings || res;
}

export async function clearCache() {
  return apiService.post('/admin/system/cache/clear');
}

// --------- SYSTEM CONFIG ---------

/**
 * Obtenir les paramètres de configuration système
 */
export async function getSystemConfig() {
  try {
    const response = await apiService.getSystemConfig();
    return response.config || response.data || {};
  } catch (error) {
    console.error('getSystemConfig error:', error);
    return {};
  }
}

/**
 * Mettre à jour la configuration système
 */
export async function updateSystemConfig(config) {
  try {
    const response = await apiService.updateSystemConfig(config);
    return response.config || response.data;
  } catch (error) {
    console.error('updateSystemConfig error:', error);
    throw error;
  }
}

export default {
  getSettings,
  updateSettings,
  getProgressionSettings,
  updateProgressionSettings,
  getAntiCheatSettings,
  updateAntiCheatSettings,
  getGameSettings,
  updateGameSettings,
  getOfflineSettings,
  updateOfflineSettings,
  clearCache,
  getSystemConfig,
  updateSystemConfig,
};
