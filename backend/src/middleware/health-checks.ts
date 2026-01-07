import { FastifyRequest, FastifyReply } from 'fastify';
import mongoose from 'mongoose';
import { redisClient } from '@/config/redis';
import { logger } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';
import { config } from '@/config';

/**
 * Health check status interface
 */
interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      responseTime?: number;
      details?: any;
    };
  };
}

/**
 * Individual health check interface
 */
interface HealthCheck {
  name: string;
  check: () => Promise<{ status: 'pass' | 'fail' | 'warn'; message?: string; details?: any }>;
  timeout?: number;
  critical?: boolean;
}

/**
 * Health check registry
 */
class HealthCheckRegistry {
  private checks = new Map<string, HealthCheck>();

  register(check: HealthCheck): void {
    this.checks.set(check.name, check);
  }

  async runAll(): Promise<HealthStatus['checks']> {
    const results: HealthStatus['checks'] = {};

    for (const [name, check] of this.checks.entries()) {
      const startTime = Date.now();
      
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Health check timeout')), check.timeout || 5000);
        });

        const checkPromise = check.check();
        const result = await Promise.race([checkPromise, timeoutPromise]);
        
        results[name] = {
          ...result,
          responseTime: Date.now() - startTime,
        };
      } catch (error) {
        results[name] = {
          status: 'fail',
          message: (error as any).message,
          responseTime: Date.now() - startTime,
        };
      }
    }

    return results;
  }

  async runCheck(name: string): Promise<HealthStatus['checks'][string] | null> {
    const check = this.checks.get(name);
    if (!check) return null;

    const startTime = Date.now();
    
    try {
      const result = await check.check();
      return {
        ...result,
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'fail',
        message: (error as any).message,
        responseTime: Date.now() - startTime,
      };
    }
  }
}

// Create health check registry
export const healthRegistry = new HealthCheckRegistry();

/**
 * MongoDB health check
 */
healthRegistry.register({
  name: 'mongodb',
  timeout: 5000,
  critical: true,
  check: async () => {
    try {
      const state = mongoose.connection.readyState;
      
      switch (state) {
        case 0:
          return { status: 'fail', message: 'MongoDB disconnected' };
        case 1:
          // Test with a simple operation
          await mongoose.connection.db.admin().ping();
          return { 
            status: 'pass', 
            message: 'MongoDB connected',
            details: {
              readyState: 'connected',
              host: mongoose.connection.host,
              port: mongoose.connection.port,
              name: mongoose.connection.name,
            }
          };
        case 2:
          return { status: 'warn', message: 'MongoDB connecting' };
        case 3:
          return { status: 'warn', message: 'MongoDB disconnecting' };
        default:
          return { status: 'fail', message: 'MongoDB unknown state' };
      }
    } catch (error) {
      return { 
        status: 'fail', 
        message: `MongoDB error: ${(error as any).message}`,
        details: { error: (error as any).message }
      };
    }
  },
});

/**
 * Redis health check
 */
healthRegistry.register({
  name: 'redis',
  timeout: 5000,
  critical: true,
  check: async () => {
    try {
      if (!redisClient) {
        return { status: 'fail', message: 'Redis client not initialized' };
      }

      const status = redisClient.status;
      
      if (status !== 'ready') {
        return { 
          status: 'fail', 
          message: `Redis not ready: ${status}`,
          details: { status }
        };
      }

      // Test with a ping
      const pong = await redisClient.ping();
      
      if (pong !== 'PONG') {
        return { status: 'fail', message: 'Redis ping failed' };
      }

      return { 
        status: 'pass', 
        message: 'Redis connected',
        details: {
          status,
          host: redisClient.options.host,
          port: redisClient.options.port,
          db: redisClient.options.db,
        }
      };
    } catch (error) {
      return { 
        status: 'fail', 
        message: `Redis error: ${(error as any).message}`,
        details: { error: (error as any).message }
      };
    }
  },
});

/**
 * Memory usage health check
 */
healthRegistry.register({
  name: 'memory',
  timeout: 1000,
  critical: false,
  check: async () => {
    try {
      const usage = process.memoryUsage();
      const totalMB = Math.round(usage.rss / 1024 / 1024);
      const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
      
      // Warning if using more than 1GB
      const warningThreshold = 1024; // MB
      const criticalThreshold = 2048; // MB
      
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Memory usage normal';
      
      if (totalMB > criticalThreshold) {
        status = 'fail';
        message = `Memory usage critical: ${totalMB}MB`;
      } else if (totalMB > warningThreshold) {
        status = 'warn';
        message = `Memory usage high: ${totalMB}MB`;
      }

      return {
        status,
        message,
        details: {
          rss: `${totalMB}MB`,
          heapUsed: `${heapUsedMB}MB`,
          heapTotal: `${heapTotalMB}MB`,
          external: `${Math.round(usage.external / 1024 / 1024)}MB`,
        }
      };
    } catch (error) {
      return { 
        status: 'fail', 
        message: `Memory check error: ${(error as any).message}` 
      };
    }
  },
});

/**
 * Disk space health check
 */
