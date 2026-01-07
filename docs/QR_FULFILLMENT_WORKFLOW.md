# QR Code Fulfillment Workflow - YallaCatch

## Overview

This document explains how the reward/marketplace redemption fulfillment system works using QR codes.

## Flow Diagram

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   User      │    │  Backend    │    │   Admin/    │    │   Backend   │
│   (App)     │    │  (Purchase) │    │  Partner    │    │  (Fulfill)  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │                  │
       │  1. Purchase     │                  │                  │
       │  Request         │                  │                  │
       │─────────────────>│                  │                  │
       │                  │                  │                  │
       │  2. Returns      │                  │                  │
       │  QR Code + Code  │                  │                  │
       │<─────────────────│                  │                  │
       │                  │                  │                  │
       │  3. Shows QR     │                  │                  │
       │  to Partner      │                  │                  │
       │─────────────────────────────────────>                  │
       │                  │                  │                  │
       │                  │                  │  4. Scans QR     │
       │                  │                  │  Code            │
       │                  │                  │─────────────────>│
       │                  │                  │                  │
       │                  │                  │  5. Returns      │
       │                  │                  │  Fulfilled       │
       │                  │                  │<─────────────────│
       │                  │                  │                  │
```

## Step-by-Step Process

### 1. User Purchases Reward/Item

**Endpoint:** `POST /marketplace/purchase`

**Request:**
```json
{
  "itemId": "reward_id_here",
  "location": {
    "latitude": 33.5731,
    "longitude": -7.5898
  }
}
```

**Process:**
1. Validates user has sufficient points
2. Checks stock availability
3. Reserves a code from the Code pool (`Code.reserveCode()`)
4. Generates QR code containing redemption data
5. Creates Redemption record with status `PENDING`
6. Deducts points from user account
7. Updates stock

### 2. QR Code Structure

The QR code contains a Base64-encoded JSON object:

```json
{
  "type": "yallacatch_redemption",
  "code": "ABC12345",  // The actual redemption code
  "itemId": "reward_object_id",
  "timestamp": 1705123456789
}
```

**Stored in:**
- `Redemption.metadata.redemptionCode` - The alphanumeric code
- `Code` model - Links code to reward and user

### 3. Redemption Record Structure

```typescript
interface IRedemption {
  userId: ObjectId;           // Who purchased
  rewardId: ObjectId;         // What was purchased
  pointsSpent: number;        // How many points
  status: 'PENDING' | 'FULFILLED' | 'CANCELLED' | 'FAILED';
  codeId: ObjectId;           // Reference to Code model
  redeemedAt: Date;           // When purchased
  fulfilledAt?: Date;         // When redeemed at partner
  redeemedBy?: ObjectId;      // Admin/Partner who validated
  idempotencyKey: string;     // Prevents duplicate purchases
  metadata: {
    source: 'marketplace',
    redemptionCode: string,   // The actual code "ABC12345"
    commissionRate: number,
    grossValue: number,
    partnerShare: number,
    platformShare: number
  }
}
```

## QR Code Scanning Endpoints

### Admin QR Scan

**Endpoint:** `POST /admin/rewards/qr-scan`

**File:** `backend/src/modules/admin/routes/extra.routes.ts` (lines 638-653)

**Request:**
```json
{
  "qrCode": "ABC12345",
  "scannedBy": "admin_user_id"
}
```

**Process:**
```typescript
const redemption = await Redemption.findOneAndUpdate(
  { 
    'metadata.redemptionCode': qrCode, 
    status: 'pending' 
  },
  {
    status: 'fulfilled',
    fulfilledAt: new Date(),
    fulfilledBy: scannedBy
  },
  { new: true }
);
```

**Response:**
```json
{
  "success": true,
  "redemption": {
    "_id": "...",
    "status": "fulfilled",
    "fulfilledAt": "2025-01-15T10:30:00Z"
  }
}
```

### User Module QR Scan (Deprecated)

**Endpoint:** `POST /rewards/qr-scan`

**File:** `backend/src/modules/rewards/index.ts` (lines 500-600)

**Note:** This endpoint requires admin role and uses `RewardsService.scanQRCode()`.

## Status Flow

```
PENDING ────┬───> FULFILLED (via QR scan)
            │
            └───> CANCELLED (via admin action / timeout)
            │
            └───> FAILED (transaction error)
```

## Partner Settlement

When a redemption is created, the following financial metadata is calculated:

```typescript
const POINTS_TO_CURRENCY_RATE = 0.01; // 1 point = 0.01 MAD

const grossValue = pointsCost * POINTS_TO_CURRENCY_RATE;
const platformShare = grossValue * (partner.commissionRate / 100);
const partnerShare = grossValue - platformShare;

// Example: 1000 points, 15% commission
// grossValue = 1000 * 0.01 = 10 MAD
// platformShare = 10 * 0.15 = 1.5 MAD
// partnerShare = 10 - 1.5 = 8.5 MAD
```

## Admin Panel Integration

### Managing Redemptions

**Service:** `admin/src/services/redemptions.js`

**Functions:**
- `listRedemptions(filters)` - Get all redemptions with filters
- `updateRedemptionStatus(id, status)` - Update status
- `cancelRedemption(id)` - Cancel a redemption
- `getRedemptionStatistics()` - Get analytics

### QR Scanning UI (To Be Implemented)

For partner-facing QR scanning, you can use:
- Web camera with `html5-qrcode` library
- Mobile app with native camera
- Manual code entry field

## Security Considerations

1. **Code uniqueness:** Each redemption code is unique and linked to a specific purchase
2. **Status validation:** Only `PENDING` redemptions can be fulfilled
3. **Admin authorization:** QR scan endpoints require admin role
4. **Idempotency:** Each purchase has a unique idempotency key to prevent duplicates
5. **Time validation:** Consider adding expiry validation based on `metadata.validUntil`

## Database Indexes

```typescript
// Redemption indexes for fast lookups
redemptionSchema.index({ userId: 1, redeemedAt: -1 });
redemptionSchema.index({ status: 1, redeemedAt: -1 });
redemptionSchema.index({ rewardId: 1, status: 1 });
redemptionSchema.index({ 'metadata.redemptionCode': 1 }); // For QR scan lookup
```

## Related Files

- **Backend:**
  - `backend/src/modules/marketplace/routes.ts` - Purchase flow
  - `backend/src/modules/admin/routes/extra.routes.ts` - Admin QR scan
  - `backend/src/modules/rewards/index.ts` - Rewards QR scan service
  - `backend/src/models/Redemption.ts` - Redemption model
  - `backend/src/models/Code.ts` - Code pool model

- **Admin Panel:**
  - `admin/src/services/redemptions.js` - Redemption API calls
  - `admin/src/services/rewards.js` - Rewards/QR API calls
  - `admin/src/pages/RewardsManagement.jsx` - Rewards UI

## API Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/marketplace/purchase` | POST | User purchases item, gets QR code |
| `/marketplace/my-redemptions` | GET | User views their redemptions |
| `/admin/rewards/qr-scan` | POST | Partner/Admin validates QR code |
| `/admin/redemptions` | GET | Admin lists all redemptions |
| `/admin/redemptions/:id` | PUT | Admin updates redemption status |
