import mockApiService from './mockApi';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true' || false; // Mode production - backend réel

class ApiError extends Error {
  constructor({ code, message, status, details, payload }) {
    super(message || code || 'API_ERROR');
    this.name = 'ApiError';
    this.code = code || 'API_ERROR';
    this.status = status || null;
    this.details = details;
    this.payload = payload;
  }
}

class APIService {
  constructor() {
    this.baseURL = API_BASE_URL;
    this.token = localStorage.getItem('access_token');
    this.refreshToken = localStorage.getItem('refresh_token');
  }

  /**
   * Pending redemptions (admin/partner)
   */
  async getPendingRedemptions(params = {}) {
    return this.get('/rewards/redemptions/pending', params);
  }

  /**
   * Scan redemption QR
   */
  async scanRedemptionQRCode(qrCode, location = null) {
    return this.post('/rewards/qr-scan', { qrCode, location });
  }

  /**
   * Normaliser une réponse d'erreur backend (voir docs/ERROR_MAP.md)
   */
  buildError(status, payload, fallback) {
    const code = (payload && (payload.error || payload.code)) || `HTTP_${status}`;
    const message =
      (payload && (payload.message || payload.msg)) ||
      (typeof payload?.error === 'string' ? payload.error : null) ||
      fallback ||
      'Request failed';

    return new ApiError({
      code,
      message,
      status,
      details: payload?.details || payload?.data,
      payload,
    });
  }

  /**
   * Uniformiser les erreurs côté client tout en conservant le code backend
   */
  normalizeError(error, fallbackMessage = 'Une erreur est survenue') {
    if (error instanceof ApiError) {
      if (!error.message && fallbackMessage) {
        error.message = fallbackMessage;
      }
      return error;
    }

    const code = error?.code || 'CLIENT_ERROR';
    const status = error?.status || null;
    const message = error?.message || fallbackMessage;
    return new ApiError({ code, status, message, payload: error });
  }

  /**
   * Extraire un payload d'erreur pour l'UI (code + message)
   */
  getErrorInfo(error, fallbackMessage = 'Une erreur est survenue') {
    const normalized = this.normalizeError(error, fallbackMessage);
    return {
      code: normalized.code,
      message: normalized.message,
      status: normalized.status,
      details: normalized.details,
    };
  }

  /**
   * Définir le token d'authentification
   */
  setToken(token, refreshToken = null) {
    this.token = token;
    localStorage.setItem('access_token', token);
    
    if (refreshToken) {
      this.refreshToken = refreshToken;
      localStorage.setItem('refresh_token', refreshToken);
    }
  }

  /**
   * Alias utilisé par certains services existants
   */
  setAuthToken(token) {
    this.setToken(token);
  }

  /**
   * Supprimer le token d'authentification
   */
  clearToken() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  /**
   * Obtenir les headers pour les requêtes
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Rafraîchir le token d'accès
   */
  async refreshAccessToken() {
    try {
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        this.setToken(data.tokens.accessToken, data.tokens.refreshToken);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  /**
   * Effectuer une requête HTTP
   */
  async request(endpoint, options = {}) {
    // Mode MOCK pour démo
    if (USE_MOCK) {
      return this.mockRequest(endpoint, options);
    }
    
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    };

    try {
      let response = await fetch(url, config);

      // Si 401 Unauthorized, essayer de rafraîchir le token
      if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        
        if (refreshed) {
          // Réessayer la requête avec le nouveau token
          config.headers['Authorization'] = `Bearer ${this.token}`;
          response = await fetch(url, config);
        } else {
          // Échec du refresh, déconnecter l'utilisateur
          this.clearToken();
          window.location.href = '/login';
          throw new Error('Session expired');
        }
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw this.buildError(response.status, payload, response.statusText);
      }

      // Gracefully handle empty responses (204 or no body)
      if (response.status === 204) {
        return { success: true };
      }
      const contentType = response.headers.get('Content-Type');
      if (contentType && contentType.includes('application/json')) {
        const json = await response.json().catch(() => null);
        return json ?? { success: true };
      }
      const text = await response.text().catch(() => '');
      return text || { success: true };
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError({
        code: error?.code || 'NETWORK_ERROR',
        message: error?.message || 'Network error',
        payload: error,
      });
    }
  }

