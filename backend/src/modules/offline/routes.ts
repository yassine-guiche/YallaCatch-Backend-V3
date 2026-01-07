import { FastifyInstance } from 'fastify';
import offlineEnhancedRoutes from './index';

export default async function offlineRoutes(fastify: FastifyInstance) {
  await fastify.register(offlineEnhancedRoutes, { prefix: '/offline' });
}

