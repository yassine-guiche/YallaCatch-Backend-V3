import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';
import { config } from '@/config';

/**
 * Security middleware for request validation and protection
 */
export async function security(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Add security headers
  addSecurityHeaders(reply);
  
  // Validate request
  validateRequest(request, reply);
  
  // Check for suspicious activity
  await detectSuspiciousActivity(request, reply);
}

/**
 * Add security headers to response
 */
function addSecurityHeaders(reply: FastifyReply): void {
  // Prevent clickjacking
  reply.header('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  reply.header('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  reply.header('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  if (config.NODE_ENV === 'production') {
    reply.header('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; " +
      "font-src 'self'; " +
      "connect-src 'self'; " +
      "frame-ancestors 'none';"
    );
  }
  
  // HSTS (HTTP Strict Transport Security)
  if (config.NODE_ENV === 'production') {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Permissions Policy
  reply.header('Permissions-Policy', 
    'camera=(), microphone=(), geolocation=(self), payment=()'
  );
  
  // Remove server information
  reply.removeHeader('Server');
  reply.removeHeader('X-Powered-By');
}

/**
 * Validate incoming request for security issues
 */
function validateRequest(request: FastifyRequest, reply: FastifyReply): void {
  const url = request.url;
  const userAgent = request.headers['user-agent'] || '';
  const method = request.method;
  
  // Check for common attack patterns in URL
  const suspiciousPatterns = [
    // SQL Injection patterns
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/i,
    // XSS patterns
    /(<script|javascript:|vbscript:|onload=|onerror=)/i,
    // Path traversal
    /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)/i,
    // Command injection
    /(\b(cmd|exec|system|eval|shell_exec)\b)/i,
    // File inclusion
    /(\b(include|require|file_get_contents)\b)/i,
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(url) || pattern.test(userAgent)) {
      typedLogger.warn('Suspicious request detected', {
        ip: request.ip,
        url,
        userAgent,
        method,
        pattern: pattern.source,
      });
      
      reply.code(400).send({
        success: false,
        error: 'Bad Request',
        message: 'Invalid request format',
        type: 'SECURITY_VIOLATION',
      });
      return;
    }
  }
  
  // Check for oversized headers
  const maxHeaderSize = 8192; // 8KB
  const headerSize = JSON.stringify(request.headers).length;
  
  if (headerSize > maxHeaderSize) {
    typedLogger.warn('Oversized headers detected', {
      ip: request.ip,
      headerSize,
      maxHeaderSize,
    });
    
    reply.code(413).send({
      success: false,
      error: 'Request Entity Too Large',
      message: 'Request headers too large',
      type: 'HEADERS_TOO_LARGE',
    });
    return;
  }
  
  // Validate Content-Type for POST/PUT requests
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const contentType = request.headers['content-type'];
    
    if (!contentType) {
      reply.code(400).send({
        success: false,
        error: 'Bad Request',
        message: 'Content-Type header is required',
        type: 'MISSING_CONTENT_TYPE',
      });
      return;
    }
    
    // Allow only specific content types
    const allowedContentTypes = [
      'application/json',
      'multipart/form-data',
      'application/x-www-form-urlencoded',
    ];
    
    const isValidContentType = allowedContentTypes.some(type => 
      contentType.toLowerCase().startsWith(type)
    );
    
    if (!isValidContentType) {
      reply.code(415).send({
        success: false,
        error: 'Unsupported Media Type',
        message: 'Invalid Content-Type',
        type: 'INVALID_CONTENT_TYPE',
      });
      return;
    }
  }
}

/**
 * Detect suspicious activity patterns
 */
async function detectSuspiciousActivity(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const ip = request.ip;
  const userAgent = request.headers['user-agent'] || '';
  const url = request.url;
  
  // Check for bot/crawler patterns
  const botPatterns = [
    /bot|crawler|spider|scraper/i,
    /curl|wget|python|java|go-http/i,
    /postman|insomnia|httpie/i,
  ];
  
  const isBot = botPatterns.some(pattern => pattern.test(userAgent));
  
  if (isBot && !isAllowedBot(userAgent)) {
    typedLogger.warn('Suspicious bot activity detected', {
      ip,
      userAgent,
      url,
    });
    
    // Don't block immediately, but log for monitoring
    typedLogger.warn('Bot detected', { userAgent });
  }
  
  // Check for rapid requests (basic protection)
  await checkRapidRequests(ip, request);
  
  // Validate geographic location if available
  await validateGeographicLocation(request);
}

/**
 * Check if bot is allowed (search engines, monitoring tools, etc.)
 */
