// External service types
export interface FCMNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
  tokens: string[];
}

export interface EmailData {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: any[];
}

export interface SMSData {
  to: string;
  message: string;
}

// Validation types
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Cache types
export interface CacheOptions {
  ttl?: number;
  tags?: string[];
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tags: string[];
}

// Rate limiting types
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
}

// Metrics types
export interface PerformanceMetrics {
  operation: string;
  duration: number;
  success: boolean;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface BusinessMetrics {
  event: string;
  category: string;
  value?: number;
  userId?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// File upload types
export interface UploadedFile {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  path: string;
}

// Webhook types
export interface WebhookPayload {
  event: string;
  data: Record<string, any>;
  timestamp: string;
  signature: string;
}
