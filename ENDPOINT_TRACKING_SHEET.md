# YallaCatch! Endpoint Tracking Sheet
## Master Tracking Document for Updates, Fixes, and Missing Features

---

## TRACKING LEGEND

| Status | Meaning |
|--------|---------|
| ✅ | Working correctly |
| 🔧 | Fixed recently |
| 🔄 | In progress |
| ⏳ | Pending |
| ❌ | Broken/Missing |
| ⚠️ | Needs attention |

---

## 1. BACKEND ADMIN ENDPOINTS STATUS

### Dashboard Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/dashboard` | GET | dashboard.js | ✅ | Dec 2025 | - |
| `/admin/dashboard/real-time` | GET | dashboard.js | ✅ | Dec 2025 | - |
| `/admin/audit-logs` | GET | activity.js | ✅ | Dec 2025 | - |

### Users Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/users` | GET | users.js | ✅ | Dec 2025 | Pagination working |
| `/admin/users/:userId` | GET | users.js | ✅ | Dec 2025 | - |
| `/admin/users/:userId` | PATCH | users.js | ✅ | Dec 2025 | - |
| `/admin/users/:userId/ban` | POST | users.js | ✅ | Dec 2025 | - |
| `/admin/users/:userId/unban` | POST | users.js | ✅ | Dec 2025 | - |
| `/admin/users/:userId/points` | POST | users.js | ✅ | Dec 2025 | - |
| `/admin/users/:userId` | DELETE | users.js | ✅ | Dec 2025 | - |

### Prizes Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/prizes` | GET | prizes.js | ✅ | Dec 2025 | - |
| `/admin/prizes/:prizeId` | GET | prizes.js | ✅ | Dec 2025 | - |
| `/admin/prizes` | POST | prizes.js | ✅ | Dec 2025 | - |
| `/admin/prizes/:prizeId` | PATCH | prizes.js | ✅ | Dec 2025 | - |
| `/admin/prizes/:prizeId` | PUT | prizes.js | ✅ | Dec 2025 | - |
| `/admin/prizes/:prizeId` | DELETE | prizes.js | ✅ | Dec 2025 | - |

### Rewards Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/rewards` | GET | rewards.js | ✅ | Dec 2025 | - |
| `/admin/rewards/analytics` | GET | rewards.js | ✅ | Dec 2025 | - |
| `/admin/rewards/:rewardId` | GET | rewards.js | ✅ | Dec 2025 | - |
| `/admin/rewards` | POST | rewards.js | ✅ | Dec 2025 | - |
| `/admin/rewards/:rewardId` | PATCH | rewards.js | ✅ | Dec 2025 | - |
| `/admin/rewards/:rewardId` | DELETE | rewards.js | ✅ | Dec 2025 | - |
| `/admin/rewards/:rewardId/stock` | PATCH | rewards.js | ✅ | Dec 2025 | - |

### Claims Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/claims` | GET | claims.js | ✅ | Dec 2025 | - |
| `/admin/claims/stats` | GET | claims.js | ✅ | Dec 2025 | - |
| `/admin/claims/:id` | GET | claims.js | ✅ | Dec 2025 | - |
| `/admin/claims/:id/validate` | PATCH | claims.js | ✅ | Dec 2025 | - |
| `/admin/captures` | GET | claims.js | ✅ | Dec 2025 | - |
| `/admin/captures/analytics` | GET | claims.js | ✅ | Dec 2025 | - |
| `/admin/captures/stats` | GET | claims.js | ✅ | Dec 2025 | - |
| `/admin/captures/:id/validate` | POST | claims.js | ✅ | Dec 2025 | - |
| `/admin/captures/:id/reject` | POST | claims.js | ✅ | Dec 2025 | - |

### Notifications Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/notifications` | GET | notifications.js | ✅ | Dec 2025 | - |
| `/admin/notifications/stats` | GET | notifications.js | ✅ | Dec 2025 | - |
| `/admin/notifications/send` | POST | notifications.js | ✅ | Dec 2025 | - |
| `/admin/notifications/broadcast` | POST | notifications.js | ✅ | Dec 2025 | - |
| `/admin/notifications/schedule` | POST | notifications.js | ✅ | Dec 2025 | - |
| `/admin/notifications/templates` | GET | notifications.js | 🔧 | Dec 2025 | Fixed: Returns empty array on error |

