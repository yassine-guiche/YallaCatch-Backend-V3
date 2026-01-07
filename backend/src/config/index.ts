import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Environment schema with comprehensive validation
const envSchema = z.object({
  // Basic Configuration
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Database Configuration
  MONGODB_URI: z.string().url(),
  MONGODB_TEST_URI: z.string().url().optional(),
  REDIS_URL: z.string().url(),
  REDIS_PASSWORD: z.string().optional(),

  // JWT Configuration
  JWT_PRIVATE_KEY_BASE64: z.string().min(1),
  JWT_PUBLIC_KEY_BASE64: z.string().min(1),
  JWT_SECRET: z.string().min(32).optional(), // Legacy JWT secret for backward compatibility
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),
  JWT_ISSUER: z.string().default('yallacatch'),
  JWT_AUDIENCE: z.string().default('yallacatch-users'),

  // Security Configuration
  BCRYPT_ROUNDS: z.coerce.number().min(8).max(15).default(12),
  ARGON2_MEMORY: z.coerce.number().default(65536),
  ARGON2_TIME: z.coerce.number().default(3),
  ARGON2_PARALLELISM: z.coerce.number().default(4),
  SESSION_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().length(32),

  // CORS Configuration
  CORS_ORIGINS: z.string().transform((val) => val.split(',')).default('http://localhost:3001'),
  CORS_CREDENTIALS: z.coerce.boolean().default(true),

  // Rate Limiting
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS: z.coerce.boolean().default(false),

  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE_ENABLED: z.coerce.boolean().default(true),
  LOG_FILE_PATH: z.string().default('./logs/app.log'),
  LOG_MAX_SIZE: z.string().default('10m'),
  LOG_MAX_FILES: z.coerce.number().default(5),

  // Metrics and Monitoring
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_DEBUG: z.coerce.boolean().default(false),
  METRICS_PORT: z.coerce.number().default(9090),
  METRICS_AUTH_TOKEN: z.string().optional(),
  HEALTH_CHECK_ENABLED: z.coerce.boolean().default(true),
  HEALTH_AUTH_TOKEN: z.string().optional(),
  PROMETHEUS_ENABLED: z.coerce.boolean().default(true),
  ENABLE_SWAGGER: z.coerce.boolean().default(false),
  COMPRESSION_ENABLED: z.coerce.boolean().default(true),

  // File Upload Configuration
  UPLOAD_MAX_SIZE: z.coerce.number().default(10485760), // 10MB
  UPLOAD_ALLOWED_TYPES: z.string().transform((val) => val.split(',')).default('image/jpeg,image/png,image/webp,application/pdf'),
  UPLOAD_DESTINATION: z.string().default('./uploads'),

  // AWS Configuration
  AWS_REGION: z.string().default('eu-west-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),
  AWS_S3_REGION: z.string().default('eu-west-1'),
  AWS_CLOUDFRONT_URL: z.string().url().optional(),

  // Email Configuration
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('YallaCatch! <noreply@yallacatch.tn>'),

  // SMS Configuration
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),

  // Payment Configuration
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_MODE: z.enum(['sandbox', 'live']).default('sandbox'),

  // Geolocation Configuration
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  MAPBOX_ACCESS_TOKEN: z.string().optional(),
  OPENCAGE_API_KEY: z.string().optional(),

  // Cache Configuration
  CACHE_TTL: z.coerce.number().default(3600),
  CACHE_MAX_KEYS: z.coerce.number().default(1000),
  CACHE_CHECK_PERIOD: z.coerce.number().default(600),

  // Game Configuration
  GAME_MAX_DAILY_CLAIMS: z.coerce.number().default(50),
  GAME_CLAIM_RADIUS_METERS: z.coerce.number().default(50),
  GAME_SPEED_LIMIT_KMH: z.coerce.number().default(120),
  GAME_COOLDOWN_SECONDS: z.coerce.number().default(60),
  GAME_LEVEL_UP_MULTIPLIER: z.coerce.number().default(1.5),

  // Admin Configuration
  ADMIN_EMAIL: z.string().email().default('admin@yallacatch.tn'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be set (8+ chars)').default('admin123'),
  SUPER_ADMIN_EMAILS: z.string().transform((val) => val.split(',')).default('admin@yallacatch.tn'),

  // Notification Configuration
  PUSH_NOTIFICATION_ENABLED: z.coerce.boolean().default(true),
  EMAIL_NOTIFICATION_ENABLED: z.coerce.boolean().default(true),
  SMS_NOTIFICATION_ENABLED: z.coerce.boolean().default(false),

  // Push Notification Services (FCM & APNS)
  FCM_SERVER_KEY: z.string().optional(),
  FCM_PROJECT_ID: z.string().optional(),
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_BUNDLE_ID: z.string().optional(),
  APNS_KEY_PATH: z.string().optional(),
  APNS_PRODUCTION: z.coerce.boolean().default(false),

  // Analytics Configuration
  ANALYTICS_ENABLED: z.coerce.boolean().default(true),
  GOOGLE_ANALYTICS_ID: z.string().optional(),
  MIXPANEL_TOKEN: z.string().optional(),

  // Backup Configuration
  BACKUP_ENABLED: z.coerce.boolean().default(true),
  BACKUP_SCHEDULE: z.string().default('0 2 * * *'),
  BACKUP_RETENTION_DAYS: z.coerce.number().default(30),
  BACKUP_S3_BUCKET: z.string().optional(),

  // Development Configuration
  DEBUG_MODE: z.coerce.boolean().default(false),
  SEED_DATABASE: z.coerce.boolean().default(false),
  MOCK_EXTERNAL_SERVICES: z.coerce.boolean().default(false),
  DEVICE_ATTESTATION_REQUIRED: z.coerce.boolean().default(false),

  // Testing Configuration
  TEST_TIMEOUT: z.coerce.number().default(30000),
  TEST_COVERAGE_THRESHOLD: z.coerce.number().default(80),

  // Deployment Configuration
  CLUSTER_MODE: z.coerce.boolean().default(false),
  CLUSTER_WORKERS: z.union([z.literal('auto'), z.coerce.number()]).default('auto'),
  GRACEFUL_SHUTDOWN_TIMEOUT: z.coerce.number().default(30000),

  // External APIs
  WEATHER_API_KEY: z.string().optional(),
  CURRENCY_API_KEY: z.string().optional(),
  TRANSLATION_API_KEY: z.string().optional(),

  // Tunisian Specific Configuration
  DEFAULT_TIMEZONE: z.string().default('Africa/Tunis'),
  DEFAULT_CURRENCY: z.string().default('TND'),
  DEFAULT_LANGUAGE: z.enum(['fr', 'ar', 'en']).default('fr'),
  SUPPORTED_CITIES: z.string().transform((val) => val.split(',')).default('Tunis,Sfax,Sousse,Kairouan,Bizerte,Gabes,Ariana,Gafsa'),
  TUNISIA_BOUNDS_NORTH: z.coerce.number().default(37.5439),
  TUNISIA_BOUNDS_SOUTH: z.coerce.number().default(30.2407),
  TUNISIA_BOUNDS_EAST: z.coerce.number().default(11.5998),
  TUNISIA_BOUNDS_WEST: z.coerce.number().default(7.5244),
});

