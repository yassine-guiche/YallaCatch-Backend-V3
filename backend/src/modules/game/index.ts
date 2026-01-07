import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import { User } from '@/models/User';
import { Prize } from '@/models/Prize';
import { Claim } from '@/models/Claim';
import { Settings } from '@/models/Settings';
import { Partner } from '@/models/Partner';
import { typedLogger } from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';
import { configService } from '@/services/config';
import { CaptureService } from '@/modules/capture/routes';
import { calculateGeodesicDistance as calculateDistance } from '@/utils/geo';
import { validateAntiCheat as detectCheating } from '@/utils/anti-cheat';
import { MetricsService, GameMetrics } from '@/services/metrics';

// Define interfaces to replace 'any' types
interface GameSessionData {
  deviceId: string;
  platform: 'iOS' | 'Android' | 'Unity';
  version: string;
  deviceModel?: string;
  osVersion?: string;
  appVersion?: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

interface LocationUpdateData {
  sessionId: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    speed?: number;
    heading?: number;
  };
  device?: {
    model?: string;
    osVersion?: string;
    appVersion?: string;
  };
  timestamp: string;
}

interface PowerUpUsageData {
  powerUpId: string;
  location: {
    latitude: number;
    longitude: number;
  };
}

// Game session schema
const GameSessionSchema = z.object({
  deviceId: z.string(),
  platform: z.enum(['iOS', 'Android', 'Unity']),
  version: z.string(),
  deviceModel: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0)})});

// Location update schema
const LocationUpdateSchema = z.object({
  sessionId: z.string(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0),
    speed: z.number().min(0).optional(),
    heading: z.number().min(0).max(360).optional()}),
  device: z.object({
    model: z.string().optional(),
    osVersion: z.string().optional(),
    appVersion: z.string().optional(),
  }).optional(),
  timestamp: z.string().datetime()});

// Power-up usage schema
const PowerUpUsageSchema = z.object({
  powerUpId: z.string(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)})});

// Capture attempt schema (CRITICAL for prize capture flow)
const CaptureAttemptSchema = z.object({
  prizeId: z.string(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(1000).optional(),
    altitude: z.number().optional()
  }),
  deviceInfo: z.object({
    platform: z.enum(['iOS', 'Android']),
    deviceModel: z.string(),
    osVersion: z.string().optional(),
    appVersion: z.string().optional(),
    timestamp: z.string().datetime().optional()
  }).optional(),
  captureMethod: z.enum(['tap', 'gesture', 'voice']).default('tap')
});

// Capture validation schema
const CaptureValidationSchema = z.object({
  prizeId: z.string(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  })
});

export class GameService {
  private static redis = redisClient;

  /**
   * Start a new game session
   */
  static async startGameSession(userId: string, sessionData: GameSessionData, context?: { ip?: string; userAgent?: string }) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('USER_NOT_FOUND');

      if (user.isBanned) throw new Error('USER_BANNED');

      // Persist last active + optional location/device + ip/ua
      user.lastActive = new Date();
      if (sessionData.location) {
        user.updateLocation(sessionData.location.latitude, sessionData.location.longitude, user.location?.city || '');
      }
      user.addDevice(
        sessionData.deviceId,
        sessionData.platform as any,
        undefined,
        {
          model: sessionData.deviceModel,
          osVersion: sessionData.osVersion,
          appVersion: sessionData.appVersion || sessionData.version,
          userAgent: context?.userAgent,
        }
      );
      if (context?.ip) (user as any).lastIp = context.ip;
      if (context?.userAgent) (user as any).lastUserAgent = context.userAgent;
      await user.save();

      // Generate session ID
      const sessionId = `game_session_${userId}_${Date.now()}`;
      
      // Store session in Redis
      const session = {
        sessionId,
        userId,
        startTime: new Date().toISOString(),
        deviceId: sessionData.deviceId,
        platform: sessionData.platform,
        version: sessionData.version,
        initialLocation: sessionData.location,
        currentLocation: sessionData.location,
        distanceTraveled: 0,
        prizesFound: 0,
        claimsAttempted: 0,
        powerUpsUsed: 0,
        status: 'active'};