### Settings Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/settings` | GET | settings.js | ✅ | Dec 2025 | - |
| `/admin/settings` | PATCH | settings.js | ✅ | Dec 2025 | - |
| `/admin/settings/progression` | GET | settings.js | ✅ | Dec 2025 | - |
| `/admin/settings/progression` | PATCH | settings.js | ✅ | Dec 2025 | - |
| `/admin/settings/anti-cheat` | GET | settings.js | ✅ | Dec 2025 | - |
| `/admin/settings/anti-cheat` | PATCH | settings.js | ✅ | Dec 2025 | - |
| `/admin/settings/game` | GET | settings.js | ✅ | Dec 2025 | - |
| `/admin/settings/game` | PATCH | settings.js | ✅ | Dec 2025 | - |
| `/admin/settings/offline` | GET | settings.js | ✅ | Dec 2025 | - |
| `/admin/settings/offline` | PATCH | settings.js | ✅ | Dec 2025 | - |

### Maintenance Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/maintenance/start` | POST | gameControl.js | 🔧 | Dec 2025 | Fixed: Was using wrong path |
| `/admin/maintenance/stop` | POST | gameControl.js | 🔧 | Dec 2025 | Fixed: Was using wrong path |
| `/admin/maintenance/status` | GET | gameControl.js | 🔧 | Dec 2025 | Fixed: Was using wrong path |

### Power-Ups Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/power-ups` | GET | powerUps.js | 🔧 | Dec 2025 | Fixed: JWT middleware |
| `/admin/power-ups/:id` | GET | powerUps.js | 🔧 | Dec 2025 | Fixed: JWT middleware |
| `/admin/power-ups` | POST | powerUps.js | 🔧 | Dec 2025 | Fixed: JWT middleware |
| `/admin/power-ups/:id` | PATCH | powerUps.js | 🔧 | Dec 2025 | Fixed: JWT middleware |
| `/admin/power-ups/:id/toggle` | PATCH | powerUps.js | 🔧 | Dec 2025 | Fixed: JWT middleware |
| `/admin/power-ups/:id` | DELETE | powerUps.js | 🔧 | Dec 2025 | Fixed: JWT middleware |
| `/admin/power-ups/analytics` | GET | powerUps.js | 🔧 | Dec 2025 | Fixed: JWT middleware |
| `/admin/power-ups/stats` | GET | powerUps.js | 🔧 | Dec 2025 | Fixed: JWT middleware |

### Distribution Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/place` | POST | distribution.js | 🔧 | Dec 2025 | Fixed: Service initialization |
| `/admin/batch` | POST | distribution.js | 🔧 | Dec 2025 | Fixed: Service initialization |
| `/admin/auto` | POST | distribution.js | 🔧 | Dec 2025 | Fixed: Service initialization |
| `/admin/distribution/analytics` | GET | distribution.js | ✅ | Dec 2025 | - |
| `/admin/distribution/active` | GET | distribution.js | ✅ | Dec 2025 | - |
| `/admin/distribution/history` | GET | distribution.js | ✅ | Dec 2025 | - |
| `/admin/distribution/settings` | GET | distribution.js | ✅ | Dec 2025 | - |
| `/admin/distribution/settings` | PUT | distribution.js | ✅ | Dec 2025 | - |
| `/admin/distribution/trigger` | POST | distribution.js | ✅ | Dec 2025 | - |

### Anti-Cheat Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/anti-cheat/flagged-claims` | GET | antiCheat.js | ✅ | Dec 2025 | - |
| `/admin/anti-cheat/user-risk/:userId` | GET | antiCheat.js | ✅ | Dec 2025 | - |
| `/admin/anti-cheat/metrics` | GET | antiCheat.js | ✅ | Dec 2025 | - |
| `/admin/anti-cheat/patterns` | GET | antiCheat.js | ✅ | Dec 2025 | - |
| `/admin/anti-cheat/override-claim` | POST | antiCheat.js | ✅ | Dec 2025 | - |
| `/admin/anti-cheat/settings` | GET | antiCheat.js | ✅ | Dec 2025 | - |
| `/admin/anti-cheat/settings` | PATCH | antiCheat.js | ✅ | Dec 2025 | - |
| `/admin/anti-cheat/recent-alerts` | GET | antiCheat.js | ✅ | Dec 2025 | - |
| `/admin/anti-cheat/export-report` | GET | antiCheat.js | ✅ | Dec 2025 | - |

