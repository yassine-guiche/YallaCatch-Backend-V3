import { redisClient } from '@/config/redis';
import { typedLogger } from '@/lib/typed-logger';
import { config } from '@/config';

/**
 * Advanced Metrics Service
 * Critical for Unity performance monitoring and business intelligence
 * Tracks game-specific metrics, performance data, and user behavior
 */

export interface MetricEvent {
  name: string;
  value: number;
  timestamp?: Date;
  tags?: Record<string, string>;
  userId?: string;
  sessionId?: string;
}

export interface GameMetrics {
  sessionDuration: number;
  prizesFound: number;
  prizesClaimed: number;
  distanceTraveled: number;
  averageSpeed: number;
  batteryUsage: number;
  networkLatency: number;
  frameRate: number;
  crashes: number;
}

export interface BusinessMetrics {
  dailyActiveUsers: number;
  monthlyActiveUsers: number;
  retentionRate: number;
  conversionRate: number;
  averageSessionDuration: number;
  revenuePerUser: number;
  churnRate: number;
}

export class MetricsService {
  private static redis = redisClient;
  private static metricsBuffer: MetricEvent[] = [];
  private static bufferSize = 100;
  private static flushInterval = 30000; // 30 seconds

  /**
   * Initialize metrics service with automatic flushing
   */
  static initialize(): void {
    // Start automatic buffer flushing
    setInterval(() => {
      this.flushMetrics();
    }, this.flushInterval);

    typedLogger.info('Metrics service initialized');
  }

  /**
   * Record a metric event
   */
  static async recordMetric(event: MetricEvent): Promise<void> {
    try {
      // Add timestamp if not provided
      if (!event.timestamp) {
        event.timestamp = new Date();
      }

      // Add to buffer
      this.metricsBuffer.push(event);

      // Flush if buffer is full
      if (this.metricsBuffer.length >= this.bufferSize) {
        await this.flushMetrics();
      }

      // Also record in real-time for critical metrics
      if (this.isCriticalMetric(event.name)) {
        await this.recordRealTimeMetric(event);
      }
    } catch (error) {
      typedLogger.error('Record metric error', { error: (error as any).message, event });
    }
  }

  /**
   * Record Unity-specific game metrics
   */
  static async recordGameMetrics(userId: string, sessionId: string, metrics: GameMetrics): Promise<void> {
    try {
      const events: MetricEvent[] = [
        {
          name: 'game.session.duration',
          value: metrics.sessionDuration,
          userId,
          sessionId,
          tags: { platform: 'unity' },
        },
        {
          name: 'game.prizes.found',
          value: metrics.prizesFound,
          userId,
          sessionId,
          tags: { platform: 'unity' },
        },
        {
          name: 'game.prizes.claimed',
          value: metrics.prizesClaimed,
          userId,
          sessionId,
          tags: { platform: 'unity' },
        },
        {
          name: 'game.distance.traveled',
          value: metrics.distanceTraveled,
          userId,
          sessionId,
          tags: { platform: 'unity', unit: 'meters' },
        },
        {
          name: 'game.performance.fps',
          value: metrics.frameRate,
          userId,
          sessionId,
          tags: { platform: 'unity' },
        },
        {
          name: 'game.performance.latency',
          value: metrics.networkLatency,
          userId,
          sessionId,
          tags: { platform: 'unity', unit: 'ms' },
        },
        {
          name: 'game.battery.usage',
          value: metrics.batteryUsage,
          userId,
          sessionId,
          tags: { platform: 'unity', unit: 'percent' },
        },
      ];

      // Record crashes separately if any
      if (metrics.crashes > 0) {
        events.push({
          name: 'game.crashes',
          value: metrics.crashes,
          userId,
          sessionId,
          tags: { platform: 'unity', severity: 'high' },
        });
      }

      // Record all events
      for (const event of events) {
        await this.recordMetric(event);
      }

      // Update user session stats
      await this.updateUserSessionStats(userId, metrics);

    } catch (error) {
      typedLogger.error('Record game metrics error', { error: (error as any).message, userId, sessionId });
    }
  }

