/**
 * YallaCatch! Authentication Context
 * Gère l'authentification avec le backend Node.js
 */

import { createContext, useContext, useState, useEffect } from 'react';
import apiService from '../services/api';
import wsService from '../services/websocket';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Vérifier si l'utilisateur est déjà connecté au chargement
  useEffect(() => {
    checkAuth();
  }, []);

  /**
   * Vérifier l'authentification
   */
  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('access_token');
      
      if (!token) {
        setLoading(false);
        return;
      }

      // Vérifier que le token est valide
      const userData = await apiService.getCurrentUser();
      const normalizedUser = withPermissions(userData.user);
      
      // Vérifier que l'utilisateur est admin
      const allowedRoles = ['admin', 'super_admin', 'moderator', 'partner'];
      if (!allowedRoles.includes(normalizedUser.role)) {
        throw new Error('Accès refusé : Vous devez être administrateur ou partenaire habilité');
      }

      setUser(normalizedUser);
      
      // Connecter au WebSocket
      if (import.meta.env.VITE_ENABLE_WEBSOCKET === 'true') {
        wsService.connect(token);
      }
      
      setError(null);
    } catch (err) {
      console.error('Auth check failed:', err);
      setError(err.message);
      setUser(null);
      apiService.clearToken();
    } finally {
      setLoading(false);
    }
  };

  /**
   * Connexion
   */
  // Login method: can be used for admin or partner
  const login = async (email, password, opts = {}) => {
    try {
      setLoading(true);
      setError(null);

      let response;
      // If opts.partner is true, use partner login endpoint
      if (opts.partner) {
        response = await apiService.partnerLogin(email, password);
      } else {
        response = await apiService.login(email, password);
      }
      const normalizedUser = withPermissions(response.user);

      // Role check: if partner login, must be partner
      if (opts.partner) {
        if (normalizedUser.role !== 'partner') {
          throw new Error('Accès refusé : Seuls les partenaires peuvent se connecter ici');
        }
      } else {
        // Admin login: allow admin, super_admin, moderator, partner
        const allowedRoles = ['admin', 'super_admin', 'moderator', 'partner'];
        if (!allowedRoles.includes(normalizedUser.role)) {
          throw new Error('Accès refusé : Vous devez être administrateur ou partenaire habilité');
        }
      }

      setUser(normalizedUser);

      // Connecter au WebSocket
      if (import.meta.env.VITE_ENABLE_WEBSOCKET === 'true') {
        wsService.connect(response.tokens.accessToken);
      }

      return response.user;
    } catch (err) {
      console.error('Login failed:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Déconnexion
   */
  const logout = async () => {
    try {
      setLoading(true);
      
      // Déconnecter du WebSocket
      wsService.disconnect();
      
      // Déconnecter de l'API
      await apiService.logout();
      
      setUser(null);
      setError(null);
    } catch (err) {
      console.error('Logout failed:', err);
      // Même en cas d'erreur, on déconnecte localement
      setUser(null);
      apiService.clearToken();
    } finally {
      setLoading(false);
    }
  };

  /**
   * Rafraîchir les données utilisateur
   */
  const refreshUser = async () => {
    try {
      const userData = await apiService.getCurrentUser();
      const normalizedUser = withPermissions(userData.user);
      setUser(normalizedUser);
      return normalizedUser;
    } catch (err) {
      console.error('Refresh user failed:', err);
      throw err;
    }
  };

  /**
   * Vérifier si l'utilisateur a une permission
   */
  const hasPermission = (permission) => {
    if (!user) return false;
    
    // Super admin a toutes les permissions
    if (user.role === 'super_admin') return true;
    
    // Vérifier les permissions spécifiques
    if (user.permissions && Array.isArray(user.permissions)) {
      return user.permissions.includes(permission);
    }
    
    return false;
  };

  /**
   * Vérifier si l'utilisateur est super admin
   */
  const isSuperAdmin = () => {
    return user && user.role === 'super_admin';
  };

  // Normalise l'utilisateur avec des permissions par défaut selon le rôle
  const withPermissions = (userObj) => {
    if (!userObj) return userObj;
    if (!userObj.permissions || !Array.isArray(userObj.permissions) || userObj.permissions.length === 0) {
      if (userObj.role === 'super_admin') {
        userObj.permissions = ['*'];
      } else if (userObj.role === 'admin') {
        userObj.permissions = [
          'users',
          'prizes',
          'rewards',
          'claims',
          'gamification',
          'marketplace',
          'partners',
          'partner_portal',
          'distribution',
          'moderation',
          'marketing',
          'analytics',
          'notifications',
          'system',
          'settings',
        ];
      } else if (userObj.role === 'moderator') {
        userObj.permissions = ['users', 'prizes', 'claims', 'moderation', 'analytics'];
      } else if (userObj.role === 'partner') {
        userObj.permissions = ['partner_portal'];
      } else {
        userObj.permissions = [];
      }
    }
    return userObj;
  };

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    checkAuth,
    refreshUser,
    hasPermission,
    isSuperAdmin,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