// Parse and validate environment variables
export const config = envSchema.parse(process.env);

// Derived configuration
export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

// JWT Keys
export const jwtPrivateKey = Buffer.from(config.JWT_PRIVATE_KEY_BASE64, 'base64');
export const jwtPublicKey = Buffer.from(config.JWT_PUBLIC_KEY_BASE64, 'base64');

// File paths
export const uploadsDir = path.resolve(config.UPLOAD_DESTINATION);
export const logsDir = path.resolve('./logs');

// Game constants
export const GAME_CONSTANTS = {
  MAX_SPEED_MS: config.GAME_SPEED_LIMIT_KMH / 3.6, // Convert km/h to m/s
  CLAIM_RADIUS: config.GAME_CLAIM_RADIUS_METERS,
  COOLDOWN_MS: config.GAME_COOLDOWN_SECONDS * 1000,
  MAX_DAILY_CLAIMS: config.GAME_MAX_DAILY_CLAIMS,
  LEVEL_UP_MULTIPLIER: config.GAME_LEVEL_UP_MULTIPLIER,
} as const;

// Tunisia geographic bounds
export const TUNISIA_BOUNDS = {
  north: config.TUNISIA_BOUNDS_NORTH,
  south: config.TUNISIA_BOUNDS_SOUTH,
  east: config.TUNISIA_BOUNDS_EAST,
  west: config.TUNISIA_BOUNDS_WEST,
} as const;

// Supported cities with coordinates
export const TUNISIA_CITIES = {
  'Tunis': { lat: 36.8065, lng: 10.1815, governorate: 'Tunis' },
  'Sfax': { lat: 34.7406, lng: 10.7603, governorate: 'Sfax' },
  'Sousse': { lat: 35.8256, lng: 10.6369, governorate: 'Sousse' },
  'Kairouan': { lat: 35.6781, lng: 10.0963, governorate: 'Kairouan' },
  'Bizerte': { lat: 37.2744, lng: 9.8739, governorate: 'Bizerte' },
  'Gabes': { lat: 33.8815, lng: 10.0982, governorate: 'Gabes' },
  'Ariana': { lat: 36.8625, lng: 10.1956, governorate: 'Ariana' },
  'Gafsa': { lat: 34.425, lng: 8.7842, governorate: 'Gafsa' },
} as const;

// Export types for TypeScript
export type Config = typeof config;
export type SupportedCity = keyof typeof TUNISIA_CITIES;
