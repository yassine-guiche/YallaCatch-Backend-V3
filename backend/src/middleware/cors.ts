import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '@/config';
import { logger } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';

/**
 * CORS configuration options
 */
interface CorsOptions {
  origin: string | string[] | boolean | ((origin: string, request: FastifyRequest) => boolean);
  credentials?: boolean;
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  maxAge?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}

/**
 * Default CORS configuration
 */
const defaultCorsOptions: CorsOptions = {
  origin: config.CORS_ORIGINS || [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-Request-ID',
    'X-Device-ID',
    'X-Platform',
    'X-App-Version',
    'X-Session-ID',
    'X-CSRF-Token',
    'X-Real-IP',
    'X-Forwarded-For',
    'User-Agent',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
    'X-Response-Time',
    'Retry-After',
  ],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 204,
};

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string, allowedOrigins: string | string[] | boolean): boolean {
  if (allowedOrigins === true) {
    return true;
  }
  
  if (allowedOrigins === false) {
    return false;
  }
  
  if (typeof allowedOrigins === 'string') {
    return origin === allowedOrigins || allowedOrigins === '*';
  }
  
  if (Array.isArray(allowedOrigins)) {
    return allowedOrigins.includes(origin) || allowedOrigins.includes('*');
  }
  
  return false;
}

/**
 * Get allowed origin for request
 */
function getAllowedOrigin(
  request: FastifyRequest,
  corsOptions: CorsOptions
): string | null {
  const origin = request.headers.origin;
  
  if (!origin) {
    // No origin header (same-origin request or non-browser)
    return null;
  }
  
  if (typeof corsOptions.origin === 'function') {
    return corsOptions.origin(origin, request) ? origin : null;
  }
  
  if (isOriginAllowed(origin, corsOptions.origin)) {
    return origin;
  }
  
  // Check for development/localhost patterns
  if (config.NODE_ENV === 'development') {
    const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/;
    if (localhostPattern.test(origin)) {
      return origin;
    }
  }
  
  return null;
}

/**
 * CORS middleware
 */
export async function cors(
  request: FastifyRequest,
  reply: FastifyReply,
  options: Partial<CorsOptions> = {}
): Promise<void> {
  const corsOptions: CorsOptions = { ...defaultCorsOptions, ...options };
  const origin = request.headers.origin;
  const method = request.method;
  
  // Log CORS request for debugging
  if (config.NODE_ENV === 'development') {
    typedLogger.debug('CORS request', {
      origin,
      method,
      url: request.url,
      headers: request.headers,
    });
  }
  
  // Handle preflight requests
  if (method === 'OPTIONS') {
    await handlePreflightRequest(request, reply, corsOptions);
    return;
  }
  
  // Handle actual requests
  await handleActualRequest(request, reply, corsOptions);
}

/**
 * Handle preflight OPTIONS request
 */
