import { Document, HydratedDocument, Model, Types } from 'mongoose';

// Base interfaces
export interface BaseDocument extends Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// User related types
export interface IUser extends BaseDocument {
  email?: string;
  passwordHash?: string;
  displayName: string;
  role: UserRole;
  points: {
    available: number;
    total: number;
    spent: number;
  };
  level: UserLevel;
  location?: {
    lat: number;
    lng: number;
    city: string;
    lastUpdated: Date;
  };
  stats: {
    prizesFound: number;
    rewardsRedeemed: number;
    sessionsCount: number;
    totalPlayTime: number;
    longestStreak: number;
    currentStreak: number;
    favoriteCity?: string;
    lastClaimDate?: Date;
    dailyClaimsCount: number;
  };
  devices: IDevice[];
  preferences: {
    notifications: boolean;
    language: Language;
    theme: Theme;
  };
  partnerId?: Types.ObjectId;
  isGuest: boolean;
  isBanned: boolean;
  banReason?: string;
  banExpiresAt?: Date;
  lastIp?: string;
  lastUserAgent?: string;
  phoneNumber?: string;
  avatar?: string;
  lastActive: Date;
  deletedAt?: Date;
  // Inventory and active effects for game mechanics
  inventory?: {
    powerUps?: Array<{
      id: string;
      type: string;
      quantity: number;
      expiresAt?: Date;
    }>;
    items?: Array<{
      id: string;
      name: string;
      type: string;
      quantity: number;
      expiresAt?: Date;
    }>;
  };
  activeEffects?: Array<{
    type: string;
    effect: any;
    expiresAt?: Date;
    createdAt: Date;
  }>;

  // Offline mode properties
  offlineMode?: boolean;
  lastSync?: Date;
}

export interface IUserMethods {
  comparePassword: (candidatePassword: string) => Promise<boolean>;
  updateLevel: () => void;
  addPoints: (points: number) => void;
  spendPoints: (points: number) => boolean;
  updateLocation: (lat: number, lng: number, city: string) => void;
  updateFavoriteCity: (city: string) => void;
  addDevice: (
    deviceId: string,
    platform: Platform,
    fcmToken?: string,
    meta?: { model?: string; osVersion?: string; appVersion?: string; userAgent?: string }
  ) => void;
  removeDevice: (deviceId: string) => void;
  updateStreak: () => void;
  resetDailyClaimsIfNeeded: () => void;
  incrementDailyClaims: () => void;
  ban: (reason: string, duration?: number) => void;
  unban: () => void;
  softDelete: () => void;
  restore: () => void;
}

export interface IUserVirtuals {
  readonly isActive: boolean;
  readonly levelProgress: {
    progress: number;
    pointsToNext: number;
    nextLevel: UserLevel | null;
    currentLevel: UserLevel;
    pointsForNext: number;
  };
  readonly activeDevice: IDevice;
  readonly canClaim: boolean;
}

export type IUserDocument = HydratedDocument<IUser, IUserMethods & IUserVirtuals>;

export interface IDevice {
  deviceId: string;
  platform: Platform;
  fcmToken?: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
  userAgent?: string;
  lastUsed: Date;
  isActive: boolean;
}

// Prize related types
export interface IPrize extends BaseDocument {
  name: string;
  description: string;
  type: PrizeType;
  displayType: PrizeDisplayType;
  contentType: PrizeContentType;
  category: PrizeCategory;
  points: number; // Legacy field, use pointsReward.amount instead
  pointsReward?: {
    amount: number;
    bonusMultiplier?: number;
  };
  directReward?: {
    rewardId: Types.ObjectId;
    autoRedeem: boolean;
    probability?: number; // For hybrid type (0-1)
  };
  rarity: PrizeRarity;
  quantity: number;
  claimedCount: number;
  location: {
    type: LocationType;
    coordinates: [number, number]; // [lng, lat]
    radius: number;
    city: string;
    address?: string;
    markerUrl?: string;
    confidenceThreshold?: number;
  };
  visibility: {
    startAt: Date;
    endAt?: Date;
  };
  expiresAt?: Date;
  status: PrizeStatus;
  createdBy: Types.ObjectId;
  distributionId?: Types.ObjectId;
  imageUrl?: string;
  value?: number;
  tags: string[];
  capturedAt?: Date;
  capturedBy?: Types.ObjectId;
  metadata?: Record<string, any>;
}

