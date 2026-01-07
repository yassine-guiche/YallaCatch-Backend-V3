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
  extraRoutes,
  antiCheatRoutes,
  powerUpRoutes,
  abTestingRoutes,
  gameControlRoutes,
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

  // User Management
  await fastify.register(usersRoutes);

  // Prize Management
  await fastify.register(prizesRoutes);

  // Rewards Management
  await fastify.register(rewardsRoutes);

  // Claims/Captures Management
  await fastify.register(claimsRoutes);

  // Power-Ups Management (NEW)
  await fastify.register(powerUpRoutes, { prefix: '/power-ups' });

  // Notifications
  await fastify.register(notificationsRoutes);

  // Settings
  await fastify.register(settingsRoutes);

  // Anti-Cheat Monitoring (NEW)
  await fastify.register(antiCheatRoutes, { prefix: '/anti-cheat' });

  // System
  await fastify.register(systemRoutes);

  // Analytics
  await fastify.register(analyticsRoutes);

  // Distribution
  await fastify.register(distributionRoutes);

  // Partners
  await fastify.register(partnersRoutes);

  // A/B Testing (NEW)
  await fastify.register(abTestingRoutes);

  // Game Control (Admin game monitoring and management)
  await fastify.register(gameControlRoutes, { prefix: '/game-control' });

  // Extra routes (achievements, marketplace, reports, sessions, etc.)
  await fastify.register(extraRoutes);
}
