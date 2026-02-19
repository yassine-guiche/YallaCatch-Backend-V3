import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { AdminClaimsService } from '../services/admin-claims.service';
import { z } from 'zod';

const listClaimsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['pending', 'validated', 'rejected', 'expired']).optional(),
  userId: z.string().optional(),
  prizeId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const validateClaimSchema = z.object({
  isValid: z.boolean(),
  reason: z.string().optional(),
});

const resolveReportSchema = z.object({
  action: z.enum(['resolve', 'reject']),
  reason: z.string().optional(),
});

export default async function claimsRoutes(fastify: FastifyInstance) {
  // Apply middleware to all routes
  fastify.addHook('onRequest', authenticate);
  fastify.addHook('onRequest', requireAdmin);
  fastify.addHook('onRequest', adminRateLimit);

  // GET /claims - list claims with pagination/filters
  fastify.get('/claims', async (request: FastifyRequest, reply) => {
    const query = listClaimsSchema.parse(request.query);
    const claims = await AdminClaimsService.getClaims(query);
    return reply.send(claims);
  });

  // GET /claims/stats - get claims statistics
  fastify.get('/claims/stats', async (request: FastifyRequest, reply) => {
    const stats = await AdminClaimsService.getClaimsStats();
    return reply.send(stats);
  });

  // GET /claims/:id - get single claim
  fastify.get('/claims/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;
    const claim = await AdminClaimsService.getClaim(id);
    return reply.send(claim);
  });

  // PATCH /claims/:id/validate - validate claim
  fastify.patch('/claims/:id/validate', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;
    const body = validateClaimSchema.parse(request.body);
    const adminId = request.user?.sub;
    const result = await AdminClaimsService.validateClaim(adminId, id, body.isValid, body.reason);
    return reply.send(result);
  });

  // POST /captures - alias for listing claims (admin panel compatibility)
  fastify.post('/captures', async (request: FastifyRequest, reply) => {
    const query = listClaimsSchema.parse(request.body);
    const claims = await AdminClaimsService.getClaims(query);
    return reply.send(claims);
  });

  // GET /captures - alias for listing claims
  fastify.get('/captures', async (request: FastifyRequest, reply) => {
    const query = listClaimsSchema.parse(request.query);
    const claims = await AdminClaimsService.getClaims(query);
    return reply.send(claims);
  });

  // GET /captures/analytics - claims analytics
  fastify.get('/captures/analytics', async (request: FastifyRequest, reply) => {
    const analytics = await AdminClaimsService.getClaimsAnalytics('30d');
    return reply.send(analytics);
  });

  // GET /captures/stats - capture stats
  fastify.get('/captures/stats', async (request: FastifyRequest, reply) => {
    const stats = await AdminClaimsService.getClaimsStats();
    return reply.send(stats);
  });

  // POST /captures/:id/validate - validate capture
  fastify.post('/captures/:id/validate', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;
    const body = validateClaimSchema.parse(request.body);
    const adminId = request.user?.sub;
    const result = await AdminClaimsService.validateClaim(adminId, id, body.isValid, body.reason);
    return reply.send(result);
  });

  // POST /captures/:id/reject - reject capture
  fastify.post('/captures/:id/reject', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;
    const body = z.object({ reason: z.string().optional() }).parse(request.body);
    const adminId = request.user?.sub;
    const result = await AdminClaimsService.validateClaim(adminId, id, false, body.reason);
    return reply.send(result);
  });

  // GET /captures/reports - get capture reports
  fastify.get('/captures/reports', async (request: FastifyRequest, reply) => {
    const query = listClaimsSchema.parse(request.query);
    const reports = await AdminClaimsService.getCaptureReports(query);
    return reply.send(reports);
  });
}
