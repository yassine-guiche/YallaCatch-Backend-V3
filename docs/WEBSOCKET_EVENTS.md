# YallaCatch! WebSocket Events Documentation

**Version**: 2.0.2  
**WebSocket URL**: `ws://localhost:3000` | `wss://api.yallacatch.tn`  
**Protocol**: Socket.IO  
**Last Updated**: January 2026

---

## 📋 Overview

YallaCatch uses WebSocket connections for real-time features including:
- Prize discovery and updates
- Player location tracking
- Balance/points updates
- Notifications
- Achievement unlocks
- Social interactions

---

## 🔌 Connection Setup

### Unity Client
```csharp
using SocketIOClient;

public class WebSocketManager : MonoBehaviour
{
    private SocketIO socket;
    
    async void Start()
    {
        socket = new SocketIO("wss://api.yallacatch.tn", new SocketIOOptions
        {
            Auth = new { token = YallaCatchClient.AccessToken },
            Reconnection = true,
            ReconnectionAttempts = 5,
            ReconnectionDelay = 1000
        });
        
        // Register event handlers
        socket.On("prize_appeared", OnPrizeAppeared);
        socket.On("prize_claimed", OnPrizeClaimed);
        socket.On("points_updated", OnPointsUpdated);
        socket.On("notification", OnNotification);
        socket.On("balance_update", OnBalanceUpdate);
        socket.On("level_up", OnLevelUp);
        
        await socket.ConnectAsync();
    }
    
    void OnPrizeAppeared(SocketIOResponse response)
    {
        var prize = response.GetValue<Prize>();
        Debug.Log($"New prize: {prize.name} at {prize.location}");
        // Update map markers
    }
    
    void OnBalanceUpdate(SocketIOResponse response)
    {
        var data = response.GetValue<BalanceUpdate>();
        // Update UI: data.currentPoints, data.totalPoints
    }
}
```

### React/Admin Panel
```javascript
import { io } from 'socket.io-client';

const socket = io(process.env.VITE_WS_URL, {
  auth: { token: localStorage.getItem('accessToken') },
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// Event listeners
socket.on('connect', () => console.log('Connected'));
socket.on('disconnect', () => console.log('Disconnected'));

socket.on('user_activity', (data) => {
  // Admin dashboard: real-time user activity
});

socket.on('new_claim', (data) => {
  // Admin dashboard: new claim notification
});
```

---

## 📤 Client → Server Events

### `join_game`
Join a game session for real-time updates.

```javascript
socket.emit('join_game', {
  sessionId: 'session_uuid',
  location: {
    lat: 36.8065,
    lng: 10.1815
  }
});
```

### `update_location`
Send location updates for nearby prize discovery.

```javascript
socket.emit('update_location', {
  lat: 36.8065,
  lng: 10.1815,
  accuracy: 10,
  speed: 1.5,
  heading: 90
});
```

### `subscribe_prizes`
Subscribe to prize updates in an area.

```javascript
socket.emit('subscribe_prizes', {
  lat: 36.8065,
  lng: 10.1815,
  radius: 5000  // meters
});
```

### `unsubscribe_prizes`
Stop receiving prize updates.

```javascript
socket.emit('unsubscribe_prizes');
```

### `ping`
Keep-alive heartbeat.

```javascript
socket.emit('ping', { timestamp: Date.now() });
```

---

## 📥 Server → Client Events

### `prize_appeared`
A new prize appeared nearby.

```json
{
  "prize": {
    "id": "prize_id",
    "name": "Mystery Box",
    "points": 200,
    "displayType": "mystery_box",
    "location": {
      "type": "Point",
      "coordinates": [10.1815, 36.8065]
    },
    "distance": 45,
    "expiresAt": "2026-01-06T12:00:00Z"
  }
}
```

**Unity Handler:**
```csharp
void OnPrizeAppeared(Prize prize)
{
    // Add marker to map
    mapController.AddPrizeMarker(
        prize.id,
        prize.location.lat,
        prize.location.lng,
        prize.displayType,
        prize.points
    );
    
    // Show notification
    NotificationManager.ShowLocal("New Prize!", $"{prize.name} appeared nearby!");
}
```

### `prize_claimed`
A prize was claimed (by you or another player).

```json
{
  "prizeId": "prize_id",
  "claimedBy": "user_id",
  "claimedByMe": false
}
```

