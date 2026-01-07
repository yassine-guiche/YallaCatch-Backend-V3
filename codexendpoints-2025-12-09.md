# YallaCatch Backend Endpoint Catalogue (2025-12-09)

This document catalogs all backend endpoints by module with their purpose, feature ownership, expected consumers, and utility. It is derived from a full-code scan (modules, services, middleware, config, types). Date-safe filename used instead of the invalid `codexendpoints09/12/2025` path.

**Legend**
- **Consumer**: U=Unity/Game client, A=Admin panel, B=Both.
- **Utility**: P=Player/game logic, C=Configuration, S=Sync, R=Reporting/Analytics, M=Moderation/Ops.

## Auth (/api/v1/auth) — B, P/M
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| POST /guest | Create guest session | Onboarding | U | P |
| POST /register | Email/password signup | Identity | U | P |
| POST /login | Login | Identity | B | P |
| POST /refresh | Refresh tokens | Identity | B | P |
| POST /logout | Logout | Identity | B | P |
| GET /me | Current user info | Identity | B | P |
| GET /profile | Profile fetch | Profile | B | P |
| PATCH /profile | Update profile | Profile | B | P |
| POST /verify-email | Verify email code | Verification | U | P |
| POST /resend-verification | Resend email code | Verification | U | P |
| POST /send-phone-verification | Send SMS code | Verification | U | P |
| POST /verify-phone | Verify phone | Verification | U | P |
| POST /change-password | Change password | Security | B | P |
| DELETE /account | Delete account | Compliance | B | M |
| GET /stats | Auth stats | Monitoring | A | R |
| POST /avatar | Upload/update avatar | Profile | U | P |
| GET /achievements | Auth-linked achievements | Gamification | U | P |

## Users (/api/v1/users) — U, P
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| GET /profile | Get user profile | Profile | U | P |
| PATCH /profile | Update user profile | Profile | U | P |
| GET /leaderboard | Global leaderboard | Social/Compete | U | P/R |
| GET /stats | User stats summary | Profile/Gamification | U | P/R |

## Prizes (/api/v1/prizes) — U, P
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| GET /nearby | Nearby prizes by location | Core capture | U | P |
| GET /city/:city | City prizes | Core capture | U | P |
| GET /:prizeId | Prize detail | Core capture | U | P |
| GET /search | Search prizes | Discovery | U | P |

## Capture (/api/v1/capture) — U, P
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| POST /attempt | Full AR capture (proximity + anti-cheat + claim/reward + progression) | Core capture | U | P |
| POST /validate | Pre-validate capture for UI | Core capture | U | P |
| GET /animation/:prizeId | Box animation config | Client UX | U | P |

## Claims (/api/v1/claims) — B, P/M
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| POST / | Create claim (capture result) | Claims | U | P |
| GET /my-claims | List my claims | Claims | U | P |
| GET /:claimId | Claim detail | Claims | U | P |
| GET /my-stats | Claim stats (user) | Claims | U | P/R |
| GET /admin/all | Admin claims listing | Moderation | A | M/R |

## Game (/api/v1/game) — U, P
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| POST /session/start | Start game session | Session | U | P |
| POST /session/end | End session | Session | U | P |
| POST /location | Update player location | Live map | U | P/S |
| GET /leaderboard | Leaderboard (type filter) | Competition | U | P/R |
| GET /map | Bounded prizes/map | Map | U | P |
| POST /power-ups/use | Use power-up | Power-ups | U | P |
| GET /challenges/daily | Daily challenges | Challenges | U | P |
| POST /challenges/complete | Complete challenge | Challenges | U | P |
| GET /inventory | Player inventory | Items | U | P |

## Social (/api/v1/social) — U, P
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| POST /friends/request | Send friend request | Friends | U | P |
| POST /friends/respond | Respond to request | Friends | U | P |
| GET /friends | List friends | Friends | U | P |
| POST /teams | Create team | Teams | U | P |
| POST /challenges | Create social challenge | Social challenges | U | P |
| GET /leaderboard | Social leaderboard | Social | U | P/R |
| POST /share | Share activity | Social | U | P |
| GET /profile/:userId | View other profile | Social | U | P |
| GET /nearby | Nearby players | Proximity | U | P |
| POST /friends/send | Send invite | Friends | U | P |
| POST /friends/accept/:friendshipId | Accept | Friends | U | P |
| POST /friends/reject/:friendshipId | Reject | Friends | U | P |
| DELETE /friends/:friendshipId | Remove | Friends | U | P |
| POST /friends/block/:friendshipId | Block | Moderation | U | M |
| GET /friends/requests/pending | Pending requests | Friends | U | P |
| GET /friends/requests/sent | Sent requests | Friends | U | P |
| GET /friends/status/:userId | Friendship status | Friends | U | P |
| GET /friends/count | Friend count | Friends | U | P/R |

## Gamification (/api/v1/gamification) — B, P/M
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| GET /achievements | List achievements | Gamification | U | P |
| GET /achievements/recent | Recent unlocked | Gamification | U | P |
| GET /achievements/all | Full catalog | Gamification | U | P |
| POST /achievements | Create achievement | Content | A | C |
| PUT /achievements/:achievementId | Update | Content | A | C |
| DELETE /achievements/:achievementId | Delete | Content | A | C |

