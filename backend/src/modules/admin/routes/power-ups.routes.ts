import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import PowerUpAdminService, {
  CreatePowerUpDto,
  UpdatePowerUpDto,
} from '../services/admin-power-ups.service.js';
import { Types } from 'mongoose';
import { typedLogger } from '@/lib/typed-logger.js';
import { authenticate, requireAdmin } from '@/middleware/auth.js';
import { audit } from '@/lib/audit-logger';

// Validation schemas with meaningful error messages
const CreatePowerUpSchema = z.object({
  name: z.string()
    .min(1, { message: 'Power-up name is required' })
    .max(50, { message: 'Power-up name cannot exceed 50 characters' }),
  description: z.string()
    .min(1, { message: 'Description is required' })
    .max(500, { message: 'Description cannot exceed 500 characters' }),
  type: z.enum(['radar_boost', 'double_points', 'speed_boost', 'shield', 'time_extension'], {
    errorMap: () => ({ message: 'Type must be one of: radar_boost, double_points, speed_boost, shield, time_extension' })
  }),
  icon: z.string().optional(),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary'], {
    errorMap: () => ({ message: 'Rarity must be one of: common, rare, epic, legendary' })
  }).optional(),
  durationMs: z.number()
    .min(1000, { message: 'Duration must be at least 1000ms (1 second)' })
    .max(3600000, { message: 'Duration cannot exceed 3600000ms (1 hour)' }),
  dropRate: z.number()
    .min(0, { message: 'Drop rate must be between 0 and 100' })
    .max(100, { message: 'Drop rate must be between 0 and 100' }),
  maxPerSession: z.number()
    .min(1, { message: 'Max per session must be at least 1' }),
  maxInInventory: z.number()
    .min(1, { message: 'Max in inventory must be at least 1' }),
  effects: z.record(z.any(), { message: 'Effects must be a valid object' }),
  notes: z.string().max(1000, { message: 'Notes cannot exceed 1000 characters' }).optional(),
});

const UpdatePowerUpSchema = z.object({
  name: z.string()
    .min(1, { message: 'Power-up name cannot be empty' })
    .max(50, { message: 'Power-up name cannot exceed 50 characters' }).optional(),
  description: z.string()
    .min(1, { message: 'Description cannot be empty' })
    .max(500, { message: 'Description cannot exceed 500 characters' }).optional(),
  icon: z.string().optional(),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary'], {
    errorMap: () => ({ message: 'Rarity must be one of: common, rare, epic, legendary' })
  }).optional(),
  durationMs: z.number()
    .min(1000, { message: 'Duration must be at least 1000ms (1 second)' })
    .max(3600000, { message: 'Duration cannot exceed 3600000ms (1 hour)' }).optional(),
  dropRate: z.number()
    .min(0, { message: 'Drop rate must be between 0 and 100' })
    .max(100, { message: 'Drop rate must be between 0 and 100' }).optional(),
  maxPerSession: z.number()
    .min(1, { message: 'Max per session must be at least 1' }).optional(),
  maxInInventory: z.number()
    .min(1, { message: 'Max in inventory must be at least 1' }).optional(),
  effects: z.record(z.any(), { message: 'Effects must be a valid object' }).optional(),
  enabled: z.boolean().optional(),
  notes: z.string().max(1000, { message: 'Notes cannot exceed 1000 characters' }).optional(),
});

