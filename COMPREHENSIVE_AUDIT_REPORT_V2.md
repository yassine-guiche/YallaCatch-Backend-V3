# Comprehensive Cross-Functional Audit Report (v2)

**Date:** January 5, 2026  
**Auditor:** GitHUb Copilot (Gemini 3 Pro)  
**Project:** YallaCatch (Backend, Admin, Partner Portal, Unity SDK)

---

## 1. Executive Summary

The **YallaCatch** ecosystem architecture is generally robust, employing a modular NestJS/Fastify backend with MongoDB. However, critical integration mismatches exist between the **Backend**, **Admin Panel**, and **Unity SDK** that will block key functionality if not addressed before production.

**Status:** 🟠 **Partial Blocker** (Admin Prize Creation & Unity Location Updates are broken)

---

## 2. Section-by-Section Audit

### 2.1 Backend Services & APIs
*   **Architecture:** Modular structure (Game, Prizes, Rewards, Auth) is 90% solid. Uses strict Zod validation.
*   **Database:** MongoDB with GeoJSON for location is standard and correct.
*   **Security:** Rate-limiting, Anti-Cheat, and Role-Based Access Control (RBAC) are implemented.
*   **Observations:** 
    *   `findNearbyPrizes` method returns a streamlined object that omits `location` data, causing alignment issues with the Unity SDK.

### 2.2 Admin Panel
*   **Technology:** React + Vite.
*   **Services:** `admin/src/services/prizes.js` is outdated relative to backend schema.
*   **Partner Portal:** Functional for managing locations (`PartnerPortal.jsx`), but limited in scope (no campaign management visible, just checking locations and redemptions).
*   **Critical Fault:** The "Create Prize" form in Admin sends a flat JSON structure (`latitude`, `longitude`, `radius`), but the Backend (`createPrizeSchema`) demands a nested `location` object. **This feature is currently broken.**

### 2.3 Partner Portal
*   **Functionality:**
    *   Location Management: **Verified**. Hits `/rewards/partners/me/location`.
    *   QR Redemption: **Verified**. Hits `/rewards/qr-scan`.
*   **Gap:** No functionality to create "Rewards" or "Prizes" directly. Partners rely on Admins or static config? If self-service is expected, it is missing.

### 2.4 Unity Game Integration
*   **SDK Status:** `unity-game-sdk.cs` is well-structured but has data contract mismatches.
*   **Game Session:** `startGameSession` is **Compatible**.
*   **Map Data:** `getMapData` is **Compatible** (Correctly maps `coordinates` to `position`).
*   **Location Updates:** `updateLocation` is **BROKEN**.
    *   Backend returns prizes via `findNearbyPrizes` WITHOUT coordinates.
    *   Unity SDK expects `nearbyPrizes` to contain `position`.
    *   **Result:** Players will see "Nearby Prizes" in the list/UI but AR/Map view updates during movement will fail to place them in the world.

---

## 3. Mismatch & Inconsistency List

| Severity | Component 1 | Component 2 | Issue | Impact |
| :--- | :--- | :--- | :--- | :--- |
| 🔴 **Critical** | **Admin Panel** | **Backend API** | Prize Creation Schema Mismatch. Admin sends flat lat/lng; Backend expects `{ location: { ... } }`. | **Admin cannot create prizes.** |
| 🔴 **Critical** | **Backend (Game)** | **Unity SDK** | `updateLocation` response missing prize coordinates. Backend returns `distance` only; SDK expects `position`. | **AR/Map won't show prizes discovered while moving.** |
| 🟡 **Medium** | **Backend** | **Unity SDK** | `getMapData` response missing `description` field for prizes. | Detail view in game may be empty/crash. |
| 🟡 **Medium** | **Partner Portal** | **Backend** | Partner Portal assumes `isActive` is updateable. Backend allows it, but validation is loose. | Partner might disable a location but game caches it. |

---

## 4. Risk Assessment & Blockers

1.  **Blocker: Admin Prize Management**
    *   You cannot populate the game world with prizes using the current Admin Panel build.
    *   *Fix Required:* Update `admin/src/services/prizes.js` to structure the payload correctly.

2.  **Blocker: Game Loop Integrity (AR)**
    *   Running around with the game open calls `updateLocation`. The response finds prizes but doesn't tell the game *where* they are.
    *   *Fix Required:* Update `findNearbyPrizes` in `backend/src/modules/game/index.ts` to include `position: { lat, lng }`.

3.  **Risk: Unity SDK Deserialize Errors**
    *   If Unity uses `Newtonsoft.Json`, missing fields might be ignored (null), leading to null reference exceptions in C# scripts when accessing `prize.position.lat`.

---

## 5. Improvement Suggestions & Skill Requirements

### Priority 1: Fix Data Contracts (Frontend/Backend Dev)
*   **Task:** Refactor `backend/src/modules/game/index.ts` (Method: `findNearbyPrizes`).
*   **Task:** Refactor `admin/src/services/prizes.js` (Method: `createPrize`).

### Priority 2: Enhance Partner Portal (Full-Stack Dev)
*   **Task:** Allow Partners to view their efficient/redeemed prizes stats (currently stubbed).
*   **Task:** Add "Campaign" management if Partners should control their own Prize distribution.

### Priority 3: Unity SDK Robustness (Unity Dev)
*   **Task:** Add client-side validation in `unity-game-sdk.cs`.
*   **Task:** Handle missing fields gracefully (e.g., if `position` is null, don't spawn AR object, just show in notification list).

---

## 6. Required Actions to Proceed

1.  **Approve Fixes:** Authorize the refactoring of `admin/src/services/prizes.js` and `backend/src/modules/game/index.ts`.
2.  **Update SDK:** Once backend is fixed, verify `unity-game-sdk.cs` matches the new `findNearbyPrizes` output.
3.  **Test Run:** Perform a full cycle:
    *   Create Prize in Admin (verify DB entry).
    *   Start Game Session (Unity).
    *   Walk (Simulate Location Update).
    *   Verify Prize appears in AR/Map.
