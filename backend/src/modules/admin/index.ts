/**
 * Refactored Admin Module
 * 
 * This module provides a clean, modular architecture for admin functionality.
 * Routes are split into focused sub-modules for better maintainability.
 */

import { FastifyInstance } from 'fastify';

// Import route modules
import {
  dashboardRoutes,
  usersRoutes,
  prizesRoutes,
  rewardsRoutes,
  claimsRoutes,
  notificationsRoutes,
  settingsRoutes,
  systemRoutes,
  analyticsRoutes,
  distributionRoutes,
  partnersRoutes,

  antiCheatRoutes,
  powerUpRoutes,
  abTestingRoutes,
  gameControlRoutes,
  admobRoutes,
  configRoutes,
  achievementsRoutes,
  marketplaceRoutes,
  reportsRoutes,
  sessionsRoutes,
  friendshipsRoutes,
  codesRoutes,
  offlineQueueRoutes,
  deviceTokensRoutes,
  redemptionsRoutes,
  activityLogsRoutes,
  arSessionsRoutes
} from './routes/index.js';

// Re-export services for external use
export * from './services';

/**
 * Main admin routes registration
 * All routes are prefixed with /api/v1/admin by the parent router
 */
export default async function adminModule(fastify: FastifyInstance) {
  // Dashboard & Core
  await fastify.register(dashboardRoutes);

  // AdMob Management
  await fastify.register(admobRoutes, { prefix: '/admob' });

  // Config Management
  await fastify.register(configRoutes, { prefix: '/config' });

  // User Management
  await fastify.register(usersRoutes);

  // Prize Management
  await fastify.register(prizesRoutes);

  // Rewards Management
  await fastify.register(rewardsRoutes);

  // Claims/Captures Management
  await fastify.register(claimsRoutes);

  // Power-Ups Management
  await fastify.register(powerUpRoutes, { prefix: '/power-ups' });

  // Notifications
  await fastify.register(notificationsRoutes);

  // Settings
  await fastify.register(settingsRoutes);

  // Anti-Cheat Monitoring
  await fastify.register(antiCheatRoutes, { prefix: '/anti-cheat' });

  // System
  await fastify.register(systemRoutes);

  // Analytics
  await fastify.register(analyticsRoutes);

  // Distribution
  await fastify.register(distributionRoutes);

  // Partners
  await fastify.register(partnersRoutes);

  // A/B Testing
  await fastify.register(abTestingRoutes);

  // Game Control
  await fastify.register(gameControlRoutes, { prefix: '/game-control' });

  // --- REFACTORED EXTRA ROUTES ---

  // Achievements
  await fastify.register(achievementsRoutes, { prefix: '/achievements' });

  // Marketplace
  await fastify.register(marketplaceRoutes, { prefix: '/marketplace' });

  // Reports
  await fastify.register(reportsRoutes, { prefix: '/reports' });

  // Sessions
  await fastify.register(sessionsRoutes, { prefix: '/sessions' });

  // Friendships
  await fastify.register(friendshipsRoutes, { prefix: '/friendships' });

  // Promo Codes
  await fastify.register(codesRoutes, { prefix: '/codes' });

  // Offline Queue
  await fastify.register(offlineQueueRoutes, { prefix: '/offline-queue' });

  // Device Tokens
  await fastify.register(deviceTokensRoutes, { prefix: '/device-tokens' });

  // Redemptions
  await fastify.register(redemptionsRoutes, { prefix: '/redemptions' });

  // Activity Logs
  await fastify.register(activityLogsRoutes, { prefix: '/activity-logs' });

  // AR Sessions
  await fastify.register(arSessionsRoutes, { prefix: '/ar-sessions' });
}
