import { FastifyInstance } from 'fastify';
import claimsModule from './index';

export default async function claimsRoutes(fastify: FastifyInstance) {
  await fastify.register(claimsModule);
}
