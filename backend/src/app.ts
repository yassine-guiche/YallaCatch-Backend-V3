import Fastify, { FastifyInstance } from 'fastify';
import { config, isDevelopment, isProduction } from '@/config';
import { logger } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';

// Import middleware
import { errorHandler } from '@/middleware/error';
import { requestLogger } from '@/middleware/logging';
import { security } from '@/middleware/security';
import { getCompressionMiddleware } from '@/middleware/compression';
import { metrics } from '@/middleware/metrics';
import { ipRateLimit, initializeRateLimiters } from '@/middleware/distributed-rate-limit';
import { healthCheck, livenessProbe, readinessProbe, initializeHealthChecks } from '@/middleware/health';
import { authenticate } from '@/middleware/auth';

// Import all route modules
import authRoutes from '@/modules/auth/routes';
import prizesRoutes from '@/modules/prizes/routes';
import claimsRoutes from '@/modules/claims/routes';
import rewardsRoutes from '@/modules/rewards/routes';
import usersRoutes from '@/modules/users/routes';
import adminRoutes from '@/modules/admin/routes';
import notificationsRoutes from '@/modules/notifications/routes';
// import analyticsRoutes from '@/modules/analytics/routes'; // Merged into admin module
import gamificationRoutes from '@/modules/gamification/routes';
// import partnersRoutes from '@/modules/partners/routes'; // Merged into admin module
import arRoutes from '@/modules/ar/routes';
import gameRoutes from '@/modules/game/routes';
import captureRoutes from '@/modules/capture/routes';
import marketplaceRoutes from '@/modules/marketplace/routes';
import partnerMarketplaceRoutes from '@/modules/marketplace/partner.routes';
import socialRoutes from '@/modules/social/routes';
import offlineRoutes from '@/modules/offline/routes';
import integrationRoutes from '@/modules/integration/routes';
import admobRoutes from '@/modules/admob/index';

/**
 * Create and configure Fastify application
 */
export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isDevelopment ? {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    } : logger,
    trustProxy: isProduction,
    bodyLimit: config.UPLOAD_MAX_SIZE,
    keepAliveTimeout: 30000,
    connectionTimeout: 30000,
    pluginTimeout: 30000,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'reqId',
    genReqId: () => {
      return Math.random().toString(36).substring(2, 15) + 
             Math.random().toString(36).substring(2, 15);
    },
  });

  // Initialize middleware and services
  await initializeMiddleware(app);
  await registerCorePlugins(app);
  await registerRoutes(app);
  await registerErrorHandlers(app);

  return app;
}

/**
 * Initialize middleware and external services
 */
async function initializeMiddleware(app: FastifyInstance): Promise<void> {
  // Initialize rate limiters
  initializeRateLimiters();
  
  // Initialize health checks
  initializeHealthChecks();
  
  typedLogger.info('Middleware initialized');
}

/**
 * Register core Fastify plugins
 */
