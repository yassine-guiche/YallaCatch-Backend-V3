import { FastifyInstance } from 'fastify';
import adminModule from './index.js';

export default async function adminRoutes(fastify: FastifyInstance) {
  // Register consolidated admin module (includes all admin, analytics, partners, and distribution routes)
  await fastify.register(adminModule);
}

