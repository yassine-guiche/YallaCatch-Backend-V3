# YallaCatch! Unity Game Development - Complete Implementation Plan

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [Unity Game Architecture](#unity-game-architecture)
3. [Backend API Documentation](#backend-api-documentation)
4. [Admin Panel Control Guide](#admin-panel-control-guide)
5. [Implementation Phases](#implementation-phases)
6. [Technical Specifications](#technical-specifications)
7. [Testing & Quality Assurance](#testing-quality-assurance)

---

## 🎮 Project Overview

**YallaCatch!** is a location-based AR mobile game where users explore Tunisia, capture virtual prizes, earn points, and redeem real rewards from local partners.

### Core Game Loop
1. **Exploration** → User walks around real-world locations
2. **Discovery** → AR camera detects nearby prizes on map
3. **Capture** → AR interaction to claim the prize
4. **Rewards** → Points accumulated, levels gained
5. **Redemption** → Exchange points for real rewards from partners

### Key Technologies
- **Unity 2022.3 LTS** (Game Engine)
- **AR Foundation** (Cross-platform AR)
- **Leaflet/OpenStreetMap** (Testing phase - WebView map)
- **Google Maps SDK** (Production - Native map)
- **AdMob SDK** (Monetization)
- **Backend API** (Node.js/Fastify + MongoDB)
- **WebSocket** (Real-time communication)

---

## 🗺️ Map Implementation Strategy

### Phase 1: Leaflet WebView (Testing) ✅ RECOMMENDED FIRST
Use the same Leaflet/OpenStreetMap setup as Admin Panel for rapid testing.

**Advantages:**
- Same tile provider as admin panel (consistent visuals)
- Free, no API key required
- Quick to implement via WebView
- Works offline with cached tiles
- Tunisia-focused (same as admin)

**Unity Implementation:**
```csharp
// LeafletMapController.cs - WebView-based Leaflet map
using UnityEngine;
using UnityEngine.UI;

public class LeafletMapController : MonoBehaviour
{
    [Header("WebView Settings")]
    public RawImage mapDisplay;
    public string leafletUrl = "https://your-domain.com/unity-map.html";
    
    // Tunisia center (same as admin panel)
    private Vector2 tunisCenter = new Vector2(36.8065f, 10.1815f);
    
    private WebViewObject webView;
    
    void Start()
    {
        InitializeWebView();
    }
    
    void InitializeWebView()
    {
        #if UNITY_ANDROID || UNITY_IOS
        webView = gameObject.AddComponent<WebViewObject>();
        webView.Init(
            cb: (msg) => HandleWebViewMessage(msg),
            err: (msg) => Debug.LogError($"WebView Error: {msg}"),
            httpErr: (msg) => Debug.LogError($"HTTP Error: {msg}"),
            started: (msg) => Debug.Log($"WebView Started: {msg}"),
            hooked: (msg) => Debug.Log($"WebView Hooked: {msg}"),
            ld: (msg) => OnMapLoaded()
        );
        
        // Set WebView margins (fullscreen or custom)
        webView.SetMargins(0, 0, 0, 0);
        webView.SetVisibility(true);
        
        // Load the Leaflet map page
        webView.LoadURL(leafletUrl);
        #endif
    }
    
    void OnMapLoaded()
    {
        Debug.Log("Leaflet map loaded!");
        // Center on user location or Tunisia
        CenterMap(tunisCenter.x, tunisCenter.y, 13);
    }
    
    // JavaScript bridge methods
    public void CenterMap(float lat, float lng, int zoom)
    {
        webView?.EvaluateJS($"centerMap({lat}, {lng}, {zoom});");
    }
    
    public void AddPrizeMarker(string prizeId, float lat, float lng, string type, int points)
    {
        webView?.EvaluateJS($"addPrizeMarker('{prizeId}', {lat}, {lng}, '{type}', {points});");
    }
    
    public void RemovePrizeMarker(string prizeId)
    {
        webView?.EvaluateJS($"removePrizeMarker('{prizeId}');");
    }
    
    public void ShowPlayerLocation(float lat, float lng)
    {
        webView?.EvaluateJS($"showPlayerLocation({lat}, {lng});");
    }
    
    public void ShowCaptureRadius(float lat, float lng, float radiusMeters)
    {
        webView?.EvaluateJS($"showCaptureRadius({lat}, {lng}, {radiusMeters});");
    }
    
    void HandleWebViewMessage(string msg)
    {
        // Handle messages from JavaScript
        // Format: "action:data" e.g., "markerClick:prize_123"
        var parts = msg.Split(':');
        if (parts.Length >= 2)
        {
            switch (parts[0])
            {
                case "markerClick":
                    OnPrizeMarkerClicked(parts[1]);
                    break;
                case "mapClick":
                    var coords = parts[1].Split(',');
                    OnMapClicked(float.Parse(coords[0]), float.Parse(coords[1]));
                    break;
            }
        }
    }
    
    void OnPrizeMarkerClicked(string prizeId)
    {
        Debug.Log($"Prize clicked: {prizeId}");
        // Navigate to AR capture or show prize details
    }
    
    void OnMapClicked(float lat, float lng)
    {
        Debug.Log($"Map clicked at: {lat}, {lng}");
    }
}
```

**HTML Template for WebView (unity-map.html):**
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        * { margin: 0; padding: 0; }
        html, body, #map { width: 100%; height: 100%; }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        // Initialize map centered on Tunisia (same as admin panel)
        var map = L.map('map').setView([36.8065, 10.1815], 13);
        
        // OpenStreetMap tiles (same as admin panel)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(map);
        
        // Prize markers storage
        var prizeMarkers = {};
        var playerMarker = null;
        var captureCircle = null;
        
        // Color scheme matching admin panel
        var typeColors = {
            'mystery_box': '#8B5CF6',
            'treasure': '#D97706',
            'bonus': '#059669',
            'special': '#DB2777',
            'standard': '#3B82F6'
        };
        
        // Custom prize icon (matching admin panel style)
        function createPrizeIcon(type, points) {
            var color = typeColors[type] || '#6B7280';
            return L.divIcon({
                html: `<div style="
                    background-color: ${color};
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    color: white;
                    font-weight: bold;
                ">${points}</div>`,
                className: 'prize-marker',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });
        }
        
        // Player location icon
        var playerIcon = L.divIcon({
            html: `<div style="
                background-color: #3B82F6;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                border: 4px solid white;
                box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
            "></div>`,
            className: 'player-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        
        // Unity bridge functions
        function centerMap(lat, lng, zoom) {
            map.setView([lat, lng], zoom);
        }
        
        function addPrizeMarker(prizeId, lat, lng, type, points) {
            if (prizeMarkers[prizeId]) {
                map.removeLayer(prizeMarkers[prizeId]);
            }
            
            var marker = L.marker([lat, lng], {
                icon: createPrizeIcon(type, points)
            }).addTo(map);
            
            marker.on('click', function() {
                // Send message to Unity
                Unity.call('markerClick:' + prizeId);
            });
            
            prizeMarkers[prizeId] = marker;
        }
        
        function removePrizeMarker(prizeId) {
            if (prizeMarkers[prizeId]) {
                map.removeLayer(prizeMarkers[prizeId]);
                delete prizeMarkers[prizeId];
            }
        }
        
        function showPlayerLocation(lat, lng) {
            if (playerMarker) {
                playerMarker.setLatLng([lat, lng]);
            } else {
                playerMarker = L.marker([lat, lng], { icon: playerIcon }).addTo(map);
            }
        }
        
        function showCaptureRadius(lat, lng, radius) {
            if (captureCircle) {
                map.removeLayer(captureCircle);
            }
            captureCircle = L.circle([lat, lng], {
                radius: radius,
                color: '#3B82F6',
                fillColor: '#3B82F6',
                fillOpacity: 0.1,
                weight: 2
            }).addTo(map);
        }
        
        function clearAllPrizes() {
            for (var id in prizeMarkers) {
                map.removeLayer(prizeMarkers[id]);
            }
            prizeMarkers = {};
        }
        
        // Map click handler
        map.on('click', function(e) {
            Unity.call('mapClick:' + e.latlng.lat + ',' + e.latlng.lng);
        });
    </script>
</body>
</html>
```

**Integration with Prize API:**
```csharp
// Load prizes from backend and display on Leaflet map
public class LeafletPrizeManager : MonoBehaviour
{
    public LeafletMapController mapController;
    
    public async void LoadNearbyPrizes(float lat, float lng, float radiusKm)
    {
        var prizes = await YallaCatchClient.Instance.GetNearbyPrizes(lat, lng, radiusKm);
        
        foreach (var prize in prizes)
        {
            mapController.AddPrizeMarker(
                prize.id,
                prize.location.lat,
                prize.location.lng,
                prize.displayType,
                prize.points
            );
        }
        
        // Show capture radius (5m catchable zone)
        mapController.ShowCaptureRadius(lat, lng, 5f);
    }
    
    public void UpdatePlayerPosition(float lat, float lng)
    {
        mapController.ShowPlayerLocation(lat, lng);
        mapController.CenterMap(lat, lng, 16);
    }
}
```

### Phase 2: Google Maps SDK (Production)
Upgrade to native Google Maps SDK for better performance and AR integration.

---

## 🏗️ Unity Game Architecture

### Project Structure
```
YallaCatch-Unity/
├── Assets/
│   ├── Scripts/
│   │   ├── Core/
│   │   │   ├── GameManager.cs
│   │   │   ├── YallaCatchClient.cs (SDK)
│   │   │   └── ConfigManager.cs
│   │   ├── AR/
│   │   │   ├── ARCaptureController.cs
│   │   │   ├── PrizeVisualizer.cs
│   │   │   └── CameraController.cs
│   │   ├── Map/
│   │   │   ├── LeafletMapController.cs    ← Testing (WebView)
│   │   │   ├── LeafletPrizeManager.cs     ← Testing (WebView)
│   │   │   ├── GoogleMapsController.cs    ← Production (Native)
│   │   │   ├── IMapProvider.cs            ← Interface for both
│   │   │   ├── PrizeMarker.cs
│   │   │   └── PlayerLocationTracker.cs
│   │   ├── UI/
│   │   │   ├── MainMenuUI.cs
│   │   │   ├── GameplayUI.cs
│   │   │   ├── MarketplaceUI.cs
│   │   │   └── ProfileUI.cs
│   │   ├── Gameplay/
│   │   │   ├── PowerUpManager.cs
│   │   │   ├── ProgressionSystem.cs
│   │   │   ├── AchievementManager.cs
│   │   │   └── ChallengeManager.cs
│   │   ├── Social/
│   │   │   ├── FriendsManager.cs
│   │   │   ├── LeaderboardManager.cs
│   │   │   └── TeamManager.cs
│   │   ├── Monetization/
│   │   │   ├── AdMobController.cs
│   │   │   └── RewardedAdsManager.cs
│   │   ├── Notifications/
│   │   │   ├── NotificationManager.cs
│   │   │   ├── PushNotificationHandler.cs
│   │   │   └── InAppNotificationUI.cs
│   │   └── Offline/
│   │       ├── OfflineQueueManager.cs
│   │       └── DataSyncManager.cs
│   ├── Prefabs/
│   │   ├── Prize3DModels/
│   │   ├── UI/
│   │   └── Effects/
│   ├── Scenes/
│   │   ├── Splash.unity
│   │   ├── Login.unity
│   │   ├── MainMenu.unity
│   │   ├── MapView.unity
│   │   ├── ARCapture.unity
│   │   └── Marketplace.unity
│   ├── StreamingAssets/
│   │   └── unity-map.html              ← Leaflet HTML template
│   ├── Materials/
│   ├── Animations/
│   └── Resources/
└── Packages/
    ├── AR Foundation
    ├── unity-webview (Testing)         ← For Leaflet WebView
    ├── Google Maps (Production)        ← For native maps
    ├── AdMob
    └── Newtonsoft.Json
```

### Map Provider Interface (Switch between Leaflet/Google Maps)
```csharp
// IMapProvider.cs - Abstract interface for map implementations
public interface IMapProvider
{
    void Initialize();
    void CenterMap(float lat, float lng, int zoom);
    void AddPrizeMarker(string prizeId, float lat, float lng, string type, int points);
    void RemovePrizeMarker(string prizeId);
    void ClearAllMarkers();
    void ShowPlayerLocation(float lat, float lng);
    void ShowCaptureRadius(float lat, float lng, float radiusMeters);
    void SetOnMarkerClickListener(System.Action<string> callback);
    void SetOnMapClickListener(System.Action<float, float> callback);
}

// MapManager.cs - Factory to switch between providers
public class MapManager : MonoBehaviour
{
    public enum MapProviderType { Leaflet, GoogleMaps }
    
    [SerializeField] private MapProviderType currentProvider = MapProviderType.Leaflet;
    [SerializeField] private LeafletMapController leafletController;
    [SerializeField] private GoogleMapsController googleMapsController;
    
    private IMapProvider _mapProvider;
    
    public IMapProvider MapProvider => _mapProvider;
    
    void Awake()
    {
        // Select provider based on config (use Leaflet for testing)
        #if UNITY_EDITOR || DEVELOPMENT_BUILD
        currentProvider = MapProviderType.Leaflet;
        #else
        currentProvider = MapProviderType.GoogleMaps;
        #endif
        
        switch (currentProvider)
        {
            case MapProviderType.Leaflet:
                _mapProvider = leafletController;
                googleMapsController?.gameObject.SetActive(false);
                leafletController?.gameObject.SetActive(true);
                break;
            case MapProviderType.GoogleMaps:
                _mapProvider = googleMapsController;
                leafletController?.gameObject.SetActive(false);
                googleMapsController?.gameObject.SetActive(true);
                break;
        }
        
        _mapProvider?.Initialize();
    }
    
    // Convenience methods
    public void LoadNearbyPrizes(List<Prize> prizes)
    {
        _mapProvider?.ClearAllMarkers();
        foreach (var prize in prizes)
        {
            _mapProvider?.AddPrizeMarker(
                prize.id,
                prize.location.lat,
                prize.location.lng,
                prize.displayType,
                prize.points
            );
        }
    }
}
```

### Scene Flow Diagram
```
Splash Screen
     ↓
Login/Register → Forgot Password
     ↓
Main Menu (Dashboard)
     ├→ Player Balance Display (Always visible in header)
     ├→ Notification Center (Bell icon with badge)
     ├→ Map View (Main Game)
     │      ├→ AR Capture
     │      ├→ Power-Up Usage
     │      ├→ Balance Updates (Real-time)
     │      └→ Real-time Notifications
     ├→ Rewards (YallaCatch Catalogue)
     │      ├→ Browse Platform Rewards
     │      ├→ Redeem Badges & Benefits
     │      └→ View My Rewards
     ├→ Marketplace (Partner/Admin Items)
     │      ├→ Browse Partner Offers
     │      ├→ Browse Admin Bundles
     │      ├→ Purchase Items
     │      └→ View Redemptions (QR Codes)
     ├→ Profile
     │      ├→ Stats & Achievements
     │      ├→ Settings
     │      └→ Level Progress
     ├→ Social
     │      ├→ Friends List
     │      ├→ Leaderboard
     │      ├→ Teams
     │      └→ Challenges
     └→ Inventory
            ├→ Power-Ups
            ├→ Active Effects
            └→ Collectibles
```

---

## 📡 Backend API Documentation

### Base URL
- **Production**: `https://api.yallacatch.tn`
- **Development**: `http://localhost:3000`
- **API Version**: `/api/v1`

### Authentication
All authenticated requests require:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## 🔐 Authentication Endpoints

### 1. Register User
**POST** `/api/v1/auth/register`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "displayName": "PlayerName",
  "deviceId": "unique-device-id",
  "platform": "android",
  "acceptedTerms": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "displayName": "PlayerName",
      "level": "bronze",
      "points": 0,
      "profile": {
        "avatar": "default.png",
        "city": null
      }
    }
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.Register(email, password, displayName, (success) => {
    if (success) {
        // Navigate to main menu
        SceneManager.LoadScene("MainMenu");
    }
});
```

**Admin Control:**
- View new registrations: **Dashboard** → Active Users Widget
- Monitor registration rate: **Analytics** → User Growth Chart
- Manually verify users: **Users Management** → User Details → Verify Account

---

### 2. Login User
**POST** `/api/v1/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "deviceId": "unique-device-id",
  "platform": "android"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "displayName": "PlayerName",
      "level": "gold",
      "points": 1250,
      "stats": {
        "totalClaims": 47,
        "totalDistance": 12.5,
        "totalSessions": 23
      }
    }
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.Login(email, password, (success) => {
    if (success) {
        LoadUserProfile();
        ConnectWebSocket();
        StartGameSession();
    }
});
```

**Admin Control:**
- Track login activity: **Activity Log** → Filter: LOGIN
- Monitor active sessions: **Game Monitoring** → Active Sessions
- Force logout user: **Users Management** → User → Revoke Token

---

### 3. Logout
**POST** `/api/v1/auth/logout`

**Headers:** Authorization required

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.Logout();
```

---

## 🎯 Game Session Endpoints

### 4. Start Game Session
**POST** `/api/v1/game/session/start`

**Request:**
```json
{
  "deviceId": "unique-device-id",
  "platform": "android",
  "version": "1.0.0",
  "location": {
    "latitude": 36.8065,
    "longitude": 10.1815,
    "accuracy": 15.0
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "startTime": "2026-01-06T14:30:00Z",
    "userLevel": "gold",
    "userPoints": 1250,
    "dailyChallenges": [
      {
        "id": "challenge_1",
        "title": "Explore 5 New Locations",
        "type": "exploration",
        "target": 5,
        "progress": 2,
        "reward": 100
      }
    ],
    "activePowerUps": []
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.StartGameSession(currentLocation, (success) => {
    if (success) {
        UpdateDailyChallenges();
        StartLocationTracking();
        LoadNearbyPrizes();
    }
});
```

**Admin Control:**
- View active sessions: **Game Monitoring** → Active Sessions Table
- Monitor session stats: **Dashboard** → Real-time Stats
- End session remotely: **Game Monitoring** → Terminate Session

---

### 5. Update Location
**POST** `/api/v1/game/location`

**Request:**
```json
{
  "sessionId": "sess_abc123",
  "location": {
    "latitude": 36.8070,
    "longitude": 10.1820,
    "accuracy": 12.0,
    "speed": 1.5,
    "heading": 45.0
  },
  "timestamp": "2026-01-06T14:35:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "distanceTraveled": 125.5,
    "nearbyPrizes": [
      {
        "id": "prize_123",
        "title": "Mystery Box",
        "category": "special",
        "points": 50,
        "rarity": "rare",
        "position": {
          "lat": 36.8072,
          "lng": 10.1822
        },
        "distance": 25.3,
        "expiresAt": "2026-01-06T18:00:00Z"
      }
    ],
    "cheatWarning": null
  }
}
```

**Unity Implementation:**
```csharp
// Update every 5 seconds
InvokeRepeating("UpdatePlayerLocation", 0f, 5f);

void UpdatePlayerLocation() {
    var location = GetCurrentGPSLocation();
    YallaCatchClient.Instance.UpdateLocation(sessionId, location, (response) => {
        UpdateNearbyPrizesOnMap(response.nearbyPrizes);
    });
}
```

**Admin Control:**
- Track player movement: **Game Monitoring** → Player Heatmap
- Anti-cheat monitoring: **Anti-Cheat Dashboard** → Speed Violations
- View location history: **Users Management** → User → Activity Map

---

### 6. End Game Session
**POST** `/api/v1/game/session/end`

**Request:**
```json
{
  "sessionId": "sess_abc123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "duration": 1800,
    "distanceTraveled": 2.5,
    "prizesFound": 12,
    "claimsAttempted": 8,
    "powerUpsUsed": 2,
    "rewards": {
      "basePoints": 200,
      "distanceBonus": 50,
      "timeBonus": 30,
      "discoveryBonus": 40,
      "total": 320
    }
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.EndGameSession((sessionData) => {
    ShowSessionSummaryUI(sessionData);
    UpdateUserStats();
});
```

**Admin Control:**
- View session history: **Game Monitoring** → Session History
- Analyze session metrics: **Analytics** → Session Performance

---

## 🏆 AR Capture Endpoints

### 7. Validate Capture (Pre-check)
**POST** `/api/v1/capture/validate`

**Request:**
```json
{
  "prizeId": "prize_123",
  "location": {
    "latitude": 36.8072,
    "longitude": 10.1822
  },
  "preValidate": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "canCapture": true,
    "reason": "Within valid distance",
    "distance": 8.5,
    "animation": {
      "type": "mystery_box",
      "rarity": "rare",
      "animation": {
        "approach": "float_rotate",
        "idle": "gentle_bob",
        "opening": "chest_open_rare",
        "reveal": "particle_burst",
        "celebration": "confetti_rain"
      },
      "effects": {
        "particles": ["sparkle", "glow", "trail"],
        "lighting": "radial_glow",
        "sound": "rare_prize_ambient"
      }
    },
    "estimatedReward": {
      "minPoints": 40,
      "maxPoints": 60,
      "rarity": "rare"
    }
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.ValidateCapture(prizeId, currentLocation, (result) => {
    if (result.canCapture) {
        LoadARCaptureScene(result.animation);
    } else {
        ShowError(result.reason);
    }
});
```

**Admin Control:**
- Monitor capture attempts: **Prize Claims Management** → Pending Claims
- View validation stats: **Anti-Cheat Dashboard** → Validation Metrics
- Adjust distance threshold: **Settings** → Game Settings → Capture Radius

---

### 8. Capture Prize
**POST** `/api/v1/capture/attempt`

**Request:**
```json
{
  "prizeId": "prize_123",
  "location": {
    "latitude": 36.8072,
    "longitude": 10.1822,
    "accuracy": 10.0,
    "altitude": 50.0
  },
  "deviceInfo": {
    "platform": "Android",
    "deviceModel": "Samsung Galaxy S21",
    "osVersion": "13",
    "appVersion": "1.0.0",
    "timestamp": "2026-01-06T14:40:00Z"
  },
  "arData": {
    "cameraPosition": {
      "x": 0.0,
      "y": 1.5,
      "z": 0.0
    },
    "cameraRotation": {
      "x": 0.0,
      "y": 0.0,
      "z": 0.0,
      "w": 1.0
    },
    "lightEstimation": 0.75,
    "trackingState": "tracking"
  },
  "captureMethod": "tap"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "prizeId": "prize_123",
    "claimId": "claim_456",
    "content": {
      "type": "mystery_box",
      "animation": "rare",
      "displayType": "mystery_box",
      "points": 50,
      "bonusMultiplier": 1.5,
      "message": "Congratulations! You found a Rare Mystery Box!"
    },
    "userProgress": {
      "totalPoints": 1300,
      "newLevel": "gold",
      "levelProgress": 0.15,
      "nextLevelPoints": 200
    },
    "effects": {
      "visualEffects": ["particle_burst", "light_ray", "confetti"],
      "soundEffects": ["success_fanfare", "coins_drop"],
      "hapticPattern": "success_medium",
      "duration": 3000
    },
    "achievements": [
      {
        "id": "first_rare",
        "title": "Lucky Find",
        "description": "Capture your first rare prize",
        "points": 25
      }
    ],
    "metadata": {
      "captureTime": "2026-01-06T14:40:05Z",
      "distance": 8.5,
      "validationScore": 0.95,
      "contentType": "mystery_box",
      "rewardGranted": true
    }
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.CapturePrize(captureData, (result) => {
    if (result.success) {
        PlayCaptureAnimation(result.content.animation);
        PlayVisualEffects(result.effects.visualEffects);
        PlaySoundEffects(result.effects.soundEffects);
        TriggerHapticFeedback(result.effects.hapticPattern);
        
        if (result.userProgress.newLevel != null) {
            ShowLevelUpAnimation(result.userProgress.newLevel);
        }
        
        UpdateUserPoints(result.userProgress.totalPoints);
        
        if (result.achievements != null && result.achievements.Count > 0) {
            ShowAchievementsUnlocked(result.achievements);
        }
    }
});
```

**Admin Control:**
- **Prize Claims Management:**
  - View all captures: Filter → Status: All
  - Approve pending: Click Validate button
  - Reject suspicious: Click Reject button
  - View capture details: Click Eye icon → See AR data, location, device info
  
- **Anti-Cheat Dashboard:**
  - Flag suspicious captures: Auto-flagged with risk score
  - Override decisions: Click Override button
  - View fraud patterns: Patterns tab
  
- **Real-time Updates:**
  - New captures appear instantly via WebSocket
  - Toast notification: "Nouvelle capture détectée"

---

## 💰 Rewards & Marketplace System

### ✅ How Your Current System Works:

**Your platform uses a SINGLE unified Reward model with distinction via metadata:**

1. **🎁 YallaCatch Free Rewards (Platform Sponsored)**
   - Created in: **Rewards Management** page
   - `partnerId`: NULL (no partner)
   - `metadata.isSponsored`: false or undefined
   - **Example:** "Aziza Voucher 50 DT" - Free from YallaCatch platform
   - **Flow:** User earns points → Redeems reward → Gets QR code → Scans at Aziza
   - **Cost to User:** Points only
   - **Cost to YallaCatch:** Platform absorbs cost

2. **🏪 Sponsored Rewards (Partner/Admin Marketplace)**
   - Created in: **Marketplace Management** page OR **Rewards Management** with sponsor
   - `partnerId`: Set to partner ID (required for sponsored)
   - `metadata.isSponsored`: true
   - **Example:** "McDonald's 15 TND Voucher" - Sponsored by McDonald's
   - **Flow:** User spends points → Gets QR code → Redeems at McDonald's → Partner fulfills
   - **Partner Logo:** Displayed in Unity
   - **Created by:** Partner OR YallaCatch admin

3. **🎮 Admin Custom Items**
   - Created in: **Marketplace Management**
   - `partnerId`: NULL
   - `metadata`: Custom bundle/offer data
   - **Example:** "Power-Up Pack" - 5x Radar Boost
   - **Flow:** User purchases → Items added to inventory

---

### System Architecture (Your Current Backend):

**Database Model:** Single `Reward` collection
```typescript
{
  name: string,              // "Aziza Voucher 50 DT"
  description: string,       // "Scan at any Aziza store"
  category: RewardCategory,  // 'voucher', 'gift_card', 'physical', etc.
  pointsCost: number,        // 500 points
  stockQuantity: number,     // 100
  stockReserved: number,     // 5 (pending redemptions)
  stockAvailable: number,    // 95
  imageUrl: string,          // "https://cdn.yallacatch.tn/..."
  isActive: boolean,         // true
  isPopular: boolean,        // Featured on homepage
  partnerId: ObjectId,       // NULL for free rewards, Partner ID for sponsored
  metadata: {
    isSponsored: boolean,    // true if partner-sponsored
    originalValue: number,   // 50 (in TND)
    validityDays: number,    // 30
    locations: string[],     // ["All Aziza stores in Tunisia"]
    terms: string            // "Valid on purchases above 100 TND"
  }
}
```

**API Endpoints:**

**Admin API:** `/api/v1/admin/rewards/*` (used by both pages)
- `GET /admin/rewards` - List all rewards (filters: category, status, partnerId)
- `POST /admin/rewards` - Create reward (both free & sponsored)
- `PUT /admin/rewards/:id` - Update reward
- `DELETE /admin/rewards/:id` - Delete reward
- `GET /admin/marketplace/items` - Alias to rewards with marketplace filter
- `POST /admin/marketplace/items` - Alias to create reward (marketplace context)

**Player API:** `/api/v1/rewards/*` and `/api/v1/marketplace/*`
- `GET /api/v1/rewards` - Get YallaCatch free rewards (partnerId = null)
- `GET /api/v1/marketplace` - Get sponsored/partner rewards (partnerId != null)
- `POST /api/v1/rewards/redeem` - Redeem any reward (generates QR code)

---

### 9. Get YallaCatch Free Rewards (Platform Sponsored)
**GET** `/api/v1/rewards?category=voucher&page=1&limit=20&sortBy=popular`

**Backend Filter:** `partnerId: null` or `metadata.isSponsored: false`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "reward_001",
        "name": "Aziza Voucher 50 DT",
        "description": "Discount voucher for any Aziza store in Tunisia",
        "category": "voucher",
        "pointsCost": 500,
        "stockAvailable": 95,
        "stockQuantity": 100,
        "isActive": true,
        "isPopular": true,
        "partnerId": null,
        "imageUrl": "https://cdn.yallacatch.tn/rewards/aziza-50dt.jpg",
        "metadata": {
          "originalValue": 50.0,
          "validityDays": 30,
          "locations": ["All Aziza stores in Tunisia"],
          "terms": "Valid on purchases above 100 TND"
        }
      }
    ],
    "total": 45,
    "page": 1,
    "limit": 20
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.GetFreeRewards(category, page, (rewards) => {
    DisplayRewardsCatalogue(rewards);
    // Show as "FREE from YallaCatch"
});
```

**Admin Control:**
- **Rewards Management Page:**
  - Click "Ajouter" button
  - Fill form:
    - Name: "Aziza Voucher 50 DT"
    - Description: "Scan at any Aziza store"
    - Category: Voucher
    - Points Cost: 500
    - Stock: 100
    - **Partner: Leave empty** (for free rewards)
    - Image URL: Upload
  - Save → Creates free YallaCatch reward

**How it works for users:**
1. User has 500+ points
2. User browses "Rewards" in Unity
3. User sees "Aziza Voucher 50 DT - 500 points"
4. User clicks "Redeem"
5. Backend deducts 500 points
6. Backend generates QR code
7. Unity displays QR code
8. User goes to Aziza store
9. Cashier scans QR code
10. Reward validated and marked as redeemed
11. YallaCatch pays Aziza for the voucher

---

### 10. Get Marketplace Items (Partner Sponsored + Admin Items)
**GET** `/api/v1/marketplace?category=voucher&page=1&limit=20&sortBy=popular`

**Backend Filter:** `partnerId != null` OR `metadata.isSponsored: true`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "marketplace_789",
        "title": "McDonald's 15 TND Voucher",
        "description": "Discount voucher for any McDonald's Tunisia",
        "category": "voucher",
        "pointsCost": 500,
        "stockAvailable": 45,
        "isActive": true,
        "isPopular": true,
        "source": "partner",
        "createdBy": "partner",
        "partner": {
          "id": "partner_101",
          "name": "McDonald's Tunisia",
          "logo": "https://cdn.yallacatch.tn/partners/mcdonalds.png"
        },
        "imageUrl": "https://cdn.yallacatch.tn/marketplace/mcdonalds-voucher.jpg",
        "metadata": {
          "originalValue": 15.0,
          "validityDays": 30,
          "locations": ["All McDonald's Tunisia"]
        }
      },
      {
        "id": "marketplace_790",
        "title": "Special Event Power-Up Pack",
        "description": "5x Radar Boost + 3x Double Points",
        "category": "powerup_pack",
        "pointsCost": 200,
        "stockAvailable": 1000,
        "isActive": true,
        "source": "admin",
        "createdBy": "admin",
        "partner": null,
        "imageUrl": "https://cdn.yallacatch.tn/marketplace/powerup-pack.jpg",
        "metadata": {
          "contents": [
            {"type": "radar_boost", "quantity": 5},
            {"type": "double_points", "quantity": 3}
          ]
        }
      }
    ],
    "total": 156,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.GetMarketplaceItems(category, page, (items) => {
    DisplayMarketplaceGrid(items);
    
    // Visually distinguish partner items vs admin items
    foreach (var item in items) {
        if (item.source == "partner") {
            AddPartnerBadge(item); // Show partner logo
        } else if (item.source == "admin") {
            AddYallaCatchBadge(item); // Show YallaCatch logo
        }
    }
});
```

**Admin Control:**

**Marketplace Management Page:**
- **Two Creation Modes:**
  1. **Partner Items:** Created by/for partners
     - Partner selection required
     - Partner logo displayed
     - Partner receives analytics
  
  2. **Admin Items:** Created by YallaCatch admins
     - No partner association
     - Platform-managed items
     - Custom bundles, special offers

**Actions:**
1. **Add Marketplace Item:**
   - Click "+" button
   - Select source: "Partner Item" or "Admin Item"
   - If Partner: Select partner from dropdown
   - Fill form (name, description, category)
   - Set points cost
   - Upload image
   - Set stock quantity
   - Save

2. **Update Stock:**
   - Edit item → Stock field → Save
   - Real-time update to Unity clients

3. **Toggle Availability:**
   - Click Active/Inactive toggle
   - Immediate effect on Unity marketplace

**WebSocket:** ✅ Yes - Stock updates, new items broadcast

**Control from Unity:** Items appear/disappear based on availability, visually distinguished by source

---

### 11. Redeem YallaCatch Reward
**POST** `/api/v1/rewards/redeem`

**Request:**
```json
{
  "rewardId": "reward_001",
  "idempotencyKey": "unique-redemption-key-456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "redemption": {
      "id": "redemption_111",
      "type": "platform_reward",
      "reward": {
        "title": "YallaCatch Gold Badge",
        "tier": "gold",
        "benefits": ["10% bonus on all captures"]
      },
      "redeemedAt": "2026-01-06T15:00:00Z"
    },
    "userBalance": {
      "previousPoints": 1500,
      "pointsSpent": 1000,
      "remainingPoints": 500
    }
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.RedeemReward(rewardId, (result) => {
    if (result.success) {
        ShowRewardUnlockedAnimation(result.redemption);
        ApplyBenefits(result.redemption.reward.benefits);
        UpdateUserPointsUI(result.userBalance.remainingPoints);
    }
});
```

---

### 12. Purchase Marketplace Item
**POST** `/api/v1/marketplace/purchase`

**Request:**
```json
{
  "itemId": "reward_789",
  "idempotencyKey": "unique-purchase-key-123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "redemption": {
      "id": "redemption_999",
      "code": "MCD-2026-ABC123",
      "qrCode": "data:image/png;base64,iVBORw0KG...",
      "item": {
        "title": "McDonald's 15 TND Voucher",
        "description": "Show this code at any McDonald's",
        "partnerName": "McDonald's Tunisia",
        "originalValue": 15.0,
        "currency": "TND"
      },
      "validUntil": "2026-02-05T23:59:59Z",
      "howToRedeem": "Show QR code at cashier"
    },
    "userBalance": {
      "previousPoints": 1300,
      "pointsSpent": 500,
      "remainingPoints": 800
    },
    "message": "Purchase successful!"
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.PurchaseItem(itemId, (purchase) => {
    if (purchase.success) {
        ShowRedemptionQRCode(purchase.redemption.qrCode);
        UpdateUserPointsUI(purchase.userBalance.remainingPoints);
        SaveRedemptionLocally(purchase.redemption);
    }
});
```

**Admin Control:**
- **Rewards Management:**
  - View all redemptions: Redemptions tab
  - Monitor real-time purchases: Dashboard → Recent Activity
  - Track revenue: Analytics → Revenue by Category
  
- **Partner Portal:**
  - Partners scan QR codes to validate
  - Auto-updates redemption status
  - Tracks redemption rate per partner

---

## 🎮 Power-Ups & Inventory Endpoints

### 11. Get User Inventory
**GET** `/api/v1/game/inventory`

**Response:**
```json
{
  "success": true,
  "data": {
    "powerUps": [
      {
        "id": "powerup_radar",
        "name": "Radar Boost",
        "description": "Doubles detection radius for 5 minutes",
        "quantity": 3,
        "effect": "radiusMultiplier: 2.0",
        "duration": 300000,
        "icon": "🎯"
      }
    ],
    "items": [],
    "activeEffects": [
      {
        "type": "double_points",
        "value": 2.0,
        "expiresAt": "2026-01-06T15:00:00Z",
        "remainingUses": null
      }
    ]
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.GetInventory((inventory) => {
    DisplayPowerUps(inventory.powerUps);
    ApplyActiveEffects(inventory.activeEffects);
});
```

**Admin Control:**
- **Power-Up Management:**
  - Create power-ups: Click "+" → Configure effects → Save
  - Edit drop rates: Edit icon → Drop Rate field
  - Set rarity: Common/Rare/Epic/Legendary
  - View usage analytics: Analytics tab
  
- **Grant to user:**
  - Users Management → User → Inventory → Add Power-Up

---

### 12. Use Power-Up
**POST** `/api/v1/game/powerup/use`

**Request:**
```json
{
  "powerUpId": "powerup_radar",
  "location": {
    "latitude": 36.8072,
    "longitude": 10.1822
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "effect": {
      "type": "radar_boost",
      "radiusMultiplier": 2.0,
      "expiresAt": "2026-01-06T14:45:00Z"
    },
    "remainingQuantity": 2
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.UsePowerUp(powerUpId, currentLocation, (effect) => {
    ApplyPowerUpEffect(effect);
    UpdateInventoryUI();
    ExpandPrizeDetectionRadius(effect.radiusMultiplier);
});
```

---

## 🏅 Achievements & Challenges

### 13. Get User Achievements
**GET** `/api/v1/gamification/achievements/my`

**Response:**
```json
{
  "success": true,
  "data": {
    "unlocked": [
      {
        "id": "ach_first_capture",
        "title": "First Steps",
        "description": "Complete your first capture",
        "points": 10,
        "unlocked": true,
        "unlockedAt": "2026-01-01T10:00:00Z",
        "icon": "🎯",
        "category": "explorer"
      }
    ],
    "inProgress": [
      {
        "id": "ach_100_captures",
        "title": "Century Club",
        "description": "Complete 100 captures",
        "points": 100,
        "unlocked": false,
        "progress": 47,
        "target": 100,
        "icon": "💯",
        "category": "explorer"
      }
    ],
    "totalPoints": 235,
    "completionPercentage": 28.5
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.GetAchievements((achievements) => {
    DisplayUnlockedAchievements(achievements.unlocked);
    ShowProgressBars(achievements.inProgress);
});
```

**Admin Control:**
- **Achievements Management:**
  - Create achievements: Click "+" → Set trigger, target, rewards
  - View unlock rate: Eye icon → Statistics
  - Edit rewards: Edit icon → Rewards section
  
- **Track unlocks:**
  - Dashboard → Recent Achievements widget
  - Real-time notifications when unlocked

---

### 14. Get Daily Challenges
**GET** `/api/v1/gamification/challenges/daily`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "daily_distance",
      "title": "Walk 2 KM",
      "description": "Travel 2 kilometers today",
      "type": "distance",
      "target": 2000,
      "progress": 850,
      "reward": 50,
      "completed": false,
      "expiresAt": "2026-01-06T23:59:59Z"
    }
  ]
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.GetDailyChallenges((challenges) => {
    DisplayChallengesUI(challenges);
    TrackChallengeProgress(challenges);
});
```

**Admin Control:**
- **Game Control:**
  - Set daily challenges: Daily Challenges tab → Edit
  - Adjust rewards: Edit → Reward Points
  - View completion rate: Analytics

---

## 👥 Social Features

### 15. Get Friends List
**GET** `/api/v1/social/friends`

**Response:**
```json
{
  "success": true,
  "data": {
    "friends": [
      {
        "userId": "user_202",
        "displayName": "Ahmed_TN",
        "avatar": "https://cdn.yallacatch.tn/avatars/ahmed.jpg",
        "level": "platinum",
        "points": 2100,
        "isOnline": true,
        "lastActive": "2026-01-06T14:35:00Z",
        "currentActivity": {
          "type": "exploring",
          "location": "Tunis Medina"
        }
      }
    ],
    "onlineCount": 12,
    "totalCount": 45
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.GetFriends((friendsData) => {
    DisplayFriendsList(friendsData.friends);
    ShowOnlineIndicators(friendsData.onlineCount);
});
```

**Admin Control:**
- **Friendships Management:**
  - View all friendships: Main table
  - Filter by status: Pending/Accepted/Rejected
  - Monitor friend requests: Real-time updates

---

### 16. Get Leaderboard
**GET** `/api/v1/social/leaderboard?type=global&limit=100`

**Response:**
```json
{
  "success": true,
  "data": {
    "leaderboard": [
      {
        "rank": 1,
        "userId": "user_501",
        "displayName": "TunisKing",
        "level": "diamond",
        "points": 15500,
        "totalClaims": 458,
        "totalDistance": 125.5,
        "avatar": "https://cdn.yallacatch.tn/avatars/king.jpg"
      }
    ],
    "userRank": 847,
    "total": 15432
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.GetLeaderboard("global", 100, (leaderboard) => {
    PopulateLeaderboardTable(leaderboard.leaderboard);
    HighlightUserPosition(leaderboard.userRank);
});
```

**Admin Control:**
- **Game Monitoring:**
  - View leaderboard: Leaderboard tab
  - Reset seasonal leaderboard: Leaderboard Settings
  - Ban cheaters: Removes from rankings automatically

---

## 📱 AdMob Integration

### 17. Check Ad Availability
**GET** `/api/v1/admob/availability?adType=rewarded`

**Response:**
```json
{
  "success": true,
  "data": {
    "available": true,
    "adType": "rewarded",
    "remainingToday": 8,
    "dailyLimit": 10,
    "cooldownSeconds": 0,
    "canWatch": true,
    "potentialReward": 20
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.CheckAdAvailability("rewarded", (availability) => {
    if (availability.canWatch) {
        ShowWatchAdButton(availability.potentialReward);
    }
});
```

**Admin Control:**
- **AdMob Dashboard:**
  - View ad metrics: Revenue, impressions, eCPM
  - Adjust daily limits: Configuration → Ad Limits
  - Set reward amounts: Configuration → Reward Points
  - Monitor user viewing: Stats tab → User Views

---

### 18. Claim Ad Reward
**POST** `/api/v1/admob/reward`

**Request:**
```json
{
  "adType": "rewarded",
  "adUnitId": "ca-app-pub-xxx",
  "completed": true,
  "watchDuration": 30,
  "ecpm": 2.5
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "rewardAmount": 20,
    "rewardType": "points",
    "newBalance": 820,
    "adViewId": "adview_123",
    "cooldownSeconds": 300
  }
}
```

**Unity Implementation:**
```csharp
// After ad completes
YallaCatchClient.Instance.ClaimAdReward("rewarded", adUnitId, (reward) => {
    UpdateUserPoints(reward.newBalance);
    ShowRewardAnimation(reward.rewardAmount);
    StartCooldownTimer(reward.cooldownSeconds);
});
```

**Admin Control:**
- Monitor in real-time: AdMob Dashboard updates live
- Detect fraud: Anti-Cheat → Ad Fraud Detection
- Adjust rewards: Settings → AdMob Configuration

---

## 📊 Analytics & Stats

### 19. Get User Stats
**GET** `/api/v1/users/stats`

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "displayName": "PlayerName",
      "level": "gold",
      "joinedAt": "2025-12-01T00:00:00Z"
    },
    "points": {
      "available": 800,
      "total": 1300,
      "spent": 500
    },
    "stats": {
      "totalClaims": 47,
      "totalPoints": 1300,
      "averageDistance": 25.5,
      "validClaims": 45
    },
    "rank": {
      "global": 847,
      "city": 23,
      "cityName": "Tunis"
    },
    "levelProgress": {
      "currentLevel": "gold",
      "currentPoints": 800,
      "nextLevelPoints": 1000,
      "progress": 0.8,
      "isMaxLevel": false
    }
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.GetUserStats((stats) => {
    UpdateProfileUI(stats);
    DisplayProgressBar(stats.levelProgress);
    ShowRankings(stats.rank);
});
```

**Admin Control:**
- View individual: Users Management → User → Stats tab
- Aggregate analytics: Analytics Page → All metrics
- Export data: Analytics → Export button

---

## � Player Balance Display

### 20. Get Current Balance
**GET** `/api/v1/users/balance`

**Headers:** Authorization required

**Response:**
```json
{
  "success": true,
  "data": {
    "balance": {
      "available": 800,
      "total": 1300,
      "spent": 500
    },
    "level": "gold",
    "levelProgress": {
      "currentPoints": 800,
      "nextLevelPoints": 1000,
      "progress": 0.8
    },
    "lastUpdated": "2026-01-06T14:45:00Z"
  }
}
```

**Unity Implementation:**
```csharp
public class PlayerBalanceUI : MonoBehaviour {
    public TextMeshProUGUI balanceText;
    public TextMeshProUGUI levelText;
    public Image levelProgressBar;
    
    void Start() {
        // Initial load
        RefreshBalance();
        
        // Subscribe to real-time updates via WebSocket
        YallaCatchClient.Instance.OnBalanceUpdate += UpdateBalanceUI;
        YallaCatchClient.Instance.OnStatsUpdate += UpdateBalanceUI;
    }
    
    public void RefreshBalance() {
        YallaCatchClient.Instance.GetBalance((balance) => {
            UpdateBalanceUI(balance);
        });
    }
    
    void UpdateBalanceUI(BalanceData balance) {
        // Animate points counter
        StartCoroutine(AnimateCounter(
            int.Parse(balanceText.text),
            balance.available,
            1.0f
        ));
        
        levelText.text = $"Level {balance.level}";
        levelProgressBar.fillAmount = balance.levelProgress.progress;
        
        // Show floating text for gains/losses
        if (balance.available > previousBalance) {
            ShowFloatingText($"+{balance.available - previousBalance}", Color.green);
        }
        
        previousBalance = balance.available;
    }
    
    IEnumerator AnimateCounter(int start, int end, float duration) {
        float elapsed = 0f;
        while (elapsed < duration) {
            elapsed += Time.deltaTime;
            int current = (int)Mathf.Lerp(start, end, elapsed / duration);
            balanceText.text = current.ToString("N0");
            yield return null;
        }
        balanceText.text = end.ToString("N0");
    }
}
```

**UI Layout (Always Visible):**
```
╔════════════════════════════════════════╗
║  🏆 Level 6    💰 800 Points    🔔 3   ║
║  ▓▓▓▓▓▓▓▓▓▓░░░░░ 80%                 ║
╚════════════════════════════════════════╝
```

**Balance Display Locations:**
1. **Main Header (All Scenes):**
   - Top-right corner
   - Points displayed with coin icon
   - Level badge with progress bar
   - Always visible

2. **Capture Success Screen:**
   - Old balance → New balance animation
   - "+50 Points" floating text
   - Confetti/particles on level-up

3. **Marketplace:**
   - Balance at top
   - "Can afford" indicator per item
   - Real-time update after purchase

4. **Profile Screen:**
   - Detailed breakdown:
     - Available: 800
     - Total Earned: 1300
     - Total Spent: 500
   - Balance history graph (7 days)

**Admin Control - Affecting Balance:**
- **Users Management → Add Points:**
  - Click "+" button
  - Enter amount and reason
  - Unity receives WebSocket update
  - Balance counter animates to new value
  - Toast: "Admin granted you 100 points!"

- **Users Management → Deduct Points:**
  - Click "−" button
  - Balance decreases in real-time
  - Unity shows notification

- **Prize Claims → Validate:**
  - Admin validates capture
  - User's balance increases
  - WebSocket event triggers UI update

- **Marketplace → Purchase:**
  - Points deducted immediately
  - Balance updates across all scenes

**Real-time Balance Updates (WebSocket):**
```json
{
  "event": "balance_update",
  "data": {
    "newBalance": 850,
    "change": +50,
    "reason": "prize_captured",
    "metadata": {
      "prizeName": "Mystery Box",
      "adminGranted": false
    }
  }
}
```

---

## 🔔 Notification System

### 21. Get User Notifications
**GET** `/api/v1/notifications?page=1&limit=20&unreadOnly=false`

**Headers:** Authorization required

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "notif_123",
        "title": "New Prize Nearby!",
        "message": "A rare Mystery Box is 50m away!",
        "type": "prize_alert",
        "priority": 4,
        "isRead": false,
        "isDelivered": true,
        "createdAt": "2026-01-06T14:50:00Z",
        "metadata": {
          "prizeId": "prize_456",
          "distance": 50.5,
          "rarity": "rare"
        },
        "actionUrl": "yallacatch://map?prizeId=prize_456"
      },
      {
        "id": "notif_124",
        "title": "Achievement Unlocked!",
        "message": "You've earned the 'Explorer' badge",
        "type": "achievement",
        "priority": 3,
        "isRead": true,
        "createdAt": "2026-01-06T13:30:00Z",
        "metadata": {
          "achievementId": "ach_explorer",
          "points": 25
        }
      }
    ],
    "total": 47,
    "unreadCount": 12,
    "page": 1,
    "limit": 20
  }
}
```

**Unity Implementation:**
```csharp
public class NotificationManager : MonoBehaviour {
    public GameObject notificationBadge;
    public TextMeshProUGUI badgeCountText;
    public Transform notificationListParent;
    public GameObject notificationItemPrefab;
    
    private int unreadCount = 0;
    
    void Start() {
        // Register for FCM/APNS push notifications
        Firebase.Messaging.FirebaseMessaging.TokenReceived += OnTokenReceived;
        Firebase.Messaging.FirebaseMessaging.MessageReceived += OnMessageReceived;
        
        // WebSocket real-time notifications
        YallaCatchClient.Instance.OnNotificationReceived += OnNotification;
        
        // Load initial notifications
        LoadNotifications();
    }
    
    void OnTokenReceived(object sender, TokenReceivedEventArgs token) {
        // Register FCM token with backend
        YallaCatchClient.Instance.RegisterDevice(token.Token);
    }
    
    void OnMessageReceived(object sender, MessageReceivedEventArgs e) {
        // Handle push notification received while app is open
        ShowInAppNotification(e.Message.Notification.Title, e.Message.Notification.Body);
        LoadNotifications(); // Refresh list
    }
    
    void OnNotification(NotificationData notification) {
        // Real-time notification via WebSocket
        unreadCount++;
        UpdateBadge();
        ShowInAppNotification(notification.title, notification.message);
        
        // Auto-navigate for high-priority alerts
        if (notification.priority >= 4 && notification.actionUrl != null) {
            ShowNotificationPopup(notification);
        }
    }
    
    public void LoadNotifications() {
        YallaCatchClient.Instance.GetNotifications(1, 20, false, (response) => {
            unreadCount = response.unreadCount;
            UpdateBadge();
            PopulateNotificationList(response.notifications);
        });
    }
    
    void UpdateBadge() {
        notificationBadge.SetActive(unreadCount > 0);
        badgeCountText.text = unreadCount > 99 ? "99+" : unreadCount.ToString();
    }
    
    void ShowInAppNotification(string title, string message) {
        // Toast-style notification at top of screen
        GameObject toast = Instantiate(toastPrefab, toastParent);
        toast.GetComponent<ToastNotification>().Show(title, message, 3f);
    }
    
    void ShowNotificationPopup(NotificationData notification) {
        // Full-screen modal for important notifications
        NotificationPopup popup = Instantiate(popupPrefab).GetComponent<NotificationPopup>();
        popup.Show(notification, () => {
            // On action button clicked
            HandleDeepLink(notification.actionUrl);
        });
    }
    
    public void MarkAsRead(string notificationId) {
        YallaCatchClient.Instance.MarkNotificationRead(notificationId, () => {
            unreadCount--;
            UpdateBadge();
        });
    }
    
    public void MarkAllAsRead() {
        YallaCatchClient.Instance.MarkAllNotificationsRead(() => {
            unreadCount = 0;
            UpdateBadge();
            LoadNotifications();
        });
    }
}
```

### 22. Mark Notification as Read
**POST** `/api/v1/notifications/read`

**Request:**
```json
{
  "notificationIds": ["notif_123", "notif_124"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "markedCount": 2,
    "remainingUnread": 10
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.MarkNotificationRead(notificationId, (result) => {
    UpdateUnreadBadge(result.remainingUnread);
});
```

### 23. Register Device for Push Notifications
**POST** `/api/v1/users/device/register`

**Request:**
```json
{
  "deviceId": "unique-device-id",
  "fcmToken": "firebase-cloud-messaging-token",
  "platform": "Android",
  "model": "Samsung Galaxy S21",
  "osVersion": "13",
  "appVersion": "1.0.0"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "registered": true,
    "deviceId": "unique-device-id"
  }
}
```

**Unity Implementation:**
```csharp
// On app start or login
Firebase.Messaging.FirebaseMessaging.GetTokenAsync().ContinueWith(task => {
    string token = task.Result;
    YallaCatchClient.Instance.RegisterDevice(
        SystemInfo.deviceUniqueIdentifier,
        token,
        Application.platform.ToString()
    );
});
```

### Notification Types

**1. Prize Alerts:**
- **Trigger:** Prize spawned within 100m radius
- **Priority:** High (4)
- **Action:** Navigate to map → Show prize location
- **Icon:** 🎁

**2. Achievement Unlocked:**
- **Trigger:** Achievement criteria met
- **Priority:** Medium (3)
- **Action:** Open achievements screen
- **Icon:** 🏆

**3. Friend Activity:**
- **Trigger:** Friend captures rare prize, levels up
- **Priority:** Low (2)
- **Action:** Open social screen
- **Icon:** 👥

**4. Marketplace Updates:**
- **Trigger:** New reward available, stock replenished
- **Priority:** Medium (3)
- **Action:** Open marketplace
- **Icon:** 🛒

**5. Admin Announcements:**
- **Trigger:** Admin sends broadcast
- **Priority:** High (4)
- **Action:** Show full-screen message
- **Icon:** 📢

**6. System Alerts:**
- **Trigger:** Maintenance mode, version update
- **Priority:** Critical (5)
- **Action:** Force logout or update
- **Icon:** ⚠️

### Admin Control - Sending Notifications

**Notifications Management Page:**

**1. Send Broadcast Notification:**
- Click "Send Notification" button
- Fill form:
  - Title: "New Year Event!"
  - Message: "Double points for all captures today!"
  - Type: Announcement
  - Priority: High
  - Target: All Users / Specific City / User IDs
  - Channels: Push ✓ Email ✓ In-App ✓
  - Schedule: Send Now / Schedule for later
- Click "Send"

**2. Unity Receives:**
```json
// WebSocket event
{
  "event": "notification_received",
  "data": {
    "id": "notif_999",
    "title": "New Year Event!",
    "message": "Double points for all captures today!",
    "type": "announcement",
    "priority": 4
  }
}
```

**3. Unity Actions:**
- Push notification appears (if app in background)
- In-app toast notification (if app open)
- Badge count increments
- Notification added to list
- Optional: Full-screen popup for priority 5

**Admin Features:**
- **Target Filtering:**
  - All users
  - By city (Tunis, Sfax, Sousse)
  - By level (Level 5+)
  - Specific user IDs
  - Active players (last 24h)

- **Scheduling:**
  - Send immediately
  - Schedule for specific date/time
  - Recurring notifications (daily challenges)

- **Templates:**
  - Save common messages
  - "Daily Challenge Available"
  - "New Partner Added"
  - "Maintenance Notice"

- **Analytics:**
  - Delivery rate
  - Open rate
  - Click-through rate
  - User engagement

**Real-time Notification Events (WebSocket):**

```json
// Prize nearby
{
  "event": "prize_nearby",
  "data": {
    "notification": {
      "title": "Rare Prize Detected!",
      "message": "Epic Mystery Box 25m away",
      "prizeId": "prize_789",
      "distance": 25.5
    }
  }
}

// Achievement unlocked
{
  "event": "achievement_unlocked",
  "data": {
    "notification": {
      "title": "Achievement Unlocked!",
      "message": "Century Club - 100 captures",
      "achievementId": "ach_100",
      "reward": 100
    }
  }
}

// Admin granted points
{
  "event": "balance_update",
  "data": {
    "notification": {
      "title": "Points Granted!",
      "message": "Admin awarded you 500 bonus points",
      "amount": 500,
      "reason": "Contest winner"
    }
  }
}
```

**Notification UI Components:**

**1. Notification Bell (Header):**
```
🔔 [Badge: 12]
```
- Always visible
- Shows unread count
- Animates when new notification arrives
- Click → Opens notification center

**2. Notification Center (Modal):**
```
╔════════════════════════════════════════╗
║  Notifications              Mark All   ║
╠════════════════════════════════════════╣
║  🎁 New Prize Nearby!         [2m ago] ║
║  A rare Mystery Box is 50m away!       ║
║  ────────────────────────────────────  ║
║  🏆 Achievement Unlocked!    [15m ago] ║
║  You've earned 'Explorer' badge        ║
║  ────────────────────────────────────  ║
║  💰 Balance Updated          [1h ago]  ║
║  Admin granted you 100 points          ║
╚════════════════════════════════════════╝
```

**3. Toast Notification (In-app):**
```
╔════════════════════════════════════════╗
║  🎁 New Prize Nearby!                  ║
║  A rare Mystery Box is 50m away!   [×] ║
╚════════════════════════════════════════╝
```
- Appears at top of screen
- Auto-dismisses after 3 seconds
- Swipe to dismiss
- Click to navigate to action

**Admin Control:**
- **Notifications Management:** Send, schedule, view analytics
- **Real-time broadcast:** All Unity clients receive instantly
- **Targeting:** City, level, active players
- **Deep linking:** Navigate users to specific screens
- **Rich content:** Images, action buttons, custom data

**Control from Unity:** 
- Notifications appear immediately via WebSocket
- Push notifications delivered via FCM/APNS
- In-app notifications shown as toasts
- Badge counts update in real-time
- Deep links navigate to relevant screens (map, marketplace, profile)

---

## �🔌 WebSocket Real-time Events

### Connection
```javascript
// Unity connects automatically on login
ws://api.yallacatch.tn/ws?token=<JWT_TOKEN>
```

### Events Unity Receives

#### 1. Stats Update
```json
{
  "event": "stats_update",
  "data": {
    "stats": {
      "totalPoints": 820,
      "level": "gold",
      "newAchievements": []
    }
  }
}
```

#### 2. New Prize Nearby
```json
{
  "event": "prize_nearby",
  "data": {
    "prize": {
      "id": "prize_new",
      "title": "Special Event Prize",
      "distance": 15.5
    }
  }
}
```

#### 3. Friend Online
```json
{
  "event": "friend_online",
  "data": {
    "friendId": "user_202",
    "displayName": "Ahmed_TN"
  }
}
```

#### 4. Achievement Unlocked
```json
{
  "event": "achievement_unlocked",
  "data": {
    "achievement": {
      "id": "ach_distance_10km",
      "title": "Marathon Runner",
      "points": 50
    }
  }
}
```

#### 5. Balance Update (Real-time)
```json
{
  "event": "balance_update",
  "data": {
    "balance": {
      "available": 850,
      "total": 1350,
      "spent": 500
    },
    "change": +50,
    "reason": "admin_grant",
    "message": "Admin awarded you 50 bonus points"
  }
}
```

#### 6. Notification Received
```json
{
  "event": "notification_received",
  "data": {
    "notification": {
      "id": "notif_999",
      "title": "New Event!",
      "message": "Double points weekend starts now!",
      "type": "announcement",
      "priority": 4,
      "actionUrl": "yallacatch://events"
    }
  }
}
```

**Unity Implementation:**
```csharp
YallaCatchClient.Instance.OnStatsUpdate += (stats) => {
    UpdateUserStatsUI(stats);
};

YallaCatchClient.Instance.OnBalanceUpdate += (balance) => {
    UpdateBalanceUI(balance);
    if (balance.change > 0) {
        ShowFloatingPoints($"+{balance.change}");
    }
};

YallaCatchClient.Instance.OnPrizeNearby += (prize) => {
    ShowNewPrizeNotification(prize);
    AddPrizeToMap(prize);
};

YallaCatchClient.Instance.OnAchievementUnlocked += (achievement) => {
    PlayAchievementAnimation(achievement);
};

YallaCatchClient.Instance.OnNotificationReceived += (notification) => {
    ShowInAppNotification(notification);
    IncrementBadgeCount();
};
```

---

## 🎛️ Admin Panel Control Guide

### Complete Admin Control Map

#### Dashboard (Real-time Overview)
**Features:**
- Live active users count
- Current game sessions
- Recent captures (auto-updating)
- Today's revenue
- System health status

**Actions:**
- Monitor real-time activity
- Quick navigation to problem areas
- Export daily reports

**WebSocket:** ✅ Yes - Updates every second

---

#### Users Management
**Features:**
- Search users by email/name/ID
- Filter: Active, Banned, Verified
- View detailed user profile
- Edit user points, level
- Ban/unban users
- View user activity history

**Actions:**
1. **Add Points:** User → Points → "+" button
2. **Ban User:** User → Ban button → Reason → Confirm
3. **Verify Account:** User → Verify button
4. **View Sessions:** User → Sessions tab
5. **Reset Password:** User → Reset Password button

**WebSocket:** ✅ Yes - New users, updates appear instantly

---

#### Prize Distribution
**Features:**
- Create single prize
- Auto-distribute prizes (circle selection on map)
- Manual prize placement
- Schedule prize releases
- Set expiration times

**Actions:**
1. **Manual Placement:**
   - Click map location
   - Fill prize details (points, category, rarity)
   - Set radius
   - Click "Place Prize"

2. **Auto Distribution:**
   - Select city from dropdown
   - Click map to draw circle
   - Set density (prizes per km²)
   - Choose rarity distribution
   - Click "Start Auto Distribution"
   - Prizes generated automatically

3. **Scheduled Release:**
   - Create prize
   - Set "Scheduled For" date/time
   - Prize appears at exact time

**WebSocket:** ✅ Yes - Distribution updates broadcast

**Control from Unity:** Prizes appear on map automatically

---

#### Prize Claims Management
**Features:**
- View all capture attempts
- Filter: Pending, Validated, Rejected
- Anti-fraud detection
- GPS verification
- Device fingerprinting

**Actions:**
1. **Validate Claim:**
   - Click claim row
   - Review location data
   - Check AR session data
   - Click "Validate" → User gets points

2. **Reject Claim:**
   - Click "Reject" button
   - Select reason (distance, suspicious, duplicate)
   - Claim marked as rejected

3. **Bulk Actions:**
   - Select multiple claims
   - Click "Validate Selected" or "Reject Selected"

**WebSocket:** ✅ Yes - New claims appear instantly

**Control from Unity:** Validation/rejection syncs to user immediately

---

#### Rewards Management (YallaCatch Platform Rewards)
**Features:**
- Create official YallaCatch rewards
- Badge systems (Bronze, Silver, Gold)
- Platform benefits (XP boost, capture radius)
- Exclusive cosmetics
- Track redemptions

**Actions:**
1. **Create Platform Reward:**
   - Click "+" button
   - Select type: Badge / Benefit / Cosmetic
   - Set name, description
   - Set points cost
   - Define benefits (JSON)
   - Upload image/icon
   - Save

2. **View Redemptions:**
   - See who redeemed what
   - Track benefit usage
   - Analytics per reward

**WebSocket:** ✅ Yes - New rewards broadcast

**Control from Unity:** 
- Platform rewards appear in "Rewards" tab
- Distinguished by YallaCatch branding
- Benefits apply immediately upon redemption

---

#### Marketplace Management (Partner/Admin Items)
**Features:**
- Add partner items (vouchers, deals)
- Add admin items (bundles, special offers)
- Set point costs
- Manage stock levels
- Partner integration
- Category management

**Actions:**
1. **Add Partner Item:**
   - Click "+" button
   - Select "Partner Item"
   - Choose partner from dropdown
   - Fill form (name, description, category)
   - Set points cost
   - Upload image
   - Set stock quantity
   - Define redemption instructions
   - Save

2. **Add Admin Item:**
   - Click "+" button
   - Select "Admin Item"
   - Create custom bundles/offers
   - Set points cost
   - Configure contents
   - Save

3. **Update Stock:**
   - Edit item → Stock field → Save
   - Real-time update to Unity clients

4. **Toggle Availability:**
   - Click Active/Inactive toggle
   - Immediate effect on Unity marketplace

**WebSocket:** ✅ Yes - Stock updates, new items broadcast

**Control from Unity:** 
- Marketplace items appear in "Marketplace" tab
- Partner items show partner logo
- Admin items show YallaCatch badge
- QR codes generated for vouchers

---

#### Redemptions Tracking (Both Systems)
**Features:**
- View all redemptions (Rewards + Marketplace)
- QR code validation (Marketplace vouchers)
- Partner fulfillment tracking
- Expiration management
- Revenue analytics

**Actions:**
1. **View All Redemptions:** 
   - Filter by type: Rewards / Marketplace
   - Filter by partner
   - Date range

2. **Partner Validation:** 
   - Partner scans QR → Auto-validates
   - Updates status to "Redeemed"

3. **Manual Override:** 
   - Mark as redeemed/expired
   - Refund points if needed

**WebSocket:** ✅ Yes - Redemption updates real-time

---

#### Partners Management
**Features:**
- Add partners (McDonald's, Carrefour, etc.)
- Manage locations
- View redemption statistics
- Partner portal access

**Actions:**
1. **Add Partner:**
   - Click "+" → Partner details → Save
   
2. **Add Location:**
   - Partner → Locations tab → "+" → Map click → Save

3. **View Stats:**
   - Partner → Analytics tab → Redemption rate

**WebSocket:** ✅ Yes - Partner updates

---

#### Power-Up Management
**Features:**
- Create power-ups
- Set drop rates
- Configure effects
- Usage analytics

**Actions:**
1. **Create Power-Up:**
   - Click "+" button
   - Name, description, icon
   - Set type (radar_boost, double_points, etc.)
   - Configure effects (radiusMultiplier, duration)
   - Set rarity and drop rate
   - Save

2. **Edit Drop Rate:**
   - Edit → Drop Rate field → Save
   - Affects Unity drops immediately

**WebSocket:** ✅ Yes - Power-up updates

**Control from Unity:** Drop rates affect prize rewards

---

#### Achievements Management
**Features:**
- Create achievements
- Set unlock conditions
- Configure rewards
- Track unlock rate

**Actions:**
1. **Create Achievement:**
   - Click "+" → Details
   - Set trigger (PRIZE_CLAIMED, DISTANCE_WALKED, etc.)
   - Set condition (type: TOTAL_CLAIMS, target: 100)
   - Set reward points
   - Save

2. **View Unlock Rate:**
   - Eye icon → Statistics → % unlocked

**WebSocket:** ✅ Yes - Achievement unlocks broadcast

**Control from Unity:** Achievements trigger automatically

---

#### Game Monitoring
**Features:**
- Active sessions
- Real-time player locations
- Leaderboard management
- Game settings control
- Maintenance mode

**Actions:**
1. **View Active Sessions:**
   - See all players currently playing
   - Session duration, location, activity

2. **Terminate Session:**
   - Click session → Terminate → Reason
   - Forces logout in Unity

3. **Enable Maintenance:**
   - Click "Start Maintenance" button
   - All Unity clients show maintenance screen
   - No new sessions allowed

4. **Adjust Game Settings:**
   - Capture radius
   - Point multipliers
   - Daily limits
   - Save → Instant effect

**WebSocket:** ✅ Yes - Game control updates

**Control from Unity:** Maintenance locks game, settings applied instantly

---

#### Anti-Cheat Dashboard
**Features:**
- Fraud detection
- Speed violation tracking
- GPS spoofing detection
- Suspicious pattern analysis

**Actions:**
1. **Flag User:**
   - Auto-flagged users appear with risk score
   - Review → Ban if confirmed

2. **Override Decision:**
   - False positive → Override → Unban

**WebSocket:** ✅ Yes - Fraud alerts real-time

**Control from Unity:** Bans prevent login

---

#### Analytics Page
**Features:**
- User growth charts
- Revenue analytics
- Engagement metrics
- Geographic heatmaps

**Actions:**
- Select period (day, week, month, year)
- Export data (CSV, JSON)
- View trends

**WebSocket:** ✅ Yes - Stats update live

---

#### Notifications Management
**Features:**
- Send push notifications
- Schedule notifications
- Target users (all, specific, city)
- Templates management

**Actions:**
1. **Send Notification:**
   - Click "Send" button
   - Title, message
   - Select channel (push, email, in-app)
   - Target: All users / Specific IDs / By city
   - Send immediately or schedule

2. **Unity receives:**
   - Push notification (FCM/APNS)
   - In-app notification via WebSocket

**WebSocket:** ✅ Yes - In-app notifications

**Control from Unity:** Notifications appear in Unity UI

---

#### Settings Page
**Features:**
- Game configuration
- Progression settings (level requirements)
- Anti-cheat thresholds
- Offline mode settings

**Actions:**
1. **Edit Levels:**
   - Progression Settings tab
   - Adjust points required per level
   - Save → Affects Unity level-up calculations

2. **Anti-Cheat Settings:**
   - Max speed allowed
   - Distance threshold
   - Validation strictness

**WebSocket:** ✅ Yes - Settings updates

**Control from Unity:** Settings sync on game start

---

#### System Management
**Features:**
- System health monitoring
- Database metrics
- Redis status
- Backup management
- Device token management

**Actions:**
1. **Create Backup:** Click "Create Backup"
2. **Start Maintenance:** Maintenance toggle
3. **Clear Cache:** Click "Clear Cache"
4. **Revoke Device Tokens:** User logout

**WebSocket:** ✅ Yes - System alerts

---

#### Activity Log
**Features:**
- Complete audit trail
- All admin actions logged
- User actions tracked
- Filter by action type, user, date

**Actions:**
- Search logs
- Export for compliance
- Review admin activity

**WebSocket:** ✅ Yes - New actions appear live

---

#### AB Testing Management
**Features:**
- Create A/B tests
- Test variations
- Measure conversion
- Statistical analysis

**Actions:**
1. **Create Test:**
   - Test name, description
   - Variants (A, B)
   - Traffic split (50/50)
   - Metrics to track
   - Start test

2. **Monitor Results:**
   - Conversion rates
   - Statistical significance
   - Stop test when conclusive

**Control from Unity:** Users assigned variant automatically

---

## 📱 Implementation Phases

### Phase 1: Core Foundation (Week 1-2)
**Unity:**
- ✅ Project setup, SDK integration
- ✅ Login/Register UI
- ✅ Main menu scene
- ✅ YallaCatchClient implementation

**Testing:**
- Auth flow
- Token persistence
- Error handling

**Admin Control:**
- Users Management fully functional
- Can create/ban users manually

---

### Phase 2: Map & Location (Week 3-4)
**Unity:**
- ✅ Google Maps integration
- ✅ GPS location tracking
- ✅ Prize markers on map
- ✅ Player position indicator
- ✅ Real-time location updates

**Testing:**
- Location accuracy
- Prize distance calculation
- Map performance

**Admin Control:**
- Prize Distribution working
- Manual placement on map
- Auto-distribution functional
- Real-time prize updates visible

---

### Phase 3: AR Capture (Week 5-7)
**Unity:**
- ✅ AR Foundation setup
- ✅ Prize 3D models
- ✅ AR camera controller
- ✅ Capture validation logic
- ✅ Capture animations (mystery box opening)
- ✅ Visual effects (particles, lighting)
- ✅ Sound effects
- ✅ Haptic feedback
- ✅ Reward reveal UI

**Testing:**
- AR tracking stability
- Animation smoothness
- Network latency handling
- Offline capture queue

**Admin Control:**
- Prize Claims Management active
- Validate/reject captures
- Anti-cheat monitoring
- Real-time capture notifications

---

### Phase 4: Progression & Gamification (Week 8-9)
**Unity:**
- ✅ Level system
- ✅ Experience points
- ✅ Daily challenges UI
- ✅ Achievements system
- ✅ Power-ups inventory
- ✅ Power-up usage effects

**Testing:**
- Level progression accuracy
- Challenge tracking
- Achievement triggers
- Power-up effects

**Admin Control:**
- Achievements Management
- Power-Up Management
- Edit challenges, rewards
- Grant items to users

---

### Phase 5: Rewards & Marketplace (Week 10-11)
**Unity:**
- ✅ Rewards Catalogue UI (YallaCatch platform rewards)
- ✅ Marketplace UI (Partner/Admin items, grid view)
- ✅ Separate tabs: "Rewards" vs "Marketplace"
- ✅ Visual distinction (partner logos, YallaCatch badges)
- ✅ Reward/Item details page
- ✅ Purchase/Redemption flow
- ✅ QR code display (for marketplace vouchers)
- ✅ Redemption history (both systems)
- ✅ Stock availability indicators
- ✅ Benefits application (for platform rewards)

**Testing:**
- Purchase idempotency
- QR code generation
- Stock synchronization
- Points deduction accuracy

**Admin Control:**
- Marketplace Management
- Add/edit rewards
- Stock management
- Partner integration
- Redemption tracking

---

### Phase 6: Social Features (Week 12-13)
**Unity:**
- ✅ Friends list UI
- ✅ Friend requests
- ✅ Nearby players detection
- ✅ Leaderboard (global, city)
- ✅ Social challenges
- ✅ Team creation

**Testing:**
- Friend sync
- Leaderboard accuracy
- Real-time status updates
- Challenge multiplayer

**Admin Control:**
- Friendships Management
- Monitor social activity
- Moderate content
- View social stats

---

### Phase 7: Monetization (Week 14)
**Unity:**
- ✅ AdMob SDK integration
- ✅ Rewarded video ads
- ✅ Interstitial ads
- ✅ Ad reward claiming
- ✅ Cooldown timers
- ✅ Daily limits enforcement

**Testing:**
- Ad loading
- Reward validation
- Fraud prevention
- Revenue tracking

**Admin Control:**
- AdMob Dashboard
- Configure ad units
- Set reward amounts
- Adjust daily limits
- Monitor revenue

---

### Phase 8: Offline Mode & Sync (Week 15)
**Unity:**
- ✅ Offline action queue
- ✅ Local data caching
- ✅ Background sync
- ✅ Conflict resolution
- ✅ Offline UI indicators

**Testing:**
- Queue persistence
- Sync reliability
- Conflict handling
- Data integrity

**Admin Control:**
- System Management → Offline Queue
- View queued actions
- Clear resolved items
- Monitor sync health

---

### Phase 9: Polish & Optimization (Week 16-17)
**Unity:**
- ✅ Performance optimization
- ✅ Memory management
- ✅ Asset optimization
- ✅ Loading screens
- ✅ Error handling
- ✅ Analytics integration
- ✅ Crash reporting
- ✅ Tutorial system

**Testing:**
- Load testing (1000+ concurrent users)
- Memory profiling
- Battery drain testing
- Network optimization

**Admin Control:**
- All features integrated
- Real-time monitoring
- Performance dashboards

---

### Phase 10: Launch Preparation (Week 18)
**Unity:**
- ✅ App store assets
- ✅ Privacy policy integration
- ✅ Terms of service
- ✅ Multi-language support (AR, FR, EN)
- ✅ Push notification setup
- ✅ App signing
- ✅ Beta testing

**Testing:**
- Beta user testing (100 users)
- Bug fixes
- Performance validation
- Security audit

**Admin Control:**
- Production ready
- Monitoring dashboards live
- Support team trained

---

## 🔧 Technical Specifications

### Unity Requirements
- **Unity Version:** 2022.3 LTS or higher
- **Minimum Android:** 8.0 (API 26)
- **Minimum iOS:** 13.0
- **AR Requirements:** ARCore (Android), ARKit (iOS)
- **Storage:** 200 MB minimum
- **RAM:** 2 GB minimum
- **GPS:** Required
- **Camera:** Required
- **Internet:** Required (offline mode limited)

### Required Unity Packages
```json
{
  "com.unity.xr.arfoundation": "5.1.0",
  "com.unity.xr.arcore": "5.1.0",
  "com.unity.xr.arkit": "5.1.0",
  "com.google.maps.unity": "latest",
  "com.google.firebase.messaging": "11.0.0",
  "com.google.ads.mobile": "8.0.0",
  "com.unity.nuget.newtonsoft-json": "3.2.1"
}
```

### Backend API Rate Limits
- **Authentication:** 10 requests/minute
- **Game Sessions:** 60 requests/minute
- **Location Updates:** 12 requests/minute (every 5 seconds)
- **Captures:** 30 requests/minute
- **Marketplace:** 60 requests/minute
- **General:** 100 requests/minute

### WebSocket Connection
- **URL:** `wss://api.yallacatch.tn/ws`
- **Heartbeat:** Every 30 seconds
- **Reconnect:** Exponential backoff (1s, 2s, 4s, 8s, 16s max)
- **Message Format:** JSON
- **Compression:** Enabled

---

## 🧪 Testing & Quality Assurance

### Unity Testing Checklist

#### Authentication
- [ ] Register new account
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Logout
- [ ] Token expiration handling
- [ ] Forgot password flow

#### Game Session
- [ ] Start session
- [ ] Location updates every 5 seconds
- [ ] Nearby prizes loaded
- [ ] Session persists on app background
- [ ] Session ends cleanly
- [ ] Rewards calculated correctly

#### AR Capture
- [ ] Camera initializes properly
- [ ] Prize model renders in AR
- [ ] Distance validation works
- [ ] Capture animation plays
- [ ] Points awarded correctly
- [ ] Level-up triggers
- [ ] Achievements unlock
- [ ] Network error handling

#### Map
- [ ] User location shows correctly
- [ ] Prize markers visible
- [ ] Map pans smoothly
- [ ] Zoom controls work
- [ ] Real-time updates appear
- [ ] Nearby filter works

#### Marketplace
- [ ] Items load correctly
- [ ] Search/filter works
- [ ] Purchase flow completes
- [ ] QR code displays
- [ ] Points deducted accurately
- [ ] Stock updates reflect
- [ ] Purchase history shows

#### Social
- [ ] Friends list loads
- [ ] Friend requests sent/received
- [ ] Leaderboard displays
- [ ] Nearby players shown
- [ ] Online status updates

#### AdMob
- [ ] Rewarded ads load
- [ ] Ad completes successfully
- [ ] Rewards granted
- [ ] Cooldown enforced
- [ ] Daily limit respected

#### Offline Mode
- [ ] Actions queue locally
- [ ] Sync on reconnect
- [ ] Conflicts resolved
- [ ] Data integrity maintained

#### Performance
- [ ] 60 FPS on mid-range devices
- [ ] Memory under 512 MB
- [ ] Battery drain < 10%/hour
- [ ] Cold start < 3 seconds
- [ ] Network requests < 100ms latency

### Admin Panel Testing

#### Real-time Features
- [ ] Dashboard updates live
- [ ] New captures appear instantly
- [ ] WebSocket connection stable
- [ ] Broadcast notifications work
- [ ] Stats update in real-time

#### Control Verification
- [ ] Prize distribution creates prizes in Unity
- [ ] Capture validation updates Unity
- [ ] Marketplace changes reflect in Unity
- [ ] User ban prevents login
- [ ] Maintenance mode locks game
- [ ] Settings changes apply immediately

---

## 📚 Additional Resources

### Documentation
- Unity SDK: `backend/integration-sdks/unity-game-sdk.cs`
- API Collection: `docs/YallaCatch_API_v2.0.postman_collection.json`
- Error Codes: `docs/ERROR_MAP.md`
- Configuration: `docs/CONFIGURATION_GUIDE.md`

### Support
- **Backend API:** Fully documented with OpenAPI/Swagger
- **Admin Panel:** Real-time monitoring and control
- **Unity SDK:** Complete C# implementation provided
- **WebSocket:** Event-driven architecture for real-time sync

### Deployment
- **Backend:** Docker + Kubernetes ready
- **Admin Panel:** Vite build for production
- **Unity:** Build for Android & iOS
- **Database:** MongoDB Atlas
- **Cache:** Redis Cloud

---

## 🎯 Success Metrics

### Key Performance Indicators (KPIs)

**User Engagement:**
- Daily Active Users (DAU)
- Session duration (target: 15+ minutes)
- Captures per session (target: 3+)
- Retention rate (D1, D7, D30)

**Monetization:**
- ARPU (Average Revenue Per User)
- Ad completion rate (target: 80%+)
- Marketplace conversion rate (target: 10%+)
- Revenue per session

**Technical:**
- API response time (target: <100ms)
- WebSocket uptime (target: 99.9%)
- Crash-free rate (target: 99.5%+)
- App store rating (target: 4.5+)

**Geographic:**
- Coverage in Tunisia cities
- Partner density per governorate
- User distribution heatmap

---

## 🚀 Go-to-Market Strategy

### Launch Phase (Month 1)
1. **Soft Launch** (Week 1-2)
   - 1000 beta users in Tunis
   - Admin panel monitoring 24/7
   - Bug fixes and optimizations
   
2. **Tunisia-wide Launch** (Week 3)
   - All governorates
   - 10,000+ prizes distributed
   - 50+ partners active
   
3. **Marketing Push** (Week 4)
   - Social media campaigns
   - Partner promotions
   - Influencer collaborations

### Growth Phase (Month 2-3)
- Seasonal events via Admin Panel
- Limited-time prizes
- Referral program
- Team competitions

---

## ✅ Completion Checklist

### Unity Game
- [ ] All 10 scenes implemented
- [ ] SDK fully integrated
- [ ] All API endpoints connected
- [ ] WebSocket events handled
- [ ] Offline mode working
- [ ] AdMob integrated
- [ ] AR capture polished
- [ ] Social features complete
- [ ] Tested on 10+ devices
- [ ] Submitted to stores

### Backend & Admin
- [ ] All routes documented
- [ ] Admin panel real-time updates
- [ ] All management pages functional
- [ ] WebSocket coverage 100%
- [ ] Anti-cheat active
- [ ] Performance optimized
- [ ] Security audit passed
- [ ] Production deployment ready

---

**Document Version:** 1.0.0  
**Last Updated:** January 6, 2026  
**Status:** ✅ Complete - Ready for Unity Development

---

This comprehensive plan provides everything needed to develop the Unity game with full backend integration and admin panel control. All endpoints are documented, all admin features explained, and the complete development roadmap is outlined.
