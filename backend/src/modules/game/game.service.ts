import { User } from '@/models/User';
import { Prize } from '@/models/Prize';
import { Claim } from '@/models/Claim';
import { Partner } from '@/models/Partner';
import { Platform } from '@/types';
import { typedLogger } from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';
import { configService } from '@/services/config';
import { calculateGeodesicDistance as calculateDistance } from '@/utils/geo';
import { validateAntiCheat as detectCheating } from '@/utils/anti-cheat';
import { MetricsService, GameMetrics } from '@/services/metrics';
import {
    GameSessionData,
    LocationUpdateData,
    PowerUpUsageData,
    IGameSession,
    DailyChallenge
} from './game.types';

// ─── GameService ─────────────────────────────────────────────────────────────
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
                sessionData.platform as Platform,
                undefined,
                {
                    model: sessionData.deviceModel,
                    osVersion: sessionData.osVersion,
                    appVersion: sessionData.appVersion || sessionData.version,
                    userAgent: context?.userAgent,
                }
            );
            if (context?.ip && user.lastIp !== undefined) user.lastIp = context.ip;
            if (context?.userAgent && user.lastUserAgent !== undefined) user.lastUserAgent = context.userAgent;
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
                status: 'active'
            };

            await this.redis.setex(`session:${sessionId}`, 3600, JSON.stringify(session));

            // Update user last active
            await User.findByIdAndUpdate(userId, {
                $set: { lastActive: new Date() },
                $inc: { 'stats.totalSessions': 1 }
            });

            typedLogger.info('Game session started', { userId, sessionId, location: sessionData.location });

            return {
                sessionId,
                startTime: session.startTime,
                userLevel: user.level,
                userPoints: user.points,
                dailyChallenges: await this.getDailyChallenges(userId)
            };
        } catch (error) {
            typedLogger.error('Start game session error', { error: error instanceof Error ? error.message : 'Unknown error', userId });
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
                    'stats.totalDistance': session.distanceTraveled || 0
                }
            });

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
                prizesFound: session.prizesFound
            });

            return {
                sessionId,
                duration,
                distanceTraveled: session.distanceTraveled,
                prizesFound: session.prizesFound,
                claimsAttempted: session.claimsAttempted,
                powerUpsUsed: session.powerUpsUsed,
                rewards: sessionRewards
            };
        } catch (error) {
            typedLogger.error('End game session error', { error: error instanceof Error ? error.message : 'Unknown error', userId, sessionId });
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

            if (!cheatDetection.allowed) {
                typedLogger.warn('Cheating detected', {
                    userId,
                    sessionId: locationData.sessionId,
                    reason: JSON.stringify(cheatDetection.details)
                });
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
                if (context?.ip && user.lastIp !== undefined) user.lastIp = context.ip;
                if (context?.userAgent && user.lastUserAgent !== undefined) user.lastUserAgent = context.userAgent;
                if (locationData.device) {
                    user.addDevice(
                        session.deviceId,
                        session.platform as Platform,
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
                cheatWarning: !cheatDetection.allowed ? JSON.stringify(cheatDetection.details) : null
            };
        } catch (error) {
            typedLogger.error('Update location error', { error: error instanceof Error ? error.message : 'Unknown error', userId });
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
                    sortField = 'points.total';
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
                points: user.points?.total || (user as any).points || 0,
                availablePoints: user.points?.available || 0,
                totalClaims: user.stats.totalClaims || 0,
                totalDistance: user.stats.totalDistance || 0,
                avatar: user.avatar
            }));
        } catch (error) {
            typedLogger.error('Get leaderboard error', { error: error instanceof Error ? error.message : 'Unknown error', type });
            throw error;
        }
    }

    /**
     * Get map data optimized for Unity
     */
    static async getMapData(bounds: { north: number; south: number; east: number; west: number }, userId: string) {
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
                        lng: prize.location.coordinates[0]
                    },
                    expiresAt: prize.expiresAt
                })),
                partners: partners.map(partner => ({
                    id: partner._id,
                    name: partner.name,
                    category: partner.categories?.[0] || 'General',
                    logo: partner.logo,
                    locations: partner.locations
                        ?.filter((loc) => loc.isActive && loc.coordinates?.length === 2)
                        .map((loc) => ({
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
                        partner.locations
                            ?.filter((loc) => loc.isActive && loc.coordinates?.length === 2)
                            .map((loc) => ({
                                id: loc._id,
                                type: 'partner' as const,
                                title: partner.name,
                                position: { lat: loc.coordinates[1], lng: loc.coordinates[0] },
                                category: partner.categories?.[0] || 'General',
                            })) || []
                    ),
                ],
                bounds: { north, south, east, west },
                timestamp: new Date().toISOString()
            };

            return mapData;
        } catch (error) {
            typedLogger.error('Get map data error', { error: error instanceof Error ? error.message : 'Unknown error', bounds, userId });
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
                        expiresAt: new Date(Date.now() + 600000)
                    };
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
                        expiresAt: new Date(Date.now() + 1800000)
                    };
                    break;
                default:
                    throw new Error('UNKNOWN_POWER_UP');
            }

            // Apply power-up effect
            await User.updateOne(
                { _id: userId, 'inventory.powerUps.id': powerUpData.powerUpId },
                {
                    $inc: { 'inventory.powerUps.$.quantity': -1 },
                    $push: { activeEffects: effect }
                }
            );

            typedLogger.info('Power-up used', { userId, powerUpId: powerUpData.powerUpId, location: powerUpData.location });

            return {
                success: true,
                effect,
                remainingQuantity: powerUp.quantity - 1
            };
        } catch (error) {
            typedLogger.error('Use power-up error', { error: error instanceof Error ? error.message : 'Unknown error', userId, powerUpData });
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
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const cachedChallenges = await this.redis.get(challengeKey);
            if (!cachedChallenges) {
                // Generate new daily challenges (now reads from Settings)
                const newChallenges = await this.generateDailyChallenges(userId);
                await this.redis.setex(challengeKey, 86400, JSON.stringify(newChallenges)); // 24 hours
                return newChallenges;
            } else {
                return JSON.parse(cachedChallenges);
            }
        } catch (error) {
            typedLogger.error('Get daily challenges error', { error: error instanceof Error ? error.message : 'Unknown error', userId });
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

            const allChallenges = JSON.parse(challengesData) as DailyChallenge[];
            const challenge = allChallenges.find((c) => c.id === challengeId);

            if (!challenge) throw new Error('CHALLENGE_NOT_FOUND');
            if (challenge.completed) throw new Error('CHALLENGE_ALREADY_COMPLETED');

            // Mark as completed
            challenge.completed = true;
            challenge.completedAt = new Date().toISOString();

            // Award rewards
            await User.findByIdAndUpdate(userId, {
                $inc: { points: challenge.reward }
            });

            // Update challenges in Redis
            await this.redis.setex(challengeKey, 86400, JSON.stringify(allChallenges));

            typedLogger.info('Challenge completed', { userId, challengeId, reward: challenge.reward });

            return {
                success: true,
                challenge,
                pointsAwarded: challenge.reward
            };
        } catch (error) {
            typedLogger.error('Complete challenge error', { error: error instanceof Error ? error.message : 'Unknown error', userId, challengeId });
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
                activeEffects: user.activeEffects || []
            };
        } catch (error) {
            typedLogger.error('Get inventory error', { error: error instanceof Error ? error.message : 'Unknown error', userId });
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
            }).limit(20); // Increase limit slightly to account for filtering

            // Filter out claimed prizes
            const userClaims = await Claim.find({ userId }).select('prizeId');
            const claimedPrizeIds = userClaims.map(claim => claim.prizeId.toString());

            const availablePrizes = nearbyPrizes.filter(prize =>
                !claimedPrizeIds.includes(prize._id.toString())
            );

            return availablePrizes.map(prize => ({
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
                )
            }));
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
                )
            }));
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
            typedLogger.error('Error generating daily challenges', { error: error instanceof Error ? error.message : 'Unknown error', userId });
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

    private static calculateSessionRewards(session: IGameSession) {
        const rewards = {
            basePoints: 0,
            distanceBonus: 0,
            timeBonus: 0,
            discoveryBonus: 0,
            total: 0
        };

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
