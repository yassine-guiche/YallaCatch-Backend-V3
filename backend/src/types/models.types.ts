import { HydratedDocument, Model, Types } from 'mongoose';
import { IAuditLog } from '@/models/AuditLog';
import { BaseDocument } from './utils.types.js';
import {
    UserRole, UserLevel, Platform, Language, Theme,
    PrizeType, PrizeDisplayType, PrizeContentType, PrizeCategory, PrizeRarity, PrizeStatus,
    LocationType, RewardCategory, RedemptionStatus, CodeStatus,
    NotificationType, NotificationTargetType, NotificationStatus,
    DistributionStatus, ListingType
} from './enums.js';

// User related types
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

export interface IUser extends BaseDocument, IUserMethods {
    email?: string;
    referralCode?: string;
    referredBy?: Types.ObjectId;
    passwordHash?: string;
    displayName: string;
    emailVerified?: boolean;
    emailVerifiedAt?: Date;
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
        totalClaims?: number;
        totalPoints?: number;
        totalDistance?: number;
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
    bannedUntil?: Date;
    bannedAt?: Date;
    bannedReason?: string;
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

    // Favorites
    favorites?: Types.ObjectId[];
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

export interface IUserModel extends Model<IUser, {}, IUserMethods, IUserVirtuals> {
    findByEmail(email: string): Promise<IUserDocument | null>;
    findByDisplayName(displayName: string): Promise<IUserDocument | null>;
    findByDeviceId(deviceId: string): Promise<IUserDocument | null>;
    findActiveUsers(days?: number): Promise<IUserDocument[]>;
    getLeaderboard(city?: string, limit?: number): Promise<IUserDocument[]>;
    getUserStats(): Promise<any>;
    getPointsForLevel(level: UserLevel): number;
    // Atomic operations for concurrency safety
    atomicSpendPoints(userId: string | Types.ObjectId, points: number): Promise<IUserDocument | null>;
    atomicAddPoints(userId: string | Types.ObjectId, points: number): Promise<IUserDocument | null>;
}

export type IUserDocument = HydratedDocument<IUser, IUserMethods & IUserVirtuals>;

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
    arModel?: {
        modelUrl?: string;
        textureUrl?: string;
        scale?: number;
        rotation?: {
            x: number;
            y: number;
            z: number;
        };
    };
    value?: number;
    tags: string[];
    capturedAt?: Date;
    capturedBy?: Types.ObjectId;
    metadata?: Record<string, any>;
}

