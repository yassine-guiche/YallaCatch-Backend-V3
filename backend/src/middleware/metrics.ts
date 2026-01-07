import { FastifyRequest, FastifyReply } from 'fastify';
import { typedLogger } from '@/lib/typed-logger';
import { config } from '@/config';

/**
 * Metrics collector interface
 */
interface MetricsCollector {
  httpRequestsTotal: Map<string, number>;
  httpRequestDuration: Map<string, number[]>;
  httpRequestSize: Map<string, number[]>;
  httpResponseSize: Map<string, number[]>;
  activeConnections: number;
  errorCounts: Map<string, number>;
  businessMetrics: Map<string, number>;
}

/**
 * Global metrics collector
 */
const metricsCollector: MetricsCollector = {
  httpRequestsTotal: new Map(),
  httpRequestDuration: new Map(),
  httpRequestSize: new Map(),
  httpResponseSize: new Map(),
  activeConnections: 0,
  errorCounts: new Map(),
  businessMetrics: new Map(),
};

/**
 * Request timing storage
 */
const requestTimings = new Map<string, number>();

/**
 * Metrics middleware - onRequest hook
 */
export async function onRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Record request start time
  const requestId = request.id;
  requestTimings.set(requestId, Date.now());
  
  // Increment active connections
  metricsCollector.activeConnections++;
  
  // Record request size
  const contentLength = parseInt(request.headers['content-length'] || '0');
  if (contentLength > 0) {
    const sizeKey = `${request.method}:${getRoutePattern(request.url)}`;
    if (!metricsCollector.httpRequestSize.has(sizeKey)) {
      metricsCollector.httpRequestSize.set(sizeKey, []);
    }
    metricsCollector.httpRequestSize.get(sizeKey)!.push(contentLength);
  }
  
  // Log request for debugging
  if (config.METRICS_DEBUG) {
    typedLogger.debug('Request started', {
      requestId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
  }
}

/**
 * Metrics middleware - onResponse hook
 */
export async function onResponse(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = request.id;
  const startTime = requestTimings.get(requestId);
  
  if (startTime) {
    // Calculate request duration
    const duration = Date.now() - startTime;
    requestTimings.delete(requestId);
    
    // Record metrics
    recordHttpMetrics(request, reply, duration);
    
    // Decrement active connections
    metricsCollector.activeConnections--;
    
    // Record business metrics
    recordBusinessMetrics(request, reply);
    
    // Log response for debugging
    if (config.METRICS_DEBUG) {
      typedLogger.debug('Request completed', {
        requestId,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration,
        responseSize: reply.getHeader('content-length'),
      });
    }
  }
}

/**
 * Record HTTP metrics
 */
function recordHttpMetrics(
  request: FastifyRequest,
  reply: FastifyReply,
  duration: number
): void {
  const method = request.method;
  const route = getRoutePattern(request.url);
  const statusCode = reply.statusCode;
  const statusClass = Math.floor(statusCode / 100) * 100;
  
  // HTTP requests total
  const totalKey = `${method}:${route}:${statusCode}`;
  metricsCollector.httpRequestsTotal.set(
    totalKey,
    (metricsCollector.httpRequestsTotal.get(totalKey) || 0) + 1
  );
  
  // HTTP request duration
  const durationKey = `${method}:${route}`;
  if (!metricsCollector.httpRequestDuration.has(durationKey)) {
    metricsCollector.httpRequestDuration.set(durationKey, []);
  }
  metricsCollector.httpRequestDuration.get(durationKey)!.push(duration);
  
  // Keep only last 1000 duration measurements
  const durations = metricsCollector.httpRequestDuration.get(durationKey)!;
  if (durations.length > 1000) {
    durations.splice(0, durations.length - 1000);
  }
  
  // Response size
  const responseSize = parseInt(reply.getHeader('content-length') as string || '0');
  if (responseSize > 0) {
    const responseSizeKey = `${method}:${route}`;
    if (!metricsCollector.httpResponseSize.has(responseSizeKey)) {
      metricsCollector.httpResponseSize.set(responseSizeKey, []);
    }
    metricsCollector.httpResponseSize.get(responseSizeKey)!.push(responseSize);
  }
  
  // Error counts
  if (statusClass >= 400) {
    const errorKey = `${statusClass}:${route}`;
    metricsCollector.errorCounts.set(
      errorKey,
      (metricsCollector.errorCounts.get(errorKey) || 0) + 1
    );
  }
}

/**
 * Record business-specific metrics
 */
function recordBusinessMetrics(
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const url = request.url;
  const method = request.method;
  const statusCode = reply.statusCode;
  
  // User registrations
  if (method === 'POST' && url.includes('/auth/register') && statusCode === 201) {
    incrementBusinessMetric('user_registrations_total');
  }
  
  // User logins
  if (method === 'POST' && url.includes('/auth/login') && statusCode === 200) {
    incrementBusinessMetric('user_logins_total');
  }
  
  // Prize claims
  if (method === 'POST' && url.includes('/claims') && statusCode === 200) {
    incrementBusinessMetric('prize_claims_total');
  }
  
  // Reward redemptions
  if (method === 'POST' && url.includes('/redeem') && statusCode === 200) {
    incrementBusinessMetric('reward_redemptions_total');
  }
  
  // Failed authentications
  if (method === 'POST' && url.includes('/auth/') && statusCode === 401) {
    incrementBusinessMetric('auth_failures_total');
  }
  
  // API errors
  if (statusCode >= 500) {
    incrementBusinessMetric('api_errors_total');
  }
}

/**
 * Increment business metric
 */
function incrementBusinessMetric(metric: string, value: number = 1): void {
  metricsCollector.businessMetrics.set(
    metric,
    (metricsCollector.businessMetrics.get(metric) || 0) + value
  );
}

/**
 * Get route pattern from URL (remove IDs and query params)
 */
function getRoutePattern(url: string): string {
  return url
    .split('?')[0] // Remove query params
    .replace(/\/[0-9a-f]{24}/g, '/:id') // Replace MongoDB ObjectIds
    .replace(/\/\d+/g, '/:id') // Replace numeric IDs
    .replace(/\/[0-9a-f-]{36}/g, '/:uuid') // Replace UUIDs
    .toLowerCase();
}

/**
 * Calculate percentile from array of numbers
 */
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate average from array of numbers
 */
function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Generate Prometheus metrics format
 */
export function getMetrics(): string {
  const lines: string[] = [];
  const now = Date.now();
  
  // HTTP requests total
  lines.push('# HELP http_requests_total Total number of HTTP requests');
  lines.push('# TYPE http_requests_total counter');
  
  for (const [key, value] of metricsCollector.httpRequestsTotal.entries()) {
    const [method, route, status] = key.split(':');
    lines.push(`http_requests_total{method="${method}",route="${route}",status="${status}"} ${value}`);
  }
  
  // HTTP request duration
  lines.push('# HELP http_request_duration_seconds HTTP request duration in seconds');
  lines.push('# TYPE http_request_duration_seconds histogram');
  
  for (const [key, durations] of metricsCollector.httpRequestDuration.entries()) {
    const [method, route] = key.split(':');
    const durationsInSeconds = durations.map(d => d / 1000);
    
    const p50 = calculatePercentile(durationsInSeconds, 50);
    const p95 = calculatePercentile(durationsInSeconds, 95);
    const p99 = calculatePercentile(durationsInSeconds, 99);
    const avg = calculateAverage(durationsInSeconds);
    
    lines.push(`http_request_duration_seconds{method="${method}",route="${route}",quantile="0.5"} ${p50.toFixed(3)}`);
    lines.push(`http_request_duration_seconds{method="${method}",route="${route}",quantile="0.95"} ${p95.toFixed(3)}`);
    lines.push(`http_request_duration_seconds{method="${method}",route="${route}",quantile="0.99"} ${p99.toFixed(3)}`);
    lines.push(`http_request_duration_seconds_sum{method="${method}",route="${route}"} ${(avg * durations.length).toFixed(3)}`);
    lines.push(`http_request_duration_seconds_count{method="${method}",route="${route}"} ${durations.length}`);
  }
  
  // Active connections
  lines.push('# HELP http_connections_active Number of active HTTP connections');
  lines.push('# TYPE http_connections_active gauge');
  lines.push(`http_connections_active ${metricsCollector.activeConnections}`);
  
  // Error counts
  lines.push('# HELP http_errors_total Total number of HTTP errors');
  lines.push('# TYPE http_errors_total counter');
  
  for (const [key, value] of metricsCollector.errorCounts.entries()) {
    const [status, route] = key.split(':');
    lines.push(`http_errors_total{status="${status}",route="${route}"} ${value}`);
  }
  
  // Business metrics
  lines.push('# HELP yallacatch_business_events_total Total number of business events');
  lines.push('# TYPE yallacatch_business_events_total counter');
  
  for (const [metric, value] of metricsCollector.businessMetrics.entries()) {
    lines.push(`yallacatch_${metric} ${value}`);
  }
  
  // System metrics
  const memUsage = process.memoryUsage();
  lines.push('# HELP nodejs_memory_usage_bytes Node.js memory usage in bytes');
  lines.push('# TYPE nodejs_memory_usage_bytes gauge');
  lines.push(`nodejs_memory_heap_used_bytes ${memUsage.heapUsed}`);
  lines.push(`nodejs_memory_heap_total_bytes ${memUsage.heapTotal}`);
  lines.push(`nodejs_memory_external_bytes ${memUsage.external}`);
  lines.push(`nodejs_memory_rss_bytes ${memUsage.rss}`);
  
  // Process uptime
  lines.push('# HELP nodejs_process_uptime_seconds Process uptime in seconds');
  lines.push('# TYPE nodejs_process_uptime_seconds counter');
  lines.push(`nodejs_process_uptime_seconds ${process.uptime()}`);
  
  // Event loop lag (if available)
  if (process.hrtime) {
    const start = process.hrtime();
    setImmediate(() => {
      const delta = process.hrtime(start);
      const lag = (delta[0] * 1e9 + delta[1]) / 1e6; // Convert to milliseconds
      
      lines.push('# HELP nodejs_eventloop_lag_seconds Event loop lag in seconds');
      lines.push('# TYPE nodejs_eventloop_lag_seconds gauge');
      lines.push(`nodejs_eventloop_lag_seconds ${(lag / 1000).toFixed(6)}`);
    });
  }
  
  return lines.join('\n') + '\n';
}

/**
 * Get metrics in JSON format for debugging
 */
export function getMetricsJson(): any {
  return {
    timestamp: new Date().toISOString(),
    http: {
      requestsTotal: Object.fromEntries(metricsCollector.httpRequestsTotal),
      activeConnections: metricsCollector.activeConnections,
      errors: Object.fromEntries(metricsCollector.errorCounts),
    },
    business: Object.fromEntries(metricsCollector.businessMetrics),
    system: {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      cpuUsage: process.cpuUsage(),
    },
    performance: {
      requestDurations: Array.from(metricsCollector.httpRequestDuration.entries()).map(
        ([key, durations]) => ({
          route: key,
          count: durations.length,
          avg: calculateAverage(durations),
          p95: calculatePercentile(durations, 95),
          p99: calculatePercentile(durations, 99),
        })
      ),
    },
  };
}

/**
 * Reset metrics (useful for testing)
 */
export function resetMetrics(): void {
  metricsCollector.httpRequestsTotal.clear();
  metricsCollector.httpRequestDuration.clear();
  metricsCollector.httpRequestSize.clear();
  metricsCollector.httpResponseSize.clear();
  metricsCollector.activeConnections = 0;
  metricsCollector.errorCounts.clear();
  metricsCollector.businessMetrics.clear();
  requestTimings.clear();
}

/**
 * Custom metric recording functions
 */
export const metrics = {
  onRequest,
  onResponse,
  getMetrics,
  getMetricsJson,
  resetMetrics,
  
  // Custom metric functions
  incrementCounter: (name: string, labels: Record<string, string> = {}, value: number = 1) => {
    const key = `${name}:${JSON.stringify(labels)}`;
    metricsCollector.businessMetrics.set(
      key,
      (metricsCollector.businessMetrics.get(key) || 0) + value
    );
  },
  
  recordDuration: (name: string, duration: number, labels: Record<string, string> = {}) => {
    const key = `${name}:${JSON.stringify(labels)}`;
    if (!metricsCollector.httpRequestDuration.has(key)) {
      metricsCollector.httpRequestDuration.set(key, []);
    }
    metricsCollector.httpRequestDuration.get(key)!.push(duration);
  },
  
  setGauge: (name: string, value: number, labels: Record<string, string> = {}) => {
    const key = `${name}:${JSON.stringify(labels)}`;
    metricsCollector.businessMetrics.set(key, value);
  },
};

/**
 * Middleware to track custom business events
 */
export function trackBusinessEvent(eventName: string, labels: Record<string, string> = {}) {
  return (request: FastifyRequest, reply: FastifyReply) => {
    metrics.incrementCounter(`business_event_${eventName}`, {
      ...labels,
      method: request.method,
      route: getRoutePattern(request.url),
    });
  };
}