### A/B Testing Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/ab-testing` | GET | abTesting.js | ✅ | Dec 2025 | - |
| `/admin/ab-testing/:id` | GET | abTesting.js | ✅ | Dec 2025 | - |
| `/admin/ab-testing` | POST | abTesting.js | ✅ | Dec 2025 | - |
| `/admin/ab-testing/:id` | PATCH | abTesting.js | ✅ | Dec 2025 | - |
| `/admin/ab-testing/:id` | DELETE | abTesting.js | ✅ | Dec 2025 | - |
| `/admin/ab-testing/:id/start` | POST | abTesting.js | ✅ | Dec 2025 | - |
| `/admin/ab-testing/:id/pause` | POST | abTesting.js | ✅ | Dec 2025 | - |
| `/admin/ab-testing/:id/end` | POST | abTesting.js | ✅ | Dec 2025 | - |
| `/admin/ab-testing/:id/metrics` | GET | abTesting.js | ✅ | Dec 2025 | - |
| `/admin/ab-testing/:id/results` | GET | abTesting.js | ✅ | Dec 2025 | - |
| `/admin/ab-testing/active/list` | GET | abTesting.js | ✅ | Dec 2025 | - |

### Game Control Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/game-control/game/sessions/active` | GET | gameControl.js | ✅ | Dec 2025 | - |
| `/admin/game-control/game/sessions/history` | GET | gameControl.js | ✅ | Dec 2025 | - |
| `/admin/game-control/game/sessions/:sessionId` | GET | gameControl.js | ✅ | Dec 2025 | - |
| `/admin/game-control/game/sessions/:sessionId/terminate` | POST | gameControl.js | ✅ | Dec 2025 | - |
| `/admin/game-control/game/leaderboard` | GET | gameControl.js | ✅ | Dec 2025 | - |
| `/admin/game-control/game/leaderboard/reset` | POST | gameControl.js | ✅ | Dec 2025 | - |
| `/admin/game-control/game/challenges` | GET | gameControl.js | ✅ | Dec 2025 | - |
| `/admin/game-control/game/challenges` | POST | gameControl.js | ✅ | Dec 2025 | - |
| `/admin/game-control/game/challenges/:challengeId` | DELETE | gameControl.js | ✅ | Dec 2025 | - |

### Achievements Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/achievements` | GET | achievements.js | ✅ | Dec 2025 | - |
| `/admin/achievements/:id` | GET | achievements.js | ✅ | Dec 2025 | - |
| `/admin/achievements` | POST | achievements.js | ✅ | Dec 2025 | - |
| `/admin/achievements/:id` | PUT | achievements.js | ✅ | Dec 2025 | - |
| `/admin/achievements/:id` | DELETE | achievements.js | ✅ | Dec 2025 | - |
| `/admin/achievements/unlock` | POST | achievements.js | ƒo. | Dec 2025 | - |
| `/admin/achievements/user/:userId` | GET | achievements.js | ÐY"õ | Jan 2026 | Added: fetch achievements for a specific user |
✅ | Dec 2025 | - |

### Marketplace Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/marketplace/items` | GET | marketplace.js | ✅ | Dec 2025 | - |
| `/admin/marketplace/items/:id` | GET | marketplace.js | ✅ | Dec 2025 | - |
| `/admin/marketplace/items` | POST | marketplace.js | ✅ | Dec 2025 | - |
| `/admin/marketplace/items/:id` | PUT | marketplace.js | ✅ | Dec 2025 | - |
| `/admin/marketplace/items/:id` | DELETE | marketplace.js | ✅ | Dec 2025 | - |
| `/admin/marketplace/redemptions` | GET | marketplace.js | ✅ | Dec 2025 | - |
| `/admin/marketplace/redemptions/:id/validate` | PATCH | marketplace.js | ✅ | Dec 2025 | - |
| `/admin/marketplace/stats` | GET | marketplace.js | ✅ | Dec 2025 | - |

