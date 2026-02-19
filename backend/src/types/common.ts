/**
 * Common Type Definitions
 * Replaces generic 'any' types with properly typed definitions
 */

// ============================================================================
// CALLBACK TYPES
// ============================================================================

/**
 * Standard async callback pattern (error, result)
 */
export type AsyncCallback<T = unknown, E extends Error = Error> = (
  error?: E | null,
  result?: T
) => void | Promise<void>;

/**
 * Promise-based callback
 */
export type AsyncPromiseCallback<T = unknown> = (
  error?: Error | null
) => Promise<T>;

/**
 * Simple data transformation callback
 */
export type DataCallback<T = unknown, R = unknown> = (
  data: T
) => R | Promise<R>;

/**
 * Event handler callback
 */
export type EventHandler<T = unknown> = (
  event: T
) => void | Promise<void>;

// ============================================================================
// HTTP/FASTIFY TYPES
// ============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Standard Fastify request handler
 */
export type RequestHandler = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void> | void;

/**
 * Handler with typed params
 */
export type TypedRequestHandler<
  TParams = unknown,
  TQuery = unknown,
  TBody = unknown
> = (
  request: FastifyRequest<{
    Params: TParams;
    Querystring: TQuery;
    Body: TBody;
  }>,
  reply: FastifyReply
) => Promise<void> | void;

/**
 * Handler with return type
 */
export type ResponseHandler<T = unknown> = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<T>;

// ============================================================================
// CACHE TYPES
// ============================================================================

/**
 * Generic cache value
 */
export type CacheValue = unknown;

/**
 * Cache key type
 */
export type CacheKey = string | number;

/**
 * Cache entry with metadata
 */
export interface CacheEntry<T = unknown> {
  key: CacheKey;
  value: T;
  ttl?: number;
  createdAt?: number;
  expiresAt?: number;
}

/**
 * Cache get result
 */
export type CacheGetResult<T = unknown> = T | null | undefined;

/**
 * Cache operation result
 */
export interface CacheResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: Error;
  cached?: boolean;
}

// ============================================================================
// DATA PROCESSING TYPES
// ============================================================================

/**
 * Generic data processor
 */
export type DataProcessor<T = unknown, R = unknown> = (
  data: T
) => R | Promise<R>;

/**
 * Batch processor
 */
export type BatchProcessor<T = unknown, R = unknown> = (
  items: T[]
) => Promise<R[]>;

/**
 * Generic filter function
 */
export type FilterFn<T = unknown> = (item: T) => boolean;

/**
 * Generic mapper function
 */
export type MapFn<T = unknown, R = unknown> = (item: T) => R;

/**
 * Generic reducer function
 */
export type ReduceFn<T = unknown, Acc = unknown> = (
  accumulator: Acc,
  current: T
) => Acc;

// ============================================================================
// RESULT/RESPONSE TYPES
// ============================================================================

/**
 * Standard API response
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp?: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Operation result
 */
export interface OperationResult<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Generic options object
 */
export interface Options {
  [key: string]: unknown;
}

/**
 * Generic settings
 */
export interface Settings<T = unknown> {
  [key: string]: T;
}

// ============================================================================
// LOCATION & GEO TYPES
// ============================================================================

/**
 * Geographic coordinates
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Location data
 */
export interface Location extends Coordinates {
  accuracy?: number;
  altitude?: number;
  timestamp?: number;
}

/**
 * User location with metadata
 */
export interface UserLocation extends Location {
  userId: string;
  lastUpdate?: number;
}

// ============================================================================
// USER & PLAYER TYPES
// ============================================================================

/**
 * Player in proximity
 */
export interface NearbyPlayer {
  userId: string;
  distance: number;
  location?: Location;
  lastSeen?: number;
}

/**
 * User profile data
 */
export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  location?: Location;
  [key: string]: unknown;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Standardized error info
 */
export interface ErrorInfo {
  code: string;
  message: string;
  statusCode?: number;
  details?: unknown;
  cause?: Error;
}

/**
 * Error handler function
 */
