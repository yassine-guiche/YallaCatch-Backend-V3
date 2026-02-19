/**
 * Authentication Service
 * Handles admin authentication using Node.js backend
 */

import api from './api';

// Local storage keys
const TOKEN_KEY = 'admin_token';
const USER_KEY = 'admin_user';

/**
 * Login with email and password
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<{user: object, token: string}>}
 */
export async function loginWithEmail(email, password) {
  try {
    const response = await api.post('/auth/login', {
      email,
      password,
      role: 'admin', // Ensure we're logging in as admin
    });

    if (response.success && response.data) {
      const { user, token } = response.data;
      
      // Store token and user in localStorage
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      
      // Set token for future API calls
      api.setAuthToken(token);
      
      return { user, token };
    } else {
      throw new Error(response.error || 'Login failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    throw new Error(error.message || 'Authentication failed');
  }
}

/**
 * Logout current user
 */
export async function logout() {
  try {
    // Call backend logout endpoint
    await api.post('/auth/logout');
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Clear local storage
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    
    // Clear API token
    api.setAuthToken(null);
  }
}

/**
 * Get current user from localStorage
 * @returns {object|null}
 */
export function getCurrentUser() {
  try {
    const userJson = localStorage.getItem(USER_KEY);
    if (userJson) {
      return JSON.parse(userJson);
    }
  } catch (error) {
    console.error('Error getting current user:', error);
  }
  return null;
}

/**
 * Get current auth token
 * @returns {string|null}
 */
export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Check if user is authenticated
 * @returns {boolean}
 */
export function isAuthenticated() {
  const token = getAuthToken();
  const user = getCurrentUser();
  return !!(token && user);
}

/**
 * Refresh auth token
 * @returns {Promise<string>} New token
 */
export async function refreshToken() {
  try {
    const response = await api.post('/auth/refresh');
    
    if (response.success && response.data?.token) {
      const newToken = response.data.token;
      localStorage.setItem(TOKEN_KEY, newToken);
      api.setAuthToken(newToken);
      return newToken;
    } else {
      throw new Error('Token refresh failed');
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    // If refresh fails, logout user
    await logout();
    throw error;
  }
}

/**
 * Subscribe to auth state changes
 * @param {Function} callback 
 * @returns {Function} Unsubscribe function
 */
export function subscribeAuth(callback) {
  // Check auth state immediately
  const user = getCurrentUser();
  callback(user);
  
  // Set up a periodic check (every 30 seconds)
  const intervalId = setInterval(() => {
    const currentUser = getCurrentUser();
    callback(currentUser);
  }, 30000);
  
  // Return unsubscribe function
  return () => {
    clearInterval(intervalId);
  };
}

/**
 * Fetch admin profile
 * @param {string} userId 
 * @returns {Promise<object>}
 */
export async function fetchAdminProfile(userId) {
  try {
    const response = await api.get(`/users/${userId}`);
    
    if (response.success && response.data) {
      return response.data;
    } else {
      throw new Error('Failed to fetch admin profile');
    }
  } catch (error) {
    console.error('Error fetching admin profile:', error);
    throw error;
  }
}

/**
 * Update admin profile
 * @param {string} userId 
 * @param {object} updates 
 * @returns {Promise<object>}
 */
export async function updateAdminProfile(userId, updates) {
  try {
    const response = await api.patch(`/users/${userId}`, updates);
    
    if (response.success && response.data) {
      // Update stored user
      const currentUser = getCurrentUser();
      const updatedUser = { ...currentUser, ...response.data };
      localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
      
      return updatedUser;
    } else {
      throw new Error('Failed to update admin profile');
    }
  } catch (error) {
    console.error('Error updating admin profile:', error);
    throw error;
  }
}

/**
 * Change password
 * @param {string} currentPassword 
 * @param {string} newPassword 
 * @returns {Promise<void>}
 */
export async function changePassword(currentPassword, newPassword) {
  try {
    const response = await api.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    
    if (!response.success) {
      throw new Error(response.error || 'Failed to change password');
    }
  } catch (error) {
    console.error('Error changing password:', error);
    throw error;
  }
}

/**
 * Initialize auth on app startup
 */
export function initAuth() {
  const token = getAuthToken();
  if (token) {
    api.setAuthToken(token);
  }
}

// Initialize on module load
initAuth();

// Export for backward compatibility

