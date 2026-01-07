import { FastifyInstance } from 'fastify';
import rewardsModule from './index';

export default async function rewardsRoutes(fastify: FastifyInstance) {
  await fastify.register(rewardsModule);
}