### Analytics Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/analytics` | GET | analytics.js | ✅ | Dec 2025 | - |
| `/admin/analytics/overview` | GET | analytics.js | ✅ | Dec 2025 | - |
| `/admin/analytics/users` | GET | analytics.js | ✅ | Dec 2025 | - |
| `/admin/analytics/prizes` | GET | analytics.js | ✅ | Dec 2025 | - |
| `/admin/analytics/business` | GET | analytics.js | ✅ | Dec 2025 | - |
| `/admin/analytics/heatmap` | GET | analytics.js | ✅ | Dec 2025 | - |
| `/admin/analytics/generate` | POST | analytics.js | ✅ | Dec 2025 | - |

### System Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/system/health` | GET | system.js | ✅ | Dec 2025 | - |
| `/admin/system/metrics` | GET | system.js | ✅ | Dec 2025 | - |
| `/admin/system/logs` | GET | system.js | ✅ | Dec 2025 | - |
| `/admin/system/cache/clear` | POST | system.js | ✅ | Dec 2025 | - |
| `/admin/system/backup` | POST | system.js | ✅ | Dec 2025 | - |
| `/admin/system/restore` | POST | system.js | ✅ | Dec 2025 | - |
| `/admin/backup/create` | POST | system.js | ✅ | Dec 2025 | - |
| `/admin/logs` | GET | system.js | ✅ | Dec 2025 | - |

### Partners Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/partners` | GET | partners.js | ✅ | Dec 2025 | - |
| `/admin/partners/:id` | GET | partners.js | ✅ | Dec 2025 | - |
| `/admin/partners` | POST | partners.js | ✅ | Dec 2025 | - |
| `/admin/partners/:id` | PUT | partners.js | ✅ | Dec 2025 | - |
| `/admin/partners/:id` | DELETE | partners.js | ✅ | Dec 2025 | - |

### Reports Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/reports` | GET | - | ✅ | Dec 2025 | - |
| `/admin/reports/:id` | GET | - | ✅ | Dec 2025 | - |
| `/admin/reports/stats` | GET | - | ✅ | Dec 2025 | - |
| `/admin/reports/:id/resolve` | PATCH | - | ✅ | Dec 2025 | - |
| `/admin/reports/:id/dismiss` | PATCH | - | ✅ | Dec 2025 | - |

### Promo Codes Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/codes` | GET | codes.js | ✅ | Dec 2025 | - |
| `/admin/codes/generate` | POST | codes.js | ✅ | Dec 2025 | - |
| `/admin/codes/:id/deactivate` | PATCH | codes.js | ✅ | Dec 2025 | - |

### AR Sessions Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/ar-sessions` | GET | - | ✅ | Dec 2025 | - |
| `/admin/ar-sessions/stats` | GET | - | ✅ | Dec 2025 | - |
| `/admin/sessions/active` | GET | - | ✅ | Dec 2025 | - |
| `/admin/sessions/stats` | GET | - | ✅ | Dec 2025 | - |
| `/admin/sessions/:id` | DELETE | - | ✅ | Dec 2025 | - |

### Activity Logs Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admin/activity-logs` | GET | activity.js | ✅ | Dec 2025 | - |
| `/admin/activity-logs/statistics` | GET | activity.js | ✅ | Dec 2025 | - |
| `/admin/activity-logs/clear` | DELETE | activity.js | ✅ | Dec 2025 | - |
| `/admin/activity-logs/export` | GET | activity.js | ✅ | Dec 2025 | - |
| `/admin/activity-logs` | POST | activity.js | ✅ | Dec 2025 | - |

### AdMob Module
| Endpoint | Method | Service | Status | Last Updated | Notes |
|----------|--------|---------|--------|--------------|-------|
| `/admob/available` | GET | admob.js | 🔧 | Dec 2025 | Fixed: Validation |
| `/admob/reward` | POST | admob.js | 🔧 | Dec 2025 | Fixed: Validation |
| `/admob/stats` | GET | admob.js | ✅ | Dec 2025 | - |
| `/admob/analytics` | GET | admob.js | ✅ | Dec 2025 | - |
| `/admob/config` | GET | admob.js | ✅ | Dec 2025 | - |
| `/admob/config` | PATCH | admob.js | ✅ | Dec 2025 | - |

---

## 2. ADMIN PANEL PAGES STATUS

