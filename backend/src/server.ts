import Fastify, { FastifyInstance } from 'fastify';
import { config, isDevelopment } from './config/index.js';
import { logger } from './lib/logger.js';
import { connectDB, createIndexes, disconnectDB } from './config/database.js';
import { connectRedis, initializeRedisUtilities, disconnectRedis } from './config/redis.js';
import { configService } from './services/config.js';
import { ipRateLimit } from './middleware/distributed-rate-limit.js';
import { authenticate } from './middleware/auth.js';
import { setupWebSocket } from './lib/websocket.js';
import fastifyCors from '@fastify/cors';
import { createHash } from 'crypto';
import fastifyStatic from '@fastify/static';
import path from 'path';

console.log('ðŸš€ Starting YallaCatch Backend...');

/**
 * Create and configure Fastify server
 */
async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: logger,
    trustProxy: config.NODE_ENV === 'production',
    bodyLimit: 10 * 1024 * 1024, // 10MB
    keepAliveTimeout: 30000,
    // Disable schema validation errors for now
    schemaErrorFormatter: (errors, dataVar) => {
      return new Error('Validation error');
    },
    ajv: {
      customOptions: {
        removeAdditional: false,
        useDefaults: true,
        coerceTypes: true,
        allErrors: false,
      },
    },
  });

  // Allow Zod schemas in routes without AJV errors
  server.setValidatorCompiler(({ schema }) => {
    return (data) => {
      const candidate: any = schema;
      if (candidate && typeof candidate.safeParse === 'function') {
        const result = candidate.safeParse(data);
        if (!result.success) {
          const details = result.error.issues
            .map(issue => `${issue.path.join('.') || 'value'} ${issue.message}`)
            .join('; ');
          throw new Error(details || 'Validation error');
        }
        return result.data;
      }
      return data;
    };
  });

  // Health check endpoint
  server.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.NODE_ENV,
      version: '2.0.1',
    };
  });

  // Root endpoint
  server.get('/', async (request, reply) => {
    return {
      message: 'YallaCatch! Backend API',
      version: '2.0.1',
      environment: config.NODE_ENV,
      endpoints: {
        health: '/health',
        api: '/api/v1',
      },
    };
  });

  // Basic caching headers helper
  server.decorateReply('setStaticCache', function(this: any, maxAgeSeconds: number = 86400) {
    this.header('Cache-Control', `public, max-age=${maxAgeSeconds}, immutable`);
    return this;
  });

  // Generic ETag/Last-Modified helper for GET 200 responses (buffers/strings only)
  server.addHook('onSend', async (request, reply, payload) => {
    try {
      const isGet = request.method === 'GET';
      const isOk = reply.statusCode === 200;
      const hasEtag = !!reply.getHeader('ETag');
      const cachablePayload = typeof payload === 'string' || Buffer.isBuffer(payload);
      if (!isGet || !isOk || hasEtag || !cachablePayload) {
        return payload;
      }

      const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
      const etag = 'W/"' + createHash('sha1').update(buffer).digest('base64') + '"';

      // If client already has this version, short-circuit with 304
      if (request.headers['if-none-match'] === etag) {
        reply.code(304);
        return null;
      }

      reply.header('ETag', etag);
      if (!reply.getHeader('Last-Modified')) {
        reply.header('Last-Modified', new Date().toUTCString());
      }
      return payload;
    } catch {
      return payload;
    }
  });

  // Register authenticate as decorator
  server.decorate('authenticate', authenticate);
  // Global distributed rate limiter (IP-based)
  server.addHook('onRequest', ipRateLimit);
  // CORS (permissive for admin testing; uses env origins when set)
  const allowedOrigins = (config as any).CORS_ORIGINS || [];
  await server.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS origin not allowed'), false);
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
  // Explicit preflight short-circuit
  const preflight = (request: any, reply: any) => {
    const origin = request.headers.origin;
    const allowOrigin = origin && allowedOrigins.includes(origin)
      ? origin
      : (!origin ? (allowedOrigins[0] || '') : null);
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
  server.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') {
      return preflight(request, reply);
    }
  });

  // Static mounts
  await server.register(fastifyStatic, {
    root: path.join(process.cwd(), '..', 'admin', 'dist'),
    prefix: '/admin/',
    decorateReply: false,
    cacheControl: true,
    maxAge: '365d',
    etag: true,
    lastModified: true,
  });

  await server.register(fastifyStatic, {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/uploads/',
    decorateReply: false,
    cacheControl: true,
    maxAge: '1h',
    etag: true,
    lastModified: true,
  });

  return server;
}