      await this.redis.setex(`session:${sessionId}`, 3600, JSON.stringify(session));
      
      // Update user last active
      await User.findByIdAndUpdate(userId, {
        $set: { lastActive: new Date() },
        $inc: { 'stats.totalSessions': 1 }});

      typedLogger.info('Game session started', { userId, sessionId, location: sessionData.location });

      return {
        sessionId,
        startTime: session.startTime,
        userLevel: user.level,
        userPoints: user.points,
        dailyChallenges: await this.getDailyChallenges(userId)};
    } catch (error) {
      typedLogger.error('Start game session error', { error: (error as any).message, userId });
      throw error;
    }
  }

  /**
   * End game session
   */
  static async endGameSession(userId: string, sessionId: string) {
    try {
      const sessionKey = `session:${sessionId}`;
      const sessionData = await this.redis.get(sessionKey);
      
      if (!sessionData) throw new Error('SESSION_NOT_FOUND');
      
      const session = JSON.parse(sessionData);
      if (session.userId !== userId) throw new Error('SESSION_UNAUTHORIZED');

      // Calculate session stats
      const endTime = new Date();
      const startTime = new Date(session.startTime);
      const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000); // seconds

      // Update session with end data
      session.endTime = endTime.toISOString();
      session.duration = duration;
      session.status = 'completed';

      // Store final session data
      await this.redis.setex(sessionKey, 86400, JSON.stringify(session)); // Keep for 24h

      // Update user stats
      await User.findByIdAndUpdate(userId, {
        $inc: {
          'stats.totalPlayTime': duration,
          'stats.totalDistance': session.distanceTraveled || 0}});

      // Calculate session rewards
      const sessionRewards = this.calculateSessionRewards(session);

      // Record game metrics for analytics
      const gameMetrics: GameMetrics = {
        sessionDuration: duration,
        prizesFound: session.prizesFound || 0,
        prizesClaimed: session.claimsAttempted || 0,
        distanceTraveled: session.distanceTraveled || 0,
        averageSpeed: duration > 0 ? (session.distanceTraveled || 0) / duration : 0,
        batteryUsage: 0, // Unity client would provide this
        networkLatency: 0, // Unity client would provide this
        frameRate: 0, // Unity client would provide this
        crashes: 0
      };
      await MetricsService.recordGameMetrics(userId, sessionId, gameMetrics);

      typedLogger.info('Game session ended', { 
        userId, 
        sessionId, 
        duration, 
        distanceTraveled: session.distanceTraveled,
        prizesFound: session.prizesFound});

      return {
        sessionId,
        duration,
        distanceTraveled: session.distanceTraveled,
        prizesFound: session.prizesFound,
        claimsAttempted: session.claimsAttempted,
        powerUpsUsed: session.powerUpsUsed,
        rewards: sessionRewards};
    } catch (error) {
      typedLogger.error('End game session error', { error: (error as any).message, userId, sessionId });
      throw error;
    }
  }

  /**
   * Update player location during game
   */
  static async updateLocation(userId: string, locationData: LocationUpdateData, context?: { ip?: string; userAgent?: string }) {
    try {
      const sessionKey = `session:${locationData.sessionId}`;
      const sessionData = await this.redis.get(sessionKey);
      
      if (!sessionData) throw new Error('SESSION_NOT_FOUND');
      
      const session = JSON.parse(sessionData);
      if (session.userId !== userId) throw new Error('SESSION_UNAUTHORIZED');

      // Check for cheating - adapt parameters to match anti-cheat function
      // Convert location to Coordinates format (lat/lng)
      const locationForAntiCheat = {
        lat: locationData.location.latitude,
        lng: locationData.location.longitude
      };
      const cheatDetection = await detectCheating(userId, locationForAntiCheat, {
        speed: locationData.location.speed,
        timestamp: new Date(locationData.timestamp)
      });

      if ((cheatDetection as any).isCheating || (cheatDetection as any).allowed === false) {
        typedLogger.warn('Cheating detected', {
          userId,
          sessionId: locationData.sessionId,
          reason: (cheatDetection as any).reason});

        // Don't throw error, just log for analysis
      }

      // Calculate distance traveled
      const distance = calculateDistance(
        { lat: session.currentLocation.latitude, lng: session.currentLocation.longitude },
        { lat: locationData.location.latitude, lng: locationData.location.longitude }
      );

      // Update session
      session.currentLocation = locationData.location;
      session.distanceTraveled += distance;
      session.lastUpdate = new Date().toISOString();

      await this.redis.setex(sessionKey, 3600, JSON.stringify(session));

      // Persist user location + device meta + ip/ua best-effort
      const user = await User.findById(userId);
      if (user) {
        user.updateLocation(locationData.location.latitude, locationData.location.longitude, user.location?.city || '');
        user.lastActive = new Date();
        if (context?.ip) (user as any).lastIp = context.ip;
        if (context?.userAgent) (user as any).lastUserAgent = context.userAgent;
        if (locationData.device) {
          user.addDevice(
            session.deviceId,
            session.platform as any,
            undefined,
            {
              model: locationData.device.model,
              osVersion: locationData.device.osVersion,
              appVersion: locationData.device.appVersion,
              userAgent: context?.userAgent,
            }
          );
        }
        await user.save();
      }

      // Find nearby prizes
      const nearbyPrizes = await this.findNearbyPrizes(locationData.location, userId);

      return {
        success: true,
        distanceTraveled: session.distanceTraveled,
        nearbyPrizes,
        cheatWarning: (cheatDetection as any).isCheating ? (cheatDetection as any).reason : null};
    } catch (error) {
      typedLogger.error('Update location error', { error: (error as any).message, userId });
      throw error;
    }
  }

  /**
   * Get leaderboard
   */
  static async getLeaderboard(type: string = 'points', limit: number = 50) {
    try {
      let sortField = 'points';
      
      switch (type) {
        case 'claims':
          sortField = 'stats.totalClaims';
          break;
        case 'distance':
          sortField = 'stats.totalDistance';
          break;
        case 'level':
          sortField = 'level';
          break;
        default:
          sortField = 'points';
      }

      const users = await User.find({ isBanned: false })
        .select('displayName level points stats.totalClaims stats.totalDistance avatar')
        .sort({ [sortField]: -1 })
        .limit(limit);

      return users.map((user, index) => ({
        rank: index + 1,
        userId: user._id,
        displayName: user.displayName,
        level: user.level,
        points: user.points,
        totalClaims: (user as any).stats?.totalClaims || 0,
        totalDistance: (user as any).stats?.totalDistance || 0,
        avatar: user.avatar}));
    } catch (error) {
      typedLogger.error('Get leaderboard error', { error: (error as any).message, type });
      throw error;
    }
  }

  /**
   * Get map data optimized for Unity
   */
  static async getMapData(bounds: any, userId: string) {
    try {
      const { north, south, east, west } = bounds;
      
      // Get active prizes in bounds
      const prizes = await Prize.find({
        status: 'active',
        'location.coordinates': {
          $geoWithin: {
            $box: [[west, south], [east, north]]
          }
        }
      }).select('title description category points location rarity expiresAt');

      // Get active partner locations in bounds for map overlay
      const partners = await Partner.find({
        isActive: true,
        'locations.coordinates': {
          $geoWithin: {
            $box: [[west, south], [east, north]]
          }
        }
      })
      .select('name category logo locations')
      .limit(100); // guardrail

      // Get user's claimed prizes to exclude
      const userClaims = await Claim.find({ userId }).select('prizeId');
      const claimedPrizeIds = userClaims.map(claim => claim.prizeId.toString());

      // Filter out claimed prizes
      const availablePrizes = prizes.filter(prize => 
        !claimedPrizeIds.includes(prize._id.toString())
      );

      // Format for Unity
      const mapData = {
        prizes: availablePrizes.map(prize => ({
          id: prize._id,
          title: prize.name,
          category: prize.category,
          points: prize.points,
          rarity: prize.rarity,
          position: {
            lat: prize.location.coordinates[1],
            lng: prize.location.coordinates[0]},
          expiresAt: prize.expiresAt})),
        partners: partners.map(partner => ({
          id: partner._id,
          name: partner.name,
          category: (partner as any).category,
          logo: (partner as any).logo,
          locations: (partner as any).locations
            ?.filter((loc: any) => loc.isActive && loc.coordinates?.length === 2)
            .map((loc: any) => ({
              id: loc._id,
              name: loc.name,
              position: { lat: loc.coordinates[1], lng: loc.coordinates[0] },
              address: loc.address,
              city: loc.city,
            })) || []
        })),
        markers: [
          // Prize markers
          ...availablePrizes.map(prize => ({
            id: prize._id,
            type: 'prize' as const,
            title: prize.name,
            position: { lat: prize.location.coordinates[1], lng: prize.location.coordinates[0] },
            category: prize.category,
            rarity: prize.rarity,
            points: prize.points,
          })),
          // Partner markers
          ...partners.flatMap(partner =>
            (partner as any).locations
              ?.filter((loc: any) => loc.isActive && loc.coordinates?.length === 2)
              .map((loc: any) => ({
                id: loc._id,
                type: 'partner' as const,
                title: partner.name,
                position: { lat: loc.coordinates[1], lng: loc.coordinates[0] },
                category: (partner as any).category,
              })) || []
          ),
        ],
        bounds: { north, south, east, west },
        timestamp: new Date().toISOString()};

      return mapData;
    } catch (error) {
      typedLogger.error('Get map data error', { error: (error as any).message, bounds, userId });
      throw error;
    }
  }

  /**
   * Use power-up
   */
  static async usePowerUp(userId: string, powerUpData: PowerUpUsageData) {
    try {
      const user = await User.findById(userId);
      if (!user) throw new Error('USER_NOT_FOUND');

      // Check if user has the power-up
      const powerUp = user.inventory?.powerUps?.find(p => p.id === powerUpData.powerUpId);
      if (!powerUp || powerUp.quantity <= 0) {
        throw new Error('POWER_UP_NOT_AVAILABLE');
      }

      let effect = {};

      switch (powerUpData.powerUpId) {
        case 'radar_boost':
          // Increase detection radius for 10 minutes
          effect = {
            type: 'radar_boost',
            radius: 200, // meters
            duration: 600, // seconds
            expiresAt: new Date(Date.now() + 600000)};
          break;
        
        case 'double_points':
          // Double points for next 5 claims
          effect = {
            type: 'double_points',
            multiplier: 2,
            remainingUses: 5,
            expiresAt: new Date(Date.now() + 3600000), // 1 hour max
          };
          break;
        
        case 'speed_boost':
          // Reduce cooldown between claims
          effect = {
            type: 'speed_boost',
            cooldownReduction: 0.5,
            duration: 1800, // 30 minutes
            expiresAt: new Date(Date.now() + 1800000)};
          break;
        
        default:
          throw new Error('UNKNOWN_POWER_UP');
      }

      // Apply power-up effect
      const updateObj: any = {};
      updateObj[`inventory.powerUps.${powerUp.id}.quantity`] = -1;

      await User.findByIdAndUpdate(userId, {
        $inc: updateObj,
        $push: { activeEffects: effect }
      });

      typedLogger.info('Power-up used', { userId, powerUpId: powerUpData.powerUpId, location: powerUpData.location });

      return {
        success: true,
        effect,
        remainingQuantity: powerUp.quantity - 1};
    } catch (error) {
      typedLogger.error('Use power-up error', { error: (error as any).message, userId, powerUpData });
      throw error;
    }
  }

  /**
   * Get daily challenges
   */
  static async getDailyChallenges(userId: string) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const challengeKey = `challenges:${userId}:${today}`;
      
      // Check if challenges already exist for today
      let challenges = await this.redis.get(challengeKey);

      if (!challenges) {
        // Generate new daily challenges (now reads from Settings)
        const newChallenges = await this.generateDailyChallenges(userId);
        await this.redis.setex(challengeKey, 86400, JSON.stringify(newChallenges)); // 24 hours
        return newChallenges;
      } else {
        return JSON.parse(challenges);
      }
    } catch (error) {
      typedLogger.error('Get daily challenges error', { error: (error as any).message, userId });
      throw error;
    }
  }

  /**
   * Complete daily challenge
   */
  static async completeChallenge(userId: string, challengeId: string) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const challengeKey = `challenges:${userId}:${today}`;
      
      const challengesData = await this.redis.get(challengeKey);
      if (!challengesData) throw new Error('CHALLENGES_NOT_FOUND');
      
      const challenges = JSON.parse(challengesData);
      const challenge = challenges.find((c: any) => c.id === challengeId);
      
      if (!challenge) throw new Error('CHALLENGE_NOT_FOUND');
      if (challenge.completed) throw new Error('CHALLENGE_ALREADY_COMPLETED');
      
      // Mark as completed
      challenge.completed = true;
      challenge.completedAt = new Date().toISOString();
      
      // Award rewards
      await User.findByIdAndUpdate(userId, {
        $inc: { points: challenge.reward }});
      
      // Update challenges in Redis
      await this.redis.setex(challengeKey, 86400, JSON.stringify(challenges));
      
      typedLogger.info('Challenge completed', { userId, challengeId, reward: challenge.reward });
      
      return {
        success: true,
        challenge,
        pointsAwarded: challenge.reward};
    } catch (error) {
      typedLogger.error('Complete challenge error', { error: (error as any).message, userId, challengeId });
      throw error;
    }
  }

  /**
   * Get user inventory
   */
  static async getInventory(userId: string) {
    try {
      const user = await User.findById(userId).select('inventory activeEffects');
      if (!user) throw new Error('USER_NOT_FOUND');

      return {
        powerUps: user.inventory?.powerUps || [],
        items: user.inventory?.items || [],
        activeEffects: user.activeEffects || []};
    } catch (error) {
      typedLogger.error('Get inventory error', { error: (error as any).message, userId });
      throw error;
    }
  }

  // Helper methods
  private static async findNearbyPrizes(location: { latitude: number; longitude: number }, userId: string) {
    try {
      // Get detection radius from config (real-time, can be changed without restart)
      const detectionRadius = await configService.getConfigValue<number>('game.prizeDetectionRadiusM');
      const maxDistance = (detectionRadius || 100) * 1; // Convert meters to meters (already in correct unit)

      const nearbyPrizes = await Prize.find({
        status: 'active',
        'location.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [location.longitude, location.latitude]
            },
            $maxDistance: maxDistance
          }
        }
      }).limit(10);

      return nearbyPrizes.map(prize => ({
        id: prize._id,
        title: prize.name,
        category: prize.category,
        points: prize.points,
        rarity: prize.rarity,
        position: {
          lat: prize.location.coordinates[1],
          lng: prize.location.coordinates[0]
        },
        distance: calculateDistance(
          { lat: location.latitude, lng: location.longitude },
          { lat: prize.location.coordinates[1], lng: prize.location.coordinates[0] }
        )}));
    } catch (error) {
      typedLogger.error('Error finding nearby prizes', { error });
      // Fallback to default 100m radius on error
      const nearbyPrizes = await Prize.find({
        status: 'active',
        'location.coordinates': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [location.longitude, location.latitude]
            },
            $maxDistance: 100
          }
        }
      }).limit(10);

      return nearbyPrizes.map(prize => ({
        id: prize._id,
        title: prize.name,
        category: prize.category,
        points: prize.points,
        rarity: prize.rarity,
        position: {
          lat: prize.location.coordinates[1],
          lng: prize.location.coordinates[0]
        },
        distance: calculateDistance(
          { lat: location.latitude, lng: location.longitude },
          { lat: prize.location.coordinates[1], lng: prize.location.coordinates[0] }
        )}));
    }
  }

  private static async generateDailyChallenges(userId: string) {
    try {
      // Read from ConfigService (real-time, cached, with hot-reload support)
      const dailyChallenges = await configService.getConfigValue('custom.dailyChallenges');
      
      if (dailyChallenges && Array.isArray(dailyChallenges)) {
        return dailyChallenges;
      }

      // Fallback to default challenges if not configured
      return [
        {
          id: 'daily_claims',
          title: 'Prize Hunter',
          description: 'Claim 5 prizes today',
          type: 'claims',
          target: 5,
          progress: 0,
          reward: 100,
          completed: false
        },
        {
          id: 'distance_walker',
          title: 'Explorer',
          description: 'Walk 2km while playing',
          type: 'distance',
          target: 2000, // meters
          progress: 0,
          reward: 75,
          completed: false
        },
        {
          id: 'category_variety',
          title: 'Variety Seeker',
          description: 'Claim prizes from 3 different categories',
          type: 'categories',
          target: 3,
          progress: 0,
          reward: 50,
          completed: false
        }
      ];
    } catch (error) {
      typedLogger.error('Error generating daily challenges', { error: (error as any).message, userId });
      // Return defaults on error
      return [
        {
          id: 'daily_claims',
          title: 'Prize Hunter',
          description: 'Claim 5 prizes today',
          type: 'claims',
          target: 5,
          progress: 0,
          reward: 100,
          completed: false
        },
        {
          id: 'distance_walker',
          title: 'Explorer',
          description: 'Walk 2km while playing',
          type: 'distance',
          target: 2000,
          progress: 0,
          reward: 75,
          completed: false
        },
        {
          id: 'category_variety',
          title: 'Variety Seeker',
          description: 'Claim prizes from 3 different categories',
          type: 'categories',
          target: 3,
          progress: 0,
          reward: 50,
          completed: false
        }
      ];
    }
  }

  private static calculateSessionRewards(session: any) {
    const rewards = {
      basePoints: 0,
      distanceBonus: 0,
      timeBonus: 0,
      discoveryBonus: 0,
      total: 0};

    // Base points for playing
    rewards.basePoints = 10;

    // Distance bonus (1 point per 100m)
    rewards.distanceBonus = Math.floor(session.distanceTraveled / 100);

    // Time bonus (1 point per minute, max 30)
    rewards.timeBonus = Math.min(Math.floor(session.duration / 60), 30);

    // Discovery bonus (5 points per prize found)
    rewards.discoveryBonus = session.prizesFound * 5;

    rewards.total = rewards.basePoints + rewards.distanceBonus + rewards.timeBonus + rewards.discoveryBonus;

    return rewards;
  }
}

