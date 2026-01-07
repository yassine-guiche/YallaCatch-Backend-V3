import { FastifyInstance } from 'fastify';
import arModule from './index';

export default async function arRoutes(fastify: FastifyInstance) {
  await fastify.register(arModule, { prefix: '/ar' });
}

