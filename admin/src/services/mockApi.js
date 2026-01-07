/**
 * Mock API Service for YallaCatch! Admin Panel
 * Simule le backend complet avec des données réalistes
 */

// Données mockées
const mockData = {
  users: [
    { id: '1', username: 'Ahmed_TN', email: 'ahmed@example.tn', points: 1250, level: 5, status: 'active', city: 'Tunis', createdAt: '2024-01-15T10:00:00Z' },
    { id: '2', username: 'Fatima_Sousse', email: 'fatima@example.tn', points: 890, level: 4, status: 'active', city: 'Sousse', createdAt: '2024-02-20T14:30:00Z' },
    { id: '3', username: 'Mohamed_Sfax', email: 'mohamed@example.tn', points: 2100, level: 7, status: 'active', city: 'Sfax', createdAt: '2024-01-10T09:15:00Z' },
    { id: '4', username: 'Leila_Bizerte', email: 'leila@example.tn', points: 450, level: 3, status: 'suspended', city: 'Bizerte', createdAt: '2024-03-05T16:45:00Z' },
    { id: '5', username: 'Karim_Nabeul', email: 'karim@example.tn', points: 3200, level: 10, status: 'active', city: 'Nabeul', createdAt: '2023-12-01T08:00:00Z' },
  ],
  
  prizes: [
    { id: 'p1', name: 'Mystery Box Gold', type: 'mystery_box', points: 500, rarity: 'legendary', status: 'active', location: { lat: 36.8065, lng: 10.1815 }, city: 'Tunis', createdAt: '2024-10-20T10:00:00Z' },
    { id: 'p2', name: 'Treasure Chest', type: 'treasure', points: 300, rarity: 'epic', status: 'active', location: { lat: 35.8256, lng: 10.6346 }, city: 'Sousse', createdAt: '2024-10-21T11:00:00Z' },
    { id: 'p3', name: 'Lucky Box', type: 'mystery_box', points: 150, rarity: 'rare', status: 'claimed', location: { lat: 34.7406, lng: 10.7603 }, city: 'Sfax', createdAt: '2024-10-19T09:30:00Z' },
    { id: 'p4', name: 'Bonus Points', type: 'bonus', points: 100, rarity: 'common', status: 'active', location: { lat: 37.2744, lng: 9.8739 }, city: 'Bizerte', createdAt: '2024-10-22T14:00:00Z' },
  ],
  
  rewards: [
    { id: 'r1', name: 'Café Gratuit', description: 'Un café offert chez Coffee Shop', pointsCost: 200, category: 'food', stock: 50, status: 'active', imageUrl: 'https://via.placeholder.com/150', createdAt: '2024-10-15T10:00:00Z' },
    { id: 'r2', name: 'Pizza Margherita', description: 'Pizza Margherita chez Pizza Palace', pointsCost: 800, category: 'food', stock: 20, status: 'active', imageUrl: 'https://via.placeholder.com/150', createdAt: '2024-10-16T11:00:00Z' },
    { id: 'r3', name: 'Cinéma 2 Places', description: '2 places de cinéma', pointsCost: 1500, category: 'entertainment', stock: 10, status: 'active', imageUrl: 'https://via.placeholder.com/150', featured: true, createdAt: '2024-10-17T12:00:00Z' },
    { id: 'r4', name: 'Bon d\'achat 50 DT', description: 'Bon d\'achat valable dans tous les magasins', pointsCost: 5000, category: 'shopping', stock: 5, status: 'active', imageUrl: 'https://via.placeholder.com/150', featured: true, createdAt: '2024-10-18T13:00:00Z' },
    { id: 'r5', name: 'Massage Relaxant', description: 'Séance de massage 1h', pointsCost: 3000, category: 'wellness', stock: 8, status: 'active', imageUrl: 'https://via.placeholder.com/150', createdAt: '2024-10-19T14:00:00Z' },
  ],
  
  captures: [
    { id: 'c1', userId: '1', prizeId: 'p1', status: 'pending', location: { lat: 36.8065, lng: 10.1815 }, confidenceScore: 0.95, timestamp: '2024-10-22T10:30:00Z', imageUrl: 'https://via.placeholder.com/200' },
    { id: 'c2', userId: '2', prizeId: 'p2', status: 'validated', location: { lat: 35.8256, lng: 10.6346 }, confidenceScore: 0.88, timestamp: '2024-10-22T11:00:00Z', imageUrl: 'https://via.placeholder.com/200' },
    { id: 'c3', userId: '3', prizeId: 'p3', status: 'rejected', location: { lat: 34.7406, lng: 10.7603 }, confidenceScore: 0.45, timestamp: '2024-10-22T09:15:00Z', imageUrl: 'https://via.placeholder.com/200', rejectionReason: 'GPS spoofing détecté' },
    { id: 'c4', userId: '4', prizeId: 'p4', status: 'pending', location: { lat: 37.2744, lng: 9.8739 }, confidenceScore: 0.92, timestamp: '2024-10-22T12:45:00Z', imageUrl: 'https://via.placeholder.com/200' },
  ],
  
  reports: [
    { id: 'rep1', captureId: 'c1', userId: '5', reason: 'suspicious_location', description: 'La localisation semble incorrecte', status: 'pending', createdAt: '2024-10-22T11:00:00Z' },
    { id: 'rep2', captureId: 'c2', userId: '1', reason: 'fake_image', description: 'L\'image ne correspond pas au prix', status: 'resolved', resolvedAt: '2024-10-22T12:00:00Z', resolution: 'Vérification effectuée - capture valide', createdAt: '2024-10-22T10:30:00Z' },
  ],
  
  redemptions: [
    { id: 'red1', userId: '1', rewardId: 'r1', status: 'completed', pointsSpent: 200, redeemedAt: '2024-10-20T14:00:00Z' },
    { id: 'red2', userId: '2', rewardId: 'r2', status: 'completed', pointsSpent: 800, redeemedAt: '2024-10-21T15:30:00Z' },
    { id: 'red3', userId: '3', rewardId: 'r3', status: 'pending', pointsSpent: 1500, redeemedAt: '2024-10-22T10:00:00Z' },
    { id: 'red4', userId: '5', rewardId: 'r4', status: 'completed', pointsSpent: 5000, redeemedAt: '2024-10-19T16:00:00Z' },
  ],
  
  categories: [
    { id: 'cat1', name: 'Nourriture', slug: 'food', rewardCount: 15, description: 'Restaurants, cafés, fast-food' },
    { id: 'cat2', name: 'Divertissement', slug: 'entertainment', rewardCount: 8, description: 'Cinéma, concerts, événements' },
    { id: 'cat3', name: 'Shopping', slug: 'shopping', rewardCount: 12, description: 'Bons d\'achat, vêtements, accessoires' },
    { id: 'cat4', name: 'Bien-être', slug: 'wellness', rewardCount: 6, description: 'Spa, massage, fitness' },
    { id: 'cat5', name: 'Technologie', slug: 'tech', rewardCount: 4, description: 'Gadgets, accessoires tech' },
  ],
};

