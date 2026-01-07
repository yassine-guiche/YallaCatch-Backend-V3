import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';
import { config } from '@/config';

/**
 * Health check status
 */
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: HealthCheck[];
}

/**
 * Individual health check
 */
interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  duration: number;
  message?: string;
  details?: any;
}

/**
 * Health check function type
 */
type HealthCheckFunction = () => Promise<HealthCheck>;

/**
 * Registered health checks
 */
const healthChecks = new Map<string, HealthCheckFunction>();

/**
 * Register a health check
 */
export function registerHealthCheck(name: string, checkFn: HealthCheckFunction): void {
  healthChecks.set(name, checkFn);
  typedLogger.debug(`Health check registered: ${name}`);
}

/**
 * Basic health check endpoint
 */
export async function healthCheck(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = Date.now();
  
  try {
    const status: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.NODE_ENV,
      checks: [],
    };
    
    // Run all health checks
    const checkPromises = Array.from(healthChecks.entries()).map(async ([name, checkFn]) => {
      const checkStart = Date.now();
      try {
        const result = await Promise.race([
          checkFn(),
          new Promise<HealthCheck>((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          ),
        ]);
        
        return {
          ...result,
          name,
          duration: Date.now() - checkStart,
        };
      } catch (error) {
        return {
          name,
          status: 'fail' as const,
          duration: Date.now() - checkStart,
          message: (error as any).message,
        };
      }
    });
    
    status.checks = await Promise.all(checkPromises);
    
    // Determine overall status
    const hasFailures = status.checks.some(check => check.status === 'fail');
    const hasWarnings = status.checks.some(check => check.status === 'warn');
    
    if (hasFailures) {
      status.status = 'unhealthy';
      reply.code(503);
    } else if (hasWarnings) {
      status.status = 'degraded';
      reply.code(200);
    } else {
      status.status = 'healthy';
      reply.code(200);
    }
    
    // Add response time header
    reply.header('X-Response-Time', `${Date.now() - startTime}ms`);
    
    // Cache control for health checks
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');
    
    reply.send(status);
    
  } catch (error) {
    typedLogger.error('Health check failed', { error: (error as any).message });
    
    reply.code(503).send({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.NODE_ENV,
      error: (error as any).message,
      checks: [],
    });
  }
}

/**
 * Liveness probe (basic server health)
 */
export async function livenessProbe(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Simple liveness check - just verify the server is running
  reply.code(200).send({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}

/**
 * Readiness probe (dependencies health)
 */
export async function readinessProbe(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Check critical dependencies only
    const criticalChecks = ['database', 'redis'];
    const checks: HealthCheck[] = [];
    
    for (const checkName of criticalChecks) {
      const checkFn = healthChecks.get(checkName);
      if (checkFn) {
        const checkStart = Date.now();
        try {
          const result = await Promise.race([
            checkFn(),
            new Promise<HealthCheck>((_, reject) => 
              setTimeout(() => reject(new Error('Readiness check timeout')), 3000)
            ),
          ]);
          
          checks.push({
            ...result,
            name: checkName,
            duration: Date.now() - checkStart,
          });
        } catch (error) {
          checks.push({
            name: checkName,
            status: 'fail',
            duration: Date.now() - checkStart,
            message: (error as any).message,
          });
        }
      }
    }
    
    const hasFailures = checks.some(check => check.status === 'fail');
    
    if (hasFailures) {
      reply.code(503).send({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks,
      });
    } else {
      reply.code(200).send({
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks,
      });
    }
    
  } catch (error) {
    typedLogger.error('Readiness probe failed', { error: (error as any).message });
    
    reply.code(503).send({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: (error as any).message,
    });
  }
}

/**
 * Database health check
 */
export async function databaseHealthCheck(): Promise<HealthCheck> {
  try {
    const mongooseModule = await import('mongoose');
    const mongoose = mongooseModule.default;

    if (mongoose.connection.readyState !== 1) {
      return {
        name: 'database',
        status: 'fail',
        duration: 0,
        message: 'Database not connected',
      };
    }
    
    // Test database with a simple query
    const startTime = Date.now();
    await mongoose.connection.db.admin().ping();
    const duration = Date.now() - startTime;
    
    return {
      name: 'database',
      status: 'pass',
      duration,
      message: 'Database connection healthy',
      details: {
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        name: mongoose.connection.name,
      },
    };
    
  } catch (error) {
    return {
      name: 'database',
      status: 'fail',
      duration: 0,
      message: `Database health check failed: ${(error as any).message}`,
    };
  }
}

/**
 * Redis health check
 */
export async function redisHealthCheck(): Promise<HealthCheck> {
  try {
    const { redisClient } = await import('@/config/redis');

    if (!redisClient) {
      return {
        name: 'redis',
        status: 'fail',
        duration: 0,
        message: 'Redis client not available',
      };
    }

    const startTime = Date.now();
    const pong = await redisClient.ping();
    const duration = Date.now() - startTime;

    if (pong !== 'PONG') {
      return {
        name: 'redis',
        status: 'fail',
        duration,
        message: 'Redis ping failed',
      };
    }

    return {
      name: 'redis',
      status: 'pass',
      duration,
      message: 'Redis connection healthy',
      details: {
        status: redisClient.status,
      },
    };

  } catch (error) {
    return {
      name: 'redis',
      status: 'fail',
      duration: 0,
      message: `Redis health check failed: ${(error as any).message}`,
    };
  }
}

/**
 * Memory health check
 */
export async function memoryHealthCheck(): Promise<HealthCheck> {
  try {
    const memUsage = process.memoryUsage();
    const totalMemory = memUsage.heapTotal;
    const usedMemory = memUsage.heapUsed;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;
    
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = 'Memory usage normal';
    
    if (memoryUsagePercent > 90) {
      status = 'fail';
      message = 'Memory usage critical';
    } else if (memoryUsagePercent > 80) {
      status = 'warn';
      message = 'Memory usage high';
    }
    
    return {
      name: 'memory',
      status,
      duration: 0,
      message,
      details: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        usagePercent: Math.round(memoryUsagePercent * 100) / 100,
      },
    };
    
  } catch (error) {
    return {
      name: 'memory',
      status: 'fail',
      duration: 0,
      message: `Memory health check failed: ${(error as any).message}`,
    };
  }
}