healthRegistry.register({
  name: 'disk',
  timeout: 2000,
  critical: false,
  check: async () => {
    try {
      const fs = await import('fs/promises');
      const stats = await fs.statfs('./');
      
      const totalBytes = stats.bavail * stats.bsize;
      const totalGB = Math.round(totalBytes / 1024 / 1024 / 1024);
      
      // Warning if less than 1GB free
      const warningThreshold = 1; // GB
      const criticalThreshold = 0.5; // GB
      
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      let message = 'Disk space sufficient';
      
      if (totalGB < criticalThreshold) {
        status = 'fail';
        message = `Disk space critical: ${totalGB}GB free`;
      } else if (totalGB < warningThreshold) {
        status = 'warn';
        message = `Disk space low: ${totalGB}GB free`;
      }

      return {
        status,
        message,
        details: {
          freeSpace: `${totalGB}GB`,
          blockSize: stats.bsize,
          availableBlocks: stats.bavail,
        }
      };
    } catch (error) {
      return { 
        status: 'warn', 
        message: `Disk check error: ${(error as any).message}` 
      };
    }
  },
});

/**
 * External services health check (example)
 */
healthRegistry.register({
  name: 'external_services',
  timeout: 10000,
  critical: false,
  check: async () => {
    try {
      const checks = [];
      
      // Check AWS S3 (if used)
      if (config.AWS_S3_BUCKET) {
        try {
          const s3Module = await import('@aws-sdk/client-s3').catch(() => null);
          if (!s3Module) {
            checks.push({ service: 's3', status: 'warn', error: 'client_not_installed' });
          } else {
            const { S3Client, HeadBucketCommand } = s3Module as any;
            const s3Client = new S3Client({ region: config.AWS_REGION });
            await s3Client.send(new HeadBucketCommand({ Bucket: config.AWS_S3_BUCKET }));
            checks.push({ service: 's3', status: 'pass' });
          }
        } catch (error) {
          checks.push({ service: 's3', status: 'fail', error: (error as any).message });
        }
      }

      const failedServices = checks.filter(c => c.status === 'fail');
      
      if (failedServices.length === 0) {
        return {
          status: 'pass',
          message: 'All external services available',
          details: { services: checks }
        };
      } else if (failedServices.length < checks.length) {
        return {
          status: 'warn',
          message: `Some external services unavailable: ${failedServices.map(s => s.service).join(', ')}`,
          details: { services: checks }
        };
      } else {
        return {
          status: 'fail',
          message: 'All external services unavailable',
          details: { services: checks }
        };
      }
    } catch (error) {
      return { 
        status: 'warn', 
        message: `External services check error: ${(error as any).message}` 
      };
    }
  },
});

/**
 * Basic health check endpoint
 */
export async function healthCheck(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const status: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: config.NODE_ENV,
    uptime: Math.floor(process.uptime()),
    checks: {},
  };

  reply.send(status);
}

/**
 * Detailed readiness check
 */
export async function readinessCheck(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const checks = await healthRegistry.runAll();
    
    // Determine overall status
    const criticalChecks = ['mongodb', 'redis'];
    const failedCritical = criticalChecks.some(name => 
      checks[name] && checks[name].status === 'fail'
    );
    
    const hasFailures = Object.values(checks).some(check => check.status === 'fail');
    const hasWarnings = Object.values(checks).some(check => check.status === 'warn');
    
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded';
    let statusCode: number;
    
    if (failedCritical) {
      overallStatus = 'unhealthy';
      statusCode = 503; // Service Unavailable
    } else if (hasFailures) {
      overallStatus = 'degraded';
      statusCode = 200; // OK but degraded
    } else if (hasWarnings) {
      overallStatus = 'degraded';
      statusCode = 200;
    } else {
      overallStatus = 'healthy';
      statusCode = 200;
    }

    const status: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.NODE_ENV,
      uptime: Math.floor(process.uptime()),
      checks,
    };

    reply.code(statusCode).send(status);
  } catch (error) {
    typedLogger.error('Readiness check error', { error: (error as any).message });
    
    reply.code(503).send({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.NODE_ENV,
      uptime: Math.floor(process.uptime()),
      error: 'Health check failed',
      checks: {},
    });
  }
}

/**
 * Liveness check (simpler, just checks if the process is running)
 */
export async function livenessCheck(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  reply.send({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    pid: process.pid,
  });
}

/**
 * Individual health check endpoint
 */
export async function individualHealthCheck(
  request: FastifyRequest<{ Params: { checkName: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { checkName } = request.params;
  
  const result = await healthRegistry.runCheck(checkName);
  
  if (!result) {
    return reply.code(404).send({
      error: 'Health check not found',
      availableChecks: Array.from(healthRegistry['checks'].keys()),
    });
  }

  const statusCode = result.status === 'fail' ? 503 : 200;
  reply.code(statusCode).send({
    check: checkName,
    ...result,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Health check plugin for Fastify
 */
export default async function healthPlugin(fastify: any) {
  // Register health check routes
  fastify.get('/health', healthCheck);
  fastify.get('/health/ready', readinessCheck);
  fastify.get('/health/live', livenessCheck);
  fastify.get('/health/check/:checkName', individualHealthCheck);
  
  // Register health registry as decorator
  fastify.decorate('healthRegistry', healthRegistry);
}