async function registerCorePlugins(app: FastifyInstance): Promise<void> {
  // CORS support (locked to allowed origins)
  const corsPlugin = await import('@fastify/cors');
  const allowedOrigins = config.CORS_ORIGINS || [];
  await app.register((corsPlugin as any).default || corsPlugin, {
    origin: (origin: string, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true); // non-browser clients
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS origin not allowed'));
    },
    credentials: config.CORS_CREDENTIALS,
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
    ],
    maxAge: 86400,
  });

  // Explicit OPTIONS handler to ensure browsers receive CORS headers (catch-all before routing)
  const preflightHandler = (request: any, reply: any) => {
    const origin = request.headers.origin;
    const allowOrigin = origin && (config.CORS_ORIGINS || []).includes(origin)
      ? origin
      : (!origin ? (config.CORS_ORIGINS || [])[0] : null);
    if (!allowOrigin && origin) {
      return reply.code(403).send({ success: false, error: 'CORS_REJECTED' });
    }
    reply
      .header('Access-Control-Allow-Origin', allowOrigin || '')
      .header('Access-Control-Allow-Credentials', 'true')
      .header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD')
      .header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Request-ID, X-Device-ID, X-Platform, X-App-Version, X-Session-ID, X-CSRF-Token'
      )
      .code(204)
      .send();
  };
  app.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') {
      // Short-circuit preflight before hitting any route
      return preflightHandler(request, reply);
    }
  });
  app.options('*', preflightHandler);
  app.options('/api/*', preflightHandler);

  // Security headers
  await app.register(import('@fastify/helmet'), {
    contentSecurityPolicy: isDevelopment ? false : {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // Rate limiting via custom RedisRateLimit (global hook added below)

  // Multipart support for file uploads
  await app.register(import('@fastify/multipart'), {
    limits: {
      fieldNameSize: 100,
      fieldSize: 100,
      fields: 10,
      fileSize: config.UPLOAD_MAX_SIZE,
      files: 5,
      headerPairs: 2000,
    },
  });

  // Static file serving
  await app.register(import('@fastify/static'), {
    root: config.UPLOAD_DESTINATION,
    prefix: '/uploads/',
    decorateReply: false,
  });

  // WebSocket support (authenticated)
  await app.register(import('@fastify/websocket'), {
    options: {
      maxPayload: 1048576, // 1MB
    },
  });

  // Swagger documentation (development only)
  if (isDevelopment || config.ENABLE_SWAGGER) {
    await app.register(import('@fastify/swagger'), {
      swagger: {
        info: {
          title: 'YallaCatch! API',
          description: 'AR Geolocation Game Backend API',
          version: '1.0.0',
        },
        host: `localhost:${config.PORT}`,
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        securityDefinitions: {
          Bearer: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'Enter your bearer token in the format: Bearer <token>',
          },
        },
      },
    });

    await app.register(import('@fastify/swagger-ui'), {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });
  }

  // Response compression (adaptive based on environment)
  const compressionMiddleware = getCompressionMiddleware();
  app.addHook('onSend', compressionMiddleware);

  typedLogger.info('Core plugins registered');
}

/**
 * Register application routes
 */
async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Add hooks for middleware
  app.addHook('onRequest', requestLogger);
  app.addHook('onRequest', security);
  // Custom global distributed rate limiter (IP-based)
  app.addHook('onRequest', ipRateLimit);
  
  if (config.METRICS_ENABLED) {
    app.addHook('onRequest', metrics.onRequest);
    app.addHook('onResponse', metrics.onResponse);
  }

  // Health check endpoints (optionally gated in production)
  const requireHealthAccess = async (request: any, reply: any) => {
    if (isProduction && config.HEALTH_AUTH_TOKEN) {
      const token = request.headers['x-health-token'];
      if (token !== config.HEALTH_AUTH_TOKEN) {
        return reply.code(403).send({
          success: false,
          error: 'FORBIDDEN',
          message: 'Unauthorized health access',
          timestamp: new Date().toISOString(),
        });
      }
    }
  };

  app.get('/health', { preHandler: requireHealthAccess }, healthCheck);
  app.get('/health/live', { preHandler: requireHealthAccess }, livenessProbe);
  app.get('/health/ready', { preHandler: requireHealthAccess }, readinessProbe);

  // Metrics endpoint
  if (config.METRICS_ENABLED && config.PROMETHEUS_ENABLED) {
    app.get('/metrics', async (request, reply) => {
      if (config.METRICS_AUTH_TOKEN) {
        const token = request.headers['x-metrics-token'];
        if (token !== config.METRICS_AUTH_TOKEN) {
          return reply.code(403).send({ success: false, error: 'FORBIDDEN', message: 'Unauthorized metrics access' });
        }
      }
      reply.type('text/plain');
      return metrics.getMetrics();
    });
  }

  // API version prefix
  const apiPrefix = '/api/v1';

  // Public routes (no authentication required)
  await app.register(authRoutes, { prefix: `${apiPrefix}/auth` });

  // Game API routes (require authentication)
  await app.register(prizesRoutes, { prefix: `${apiPrefix}/prizes` });
  await app.register(claimsRoutes, { prefix: `${apiPrefix}/claims` });
  await app.register(rewardsRoutes, { prefix: `${apiPrefix}/rewards` });
  await app.register(usersRoutes, { prefix: `${apiPrefix}/users` });
  await app.register(gamificationRoutes, { prefix: `${apiPrefix}/gamification` });
  await app.register(arRoutes, { prefix: `${apiPrefix}` });
  await app.register(gameRoutes, { prefix: `${apiPrefix}/game` }); // Unity game endpoints
  await app.register(captureRoutes, { prefix: `${apiPrefix}/capture` });
  await app.register(marketplaceRoutes, { prefix: `${apiPrefix}/marketplace` });
  // Partner portal marketplace alias (clean URLs for partners)
  await app.register(partnerMarketplaceRoutes, { prefix: `${apiPrefix}/partner` });
  await app.register(socialRoutes, { prefix: `${apiPrefix}/social` });
  await app.register(offlineRoutes, { prefix: `${apiPrefix}/offline` });
  await app.register(integrationRoutes, { prefix: `${apiPrefix}/integration` });
  await app.register(admobRoutes, { prefix: `${apiPrefix}/admob` });

  // Admin API routes (require admin authentication)
  await app.register(adminRoutes, { prefix: `${apiPrefix}/admin` });
  await app.register(notificationsRoutes, { prefix: `${apiPrefix}/notifications` });
  // await app.register(analyticsRoutes, { prefix: `${apiPrefix}/analytics` }); // Merged into admin module
  // await app.register(partnersRoutes, { prefix: `${apiPrefix}/partners` }); // Merged into admin module

  // WebSocket routes
  app.register(async function (fastify) {
    fastify.get('/ws', { websocket: true, preValidation: authenticate }, (connection, request) => {
      connection.socket.on('message', (message) => {
        // Handle WebSocket messages
        connection.socket.send(JSON.stringify({
          type: 'echo',
          data: message.toString(),
          timestamp: new Date().toISOString(),
        }));
      });

      connection.socket.on('close', () => {
        typedLogger.info('WebSocket connection closed');
      });
    });
  });

  // Catch-all route for 404
  app.setNotFoundHandler(async (request, reply) => {
    reply.code(404).send({
      success: false,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      timestamp: new Date().toISOString(),
    });
  });

  typedLogger.info('Routes registered');
}

/**
 * Register error handlers
 */
async function registerErrorHandlers(app: FastifyInstance): Promise<void> {
  app.setErrorHandler(errorHandler);

  // Validation error handler
  app.setSchemaErrorFormatter((errors, dataVar) => {
    return new Error(
      `Validation failed: ${errors.map(e => `${e.instancePath} ${e.message}`).join(', ')}`
    );
  });

  typedLogger.info('Error handlers registered');
}

export default createApp;
