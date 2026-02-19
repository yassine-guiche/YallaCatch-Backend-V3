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
  const response = await api.post('/partner/location', location);
  return response?.data || response;
}

export async function deletePartnerLocation(locationId) {
  const response = await api.delete(`/partner/locations/${locationId}`);
  return response?.data || response;
}

export async function getPartnerStats(params = {}) {
  const response = await api.get('/partner/stats', params);
  return response?.data || response;
}

export async function getMyPartnerLocations(params = {}) {
  const response = await api.get('/partner/locations', params);
  return response?.data || response;
}

export async function getPartnerProfile() {
  const response = await api.get('/partner/profile');
  return response?.data?.partner || response?.partner || response?.data || {};
}

export async function updatePartnerProfile(data) {
  const response = await api.put('/partner/profile', data);
  return response?.data?.partner || response?.partner || response?.data || {};
}

export default {
  getPendingRedemptions,
  scanRedemption,
  updatePartnerLocation,
  deletePartnerLocation,
  getPartnerStats,
  getMyPartnerLocations,
  getPartnerProfile,
  updatePartnerProfile,
};