/**
 * Disk space health check
 */
export async function diskHealthCheck(): Promise<HealthCheck> {
  try {
    const fs = await import('fs');
    const stats = await fs.promises.statfs(process.cwd());
    
    const totalSpace = stats.blocks * stats.bsize;
    const freeSpace = stats.bavail * stats.bsize;
    const usedSpace = totalSpace - freeSpace;
    const usagePercent = (usedSpace / totalSpace) * 100;
    
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    let message = 'Disk space normal';
    
    if (usagePercent > 95) {
      status = 'fail';
      message = 'Disk space critical';
    } else if (usagePercent > 85) {
      status = 'warn';
      message = 'Disk space low';
    }
    
    return {
      name: 'disk',
      status,
      duration: 0,
      message,
      details: {
        totalSpace,
        freeSpace,
        usedSpace,
        usagePercent: Math.round(usagePercent * 100) / 100,
      },
    };
    
  } catch (error) {
    return {
      name: 'disk',
      status: 'fail',
      duration: 0,
      message: `Disk health check failed: ${(error as any).message}`,
    };
  }
}

/**
 * External service health check
 */
export async function externalServiceHealthCheck(): Promise<HealthCheck> {
  try {
    // Check external dependencies like AWS, etc.
    const checks = [];
    
    // AWS S3 check (if configured)
    if (config.AWS_S3_BUCKET) {
      try {
        // Simple AWS credential check
        const s3Module = await import('@aws-sdk/client-s3').catch(() => null);
        if (s3Module) {
          const { S3Client, HeadBucketCommand } = s3Module as any;
          const s3Client = new S3Client({ region: config.AWS_REGION });

          const startTime = Date.now();
          await s3Client.send(new HeadBucketCommand({ Bucket: config.AWS_S3_BUCKET }));

          checks.push({
            service: 'aws_s3',
            status: 'pass',
            duration: Date.now() - startTime,
          });
        } else {
          checks.push({
            service: 'aws_s3',
            status: 'warn',
            error: 'client_not_installed',
          });
        }
      } catch (error) {
        checks.push({
          service: 'aws_s3',
          status: 'fail',
          error: (error as any).message,
        });
      }
    }

    
    const hasFailures = checks.some(check => check.status === 'fail');
    
    return {
      name: 'external_services',
      status: hasFailures ? 'warn' : 'pass',
      duration: 0,
      message: hasFailures ? 'Some external services unavailable' : 'External services healthy',
      details: { services: checks },
    };
    
  } catch (error) {
    return {
      name: 'external_services',
      status: 'fail',
      duration: 0,
      message: `External services health check failed: ${(error as any).message}`,
    };
  }
}

/**
 * Initialize default health checks
 */
export function initializeHealthChecks(): void {
  registerHealthCheck('database', databaseHealthCheck);
  registerHealthCheck('redis', redisHealthCheck);
  registerHealthCheck('memory', memoryHealthCheck);
  registerHealthCheck('disk', diskHealthCheck);
  registerHealthCheck('external_services', externalServiceHealthCheck);
  
  typedLogger.info('Health checks initialized');
}

/**
 * Get health check summary
 */
export async function getHealthSummary(): Promise<any> {
  const checks = await Promise.all(
    Array.from(healthChecks.entries()).map(async ([name, checkFn]) => {
      try {
        const result = await checkFn();
        return { ...result, name };
      } catch (error) {
        return {
          name,
          status: 'fail',
          duration: 0,
          message: (error as any).message,
        };
      }
    })
  );
  
  const healthy = checks.filter(c => c.status === 'pass').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const failures = checks.filter(c => c.status === 'fail').length;
  
  return {
    timestamp: new Date().toISOString(),
    summary: {
      total: checks.length,
      healthy,
      warnings,
      failures,
    },
    checks,
  };
}
