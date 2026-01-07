# YallaCatch! Documentation Index

**Version**: 2.0.2  
**Last Updated**: January 2026

---

## 📋 Quick Navigation

### 🚀 Getting Started
- [Configuration Guide](./CONFIGURATION_GUIDE.md) - Environment setup, MongoDB, Redis
- [env-ready-to-use.txt](./env-ready-to-use.txt) - Ready-to-use environment file

### 📡 API Documentation
- [API Reference](./API_REFERENCE.md) - Complete REST API endpoints
- [WebSocket Events](./WEBSOCKET_EVENTS.md) - Real-time events documentation
- [Error Map](./ERROR_MAP.md) - Error codes and handling

### 📊 Data & Models
- [Data Models](./DATA_MODELS.md) - MongoDB schemas and relationships
- [QR Fulfillment Workflow](./QR_FULFILLMENT_WORKFLOW.md) - Redemption QR code flow

### 🎮 Game Development
- [Unity Game Development Plan](../UNITY_GAME_DEVELOPMENT_PLAN.md) - Complete Unity implementation guide
- [Integration Guide](../backend/INTEGRATION_GUIDE.md) - React & Unity SDK integration

### 🛠️ Admin Panel
- [Admin README](../admin/README_FINAL.md) - Admin panel documentation
- [Services Adapted](../admin/SERVICES_ADAPTED_README.md) - Service layer documentation

### 📈 Tracking & Monitoring
- [Endpoint Tracking Sheet](../ENDPOINT_TRACKING_SHEET.md) - All endpoints status
- [Monitoring Guide](../backend/Monitoring_Guide.md) - Production monitoring

---

## 📚 Document Descriptions

### Configuration Guide
Complete setup instructions for:
- MongoDB Atlas configuration
- Redis Cloud setup
- Environment variables
- JWT key generation
- Production deployment

### API Reference
Full REST API documentation including:
- Authentication endpoints
- User management
- Prize discovery & claiming
- Marketplace & rewards
- Social features
- Notifications
- Admin endpoints

### WebSocket Events
Real-time communication guide:
- Connection setup (Unity/React)
- Client → Server events
- Server → Client events
- Room management
- Reconnection handling

### Data Models
Complete database schema documentation:
- User model (levels, points, status)
- Prize model (geolocation, types)
- Claim model (validation, anti-cheat)
- Reward model (platform vs partner)
- Redemption model (QR codes)
- Partner model
- PowerUp model
- Achievement model
- Notification model
- Session model

### Error Map
Error handling guide:
- Standard error codes
- HTTP status mapping
- Client-side handling
- Localization tips

### QR Fulfillment Workflow
Step-by-step redemption process:
- Purchase flow
- QR code generation
- Partner scanning
- Fulfillment status updates
- Commission calculations

### Unity Game Development Plan
Comprehensive Unity implementation:
- Project architecture
- API integration (C# SDK)
- Map implementation (Leaflet/Google Maps)
- AR capture system
- Player balance display
- Notification system
- Offline support
- AdMob integration

### Integration Guide
SDK documentation for:
- React Admin SDK
- Unity Game SDK
- WebSocket integration
- Authentication flow
- Error handling

---

## 🗂️ File Structure

```
docs/
├── INDEX.md                          ← You are here
├── API_REFERENCE.md                  ← REST API documentation
├── WEBSOCKET_EVENTS.md               ← Real-time events
├── DATA_MODELS.md                    ← Database schemas
├── CONFIGURATION_GUIDE.md            ← Environment setup
├── ERROR_MAP.md                      ← Error codes
├── QR_FULFILLMENT_WORKFLOW.md        ← Redemption flow
├── env-ready-to-use.txt              ← Sample .env file
└── YallaCatch_API_v2.0.postman_collection.json  ← Postman collection

../
├── UNITY_GAME_DEVELOPMENT_PLAN.md    ← Unity implementation
├── ENDPOINT_TRACKING_SHEET.md        ← Endpoint status
├── README.md                         ← Project overview
├── backend/
│   ├── README.md                     ← Backend overview
│   ├── INTEGRATION_GUIDE.md          ← SDK integration
│   └── Monitoring_Guide.md           ← Production monitoring
└── admin/
    ├── README_FINAL.md               ← Admin panel guide
    └── SERVICES_ADAPTED_README.md    ← Services documentation
```

---

## 🔍 Quick Reference

### Default Credentials
```
Admin:
  Email: admin@yallacatch.com
  Password: Admin123!

Test User:
  Email: user1@test.com
  Password: User123!
```

### API Base URLs
```
Development:
  REST: http://localhost:3000/api/v1
  WebSocket: ws://localhost:3000

Production:
  REST: https://api.yallacatch.tn/api/v1
  WebSocket: wss://api.yallacatch.tn
```

### Level System
| Level | Min Points | Color |
|-------|------------|-------|
| bronze | 0 | 🥉 |
| silver | 1,000 | 🥈 |
| gold | 5,000 | 🥇 |
| platinum | 15,000 | 💎 |
| diamond | 50,000 | 💠 |

### Prize Display Types
| Type | Color | Hex |
|------|-------|-----|
| standard | Blue | #3B82F6 |
| mystery_box | Purple | #8B5CF6 |
| treasure | Orange | #D97706 |
| bonus | Green | #059669 |
| special | Pink | #DB2777 |

### Tunisia Center Coordinates
```
Latitude: 36.8065
Longitude: 10.1815
```

---

## 📞 Need Help?

1. Check the relevant documentation section above
2. Review the [Error Map](./ERROR_MAP.md) for error handling
3. Use the [Postman Collection](./YallaCatch_API_v2.0.postman_collection.json) for API testing
4. Consult the [Endpoint Tracking Sheet](../ENDPOINT_TRACKING_SHEET.md) for endpoint status
