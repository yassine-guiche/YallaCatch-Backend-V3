import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { AntiCheatMonitoringService } from '@/services/anti-cheat-monitoring';
import { audit } from '@/lib/audit-logger';
import { z } from 'zod';

type AdminRequest<P = Record<string, unknown>, B = unknown, Q = unknown> = FastifyRequest<{
  Params: P;
  Body: B;
  Querystring: Q;
}>;

/**
 * Anti-Cheat Monitoring Routes
 * Admin endpoints for viewing, analyzing, and managing fraud detection
 */
export default async function antiCheatRoutes(fastify: FastifyInstance) {
  // Get all flagged claims with filters
  fastify.get('/flagged-claims', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<Record<string, never>, unknown, {
    userId?: string;
    riskLevel?: string;
    status?: string;
    limit?: string;
    offset?: string;
  }>, reply) => {
    try {
      const filters = {
        userId: request.query.userId,
        riskLevel: request.query.riskLevel as 'high' | 'critical' | undefined,
        status: request.query.status as 'pending' | 'approved' | 'rejected' | 'overridden' | undefined,
        limit: request.query.limit ? parseInt(request.query.limit as string) : 50,
        offset: request.query.offset ? parseInt(request.query.offset as string) : 0,
      };

      const result = await AntiCheatMonitoringService.getFlaggedClaims(filters);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get user risk profile
  fastify.get('/user-risk/:userId', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<{ userId: string }>, reply) => {
    try {
      const profile = await AntiCheatMonitoringService.getUserRiskProfile(request.params.userId);
      if (!profile) {
        return reply.code(404).send({ success: false, error: 'User not found' });
      }
      return reply.send({ success: true, data: profile });
    } catch (error) {
      return reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get anti-cheat metrics
  fastify.get('/metrics', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const metrics = await AntiCheatMonitoringService.getMetrics();
      reply.send({ success: true, data: metrics });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get fraud pattern analysis
  fastify.get('/patterns', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      const patterns = await AntiCheatMonitoringService.analyzeFraudPatterns();
      reply.send({ success: true, data: patterns });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Override claim decision (approve or reject)
  fastify.post('/override-claim', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: AdminRequest<Record<string, never>, {
    claimId: string;
    decision: 'approve' | 'reject';
    notes?: string;
  }>, reply) => {
    try {
      // Validate request body
      const schema = z.object({
        claimId: z.string().min(1, 'claimId is required'),
        decision: z.enum(['approve', 'reject']),
        notes: z.string().optional(),
      });

      const validation = schema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          success: false,
          error: validation.error.errors[0].message,
        });
      }

      const { claimId, decision, notes } = validation.data;
      const result = await AntiCheatMonitoringService.overrideClaim(
        claimId,
        request.user.sub,
        decision,
        notes
      );

      if (!result) {
        return reply.code(404).send({ success: false, error: 'Claim not found' });
      }

      // Audit log - this is a critical action
      await audit.custom({
        userId: request.user.sub,
        userRole: 'admin',
        action: `OVERRIDE_CLAIM_${decision.toUpperCase()}`,
        resource: 'claim',
        resourceId: claimId,
        category: 'admin',
        severity: 'high',
        description: `Admin overrode claim decision: ${decision}`,
        metadata: { claimId, decision, notes },
      });

      return reply.send({
        success: true,
        message: `Claim ${decision}d successfully`,
        data: result,
      });
    } catch (error) {
      return reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get risk score threshold settings
  fastify.get('/settings', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request, reply) => {
    try {
      // TODO: Get from Settings/ConfigService
      const settings = {
        riskThreshold: 50,
        criticalThreshold: 75,
        autoRejectAbove: 90,
        autoApproveBelow: 20,
      };

      reply.send({ success: true, data: settings });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Update risk score thresholds
  fastify.patch('/settings', {
    preHandler: [authenticate, requireAdmin],
  }, async (request: AdminRequest<Record<string, never>, {
    riskThreshold?: number;
    criticalThreshold?: number;
    autoRejectAbove?: number;
    autoApproveBelow?: number;
  }>, reply) => {
    try {
      // TODO: Update via ConfigService
      const schema = z.object({
        riskThreshold: z.number().min(0).max(100).optional(),
        criticalThreshold: z.number().min(0).max(100).optional(),
        autoRejectAbove: z.number().min(0).max(100).optional(),
        autoApproveBelow: z.number().min(0).max(100).optional(),
      });

      const validation = schema.safeParse(request.body);
      if (!validation.success) {
        return reply.code(400).send({
          success: false,
          error: validation.error.errors[0].message,
        });
      }

      // Audit log
      await audit.settingsUpdated(request.user.sub, 'anti_cheat', { metadata: { changes: Object.keys(validation.data) } });

      // TODO: Implement settings update via ConfigService
      return reply.send({
        success: true,
        message: 'Settings updated successfully',
      });
    } catch (error) {
      return reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get recent anti-cheat alerts
  fastify.get('/recent-alerts', {
    preHandler: [authenticate, requireAdmin, adminRateLimit],
  }, async (request: AdminRequest<Record<string, never>, unknown, { limit?: string }>, reply) => {
    try {
      const limit = request.query.limit ? parseInt(request.query.limit as string) : 20;

      const result = await AntiCheatMonitoringService.getFlaggedClaims({
        riskLevel: 'critical',
        limit,
      });

      reply.send({
        success: true,
        data: {
          alerts: result.claims,
          count: result.total,
        },
      });
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Export anti-cheat report
  fastify.get('/export-report', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    try {
      const metrics = await AntiCheatMonitoringService.getMetrics();
      const patterns = await AntiCheatMonitoringService.analyzeFraudPatterns();

      const report = {
        generatedAt: new Date().toISOString(),
        metrics,
        patterns,
        summary: {
          flagRate: `${metrics.flaggedClaimsCount}/${metrics.totalClaimsAnalyzed}`,
          rejectionRate: `${metrics.rejectionRate.toFixed(2)}%`,
          overrideRate: `${metrics.overrideRate.toFixed(2)}%`,
          topRiskFactors: metrics.topRiskFactors.slice(0, 5),
          topFlaggedUsers: metrics.topFlaggedUsers.slice(0, 5),
        },
      };

      // Set response headers for file download
      reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', 'attachment; filename="anti-cheat-report.json"')
        .send(report);
    } catch (error) {
      reply.code(500).send({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}
