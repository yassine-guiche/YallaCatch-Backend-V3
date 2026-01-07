import { FastifyInstance } from 'fastify';
import prizesModule from './index';

export default async function prizesRoutes(fastify: FastifyInstance) {
  await fastify.register(prizesModule);
}
