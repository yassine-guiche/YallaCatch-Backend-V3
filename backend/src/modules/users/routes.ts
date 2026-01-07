import { FastifyInstance } from 'fastify';
import usersModule from './index';

export default async function usersRoutes(fastify: FastifyInstance) {
  await fastify.register(usersModule);
}