// Claim related types
export interface IClaim extends BaseDocument {
  userId: Types.ObjectId;
  prizeId: Types.ObjectId;
  location: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
  distance: number;
  pointsAwarded: number;
  deviceSignals?: {
    speed?: number;
    mockLocation?: boolean;
    attestationToken?: string;
  };
  validationChecks: {
    distanceValid: boolean;
    timeValid: boolean;
    speedValid: boolean;
    cooldownValid: boolean;
    dailyLimitValid: boolean;
  };
  idempotencyKey: string;
  claimedAt: Date;
  metadata?: Record<string, any>;
}

// Reward related types
export interface IReward extends BaseDocument {
  name: string;
  description: string;
  category: RewardCategory;
  pointsCost: number;
  stockQuantity: number;
  stockReserved: number;
  stockAvailable: number;
  imageUrl?: string;
  isActive: boolean;
  isPopular: boolean;
  partnerId?: Types.ObjectId;
  metadata?: Record<string, any>;
  updatedBy?: Types.ObjectId;
}

export interface IRedemption extends BaseDocument {
  userId: Types.ObjectId;
  rewardId: Types.ObjectId;
  pointsSpent: number;
  status: RedemptionStatus;
  codeId?: Types.ObjectId;
  redeemedAt: Date;
  fulfilledAt?: Date;
  redeemedBy?: Types.ObjectId;
  idempotencyKey: string;
  metadata?: Record<string, any>;
}

// Code related types
export interface ICode extends BaseDocument {
  code: string;
  poolName?: string;  // Optional for promo codes
  rewardId?: Types.ObjectId;  // Optional for promo codes
  status: CodeStatus;
  // Promo code specific fields
  pointsValue?: number;
  isActive?: boolean;
  isUsed?: boolean;
  reservedBy?: Types.ObjectId;
  reservedAt?: Date;
  usedBy?: Types.ObjectId;
  usedAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

// Notification related types
export interface INotification extends BaseDocument {
  title: string;
  message: string;
  type: NotificationType;
  targetType: NotificationTargetType;
  targetValue?: string;
  status: NotificationStatus;
  scheduledFor?: Date;
  sentAt?: Date;
  createdBy: Types.ObjectId;
  metadata?: Record<string, any>;

  // Production-level fields
  priority?: number; // 1-5 priority level
  expiresAt?: Date; // Notification expiration
  deliveryMethod?: 'push' | 'email' | 'inapp' | 'all';
  channelPreferences?: { // Override user channel preferences
    push?: boolean;
    email?: boolean;
    inApp?: boolean;
  };
  statistics?: {
    totalTargets: number;
    deliveredCount: number;
    openedCount: number;
    clickedCount: number;
  };
  // User-specific fields (handled in UserNotification model but sometimes joined)
  isRead?: boolean;
  userId?: Types.ObjectId;
}

// Analytics related types
export interface IAnalytics extends BaseDocument {
  date: Date;
  metrics: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    totalPrizes: number;
    claimedPrizes: number;
    totalRewards: number;
    redeemedRewards: number;
    totalPoints: number;
    averageSessionTime: number;
    retentionRate: number;
    conversionRate: number;
  };
  cityMetrics: Record<string, {
    users: number;
    claims: number;
    redemptions: number;
  }>;
  generatedAt: Date;
}

