/**
 * useRealtimeUpdates - WebSocket integration hook for all admin pages
 * Provides real-time data updates for different entities
 */

import { useEffect } from 'react';
import wsService from '../services/websocket';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook for real-time updates on any admin page
 * @param {Object} options - Configuration options
 * @param {Function} options.onUserUpdate - Callback for user updates
 * @param {Function} options.onPrizeUpdate - Callback for prize updates
 * @param {Function} options.onCaptureCreated - Callback for new captures
 * @param {Function} options.onCaptureUpdate - Callback for capture updates
 * @param {Function} options.onRewardUpdate - Callback for reward updates
 * @param {Function} options.onRedemptionCreated - Callback for new redemptions
 * @param {Function} options.onRedemptionFulfilled - Callback for fulfilled redemptions
 * @param {Function} options.onStatsUpdate - Callback for stats updates
 * @param {Function} options.onPartnerUpdate - Callback for partner updates
 * @param {Function} options.onMarketplaceUpdate - Callback for marketplace updates
 * @param {Function} options.onNotificationUpdate - Callback for notification updates
 * @param {Function} options.onAchievementUpdate - Callback for achievement updates
 * @param {Function} options.onPowerUpUpdate - Callback for power-up updates
 * @param {string[]} options.events - Raw event names to listen for
 * @param {Function} options.onMessage - Callback for custom events (eventName, payload)
 * @param {string[]} options.rooms - Additional rooms to join
 * @param {boolean} options.enabled - Enable/disable updates (default: true)
 */
