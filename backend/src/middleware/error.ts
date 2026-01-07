import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';
import { config } from '@/config';
import { ZodError } from 'zod';

/**
 * Format Zod validation errors into meaningful messages for the frontend
 */
function formatZodErrors(error: ZodError): { message: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const messages: string[] = [];

  for (const issue of error.issues) {
    const path = issue.path.join('.');
    let fieldMessage = issue.message;

    // Add more context based on error code
    if (issue.code === 'invalid_type') {
      fieldMessage = `${path} must be ${issue.expected}, received ${issue.received}`;
    } else if (issue.code === 'too_small') {
      if ((issue as any).type === 'string') {
        fieldMessage = `${path} must be at least ${(issue as any).minimum} characters`;
      } else if ((issue as any).type === 'number') {
        fieldMessage = `${path} must be at least ${(issue as any).minimum}`;
      } else if ((issue as any).type === 'array') {
        fieldMessage = `${path} must have at least ${(issue as any).minimum} items`;
      }
    } else if (issue.code === 'too_big') {
      if ((issue as any).type === 'string') {
        fieldMessage = `${path} must be at most ${(issue as any).maximum} characters`;
      } else if ((issue as any).type === 'number') {
        fieldMessage = `${path} must be at most ${(issue as any).maximum}`;
      }
    } else if (issue.code === 'invalid_string') {
      if ((issue as any).validation === 'email') {
        fieldMessage = `${path} must be a valid email address`;
      } else if ((issue as any).validation === 'url') {
        fieldMessage = `${path} must be a valid URL (e.g., https://example.com)`;
      } else if ((issue as any).validation === 'datetime') {
        fieldMessage = `${path} must be a valid ISO 8601 datetime (e.g., 2024-01-15T10:30:00Z)`;
      }
    } else if (issue.code === 'invalid_enum_value') {
      const options = (issue as any).options?.join(', ') || 'valid options';
      fieldMessage = `${path} must be one of: ${options}`;
    }

    fields[path || 'value'] = fieldMessage;
    messages.push(fieldMessage);
  }

  return {
    message: messages.join('; '),
    fields,
  };
}

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Log error
  typedLogger.error('Request error', {
    error: (error as any).message,
    stack: error.stack,
    url: request.url,
    method: request.method,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    userId: (request as any).user?.sub,
    statusCode: error.statusCode,
  });

  // Handle Zod validation errors with meaningful messages
  if (error instanceof ZodError || (error as any).issues) {
    const zodError = error instanceof ZodError ? error : new ZodError((error as any).issues || []);
    const { message, fields } = formatZodErrors(zodError);
    return reply.code(400).send({
      success: false,
      error: 'VALIDATION_ERROR',
      message: `Validation failed: ${message}`,
      fields, // Field-specific error messages for frontend form handling
      timestamp: new Date().toISOString(),
    });
  }

  // Handle Fastify schema validation errors
  if (error.validation) {
    return reply.code(400).send({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: config.NODE_ENV === 'development' ? error.validation : undefined,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle rate limit errors
  if (error.statusCode === 429) {
    return reply.code(429).send({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please wait before trying again.',
      retryAfter: (error as any).retryAfter || 60,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle authentication errors
  if (error.statusCode === 401) {
    return reply.code(401).send({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required. Please log in to access this resource.',
      timestamp: new Date().toISOString(),
    });
  }

  // Handle authorization errors
  if (error.statusCode === 403) {
    return reply.code(403).send({
      success: false,
      error: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.',
      timestamp: new Date().toISOString(),
    });
  }

  // Handle not found errors
  if (error.statusCode === 404) {
    return reply.code(404).send({
      success: false,
      error: 'NOT_FOUND',
      message: (error as any).message || 'The requested resource was not found.',
      timestamp: new Date().toISOString(),
    });
  }

  // Generic error response
  const statusCode = error.statusCode || 500;
  const isDevelopment = config.NODE_ENV === 'development';
  
  return reply.code(statusCode).send({
    success: false,
    error: statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : error.code || 'UNKNOWN_ERROR',
    message: statusCode === 500 
      ? 'An unexpected error occurred. Please try again later.' 
      : (error as any).message,
    ...(isDevelopment && { stack: error.stack }),
    timestamp: new Date().toISOString(),
  });
}
