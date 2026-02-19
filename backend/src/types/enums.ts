export enum ListingType {
    GAME_REWARD = 'GAME_REWARD',
    MARKETPLACE_ITEM = 'MARKETPLACE_ITEM'
}

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