function isAllowedBot(userAgent: string): boolean {
  const allowedBots = [
    /googlebot/i,
    /bingbot/i,
    /slurp/i, // Yahoo
    /duckduckbot/i,
    /uptimerobot/i,
    /pingdom/i,
    /newrelic/i,
  ];
  
  return allowedBots.some(pattern => pattern.test(userAgent));
}

/**
 * Check for rapid requests from same IP
 */
async function checkRapidRequests(ip: string, request: FastifyRequest): Promise<void> {
  // This would typically use Redis to track request counts
  // For now, we'll just log suspicious patterns
  
  const requestCount = await getRecentRequestCount(ip);
  
  if (requestCount > 100) { // More than 100 requests in recent window
    typedLogger.warn('Rapid requests detected', {
      ip,
      requestCount,
      userAgent: request.headers['user-agent'],
    });
    
    // Could implement temporary IP blocking here
    typedLogger.warn('High request rate', { ip, count: requestCount });
  }
}

/**
 * Get recent request count for IP (mock implementation)
 */
async function getRecentRequestCount(ip: string): Promise<number> {
  // In a real implementation, this would query Redis
  // For now, return a mock value
  return Math.floor(Math.random() * 50);
}

/**
 * Validate geographic location for suspicious activity
 */
async function validateGeographicLocation(request: FastifyRequest): Promise<void> {
  // Check for location spoofing indicators
  const xForwardedFor = request.headers['x-forwarded-for'] as string;
  const xRealIp = request.headers['x-real-ip'] as string;
  const cfConnectingIp = request.headers['cf-connecting-ip'] as string;
  
  const ips = [request.ip, xForwardedFor, xRealIp, cfConnectingIp]
    .filter(Boolean)
    .map(ip => ip?.split(',')[0]?.trim())
    .filter(Boolean);
  
  // If multiple different IPs are present, it might indicate proxy/VPN usage
  const uniqueIps = [...new Set(ips)];
  
  if (uniqueIps.length > 2) {
    typedLogger.info('Multiple IP addresses detected', {
      ips: uniqueIps,
      userAgent: request.headers['user-agent'],
    });
    
    // Log for analysis but don't block
    typedLogger.info('Proxy/VPN usage suspected', { ips: uniqueIps });
  }
}

/**
 * Input sanitization middleware
 */
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove potentially dangerous characters
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (input && typeof input === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[sanitizeInput(key)] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
}

/**
 * CSRF protection middleware
 */
export async function csrfProtection(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return;
  }
  
  // Check for CSRF token in header or body
  const csrfToken = 
    request.headers['x-csrf-token'] as string ||
    request.headers['x-xsrf-token'] as string ||
    (request.body as any)?.csrfToken;
  
  if (!csrfToken) {
    reply.code(403).send({
      success: false,
      error: 'Forbidden',
      message: 'CSRF token missing',
      type: 'CSRF_TOKEN_MISSING',
    });
    return;
  }
  
  // Validate CSRF token (simplified - in production use crypto-secure validation)
  const expectedToken = generateCSRFToken(request);
  
  if (csrfToken !== expectedToken) {
    typedLogger.warn('Invalid CSRF token', {
      ip: request.ip,
      provided: csrfToken,
      expected: expectedToken,
    });
    
    reply.code(403).send({
      success: false,
      error: 'Forbidden',
      message: 'Invalid CSRF token',
      type: 'CSRF_TOKEN_INVALID',
    });
    return;
  }
}

/**
 * Generate CSRF token (simplified implementation)
 */
function generateCSRFToken(request: FastifyRequest): string {
  // In production, use a more secure implementation with crypto
  const sessionId = request.headers['x-session-id'] as string || 'anonymous';
  return Buffer.from(`${sessionId}:${config.JWT_SECRET}`).toString('base64');
}

/**
 * Request size limiter
 */
export async function requestSizeLimiter(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const contentLength = parseInt(request.headers['content-length'] || '0');
  const maxSize = getMaxRequestSize(request.url);
  
  if (contentLength > maxSize) {
    reply.code(413).send({
      success: false,
      error: 'Request Entity Too Large',
      message: `Request size exceeds limit of ${maxSize} bytes`,
      type: 'REQUEST_TOO_LARGE',
    });
    return;
  }
}

/**
 * Get maximum request size based on endpoint
 */
function getMaxRequestSize(url: string): number {
  // Upload endpoints allow larger requests
  if (url.includes('/upload')) {
    return 50 * 1024 * 1024; // 50MB
  }
  
  // API endpoints have smaller limits
  return 1 * 1024 * 1024; // 1MB
}
