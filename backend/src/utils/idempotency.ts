import { redisClient } from '@/config/redis';
import { typedLogger } from '@/lib/typed-logger';
import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

const IDEMPOTENCY_PREFIX = 'idempotency:';
const DEFAULT_TTL = 24 * 60 * 60; // 24 hours in seconds

// Extend FastifyRequest to include idempotencyKey
declare module 'fastify' {
  interface FastifyRequest {
    idempotencyKey?: string;
  }
}

/**
 * Check if an idempotency key has been used before
 */
export async function checkIdempotency(key: string): Promise<unknown | null> {
  try {
    const redisKey = `${IDEMPOTENCY_PREFIX}${key}`;
    const result = await redisClient.get(redisKey);

    if (result) {
      typedLogger.info('Idempotency key found', { key });
      return JSON.parse(result);
    }

    return null;
  } catch (error) {
    typedLogger.error('Check idempotency error', {
      error: error instanceof Error ? error.message : String(error),
      key,
    });
    return null;
  }
}

/**
 * Store result for an idempotency key
 */
export async function setIdempotency(
  key: string,
  result: unknown,
  ttlSeconds: number = DEFAULT_TTL
): Promise<void> {
  try {
    const redisKey = `${IDEMPOTENCY_PREFIX}${key}`;
    await redisClient.setex(redisKey, ttlSeconds, JSON.stringify(result));

    typedLogger.debug('Idempotency key stored', { key, ttl: ttlSeconds });
  } catch (error) {
    typedLogger.error('Set idempotency error', {
      error: error instanceof Error ? error.message : String(error),
      key,
    });
  }
}

/**
 * Remove an idempotency key
 */
export async function removeIdempotency(key: string): Promise<void> {
  try {
    const redisKey = `${IDEMPOTENCY_PREFIX}${key}`;
    await redisClient.del(redisKey);

    typedLogger.debug('Idempotency key removed', { key });
  } catch (error) {
    typedLogger.error('Remove idempotency error', {
      error: error instanceof Error ? error.message : String(error),
      key,
    });
  }
}

/**
 * Generate a unique idempotency key
 */
export function generateIdempotencyKey(
  userId: string,
  operation: string,
  data?: unknown
): string {
  const payload = data ? JSON.stringify(data) : '';
  const combined = `${userId}:${operation}:${payload}`;
  const hash = crypto.createHash('sha256').update(combined).digest('hex').slice(0, 24);
  return `${operation}_${hash}`;
}

/**
 * Middleware to handle idempotency for Fastify routes
 */
export function idempotencyMiddleware(operation: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const headers = request.headers;
    const body = request.body as Record<string, unknown> | undefined;

    // Safely access idempotency key from headers or body
    const headerKey = headers['idempotency-key'];
    const bodyKey = body?.idempotencyKey;

    const idempotencyKey = (Array.isArray(headerKey) ? headerKey[0] : headerKey) ||
      (typeof bodyKey === 'string' ? bodyKey : undefined);

    if (!idempotencyKey) {
      reply.code(400).send({
        success: false,
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency key is required for this operation',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const existingResult = await checkIdempotency(idempotencyKey);
    if (existingResult) {
      reply.send(existingResult);
      return;
    }

    // Store the idempotency key in request for later use
    request.idempotencyKey = idempotencyKey;
  };
}
