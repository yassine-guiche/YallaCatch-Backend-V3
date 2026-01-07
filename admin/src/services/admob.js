import api from './api';

const admobService = {
  // Get AdMob analytics (Admin)
  getAnalytics: async (params = {}) => {
    const { startDate, endDate, groupBy = 'day' } = params;
    const queryParams = new URLSearchParams();
    
    if (startDate) queryParams.append('startDate', startDate);
    if (endDate) queryParams.append('endDate', endDate);
    queryParams.append('groupBy', groupBy);
    
    const response = await api.get(`/admob/analytics?${queryParams.toString()}`);
    return response.data;
  },

  // Get current AdMob configuration (Admin)
  getConfig: async () => {
    const response = await api.get('/admob/config');
    return response.data;
  },

  // Update AdMob configuration (Admin)
  updateConfig: async (config) => {
    const response = await api.patch('/admob/config', config);
    return response.data;
  },

  // Get user's ad availability (User)
  checkAvailability: async () => {
    const response = await api.get('/admob/available');
    return response.data;
  },

  // Record ad view and get reward (User)
  claimReward: async (adData) => {
    const response = await api.post('/admob/reward', adData);
    return response.data;
  },

  // Get user's ad stats (User)
  getUserStats: async () => {
    const response = await api.get('/admob/stats');
    return response.data;
  },
};

export default admobService;