**Unity Handler:**
```csharp
void OnPrizeClaimed(PrizeClaimedEvent data)
{
    // Remove from map
    mapController.RemovePrizeMarker(data.prizeId);
    
    if (data.claimedByMe)
    {
        // Play capture animation/sound
        AudioManager.PlaySound("capture_success");
    }
}
```

### `prize_expired`
A prize has expired.

```json
{
  "prizeId": "prize_id",
  "reason": "expired"
}
```

### `points_updated`
User's points have changed.

```json
{
  "newTotal": 15100,
  "currentPoints": 12600,
  "delta": 100,
  "reason": "prize_claim",
  "details": {
    "prizeId": "prize_id",
    "prizeName": "Coffee Voucher"
  }
}
```

**Unity Handler:**
```csharp
void OnPointsUpdated(PointsUpdate data)
{
    // Update UI
    playerBalanceUI.SetPoints(data.currentPoints, data.newTotal);
    
    // Show floating text
    if (data.delta > 0)
    {
        FloatingText.Show($"+{data.delta}", Color.green);
    }
}
```

### `balance_update`
Simplified balance update (for header display).

```json
{
  "currentPoints": 12600,
  "totalPoints": 15100,
  "timestamp": "2026-01-06T10:30:00Z"
}
```

**Unity Handler:**
```csharp
void OnBalanceUpdate(BalanceUpdate data)
{
    // Update header balance display
    UIManager.Instance.UpdateBalance(data.currentPoints);
}
```

### `level_up`
User leveled up!

```json
{
  "previousLevel": "silver",
  "newLevel": "gold",
  "rewards": [
    {
      "type": "power_up",
      "id": "double_points",
      "quantity": 2
    },
    {
      "type": "badge",
      "id": "gold_badge"
    }
  ],
  "unlockedFeatures": ["leaderboard_global", "team_creation"]
}
```

**Unity Handler:**
```csharp
void OnLevelUp(LevelUpEvent data)
{
    // Show level up animation
    LevelUpPanel.Show(data.previousLevel, data.newLevel);
    
    // Update player level display
    playerUI.SetLevel(data.newLevel);
    
    // Grant rewards
    foreach (var reward in data.rewards)
    {
        InventoryManager.AddItem(reward);
    }
    
    // Play celebration effects
    AudioManager.PlaySound("level_up");
    ParticleManager.PlayCelebration();
}
```

### `notification`
New in-app notification.

```json
{
  "id": "notification_id",
  "type": "prize_nearby",
  "title": "Prize Alert!",
  "message": "A treasure chest appeared 50m away!",
  "data": {
    "prizeId": "prize_id",
    "distance": 50
  },
  "priority": "high",
  "createdAt": "2026-01-06T10:30:00Z"
}
```

**Notification Types:**
- `prize_nearby` - New prize in range
- `prize_expiring` - Prize about to expire
- `friend_request` - New friend request
- `friend_accepted` - Friend request accepted
- `achievement_unlocked` - New achievement
- `reward_available` - New reward in marketplace
- `system` - System announcement
- `promotion` - Special offer

**Unity Handler:**
```csharp
void OnNotification(Notification notification)
{
    // Update notification badge
    notificationBadge.IncrementCount();
    
    // Show toast based on priority
    if (notification.priority == "high")
    {
        ToastManager.ShowImportant(notification.title, notification.message);
    }
    else
    {
        ToastManager.ShowInfo(notification.title, notification.message);
    }
    
    // Handle specific types
    switch (notification.type)
    {
        case "prize_nearby":
            // Pulse the map icon
            mapButton.PlayPulseAnimation();
            break;
        case "friend_request":
            // Update friends tab badge
            friendsTabBadge.Show();
            break;
    }
}
```

### `achievement_unlocked`
User earned an achievement.

```json
{
  "achievement": {
    "id": "first_capture",
    "name": "First Steps",
    "description": "Capture your first prize",
    "icon": "achievement_first_capture",
    "pointsReward": 50,
    "rarity": "common"
  }
}
```

### `friend_activity`
A friend did something notable.

```json
{
  "friendId": "friend_user_id",
  "friendName": "FriendName",
  "action": "claimed_prize",
  "details": {
    "prizeName": "Rare Treasure",
    "points": 500
  }
}
```

### `powerup_activated`
A power-up was activated.

```json
{
  "powerUpId": "double_points",
  "name": "Double Points",
  "duration": 300,
  "expiresAt": "2026-01-06T10:35:00Z",
  "effect": {
    "type": "points_multiplier",
    "value": 2
  }
}
```