export default async function powerUpRoutes(fastify: FastifyInstance) {
  /**
   * GET /
   * Get all power-ups with optional filtering
   */
  fastify.get(
    '/',
    { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { enabled, type, rarity } = request.query as any;
        
        const filters: any = {};
        if (enabled !== undefined) filters.enabled = enabled === 'true';
        if (type) filters.type = type;
        if (rarity) filters.rarity = rarity;

        const powerUps = await PowerUpAdminService.getAllPowerUps(filters);

        typedLogger.info('Power-ups list retrieved', {
          count: powerUps.length,
          filters,
          userId: (request.user as any).sub,
        });

        reply.code(200).send({
          success: true,
          data: powerUps,
          count: powerUps.length,
        });
      } catch (err) {
        typedLogger.error('Error fetching power-ups', {
          error: err instanceof Error ? err.message : String(err),
          userId: (request.user as any).sub,
        });
        reply.code(500).send({
          success: false,
          error: 'Failed to fetch power-ups',
        });
      }
    }
  );

  /**
   * GET /:id
   * Get single power-up
   */
  fastify.get(
    '/:id',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const powerUp = await PowerUpAdminService.getPowerUpById(request.params.id);

        reply.code(200).send({
          success: true,
          data: powerUp,
        });
      } catch (error: any) {
        typedLogger.error('Error fetching single power-up', {
          powerUpId: request.params.id,
          error: error.message || String(error),
          userId: (request.user as any).sub,
        });
        reply.code(500).send({
          success: false,
          error: 'Failed to fetch power-up',
        });
      }
    }
  );

  /**
   * POST /
   * Create new power-up
   */
  fastify.post(
    '/',
    { preHandler: [authenticate, requireAdmin] },
    async (
      request: FastifyRequest<{ Body: CreatePowerUpDto }>,
      reply: FastifyReply
    ) => {
      try {
        // Ensure user is authenticated
        if (!request.user?.sub) {
          return reply.code(401).send({
            success: false,
            error: 'Authentication required',
            code: 'AUTH_REQUIRED',
          });
        }

        // Validate request body
        const validatedData = CreatePowerUpSchema.parse(request.body);

        const powerUp = await PowerUpAdminService.createPowerUp(
          new Types.ObjectId(request.user.sub),
          validatedData as CreatePowerUpDto
        );

        typedLogger.audit('Power-up created via admin API', {
          powerUpId: powerUp._id.toString(),
          name: powerUp.name,
          type: powerUp.type,
          adminId: request.user.sub,
          timestamp: new Date().toISOString(),
        });

        // Use unified audit logger - writes to both Pino and MongoDB
        await audit.custom({
          userId: request.user.sub,
          userRole: 'admin',
          action: 'CREATE_POWERUP',
          resource: 'powerup',
          resourceId: powerUp._id.toString(),
          category: 'admin',
          severity: 'low',
          metadata: { name: powerUp.name, type: powerUp.type },
        });

        return reply.code(201).send({
          success: true,
          data: powerUp,
          message: 'Power-up created successfully',
        });
      } catch (error: any) {
        typedLogger.error('Error creating power-up via API', {
          error: error.message || String(error),
          adminId: (request.user as any)?.sub,
          body: request.body,
        });
        
        // Handle Zod validation errors
        if (error.name === 'ZodError') {
          const messages = error.errors?.map((e: any) => e.message).join(', ') || 'Validation failed';
          return reply.code(400).send({
            success: false,
            error: messages,
            code: 'VALIDATION_ERROR',
          });
        }
        
        // Handle other validation errors from service
        if (error.message?.includes('required') || error.message?.includes('must be')) {
          return reply.code(400).send({
            success: false,
            error: error.message,
            code: 'VALIDATION_ERROR',
          });
        }
        
        return reply.code(500).send({
          success: false,
          error: error.message || 'Failed to create power-up',
        });
      }
    }
  );

  /**
   * PATCH /:id
   * Update power-up
   */
  fastify.patch(
    '/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdatePowerUpDto }>,
      reply: FastifyReply
    ) => {
      try {
        if (!request.user?.sub) {
          return reply.code(401).send({
            success: false,
            error: 'Authentication required',
            code: 'AUTH_REQUIRED',
          });
        }

        const validatedData = UpdatePowerUpSchema.parse(request.body);

        const powerUp = await PowerUpAdminService.updatePowerUp(
          request.params.id,
          new Types.ObjectId(request.user.sub),
          validatedData as UpdatePowerUpDto
        );

        typedLogger.audit('Power-up updated via admin API', {
          powerUpId: request.params.id,
          changes: Object.keys(validatedData),
          adminId: request.user.sub,
          timestamp: new Date().toISOString(),
        });

        // Use unified audit logger - writes to both Pino and MongoDB
        await audit.custom({
          userId: request.user.sub,
          userRole: 'admin',
          action: 'UPDATE_POWERUP',
          resource: 'powerup',
          resourceId: request.params.id,
          category: 'admin',
          severity: 'low',
          metadata: { changes: Object.keys(validatedData) },
        });

        return reply.code(200).send({
          success: true,
          data: powerUp,
          message: 'Power-up updated successfully',
        });
      } catch (error: any) {
        const statusCode = error.message?.includes('validation') ? 400 : 500;
        return reply.code(statusCode).send({
          success: false,
          error: error.message || 'Failed to update power-up',
        });
      }
    }
  );

  /**
   * PATCH /:id/drop-rate
   * Update power-up drop rate
   */
  fastify.patch(
    '/:id/drop-rate',
    { preHandler: [authenticate, requireAdmin] },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { dropRate: number } }>,
      reply: FastifyReply
    ) => {
      try {
        if (!request.user?.sub) {
          return reply.code(401).send({
            success: false,
            error: 'Authentication required',
            code: 'AUTH_REQUIRED',
          });
        }

        const { dropRate } = request.body;

        if (dropRate < 0 || dropRate > 100) {
          return reply.code(400).send({
            success: false,
            error: 'Drop rate must be between 0 and 100',
          });
        }

        const powerUp = await PowerUpAdminService.updateDropRate(
          request.params.id,
          new Types.ObjectId(request.user.sub),
          dropRate
        );

        return reply.code(200).send({
          success: true,
          data: powerUp,
          message: 'Drop rate updated successfully',
        });
      } catch (error: any) {
        return reply.code(500).send({
          success: false,
          error: error.message || 'Failed to update drop rate',
        });
      }
    }
  );

  /**
   * DELETE /:id
   * Delete power-up
   */
  fastify.delete(
    '/:id',
    { preHandler: [authenticate, requireAdmin] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        if (!request.user?.sub) {
          return reply.code(401).send({
            success: false,
            error: 'Authentication required',
            code: 'AUTH_REQUIRED',
          });
        }

        await PowerUpAdminService.deletePowerUp(
          request.params.id,
          new Types.ObjectId(request.user.sub)
        );

        // Use unified audit logger - writes to both Pino and MongoDB
        await audit.custom({
          userId: request.user.sub,
          userRole: 'admin',
          action: 'DELETE_POWERUP',
          resource: 'powerup',
          resourceId: request.params.id,
          category: 'admin',
          severity: 'medium',
        });

        return reply.code(200).send({
          success: true,
          message: 'Power-up deleted successfully',
        });
      } catch (error: any) {
        return reply.code(500).send({
          success: false,
          error: error.message || 'Failed to delete power-up',
        });
      }
    }
  );

  /**
   * GET /:id/analytics
   * Get power-up analytics
   */
  fastify.get(
    '/:id/analytics',
    { preHandler: authenticate },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const analytics = await PowerUpAdminService.getPowerUpAnalytics(
          request.params.id
        );

        reply.code(200).send({
          success: true,
          data: analytics,
        });
      } catch (error: any) {
        reply.code(500).send({
          success: false,
          error: error.message || 'Failed to fetch analytics',
        });
      }
    }
  );

  /**
   * GET /power-ups/analytics/all
   * Get all power-ups analytics
   */
  fastify.get(
    '/analytics/all',
    { preHandler: authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const analytics = await PowerUpAdminService.getAllPowerUpsAnalytics();

        reply.code(200).send({
          success: true,
          data: analytics,
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: 'Failed to fetch analytics',
        });
      }
    }
  );
}