async function handlePreflightRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  corsOptions: CorsOptions
): Promise<void> {
  const origin = request.headers.origin;
  const requestMethod = request.headers['access-control-request-method'];
  const requestHeaders = request.headers['access-control-request-headers'];
  
  // Check if origin is allowed
  const allowedOrigin = getAllowedOrigin(request, corsOptions);
  
  if (!allowedOrigin && origin) {
    typedLogger.warn('CORS preflight rejected - origin not allowed', {
      origin,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    
    reply.code(403).send({
      success: false,
      error: 'Forbidden',
      message: 'CORS origin not allowed',
      type: 'CORS_ORIGIN_NOT_ALLOWED',
    });
    return;
  }
  
  // Set CORS headers for preflight
  if (allowedOrigin) {
    reply.header('Access-Control-Allow-Origin', allowedOrigin);
  }
  
  if (corsOptions.credentials) {
    reply.header('Access-Control-Allow-Credentials', 'true');
  }
  
  // Allow requested method if it's in allowed methods
  if (requestMethod && corsOptions.methods?.includes(requestMethod)) {
    reply.header('Access-Control-Allow-Methods', corsOptions.methods.join(', '));
  } else if (requestMethod) {
    typedLogger.warn('CORS preflight rejected - method not allowed', {
      origin,
      requestMethod,
      allowedMethods: corsOptions.methods,
    });
    
    reply.code(405).send({
      success: false,
      error: 'Method Not Allowed',
      message: `Method ${requestMethod} not allowed`,
      type: 'CORS_METHOD_NOT_ALLOWED',
    });
    return;
  }
  
  // Allow requested headers if they're in allowed headers
  if (requestHeaders) {
    const requestedHeaders = requestHeaders.split(',').map(h => h.trim().toLowerCase());
    const allowedHeadersLower = corsOptions.allowedHeaders?.map(h => h.toLowerCase()) || [];
    
    const invalidHeaders = requestedHeaders.filter(h => !allowedHeadersLower.includes(h));
    
    if (invalidHeaders.length > 0) {
      typedLogger.warn('CORS preflight rejected - headers not allowed', {
        origin,
        invalidHeaders,
        allowedHeaders: corsOptions.allowedHeaders,
      });
      
      reply.code(403).send({
        success: false,
        error: 'Forbidden',
        message: `Headers not allowed: ${invalidHeaders.join(', ')}`,
        type: 'CORS_HEADERS_NOT_ALLOWED',
      });
      return;
    }
    
    reply.header('Access-Control-Allow-Headers', corsOptions.allowedHeaders?.join(', ') || '');
  }
  
  // Set max age for preflight cache
  if (corsOptions.maxAge) {
    reply.header('Access-Control-Max-Age', corsOptions.maxAge.toString());
  }
  
  // Send successful preflight response
  reply.code(corsOptions.optionsSuccessStatus || 204).send();
}

/**
 * Handle actual CORS request
 */
async function handleActualRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  corsOptions: CorsOptions
): Promise<void> {
  const origin = request.headers.origin;
  
  // Check if origin is allowed
  const allowedOrigin = getAllowedOrigin(request, corsOptions);
  
  if (!allowedOrigin && origin) {
    typedLogger.warn('CORS request rejected - origin not allowed', {
      origin,
      method: request.method,
      url: request.url,
      ip: request.ip,
    });
    
    reply.code(403).send({
      success: false,
      error: 'Forbidden',
      message: 'CORS origin not allowed',
      type: 'CORS_ORIGIN_NOT_ALLOWED',
    });
    return;
  }
  
  // Set CORS headers for actual request
  if (allowedOrigin) {
    reply.header('Access-Control-Allow-Origin', allowedOrigin);
  }
  
  if (corsOptions.credentials) {
    reply.header('Access-Control-Allow-Credentials', 'true');
  }
  
  // Expose headers to client
  if (corsOptions.exposedHeaders?.length) {
    reply.header('Access-Control-Expose-Headers', corsOptions.exposedHeaders.join(', '));
  }
  
  // Vary header for caching
  reply.header('Vary', 'Origin');
}

/**
 * Create CORS middleware with custom options
 */
export function createCorsMiddleware(options: Partial<CorsOptions> = {}) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await cors(request, reply, options);
  };
}

/**
 * Strict CORS for production
 */
export const strictCors = createCorsMiddleware({
  origin: (origin: string, request: FastifyRequest) => {
    // Only allow specific production domains
    const allowedDomains = [
      'https://yallacatch.tn',
      'https://www.yallacatch.tn',
      'https://admin.yallacatch.tn',
      'https://api.yallacatch.tn',
    ];
    
    return allowedDomains.includes(origin);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  maxAge: 3600, // 1 hour
});

/**
 * Development CORS (more permissive)
 */
export const developmentCors = createCorsMiddleware({
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  maxAge: 86400, // 24 hours
});

/**
 * API-only CORS (no credentials)
 */
export const apiCors = createCorsMiddleware({
  origin: config.CORS_ORIGINS,
  credentials: false,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  maxAge: 3600,
});

/**
 * Get appropriate CORS middleware based on environment
 */
export function getCorsMiddleware(): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  if (config.NODE_ENV === 'production') {
    return strictCors;
  } else if (config.NODE_ENV === 'development') {
    return developmentCors;
  } else {
    return cors;
  }
}