/**
 * Register all API routes
 */
async function registerRoutes(server: FastifyInstance): Promise<void> {
  const apiPrefix = '/api/v1';

  try {
    console.log('ðŸ“¦ Loading routes...');

    // Import routes dynamically
    const authRoutes = (await import('./modules/auth/routes.js')).default;
    const prizesRoutes = (await import('./modules/prizes/routes.js')).default;
    const claimsRoutes = (await import('./modules/claims/routes.js')).default;
    const rewardsRoutes = (await import('./modules/rewards/routes.js')).default;
    const usersRoutes = (await import('./modules/users/routes.js')).default;
    const adminRoutes = (await import('./modules/admin/routes.js')).default;
    const notificationsRoutes = (await import('./modules/notifications/routes.js')).default;
    // const analyticsRoutes = (await import('./modules/analytics/routes.js')).default; // Merged into admin
    const gamificationRoutes = (await import('./modules/gamification/routes.js')).default;
    // const partnersRoutes = (await import('./modules/partners/routes.js')).default; // Merged into admin
    const captureRoutes = (await import('./modules/capture/routes.js')).default;
    const marketplaceRoutes = (await import('./modules/marketplace/routes.js')).default;
    // const distributionRoutes = (await import('./modules/distribution/routes.js')).default; // Merged into admin
    const gameRoutes = (await import('./modules/game/routes.js')).default;
    const socialRoutes = (await import('./modules/social/routes.js')).default;
    const offlineRoutes = (await import('./modules/offline/routes.js')).default;
     const integrationRoutes = (await import('./modules/integration/routes.js')).default;
    const admobRoutes = (await import('./modules/admob/index.js')).default;

    console.log('✅ Routes loaded');;

    // Register routes
    console.log('ðŸ“¦ Registering routes...');
    
    await server.register(authRoutes, { prefix: `${apiPrefix}/auth` });
    await server.register(prizesRoutes, { prefix: `${apiPrefix}/prizes` });
    await server.register(claimsRoutes, { prefix: `${apiPrefix}/claims` });
    await server.register(rewardsRoutes, { prefix: `${apiPrefix}/rewards` });
    await server.register(usersRoutes, { prefix: `${apiPrefix}/users` });
    await server.register(adminRoutes, { prefix: `${apiPrefix}/admin` });
    await server.register(notificationsRoutes, { prefix: `${apiPrefix}/notifications` });
    // await server.register(analyticsRoutes, { prefix: `${apiPrefix}/analytics` }); // Merged into admin
    await server.register(gamificationRoutes, { prefix: `${apiPrefix}/gamification` });
    // await server.register(partnersRoutes, { prefix: `${apiPrefix}/partners` }); // Merged into admin
    await server.register(captureRoutes, { prefix: `${apiPrefix}/capture` });
    await server.register(marketplaceRoutes, { prefix: `${apiPrefix}/marketplace` });
    // await server.register(distributionRoutes, { prefix: `${apiPrefix}/distribution` }); // Merged into admin
    await server.register(gameRoutes, { prefix: `${apiPrefix}/game` });
    await server.register(socialRoutes, { prefix: `${apiPrefix}/social` });
    await server.register(offlineRoutes, { prefix: `${apiPrefix}/offline` });
     await server.register(integrationRoutes, { prefix: `${apiPrefix}/integration` });
    await server.register(admobRoutes, { prefix: `${apiPrefix}/admob` });

    console.log('✅ Routes registered');;

    // Catch-all route for 404
    server.setNotFoundHandler(async (request, reply) => {
      reply.code(404).send({
        success: false,
        error: 'Not Found',
        message: `Route ${request.method} ${request.url} not found`,
        timestamp: new Date().toISOString(),
      });
    });

  } catch (error: any) {
    console.error('âŒ Error registering routes:', error.message);
    throw error;
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(server: FastifyInstance, signal: string): Promise<void> {
  console.log(`\nâš ï¸  Received ${signal}, shutting down gracefully...`);

  try {
    // Stop accepting new connections
    await server.close();
    console.log('âœ… Server closed');

    // Close database connections
    await disconnectDB();
    console.log('âœ… Database disconnected');

    // Close Redis connections
    await disconnectRedis();
    console.log('âœ… Redis disconnected');

    console.log('âœ… Graceful shutdown completed');
    process.exit(0);
  } catch (error: any) {
    console.error('âŒ Error during graceful shutdown:', error.message);
    process.exit(1);
  }
}

/**
 * Start the server
 */
async function start(): Promise<void> {
  let server: FastifyInstance | null = null;

  try {
    console.log('ðŸ“‹ Environment:', config.NODE_ENV);
    console.log('ðŸ”Œ Port:', config.PORT);
    console.log('ðŸŒ Host:', config.HOST);

    // Connect to databases
    console.log('ðŸ“¦ Connecting to MongoDB...');
    await connectDB();
    console.log('âœ… MongoDB connected');

    console.log('🔌 Connecting to Redis...');
    const redisClient = await connectRedis();
    initializeRedisUtilities(redisClient);
    // distributed rate limiters rely on redisClient set; no explicit init required
    console.log('✅ Redis connected');

    // Initialize ConfigService for real-time configuration
    console.log('🔧 Initializing ConfigService...');
    await configService.initialize();
    console.log('✅ ConfigService initialized');

    // Initialize MetricsService for game performance tracking
    console.log('📊 Initializing MetricsService...');
    const { MetricsService } = await import('./services/metrics.js');
    MetricsService.initialize();
    console.log('✅ MetricsService initialized');

    // Create database indexes
    console.log('🔨 Creating database indexes...');
    await createIndexes();
    console.log('✅ Database indexes created');

    // Create and configure server
    console.log('ðŸ“¦ Creating Fastify server...');
    server = await createServer();
    console.log('âœ… Fastify server created');

    // Attempt to start Socket.io for admin/frontend realtime compatibility
    try {
      const { Server } = await import('socket.io');
      const { verifyToken } = await import('./lib/jwt.js');
      const { setSocketIO } = await import('./lib/websocket.js');
      const io = new Server(server.server, {
        cors: { origin: (config as any).CORS_ORIGINS || [], credentials: (config as any).CORS_CREDENTIALS },
      });
      io.use(async (socket: any, next: any) => {
        try {
          const authHeader = socket.handshake.headers['authorization'];
          const tokenFromHeader = authHeader?.toString().startsWith('Bearer ')
            ? authHeader.toString().slice(7)
            : null;
          const token = (socket.handshake.auth && socket.handshake.auth.token) || tokenFromHeader;
          if (!token) return next(new Error('unauthorized'));
          const result = await verifyToken(token);
          if (!result.valid || !result.decoded) return next(new Error('unauthorized'));
          (socket as any).user = result.decoded;
          return next();
        } catch {
          return next(new Error('unauthorized'));
        }
      });
      io.on('connection', (socket: any) => {
        (logger as any).info({ type: 'socketio', event: 'connection', id: socket.id, userId: (socket as any).user?.sub });
        socket.on('join_room', (data: any) => socket.join(data?.room));
        socket.on('leave_room', (data: any) => socket.leave(data?.room));
        socket.on('disconnect', (reason: string) => (logger as any).info({ type: 'socketio', event: 'disconnect', id: socket.id, reason }));
      });
      ;(server as any).io = io;
      // Register Socket.IO instance with websocket module for broadcasting
      setSocketIO(io);
      console.log('🔌 Socket.io initialized');
    } catch (err) {
      console.log('�?O Socket.io not installed, skipping realtime setup');
    }
    // Register rate limit plugin if enabled
    if ((config as any).RATE_LIMIT_ENABLED) {
    }

    // Optionally register Swagger
    if (isDevelopment || (config as any).ENABLE_SWAGGER) {
      const swagger = (await import('@fastify/swagger')).default as any;
      const swaggerUi = (await import('@fastify/swagger-ui')).default as any;
      await (server as any).register(swagger, {
        swagger: {
          info: {
            title: 'YallaCatch! API',
            description: 'AR Geolocation Game Backend API',
            version: '2.0.2',
          },
          host: `${config.HOST}:${config.PORT}`,
          schemes: ['http', 'https'],
          consumes: ['application/json'],
          produces: ['application/json'],
          securityDefinitions: {
            Bearer: {
              type: 'apiKey',
              name: 'Authorization',
              in: 'header',
              description: 'Enter bearer token as: Bearer <token>',
            },
          },
        },
      });
      await (server as any).register(swaggerUi, {
        routePrefix: '/docs',
        uiConfig: { docExpansion: 'list', deepLinking: false },
        staticCSP: true,
        transformStaticCSP: (header: string) => header,
      });
    }

    // Register routes
    await registerRoutes(server);

    // Setup WebSocket
    await setupWebSocket(server);

    // Start scheduled jobs (analytics, cleanup, notifications)
    try {
      const jobs = await import('./jobs/index.js');
      await (jobs as any).startScheduledJobs();
    } catch (err) {
      console.log('Jobs module not available or failed to start, continuing without scheduled jobs');
    }

    // Start listening
    console.log('ðŸ“¦ Starting server...');
    await server.listen({
      port: config.PORT,
      host: config.HOST,
    });

    console.log('');
    console.log('ðŸŽ‰ ============================================');
    console.log('ðŸŽ‰  YallaCatch! Backend started successfully!');
    console.log('ðŸŽ‰ ============================================');
    console.log('');
    console.log(`ðŸ“ Server: http://${config.HOST}:${config.PORT}`);
    console.log(`ðŸ“ Health: http://${config.HOST}:${config.PORT}/health`);
    console.log(`ðŸ“ API: http://${config.HOST}:${config.PORT}/api/v1`);
    console.log(`ðŸ“ Environment: ${config.NODE_ENV}`);
    console.log('');
    console.log('ðŸ“Š Routes registered:');
    console.log('   - /api/v1/auth');
    console.log('   - /api/v1/users');
    console.log('   - /api/v1/prizes');
    console.log('   - /api/v1/claims');
    console.log('   - /api/v1/rewards');
    console.log('   - /api/v1/partners');
    console.log('   - /api/v1/marketplace');
    console.log('   - /api/v1/gamification');
    console.log('   - /api/v1/notifications');
    console.log('   - /api/v1/analytics');
    console.log('   - /api/v1/distribution');
    console.log('   - /api/v1/capture');
    console.log('   - /api/v1/game');
    console.log('   - /api/v1/social');
    console.log('   - /api/v1/offline');
    console.log('   - /api/v1/integration');
    console.log('   - /api/v1/admin');
    console.log('');

    // Setup graceful shutdown
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    signals.forEach(signal => {
      process.on(signal, () => gracefulShutdown(server!, signal));
    });

  } catch (error: any) {
    console.error('âŒ Failed to start server:', error.message);
    console.error(error.stack);

    if (server) {
      try {
        await server.close();
      } catch (closeError: any) {
        console.error('âŒ Error closing server:', closeError.message);
      }
    }

    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise) => {
  console.error('âŒ Unhandled Promise Rejection:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('âŒ Uncaught Exception:', error.message);
  console.error(error.stack);
  process.exit(1);
});

// Start the server
start();

export { createServer, start };
export default start;
