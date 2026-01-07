# YallaCatch! Backend

🎮 **AR Geolocation Game Backend** - A comprehensive Node.js + TypeScript + MongoDB backend for the YallaCatch! augmented reality geolocation game.

## 🔐 Security Setup (Important!)

Before running the application in production, please follow these security steps:

1. Generate secure RSA key pairs by running:
   ```bash
   npm run generate-keys
   ```

2. Update your `.env` file with the generated keys and other security parameters.

3. See the [SECURITY_SETUP.md](./SECURITY_SETUP.md) file for detailed instructions.

## 🚀 Features

### Core Game Features
- **🎯 Prize Discovery**: Geospatial prize placement and discovery system
- **📍 Location-based Gameplay**: Real-time GPS validation and anti-cheat protection
- **🏆 Reward System**: Points, levels, and reward redemption mechanics
- **🎮 Gamification**: RPG-style progression, achievements, and daily challenges
- **🔒 Anti-Cheat Protection**: Speed detection, mock location prevention, cooldowns

### Backend Architecture
- **⚡ High Performance**: Fastify framework with Redis caching
- **🔐 Enterprise Security**: JWT RS256 authentication, rate limiting, CORS protection
- **📊 Real-time Analytics**: Comprehensive metrics and monitoring
- **🌍 Geospatial Optimization**: MongoDB 2dsphere indexes for location queries
- **📱 Multi-platform Support**: iOS, Android, and Web client support

### Admin Dashboard
- **👥 User Management**: Complete CRUD operations with role-based access
- **🎁 Prize Management**: Bulk operations, distribution tools, heatmaps
- **📈 Analytics Dashboard**: Real-time metrics, user behavior analysis
- **🔔 Notification System**: Push notifications, email campaigns
- **⚙️ System Configuration**: Feature flags, game parameters

## 🏗️ Architecture

```
yallacatch-backend/
├── src/
│   ├── config/           # Configuration and environment setup
│   ├── lib/              # Core libraries (JWT, logging, etc.)
│   ├── models/           # MongoDB schemas and models
│   ├── modules/          # Feature modules (auth, prizes, claims, etc.)
│   ├── middleware/       # Express/Fastify middleware
│   ├── utils/            # Utility functions (geo, anti-cheat, etc.)
│   ├── services/         # External service integrations
│   ├── jobs/             # Background jobs and schedulers
│   └── types/            # TypeScript type definitions
├── docs/                 # Documentation
├── tests/                # Test suites
└── scripts/              # Deployment and utility scripts
```

## 🛠️ Technology Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5+
- **Framework**: Fastify 4+
- **Database**: MongoDB 6+ with replica sets
- **Cache**: Redis 7+
- **Authentication**: JWT RS256 with rotation
- **Validation**: Zod schemas
- **Logging**: Pino structured logging
- **Testing**: Jest + Supertest
- **Deployment**: Docker + Docker Compose

## 📋 Prerequisites

- Node.js 20+ and pnpm
- MongoDB 6+ (with replica set for transactions)
- Redis 7+
- Docker and Docker Compose (optional)

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd yallacatch-backend
pnpm install
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Database Setup

```bash
# Start MongoDB and Redis with Docker
docker-compose up -d mongodb redis

# Or use your existing instances
# Make sure MongoDB is running as a replica set
```

### 4. Generate JWT Keys

```bash
# Generate RSA key pair for JWT signing
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

# Convert to base64 for environment variables
cat private.pem | base64 -w 0
cat public.pem | base64 -w 0
```

### 5. Start Development Server

```bash
# Development mode with hot reload
pnpm dev

# Production mode
pnpm build
pnpm start
```

### 6. Verify Installation

```bash
# Health check
curl http://localhost:3000/health

# API documentation (development only)
open http://localhost:3000/docs
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3000` |
| `HOST` | Server host | `0.0.0.0` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/yallacatch` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_PRIVATE_KEY_BASE64` | Base64 encoded RSA private key | Required |
| `JWT_PUBLIC_KEY_BASE64` | Base64 encoded RSA public key | Required |
| `JWT_ISSUER` | JWT issuer claim | `yallacatch-api` |
| `JWT_AUDIENCE` | JWT audience claim | `yallacatch-app` |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |

### Game Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `GAME_MAX_SPEED_MS` | Maximum allowed speed (m/s) | `33.33` (120 km/h) |
| `GAME_COOLDOWN_MS` | Global claim cooldown | `60000` (1 minute) |
| `GAME_MAX_DAILY_CLAIMS` | Maximum daily claims per user | `50` |
| `GAME_CLAIM_RADIUS_M` | Default claim radius | `50` meters |

## 📚 API Documentation

### Authentication Endpoints

#### POST `/api/v1/auth/guest`
Create anonymous guest account
```json
{
  "deviceId": "unique-device-id",
  "platform": "iOS|Android|Web",
  "fcmToken": "optional-fcm-token",
  "location": {
    "lat": 36.8065,
    "lng": 10.1815,
    "city": "Tunis"
  }
}
```

