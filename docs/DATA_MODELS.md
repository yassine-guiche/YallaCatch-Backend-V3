# YallaCatch! Data Models Reference

**Version**: 2.0.2  
**Database**: MongoDB  
**Last Updated**: January 2026

---

## 📋 Table of Contents

1. [User Model](#user-model)
2. [Prize Model](#prize-model)
3. [Claim Model](#claim-model)
4. [Reward Model](#reward-model)
5. [Redemption Model](#redemption-model)
6. [Code Model](#code-model)
7. [Partner Model](#partner-model)
8. [PowerUp Model](#powerup-model)
9. [Achievement Model](#achievement-model)
10. [UserAchievement Model](#userachievement-model)
11. [Notification Model](#notification-model)
12. [UserNotification Model](#usernotification-model)
13. [Session Model](#session-model)
14. [Friendship Model](#friendship-model)
15. [Distribution Model](#distribution-model)
16. [ABTest Model](#abtest-model)
17. [AuditLog Model](#auditlog-model)
18. [Settings Model](#settings-model)
19. [Enums Reference](#enums-reference)

---

## 👤 User Model

Collection: `users`

```typescript
interface IUser {
  _id: ObjectId;
  email?: string;                   // Unique, sparse, indexed
  passwordHash?: string;            // Hashed with bcrypt (select: false)
  displayName: string;              // 2-50 chars
  role: UserRole;                   // 'player' | 'admin' | 'moderator' | 'super_admin' | 'partner'
  partnerId?: ObjectId;             // Reference to Partner (for partner role)
  
  // Points System (3-tier)
  points: {
    available: number;              // Spendable balance (can decrease)
    total: number;                  // Lifetime earned (never decreases)
    spent: number;                  // Total spent
  };
  
  // Level System (String-based)
  level: UserLevel;                 // 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'
  
  // Location
  location?: {
    lat: number;                    // -90 to 90
    lng: number;                    // -180 to 180
    city: string;
    lastUpdated: Date;
  };
  
  // Statistics
  stats: {
    prizesFound: number;
    rewardsRedeemed: number;
    sessionsCount: number;
    totalPlayTime: number;          // In seconds
    longestStreak: number;
    currentStreak: number;
    favoriteCity?: string;
    lastClaimDate?: Date;
    dailyClaimsCount: number;
  };
  
  // Devices (Multiple devices supported)
  devices: Array<{
    deviceId: string;
    platform: Platform;             // 'iOS' | 'Android' | 'Web'
    fcmToken?: string;
    model?: string;
    osVersion?: string;
    appVersion?: string;
    userAgent?: string;
    lastUsed: Date;
    isActive: boolean;
  }>;
  
  // Preferences
  preferences: {
    notifications: boolean;
    language: Language;             // 'fr' | 'ar' | 'en'
    theme: Theme;                   // 'light' | 'dark'
  };
  
  // Inventory System
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
  
  // Active Effects (Power-ups in use)
  activeEffects?: Array<{
    type: string;
    effect: any;
    expiresAt?: Date;
    createdAt: Date;
  }>;
  
  // Status
  isGuest: boolean;
  isBanned: boolean;
  banReason?: string;
  banExpiresAt?: Date;
  
  // Contact & Identity
  phoneNumber?: string;
  avatar?: string;
  
  // Tracking
  lastIp?: string;
  lastUserAgent?: string;
  lastActive: Date;
  deletedAt?: Date;                 // Soft delete
  
  // Offline Support
  offlineMode?: boolean;
  lastSync?: Date;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Level Thresholds
| Level | Min Total Points |
|-------|------------------|
| bronze | 0 |
| silver | 1,000 |
| gold | 5,000 |
| platinum | 15,000 |
| diamond | 50,000 |

### User Methods
- `comparePassword(candidatePassword)` - Verify password
- `updateLevel()` - Check and update level based on total points
- `addPoints(points)` - Add points (updates available + total)
- `spendPoints(points)` - Deduct from available (updates spent)
- `updateLocation(lat, lng, city)` - Update location
- `addDevice(deviceId, platform, fcmToken, meta)` - Register device
- `removeDevice(deviceId)` - Unregister device
- `updateStreak()` - Update daily streak
- `resetDailyClaimsIfNeeded()` - Reset daily counter
- `ban(reason, duration)` - Ban user
- `unban()` - Remove ban
- `softDelete()` / `restore()` - Soft delete management

### Indexes
```javascript
{ email: 1 }                           // Unique, sparse
{ 'devices.deviceId': 1 }
{ role: 1, lastActive: -1 }
{ 'points.total': -1 }                 // Leaderboard
{ level: 1 }
{ 'location.city': 1, level: 1 }
{ isBanned: 1, deletedAt: 1 }
```

---

## 🎁 Prize Model

Collection: `prizes`

```typescript
interface IPrize {
  _id: ObjectId;
  name: string;                       // 2-100 chars
  description: string;                // Max 500 chars
  
  // Type Classification
  type: PrizeType;                    // 'physical' | 'digital' | 'voucher' | 'mystery'
  displayType: PrizeDisplayType;      // 'standard' | 'mystery_box' | 'treasure' | 'bonus' | 'special'
  contentType: PrizeContentType;      // 'points' | 'reward' | 'hybrid'
  category: PrizeCategory;            // 'electronics' | 'gaming' | 'lifestyle' | 'shopping' | 'food' | 'entertainment'
  rarity: PrizeRarity;                // 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  
  // Points (Legacy + New)
  points?: number;                    // Legacy field (1-10000)
  pointsReward?: {
    amount: number;                   // 1-10000
    bonusMultiplier?: number;         // 1-10, default 1
  };
  
  // Direct Reward (for contentType: 'reward' or 'hybrid')
  directReward?: {
    rewardId: ObjectId;               // Reference to Reward
    autoRedeem: boolean;              // Auto-redeem on capture
    probability?: number;             // 0-1 for hybrid type
  };
  
  // Quantity
  quantity: number;                   // Total available (1-1000)
  claimedCount: number;               // Already claimed
  
  // Location (GeoJSON)
  location: {
    type: LocationType;               // 'gps' | 'marker'
    coordinates: [number, number];    // [longitude, latitude] - Tunisia bounds validated
    radius: number;                   // Claim radius in meters (10-500, default 50)
    city: string;                     // Must be valid Tunisia city
    address?: string;                 // Max 200 chars
    markerUrl?: string;               // Custom marker image
    confidenceThreshold?: number;     // GPS confidence required
  };
  
  // Visibility & Timing
  visibility: {
    startAt: Date;
    endAt?: Date;
  };
  expiresAt?: Date;
  status: PrizeStatus;                // 'active' | 'captured' | 'expired' | 'inactive' | 'revoked'
  
  // References
  createdBy: ObjectId;                // Admin who created
  distributionId?: ObjectId;          // Reference to Distribution batch
  capturedBy?: ObjectId;              // User who captured (for single-use)
  capturedAt?: Date;
  
  // Display
  imageUrl?: string;
  value?: number;                     // Monetary value
  tags: string[];
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Display Type Colors (for Map Markers)
| Type | Color | Hex |
|------|-------|-----|
| standard | Blue | #3B82F6 |
| mystery_box | Purple | #8B5CF6 |
| treasure | Orange | #D97706 |
| bonus | Green | #059669 |
| special | Pink | #DB2777 |

### Tunisia Bounds Validation
```javascript
{
  north: 37.5,
  south: 30.2,
  east: 11.6,
  west: 7.5
}
```

### Indexes
```javascript
{ 'location.coordinates': '2dsphere' }    // Geospatial
{ status: 1, 'visibility.startAt': 1 }
{ 'location.city': 1, status: 1 }
{ displayType: 1 }
{ rarity: 1 }
{ distributionId: 1 }
{ name: 'text', description: 'text' }     // Text search
```

---

## 🏆 Claim Model

Collection: `claims`

```typescript
interface IClaim {
  _id: ObjectId;
  userId: ObjectId;                   // Who claimed
  prizeId: ObjectId;                  // What was claimed
  
  // Location at claim time
  location: {
    lat: number;                      // -90 to 90
    lng: number;                      // -180 to 180
    accuracy?: number;                // GPS accuracy in meters
  };
  
  // Distance & Points
  distance: number;                   // Meters from prize
  pointsAwarded: number;              // Total points given
  
  // Device Signals (Anti-Cheat)
  deviceSignals?: {
    speed?: number;                   // Movement speed
    mockLocation?: boolean;           // Mock location detected
    attestationToken?: string;        // Device attestation
  };
  
  // Validation Checks
  validationChecks: {
    distanceValid: boolean;           // Within claim radius
    timeValid: boolean;               // Within time window
    speedValid: boolean;              // Not moving too fast
    cooldownValid: boolean;           // Cooldown passed
    dailyLimitValid: boolean;         // Under daily limit
  };
  
  // Idempotency
  idempotencyKey: string;             // Prevents duplicate claims (unique)
  
  // Timestamps
  claimedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Metadata
  metadata?: Record<string, any>;
}
```

### Virtual Fields
- `isValid` - True if all validationChecks pass

### Static Methods
- `findByUser(userId, options)` - Get user's claim history
- `findByPrize(prizeId)` - Get all claims for a prize
- `getUserStats(userId)` - Aggregate stats (totalClaims, totalPoints, avgDistance)

### Indexes
```javascript
{ userId: 1, claimedAt: -1 }
{ prizeId: 1, claimedAt: -1 }
{ claimedAt: -1 }
{ 'location.lat': 1, 'location.lng': 1 }
{ idempotencyKey: 1 }                 // Unique
```

---

## 🎁 Reward Model

Collection: `rewards`

**Note:** Single model for both platform (YallaCatch) and partner rewards. Distinction via `partnerId`.

```typescript
interface IReward {
  _id: ObjectId;
  name: string;                       // 2-100 chars
  description: string;                // Max 500 chars
  category: RewardCategory;           // 'voucher' | 'gift_card' | 'physical' | 'digital' | 'experience'
  
  // Cost
  pointsCost: number;                 // 1-100000
  
  // Stock Management (3-tier)
  stockQuantity: number;              // Total stock
  stockReserved: number;              // Reserved during purchase flow
  stockAvailable: number;             // Actually available
  
  // Display
  imageUrl?: string;
  
  // Status
  isActive: boolean;
  isPopular: boolean;                 // Featured/popular flag
  
  // Partner (null = YallaCatch platform reward)
  partnerId?: ObjectId;               // If set = Partner reward
  
  // Tracking
  updatedBy?: ObjectId;               // Admin who last updated
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Stock Methods
- `reserveStock(quantity)` - Reserve stock (returns boolean success)
- `releaseReservation(quantity)` - Release reserved stock
- `confirmRedemption(quantity)` - Confirm redemption (deduct from reserved)
- `addStock(quantity)` - Add more stock
- `activate()` / `deactivate()` - Toggle active status

### Virtual Fields
- `isAvailable` - True if active AND stockAvailable > 0
- `stockUsed` - stockQuantity - stockAvailable - stockReserved
- `popularityScore` - Percentage of stock used

### Reward Types
- **Platform Rewards** (`partnerId = null`): Managed by YallaCatch
- **Partner Rewards** (`partnerId = ObjectId`): Managed by specific partner

### Indexes
```javascript
{ category: 1, pointsCost: 1 }
{ isActive: 1, pointsCost: 1 }
{ isPopular: 1, pointsCost: 1 }
{ partnerId: 1 }
{ name: 'text', description: 'text' }
```

---

## 📜 Redemption Model

Collection: `redemptions`

```typescript
interface IRedemption {
  _id: ObjectId;
  userId: ObjectId;                   // Who purchased
  rewardId: ObjectId;                 // What was purchased
  
  // Cost
  pointsSpent: number;                // Min 1
  
  // Status
  status: RedemptionStatus;           // 'pending' | 'fulfilled' | 'cancelled' | 'failed'
  
  // QR Code
  codeId?: ObjectId;                  // Reference to Code model
  
  // Timing
  redeemedAt: Date;                   // When purchased
  fulfilledAt?: Date;                 // When physically redeemed
  
  // Fulfillment
  redeemedBy?: ObjectId;              // Admin/Partner who scanned QR
  
  // Idempotency
  idempotencyKey: string;             // Prevents duplicate purchases (unique)
  
  // Metadata (includes QR data)
  metadata?: {
    source?: 'marketplace' | 'reward';
    redemptionCode?: string;          // "ABC12345"
    qrCodeData?: string;              // Base64 QR image
    validUntil?: Date;
    commissionRate?: number;          // Partner's commission %
    grossValue?: number;
    partnerShare?: number;
    platformShare?: number;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Instance Methods
- `fulfill()` - Mark as fulfilled
- `cancel()` - Mark as cancelled
- `fail()` - Mark as failed

### Virtual Fields
- `isPending` - status === 'pending'
- `isFulfilled` - status === 'fulfilled'
- `processingTime` - fulfilledAt - redeemedAt (ms)

### Static Methods
- `findByUser(userId, options)` - User's redemption history
- `findPending(options)` - All pending redemptions

### Indexes
```javascript
{ userId: 1, redeemedAt: -1 }
{ status: 1, redeemedAt: -1 }
{ rewardId: 1, status: 1 }
{ idempotencyKey: 1 }                 // Unique
```

---

## 🔢 Code Model

Collection: `codes`

```typescript
interface ICode {
  _id: ObjectId;
  code: string;                       // Unique, uppercase
  
  // Type
  poolName?: string;                  // Optional pool name
  rewardId?: ObjectId;                // Optional - for reward codes
  
  // Promo Code Fields
  pointsValue?: number;               // Points to award (for promo codes)
  isActive?: boolean;
  isUsed?: boolean;
  
  // Status
  status: CodeStatus;                 // 'available' | 'reserved' | 'used' | 'expired'
  
  // Reservation
  reservedBy?: ObjectId;
  reservedAt?: Date;
  
  // Usage
  usedBy?: ObjectId;
  usedAt?: Date;
  
  // Expiration
  expiresAt?: Date;                   // TTL index
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Static Methods
- `findAvailable(rewardId, poolName)` - Find available code
- `reserveCode(rewardId, userId, poolName)` - Reserve a code for user

### Indexes
```javascript
{ code: 1 }                           // Unique
{ rewardId: 1, status: 1 }
{ poolName: 1, status: 1 }
{ expiresAt: 1 }                      // TTL index
```

---

## 🏢 Partner Model

Collection: `partners`

```typescript
interface IPartner {
  _id: ObjectId;
  name: string;                       // Max 100 chars
  description?: string;               // Max 500 chars
  
  // Branding
  logo?: string;                      // URL to logo
  website?: string;
  
  // Contact
  phone?: string;
  email?: string;
  
  // Business
  categories: string[];               // ['food', 'shopping', 'entertainment']
  
  // Multiple Locations
  locations: Array<{
    _id?: ObjectId;
    name: string;                     // Max 100 chars
    address: string;                  // Max 200 chars
    city: string;                     // Max 50 chars, indexed
    coordinates: [number, number];    // [longitude, latitude]
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
    features?: string[];              // ['parking', 'wifi', 'accessibility', 'delivery', 'takeaway', 'outdoor_seating', 'air_conditioning']
  }>;
  
  // Status
  isActive: boolean;
  
  // Contract
  contractStartDate?: Date;
  contractEndDate?: Date;
  commissionRate?: number;            // Platform commission percentage
  paymentTerms?: string;
  
  // Contact Person
  contactPerson?: {
    name: string;
    email: string;
    phone: string;
    position?: string;
  };
  
  // Business Hours
  businessHours?: {
    timezone: string;
    defaultHours: {
      open: string;
      close: string;
    };
  };
  
  // Social Media
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
  };
  
  // Documents
  documents?: {
    businessLicense?: string;
    taxId?: string;
    bankDetails?: string;
  };
  
  // Metrics
  metrics?: {
    totalRedemptions: number;
    totalRevenue: number;
    averageRating: number;
    lastActivityAt?: Date;
  };
  
  // Settings
  settings?: {
    autoApproveRedemptions: boolean;
    maxDailyRedemptions?: number;
    notificationPreferences: {
      email: boolean;
      sms: boolean;
      webhook?: string;
    };
  };
  
  // Tracking
  createdBy?: string;
  updatedBy?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes
```javascript
{ name: 1 }
{ 'locations.city': 1 }
{ 'locations.coordinates': '2dsphere' }
{ isActive: 1 }
```

---

## ⚡ PowerUp Model

Collection: `powerups`

```typescript
interface IPowerUp {
  _id: ObjectId;
  name: string;                       // Unique, max 50 chars
  description: string;                // Max 500 chars
  
  // Type
  type: 'radar_boost' | 'double_points' | 'speed_boost' | 'shield' | 'time_extension';
  icon: string;                       // Default '⚡'
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  
  // Duration
  durationMs: number;                 // 1000 - 3600000 (1 hour max)
  
  // Drop Configuration
  dropRate: number;                   // 0-100 percentage (default 10%)
  maxPerSession: number;              // Max per game session (default 3)
  maxInInventory: number;             // Max player can hold (default 10)
  
  // Effect Values
  effects: {
    radarBoost?: {
      radiusMultiplier: number;       // 1.0 - 5.0
    };
    doublePoints?: {
      pointsMultiplier: number;       // 1.5 - 10.0
    };
    speedBoost?: {
      speedMultiplier: number;        // 1.1 - 3.0
    };
    shield?: {
      damageMitigation: number;       // 0 - 1
    };
    timeExtension?: {
      additionalTimeMs: number;       // 1000 - 600000
    };
  };
  
  // Statistics
  totalCreated: number;
  totalClaimed: number;
  activeInstances: number;
  usageCount: number;
  claimRate: number;                  // 0-100
  adoptionRate: number;               // 0-100
  averageUsagePerSession: number;
  
  // Management
  enabled: boolean;
  createdBy: ObjectId;
  lastModifiedBy: ObjectId;
  notes?: string;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes
```javascript
{ name: 1 }                           // Unique
{ type: 1 }
{ enabled: 1 }
{ rarity: 1 }
```

---

## 🏅 Achievement Model

Collection: `achievements`

```typescript
interface IAchievement {
  _id: ObjectId;
  name: string;                       // Unique, max 100 chars
  description: string;                // Max 500 chars
  icon: string;
  
  // Classification
  category: AchievementCategory;      // 'explorer' | 'collector' | 'social' | 'master' | 'special'
  trigger: AchievementTrigger;        // When to check (see enum)
  
  // Condition
  condition: {
    type: AchievementConditionType;   // What to measure (see enum)
    target: number;                   // Target value (min 1)
    category?: string;                // For category-specific achievements
    rarity?: string;                  // For rarity-specific achievements
  };
  
  // Rewards
  rewards: Array<{
    type: AchievementRewardType;      // 'POINTS' | 'POWER_UP' | 'COSMETIC' | 'TITLE' | 'BADGE'
    value: any;                       // Reward value
    description?: string;
  }>;
  
  // Display
  isActive: boolean;
  isHidden: boolean;                  // Secret achievements
  order: number;                      // Display order
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Achievement Enums
enum AchievementCategory {
  EXPLORER = 'explorer',
  COLLECTOR = 'collector',
  SOCIAL = 'social',
  MASTER = 'master',
  SPECIAL = 'special',
}

enum AchievementTrigger {
  PRIZE_CLAIMED = 'PRIZE_CLAIMED',
  LEVEL_UP = 'LEVEL_UP',
  REWARD_REDEEMED = 'REWARD_REDEEMED',
  FRIEND_ADDED = 'FRIEND_ADDED',
  STREAK_MILESTONE = 'STREAK_MILESTONE',
  DISTANCE_MILESTONE = 'DISTANCE_MILESTONE',
  MANUAL = 'MANUAL',
}

enum AchievementConditionType {
  TOTAL_CLAIMS = 'TOTAL_CLAIMS',
  TOTAL_POINTS = 'TOTAL_POINTS',
  LEVEL_REACHED = 'LEVEL_REACHED',
  STREAK_DAYS = 'STREAK_DAYS',
  CATEGORY_CLAIMS = 'CATEGORY_CLAIMS',
  RARITY_CLAIMS = 'RARITY_CLAIMS',
  DISTANCE_TRAVELED = 'DISTANCE_TRAVELED',
  FRIENDS_COUNT = 'FRIENDS_COUNT',
  REWARDS_REDEEMED = 'REWARDS_REDEEMED',
}

enum AchievementRewardType {
  POINTS = 'POINTS',
  POWER_UP = 'POWER_UP',
  COSMETIC = 'COSMETIC',
  TITLE = 'TITLE',
  BADGE = 'BADGE',
}
```

### Indexes
```javascript
{ name: 1 }                           // Unique
{ category: 1 }
{ trigger: 1 }
{ isActive: 1 }
```

---

## 🏅 UserAchievement Model

Collection: `userachievements`

```typescript
interface IUserAchievement {
  _id: ObjectId;
  userId: ObjectId;
  achievementId: ObjectId;
  
  // Progress
  progress: number;                   // Current progress value
  completed: boolean;
  completedAt?: Date;
  
  // Reward Claim
  claimed: boolean;                   // Reward claimed
  claimedAt?: Date;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes
```javascript
{ userId: 1, achievementId: 1 }       // Unique compound
{ userId: 1, completed: 1 }
{ completedAt: -1 }
```

---

## 🔔 Notification Model

Collection: `notifications`

```typescript
interface INotification {
  _id: ObjectId;
  title: string;
  message: string;
  
  // Type & Target
  type: NotificationType;             // 'push' | 'email' | 'sms' | 'in_app'
  targetType: NotificationTargetType; // 'all' | 'user' | 'city' | 'level' | 'role'
  targetValue?: string;               // Specific target ID/value
  
  // Status & Scheduling
  status: NotificationStatus;         // 'draft' | 'scheduled' | 'sent' | 'failed' | 'cancelled'
  scheduledFor?: Date;
  sentAt?: Date;
  
  // Priority & Delivery
  priority?: number;                  // 1-5 (default 3)
  deliveryMethod?: 'push' | 'email' | 'inapp' | 'all';
  expiresAt?: Date;                   // TTL index
  
  // Channel Preferences Override
  channelPreferences?: {
    push?: boolean;
    email?: boolean;
    inApp?: boolean;
  };
  
  // Statistics
  statistics?: {
    totalTargets: number;
    deliveredCount: number;
    openedCount: number;
    clickedCount: number;
  };
  
  // Tracking
  createdBy: ObjectId;
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes
```javascript
{ createdAt: -1 }
{ status: 1, createdAt: -1 }
{ expiresAt: 1 }                      // TTL index
{ scheduledFor: 1 }
{ createdBy: 1 }
{ priority: -1 }
```

---

## 🔔 UserNotification Model

Collection: `usernotifications`

```typescript
interface IUserNotification {
  _id: ObjectId;
  userId: ObjectId;                   // Recipient
  notificationId: ObjectId;           // Reference to global notification
  
  // Delivery Status
  status: 'sent' | 'delivered' | 'opened' | 'archived';
  isRead: boolean;
  isDelivered: boolean;
  isArchived: boolean;
  
  // Timestamps
  deliveredAt?: Date;
  readAt?: Date;
  archivedAt?: Date;
  
  // Channel
  channel: 'push' | 'email' | 'inapp';
  deliveryToken?: string;             // FCM/APNS token used
  errorReason?: string;               // Delivery failure reason
  
  // Preferences at delivery time
  preferencesApplied: {
    push: boolean;
    email: boolean;
    inApp: boolean;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes
```javascript
{ userId: 1, createdAt: -1 }
{ userId: 1, isRead: 1 }
{ notificationId: 1, userId: 1 }      // Unique compound
```

---

## 🎮 Session Model

Collection: `sessions`

```typescript
interface ISession {
  _id: ObjectId;
  sessionId: string;                  // Unique session identifier
  userId: string;
  deviceId: string;
  platform: 'iOS' | 'Android' | 'Unity' | 'Web';
  appVersion: string;
  
  // Timing
  startTime: Date;
  endTime?: Date;
  duration?: number;                  // Seconds
  
  // Location
  initialLocation: {
    coordinates: [number, number];    // [longitude, latitude]
    accuracy?: number;
    address?: string;
  };
  finalLocation?: {
    coordinates: [number, number];
    accuracy?: number;
    address?: string;
  };
  
  // Location History
  locationUpdates: Array<{
    coordinates: [number, number];
    accuracy?: number;
    speed?: number;
    heading?: number;                 // 0-360
    timestamp: Date;
  }>;
  
  // Session Metrics
  metrics: {
    distanceTraveled: number;         // Meters
    prizesFound: number;
    claimsAttempted: number;
    claimsSuccessful: number;
    powerUpsUsed: number;
    challengesCompleted: number;
    averageSpeed: number;             // m/s
    maxSpeed: number;                 // m/s
    timeActive: number;               // Seconds (actually playing)
    timeIdle: number;                 // Seconds (stationary)
  };
  
  // Rewards Earned
  rewards: {
    basePoints: number;
    distanceBonus: number;
    timeBonus: number;
    discoveryBonus: number;
    challengeBonus: number;
    streakBonus: number;
    totalPoints: number;
  };
  
  // Anti-Cheat
  antiCheat: {
    speedViolations: number;
    teleportations: number;
    mockLocationDetected: boolean;
    suspiciousPatterns: string[];
    riskScore: number;
    flaggedForReview: boolean;
  };
  
  // Status
  status: 'active' | 'completed' | 'abandoned' | 'terminated';
  terminationReason?: string;
  
  // Device & Network Info
  networkInfo?: {
    connectionType: string;
    provider?: string;
    strength?: number;
  };
  deviceInfo?: {
    model?: string;
    osVersion?: string;
    batteryLevel?: number;
    isCharging?: boolean;
  };
  
  // Performance
  performance?: {
    averageFPS?: number;
    memoryUsage?: number;
    crashCount?: number;
    errorCount?: number;
  };
  
  // Gameplay
  gameplay?: {
    arModeUsed: boolean;
    mapModeUsed: boolean;
    tutorialCompleted?: boolean;
    featuresUsed: string[];
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes
```javascript
{ sessionId: 1 }                      // Unique
{ userId: 1, status: 1 }
{ status: 1, startTime: -1 }
{ 'initialLocation.coordinates': '2dsphere' }
```

---

## 👥 Friendship Model

Collection: `friendships`

```typescript
interface IFriendship {
  _id: ObjectId;
  userId: ObjectId;                   // Who sent request
  friendId: ObjectId;                 // Who received request
  
  // Status
  status: FriendshipStatus;           // 'pending' | 'accepted' | 'rejected' | 'blocked'
  message?: string;                   // Optional request message (max 500)
  
  // Timestamps
  requestedAt: Date;
  acceptedAt?: Date;
  rejectedAt?: Date;
  blockedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

enum FriendshipStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  BLOCKED = 'blocked',
}
```

### Instance Methods
- `accept()` - Accept friend request
- `reject()` - Reject friend request
- `block()` - Block user

### Indexes
```javascript
{ userId: 1, friendId: 1 }            // Unique compound
{ userId: 1, status: 1 }
{ friendId: 1, status: 1 }
```

---

## 📦 Distribution Model

Collection: `distributions`

```typescript
interface IDistribution {
  _id: ObjectId;
  name: string;
  description: string;
  
  // Target Area
  targetArea: {
    type: 'city' | 'polygon' | 'circle';
    coordinates: number[][];          // Varies by type
    city?: string;
    radius?: number;                  // For circle type
  };
  
  // Prize Template
  prizeTemplate: {
    name: string;
    description: string;
    type: PrizeType;
    category: PrizeCategory;
    points: number;
    rarity: PrizeRarity;
    imageUrl?: string;
  };
  
  // Quantity & Spacing
  quantity: number;                   // Min 1
  spacing: number;                    // Min 10 meters
  
  // Status
  status: DistributionStatus;         // 'draft' | 'active' | 'completed' | 'cancelled'
  
  // Undo Support
  undoExpiresAt?: Date;               // Can undo until this time
  
  // Tracking
  createdBy: ObjectId;
  
  // Metadata
  metadata?: Record<string, any>;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes
```javascript
{ status: 1 }
{ createdBy: 1 }
{ undoExpiresAt: 1 }
```

---

## 🧪 ABTest Model

Collection: `abtests`

```typescript
interface IABTest {
  _id: ObjectId;
  name: string;                       // Unique
  description?: string;
  
  // Type
  type: 'feature' | 'ui' | 'mechanics' | 'rewards' | 'pricing';
  status: 'draft' | 'active' | 'paused' | 'ended';
  
  // Variants
  variants: Array<{
    name: string;
    trafficAllocation: number;        // 0-100 percentage
    config: Record<string, any>;
    conversions: number;
    impressions: number;
  }>;
  
  // Metrics
  metrics: Array<{
    metricName: string;
    baseline: number;
    targetImprovement: number;
    significance: number;
    winner?: string;
  }>;
  
  // Timing
  startDate: Date;
  endDate?: Date;
  
  // Results
  winnerVariant?: string;
  sampleSize: number;                 // Default 1000
  confidenceLevel: number;            // Default 0.95 (95%)
  
  // Tracking
  createdBy: ObjectId;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes
```javascript
{ name: 1 }                           // Unique
{ status: 1, startDate: -1 }
{ type: 1 }
```

---

## 📝 AuditLog Model

Collection: `auditlogs`

```typescript
interface IAuditLog {
  _id: ObjectId;
  userId: ObjectId;                   // Who performed action
  
  // Action Details
  action: string;                     // Action name
  resource: string;                   // Resource type
  resourceId?: string;                // Specific resource ID
  
  // Context
  details: Record<string, any>;       // Action details
  ipAddress?: string;
  userAgent?: string;
  
  // Timestamp
  timestamp: Date;
  
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes
```javascript
{ userId: 1, timestamp: -1 }
{ action: 1 }
{ resource: 1, resourceId: 1 }
{ timestamp: -1 }
```

---

## ⚙️ Settings Model

Collection: `settings`

```typescript
interface ISettings {
  _id: ObjectId;
  key: string;                        // Unique setting key
  value: any;                         // Setting value
  type: SettingType;                  // 'string' | 'number' | 'boolean' | 'json'
  description?: string;
  isPublic: boolean;                  // Exposed to clients
  updatedBy: ObjectId;                // Admin who last updated
  
  createdAt: Date;
  updatedAt: Date;
}
```

### Indexes
```javascript
{ key: 1 }                            // Unique
{ isPublic: 1 }
```

---

## � Enums Reference

All enums used across the YallaCatch platform:

### User Enums

```typescript
// User Roles
enum UserRole {
  USER = 'user',
  PARTNER = 'partner',
  ADMIN = 'admin',
  SUPERADMIN = 'superadmin',
}

// User Levels (Progression Tiers)
enum UserLevel {
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum',
  DIAMOND = 'diamond',
}

// Platforms
enum Platform {
  IOS = 'iOS',
  ANDROID = 'Android',
  WEB = 'Web',
}

// Languages
enum Language {
  EN = 'en',
  FR = 'fr',
  AR = 'ar',
}

// Theme
enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
}
```

### Prize Enums

```typescript
// Prize Display Type
enum PrizeDisplayType {
  STANDARD = 'standard',
  MYSTERY_BOX = 'mystery_box',
  TREASURE = 'treasure',
  BONUS = 'bonus',
  SPECIAL = 'special',
}

// Prize Content Type
enum PrizeContentType {
  POINTS = 'points',
  REWARD = 'reward',
  HYBRID = 'hybrid',
}

// Prize Type
enum PrizeType {
  INSTANT = 'instant',
  COLLECTOR = 'collector',
  SEASONAL = 'seasonal',
  PARTNER = 'partner',
  EVENT = 'event',
}

// Prize Category
enum PrizeCategory {
  FOOD = 'food',
  SHOPPING = 'shopping',
  ENTERTAINMENT = 'entertainment',
  TRANSPORT = 'transport',
  SERVICES = 'services',
  SPECIAL = 'special',
  POINTS = 'points',
}

// Prize Rarity
enum PrizeRarity {
  COMMON = 'common',
  UNCOMMON = 'uncommon',
  RARE = 'rare',
  EPIC = 'epic',
  LEGENDARY = 'legendary',
}

// Prize Status
enum PrizeStatus {
  ACTIVE = 'active',
  CLAIMED = 'claimed',
  EXPIRED = 'expired',
  RESERVED = 'reserved',
  HIDDEN = 'hidden',
}

// Location Type
enum LocationType {
  FIXED = 'fixed',
  MOVING = 'moving',
  RANDOM = 'random',
}
```

### Reward & Redemption Enums

```typescript
// Reward Category
enum RewardCategory {
  PHYSICAL = 'physical',
  DIGITAL = 'digital',
  VOUCHER = 'voucher',
  EXPERIENCE = 'experience',
  PARTNER = 'partner',
}

// Redemption Status
enum RedemptionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
}

// Code Status
enum CodeStatus {
  ACTIVE = 'active',
  USED = 'used',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
  RESERVED = 'reserved',
}
```

### Notification Enums

```typescript
// Notification Type
enum NotificationType {
  SYSTEM = 'system',
  PRIZE = 'prize',
  REWARD = 'reward',
  ACHIEVEMENT = 'achievement',
  SOCIAL = 'social',
  PROMOTION = 'promotion',
  REMINDER = 'reminder',
  WARNING = 'warning',
}

// Notification Target Type
enum NotificationTargetType {
  ALL = 'all',
  SEGMENT = 'segment',
  INDIVIDUAL = 'individual',
}

// Notification Status
enum NotificationStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}
```

### Distribution & Settings Enums

```typescript
// Distribution Status
enum DistributionStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// Setting Type
enum SettingType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  JSON = 'json',
}
```

### Achievement Enums

```typescript
// Achievement Category
enum AchievementCategory {
  EXPLORER = 'explorer',
  COLLECTOR = 'collector',
  SOCIAL = 'social',
  MASTER = 'master',
  SPECIAL = 'special',
}

// Achievement Trigger
enum AchievementTrigger {
  AUTOMATIC = 'automatic',
  MANUAL = 'manual',
  EVENT = 'event',
}

// Achievement Condition Type
enum AchievementConditionType {
  TOTAL_CLAIMS = 'TOTAL_CLAIMS',
  TOTAL_POINTS = 'TOTAL_POINTS',
  LEVEL_REACHED = 'LEVEL_REACHED',
  STREAK_DAYS = 'STREAK_DAYS',
  RARITY_CLAIMED = 'RARITY_CLAIMED',
  CATEGORY_CLAIMS = 'CATEGORY_CLAIMS',
  FRIENDS_COUNT = 'FRIENDS_COUNT',
  PARTNER_VISITS = 'PARTNER_VISITS',
  DISTANCE_TRAVELED = 'DISTANCE_TRAVELED',
  SESSIONS_COUNT = 'SESSIONS_COUNT',
}

// Achievement Reward Type
enum AchievementRewardType {
  POINTS = 'POINTS',
  POWER_UP = 'POWER_UP',
  COSMETIC = 'COSMETIC',
  TITLE = 'TITLE',
  BADGE = 'BADGE',
}
```

### Friendship Enums

```typescript
// Friendship Status
enum FriendshipStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  BLOCKED = 'blocked',
}
```

### PowerUp Enums

```typescript
// PowerUp Type
enum PowerUpType {
  RADAR_BOOST = 'radar_boost',
  DOUBLE_POINTS = 'double_points',
  SPEED_BOOST = 'speed_boost',
  SHIELD = 'shield',
  TIME_EXTENSION = 'time_extension',
}

// PowerUp Rarity
enum PowerUpRarity {
  COMMON = 'common',
  RARE = 'rare',
  EPIC = 'epic',
  LEGENDARY = 'legendary',
}
```
---

## 📊 Relationships Diagram

```
┌───────
                          YallaCatch Data Model                               
───────────────────────────────┘

User (1) ──────┬──── (*) Claim ────────── (1) Prize
                                               
                (*) Redemption  (1) Reward
                                                   
                           (1) Code             │
               │                                     │
               ├──── (*) UserAchievement ──── (1) Achievement
               │
               ├──── (*) UserNotification ─── (1) Notification
               
                (*) Session (gameplay tracking)
               
                (*) Friendship  (1) User (friend)
               │
               └──── [inventory]
                     ├── (*) PowerUp instances
                      (*) Active effects

Prize (1)  (*) Claim
               
                (1) Partner (optional, via partnerId)
               
                (1) Reward (optional, via directReward.rewardId)
               
                Points reward (embedded, via pointsReward)

Reward (1)  (*) Redemption
               
                (1) Partner (optional, via partnerId)

Partner (1)  (*) Prize (prizes with partnerId)
               
                (*) Reward (partner-specific rewards)
               
                (*) Location (embedded array)
               
                (1) User (role: partner, optional link)

Achievement (1)  (*) UserAchievement

PowerUp (1)  Inventory items in User

Distribution (1)  (*) Prize (created via prizeTemplate)
                  
                   (1) User (createdBy admin)

ABTest (1)  User participation (tracked via user.abTests)

Notification (1)  (*) UserNotification (delivery per user)
                  
                   (1) User (createdBy admin)

Code (1)  (1) Reward (for reward codes)
               
                (1) Redemption (when used)
               
                (1) User (reservedBy, optional)

AuditLog (*)  (1) User (who performed action)

Settings  Global configuration (no direct relationships)
```

### Key Relationship Notes

1. **User  Claim  Prize**: User claims prizes, each claim links to one prize
2. **User  Redemption  Reward**: User redeems rewards using points
3. **Partner Rewards**: Rewards with `partnerId` are redeemable at partner locations
4. **Prize Content Types**:
   - `points`: Awards points via `pointsReward.amount`
   - `reward`: Links to specific reward via `directReward.rewardId`
   - `hybrid`: Both points and reward
5. **Stock Management**: Rewards use 3-tier stock (quantity/reserved/available)
6. **Multi-Location Partners**: Partners have `locations[]` array, each with coordinates
7. **Session Tracking**: Each gameplay session creates a Session document
8. **Friendship**: Bi-directional relationships with status workflow

---

##  Related Documentation

- [API_REFERENCE.md](./API_REFERENCE.md) - API endpoints
- [WEBSOCKET_EVENTS.md](./WEBSOCKET_EVENTS.md) - Real-time events
- [CONFIGURATION_GUIDE.md](./CONFIGURATION_GUIDE.md) - Database setup
- [QR_FULFILLMENT_WORKFLOW.md](./QR_FULFILLMENT_WORKFLOW.md) - Redemption flow