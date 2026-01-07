import { FastifyInstance } from 'fastify';
import notificationsModule from './index';
import pushNotificationRoutes from './push';

export default async function notificationsRoutes(fastify: FastifyInstance) {
  await fastify.register(notificationsModule);
  await fastify.register(pushNotificationRoutes);
}