export type ErrorHandler = (error: Error | ErrorInfo) => void | Promise<void>;

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

/**
 * Notification payload
 */
export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Push notification data
 */
export interface PushData {
  token?: string;
  payload?: NotificationPayload;
  [key: string]: unknown;
}

// ============================================================================
// ACHIEVEMENT & REWARDS
// ============================================================================

/**
 * Achievement data
 */
export interface Achievement {
  id: string;
  name: string;
  description?: string;
  value?: number;
  [key: string]: unknown;
}

/**
 * Reward data
 */
export interface Reward {
  id: string;
  type: string;
  amount: number;
  [key: string]: unknown;
}

// ============================================================================
// METRIC TYPES
// ============================================================================

/**
 * Metrics data
 */
export interface Metrics {
  [key: string]: number | string | unknown;
}

/**
 * Time series data point
 */
export interface DataPoint<T = unknown> {
  timestamp: number;
  value: T;
}

/**
 * Time series data
 */
export type TimeSeries<T = unknown> = DataPoint<T>[];

// ============================================================================
// GENERIC WRAPPERS
// ============================================================================

/**
 * Promise wrapper with state
 */
export interface Pending<T = unknown> {
  status: 'pending';
  promise: Promise<T>;
}

/**
 * Successful result
 */
export interface Success<T = unknown> {
  status: 'success';
  data: T;
}

/**
 * Failed result
 */
export interface Failure {
  status: 'error';
  error: Error;
}

/**
 * Union result type
 */
export type Result<T = unknown> = Success<T> | Failure;

// ============================================================================
// MIDDLEWARE & HANDLER TYPES
// ============================================================================

/**
 * Middleware function
 */
export type Middleware<T = unknown> = (
  context: T
) => Promise<void> | void;

/**
 * Async iterator
 */
export type AsyncIterator<T = unknown> = AsyncIterable<T>;

// ============================================================================
// OBJECT/DOCUMENT TYPES
// ============================================================================

/**
 * Generic document
 */
export interface Document {
  _id?: string | unknown;
  createdAt?: Date;
  updatedAt?: Date;
  [key: string]: unknown;
}

/**
 * Generic model document
 */
export interface MongooseDocument extends Document {
  toJSON(): unknown;
  toObject(): unknown;
}

// ============================================================================
// QUERY TYPES
// ============================================================================

/**
 * Query filter
 */
export interface QueryFilter {
  [key: string]: unknown;
}

/**
 * Query options
 */
export interface QueryOptions {
  skip?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
  [key: string]: unknown;
}

/**
 * Query result
 */
export interface QueryResult<T = unknown> {
  data: T[];
  total: number;
  skip?: number;
  limit?: number;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Validation result
 */
export interface ValidationResult<T = unknown> {
  valid: boolean;
  data?: T;
  errors?: ValidationError[];
}

/**
 * Validator function
 */
export type Validator<T = unknown> = (data: T) => ValidationResult<T>;

// ============================================================================
// MAP/SET TYPES
// ============================================================================

/**
 * Key-value record
 */
export type KeyValue<T = unknown> = Record<string, T>;

/**
 * Generic key-value store
 */
export interface Store<K = string, V = unknown> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  delete(key: K): boolean;
  has(key: K): boolean;
  clear(): void;
}

// ============================================================================
// FUNCTION TYPES
// ============================================================================

/**
 * Function that returns a promise
 */
export type AsyncFunction<T = unknown> = (
  ...args: unknown[]
) => Promise<T>;

/**
 * Function that returns any value
 */
export type AnyFunction<T = unknown> = (
  ...args: unknown[]
) => T;

/**
 * Generic callable
 */
export type Callable<T = unknown> = (...args: unknown[]) => T | Promise<T>;

// ============================================================================
// CONSTRUCTOR TYPES
// ============================================================================

/**
 * Constructor function
 */
export type Constructor<T = unknown> = new (
  ...args: unknown[]
) => T;

/**
 * Factory function
 */
export type Factory<T = unknown> = (
  ...args: unknown[]
) => T;