export function useRealtimeUpdates(options = {}) {
  const { user } = useAuth();
  const {
    onUserUpdate,
    onPrizeUpdate,
    onCaptureCreated,
    onCaptureUpdate,
    onRewardUpdate,
    onRedemptionCreated,
    onRedemptionFulfilled,
    onStatsUpdate,
    onPartnerUpdate,
    onMarketplaceUpdate,
    onNotificationUpdate,
    onAchievementUpdate,
    onPowerUpUpdate,
    onFriendshipUpdate,
    onARSessionUpdate,
    onDistributionUpdate,
    events = [],
    onMessage,
    rooms = [],
    enabled = true,
  } = options;

  useEffect(() => {
    if (!enabled || !user || !wsService.isConnected()) return;

    const unsubscribers = [];
    const extraRooms = Array.isArray(rooms)
      ? rooms.filter((room) => {
        if (!room) return false;
        if (['admin', 'dashboard', 'marketplace', 'rewards', 'game'].includes(room)) return true;
        if (room.startsWith('user:')) return true;
        if (room.startsWith('partner:')) return true;
        if (room.startsWith('prize:')) return true;
        if (room.startsWith('game:')) return true;
        return false;
      })
      : [];

    // Join default admin room
    wsService.joinRoom('admin');

    // Join additional rooms
    extraRooms.forEach(room => wsService.joinRoom(room));

    // Register event listeners
    if (onUserUpdate) {
      unsubscribers.push(wsService.on('user_update', onUserUpdate));
      unsubscribers.push(wsService.on('user_created', onUserUpdate));
      unsubscribers.push(wsService.on('user_deleted', onUserUpdate));
      unsubscribers.push(wsService.on('user_banned', onUserUpdate));
      unsubscribers.push(wsService.on('user_unbanned', onUserUpdate));
    }

    if (onPrizeUpdate) {
      unsubscribers.push(wsService.on('prize_update', onPrizeUpdate));
      unsubscribers.push(wsService.on('prize_created', onPrizeUpdate));
      unsubscribers.push(wsService.on('prize_deleted', onPrizeUpdate));
      unsubscribers.push(wsService.on('prize_captured', onPrizeUpdate));
    }

    if (onCaptureCreated) {
      unsubscribers.push(wsService.on('capture_created', onCaptureCreated));
      unsubscribers.push(wsService.on('capture_completed', onCaptureCreated));
    }

    if (onCaptureUpdate) {
      unsubscribers.push(wsService.on('capture_update', onCaptureUpdate));
      unsubscribers.push(wsService.on('capture_completed', onCaptureUpdate));
    }

    if (onRewardUpdate) {
      unsubscribers.push(wsService.on('reward_update', onRewardUpdate));
      unsubscribers.push(wsService.on('reward_created', onRewardUpdate));
      unsubscribers.push(wsService.on('reward_deleted', onRewardUpdate));
    }

    if (onRedemptionCreated) {
      unsubscribers.push(wsService.on('redemption_created', onRedemptionCreated));
      unsubscribers.push(wsService.on('redemption_completed', onRedemptionCreated));
      unsubscribers.push(wsService.on('redemption_cancelled', onRedemptionCreated));
    }

    if (onRedemptionFulfilled) {
      unsubscribers.push(wsService.on('redemption_fulfilled', onRedemptionFulfilled));
    }

    if (onStatsUpdate) {
      unsubscribers.push(wsService.on('stats_update', onStatsUpdate));
    }

    if (onPartnerUpdate) {
      unsubscribers.push(wsService.on('partner_update', onPartnerUpdate));
      unsubscribers.push(wsService.on('partner_created', onPartnerUpdate));
      unsubscribers.push(wsService.on('partner_deleted', onPartnerUpdate));
    }

    if (onMarketplaceUpdate) {
      unsubscribers.push(wsService.on('marketplace_update', onMarketplaceUpdate));
      unsubscribers.push(wsService.on('marketplace_item_created', onMarketplaceUpdate));
      unsubscribers.push(wsService.on('marketplace_item_updated', onMarketplaceUpdate));
      unsubscribers.push(wsService.on('marketplace_item_deleted', onMarketplaceUpdate));
    }

    if (onNotificationUpdate) {
      unsubscribers.push(wsService.on('notification_sent', onNotificationUpdate));
      unsubscribers.push(wsService.on('notification_update', onNotificationUpdate));
    }

    if (onAchievementUpdate) {
      unsubscribers.push(wsService.on('achievement_unlocked', onAchievementUpdate));
      unsubscribers.push(wsService.on('achievement_update', onAchievementUpdate));
    }

    if (onPowerUpUpdate) {
      unsubscribers.push(wsService.on('powerup_used', onPowerUpUpdate));
      unsubscribers.push(wsService.on('powerup_expired', onPowerUpUpdate));
      unsubscribers.push(wsService.on('powerup_update', onPowerUpUpdate));
    }

    if (onFriendshipUpdate) {
      unsubscribers.push(wsService.on('friendship_created', onFriendshipUpdate));
      unsubscribers.push(wsService.on('friendship_accepted', onFriendshipUpdate));
      unsubscribers.push(wsService.on('friendship_declined', onFriendshipUpdate));
      unsubscribers.push(wsService.on('friendship_removed', onFriendshipUpdate));
    }

    if (onARSessionUpdate) {
      unsubscribers.push(wsService.on('ar_session_started', onARSessionUpdate));
      unsubscribers.push(wsService.on('ar_session_ended', onARSessionUpdate));
      unsubscribers.push(wsService.on('ar_capture', onARSessionUpdate));
    }

    if (onDistributionUpdate) {
      unsubscribers.push(wsService.on('distribution_started', onDistributionUpdate));
      unsubscribers.push(wsService.on('distribution_completed', onDistributionUpdate));
      unsubscribers.push(wsService.on('distribution_paused', onDistributionUpdate));
      unsubscribers.push(wsService.on('distribution_resumed', onDistributionUpdate));
    }

    if (onMessage && Array.isArray(events) && events.length) {
      events.forEach((eventName) => {
        if (!eventName) return;
        const handler = (data, event) => {
          onMessage(eventName === '*' ? (event || eventName) : eventName, data);
        };
        unsubscribers.push(wsService.on(eventName, handler));
      });
    }

    // Cleanup
    return () => {
      unsubscribers.forEach(unsub => unsub());
      wsService.leaveRoom('admin');
      extraRooms.forEach(room => wsService.leaveRoom(room));
    };
  }, [
    enabled,
    user,
    // Only depend on actual callback functions, not all options
    onUserUpdate,
    onPrizeUpdate,
    onCaptureCreated,
    onCaptureUpdate,
    onRewardUpdate,
    onRedemptionCreated,
    onRedemptionFulfilled,
    onStatsUpdate,
    onPartnerUpdate,
    onMarketplaceUpdate,
    onNotificationUpdate,
    onAchievementUpdate,
    onPowerUpUpdate,
    onFriendshipUpdate,
    onARSessionUpdate,
    onDistributionUpdate,
    events,
    onMessage,
    rooms,
  ]);

  return {
    isConnected: wsService.isConnected(),
    send: wsService.send.bind(wsService),
    joinRoom: wsService.joinRoom.bind(wsService),
    leaveRoom: wsService.leaveRoom.bind(wsService),
  };
}

/**
 * Hook for dashboard real-time updates
 */
export function useDashboardUpdates(callbacks = {}) {
  return useRealtimeUpdates({
    ...callbacks,
    rooms: ['dashboard'],
  });
}

/**
 * Hook for user management real-time updates
 */
export function useUsersUpdates(callbacks = {}) {
  return useRealtimeUpdates({
    ...callbacks,
    rooms: [],
  });
}

/**
 * Hook for prize management real-time updates
 */
export function usePrizesUpdates(callbacks = {}) {
  return useRealtimeUpdates({
    ...callbacks,
    rooms: [],
  });
}

/**
 * Hook for rewards management real-time updates
 */
export function useRewardsUpdates(callbacks = {}) {
  return useRealtimeUpdates({
    ...callbacks,
    rooms: ['rewards', 'marketplace'],
  });
}

/**
 * Hook for partners management real-time updates
 */
export function usePartnersUpdates(callbacks = {}) {
  return useRealtimeUpdates({
    ...callbacks,
    rooms: [],
  });
}

/**
 * Hook for partner-specific real-time updates
 * @param {string} partnerId - The partner's unique ID
 * @param {Object} callbacks - Callback functions
 */
export function usePartnerUpdates(partnerId, callbacks = {}) {
  const rooms = partnerId ? [`partner:${partnerId}`] : [];
  return useRealtimeUpdates({
    ...callbacks,
    rooms,
  });
}
