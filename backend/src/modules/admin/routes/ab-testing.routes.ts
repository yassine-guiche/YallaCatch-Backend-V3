import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { ABTestingService } from '../services/admin-ab-testing.service';
import { audit } from '@/lib/audit-logger';
import { z } from 'zod';

const CreateTestSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional(),
  type: z.enum(['feature', 'ui', 'mechanics', 'rewards', 'pricing']),
  variants: z.array(
    z.object({
      name: z.string(),
      trafficAllocation: z.number().min(0).max(100),
      config: z.record(z.any())
    })
  ),
  startDate: z.string().datetime(),
  sampleSize: z.number().optional(),
  confidenceLevel: z.number().optional()
});

const UpdateTestSchema = CreateTestSchema.partial();

type CreateTestRequest = z.infer<typeof CreateTestSchema>;
type UpdateTestRequest = z.infer<typeof UpdateTestSchema>;

export default async function abTestingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireAdmin);
  fastify.addHook('preHandler', adminRateLimit);

  // Create A/B Test
  fastify.post<{ Body: CreateTestRequest }>('/ab-testing', async (request, reply) => {
    try {
      const data = CreateTestSchema.parse(request.body);
      const userId = (request as any).user?.sub || (request as any).userId;
      const test = await ABTestingService.createTest(data as any, userId);
      
      // Audit log
      await audit.custom({
        userId,
        userRole: 'admin',
        action: 'CREATE_AB_TEST',
        resource: 'ab_test',
        resourceId: test._id?.toString(),
        category: 'admin',
        severity: 'low',
        metadata: { name: data.name, type: data.type },
      });
      
      return reply.code(201).send({ success: true, data: test });
    } catch (error) {
      return reply.code(400).send({ success: false, error: (error as Error).message });
    }
  });

  // Get all A/B Tests with filters
  fastify.get('/ab-testing', async (request: FastifyRequest<{ Querystring: { status?: string; type?: string } }>, reply) => {
    try {
      const tests = await ABTestingService.getTests({
        status: request.query.status,
        type: request.query.type
      });
      return reply.send({ success: true, data: tests });
    } catch (error) {
      return reply.code(500).send({ success: false, error: (error as Error).message });
    }
  });

  // Get A/B Test by ID
  fastify.get<{ Params: { id: string } }>('/ab-testing/:id', async (request, reply) => {
    try {
      const test = await ABTestingService.getTestById(request.params.id);
      return reply.send({ success: true, data: test });
    } catch (error) {
      return reply.code(404).send({ success: false, error: (error as Error).message });
    }
  });

  // Update A/B Test
  fastify.patch<{ Params: { id: string }; Body: UpdateTestRequest }>(
    '/ab-testing/:id',
    async (request, reply) => {
      try {
        const data = UpdateTestSchema.parse(request.body);
        const userId = (request as any).user?.sub || (request as any).userId;
        const test = await ABTestingService.updateTest(request.params.id, data as any);
        
        // Audit log
        await audit.custom({
          userId,
          userRole: 'admin',
          action: 'UPDATE_AB_TEST',
          resource: 'ab_test',
          resourceId: request.params.id,
          category: 'admin',
          severity: 'low',
          metadata: { changes: Object.keys(data) },
        });
        
        return reply.send({ success: true, data: test });
      } catch (error) {
        return reply.code(400).send({ success: false, error: (error as Error).message });
      }
    }
  );

  // Start A/B Test
  fastify.post<{ Params: { id: string } }>('/ab-testing/:id/start', async (request, reply) => {
    try {
      const userId = (request as any).user?.sub || (request as any).userId;
      const test = await ABTestingService.startTest(request.params.id);
      
      // Audit log
      await audit.custom({
        userId,
        userRole: 'admin',
        action: 'START_AB_TEST',
        resource: 'ab_test',
        resourceId: request.params.id,
        category: 'admin',
        severity: 'medium',
      });
      
      return reply.send({ success: true, data: test });
    } catch (error) {
      return reply.code(400).send({ success: false, error: (error as Error).message });
    }
  });

  // Pause A/B Test
  fastify.post<{ Params: { id: string } }>('/ab-testing/:id/pause', async (request, reply) => {
    try {
      const userId = (request as any).user?.sub || (request as any).userId;
      const test = await ABTestingService.pauseTest(request.params.id);
      
      // Audit log
      await audit.custom({
        userId,
        userRole: 'admin',
        action: 'PAUSE_AB_TEST',
        resource: 'ab_test',
        resourceId: request.params.id,
        category: 'admin',
        severity: 'medium',
      });
      
      return reply.send({ success: true, data: test });
    } catch (error) {
      return reply.code(400).send({ success: false, error: (error as Error).message });
    }
  });

  // End A/B Test
  fastify.post<{ Params: { id: string } }>('/ab-testing/:id/end', async (request, reply) => {
    try {
      const userId = (request as any).user?.sub || (request as any).userId;
      const test = await ABTestingService.endTest(request.params.id);
      
      // Audit log
      await audit.custom({
        userId,
        userRole: 'admin',
        action: 'END_AB_TEST',
        resource: 'ab_test',
        resourceId: request.params.id,
        category: 'admin',
        severity: 'medium',
      });
      
      return reply.send({ success: true, data: test });
    } catch (error) {
      return reply.code(400).send({ success: false, error: (error as Error).message });
    }
  });

  // Get A/B Test Metrics
  fastify.get<{ Params: { id: string } }>('/ab-testing/:id/metrics', async (request, reply) => {
    try {
      const metrics = await ABTestingService.getMetrics(request.params.id);
      return reply.send({ success: true, data: metrics });
    } catch (error) {
      return reply.code(500).send({ success: false, error: (error as Error).message });
    }
  });

  // Get A/B Test Results
  fastify.get<{ Params: { id: string } }>('/ab-testing/:id/results', async (request, reply) => {
    try {
      const results = await ABTestingService.getTestResults(request.params.id);
      return reply.send({ success: true, data: results });
    } catch (error) {
      return reply.code(500).send({ success: false, error: (error as Error).message });
    }
  });

  // Get Active Tests
  fastify.get('/ab-testing/active/list', async (request, reply) => {
    try {
      const tests = await ABTestingService.getActiveTests();
      return reply.send({ success: true, data: tests });
    } catch (error) {
      return reply.code(500).send({ success: false, error: (error as Error).message });
    }
  });

  // Delete A/B Test
  fastify.delete<{ Params: { id: string } }>('/ab-testing/:id', async (request, reply) => {
    try {
      const userId = (request as any).user?.sub || (request as any).userId;
      await ABTestingService.deleteTest(request.params.id);
      
      // Audit log
      await audit.custom({
        userId,
        userRole: 'admin',
        action: 'DELETE_AB_TEST',
        resource: 'ab_test',
        resourceId: request.params.id,
        category: 'admin',
        severity: 'medium',
      });
      
      return reply.send({ success: true, message: 'Test deleted successfully' });
    } catch (error) {
      return reply.code(500).send({ success: false, error: (error as Error).message });
    }
  });
}
