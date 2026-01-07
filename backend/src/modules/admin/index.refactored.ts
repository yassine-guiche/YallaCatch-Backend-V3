/**
 * Refactored Admin Module
 * 
 * This module provides a clean, modular architecture for admin functionality.
 * Routes are split into focused sub-modules for better maintainability.
 */

import { FastifyInstance } from 'fastify';

// Import route modules
import dashboardRoutes from './routes/dashboard.routes.js';
import usersRoutes from './routes/users.routes.js';
import prizesRoutes from './routes/prizes.routes.js';
import rewardsRoutes from './routes/rewards.routes.js';
import claimsRoutes from './routes/claims.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import systemRoutes from './routes/system.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import distributionRoutes from './routes/distribution.routes.js';
import partnersRoutes from './routes/partners.routes.js';
import extraRoutes from './routes/extra.routes.js';

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

  // Notifications
  await fastify.register(notificationsRoutes);

  // Settings
  await fastify.register(settingsRoutes);

  // System
  await fastify.register(systemRoutes);

  // Analytics
  await fastify.register(analyticsRoutes);

  // Distribution
  await fastify.register(distributionRoutes);

  // Partners
  await fastify.register(partnersRoutes);

  // Extra routes (achievements, marketplace, reports, sessions, etc.)
  await fastify.register(extraRoutes);
}
