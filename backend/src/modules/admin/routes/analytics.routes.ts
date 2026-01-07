import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { AdminAnalyticsService } from '../services/admin-analytics.service';
import { z } from 'zod';

const AnalyticsOverviewSchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year']).default('week')
});

type AnalyticsOverviewQuery = z.infer<typeof AnalyticsOverviewSchema>;

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireAdmin);
  fastify.addHook('preHandler', adminRateLimit);

  // GET /analytics - Get all analytics data
  fastify.get('/analytics', async (request, reply) => {
    const analytics = await AdminAnalyticsService.getAnalytics();
    return reply.send({ success: true, data: analytics });
  });

  // GET /analytics/overview - Get overview with period filter
  fastify.get('/analytics/overview', async (request: FastifyRequest<{ Querystring: AnalyticsOverviewQuery }>, reply) => {
    const { period } = AnalyticsOverviewSchema.parse(request.query);
    const overview = await AdminAnalyticsService.getOverview(period);
    return reply.send({ success: true, data: overview });
  });

  // GET /analytics/users - Get user analytics
  fastify.get('/analytics/users', async (request: FastifyRequest<{ Querystring: AnalyticsOverviewQuery }>, reply) => {
    const { period } = AnalyticsOverviewSchema.parse(request.query);
    const userAnalytics = await AdminAnalyticsService.getUsersAnalytics(period);
    return reply.send({ success: true, data: userAnalytics });
  });

  // GET /analytics/prizes - Get prize analytics
  fastify.get('/analytics/prizes', async (request: FastifyRequest<{ Querystring: AnalyticsOverviewQuery }>, reply) => {
    const { period } = AnalyticsOverviewSchema.parse(request.query);
    const prizeAnalytics = await AdminAnalyticsService.getPrizesAnalytics(period);
    return reply.send({ success: true, data: prizeAnalytics });
  });

  // GET /analytics/business - Get business analytics
  fastify.get('/analytics/business', async (request: FastifyRequest<{ Querystring: AnalyticsOverviewQuery }>, reply) => {
    const { period } = AnalyticsOverviewSchema.parse(request.query);
    const businessAnalytics = await AdminAnalyticsService.getBusinessAnalytics(period);
    return reply.send({ success: true, data: businessAnalytics });
  });

  // GET /analytics/heatmap - Get heatmap data
  fastify.get('/analytics/heatmap', async (request: FastifyRequest<{ Querystring: AnalyticsOverviewQuery }>, reply) => {
    const { period } = AnalyticsOverviewSchema.parse(request.query);
    const heatmapData = await AdminAnalyticsService.getHeatmapData(period);
    return reply.send({ success: true, data: heatmapData });
  });

  // GET /analytics/rewards - Get reward analytics
  fastify.get('/analytics/rewards', async (request: FastifyRequest<{ Querystring: AnalyticsOverviewQuery }>, reply) => {
    const { period } = AnalyticsOverviewSchema.parse(request.query);
    const prizeAnalytics = await AdminAnalyticsService.getPrizesAnalytics(period);
    return reply.send({ success: true, data: prizeAnalytics });
  });

  // GET /analytics/engagement - Get engagement metrics
  fastify.get('/analytics/engagement', async (request: FastifyRequest<{ Querystring: AnalyticsOverviewQuery }>, reply) => {
    const { period } = AnalyticsOverviewSchema.parse(request.query);
    const overview = await AdminAnalyticsService.getOverview(period);
    return reply.send({ success: true, data: overview });
  });

  // GET /analytics/geo - Get geographical analytics
  fastify.get('/analytics/geo', async (request: FastifyRequest<{ Querystring: AnalyticsOverviewQuery }>, reply) => {
    const { period } = AnalyticsOverviewSchema.parse(request.query);
    const geoAnalytics = await AdminAnalyticsService.getHeatmapData(period);
    return reply.send({ success: true, data: geoAnalytics });
  });

  // GET /analytics/retention - Get retention analytics
  fastify.get('/analytics/retention', async (request: FastifyRequest<{ Querystring: AnalyticsOverviewQuery }>, reply) => {
    const { period } = AnalyticsOverviewSchema.parse(request.query);
    const users = await AdminAnalyticsService.getUsersAnalytics(period);
    return reply.send({ success: true, data: users });
  });

  // GET /analytics/conversion - Get conversion analytics
  fastify.get('/analytics/conversion', async (request: FastifyRequest<{ Querystring: AnalyticsOverviewQuery }>, reply) => {
    const { period } = AnalyticsOverviewSchema.parse(request.query);
    const overview = await AdminAnalyticsService.getOverview(period);
    return reply.send({ success: true, data: overview });
  });

  // GET /analytics/chart - Get chart data
  fastify.get('/analytics/chart', async (request: FastifyRequest<{ Querystring: { metric?: string; startDate?: string; endDate?: string } }>, reply) => {
    const { metric = 'users' } = request.query;
    // Basic chart stub using overview/users analytics
    const overview = metric === 'users'
      ? await AdminAnalyticsService.getUsersAnalytics('week')
      : await AdminAnalyticsService.getOverview('week');
    return reply.send({ success: true, data: overview });
  });

  // GET /analytics/export - Export analytics data
  fastify.get('/analytics/export', async (request: FastifyRequest<{ Querystring: { type?: string; format?: string; startDate?: string; endDate?: string } }>, reply) => {
    const { type = 'all', format = 'csv' } = request.query;
    // Stub - return a download URL or generate file
    return reply.send({ success: true, url: `/downloads/analytics-${type}-${Date.now()}.${format}` });
  });

  // GET /analytics/partners - Get partner analytics
  fastify.get('/analytics/partners', async (request: FastifyRequest<{ Querystring: AnalyticsOverviewQuery }>, reply) => {
    const { period } = AnalyticsOverviewSchema.parse(request.query);
    const business = await AdminAnalyticsService.getBusinessAnalytics(period);
    return reply.send({ success: true, data: business });
  });

  // POST /analytics/generate - Generate daily analytics
  fastify.post('/analytics/generate', async (request, reply) => {
    await AdminAnalyticsService.generateDailyAnalytics();
    return reply.send({ success: true, message: 'Daily analytics generated successfully' });
  });
}
