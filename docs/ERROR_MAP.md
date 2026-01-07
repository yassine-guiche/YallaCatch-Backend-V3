# YallaCatch API Error Map (Unity/Admin)

Consistent `error` codes returned in JSON responses (with optional `message` for human-readable context). Clients should branch on `error`, not on HTTP text.

- `INVALID_CREDENTIALS` — Auth failed (login, password).
- `ACCOUNT_BANNED` — User banned (check message/ban reason).
- `EMAIL_ALREADY_EXISTS` — Registration conflict.
- `DEVICE_ALREADY_REGISTERED` — Device tied to another account.
- `USER_NOT_FOUND` — User lookup failed.
- `INVALID_REFRESH_TOKEN` — Refresh token invalid/expired/revoked.
- `PRIZE_NOT_FOUND` — Prize missing.
- `PRIZE_NOT_AVAILABLE` — Prize claimed/expired/unavailable.
- `DISTANCE_TOO_FAR` — Claim distance exceeds allowed radius.
- `LOCATION_OUT_OF_BOUNDS` — Claim outside allowed region.
- `ANTI_CHEAT_VIOLATION` — Anti-cheat blocked the request.
- `COOLDOWN_ACTIVE` / `DAILY_LIMIT_EXCEEDED` — Claim throttled.
- `INSUFFICIENT_POINTS` — Not enough points for reward/redeem.
- `REWARD_NOT_FOUND` — Reward missing.
- `REWARD_NOT_AVAILABLE` / `OUT_OF_STOCK` — Reward unavailable/stock depleted.
- `REDEMPTION_NOT_FOUND` — Redemption missing.
- `FORBIDDEN` — Not allowed (role/ownership).
- `INVALID_PAYLOAD` — Payload validation failed.
- `UNKNOWN_ERROR` — Unclassified failure (check `message`).

Response shape (example):
```json
{
  "success": false,
  "error": "INVALID_CREDENTIALS",
  "message": "Login failed"
}
```

Guidelines for clients
- Branch on `error` code; display a localized message based on your own copy.
- Treat `UNKNOWN_ERROR` as generic failure; offer retry.
- Honor HTTP status: 4xx for client issues, 5xx for server issues.
- For marketplace/rewards/claims, expect normalized `error`/`message` across integration, rewards, and claims endpoints.***