  /**
   * Méthodes HTTP
   */
  async get(endpoint, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;
    return this.request(url, { method: 'GET' });
  }

  async post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async patch(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  /**
   * Upload de fichier
   */
  async uploadFile(endpoint, file, additionalData = {}) {
    const formData = new FormData();
    formData.append('file', file);
    
    Object.keys(additionalData).forEach(key => {
      formData.append(key, additionalData[key]);
    });

    const headers = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw this.buildError(response.status, payload, response.statusText || 'Upload failed');
    }

    return await response.json();
  }

  // ==================== AUTHENTIFICATION ====================

  /**
   * Connexion admin
   */
  async login(email, password) {
    // Ensure a stable deviceId and required platform for backend
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = `admin-web-${Math.random().toString(36).slice(2)}${Date.now()}`;
      localStorage.setItem('device_id', deviceId);
    }
    const response = await this.post('/auth/login', {
      email: (email || '').trim().toLowerCase(),
      password: (password || '').trim(),
      deviceId,
      platform: 'Web',
      deviceInfo: {
        platform: 'web',
        version: '1.0.0',
        userAgent: navigator.userAgent,
      },
    });

    const payload = response?.data || response;
    const user = payload?.user || payload?.data?.user || payload?.data || payload;
    const tokens = payload?.tokens || payload?.data?.tokens || null;

    if (tokens?.accessToken) {
      this.setToken(tokens.accessToken, tokens.refreshToken);
    }

