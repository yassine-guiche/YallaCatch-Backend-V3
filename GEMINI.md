# YallaCatch v3.0 - Project Knowledge & Mandates

## 🚀 Project Vision
**YallaCatch v3.0** is a premium, geolocation-based commercial gaming ecosystem (similar to Pokémon GO but for real-world retail rewards). It connects players (Unity App) with commercial partners (Retailers) through a robust backend and sophisticated Admin/Partner portals.

## 🛠️ Technology Stack
- **Backend:** Node.js (TypeScript), Mongoose (MongoDB), Redis, WebSocket (Real-time).
- **Frontend (Admin & Partner):** React, Vite, TailwindCSS, Recharts, Leaflet (Maps).
- **Game Client:** Unity (C#).
- **Networking:** REST API + WebSocket (Live Signal).

## 📡 Unity Hub & Networking Mandates
**CRITICAL:** The Backend acts as the server-side authority for the Unity Game Client.
1.  **JSON Transformation (Mongoose `toJSON`):**
    -   **Coordinates:** Must always be flattened from GeoJSON `[lng, lat]` to root-level `{ lat: number, lng: number }` in API responses for Unity compatibility.
    -   **IDs:** All `ObjectId` fields (especially `_id`) must be stringified.
    -   **Typing:** Use `: any` casting in transformation methods if necessary to bypass strict TS checks for these runtime props.
2.  **Level Logic:**
    -   `User.level` (String '1'-'5'): Used for Unity Game Logic/Physics.
    -   `User.levelName` (Enum 'bronze'...'diamond'): Used for Admin UI/Branding.
3.  **Image Handling:**
    -   Frontend utility `getImageUrl` must dynamically extract the origin from `VITE_API_URL` to correctly resolve relative `/uploads/` paths in both Dev and Prod.

## 🎨 Premium UI/UX Standards
The Admin & Partner panels are **"Command Centers"**, not just tables.
-   **Aesthetic:** "Premium Rich" - Deep Gradients (Indigo, Emerald, Amber, Rose), Backdrop Blurs, Rounded corners (`rounded-[2rem]`), and high-contrast typography.
-   **Live Feedback:** UI must pulse/animate to reflect WebSocket activity ("Live Signal").
-   **Components:** Never remove complex UI elements (Drawers, Modals, Multi-selects) during cleanup.
    -   **Dashboards:** Rich stat cards with trend badges and real-time health strips.
    -   **Maps:** Full-screen capable, custom markers (colored based on category/rarity).

## 🏢 Business Logic Domains

### 👤 User Management (Base Joueurs)
-   **Identity:** Tracked by Unity ID, Email, and Device Model.
-   **Moderation:**
    -   **Ban:** Hard exclusion (prevents Login).
    -   **Suspension:** Temporary freeze.
    -   **Points:** Manual injection/deduction via Admin Modal (requires reason).
-   **Profile Drawer:** Must show "Technical Specifications" (Last IP, Device, Last Active Signal) alongside Game Stats (Claims, Streak).

### 🎁 Prizes (Arsenal)
-   **Assets:** Physical items, Digital Vouchers, or Mystery Boxes dropped on the map.
-   **Geolocation:**
    -   **Radius:** Detection range in meters.
    -   **Deployment:** Single point or **"Batch Distribution"** (mass deployment in a radius).
-   **Rarity:** Common, Uncommon, Rare, Epic, Legendary (Color-coded badges).
-   **Lifecycle:** Active -> Captured -> Redeemed/Expired.

### 🤝 Partners (Commercial Network)
-   **Structure:** Partner Entity -> Multiple Locations (Points of Sale).
-   **Portal:** Separate frontend for partners to validate player redemptions.
-   **Credentials:** Admins generate/reset credentials; Partners login to track their own stats.
-   **Validation:** "Live Signal" tracking of redemptions (Pending -> Fulfilled).

### 🛒 Marketplace
-   **Economy:** Players spend earned points on items.
-   **Inventory:** Real-time stock tracking (`stockAvailable` vs `stockQuantity`).
-   **Workflow:**
    -   Partners submit items -> Status `pending`.
    -   Admins Approve/Reject -> Status `active`.
-   **Sponsoring:** Items can be branded with a Partner's logo/identity.

## 🛡️ Operational Protocols
1.  **Linting & Cleanup:**
    -   **Surgical Only:** Never delete UI code or logic to fix a lint error.
    -   **Unused Vars:** Prefix with `_` or use `// eslint-disable` if the variable represents future intent or structural integrity.
2.  **Safety:**
    -   Never commit secrets.
    -   Protect `.env` and `node_modules`.
3.  **State Preservation:**
    -   Always verify `npm run build` after changes.
    -   Use `git status` to track drift.

## 🔮 Future Roadmap (Knowledge Retention)
-   **Unity Hub Sync:** Future updates will require tighter bi-directional sync for "Live Events".
-   **Anti-Cheat:** Enhanced detection for GPS spoofing (already partially implemented in Backend middleware).
