# YallaCatch! API Reference

**Version**: 2.0.2  
**Base URL**: `http://localhost:3000/api/v1`  
**Last Updated**: January 2026

---

## 📋 Table of Contents

1. [Authentication](#authentication)
2. [User Endpoints](#user-endpoints)
3. [Prizes Endpoints](#prizes-endpoints)
4. [Claims/Captures Endpoints](#claimscaptures-endpoints)
5. [Rewards/Marketplace Endpoints](#rewardsmarketplace-endpoints)
6. [Social Endpoints](#social-endpoints)
7. [Power-Ups Endpoints](#power-ups-endpoints)
8. [Notifications Endpoints](#notifications-endpoints)
9. [Admin Endpoints](#admin-endpoints)
10. [WebSocket Events](#websocket-events)

---

## 🔐 Authentication

All protected endpoints require a JWT Bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### POST `/auth/register`
Register a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123",
  "displayName": "Player Name",
  "deviceId": "device-uuid-here",
  "platform": "android",
  "fcmToken": "optional-fcm-token"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "displayName": "Player Name",
      "level": "bronze",
      "totalPoints": 0,
      "currentPoints": 0
    },
    "accessToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```

### POST `/auth/login`
Login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecureP@ss123",
  "deviceId": "device-uuid-here",
  "platform": "android"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "displayName": "Player Name",
      "level": "gold",
      "totalPoints": 15000,
      "currentPoints": 12500
    },
    "accessToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token"
  }
}
```

### POST `/auth/guest`
Create an anonymous guest account.

**Request:**
```json
{
  "deviceId": "device-uuid-here",
  "platform": "android",
  "fcmToken": "optional-fcm-token",
  "location": {
    "lat": 36.8065,
    "lng": 10.1815,
    "city": "Tunis"
  }
}
```

### POST `/auth/refresh`
Refresh an expired access token.

**Request:**
```json
{
  "refreshToken": "jwt_refresh_token"
}
```

### POST `/auth/logout`
Logout and invalidate tokens.

**Headers:** `Authorization: Bearer <token>`

---

## 👤 User Endpoints

### GET `/users/me`
Get current user's profile.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user_id",
    "email": "user@example.com",
    "displayName": "Player Name",
    "avatar": "avatar_url",
    "level": "gold",
    "totalPoints": 15000,
    "currentPoints": 12500,
    "totalClaims": 150,
    "streakDays": 7,
    "statistics": {
      "prizesClaimed": 150,
      "pointsEarned": 15000,
      "achievementsUnlocked": 12
    },
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

### PATCH `/users/me`
Update current user's profile.

**Request:**
```json
{
  "displayName": "New Name",
  "avatar": "new_avatar_url"
}
```

### GET `/users/me/statistics`
Get detailed user statistics.

### GET `/users/me/achievements`
Get user's unlocked achievements.

### GET `/users/me/power-ups`
Get user's available power-ups.

---

## 🎁 Prizes Endpoints

### GET `/prizes/nearby`
Get prizes near a location.

**Query Parameters:**
- `lat` (required): Latitude
- `lng` (required): Longitude  
- `radius` (optional): Search radius in km (default: 5)
- `limit` (optional): Max results (default: 50)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "prize_id",
      "name": "Coffee Voucher",
      "description": "Free coffee at Partner Cafe",
      "points": 100,
      "displayType": "standard",
      "location": {
        "type": "Point",
        "coordinates": [10.1815, 36.8065]
      },
      "distance": 45.2,
      "partnerId": "partner_id",
      "partnerName": "Partner Cafe",
      "claimRadius": 50,
      "expiresAt": "2026-01-31T23:59:59Z"
    }
  ]
}
```

### GET `/prizes/:id`
Get specific prize details.

### GET `/prizes/zones`
Get active prize distribution zones.

---

## 🏆 Claims/Captures Endpoints

### POST `/claims/capture`
Capture/claim a prize.

**Request:**
```json
{
  "prizeId": "prize_id",
  "location": {
    "lat": 36.8065,
    "lng": 10.1815,
    "accuracy": 10,
    "altitude": 50,
    "speed": 1.2
  },
  "deviceInfo": {
    "platform": "android",
    "osVersion": "13",
    "appVersion": "1.0.0",
    "deviceModel": "Samsung Galaxy S21"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "captureId": "capture_id",
    "pointsAwarded": 100,
    "bonusPoints": 10,
    "newTotal": 12610,
    "newLevel": "gold",
    "levelUp": false,
    "achievements": [],
    "powerUpsGranted": []
  }
}
```

### GET `/claims/history`
Get user's claim history.

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `startDate` (optional): Filter start date
- `endDate` (optional): Filter end date

### GET `/claims/cooldowns`
Get active cooldowns for the user.

### GET `/claims/daily-status`
Get daily claim limit status.

---

## 🛒 Rewards/Marketplace Endpoints

### GET `/marketplace/items`
Get available marketplace items.

**Query Parameters:**
- `category` (optional): Filter by category
- `partnerId` (optional): Filter by partner
- `minPoints` (optional): Minimum points cost
- `maxPoints` (optional): Maximum points cost
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "reward_id",
      "name": "Free Pizza",
      "description": "Get a free pizza at Pizza Partner",
      "pointsCost": 500,
      "category": "food",
      "partnerId": "partner_id",
      "partnerName": "Pizza Partner",
      "stock": 50,
      "imageUrl": "image_url",
      "validUntil": "2026-03-31T23:59:59Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### GET `/marketplace/items/:id`
Get specific marketplace item.

### POST `/marketplace/purchase`
Purchase a reward item.

**Request:**
```json
{
  "itemId": "reward_id",
  "location": {
    "latitude": 36.8065,
    "longitude": 10.1815
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "redemptionId": "redemption_id",
    "qrCode": "base64_qr_image",
    "redemptionCode": "ABC12345",
    "pointsSpent": 500,
    "remainingPoints": 12000,
    "validUntil": "2026-02-01T23:59:59Z"
  }
}
```

### GET `/marketplace/my-redemptions`
Get user's redemption history.

---

## 👥 Social Endpoints

### GET `/social/friends`
Get user's friends list.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "friend_id",
      "displayName": "Friend Name",
      "avatar": "avatar_url",
      "level": "platinum",
      "status": "online",
      "friendSince": "2025-06-01T00:00:00Z"
    }
  ]
}
```

### POST `/social/friends/add`
Send a friend request.

**Request:**
```json
{
  "userId": "target_user_id"
}
```

### POST `/social/friends/accept`
Accept a friend request.

### POST `/social/friends/reject`
Reject a friend request.

### DELETE `/social/friends/:friendId`
Remove a friend.

### GET `/social/leaderboard`
Get leaderboard.

**Query Parameters:**
- `type`: `global`, `friends`, `weekly`, `monthly`
- `limit` (optional): Number of results

**Response:**
```json
{
  "success": true,
  "data": {
    "rankings": [
      {
        "rank": 1,
        "userId": "user_id",
        "displayName": "Top Player",
        "level": "diamond",
        "totalPoints": 100000,
        "avatar": "avatar_url"
      }
    ],
    "userRank": 42,
    "userEntry": {
      "rank": 42,
      "userId": "current_user_id",
      "displayName": "You",
      "totalPoints": 12500
    }
  }
}
```

---

## ⚡ Power-Ups Endpoints

### GET `/power-ups/available`
Get available power-ups for purchase.

### GET `/power-ups/inventory`
Get user's power-up inventory.

### POST `/power-ups/activate`
Activate a power-up.

**Request:**
```json
{
  "powerUpId": "powerup_id",
  "location": {
    "lat": 36.8065,
    "lng": 10.1815
  }
}
```

### GET `/power-ups/active`
Get user's currently active power-ups.

---

## 🔔 Notifications Endpoints

### GET `/notifications`
Get user's notifications.

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `unreadOnly` (optional): Filter unread only

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "notification_id",
      "type": "prize_nearby",
      "title": "Prize Alert!",
      "message": "A treasure chest appeared nearby!",
      "data": {
        "prizeId": "prize_id",
        "distance": 100
      },
      "read": false,
      "createdAt": "2026-01-06T10:00:00Z"
    }
  ],
  "unreadCount": 5
}
```

### PATCH `/notifications/:id/read`
Mark notification as read.

### PATCH `/notifications/read-all`
Mark all notifications as read.

### PUT `/notifications/settings`
Update notification preferences.

---

## 🛡️ Admin Endpoints

See [ENDPOINT_TRACKING_SHEET.md](../ENDPOINT_TRACKING_SHEET.md) for complete admin endpoints.

### Key Admin Modules:

| Module | Prefix | Description |
|--------|--------|-------------|
| Dashboard | `/admin/dashboard` | Real-time stats & metrics |
| Users | `/admin/users` | User management, ban/unban, points |
| Prizes | `/admin/prizes` | Prize CRUD, distribution |
| Rewards | `/admin/rewards` | Reward items, stock management |
| Claims | `/admin/claims` | Capture validation/rejection |
| Notifications | `/admin/notifications` | Push & in-app notifications |
| Settings | `/admin/settings` | Game configuration |
| Partners | `/admin/partners` | Partner management |
| Analytics | `/admin/analytics` | Reports & exports |
| Anti-Cheat | `/admin/anti-cheat` | Fraud detection |
| Game Control | `/admin/game-control` | Sessions, challenges |

---

## 📡 WebSocket Events

Connect to WebSocket at: `ws://localhost:3000` or `wss://api.yallacatch.tn`

### Connection
```javascript
const socket = io('ws://localhost:3000', {
  auth: { token: 'jwt_access_token' }
});
```

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `join_game` | `{ sessionId }` | Join game session |
| `update_location` | `{ lat, lng, accuracy }` | Update player location |
| `subscribe_prizes` | `{ lat, lng, radius }` | Subscribe to nearby prizes |
| `ping` | `{ timestamp }` | Keep-alive |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `prize_appeared` | `{ prize }` | New prize nearby |
| `prize_claimed` | `{ prizeId, claimedBy }` | Prize was claimed |
| `prize_expired` | `{ prizeId }` | Prize expired |
| `points_updated` | `{ newTotal, delta, reason }` | User points changed |
| `level_up` | `{ newLevel, rewards }` | User leveled up |
| `notification` | `{ notification }` | New notification |
| `achievement_unlocked` | `{ achievement }` | Achievement earned |
| `friend_activity` | `{ friendId, action }` | Friend did something |
| `balance_update` | `{ currentPoints, totalPoints }` | Balance changed |

---

## 📊 Level System

The level system uses string-based levels (not numeric):

| Level | Min Total Points | Badge Color |
|-------|------------------|-------------|
| `bronze` | 0 | 🥉 Bronze |
| `silver` | 1,000 | 🥈 Silver |
| `gold` | 5,000 | 🥇 Gold |
| `platinum` | 15,000 | 💎 Platinum |
| `diamond` | 50,000 | 💠 Diamond |

---

## ⚠️ Error Codes

See [ERROR_MAP.md](./ERROR_MAP.md) for complete error codes.

Common errors:

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `INVALID_CREDENTIALS` | 401 | Login failed |
| `ACCOUNT_BANNED` | 403 | User is banned |
| `PRIZE_NOT_FOUND` | 404 | Prize doesn't exist |
| `DISTANCE_TOO_FAR` | 400 | Not close enough to claim |
| `COOLDOWN_ACTIVE` | 429 | Must wait before claiming |
| `DAILY_LIMIT_EXCEEDED` | 429 | Hit daily claim limit |
| `INSUFFICIENT_POINTS` | 400 | Not enough points |
| `OUT_OF_STOCK` | 400 | Reward out of stock |

---

## 🔗 Related Documentation

- [CONFIGURATION_GUIDE.md](./CONFIGURATION_GUIDE.md) - Environment setup
- [ERROR_MAP.md](./ERROR_MAP.md) - Error codes reference
- [QR_FULFILLMENT_WORKFLOW.md](./QR_FULFILLMENT_WORKFLOW.md) - QR redemption flow
- [INTEGRATION_GUIDE.md](../backend/INTEGRATION_GUIDE.md) - SDK integration
- [UNITY_GAME_DEVELOPMENT_PLAN.md](../UNITY_GAME_DEVELOPMENT_PLAN.md) - Unity implementation
