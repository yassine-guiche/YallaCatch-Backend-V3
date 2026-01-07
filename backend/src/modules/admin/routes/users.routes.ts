import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { AdminUsersService } from '../services/admin-users.service';
import { AuditLog } from '@/models/AuditLog';
import { z } from 'zod';

const UserManagementSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['active', 'banned', 'suspended', 'inactive', 'all']).default('all'),
  level: z.coerce.number().int().positive().optional(),
});

const BanUserSchema = z.object({
  reason: z.string().min(1).max(500),
  duration: z.number().int().positive().optional(),
  notifyUser: z.boolean().optional().default(true),
});

const UpdateUserSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  email: z.string().email().optional(),
  level: z.enum(['bronze', 'silver', 'gold', 'platinum', 'diamond']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

const AdjustPointsSchema = z.object({
  amount: z.number().int(),
  reason: z.string().min(1).max(500),
});

export default async function usersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireAdmin);
  fastify.addHook('preHandler', adminRateLimit);

  fastify.get('/users', async (request: FastifyRequest, reply) => {
    const query = UserManagementSchema.parse(request.query);
    const result = await AdminUsersService.getUsers(query);
    return reply.send(result);
  });

  fastify.get('/users/:userId', async (request: FastifyRequest<{ Params: { userId: string } }>, reply) => {
    const { userId } = request.params;
    const user = await AdminUsersService.getUserProfile(userId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return reply.send({ user });
  });

  fastify.patch('/users/:userId', async (request: FastifyRequest<{ Params: { userId: string } }>, reply) => {
    const { userId } = request.params;
    const updates = UpdateUserSchema.parse(request.body);
    const adminId = (request as any).user?.id || (request as any).userId;
    const user = await AdminUsersService.updateUserProfile(userId, updates, adminId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return reply.send(user);
  });

  fastify.post('/users/:userId/ban', async (request: FastifyRequest<{ Params: { userId: string } }>, reply) => {
    const { userId } = request.params;
    const banData = BanUserSchema.parse(request.body) as any;
    const adminId = (request as any).user?.id || (request as any).userId;
    const result = await AdminUsersService.banUser(userId, banData, adminId);
    if (!result) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return reply.send({ success: true, message: 'User banned successfully' });
  });
  fastify.post('/users/:userId/unban', async (request: FastifyRequest<{ Params: { userId: string } }>, reply) => {
    const { userId } = request.params;
    const adminId = (request as any).user?.id || (request as any).userId;
    const result = await AdminUsersService.unbanUser(userId, adminId);
    if (!result) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return reply.send({ success: true, message: 'User unbanned successfully' });
  });

  fastify.post('/users/:userId/points', async (request: FastifyRequest<{ Params: { userId: string } }>, reply) => {
    const { userId } = request.params;
    const pointsData = AdjustPointsSchema.parse(request.body);
    const adminId = (request as any).user?.id || (request as any).userId;
    const result = await AdminUsersService.adjustPoints(userId, pointsData.amount, pointsData.reason, adminId);
    if (!result) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return reply.send(result);
  });

  fastify.delete('/users/:userId', async (request: FastifyRequest<{ Params: { userId: string } }>, reply) => {
    const { userId } = request.params;
    const adminId = (request as any).user?.id || (request as any).userId;
    const result = await AdminUsersService.deleteUser(userId, adminId);
    if (!result) {
      return reply.status(404).send({ error: 'User not found' });
    }
    return reply.status(204).send();
  });

  // GET /users/:userId/activity - Get activity logs for a specific user
  // Returns all audit entries where this user is either the actor (performed action) or the target (action performed on them)
  fastify.get('/users/:userId/activity', async (request: FastifyRequest<{
    Params: { userId: string };
    Querystring: { page?: string; limit?: string; type?: 'actor' | 'target' | 'all' };
  }>, reply) => {
    const { userId } = request.params;
    const { page = '1', limit = '50', type = 'all' } = request.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    try {
      // Build query based on type filter
      let query: any;
      if (type === 'actor') {
        // Only logs where user performed the action
        query = { userId };
      } else if (type === 'target') {
        // Only logs where user was affected by an action
        query = {
          $or: [
            { resourceId: userId },
            { resource: 'user', resourceId: userId },
            { 'metadata.userId': userId },
            { 'metadata.targetUserId': userId },
          ],
        };
      } else {
        // Both actor and target logs
        query = {
          $or: [
            { userId },
            { resourceId: userId },
            { resource: 'user', resourceId: userId },
            { 'metadata.userId': userId },
            { 'metadata.targetUserId': userId },
          ],
        };
      }

      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .select('userId userRole action resource resourceId description category severity metadata success timestamp createdAt')
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        AuditLog.countDocuments(query),
      ]);

      // Enhance logs with role indicator (actor vs target)
      const enhancedLogs = logs.map((log: any) => ({
        ...log,
        role: log.userId === userId ? 'actor' : 'target',
        displayAction: formatAction(log.action),
        displayResource: formatResource(log.resource),
      }));

      return reply.send({
        success: true,
        data: enhancedLogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
          hasMore: skip + logs.length < total,
        },
      });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch user activity logs' });
    }
  });
}

// Helper function to format action for display
function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Helper function to format resource for display
function formatResource(resource: string): string {
  return resource
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