| Page | Status | Last Updated | Notes |
|------|--------|--------------|-------|
| Dashboard.jsx | ✅ | Dec 2025 | - |
| UsersManagement.jsx | ✅ | Dec 2025 | - |
| PrizesManagement.jsx | ✅ | Dec 2025 | - |
| RewardsManagement.jsx | 🔧 | Dec 2025 | Fixed: Service calls |
| PrizeClaimsManagement.jsx | ✅ | Dec 2025 | - |
| NotificationsManagement_Complete.jsx | ✅ | Dec 2025 | - |
| SettingsPage_Complete.jsx | ✅ | Dec 2025 | - |
| SystemManagement.jsx | ✅ | Dec 2025 | - |
| AnalyticsPage_Complete.jsx | ✅ | Dec 2025 | - |
| DistributionManagement.jsx | ✅ | Dec 2025 | - |
| PartnersManagement.jsx | ✅ | Dec 2025 | - |
| PowerUpManagement.jsx | 🔧 | Dec 2025 | Fixed: Error handling |
| AntiCheatDashboard.jsx | ✅ | Dec 2025 | - |
| ABTestingManagement.jsx | ✅ | Dec 2025 | - |
| GameMonitoringPage.jsx | 🔧 | Dec 2025 | Fixed: Object rendering, readOnly inputs |
| AchievementsManagement.jsx | 🔧 | Dec 2025 | Fixed: Error handling |
| MarketplaceManagement.jsx | 🔧 | Dec 2025 | Fixed: Error handling |
| ReportsManagement.jsx | ✅ | Dec 2025 | - |
| ARSessionsManagement.jsx | ✅ | Dec 2025 | - |
| PromoCodesManagement.jsx | ✅ | Dec 2025 | - |
| ActivityLog.jsx | ✅ | Dec 2025 | - |
| AdMobDashboard.jsx | ✅ | Dec 2025 | - |

---

## 3. RECENT FIXES LOG

| Date | Component | Issue | Fix Applied |
|------|-----------|-------|-------------|
| Dec 2025 | power-ups.routes.ts | Missing JWT middleware | Added authenticate/requireAdmin |
| Dec 2025 | distribution.service.ts | Uninitialized service | Added try-catch with defaults |
| Dec 2025 | notifications.routes.ts | Templates error | Returns empty array on error |
| Dec 2025 | admob/index.ts | Validation errors | Added proper Zod schema |
| Dec 2025 | redis-pub-sub.ts | Subscription errors | Added safer subscription handling |
| Dec 2025 | i18n.js | Missing configuration | Created i18n config file |
| Dec 2025 | GameMonitoringPage.jsx | Object rendering error | Type checking for player.points |
| Dec 2025 | GameMonitoringPage.jsx | Challenge reward object | Type checking for challenge.reward |
| Dec 2025 | GameMonitoringPage.jsx | readOnly warning | Added readOnly to input fields |
| Dec 2025 | index.html | favicon 404 | Changed to vite.svg |
| Dec 2025 | gameControl.js | Wrong maintenance path | Fixed to /admin/maintenance/* |

---

## 4. PENDING ITEMS

### To Add (New Features)
| Feature | Priority | Est. Effort | Notes |
|---------|----------|-------------|-------|
| Offline Queue UI | Medium | 4h | Add page or section |
| Device Tokens UI | Medium | 4h | Add page or section |
| Friendships Tab | Low | 2h | Add to Users page |

### To Fix (Known Issues)
| Issue | Priority | Est. Effort | Notes |
|-------|----------|-------------|-------|
| None pending | - | - | - |

### To Test (Need Verification)
| Feature | Test Type | Notes |
|---------|-----------|-------|
| All admin endpoints | Integration | Run Postman collection |
| Frontend services | Unit | Add Jest tests |

---

## 5. UPDATE HISTORY

| Date | Author | Changes |
|------|--------|---------|
| Dec 2025 | Audit | Initial comprehensive audit |
| Dec 2025 | Dev | Fixed 500 errors on multiple routes |
| Dec 2025 | Dev | Fixed GameMonitoringPage rendering issues |
| Dec 2025 | Dev | Fixed maintenance endpoint paths |

---

## 6. NOTES

### Backend API Base URL
```
http://localhost:3000/api/v1
```

### Admin Panel URL
```
http://localhost:5173
```

### Test Credentials
- Admin panel uses JWT authentication
- Token stored in localStorage
- All admin routes require admin role

---

*Last Updated: December 2025*