### `powerup_expired`
A power-up has expired.

```json
{
  "powerUpId": "double_points",
  "name": "Double Points"
}
```

---

## 🏢 Admin-Specific Events

These events are for admin panel real-time updates.

### `user_activity`
Real-time user activity feed.

```json
{
  "type": "claim",
  "userId": "user_id",
  "userName": "PlayerName",
  "action": "Claimed Coffee Voucher",
  "points": 100,
  "location": "Tunis, Tunisia",
  "timestamp": "2026-01-06T10:30:00Z"
}
```

### `new_claim`
New capture/claim occurred.

```json
{
  "claimId": "claim_id",
  "userId": "user_id",
  "userName": "PlayerName",
  "prizeId": "prize_id",
  "prizeName": "Coffee Voucher",
  "points": 100,
  "location": {
    "lat": 36.8065,
    "lng": 10.1815,
    "city": "Tunis"
  },
  "timestamp": "2026-01-06T10:30:00Z"
}
```

### `system_alert`
System-wide alert.

```json
{
  "type": "warning",
  "title": "High Server Load",
  "message": "Server load is at 85%",
  "severity": "medium"
}
```

### `stats_update`
Dashboard stats update.

```json
{
  "activeUsers": 1250,
  "claimsToday": 3500,
  "pointsDistributed": 450000,
  "timestamp": "2026-01-06T10:30:00Z"
}
```

---

## 🔒 Authentication & Rooms

### Authentication
WebSocket connections require JWT authentication:

```javascript
const socket = io(WS_URL, {
  auth: {
    token: accessToken
  }
});
```

### Room Structure
- `user:{userId}` - Personal notifications
- `game:{sessionId}` - Game session updates
- `admin` - Admin dashboard updates
- `global` - System-wide broadcasts
- `geo:{geohash}` - Geographic region updates

### Joining Rooms
```javascript
// Join game session room
socket.emit('join_room', { room: `game:${sessionId}` });

// Join geographic area
socket.emit('join_room', { room: `geo:${geohash}` });
```

---

## 🔄 Reconnection Handling

### Unity
```csharp
socket.OnReconnecting += () => {
    UIManager.ShowReconnecting();
};

socket.OnReconnected += () => {
    UIManager.HideReconnecting();
    // Re-subscribe to prizes
    socket.Emit("subscribe_prizes", playerLocation);
};

socket.OnDisconnected += (reason) => {
    if (reason == "io server disconnect")
    {
        // Server kicked us, need to re-auth
        socket.Auth = new { token = RefreshedToken };
        socket.Connect();
    }
};
```

### React
```javascript
socket.on('connect_error', (error) => {
  if (error.message === 'jwt expired') {
    // Refresh token and reconnect
    refreshToken().then((newToken) => {
      socket.auth.token = newToken;
      socket.connect();
    });
  }
});
```

---

## 📊 Event Flow Diagrams

### Prize Discovery Flow
```
Player moves → update_location → Server processes → 
  → prize_appeared (new prizes in range)
  → prize_expired (prizes left range or expired)
```

### Capture Flow
```
Player captures prize → REST API → Server validates →
  → prize_claimed (to all nearby players)
  → points_updated (to capturing player)
  → balance_update (to capturing player)
  → level_up (if threshold reached)
  → achievement_unlocked (if earned)
```

### Purchase Flow (Marketplace)
```
Player purchases reward → REST API → Server processes →
  → balance_update (points deducted)
  → notification (purchase confirmed)
```

---

## 🧪 Testing WebSocket Events

### Using Socket.IO Tester
```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
  auth: { token: 'test_jwt_token' }
});

socket.on('connect', () => {
  console.log('Connected!');
  
  // Emit test location
  socket.emit('subscribe_prizes', {
    lat: 36.8065,
    lng: 10.1815,
    radius: 5000
  });
});

socket.onAny((eventName, ...args) => {
  console.log(`Event: ${eventName}`, args);
});
```

---

## 🔗 Related Documentation

- [API_REFERENCE.md](./API_REFERENCE.md) - REST API documentation
- [UNITY_GAME_DEVELOPMENT_PLAN.md](../UNITY_GAME_DEVELOPMENT_PLAN.md) - Unity implementation
- [INTEGRATION_GUIDE.md](../backend/INTEGRATION_GUIDE.md) - SDK integration