export default async function gameRoutes(fastify: FastifyInstance) {
  // Start game session
  fastify.post<{ Body: GameSessionData }>(
    '/session/start',
    {
      preHandler: [authenticate],
      schema: {
        body: GameSessionSchema
      }
    }, async (request, reply) => {
    try {
      const result = await GameService.startGameSession(request.user.sub, request.body, {
        ip: request.ip,
        userAgent: (request.headers['user-agent'] as string) || undefined,
      });
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // End game session
  fastify.post<{ Body: { sessionId: string } }>(
    '/session/end',
    {
      preHandler: [authenticate],
      schema: {
        body: z.object({
          sessionId: z.string()
        })
      }
    }, async (request, reply) => {
    try {
      const result = await GameService.endGameSession(request.user.sub, request.body.sessionId);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Update location
  fastify.post<{ Body: LocationUpdateData }>(
    '/location/update',
    {
      preHandler: [authenticate],
      schema: {
        body: LocationUpdateSchema
      }
    }, async (request, reply) => {
    try {
      const result = await GameService.updateLocation(request.user.sub, request.body, {
        ip: request.ip,
        userAgent: (request.headers['user-agent'] as string) || undefined,
      });
      reply.send(result);
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Get leaderboard
  fastify.get<{ Querystring: { type?: 'points' | 'claims' | 'distance' | 'level'; limit?: string } }>(
    '/leaderboard',
    {
      preHandler: [authenticate],
      schema: {
        querystring: z.object({
          type: z.enum(['points', 'claims', 'distance', 'level']).default('points'),
          limit: z.coerce.number().min(1).max(100).default(50)
        })
      }
    }, async (request, reply) => {
    try {
      const result = await GameService.getLeaderboard(request.query.type, parseInt(request.query.limit || '50', 10));
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get map data for Unity
  fastify.get<{ Querystring: { north: string; south: string; east: string; west: string } }>(
    '/map/data',
    {
      preHandler: [authenticate],
      schema: {
        querystring: z.object({
          north: z.coerce.number(),
          south: z.coerce.number(),
          east: z.coerce.number(),
          west: z.coerce.number()
        })
      }
    }, async (request, reply) => {
    try {
      const result = await GameService.getMapData(request.query, request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Use power-up
  fastify.post<{ Body: PowerUpUsageData }>(
    '/power-ups/use',
    {
      preHandler: [authenticate],
      schema: {
        body: PowerUpUsageSchema
      }
    }, async (request, reply) => {
    try {
      const result = await GameService.usePowerUp(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Get daily challenges
  fastify.get('/challenges/daily', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await GameService.getDailyChallenges(request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Complete challenge
  fastify.post<{ Body: { challengeId: string } }>(
    '/challenges/complete',
    {
      preHandler: [authenticate],
      schema: {
        body: z.object({
          challengeId: z.string()
        })
      }
    }, async (request, reply) => {
    try {
      const result = await GameService.completeChallenge(request.user.sub, request.body.challengeId);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Get inventory
  fastify.get('/inventory', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await GameService.getInventory(request.user.sub);
      reply.send(result);
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Capture prize attempt - CRITICAL ENDPOINT FOR GAME FLOW
  fastify.post<{ Body: z.infer<typeof CaptureAttemptSchema> }>(
    '/capture/attempt',
    {
      preHandler: [authenticate],
      schema: { body: CaptureAttemptSchema }
    },
    async (request, reply) => {
      try {
        const result = await CaptureService.attemptCapture(
          request.user.sub,
          request.body
        );
        reply.send({ success: true, data: result });
      } catch (error) {
        reply.code(400).send({ 
          success: false, 
          error: (error as any).message 
        });
      }
    }
  );

  // Validate capture location - for pre-validation checks
  fastify.post<{ Body: z.infer<typeof CaptureValidationSchema> }>(
    '/capture/validate',
    {
      preHandler: [authenticate],
      schema: { body: CaptureValidationSchema }
    },
    async (request, reply) => {
      try {
        const result = await CaptureService.preValidateCapture(
          request.user.sub,
          request.body
        );
        reply.send({ success: true, data: result });
      } catch (error) {
        reply.code(400).send({ 
          success: false, 
          error: (error as any).message 
        });
      }
    }
  );

  // Unity client performance metrics endpoint
  const UnityMetricsSchema = z.object({
    sessionId: z.string(),
    metrics: z.object({
      frameRate: z.number().min(0).max(144),
      networkLatency: z.number().min(0),
      batteryUsage: z.number().min(0).max(100),
      memoryUsage: z.number().min(0).optional(),
      cpuUsage: z.number().min(0).max(100).optional(),
      crashes: z.number().min(0).default(0),
      loadTime: z.number().min(0).optional(),
      arSessionStability: z.number().min(0).max(100).optional()
    })
  });

  fastify.post<{ Body: z.infer<typeof UnityMetricsSchema> }>(
    '/metrics/report',
    {
      preHandler: [authenticate],
      schema: { body: UnityMetricsSchema }
    },
    async (request, reply) => {
      try {
        const { sessionId, metrics } = request.body;
        const userId = request.user.sub;

        // Get session to calculate derived metrics
        const sessionKey = `session:${sessionId}`;
        const sessionData = await redisClient.get(sessionKey);
        
        let sessionDuration = 0;
        let distanceTraveled = 0;
        let prizesFound = 0;
        let prizesClaimed = 0;

        if (sessionData) {
          const session = JSON.parse(sessionData);
          if (session.userId === userId) {
            const startTime = new Date(session.startTime);
            sessionDuration = Math.floor((Date.now() - startTime.getTime()) / 1000);
            distanceTraveled = session.distanceTraveled || 0;
            prizesFound = session.prizesFound || 0;
            prizesClaimed = session.claimsAttempted || 0;
          }
        }

        // Record Unity game metrics
        const gameMetrics: GameMetrics = {
          sessionDuration,
          prizesFound,
          prizesClaimed,
          distanceTraveled,
          averageSpeed: sessionDuration > 0 ? distanceTraveled / sessionDuration : 0,
          batteryUsage: metrics.batteryUsage,
          networkLatency: metrics.networkLatency,
          frameRate: metrics.frameRate,
          crashes: metrics.crashes
        };

        await MetricsService.recordGameMetrics(userId, sessionId, gameMetrics);

        // Record additional Unity-specific metrics
        if (metrics.memoryUsage !== undefined) {
          await MetricsService.recordMetric({
            name: 'unity.memory.usage',
            value: metrics.memoryUsage,
            userId,
            sessionId,
            tags: { platform: 'unity', unit: 'mb' }
          });
        }

        if (metrics.cpuUsage !== undefined) {
          await MetricsService.recordMetric({
            name: 'unity.cpu.usage',
            value: metrics.cpuUsage,
            userId,
            sessionId,
            tags: { platform: 'unity', unit: 'percent' }
          });
        }

        if (metrics.arSessionStability !== undefined) {
          await MetricsService.recordMetric({
            name: 'unity.ar.stability',
            value: metrics.arSessionStability,
            userId,
            sessionId,
            tags: { platform: 'unity', unit: 'percent' }
          });
        }

        if (metrics.loadTime !== undefined) {
          await MetricsService.recordMetric({
            name: 'unity.load.time',
            value: metrics.loadTime,
            userId,
            sessionId,
            tags: { platform: 'unity', unit: 'ms' }
          });
        }

        typedLogger.info('Unity metrics received', { userId, sessionId, frameRate: metrics.frameRate });

        reply.send({ success: true, message: 'Metrics recorded' });
      } catch (error) {
        typedLogger.error('Record Unity metrics error', { error: (error as any).message });
        reply.code(400).send({ success: false, error: (error as any).message });
      }
    }
  );

  // Get real-time metrics for admin/monitoring
  fastify.get('/metrics/realtime', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const metrics = await MetricsService.getRealTimeMetrics();
      reply.send({ success: true, data: metrics });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get Unity performance report for admin
  fastify.get<{ Querystring: { start?: string; end?: string } }>(
    '/metrics/unity-performance',
    {
      preHandler: [authenticate],
      schema: {
        querystring: z.object({
          start: z.string().datetime().optional(),
          end: z.string().datetime().optional()
        })
      }
    },
    async (request, reply) => {
      try {
        const now = new Date();
        const start = request.query.start ? new Date(request.query.start) : new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const end = request.query.end ? new Date(request.query.end) : now;

        const metrics = await MetricsService.getUnityPerformanceMetrics({ start, end });
        reply.send({ success: true, data: metrics });
      } catch (error) {
        reply.code(500).send({ success: false, error: (error as any).message });
      }
    }
  );
}
