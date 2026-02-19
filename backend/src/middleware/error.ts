import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { typedLogger } from '@/lib/typed-logger';
import { config } from '@/config';
import { ZodError, ZodIssue } from 'zod';

interface EnhancedFastifyError extends FastifyError {
  retryAfter?: number;
}

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
      if (issue.type === 'string') {
        fieldMessage = `${path} must be at least ${issue.minimum} characters`;
      } else if (issue.type === 'number') {
        fieldMessage = `${path} must be at least ${issue.minimum}`;
      } else if (issue.type === 'array') {
        fieldMessage = `${path} must have at least ${issue.minimum} items`;
      }
    } else if (issue.code === 'too_big') {
      if (issue.type === 'string') {
        fieldMessage = `${path} must be at most ${issue.maximum} characters`;
      } else if (issue.type === 'number') {
        fieldMessage = `${path} must be at most ${issue.maximum}`;
      }
    } else if (issue.code === 'invalid_string') {
      if (typeof issue.validation === 'string') {
        if (issue.validation === 'email') {
          fieldMessage = `${path} must be a valid email address`;
        } else if (issue.validation === 'url') {
          fieldMessage = `${path} must be a valid URL (e.g., https://example.com)`;
        } else if (issue.validation === 'datetime') {
          fieldMessage = `${path} must be a valid ISO 8601 datetime (e.g., 2024-01-15T10:30:00Z)`;
        }
      }
    } else if (issue.code === 'invalid_enum_value') {
      const options = issue.options.join(', ');
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
  error: FastifyError | Error | ZodError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Use a type guard or safe access for the enhanced properties
  const statusCode = (error as EnhancedFastifyError).statusCode || 500;
  const errorCode = (error as EnhancedFastifyError).code || 'UNKNOWN_ERROR';
  const errorMessage = error.message;

  // Log error
  typedLogger.error('Request error', {
    error: errorMessage,
    stack: error.stack,
    url: request.url,
    method: request.method,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    userId: request.user?.sub,
    statusCode: statusCode,
  });

  // Handle Zod validation errors with meaningful messages
  if (error instanceof ZodError || isZodErrorLike(error)) {
    const zodError = error instanceof ZodError ? error : new ZodError((error as unknown as { issues: ZodIssue[] }).issues);
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
  if ((error as EnhancedFastifyError).validation) {
    return reply.code(400).send({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: config.NODE_ENV === 'development' ? (error as EnhancedFastifyError).validation : undefined,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle rate limit errors
  if (statusCode === 429) {
    return reply.code(429).send({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please wait before trying again.',
      retryAfter: (error as EnhancedFastifyError).retryAfter || 60,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle authentication errors
  if (statusCode === 401) {
    return reply.code(401).send({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentication required. Please log in to access this resource.',
      timestamp: new Date().toISOString(),
    });
  }

  // Handle authorization errors
  if (statusCode === 403) {
    return reply.code(403).send({
      success: false,
      error: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.',
      timestamp: new Date().toISOString(),
    });
  }

  // Handle not found errors
  if (statusCode === 404) {
    return reply.code(404).send({
      success: false,
      error: 'NOT_FOUND',
      message: errorMessage || 'The requested resource was not found.',
      timestamp: new Date().toISOString(),
    });
  }

  // Generic error response
  const isDevelopment = config.NODE_ENV === 'development';

  return reply.code(statusCode).send({
    success: false,
    error: statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : errorCode,
    message: statusCode === 500
      ? 'An unexpected error occurred. Please try again later.'
      : errorMessage,
    ...(isDevelopment && { stack: error.stack }),
    timestamp: new Date().toISOString(),
  });
}

function isZodErrorLike(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'issues' in error && Array.isArray((error as { issues: unknown }).issues);
}