  /**
   * Record API performance metrics
   */
  static async recordAPIMetrics(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number,
    userId?: string
  ): Promise<void> {
    try {
      await this.recordMetric({
        name: 'api.request.duration',
        value: duration,
        userId,
        tags: {
          endpoint,
          method,
          status: statusCode.toString(),
          success: statusCode < 400 ? 'true' : 'false',
        },
      });

      // Record error rates
      if (statusCode >= 400) {
        await this.recordMetric({
          name: 'api.request.errors',
          value: 1,
          userId,
          tags: {
            endpoint,
            method,
            status: statusCode.toString(),
          },
        });
      }
    } catch (error) {
      typedLogger.error('Record API metrics error', { error: (error as any).message, endpoint, method });
    }
  }

  /**
   * Record business metrics
   */
  static async recordBusinessMetrics(): Promise<void> {
    try {
      const metrics = await this.calculateBusinessMetrics();
      
      const events: MetricEvent[] = [
        {
          name: 'business.users.daily_active',
          value: metrics.dailyActiveUsers,
          tags: { period: 'daily' },
        },
        {
          name: 'business.users.monthly_active',
          value: metrics.monthlyActiveUsers,
          tags: { period: 'monthly' },
        },
        {
          name: 'business.retention.rate',
          value: metrics.retentionRate,
          tags: { period: 'weekly', unit: 'percent' },
        },
        {
          name: 'business.conversion.rate',
          value: metrics.conversionRate,
          tags: { unit: 'percent' },
        },
        {
          name: 'business.session.average_duration',
          value: metrics.averageSessionDuration,
          tags: { unit: 'seconds' },
        },
        {
          name: 'business.churn.rate',
          value: metrics.churnRate,
          tags: { period: 'monthly', unit: 'percent' },
        },
      ];

      for (const event of events) {
        await this.recordMetric(event);
      }
    } catch (error) {
      typedLogger.error('Record business metrics error', { error: (error as any).message });
    }
  }

  /**
   * Get real-time metrics for monitoring dashboards
   */
  static async getRealTimeMetrics(): Promise<Record<string, any>> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const metrics = {
        timestamp: now.toISOString(),
        api: await this.getAPIMetrics(oneHourAgo, now),
        game: await this.getGameMetrics(oneHourAgo, now),
        system: await this.getSystemMetrics(),
        business: await this.getBusinessMetrics(oneHourAgo, now),
      };

