import pino from 'pino';
import { config, isDevelopment, isProduction } from '@/config';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.dirname(config.LOG_FILE_PATH);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log levels
const customLevels = {
  audit: 35,
  security: 45,
  performance: 25,
};

// Pino configuration
const pinoConfig: pino.LoggerOptions = {
  level: config.LOG_LEVEL,
  customLevels,
  useOnlyCustomLevels: false,
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
      service: 'yallacatch-backend',
      version: process.env.npm_package_version || '1.0.0',
    }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'authorization',
      'cookie',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
};

// Transport configuration
const transports: pino.TransportTargetOptions[] = [];

// Console transport for development
if (isDevelopment) {
  transports.push({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname,service,version',
      messageFormat: '{service}[{pid}] {msg}',
      errorLikeObjectKeys: ['err', 'error'],
    },
  });
}

// File transport for production
if (isProduction && config.LOG_FILE_ENABLED) {
  transports.push({
    target: 'pino/file',
    options: {
      destination: config.LOG_FILE_PATH,
      mkdir: true,
    },
  });

  // Rotating file transport
  transports.push({
    target: 'pino-roll',
    options: {
      file: config.LOG_FILE_PATH,
      frequency: 'daily',
      size: config.LOG_MAX_SIZE,
      limit: {
        count: config.LOG_MAX_FILES,
      },
    },
  });
}

// Define custom logger type with custom levels
type CustomLogger = pino.Logger & {
  audit: pino.LogFn;
  security: pino.LogFn;
  performance: pino.LogFn;
};

// Create logger instance
export const logger: CustomLogger = pino(
  pinoConfig,
  transports.length > 0 ? pino.transport({ targets: transports }) : undefined
) as CustomLogger;

// Custom logger methods
export const auditLogger: CustomLogger = logger.child({ component: 'audit' }) as CustomLogger;
export const securityLogger: CustomLogger = logger.child({ component: 'security' }) as CustomLogger;
export const performanceLogger: CustomLogger = logger.child({ component: 'performance' }) as CustomLogger;
export const gameLogger: CustomLogger = logger.child({ component: 'game' }) as CustomLogger;
export const adminLogger: CustomLogger = logger.child({ component: 'admin' }) as CustomLogger;

/**
 * Log audit events
 */
export const logAudit = (
  action: string,
  userId: string,
  details: Record<string, any> = {},
  metadata: Record<string, any> = {}
) => {
  auditLogger.audit({
    action,
    userId,
    details,
    metadata,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Log security events
 */
export const logSecurity = (
  event: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  details: Record<string, any> = {},
  metadata: Record<string, any> = {}
) => {
  securityLogger.security({
    event,
    severity,
    details,
    metadata,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Log performance metrics
 */
export const logPerformance = (
  operation: string,
  duration: number,
  details: Record<string, any> = {},
  metadata: Record<string, any> = {}
) => {
  performanceLogger.performance({
    operation,
    duration,
    details,
    metadata,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Log game events
 */
export const logGame = (
  event: string,
  userId: string,
  details: Record<string, any> = {},
  metadata: Record<string, any> = {}
) => {
  gameLogger.info({
    event,
    userId,
    details,
    metadata,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Log admin actions
 */
export const logAdmin = (
  action: string,
  adminId: string,
  targetId?: string,
  details: Record<string, any> = {},
  metadata: Record<string, any> = {}
) => {
  adminLogger.info({
    action,
    adminId,
    targetId,
    details,
    metadata,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Request logger middleware
 */
export const createRequestLogger = () => {
  return pino({
    ...pinoConfig,
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        headers: {
          host: req.headers.host,
          'user-agent': req.headers['user-agent'],
          'content-type': req.headers['content-type'],
          'content-length': req.headers['content-length'],
          'x-forwarded-for': req.headers['x-forwarded-for'],
          'x-real-ip': req.headers['x-real-ip'],
        },
        remoteAddress: req.connection?.remoteAddress,
        remotePort: req.connection?.remotePort,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
        headers: {
          'content-type': res.getHeader('content-type'),
          'content-length': res.getHeader('content-length'),
          'cache-control': res.getHeader('cache-control'),
        },
      }),
      err: pino.stdSerializers.err,
    },
  });
};

/**
 * Error logger with stack trace
 */
export const logError = (
  error: Error,
  context: string,
  metadata: Record<string, any> = {}
) => {
  logger.error({
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    context,
    metadata,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Database operation logger
 */
export const logDatabase = (
  operation: string,
  collection: string,
  duration: number,
  details: Record<string, any> = {}
) => {
  logger.debug({
    type: 'database',
    operation,
    collection,
    duration,
    details,
    timestamp: new Date().toISOString(),
  });
};

/**
 * API request/response logger
 */
export const logAPI = (
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  userId?: string,
  details: Record<string, any> = {}
) => {
  logger.info({
    type: 'api',
    method,
    path,
    statusCode,
    duration,
    userId,
    details,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Cache operation logger
 */
export const logCache = (
  operation: 'hit' | 'miss' | 'set' | 'del',
  key: string,
  duration?: number,
  details: Record<string, any> = {}
) => {
  logger.debug({
    type: 'cache',
    operation,
    key,
    duration,
    details,
    timestamp: new Date().toISOString(),
  });
};

/**
 * External service logger
 */
export const logExternalService = (
  service: string,
  operation: string,
  success: boolean,
  duration: number,
  details: Record<string, any> = {}
) => {
  logger.info({
    type: 'external_service',
    service,
    operation,
    success,
    duration,
    details,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Structured logging for business events
 */
export const logBusinessEvent = (
  event: string,
  category: string,
  userId?: string,
  details: Record<string, any> = {},
  metadata: Record<string, any> = {}
) => {
  logger.info({
    type: 'business_event',
    event,
    category,
    userId,
    details,
    metadata,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Log startup information
 */
export const logStartup = (details: Record<string, any> = {}) => {
  logger.info({
    type: 'startup',
    message: 'YallaCatch! Backend starting up',
    environment: config.NODE_ENV,
    port: config.PORT,
    version: process.env.npm_package_version || '1.0.0',
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    ...details,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Log shutdown information
 */
export const logShutdown = (reason: string, details: Record<string, any> = {}) => {
  logger.info({
    type: 'shutdown',
    message: 'YallaCatch! Backend shutting down',
    reason,
    ...details,
    timestamp: new Date().toISOString(),
  });
};

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.fatal({
    type: 'uncaught_exception',
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    timestamp: new Date().toISOString(),
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({
    type: 'unhandled_rejection',
    reason,
    promise,
    timestamp: new Date().toISOString(),
  });
});

// Log process warnings
process.on('warning', (warning) => {
  logger.warn({
    type: 'process_warning',
    warning: {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
    },
    timestamp: new Date().toISOString(),
  });
});

export default logger;
