import { FastifyRequest, FastifyReply } from 'fastify';
import { typedLogger } from '@/lib/typed-logger';

export async function requestLogger(request: FastifyRequest, reply: FastifyReply) {
  const start = Date.now();
  
  // Log request
  typedLogger.info('Request started', {
    method: request.method,
    url: request.url,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    requestId: request.id,
  });

  // Log response when done
  (reply as any).addHook('onSend', async (request, reply, payload) => {
    const duration = Date.now() - start;
    
    typedLogger.info('Request completed', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      requestId: request.id,
    });
  });
}

export async function security(request: FastifyRequest, reply: FastifyReply) {
  // Add security headers
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
}

export async function compression(request: FastifyRequest, reply: FastifyReply, payload: any) {
  // Simple compression logic (in production, use @fastify/compress)
  return payload;
}

export const metrics = {
  async onRequest(request: FastifyRequest, reply: FastifyReply) {
    // Track request metrics
    (request as any).startTime = Date.now();
  },

  async onResponse(request: FastifyRequest, reply: FastifyReply) {
    // Track response metrics
    const duration = Date.now() - ((request as any).startTime || 0);
    
    // In production, send to metrics service
    typedLogger.debug('Request metrics', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
    });
  },

  getMetrics() {
    // Return Prometheus-style metrics
    return `# HELP yallacatch_requests_total Total number of requests
# TYPE yallacatch_requests_total counter
yallacatch_requests_total 0

# HELP yallacatch_request_duration_seconds Request duration in seconds
# TYPE yallacatch_request_duration_seconds histogram
yallacatch_request_duration_seconds_bucket{le="0.1"} 0
yallacatch_request_duration_seconds_bucket{le="0.5"} 0
yallacatch_request_duration_seconds_bucket{le="1.0"} 0
yallacatch_request_duration_seconds_bucket{le="+Inf"} 0
yallacatch_request_duration_seconds_sum 0
yallacatch_request_duration_seconds_count 0
`;
  },
};

export async function healthCheck(request: FastifyRequest, reply: FastifyReply) {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  };
}
