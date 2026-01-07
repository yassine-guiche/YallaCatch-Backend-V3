import { FastifyInstance } from 'fastify';
import gameModule from './index';

export default async function gameRoutes(fastify: FastifyInstance) {
  await fastify.register(gameModule);
}