#### POST `/api/v1/auth/register`
Register with email and password
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "displayName": "Player Name",
  "deviceId": "unique-device-id",
  "platform": "iOS|Android|Web"
}
```

#### POST `/api/v1/auth/login`
Login with email and password
```json
{
  "email": "user@example.com",
  "password": "password",
  "deviceId": "unique-device-id",
  "platform": "iOS|Android|Web"
}
```

### Game Endpoints

#### GET `/api/v1/prizes/nearby`
Find nearby prizes
```
?lat=36.8065&lng=10.1815&radius=5&category=gaming&limit=50
```

#### POST `/api/v1/claims`
Claim a prize
```json
{
  "prizeId": "prize-object-id",
  "location": {
    "lat": 36.8065,
    "lng": 10.1815,
    "accuracy": 10
  },
  "deviceSignals": {
    "speed": 0,
    "mockLocation": false
  },
  "idempotencyKey": "unique-request-id"
}
```

#### GET `/api/v1/rewards`
Get available rewards
```
?category=voucher&minCost=100&maxCost=1000&limit=20
```

#### POST `/api/v1/rewards/:rewardId/redeem`
Redeem a reward
```json
{
  "idempotencyKey": "unique-request-id"
}
```

### Admin Endpoints

#### GET `/api/v1/admin/users`
List users with filters
```
?role=player&city=Tunis&level=gold&page=1&limit=50
```

#### POST `/api/v1/admin/prizes/bulk`
Bulk create prizes
```json
{
  "prizes": [
    {
      "name": "Gaming Headset",
      "description": "High-quality gaming headset",
      "type": "physical",
      "category": "gaming",
      "points": 500,
      "rarity": "rare",
      "location": {
        "coordinates": [10.1815, 36.8065],
        "city": "Tunis",
        "radius": 50
      }
    }
  ]
}
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run specific test suite
pnpm test auth

# Run tests in watch mode
pnpm test:watch
```

## 📊 Monitoring

### Health Checks

- **Liveness**: `GET /health/live` - Basic server health
- **Readiness**: `GET /health/ready` - Database connectivity
- **Metrics**: `GET /metrics` - Prometheus metrics (if enabled)

### Logging

The application uses structured logging with Pino:

```bash
# View logs in development
pnpm dev | pnpm dlx pino-pretty

# Production logs are in JSON format
tail -f logs/app.log | jq
```

### Performance Monitoring

Key metrics tracked:
- Request duration and throughput
- Database query performance
- Cache hit rates
- Anti-cheat violation rates
- User engagement metrics

## 🚀 Deployment

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d

# Scale services
docker-compose up -d --scale api=3

# View logs
docker-compose logs -f api
```

### Production Deployment

```bash
# Build for production
pnpm build

# Start with PM2
pm2 start ecosystem.config.js

# Or use Docker in production
docker build -t yallacatch-backend .
docker run -d -p 3000:3000 --env-file .env yallacatch-backend
```

### Database Migrations

```bash
# Create indexes
pnpm run db:indexes

# Seed initial data
pnpm run db:seed

# Backup database
pnpm run db:backup
```

## 🔒 Security

### Authentication & Authorization
- JWT RS256 tokens with rotation
- Role-based access control (RBAC)
- Session management with Redis
- Device fingerprinting

### Anti-Cheat Protection
- GPS speed validation
- Mock location detection
- Cooldown enforcement
- Pattern analysis
- Device attestation (iOS/Android)

### API Security
- Rate limiting per endpoint
- CORS protection
- Input validation with Zod
- SQL injection prevention
- XSS protection headers

## 🌍 Geospatial Features

### Tunisia-Specific Configuration
- Coordinate validation within Tunisia bounds
- 8 major cities supported: Tunis, Sfax, Sousse, Kairouan, Bizerte, Gabès, Ariana, Gafsa
- Automatic city detection from coordinates
- Distance calculations using Haversine formula

### Prize Distribution
- Geospatial indexing with MongoDB 2dsphere
- Rejection sampling for optimal spacing
- Heatmap generation for analytics
- Bulk distribution tools for admins

## 📈 Scalability

### Performance Optimizations
- Redis caching for frequently accessed data
- MongoDB connection pooling
- Efficient geospatial queries
- Pagination for large datasets
- Background job processing

### Horizontal Scaling
- Stateless application design
- Session storage in Redis
- Database read replicas support
- Load balancer ready
- Microservices migration path

## 🛠️ Development

### Code Quality
- TypeScript strict mode
- ESLint + Prettier configuration
- Husky pre-commit hooks
- Conventional commits
- Automated testing

### Development Tools
```bash
# Type checking
pnpm type-check

# Linting
pnpm lint
pnpm lint:fix

# Code formatting
pnpm format

# Database tools
pnpm db:shell    # MongoDB shell
pnpm redis:cli   # Redis CLI
```

## 📝 API Rate Limits

| Endpoint Category | Rate Limit | Window |
|-------------------|------------|---------|
| Authentication | 5 requests | 15 minutes |
| Game Actions | 100 requests | 1 hour |
| Admin Operations | 1000 requests | 1 hour |
| Public Endpoints | 1000 requests | 15 minutes |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [docs/](docs/)
- **Issues**: GitHub Issues
- **Discord**: [YallaCatch! Community](https://discord.gg/yallacatch)
- **Email**: support@yallacatch.tn

## 🙏 Acknowledgments

- **MongoDB** for excellent geospatial capabilities
- **Fastify** for high-performance web framework
- **Redis** for reliable caching and session management
- **Tunisia GIS Data** for accurate geographic boundaries

---

**Made with ❤️ for the Tunisian gaming community** 🇹🇳