// Distribution related types
export interface IDistribution extends BaseDocument {
  name: string;
  description: string;
  targetArea: {
    type: 'city' | 'polygon' | 'circle';
    coordinates: number[][];
    city?: string;
    radius?: number;
  };
  prizeTemplate: {
    name: string;
    description: string;
    type: PrizeType;
    category: PrizeCategory;
    points: number;
    rarity: PrizeRarity;
    imageUrl?: string;
  };
  quantity: number;
  spacing: number;
  status: DistributionStatus;
  createdBy: Types.ObjectId;
  undoExpiresAt?: Date;
  metadata?: Record<string, any>;
}

// Partner related types
export interface IPartner extends BaseDocument {
  name: string;
  description: string;
  logoUrl?: string;
  contactEmail: string;
  contactPhone?: string;
  website?: string;
  isActive: boolean;
  commissionRate: number;
  metadata?: Record<string, any>;
}

// Session related types
export interface ISession extends BaseDocument {
  userId: Types.ObjectId;
  deviceId: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  isActive: boolean;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

// Audit log related types
export interface IAuditLog extends BaseDocument {
  userId: Types.ObjectId;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// Settings related types
export interface ISettings extends BaseDocument {
  key: string;
  value: any;
  type: SettingType;
  description?: string;
  isPublic: boolean;
  updatedBy: Types.ObjectId;
}

// Enum types
export enum UserRole {
  PLAYER = 'player',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  SUPER_ADMIN = 'super_admin',
  PARTNER = 'partner',
}

export enum UserLevel {
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum',
  DIAMOND = 'diamond',
}

export enum Platform {
  IOS = 'iOS',
  ANDROID = 'Android',
  WEB = 'Web',
}

export enum Language {
  FR = 'fr',
  AR = 'ar',
  EN = 'en',
}

export enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
}

// Prize display type (how the prize appears in AR/UI)
export enum PrizeDisplayType {
  STANDARD = 'standard',      // Standard prize with simple animation
  MYSTERY_BOX = 'mystery_box', // Mystery box with surprise animation
  TREASURE = 'treasure',      // Treasure chest animation
  BONUS = 'bonus',           // Bonus/power-up animation
  SPECIAL = 'special',       // Special event prize
}

// Prize content type (what the prize actually contains)
export enum PrizeContentType {
  POINTS = 'points',         // Pure points reward
  REWARD = 'reward',         // Direct reward (coupon, gift)
  HYBRID = 'hybrid',         // Points + chance for reward
}

// Legacy type for backward compatibility
export enum PrizeType {
  PHYSICAL = 'physical',
  DIGITAL = 'digital',
  VOUCHER = 'voucher',
  MYSTERY = 'mystery',
}

export enum PrizeCategory {
  ELECTRONICS = 'electronics',
  GAMING = 'gaming',
  LIFESTYLE = 'lifestyle',
  SHOPPING = 'shopping',
  FOOD = 'food',
  ENTERTAINMENT = 'entertainment',
}

export enum PrizeRarity {
  COMMON = 'common',
  UNCOMMON = 'uncommon',
  RARE = 'rare',
  EPIC = 'epic',
  LEGENDARY = 'legendary',
}

export enum PrizeStatus {
  ACTIVE = 'active',
  CAPTURED = 'captured',
  EXPIRED = 'expired',
  INACTIVE = 'inactive',
  REVOKED = 'revoked',
}

export enum LocationType {
  GPS = 'gps',
  MARKER = 'marker',
}

export enum RewardCategory {
  VOUCHER = 'voucher',
  GIFT_CARD = 'gift_card',
  PHYSICAL = 'physical',
  DIGITAL = 'digital',
  EXPERIENCE = 'experience',
}

export enum RedemptionStatus {
  PENDING = 'pending',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export enum CodeStatus {
  AVAILABLE = 'available',
  RESERVED = 'reserved',
  USED = 'used',
  EXPIRED = 'expired',
}

export enum NotificationType {
  PUSH = 'push',
  EMAIL = 'email',
  SMS = 'sms',
  IN_APP = 'in_app',
}

export enum NotificationTargetType {
  ALL = 'all',
  USER = 'user',
  CITY = 'city',
  LEVEL = 'level',
  ROLE = 'role',
}

export enum NotificationStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum DistributionStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum SettingType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  JSON = 'json',
}

export enum AchievementTrigger {
  PRIZE_CLAIMED = 'PRIZE_CLAIMED',
  LEVEL_UP = 'LEVEL_UP',
  REWARD_REDEEMED = 'REWARD_REDEEMED',
  FRIEND_ADDED = 'FRIEND_ADDED',
  STREAK_MILESTONE = 'STREAK_MILESTONE',
  DISTANCE_MILESTONE = 'DISTANCE_MILESTONE',
  MANUAL = 'MANUAL',
}

// API Request/Response types
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  code?: string;
  details?: Record<string, any>;
  timestamp: string;
}

