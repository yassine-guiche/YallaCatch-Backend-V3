import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { AdminService } from '../services/admin-core.service';
import { AdminAnalyticsService } from '../services/admin-analytics.service';

export default async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { period?: string } }>('/dashboard', {
    preHandler: [authenticate, requireAdmin]
  }, async (request, reply) => {
    try {
      const { period = '7d' } = request.query;

      // Get both core stats and analytics overview for daily activity
      const [coreStats, analyticsOverview] = await Promise.all([
        AdminService.getDashboardStats(),
        AdminAnalyticsService.getOverview(period)
      ]);

      // Merge data for comprehensive dashboard
      const result = {
        ...coreStats,
        captures: {
          total: analyticsOverview.totalCaptures || coreStats.claims?.total || 0,
          today: analyticsOverview.totalCaptures || 0,
        },
        // Add purchases/marketplace stats (using redemptions with marketplace type as proxy)
        purchases: {
          total: coreStats.redemptions?.total || 0,
          unredeemed: coreStats.redemptions?.pending || 0,
          redeemed: coreStats.redemptions?.completed || 0,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dailyActivity: (analyticsOverview.dailyActivity || []).map((day: any) => ({
          date: day.date,
          captures: day.captures || day.claims || 0,
          redemptions: day.redemptions || 0,
          points: day.points || 0
        }))
      };

      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get dashboard stats';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  fastify.get('/dashboard/real-time', {
    preHandler: [authenticate, requireAdmin, adminRateLimit]
  }, async (request, reply) => {
    try {
      const result = await AdminAnalyticsService.getRealTimeStats();
      return { success: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get real-time stats';
      return reply.status(500).send({ success: false, error: message });
    }
  });


}