    return { user, tokens };
  }

  /**
   * Connexion partenaire (portail partenaire)
   */
  async partnerLogin(email, password) {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = `partner-web-${Math.random().toString(36).slice(2)}${Date.now()}`;
      localStorage.setItem('device_id', deviceId);
    }
    const response = await this.post('/auth/partner-login', {
      email: (email || '').trim().toLowerCase(),
      password: (password || '').trim(),
      deviceId,
      platform: 'Web',
      deviceInfo: {
        platform: 'web',
        version: '1.0.0',
        userAgent: navigator.userAgent,
      },
    });

    const payload = response?.data || response;
    const user = payload?.user || payload?.data?.user || payload?.data || payload;
    const tokens = payload?.tokens || payload?.data?.tokens || null;

    if (tokens?.accessToken) {
      this.setToken(tokens.accessToken, tokens.refreshToken);
    }

    return { user, tokens };
  }

  /**
   * Déconnexion
   */
  async logout() {
    try {
      await this.post('/auth/logout');
    } finally {
      this.clearToken();
    }
  }

  /**
   * Obtenir l'utilisateur connecté
   */
  async getCurrentUser() {
    const response = await this.get('/auth/me');
    const payload = response?.data || response;
    const user = payload?.user || payload?.data?.user || payload?.data || payload;
    return { user };
  }

  // ==================== UTILISATEURS ====================

  /**
   * Obtenir la liste des utilisateurs avec pagination
   */
  async getUsers(params = {}) {
    const response = await this.get('/admin/users', params);
    return {
      success: response.success ?? true,
      users: response.users || response.data?.users || response.data || [],
      total: response.total || 0,
      page: response.page || 1,
      limit: response.limit || 20,
      hasMore: response.hasMore || false
    };
  }

  /**
   * Obtenir un utilisateur par ID
   */
  async getUser(userId) {
    const response = await this.get(`/admin/users/${userId}`);
    return {
      success: response.success ?? true,
      user: response.user || response.data || null
    };
  }

  /**
   * Créer un utilisateur
   */
  async createUser(userData) {
    return this.post('/admin/users', userData);
  }

  /**
   * Mettre à jour un utilisateur
   */
  async updateUser(userId, userData) {
    return this.patch(`/admin/users/${userId}`, userData);
  }

  /**
   * Supprimer un utilisateur
   */
  async deleteUser(userId) {
    return this.delete(`/admin/users/${userId}`);
  }

  /**
   * Bannir un utilisateur
   */
  async banUser(userId, reason, duration) {
    return this.post(`/admin/users/${userId}/ban`, { reason, duration });
  }

  /**
   * Débannir un utilisateur
   */
  async unbanUser(userId) {
    return this.post(`/admin/users/${userId}/unban`);
  }

  /**
   * Ajouter des points à un utilisateur
   */
  async addUserPoints(userId, amount, reason) {
    return this.post(`/admin/users/${userId}/points`, { amount, reason });
  }

  // ==================== PRIX ====================

  /**
   * Liste des prix avec pagination
   */
  async getPrizes(params = {}) {
    return this.get('/admin/prizes', params);
  }

  /**
   * Obtenir un prix par ID
   */
  async getPrize(prizeId) {
    return this.get(`/admin/prizes/${prizeId}`);
  }

  /**
   * Distribuer un prix (placer sur la carte)
   */
  async distributePrize(prizeData) {
    return this.post('/admin/place', prizeData);
  }

  /**
   * Distribution en masse
   */
  async distributePrizesBatch(prizesData) {
    return this.post('/admin/batch', prizesData);
  }

  /**
   * Mettre à jour un prix
   */
  async updatePrize(prizeId, prizeData) {
    return this.patch(`/admin/prizes/${prizeId}`, prizeData);
  }

  /**
   * Supprimer un prix
   */
  async deletePrize(prizeId) {
    return this.delete(`/admin/prizes/${prizeId}`);
  }

  /**
   * Activer/désactiver un prix
   */
  async togglePrizeStatus(prizeId, active) {
    const status = active ? 'active' : 'inactive';
    return this.updatePrizeStatus(prizeId, status);
  }

  /**
   * Update prize status (compat with services/prizes.js)
   */
  async updatePrizeStatus(prizeId, status) {
    return this.patch(`/admin/prizes/${prizeId}`, { status });
  }

  // ==================== CAPTURES ====================

  /**
   * Liste des captures
   */
  async getCaptures(params = {}) {
    return this.get('/admin/captures', params);
  }

  /**
   * Obtenir une capture par ID
   */
  async getCapture(captureId) {
    return this.get(`/admin/captures/${captureId}`);
  }

  /**
   * Valider une capture
   */
  async validateCapture(captureId) {
    return this.post(`/admin/captures/${captureId}/validate`);
  }

  /**
   * Rejeter une capture
   */
  async rejectCapture(captureId, reason) {
    return this.post(`/admin/captures/${captureId}/reject`, { reason });
  }

  /**
   * Obtenir les statistiques des captures
   */
  async getCaptureStats(params = {}) {
    return this.get('/admin/captures/analytics', params);
  }

  /**
   * Vérifier l'état de santé du système
   */
  async getHealthCheck() {
    return this.get('/health');
  }

  /**
   * Obtenir les métriques système
   */
  async getMetrics() {
    return this.get('/metrics');
  }

  /**
   * Obtenir les signalements de captures
   */
  async getCaptureReports(params = {}) {
    return this.get('/admin/reports', params);
  }

  /**
   * Traiter un signalement de capture
   */
  async handleCaptureReport(reportId, action, notes = '') {
    if (action === 'resolve') {
      return this.patch(`/admin/reports/${reportId}/resolve`, { notes });
    }
    if (action === 'reject' || action === 'dismiss') {
      return this.patch(`/admin/reports/${reportId}/dismiss`, { notes });
    }
    throw new Error('Unsupported report action');
  }

  // ==================== RÉCOMPENSES (MARKETPLACE) ====================

  /**
   * Liste des récompenses
   */
  async getRewards(params = {}) {
    return this.get('/admin/rewards', params);
  }

  /**
   * Obtenir une récompense par ID
   */
  async getReward(rewardId) {
    return this.get(`/marketplace/${rewardId}`);
  }

  /**
   * Créer une récompense
   */
  async createReward(rewardData) {
    return this.post('/admin/rewards', rewardData);
  }

  /**
   * Mettre à jour une récompense
   */
  async updateReward(rewardId, rewardData) {
    return this.patch(`/admin/rewards/${rewardId}`, rewardData);
  }

  /**
   * Supprimer une récompense
   */
  async deleteReward(rewardId) {
    return this.delete(`/admin/rewards/${rewardId}`);
  }

  /**
   * Liste des rachats
   */
  async getRedemptions(params = {}) {
    return this.get('/admin/redemptions', params);
  }

  /**
   * Valider un rachat
   */
  async validateRedemption(redemptionId) {
    return this.post(`/admin/redemptions/${redemptionId}/validate`);
  }

  /**
   * Obtenir les catégories du marketplace
   */
  async getMarketplaceCategories() {
    return this.get('/marketplace/categories');
  }

  /**
   * Obtenir les récompenses vedettes
   */
  async getFeaturedRewards() {
    return this.get('/marketplace/featured');
  }

  /**
   * Obtenir l'historique des échanges du marketplace
   */
  async getMarketplaceHistory(params = {}) {
    return this.get('/marketplace/history', params);
  }

  /**
   * Obtenir les analytics des récompenses
   */
  async getRewardAnalytics(params = {}) {
    return this.get('/admin/rewards/analytics', params);
  }

  /**
   * Obtenir les analytics des captures
   */
  async getCaptureAnalytics(params = {}) {
    return this.get('/admin/captures/analytics', params);
  }

  // ==================== PARTENAIRES ====================

  /**
   * Liste des partenaires
   */
  async getPartners(params = {}) {
    return this.get('/admin/partners', params);
  }

  /**
   * Obtenir un partenaire par ID
   */
  async getPartner(partnerId) {
    return this.get(`/admin/partners/${partnerId}`);
  }

  /**
   * Créer un partenaire
   */
  async createPartner(partnerData) {
    return this.post('/admin/partners', partnerData);
  }

  /**
   * Mettre à jour un partenaire
   */
  async updatePartner(partnerId, partnerData) {
    return this.patch(`/admin/partners/${partnerId}`, partnerData);
  }

  /**
   * Supprimer un partenaire
   */
  async deletePartner(partnerId) {
    return this.delete(`/admin/partners/${partnerId}`);
  }

  /**
   * Analytics partenaires
   */
  async getPartnerAnalytics(params = {}) {
    const response = await this.get('/admin/analytics/partners', params);
    return {
      success: response.success ?? true,
      stats: response.stats || response.data || {}
    };
  }

  // ==================== ANALYTICS ====================

  /**
   * Dashboard analytics
   * @param {Object} params - Query parameters
   * @param {string} params.period - Time period ('1d', '7d', '30d', '90d' or 'day', 'week', 'month', 'year')
   */
  async getDashboardStats(params = {}) {
    // Convert period format if needed (frontend uses '7d', backend expects 'week')
    const periodMap = {
      '1d': 'day',
      '7d': 'week',
      '30d': 'month',
      '90d': 'year',
      'day': 'day',
      'week': 'week',
      'month': 'month',
      'year': 'year'
    };
    const period = periodMap[params.period] || params.period || 'week';
    
    const response = await this.get('/admin/dashboard', { period });
    return {
      success: response.success ?? true,
      stats: response.stats || response.data || {}
    };
  }

  /**
   * Convert period format from frontend to backend
   * Frontend uses '1d', '7d', '30d', '90d' or 'day', 'week', 'month', 'year'
   * Backend expects 'day', 'week', 'month', 'year'
   */
  _normalizePeriod(period) {
    const periodMap = {
      '1d': 'day',
      '7d': 'week',
      '30d': 'month',
      '90d': 'year',
      'day': 'day',
      'week': 'week',
      'month': 'month',
      'year': 'year'
    };
    return periodMap[period] || period || 'week';
  }

  /**
   * Analytics utilisateurs
   */
  async getUserAnalytics(params = {}) {
    const period = this._normalizePeriod(params.period);
    const response = await this.get('/admin/analytics/users', { ...params, period });
    return {
      success: response.success ?? true,
      stats: response.stats || response.data || {}
    };
  }

  /**
   * Analytics prix
   */
  async getPrizeAnalytics(params = {}) {
    const period = this._normalizePeriod(params.period);
    const response = await this.get('/admin/analytics/prizes', { ...params, period });
    return {
      success: response.success ?? true,
      stats: response.stats || response.data || {}
    };
  }

  /**
   * Analytics business
   */
  async getBusinessAnalytics(params = {}) {
    const period = this._normalizePeriod(params.period);
    const response = await this.get('/admin/analytics/business', { ...params, period });
    return {
      success: response.success ?? true,
      stats: response.stats || response.data || {}
    };
  }

  /**
   * Heatmap géographique
   */
  async getGeoHeatmap(params = {}) {
    const period = this._normalizePeriod(params.period);
    return this.get('/admin/analytics/heatmap', { ...params, period });
  }

  /**
   * Analytics récompenses
   */
  async getRewardAnalytics(params = {}) {
    const period = this._normalizePeriod(params.period);
    const response = await this.get('/admin/analytics/rewards', { ...params, period });
    return {
      success: response.success ?? true,
      stats: response.stats || response.data || {}
    };
  }

  /**
   * Métriques d'engagement
   */
  async getEngagementMetrics(params = {}) {
    const period = this._normalizePeriod(params.period);
    const response = await this.get('/admin/analytics/engagement', { ...params, period });
    return {
      success: response.success ?? true,
      metrics: response.metrics || response.data || {}
    };
  }

  /**
   * Analytics géographiques
   */
  async getGeoAnalytics(params = {}) {
    const period = this._normalizePeriod(params.period);
    const response = await this.get('/admin/analytics/geo', { ...params, period });
    return {
      success: response.success ?? true,
      stats: response.stats || response.data || {}
    };
  }

  /**
   * Analytics de rétention
   */
  async getRetentionAnalytics(params = {}) {
    const response = await this.get('/admin/analytics/retention', params);
    return {
      success: response.success ?? true,
      stats: response.stats || response.data || {}
    };
  }

  /**
   * Analytics de conversion
   */
  async getConversionAnalytics(params = {}) {
    const response = await this.get('/admin/analytics/conversion', params);
    return {
      success: response.success ?? true,
      stats: response.stats || response.data || {}
    };
  }

  /**
   * Données pour graphiques
   */
  async getChartData(params = {}) {
    const response = await this.get('/admin/analytics/chart', params);
    return {
      success: response.success ?? true,
      data: response.data || []
    };
  }

  /**
   * Exporter les analytics
   */
  async exportAnalytics(params = {}) {
    const response = await this.get('/admin/analytics/export', params);
    return {
      success: response.success ?? true,
      url: response.url || response.data || null
    };
  }

  /**
   * Prix à proximité
   */
  async getNearbyPrizes(params = {}) {
    return this.get('/admin/prizes/nearby', params);
  }

  // ==================== NOTIFICATIONS ====================

  /**
   * Envoyer une notification
   */
  async sendNotification(notificationData) {
    return this.post('/admin/notifications/send', notificationData);
  }

  /**
   * Envoyer une notification à tous les utilisateurs
   */
  async sendBroadcastNotification(notificationData) {
    return this.post('/admin/notifications/broadcast', notificationData);
  }

  /**
   * Liste des notifications
   */
  async getNotifications(params = {}) {
    return this.get('/admin/notifications', params);
  }

  /**
   * Récupérer une notification
   */
  async getNotification(notificationId) {
    return this.get(`/admin/notifications/${notificationId}`);
  }

  /**
   * Notifications stats (admin)
   */
  async getNotificationAdminStats(params = {}) {
    return this.get('/admin/notifications/stats', params);
  }

  /**
   * Schedule a notification
   */
  async scheduleNotification(notificationData) {
    return this.post('/admin/notifications/schedule', notificationData);
  }

  /**
   * Templates de notification (stubs alignés avec panel)
   */
  async getNotificationTemplates() {
    return this.get('/admin/notifications/templates');
  }

  async createNotificationTemplate(template) {
    return this.post('/admin/notifications/templates', template);
  }

  async updateNotificationTemplate(templateId, template) {
    return this.patch(`/admin/notifications/templates/${templateId}`, template);
  }

  async deleteNotificationTemplate(templateId) {
    return this.delete(`/admin/notifications/templates/${templateId}`);
  }

  // ==================== LOGS D'ACTIVITÉ ====================

  /**
   * Liste des logs d'audit
   */
  async getAuditLogs(params = {}) {
    return this.get('/admin/audit-logs', params);
  }

  /**
   * Statistiques système
   */
  async getSystemStats() {
    return this.get('/admin/system/stats');
  }

  // ==================== CONFIGURATION ====================

  /**
   * Obtenir la configuration
   */
  async getSettings() {
    return this.get('/admin/settings');
  }

  /**
   * Mettre à jour la configuration
   */
  async updateSettings(settings) {
    return this.patch('/admin/settings', settings);
  }

  /**
   * Mock Request - Router les requêtes vers le mock API
   */
  async mockRequest(endpoint, options = {}) {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    
    // Router vers les bonnes méthodes du mock
    try {
      // Auth
      if (endpoint.includes('/auth/login')) {
        return mockApiService.login(body.email, body.password);
      }
      
      // Users
      if (endpoint.includes('/admin/users') && method === 'GET') {
        const params = this.parseQueryParams(endpoint);
        return mockApiService.getUsers(params);
      }
      if (endpoint.includes('/analytics/users')) {
        return mockApiService.getUserAnalytics({});
      }
      
      // Prizes
      if (endpoint.includes('/admin/prizes') && method === 'GET') {
        const params = this.parseQueryParams(endpoint);
        return mockApiService.getPrizes(params);
      }
      if (endpoint.includes('/analytics/prizes')) {
        return mockApiService.getPrizeAnalytics({});
      }
      
      // Rewards
      if (endpoint.includes('/admin/rewards') && method === 'GET') {
        const params = this.parseQueryParams(endpoint);
        return mockApiService.getRewards(params);
      }
      if (endpoint.includes('/analytics/rewards')) {
        return mockApiService.getRewardAnalytics({});
      }
      
      // Captures
      if (endpoint.includes('/admin/captures') && method === 'GET') {
        const params = this.parseQueryParams(endpoint);
        return mockApiService.getCaptures(params);
      }
      if (endpoint.includes('/admin/captures/') && endpoint.includes('/validate')) {
        const captureId = endpoint.split('/')[3];
        return mockApiService.validateCapture(captureId, body.action);
      }
      
      // ✨ NOUVELLES APIs
      if (endpoint.includes('/capture/stats')) {
        return mockApiService.getCaptureStats({});
      }
      if (endpoint.includes('/capture/report') && method === 'GET') {
        const params = this.parseQueryParams(endpoint);
        return mockApiService.getCaptureReports(params);
      }
      if (endpoint.includes('/capture/report/') && method === 'POST') {
        const reportId = endpoint.split('/')[3];
        return mockApiService.handleCaptureReport(reportId, body.action, body.notes);
      }
      if (endpoint.includes('/marketplace/categories')) {
        return mockApiService.getMarketplaceCategories();
      }
      if (endpoint.includes('/marketplace/featured')) {
        return mockApiService.getFeaturedRewards();
      }
      if (endpoint.includes('/marketplace/history')) {
        const params = this.parseQueryParams(endpoint);
        return mockApiService.getMarketplaceHistory(params);
      }
      
      // Analytics
      if (endpoint.includes('/analytics/overview')) {
        return mockApiService.getAnalyticsOverview({});
      }
      if (endpoint.includes('/analytics/chart')) {
        return mockApiService.getChartData({});
      }
      
      // Dashboard
      if (endpoint.includes('/admin/dashboard')) {
        return mockApiService.getDashboardStats();
      }
      
      // Par défaut
      console.warn('Mock endpoint not found:', endpoint);
      return { success: true, data: [] };
      
    } catch (error) {
      console.error('Mock request error:', error);
      throw error;
    }
  }
  
  /**
   * Parser les query params d'une URL
   */
  parseQueryParams(url) {
    const params = {};
    const queryString = url.split('?')[1];
    if (queryString) {
      queryString.split('&').forEach(param => {
        const [key, value] = param.split('=');
        params[key] = decodeURIComponent(value);
      });
    }
    return params;
  }

  // ==================== PROXIMITÉ (POUR TESTS) ====================

  // ==================== CODES PROMO ====================

  /**
   * Liste des codes promo
   */
  async getCodes(params = {}) {
    const response = await this.get('/admin/codes', params);
    return {
      success: response.success ?? true,
      codes: response.codes || response.data || [],
      total: response.total || 0,
      page: response.page || 1,
      limit: response.limit || 20
    };
  }

  /**
   * Générer des codes promo
   */
  async generateCodes(config) {
    const response = await this.post('/admin/codes/generate', config);
    return {
      success: response.success ?? true,
      codes: response.codes || response.data || [],
      count: response.count || 0
    };
  }

  /**
   * Désactiver un code promo
   */
  async deactivateCode(codeId) {
    const response = await this.patch(`/admin/codes/${codeId}/deactivate`);
    return { success: response.success ?? true };
  }

  // ==================== SESSIONS ====================

  /**
   * Sessions actives
   */
  async getActiveSessions(params = {}) {
    const response = await this.get('/admin/sessions/active', params);
    return {
      success: response.success ?? true,
      sessions: response.sessions || response.data || [],
      total: response.total || 0
    };
  }

  /**
   * Terminer une session
   */
  async terminateSession(sessionId) {
    const response = await this.delete(`/admin/sessions/${sessionId}`);
    return { success: response.success ?? true };
  }

  /**
   * Statistiques des sessions
   */
  async getSessionStats(params = {}) {
    const response = await this.get('/admin/sessions/stats', params);
    return {
      success: response.success ?? true,
      stats: response.stats || response.data || {}
    };
  }

  // ==================== SYSTEM & BACKUP ====================

  /**
   * Santé du système
   */
  async getSystemHealth() {
    const response = await this.get('/admin/system/health');
    return {
      success: response.success ?? true,
      health: response.health || response.data || {}
    };
  }

  /**
   * Métriques système
   */
  async getSystemMetrics() {
    const response = await this.get('/admin/system/metrics');
    return {
      success: response.success ?? true,
      metrics: response.metrics || response.data || {}
    };
  }

  /**
   * Logs système
   */
  async getSystemLogs(params = {}) {
    const response = await this.get('/admin/system/logs', params);
    return {
      success: response.success ?? true,
      logs: response.logs || response.data || []
    };
  }

  /**
   * Créer une sauvegarde
   */
  async createBackup() {
    const response = await this.post('/admin/system/backup');
    return {
      success: response.success ?? true,
      backup: response.backup || response.data || null
    };
  }

  /**
   * Restaurer une sauvegarde
   */
  async restoreBackup(backupId) {
    const response = await this.post('/admin/system/restore', { backupId });
    return { success: response.success ?? true };
  }

  /**
   * Démarrer la maintenance
   */
  async startMaintenance(message = '', duration = 3600) {
    const response = await this.post('/admin/maintenance/start', { message, duration });
    return { success: response.success ?? true };
  }

  /**
   * Arrêter la maintenance
   */
  async stopMaintenance() {
    const response = await this.post('/admin/maintenance/stop');
    return { success: response.success ?? true };
  }

  // ==================== AR SESSIONS ====================

  /**
   * Sessions AR
   */
  async getARSessions(params = {}) {
    const response = await this.get('/admin/ar-sessions', params);
    return {
      success: response.success ?? true,
      sessions: response.sessions || response.data || [],
      total: response.total || 0
    };
  }

  /**
   * Statistiques AR
   */
  async getARStats() {
    const response = await this.get('/admin/ar-sessions/stats');
    return {
      success: response.success ?? true,
      stats: response.stats || response.data || {}
    };
  }

  // ==================== OFFLINE QUEUE ====================

  /**
   * File d'attente offline
   */
  async getOfflineQueue(params = {}) {
    const response = await this.get('/admin/offline-queue', params);
    return {
      success: response.success ?? true,
      queue: response.queue || response.data || [],
      total: response.total || 0
    };
  }

  /**
   * Vider la file d'attente
   */
  async clearOfflineQueue() {
    const response = await this.delete('/admin/offline-queue/clear');
    return { success: response.success ?? true };
  }

  // ==================== DEVICE TOKENS ====================

  /**
   * Jetons d'appareil
   */
  async getDeviceTokens(params = {}) {
    const response = await this.get('/admin/device-tokens', params);
    return {
      success: response.success ?? true,
      tokens: response.tokens || response.data || [],
      total: response.total || 0
    };
  }

  /**
   * Supprimer un jeton
   */
  async deleteDeviceToken(tokenId) {
    const response = await this.delete(`/admin/device-tokens/${tokenId}`);
    return { success: response.success ?? true };
  }

  /**
   * Statistiques des jetons
   */
  async getDeviceTokenStats() {
    const response = await this.get('/admin/device-tokens/stats');
    return {
      success: response.success ?? true,
      stats: response.stats || response.data || {}
    };
  }

  // ==================== FRIENDSHIPS ====================

  /**
   * Amités
   */
  async getFriendships(params = {}) {
    const response = await this.get('/admin/friendships', params);
    return {
      success: response.success ?? true,
      friendships: response.friendships || response.data || [],
      total: response.total || 0
    };
  }

  /**
   * Supprimer une amitié
   */
  async deleteFriendship(friendshipId) {
    const response = await this.delete(`/admin/friendships/${friendshipId}`);
    return { success: response.success ?? true };
  }

  // ==================== ACHIEVEMENTS ====================

  /**
   * Réalisations
   */
  async getAchievements(params = {}) {
    const response = await this.get('/admin/achievements', params);
    return {
      success: response.success ?? true,
      achievements: response.achievements || response.data || [],
      total: response.total || 0
    };
  }

  /**
   * Obtenir une réalisation
   */
  async getAchievement(achievementId) {
    const response = await this.get(`/admin/achievements/${achievementId}`);
    return {
      success: response.success ?? true,
      achievement: response.achievement || response.data || null
    };
  }

  /**
   * Créer une réalisation
   */
  async createAchievement(data) {
    const response = await this.post('/admin/achievements', data);
    return { success: response.success ?? true, achievement: response.achievement || response.data || null };
  }

  /**
   * Mettre à jour une réalisation
   */
  async updateAchievement(achievementId, data) {
    const response = await this.put(`/admin/achievements/${achievementId}`, data);
    return { success: response.success ?? true, achievement: response.achievement || response.data || null };
  }

  /**
   * Supprimer une réalisation
   */
  async deleteAchievement(achievementId) {
    const response = await this.delete(`/admin/achievements/${achievementId}`);
    return { success: response.success ?? true };
  }

  /**
   * Déverrouiller une réalisation pour un utilisateur
   */
  async unlockAchievement(userId, achievementId) {
    const response = await this.post('/admin/achievements/unlock', { userId, achievementId });
    return { success: response.success ?? true };
  }

  /**
   * Obtenir les jétons d'authentification actuels
   */
  getTokens() {
    return {
      accessToken: this.token,
      refreshToken: this.refreshToken,
    };
  }
}
// Instance singleton
const apiService = new APIService();

export default apiService;
export { ApiError };
