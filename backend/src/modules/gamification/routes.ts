import { FastifyInstance } from 'fastify';
import gamificationModule from './index';

export default async function gamificationRoutes(fastify: FastifyInstance) {
  await fastify.register(gamificationModule);
}
