import { FastifyInstance } from 'fastify';
import authModule from './index';

export default async function authRoutes(fastify: FastifyInstance) {
  await fastify.register(authModule);
}