      return metrics;
    } catch (error) {
      typedLogger.error('Get real-time metrics error', { error: (error as any).message });
      return {};
    }
  }

  /**
   * Get Unity-specific performance metrics
   */
  static async getUnityPerformanceMetrics(timeRange: { start: Date; end: Date }): Promise<any> {
    try {
      const metrics = {
        averageFrameRate: await this.getAverageMetric('game.performance.fps', timeRange),
        averageLatency: await this.getAverageMetric('game.performance.latency', timeRange),
        averageBatteryUsage: await this.getAverageMetric('game.battery.usage', timeRange),
        crashRate: await this.getCrashRate(timeRange),
        sessionDuration: await this.getAverageMetric('game.session.duration', timeRange),
        userEngagement: await this.getUserEngagementMetrics(timeRange),
      };

      return metrics;
    } catch (error) {
      typedLogger.error('Get Unity performance metrics error', { error: (error as any).message, timeRange });
      return {};
    }
  }

  /**
   * Generate metrics report for admin dashboard
   */
  static async generateMetricsReport(period: 'daily' | 'weekly' | 'monthly'): Promise<any> {
    try {
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case 'daily':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'weekly':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      const report = {
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        summary: await this.getMetricsSummary({ start: startDate, end: now }),
        trends: await this.getMetricsTrends({ start: startDate, end: now }),
        alerts: await this.getMetricsAlerts({ start: startDate, end: now }),
        recommendations: await this.getMetricsRecommendations({ start: startDate, end: now }),
      };

      return report;
    } catch (error) {
      typedLogger.error('Generate metrics report error', { error: (error as any).message, period });
      return {};
    }
  }

  // Private helper methods
  private static async flushMetrics(): Promise<void> {
    try {
      if (this.metricsBuffer.length === 0) return;

      const metricsToFlush = [...this.metricsBuffer];
      this.metricsBuffer = [];

      // Store metrics in Redis for real-time access
      for (const metric of metricsToFlush) {
        await this.storeMetric(metric);
      }

      // Also send to external monitoring systems (Prometheus, etc.)
      await this.sendToExternalSystems(metricsToFlush);

      typedLogger.debug('Metrics flushed', { count: metricsToFlush.length });
    } catch (error) {
      typedLogger.error('Flush metrics error', { error: (error as any).message });
    }
  }

  private static async storeMetric(metric: MetricEvent): Promise<void> {
    try {
      const key = `metric:${metric.name}:${metric.timestamp?.getTime()}`;
      const data = {
        ...metric,
        timestamp: metric.timestamp?.toISOString(),
      };

      // Store with 7 days TTL
      await this.redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(data));

      // Also add to time series for aggregation
      const timeSeriesKey = `ts:${metric.name}`;
      await this.redis.zadd(
        timeSeriesKey,
        metric.timestamp?.getTime() || Date.now(),
        JSON.stringify(data)
      );

      // Expire time series after 30 days
      await this.redis.expire(timeSeriesKey, 30 * 24 * 60 * 60);
    } catch (error) {
      typedLogger.error('Store metric error', { error: (error as any).message, metric });
    }
  }

  private static async recordRealTimeMetric(event: MetricEvent): Promise<void> {
    try {
      // Store in real-time metrics with shorter TTL
      const key = `realtime:${event.name}`;
      await this.redis.setex(key, 300, JSON.stringify(event)); // 5 minutes TTL
    } catch (error) {
      typedLogger.error('Record real-time metric error', { error: (error as any).message, event });
    }
  }

  private static isCriticalMetric(metricName: string): boolean {
    const criticalMetrics = [
      'api.request.errors',
      'game.crashes',
      'system.memory.usage',
      'system.cpu.usage',
      'database.connection.errors',
    ];
    return criticalMetrics.includes(metricName);
  }

  private static async updateUserSessionStats(userId: string, metrics: GameMetrics): Promise<void> {
    try {
      const statsKey = `user_stats:${userId}`;
      const currentStats = await this.redis.get(statsKey);
      
      let stats = currentStats ? JSON.parse(currentStats) : {
        totalSessions: 0,
        totalDuration: 0,
        totalDistance: 0,
        totalPrizesClaimed: 0,
        averageFrameRate: 0,
        lastUpdated: new Date().toISOString(),
      };

      // Update stats
      stats.totalSessions += 1;
      stats.totalDuration += metrics.sessionDuration;
      stats.totalDistance += metrics.distanceTraveled;
      stats.totalPrizesClaimed += metrics.prizesClaimed;
      stats.averageFrameRate = (stats.averageFrameRate + metrics.frameRate) / 2;
      stats.lastUpdated = new Date().toISOString();

      // Store updated stats
      await this.redis.setex(statsKey, 30 * 24 * 60 * 60, JSON.stringify(stats)); // 30 days TTL
    } catch (error) {
      typedLogger.error('Update user session stats error', { error: (error as any).message, userId });
    }
  }

  private static async calculateBusinessMetrics(): Promise<BusinessMetrics> {
    try {
      // This would typically query the database for actual metrics
      // For now, return placeholder values
      return {
        dailyActiveUsers: 0,
        monthlyActiveUsers: 0,
        retentionRate: 0,
        conversionRate: 0,
        averageSessionDuration: 0,
        revenuePerUser: 0,
        churnRate: 0,
      };
    } catch (error) {
      typedLogger.error('Calculate business metrics error', { error: (error as any).message });
      return {
        dailyActiveUsers: 0,
        monthlyActiveUsers: 0,
        retentionRate: 0,
        conversionRate: 0,
        averageSessionDuration: 0,
        revenuePerUser: 0,
        churnRate: 0,
      };
    }
  }

  private static async getAPIMetrics(start: Date, end: Date): Promise<any> {
    try {
      // Get API metrics from time series
      const requestDurations = await this.getMetricValues('api.request.duration', start, end);
      const errorCounts = await this.getMetricValues('api.request.errors', start, end);

      return {
        averageResponseTime: requestDurations.length > 0 
          ? requestDurations.reduce((a, b) => a + b, 0) / requestDurations.length 
          : 0,
        totalRequests: requestDurations.length,
        errorRate: requestDurations.length > 0 
          ? (errorCounts.length / requestDurations.length) * 100 
          : 0,
        totalErrors: errorCounts.length,
      };
    } catch (error) {
      typedLogger.error('Get API metrics error', { error: (error as any).message, start, end });
      return {};
    }
  }

  private static async getGameMetrics(start: Date, end: Date): Promise<any> {
    try {
      return {
        totalSessions: await this.getMetricCount('game.session.duration', start, end),
        averageSessionDuration: await this.getAverageMetric('game.session.duration', { start, end }),
        totalPrizesClaimed: await this.getMetricSum('game.prizes.claimed', start, end),
        averageFrameRate: await this.getAverageMetric('game.performance.fps', { start, end }),
        crashCount: await this.getMetricSum('game.crashes', start, end),
      };
    } catch (error) {
      typedLogger.error('Get game metrics error', { error: (error as any).message, start, end });
      return {};
    }
  }

  private static async getSystemMetrics(): Promise<any> {
    try {
      // Get current system metrics
      return {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        cpuUsage: process.cpuUsage(),
      };
    } catch (error) {
      typedLogger.error('Get system metrics error', { error: (error as any).message });
      return {};
    }
  }

  private static async getBusinessMetrics(start: Date, end: Date): Promise<any> {
    try {
      return {
        activeUsers: await this.getUniqueUserCount(start, end),
        newUsers: await this.getNewUserCount(start, end),
        retentionRate: await this.calculateRetentionRate(start, end),
      };
    } catch (error) {
      typedLogger.error('Get business metrics error', { error: (error as any).message, start, end });
      return {};
    }
  }

  private static async getMetricValues(metricName: string, start: Date, end: Date): Promise<number[]> {
    try {
      const timeSeriesKey = `ts:${metricName}`;
      const results = await this.redis.zrangebyscore(
        timeSeriesKey,
        start.getTime(),
        end.getTime()
      );

      return results.map(result => {
        try {
          const data = JSON.parse(result);
          return data.value || 0;
        } catch {
          return 0;
        }
      });
    } catch (error) {
      typedLogger.error('Get metric values error', { error: (error as any).message, metricName, start, end });
      return [];
    }
  }

  private static async getAverageMetric(metricName: string, timeRange: { start: Date; end: Date }): Promise<number> {
    try {
      const values = await this.getMetricValues(metricName, timeRange.start, timeRange.end);
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    } catch (error) {
      typedLogger.error('Get average metric error', { error: (error as any).message, metricName, timeRange });
      return 0;
    }
  }

  private static async getMetricCount(metricName: string, start: Date, end: Date): Promise<number> {
    try {
      const values = await this.getMetricValues(metricName, start, end);
      return values.length;
    } catch (error) {
      typedLogger.error('Get metric count error', { error: (error as any).message, metricName, start, end });
      return 0;
    }
  }

  private static async getMetricSum(metricName: string, start: Date, end: Date): Promise<number> {
    try {
      const values = await this.getMetricValues(metricName, start, end);
      return values.reduce((a, b) => a + b, 0);
    } catch (error) {
      typedLogger.error('Get metric sum error', { error: (error as any).message, metricName, start, end });
      return 0;
    }
  }

  private static async getCrashRate(timeRange: { start: Date; end: Date }): Promise<number> {
    try {
      const crashes = await this.getMetricSum('game.crashes', timeRange.start, timeRange.end);
      const sessions = await this.getMetricCount('game.session.duration', timeRange.start, timeRange.end);
      return sessions > 0 ? (crashes / sessions) * 100 : 0;
    } catch (error) {
      typedLogger.error('Get crash rate error', { error: (error as any).message, timeRange });
      return 0;
    }
  }

  private static async getUserEngagementMetrics(timeRange: { start: Date; end: Date }): Promise<any> {
    try {
      // This would calculate user engagement based on session data
      return {
        averageSessionsPerUser: 0,
        averageTimePerSession: 0,
        retentionRate: 0,
      };
    } catch (error) {
      typedLogger.error('Get user engagement metrics error', { error: (error as any).message, timeRange });
      return {};
    }
  }

  private static async getMetricsSummary(timeRange: { start: Date; end: Date }): Promise<any> {
    try {
      return {
        totalEvents: await this.getTotalEventCount(timeRange),
        uniqueUsers: await this.getUniqueUserCount(timeRange.start, timeRange.end),
        averageSessionDuration: await this.getAverageMetric('game.session.duration', timeRange),
        totalErrors: await this.getMetricSum('api.request.errors', timeRange.start, timeRange.end),
      };
    } catch (error) {
      typedLogger.error('Get metrics summary error', { error: (error as any).message, timeRange });
      return {};
    }
  }

  private static async getMetricsTrends(timeRange: { start: Date; end: Date }): Promise<any> {
    try {
      // Calculate trends over the time period
      return {
        userGrowth: 0,
        engagementTrend: 0,
        performanceTrend: 0,
        errorTrend: 0,
      };
    } catch (error) {
      typedLogger.error('Get metrics trends error', { error: (error as any).message, timeRange });
      return {};
    }
  }

  private static async getMetricsAlerts(timeRange: { start: Date; end: Date }): Promise<any[]> {
    try {
      const alerts = [];

      // Check for high error rates
      const errorRate = await this.getAPIMetrics(timeRange.start, timeRange.end);
      if (errorRate.errorRate > 5) {
        alerts.push({
          type: 'error_rate',
          severity: 'high',
          message: `Error rate is ${errorRate.errorRate.toFixed(2)}% (threshold: 5%)`,
        });
      }

      // Check for low frame rates
      const avgFrameRate = await this.getAverageMetric('game.performance.fps', timeRange);
      if (avgFrameRate < 30) {
        alerts.push({
          type: 'performance',
          severity: 'medium',
          message: `Average frame rate is ${avgFrameRate.toFixed(1)} FPS (threshold: 30 FPS)`,
        });
      }

      return alerts;
    } catch (error) {
      typedLogger.error('Get metrics alerts error', { error: (error as any).message, timeRange });
      return [];
    }
  }

  private static async getMetricsRecommendations(timeRange: { start: Date; end: Date }): Promise<any[]> {
    try {
      const recommendations = [];

      // Analyze metrics and provide recommendations
      const crashRate = await this.getCrashRate(timeRange);
      if (crashRate > 1) {
        recommendations.push({
          type: 'stability',
          priority: 'high',
          message: 'High crash rate detected. Consider implementing additional error handling and testing.',
        });
      }

      return recommendations;
    } catch (error) {
      typedLogger.error('Get metrics recommendations error', { error: (error as any).message, timeRange });
      return [];
    }
  }

  private static async sendToExternalSystems(metrics: MetricEvent[]): Promise<void> {
    try {
      // Send metrics to external monitoring systems
      // This would integrate with Prometheus, DataDog, etc.
      typedLogger.debug('Metrics sent to external systems', { count: metrics.length });
    } catch (error) {
      typedLogger.error('Send to external systems error', { error: (error as any).message });
    }
  }

  private static async getTotalEventCount(timeRange: { start: Date; end: Date }): Promise<number> {
    try {
      // Count total events in time range
      return 0;
    } catch (error) {
      typedLogger.error('Get total event count error', { error: (error as any).message, timeRange });
      return 0;
    }
  }

  private static async getUniqueUserCount(start: Date, end: Date): Promise<number> {
    try {
      // Count unique users in time range
      return 0;
    } catch (error) {
      typedLogger.error('Get unique user count error', { error: (error as any).message, start, end });
      return 0;
    }
  }

  private static async getNewUserCount(start: Date, end: Date): Promise<number> {
    try {
      // Count new users in time range
      return 0;
    } catch (error) {
      typedLogger.error('Get new user count error', { error: (error as any).message, start, end });
      return 0;
    }
  }

  private static async calculateRetentionRate(start: Date, end: Date): Promise<number> {
    try {
      // Calculate user retention rate
      return 0;
    } catch (error) {
      typedLogger.error('Calculate retention rate error', { error: (error as any).message, start, end });
      return 0;
    }
  }
}

export default MetricsService;
