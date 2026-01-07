import api from './api';

/**
 * Partner/Admin Redemptions Service
 * - List pending redemptions (partner scoped if token belongs to a partner user)
 * - Scan QR code to fulfill redemption
 */

export async function getPendingRedemptions(params = {}) {
  const response = await api.getPendingRedemptions(params);
  const payload = response?.data || response;
  return payload.data || payload.redemptions || payload.items || [];
}

export async function scanRedemption(qrCode, location = null) {
  const response = await api.scanRedemptionQRCode(qrCode, location);
  return response?.data || response;
}

export async function updatePartnerLocation(location) {
  const response = await api.post('/rewards/partners/me/location', location);
  return response?.data || response;
}

export async function getPartnerStats(params = {}) {
  const response = await api.get('/rewards/partners/stats', params);
  return response?.data || response;
}

export async function getMyPartnerLocations(params = {}) {
  const response = await api.get('/rewards/partners/me/locations', params);
  return response?.data || response;
}

export default {
  getPendingRedemptions,
  scanRedemption,
  updatePartnerLocation,
  getPartnerStats,
  getMyPartnerLocations,
};