export interface IPrizeMethods {
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

export interface IPrizeModel extends Model<IPrize, {}, IPrizeMethods> {
    findNearby(lat: number, lng: number, radiusKm?: number, options?: any): Promise<IPrizeDocument[]>;
    findByCity(city: string, options?: any): Promise<IPrizeDocument[]>;
    findExpired(): Promise<IPrizeDocument[]>;
    findByDistribution(distributionId: Types.ObjectId): Promise<IPrizeDocument[]>;
    getStatsByCity(): Promise<any[]>;
    getHeatmapData(city?: string): Promise<any[]>;
    cleanupExpired(): Promise<any>;
}

export type IPrizeDocument = HydratedDocument<IPrize, IPrizeMethods>;

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

export type IClaimDocument = HydratedDocument<IClaim>;
export type IClaimModel = Model<IClaim>;

// Partner related types
export interface IPartnerLocation {
    _id?: Types.ObjectId;
    name: string;
    address: string;
    city: string;
    coordinates: [number, number]; // [longitude, latitude]
    phone?: string;
    hours?: {
        monday?: string;
        tuesday?: string;
        wednesday?: string;
        thursday?: string;
        friday?: string;
        saturday?: string;
        sunday?: string;
    };
    isActive: boolean;
    features?: string[];
}

export interface IPartnerMethods {
    addLocation(locationData: any): Promise<IPartnerDocument>;
    updateLocation(locationId: string | Types.ObjectId, updateData: any): Promise<IPartnerDocument>;
    removeLocation(locationId: string | Types.ObjectId): Promise<IPartnerDocument>;
    getLocationsByCity(city: string): IPartnerLocation[];
    updateMetrics(redemptionValue: number, rating?: number): Promise<IPartnerDocument>;
}

export interface IPartner extends BaseDocument, IPartnerMethods {
    name: string;
    description: string;
    logo?: string;
    website?: string;
    phone?: string;
    email?: string;
    contactEmail?: string; // Legacy field
    categories: string[];
    locations: IPartnerLocation[];
    isActive: boolean;
    contractStartDate?: Date;
    contractEndDate?: Date;
    commissionRate?: number;
    paymentTerms?: string;
    contactPerson?: {
        name: string;
        email: string;
        phone: string;
        position?: string;
    };
    businessHours?: {
        timezone: string;
        defaultHours: {
            open: string;
            close: string;
        };
    };
    socialMedia?: {
        facebook?: string;
        instagram?: string;
        twitter?: string;
        linkedin?: string;
    };
    documents?: {
        businessLicense?: string;
        taxId?: string;
        bankDetails?: string;
    };
    metrics?: {
        totalRedemptions: number;
        totalRevenue: number;
        averageRating: number;
        lastActivityAt?: Date;
    };
    settings?: {
        autoApproveRedemptions: boolean;
        maxDailyRedemptions?: number;
        notificationPreferences: {
            email: boolean;
            sms: boolean;
            webhook?: string;
        };
    };
    createdBy?: string;
    updatedBy?: string;
}

export type IPartnerDocument = HydratedDocument<IPartner, IPartnerMethods>;
export type IAuditLogDocument = HydratedDocument<IAuditLog>;
export type IPartnerModel = Model<IPartner>;


// Reward related types
export interface IRewardMethods {
    reserveStock(quantity?: number): boolean;
    releaseReservation(quantity?: number): void;
    confirmRedemption(quantity?: number): boolean;
    addStock(quantity: number): void;
    activate(): void;
    deactivate(): void;
}

export interface IReward extends BaseDocument, IRewardMethods {
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
    approvalStatus?: 'pending' | 'approved' | 'rejected';
    approvedBy?: Types.ObjectId;
    approvedAt?: Date;
    listingType: ListingType;
    partnerId?: Types.ObjectId;
    metadata?: Record<string, any>;
    updatedBy?: Types.ObjectId;
}

// Reward Model interface with atomic operations
export interface IRewardModel extends Model<IReward> {
    getRewardStats(): Promise<any>;
    getLowStockRewards(threshold?: number): Promise<IReward[]>;
    // Atomic operations for concurrency safety
    atomicReserveStock(rewardId: string | Types.ObjectId, quantity?: number): Promise<IReward | null>;
    atomicConfirmRedemption(rewardId: string | Types.ObjectId, quantity?: number): Promise<IReward | null>;
    atomicReleaseReservation(rewardId: string | Types.ObjectId, quantity?: number): Promise<IReward | null>;
}

export type IRewardDocument = HydratedDocument<IReward>;

// Redemption related types
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

export type IRedemptionDocument = HydratedDocument<IRedemption>;
export type IRedemptionModel = Model<IRedemption>;

// Code related types
export interface ICode extends BaseDocument {
    code: string;
    poolName?: string;
    rewardId?: Types.ObjectId;
    pointsValue?: number;
    isActive: boolean;
    isUsed: boolean;
    status: CodeStatus;
    reservedBy?: Types.ObjectId;
    reservedAt?: Date;
    usedBy?: Types.ObjectId;
    usedAt?: Date;
    expiresAt?: Date;
    metadata?: Record<string, any>;
}

export type ICodeDocument = HydratedDocument<ICode>;
export type ICodeModel = Model<ICode>;

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
    priority: number;
    expiresAt?: Date;
    deliveryMethod: string;
    channelPreferences: {
        push?: boolean;
        email?: boolean;
        inApp?: boolean;
    };
    statistics: {
        totalTargets: number;
        deliveredCount: number;
        openedCount: number;
        clickedCount: number;
    };
}

export type INotificationDocument = HydratedDocument<INotification>;
export type INotificationModel = Model<INotification>;

// Distribution related types
export interface IDistribution extends BaseDocument {
    name: string;
    description: string;
    targetArea: {
        type: string;
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

export type IDistributionDocument = HydratedDocument<IDistribution>;
export type IDistributionModel = Model<IDistribution>;

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
    cityMetrics: Record<string, any>;
    generatedAt: Date;
}

export type IAnalyticsDocument = HydratedDocument<IAnalytics>;
export type IAnalyticsModel = Model<IAnalytics>;