// Statistiques mockées
const mockStats = {
  captures: {
    total: 1250,
    validated: 890,
    rejected: 180,
    pending: 180,
    validationRate: 71.2,
    avgConfidenceScore: 0.85,
    avgProcessingTime: 2.5,
    antiCheat: {
      gpsSpoofing: 45,
      abnormalSpeed: 23,
      suspiciousPatterns: 12,
    }
  },
  users: {
    total: 5420,
    active: 4890,
    suspended: 320,
    banned: 210,
    newToday: 45,
    newThisWeek: 312,
  },
  prizes: {
    total: 850,
    active: 620,
    claimed: 230,
    claimRate: 27.1,
  },
  rewards: {
    total: 45,
    active: 38,
    outOfStock: 7,
  },
  redemptions: {
    total: 2340,
    completed: 2100,
    pending: 180,
    cancelled: 60,
    totalPointsSpent: 1250000,
  }
};

// Simuler un délai réseau
const delay = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));

// Mock API Service
const mockApiService = {
  // Auth
  async login(email, password) {
    await delay();
    // Superadmin (full control)
    if (email === 'superadmin@yallacatch.tn' && password === 'superadmin123') {
      return {
        success: true,
        user: { id: 'superadmin_1', email, role: 'super_admin', name: 'Super Administrateur', permissions: ['*'] },
        token: 'mock-jwt-token-' + Date.now()
      };
    }

    // Regular admin
    if (email === 'admin@yallacatch.tn' && password === 'admin123') {
      return {
        success: true,
        user: { id: 'admin1', email, role: 'admin', name: 'Admin YallaCatch', permissions: ['users', 'prizes', 'rewards', 'analytics'] },
        token: 'mock-jwt-token-' + Date.now()
      };
    }

    // Demo account
    if (email === 'demo@yallacatch.tn' && password === 'demo123') {
      return {
        success: true,
        user: { id: 'demo1', email, role: 'admin', name: 'Compte Démo', permissions: ['users', 'prizes', 'rewards', 'analytics'] },
        token: 'mock-jwt-token-' + Date.now()
      };
    }

    throw new Error('Identifiants incorrects');
  },

  // Users
  async getUsers(params = {}) {
    await delay();
    let users = [...mockData.users];
    
    if (params.status && params.status !== 'all') {
      users = users.filter(u => u.status === params.status);
    }
    
    if (params.search) {
      users = users.filter(u => 
        u.username.toLowerCase().includes(params.search.toLowerCase()) ||
        u.email.toLowerCase().includes(params.search.toLowerCase())
      );
    }
    
    return {
      users,
      total: users.length,
      page: params.page || 1,
      limit: params.limit || 20,
      hasMore: false
    };
  },

  async getUserAnalytics(params) {
    await delay();
    return { stats: mockStats.users };
  },

  // Prizes
  async getPrizes(params = {}) {
    await delay();
    let prizes = [...mockData.prizes];
    
    if (params.status && params.status !== 'all') {
      prizes = prizes.filter(p => p.status === params.status);
    }
    
    return {
      prizes,
      total: prizes.length,
      page: params.page || 1,
      limit: params.limit || 20,
      hasMore: false
    };
  },

  async getPrizeAnalytics(params) {
    await delay();
    return { stats: mockStats.prizes };
  },

  // Rewards
  async getRewards(params = {}) {
    await delay();
    let rewards = [...mockData.rewards];
    
    if (params.category && params.category !== 'all') {
      rewards = rewards.filter(r => r.category === params.category);
    }
    
    return {
      rewards,
      total: rewards.length,
      page: params.page || 1,
      limit: params.limit || 20,
      hasMore: false
    };
  },

  async getRewardAnalytics(params) {
    await delay();
    return { stats: mockStats.rewards };
  },

  // Captures
  async getCaptures(params = {}) {
    await delay();
    let captures = [...mockData.captures];
    
    if (params.status && params.status !== 'all') {
      captures = captures.filter(c => c.status === params.status);
    }
    
    return {
      captures,
      total: captures.length,
      page: params.page || 1,
      limit: params.limit || 20,
      hasMore: false
    };
  },

  async validateCapture(captureId, action) {
    await delay();
    const capture = mockData.captures.find(c => c.id === captureId);
    if (capture) {
      capture.status = action === 'validate' ? 'validated' : 'rejected';
    }
    return { success: true, capture };
  },

  // ✨ NOUVELLES APIs - Capture Stats
  async getCaptureStats(params = {}) {
    await delay();
    return { stats: mockStats.captures };
  },

  // ✨ NOUVELLES APIs - Capture Reports
  async getCaptureReports(params = {}) {
    await delay();
    let reports = [...mockData.reports];
    
    if (params.status && params.status !== 'all') {
      reports = reports.filter(r => r.status === params.status);
    }
    
    return {
      reports,
      total: reports.length,
      page: params.page || 1,
      limit: params.limit || 20,
      hasMore: false
    };
  },

  async handleCaptureReport(reportId, action, notes) {
    await delay();
    const report = mockData.reports.find(r => r.id === reportId);
    if (report) {
      report.status = action === 'resolve' ? 'resolved' : 'rejected';
      report.resolution = notes;
      report.resolvedAt = new Date().toISOString();
    }
    return { success: true, report };
  },

  // ✨ NOUVELLES APIs - Marketplace Categories
  async getMarketplaceCategories() {
    await delay();
    return {
      categories: mockData.categories,
      total: mockData.categories.length
    };
  },

  // ✨ NOUVELLES APIs - Featured Rewards
  async getFeaturedRewards() {
    await delay();
    const featured = mockData.rewards.filter(r => r.featured);
    return {
      rewards: featured,
      total: featured.length
    };
  },

  // ✨ NOUVELLES APIs - Marketplace History
  async getMarketplaceHistory(params = {}) {
    await delay();
    const history = mockData.redemptions.map(red => {
      const user = mockData.users.find(u => u.id === red.userId);
      const reward = mockData.rewards.find(r => r.id === red.rewardId);
      return {
        ...red,
        user: { id: user?.id, username: user?.username },
        reward: { id: reward?.id, name: reward?.name }
      };
    });
    
    return {
      history,
      total: history.length,
      page: params.page || 1,
      limit: params.limit || 20,
      hasMore: false
    };
  },

  // Analytics
  async getAnalyticsOverview(params) {
    await delay();
    return {
      stats: {
        users: mockStats.users,
        prizes: mockStats.prizes,
        rewards: mockStats.rewards,
        captures: mockStats.captures,
        redemptions: mockStats.redemptions,
      }
    };
  },

  async getChartData(params) {
    await delay();
    // Générer des données de graphique pour les 7 derniers jours
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    return {
      data: days.map((day, i) => ({
        name: day,
        users: Math.floor(Math.random() * 100) + 50,
        captures: Math.floor(Math.random() * 80) + 30,
        redemptions: Math.floor(Math.random() * 60) + 20,
      }))
    };
  },

  // Dashboard
  async getDashboardStats() {
    await delay();
    return {
      stats: {
        totalUsers: mockStats.users.total,
        activeUsers: mockStats.users.active,
        totalPrizes: mockStats.prizes.total,
        activePrizes: mockStats.prizes.active,
        totalCaptures: mockStats.captures.total,
        pendingCaptures: mockStats.captures.pending,
        totalRewards: mockStats.rewards.total,
        totalRedemptions: mockStats.redemptions.total,
      }
    };
  },
};

export default mockApiService;

