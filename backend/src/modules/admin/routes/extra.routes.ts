import { FastifyInstance } from 'fastify';
import antiCheatRoutes from './anti-cheat.routes.js';
import powerUpRoutes from './power-ups.routes.js';
import abTestingRoutes from './ab-testing.routes.js';
import gameControlRoutes from './game-control.routes.js';
import admobRoutes from './admob.routes.js';
import configRoutes from './config.routes.js';
import achievementsRoutes from './achievements.routes.js';
import marketplaceRoutes from './marketplace.routes.js';
import reportsRoutes from './reports.routes.js';
import sessionsRoutes from './sessions.routes.js';
import friendshipsRoutes from './friendships.routes.js';
import codesRoutes from './codes.routes.js';
import offlineQueueRoutes from './offline-queue.routes.js';
import deviceTokensRoutes from './device-tokens.routes.js';
import redemptionsRoutes from './redemptions.routes.js';
import activityLogsRoutes from './activity-logs.routes.js';
import arSessionsRoutes from './ar-sessions.routes.js';

export default async function extraRoutes(fastify: FastifyInstance) {
    await fastify.register(antiCheatRoutes);
    await fastify.register(powerUpRoutes);
    await fastify.register(abTestingRoutes);
    await fastify.register(gameControlRoutes);
    await fastify.register(admobRoutes);
    await fastify.register(configRoutes);
    await fastify.register(achievementsRoutes);
    await fastify.register(marketplaceRoutes);
    await fastify.register(reportsRoutes);
    await fastify.register(sessionsRoutes);
    await fastify.register(friendshipsRoutes);
    await fastify.register(codesRoutes);
    await fastify.register(offlineQueueRoutes);
    await fastify.register(deviceTokensRoutes);
    await fastify.register(redemptionsRoutes);
    await fastify.register(activityLogsRoutes);
    await fastify.register(arSessionsRoutes);
}
