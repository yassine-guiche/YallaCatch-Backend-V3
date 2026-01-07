/**
 * useWebSocket Hook
 * React hook for WebSocket connections using Socket.IO
 * 
 * Uses the singleton websocket.js service which provides:
 * - Socket.IO connection management
 * - Room subscriptions (dashboard, user, prize)
 * - Event listeners
 * - Auto-reconnection
 */

import { useEffect, useState, useCallback } from 'react';
import wsService from '../services/websocket';

interface UseWebSocketOptions {
  autoConnect?: boolean;
}

export function useWebSocket(token: string, options: UseWebSocketOptions = {}) {
  const { autoConnect = true } = options;
  
  const [isConnected, setIsConnected] = useState(wsService.isConnected());

  useEffect(() => {
    if (!autoConnect || !token) return;

    // Connect if not already connected
    if (!wsService.isConnected()) {
      wsService.connect(token);
    }

    // Listen for connection status changes
    const unsubscribeStatus = wsService.on('connection_status', (data: { connected: boolean }) => {
      setIsConnected(data.connected);
    });

    const unsubscribeError = wsService.on('connection_error', () => {
      setIsConnected(false);
    });

    // Set initial state
    setIsConnected(wsService.isConnected());

    return () => {
      unsubscribeStatus();
      unsubscribeError();
      // Note: Don't disconnect here - it's a singleton shared across components
    };
  }, [autoConnect, token]);

  const subscribe = useCallback((room: string) => {
    wsService.joinRoom(room);
  }, []);

  const unsubscribe = useCallback((room: string) => {
    wsService.leaveRoom(room);
  }, []);

  const on = useCallback((event: string, callback: Function) => {
    return wsService.on(event, callback as (data: any) => void);
  }, []);

  const send = useCallback((event: string, data?: any) => {
    wsService.send(event, data);
  }, []);

  // Convenience methods for common subscriptions
  const subscribeToDashboard = useCallback(() => {
    wsService.subscribeToDashboard();
  }, []);

  const unsubscribeFromDashboard = useCallback(() => {
    wsService.unsubscribeFromDashboard();
  }, []);

  const subscribeToUser = useCallback((userId: string) => {
    wsService.subscribeToUser(userId);
  }, []);

  const unsubscribeFromUser = useCallback((userId: string) => {
    wsService.unsubscribeFromUser(userId);
  }, []);

  const subscribeToPrize = useCallback((prizeId: string) => {
    wsService.subscribeToPrize(prizeId);
  }, []);

  const unsubscribeFromPrize = useCallback((prizeId: string) => {
    wsService.unsubscribeFromPrize(prizeId);
  }, []);

  return {
    isConnected,
    subscribe,
    unsubscribe,
    on,
    send,
    subscribeToDashboard,
    unsubscribeFromDashboard,
    subscribeToUser,
    unsubscribeFromUser,
    subscribeToPrize,
    unsubscribeFromPrize,
    // Expose the raw service for advanced usage
    wsService,
  };
}