// Geolocation types
export interface Coordinates {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface GeofenceArea {
  center: Coordinates;
  radius: number;
}

// Game mechanics types
export interface LevelRequirements {
  level: UserLevel;
  pointsRequired: number;
  benefits: string[];
}

export interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  target: number;
  reward: number;
  type: 'claims' | 'distance' | 'time' | 'city';
  expiresAt: Date;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  requirement: Record<string, any>;
  reward: number;
  isSecret: boolean;
}

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

// Export utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type UpdateFields<T> = DeepPartial<Omit<T, '_id' | 'createdAt' | 'updatedAt'>>;

export type CreateFields<T> = Omit<T, '_id' | 'createdAt' | 'updatedAt'>;

// Database query types
export interface QueryOptions {
  select?: string;
  populate?: string | string[];
  sort?: string | Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
  lean?: boolean;
}

export interface AggregationPipeline {
  $match?: Record<string, any>;
  $group?: Record<string, any>;
  $sort?: Record<string, 1 | -1>;
  $limit?: number;
  $skip?: number;
  $project?: Record<string, any>;
  $lookup?: Record<string, any>;
  $unwind?: string | Record<string, any>;
}

// Model extensions
export interface IPrizeDocument extends IPrize, Document {
  isAvailable: boolean;
  isActive: boolean;
  isExpired: boolean;
  remainingQuantity: number;
  claimRate: number;
  rarityWeight: number;
  estimatedValue: number;
  findNearestCity(): string;
  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number;
  isWithinRadius(lat: number, lng: number): boolean;
  claim(userId: Types.ObjectId): boolean;
  activate(): void;
  deactivate(): void;
  revoke(): void;
  extend(hours: number): void;
  updateLocation(lat: number, lng: number, radius?: number): void;
}

export interface IPrizeModel extends Model<IPrize> {
  findNearby(lat: number, lng: number, radiusKm?: number, options?: any): Promise<IPrizeDocument[]>;
  findByCity(city: string, options?: any): Promise<IPrizeDocument[]>;
  findExpired(): Promise<IPrizeDocument[]>;
  findByDistribution(distributionId: Types.ObjectId): Promise<IPrizeDocument[]>;
  getStatsByCity(): Promise<any[]>;
  getHeatmapData(city?: string): Promise<any[]>;
  cleanupExpired(): Promise<any>;
}

export interface IUserModel extends Model<IUser, {}, IUserMethods, IUserVirtuals> {
  findByEmail(email: string): Promise<IUserDocument | null>;
  findByDeviceId(deviceId: string): Promise<IUserDocument | null>;
  findActiveUsers(days?: number): Promise<IUserDocument[]>;
  getLeaderboard(city?: string, limit?: number): Promise<IUserDocument[]>;
  getUserStats(): Promise<any>;
  getPointsForLevel(level: UserLevel): number;
}

// Event types
export interface GameEvent {
  type: string;
  userId: string;
  data: Record<string, any>;
  timestamp: Date;
}

export interface SystemEvent {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  data: Record<string, any>;
  timestamp: Date;
}
