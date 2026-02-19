/**
 * YallaCatch! WebSocket Service
 * Service pour les mises à jour temps réel
 */

import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  /**
   * Connecter au serveur WebSocket
   */
  connect(token) {
    if (this.socket && this.connected) {
      console.log('WebSocket already connected');
      return;
    }

    console.log('Connecting to WebSocket...');

    this.socket = io(WS_URL, {
      auth: {
        token: token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.setupEventHandlers();
  }

  /**
   * Configurer les gestionnaires d'événements
   */
  setupEventHandlers() {
    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('connection_status', { connected: true });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
      this.connected = false;
      this.emit('connection_status', { connected: false, reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        this.emit('connection_error', { error: 'Max reconnection attempts reached' });
      }
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', { error });
    });

    const forwardedEvents = new Set([
      'connect',
      'disconnect',
      'connect_error',
      'error',
      'user_update',
      'user_banned',
      'user_unbanned',
      'user_deleted',
      'prize_update',
      'capture_created',
      'redemption_created',
      'stats_update',
      'notification',
      'alert',
      'marketplace_update',
      'marketplace_item_created',
      'marketplace_item_updated',
      'marketplace_item_deleted',
      'reward_update',
      'reward_created',
      'reward_deleted',
      'redemption_completed',
      'redemption_cancelled',
      'partner_update',
      'partner_created',
      'partner_deleted',
    ]);

    // Événements métier
    this.socket.on('user_update', (data) => {
      this.emit('user_update', data);
    });

    this.socket.on('prize_update', (data) => {
      this.emit('prize_update', data);
    });

    this.socket.on('capture_created', (data) => {
      this.emit('capture_created', data);
    });

    this.socket.on('redemption_created', (data) => {
      this.emit('redemption_created', data);
    });

    this.socket.on('stats_update', (data) => {
      this.emit('stats_update', data);
    });

    this.socket.on('notification', (data) => {
      this.emit('notification', data);
    });

    this.socket.on('alert', (data) => {
      this.emit('alert', data);
    });

    // Marketplace events
    this.socket.on('marketplace_update', (data) => {
      this.emit('marketplace_update', data);
    });

    this.socket.on('marketplace_item_created', (data) => {
      this.emit('marketplace_item_created', data);
      this.emit('marketplace_update', data);
    });

    this.socket.on('marketplace_item_updated', (data) => {
      this.emit('marketplace_item_updated', data);
      this.emit('marketplace_update', data);
    });

    this.socket.on('marketplace_item_deleted', (data) => {
      this.emit('marketplace_item_deleted', data);
      this.emit('marketplace_update', data);
    });

    // Reward events
    this.socket.on('reward_update', (data) => {
      this.emit('reward_update', data);
    });

    this.socket.on('reward_created', (data) => {
      this.emit('reward_created', data);
      this.emit('reward_update', data);
    });

    this.socket.on('reward_deleted', (data) => {
      this.emit('reward_deleted', data);
      this.emit('reward_update', data);
    });

    // Redemption events
    this.socket.on('redemption_completed', (data) => {
      this.emit('redemption_completed', data);
    });

    this.socket.on('redemption_cancelled', (data) => {
      this.emit('redemption_cancelled', data);
    });

    // Partner events
    this.socket.on('partner_update', (data) => {
      this.emit('partner_update', data);
    });

    this.socket.on('partner_created', (data) => {
      this.emit('partner_created', data);
      this.emit('partner_update', data);
    });

    this.socket.on('partner_deleted', (data) => {
      this.emit('partner_deleted', data);
      this.emit('partner_update', data);
    });

    // User ban events
    this.socket.on('user_banned', (data) => {
      this.emit('user_banned', data);
      this.emit('user_update', data);
    });

    this.socket.on('user_unbanned', (data) => {
      this.emit('user_unbanned', data);
      this.emit('user_update', data);
    });

    this.socket.on('user_deleted', (data) => {
      this.emit('user_deleted', data);
      this.emit('user_update', data);
    });

    this.socket.onAny((event, data) => {
      if (forwardedEvents.has(event)) return;
      this.emit(event, data);
    });
  }

  /**
   * Déconnecter du serveur WebSocket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.listeners.clear();
      console.log('WebSocket disconnected');
    }
  }

  /**
   * Envoyer un message au serveur
   */
  send(event, data) {
    if (this.socket && this.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }

  /**
   * S'abonner à un événement
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    // Retourner une fonction pour se désabonner
    return () => this.off(event, callback);
  }

  /**
   * Se désabonner d'un événement
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Émettre un événement local
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data, event);
        } catch (error) {
          console.error(`Error in WebSocket listener for ${event}:`, error);
        }
      });
    }
    if (event !== '*') {
      const wildcard = this.listeners.get('*');
      if (wildcard) {
        wildcard.forEach(callback => {
          try {
            callback(data, event);
          } catch (error) {
            console.error(`Error in WebSocket wildcard listener for ${event}:`, error);
          }
        });
      }
    }
  }

  /**
   * Vérifier si connecté
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Rejoindre une room
   */
  joinRoom(room) {
    this.send('join_room', { room });
  }

  /**
   * Quitter une room
   */
  leaveRoom(room) {
    if (this.connected) {
      this.send('leave_room', { room });
    }
  }

  /**
   * S'abonner aux mises à jour du dashboard
   */
  subscribeToDashboard() {
    this.joinRoom('dashboard');
  }

  /**
   * Se désabonner des mises à jour du dashboard
   */
  unsubscribeFromDashboard() {
    this.leaveRoom('dashboard');
  }

  /**
   * S'abonner aux mises à jour d'un utilisateur
   */
  subscribeToUser(userId) {
    this.joinRoom(`user:${userId}`);
  }

  /**
   * Se désabonner des mises à jour d'un utilisateur
   */
  unsubscribeFromUser(userId) {
    this.leaveRoom(`user:${userId}`);
  }

  /**
   * S'abonner aux mises à jour d'un prix
   */
  subscribeToPrize(prizeId) {
    this.joinRoom(`prize:${prizeId}`);
  }

  /**
   * Se désabonner des mises à jour d'un prix
   */
  unsubscribeFromPrize(prizeId) {
    this.leaveRoom(`prize:${prizeId}`);
  }
}

// Instance singleton
const wsService = new WebSocketService();

export default wsService;