## Rewards (/api/v1/rewards) — B, P/M
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| GET / | List rewards | Marketplace/Core | U | P |
| GET /search | Search rewards | Discovery | U | P |
| GET /:rewardId | Reward detail | Rewards | U | P |
| POST /:rewardId/redeem | Redeem reward | Rewards | U | P |
| GET /my-redemptions | My redemptions | Rewards | U | P |
| GET /categories | Reward categories | Rewards | U | P |
| GET /featured | Featured rewards | Rewards | U | P |
| POST /favorites | Add favorite | Rewards | U | P |
| DELETE /favorites/:rewardId | Remove favorite | Rewards | U | P |
| GET /favorites | List favorites | Rewards | U | P |
| GET /history | Redemption history | Rewards | U | P |
| POST /qr-scan | Fulfill via QR (core) | Fulfillment | B | M |
| GET /partners | Partner list | Rewards | U | P |
| GET /partners/:partnerId/locations | Partner locations | Rewards | U | P |

## Marketplace (/api/v1/marketplace) — B, P/M
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| GET / | Browse items | Marketplace | U | P |
| POST /purchase | Purchase item | Marketplace | U | P |
| GET /redemptions | View purchases/redemptions | Marketplace | U | P |
| POST /redeem | Redeem purchase | Marketplace | U | P |
| GET /analytics | Marketplace analytics (user-facing) | Marketplace | U | R |
| GET /categories | Categories | Marketplace | U | P |
| GET /featured | Featured items | Marketplace | U | P |
| GET /history | Purchase history | Marketplace | U | P |

## Notifications (/api/v1/notifications) — B, P/M
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| POST /admin/send | Send notification (admin) | Messaging | A | C/M |
| GET /admin | List sent notifications | Messaging | A | R |
| GET / | List my notifications | Messaging | U | P |
| PUT /read | Mark read | Messaging | U | P |
| GET /settings | Get notification prefs | Messaging | U | P/C |
| PUT /settings | Update prefs | Messaging | U | P/C |
| POST /push/subscribe | Register push | Messaging | U | S |
| DELETE /push/unsubscribe | Unregister push | Messaging | U | S |
| GET /stats | Notification stats | Messaging | B | R |

### Notifications push (/api/v1/notifications/push) — U, S
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| POST /register-device | Register device token | Push | U | S |
| POST /unregister-device | Remove device token | Push | U | S |
| PUT /preferences | Update push prefs | Push | U | P/C |
| GET /preferences | Get push prefs | Push | U | P/C |

## AdMob (/api/v1/admob) — B, C/R
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| GET /available | Check ad availability | Ads | U | P |
| POST /reward | Report ad reward | Ads | U | P/S |
| GET /stats | Ad stats | Ads | A | R |
| GET /analytics | Ad analytics | Ads | A | R |
| PATCH /config | Update ad config | Ads | A | C |
| GET /config | Fetch ad config | Ads | B | C |

## AR (/api/v1/ar) — U, P
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| POST /view/start | Start AR view session | AR session | U | P |
| POST /view/screenshot | Upload AR screenshot | AR session | U | P |
| POST /view/end | End AR session | AR session | U | P |
| GET /prize/:prizeId | AR prize config | AR content | U | P |

## Offline (/api/v1/offline) — U, S
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| POST /sync | Sync offline data | Offline | U | S |
| GET /status | Offline queue status | Offline | U | S |
| POST /retry | Retry failed queue | Offline | U | S |
| POST /data/download | Download offline bundle | Offline | U | S |
| GET /capabilities | Offline capabilities | Offline | U | S |
| POST /validate | Validate offline payload | Offline | U | S |

## Integration (/api/v1/integration) — B, R/S
| Path | Description | Feature | Consumer | Utility |
| --- | --- | --- | --- | --- |
| GET /react/users | React (admin) user data | Legacy/admin feed | A | R |
| GET /react/dashboard/analytics | React dashboard data | Legacy/admin feed | A | R |
| GET /unity/map | Map feed for Unity | Client sync | U | S |
| GET /unity/leaderboard | Leaderboard feed | Client sync | U | S |
| GET /health | Integration health | Ops | B | R |
| GET /marketplace/categories | Categories (integration) | Marketplace | B | S |
| GET /admin/marketplace/items | Admin marketplace feed | Marketplace | A | R |
| GET /marketplace | Integration marketplace list | Marketplace | B | S |
| GET /marketplace/history | Integration purchase history | Marketplace | B | S |

## Marketplace Admin (under /api/v1/admin, see Admin section) — A, C/M

## Admin (/api/v1/admin) — A, C/M/R
**Dashboard & Audit**
- GET /dashboard — summary stats
- GET /dashboard/real-time — real-time stats
- GET /audit-logs — audit logs
- GET /activity-logs, GET /activity-logs/statistics, DELETE /activity-logs/clear, GET /activity-logs/export, POST /activity-logs — activity logging

**Users**
- GET /users, GET /users/:userId, PATCH /users/:userId
- POST /users/:userId/ban, POST /users/:userId/unban
- POST /users/:userId/points — adjust points
- DELETE /users/:userId — soft delete

**Prizes**
- GET /prizes, GET /prizes/:prizeId, PATCH /prizes/:prizeId, DELETE /prizes/:prizeId
- POST /prizes, PUT /prizes/:id, DELETE /prizes/:id (admin creation/update flows)

**Capture/Claims**
- GET /captures, POST /captures/:id/validate, POST /captures/:id/reject
- GET /captures/analytics, GET /captures/stats
- GET /captures/reports, POST /captures/reports
- GET /claims, GET /claims/:id, PATCH /claims/:id/validate, GET /claims/stats

**Rewards/Marketplace**
- GET /rewards, GET /rewards/analytics, POST /rewards, PATCH /rewards/:rewardId, DELETE /rewards/:rewardId, PATCH /rewards/:id/stock
- POST /rewards/qr-scan — fulfill via QR
- Marketplace items: GET /marketplace/items, POST /marketplace/items, PUT /marketplace/items/:id, GET /marketplace/items/:id, DELETE /marketplace/items/:id
- Marketplace redemptions: GET /marketplace/redemptions, PATCH /marketplace/redemptions/:id/validate
- Marketplace stats: GET /marketplace/stats

**Redemptions (core)**
- GET /redemptions, POST /redemptions/:id/validate

**Achievements**
- GET /achievements, GET /achievements/:id, POST /achievements, PUT /achievements/:id, DELETE /achievements/:id
- POST /achievements/unlock — force unlock for user

**Notifications**
- GET /notifications, POST /notifications/send, POST /notifications/broadcast
- POST /notifications/schedule, GET /notifications/stats

**Partners**
- GET /partners, GET /partners/:id, POST /partners, PUT /partners/:id, DELETE /partners/:id

**Distribution**
- GET /distribution/settings, PUT /distribution/settings
- GET /distribution/history, POST /distribution/trigger
- Prize distribution helpers: POST /place, POST /batch, POST /single, POST /bulk, POST /auto, GET /distribution/analytics, POST /manage/:distributionId

**Reports/Moderation**
- GET /reports, GET /reports/:id, PATCH /reports/:id/resolve, PATCH /reports/:id/dismiss, GET /reports/stats

**Sessions**
- GET /sessions/active, DELETE /sessions/:id, GET /sessions/stats

**Friendships moderation**
- GET /friendships, DELETE /friendships/:id

**Codes**
- GET /codes, POST /codes/generate, PATCH /codes/:id/deactivate

**AR Sessions**
- GET /ar-sessions, GET /ar-sessions/stats

**Offline Queue**
- GET /offline-queue, DELETE /offline-queue/clear

**Device Tokens**
- GET /device-tokens, DELETE /device-tokens/:id, GET /device-tokens/stats

**Analytics**
- GET /analytics (general), POST /analytics/generate
- GET /analytics/users, GET /analytics/prizes, GET /analytics/business, GET /analytics/heatmap

**Settings/System**
- GET /settings, PATCH /settings
- GET /system/health, GET /system/metrics, GET /system/logs
- POST /system/backup, POST /system/restore
- POST /maintenance/start, POST /maintenance/stop
- POST /backup/create

**Notifications (admin-side)**
- Covered above; scheduling/broadcast supported.

## Ad hoc Integration/Legacy Admin feeds (under /integration and /admin) — A/B, R
Already listed under Integration and Admin.

## Configuration / Middleware / Services Reviewed
- Rate limiting: distributed-rate-limit middleware applied to auth-sensitive/admin routes.
- Auth middleware: authenticate/requireAdmin across admin, capture stats, etc.
- Anti-cheat: CaptureService.performAdvancedAntiCheat + ProximityService; not configurable via admin yet.
- Progression: ProgressionService used in capture; level config likely in services/progression.ts.
- CORS, compression, logging, Redis/Mongo config validated; JWT keys required via env.
- Notification service, push service, friendship service, distribution service, prize/reward services all integrated via admin routes.

## Gaps / Admin coverage observations
- Game tuning (power-ups, challenge definitions, map density, anti-cheat thresholds, progression level tables) are not exposed via admin endpoints; consider adding admin-configurable settings for these knobs.
- Capture anti-cheat thresholds (speed, per-minute caps, light/tracking tolerances) are hard-coded; expose to admin settings for live ops.
- Offline sync policy and retry limits are not admin-configurable.
- Unity integration endpoints (integration/unity/*) should be documented to clients and guarded if needed; ensure consistent error mapping with ERROR_MAP.
- Health/metrics exist, but no admin control for cache invalidation or rebuilding geospatial indexes.

## TODO (follow-up)
- Add admin controls for: progression levels, anti-cheat thresholds, power-up/challenge configs, offline policies, map/density knobs.
- Ensure admin panel consumes all admin endpoints above (especially distribution, QR fulfill, codes, device tokens, offline queue).
- Align integration/unity endpoints with ERROR_MAP and rate limits.
- Add docs for env requirements (JWT keys, Redis URL, Mongo URI) alongside endpoint usage for clients.

