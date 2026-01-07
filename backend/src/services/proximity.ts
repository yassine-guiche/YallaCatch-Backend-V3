import { redisClient } from '@/config/redis';
import { Prize } from '@/models/Prize';
import { User } from '@/models/User';
import { Claim } from '@/models/Claim';
import { typedLogger } from '@/lib/typed-logger';

/**
 * Proximity Detection Service
 * Core Feature 2: Unity proximity system (50m/20m/5m detection circles)
 * Optimized for real-time AR gameplay with progressive hint system
 */

export interface ProximityZone {
  distance: number;
  zone: 'hint' | 'visible' | 'catchable';
  features: string[];
}

export interface ProximityResult {
  userId: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  zones: {
    hint: ProximityPrize[];      // 50m zone
    visible: ProximityPrize[];   // 20m zone  
    catchable: ProximityPrize[]; // 5m zone
  };
  metadata: {
    totalNearby: number;
    searchRadius: number;
    timestamp: string;
    performanceMs: number;
  };
}

export interface ProximityPrize {
  id: string;
  title: string;
  category: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  points: number;
  distance: number;
  bearing: number; // degrees from north
  zone: 'hint' | 'visible' | 'catchable';
  hint?: string;
  animation: string;
  canCatch: boolean;
  estimatedValue: number;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface HintConfig {
  distance: number;
  hintType: 'direction' | 'proximity' | 'category' | 'value';
  message: string;
  intensity: number; // 0-100
}

export class ProximityService {
  private static redis = redisClient;
  
  // Proximity zones configuration
  private static readonly ZONES = {
    HINT: 50,      // 50m - Show hints only
    VISIBLE: 20,   // 20m - Show prize in AR
    CATCHABLE: 5,  // 5m - Enable catch button
  };

  /**
   * Get all prizes within proximity zones for Unity client
   */
  static async getProximityPrizes(
    userId: string, 
    location: { latitude: number; longitude: number; accuracy?: number },
    options: { maxRadius?: number; includeHints?: boolean } = {}
  ): Promise<ProximityResult> {
    const startTime = Date.now();
    
    try {
      const { maxRadius = this.ZONES.HINT, includeHints = true } = options;
      
      // Validate user and location
      await this.validateUserAndLocation(userId, location);
      
      // Get nearby prizes using geospatial query
      const nearbyPrizes = await this.getNearbyPrizes(location, maxRadius);
      
      // Filter out already claimed prizes
      const availablePrizes = await this.filterClaimedPrizes(userId, nearbyPrizes);
      
      // Categorize prizes by proximity zones
      const zones = this.categorizeByZones(location, availablePrizes, includeHints);
      
      // Generate hints for hint zone prizes
      if (includeHints && zones.hint.length > 0) {
        zones.hint = await this.generateHints(zones.hint, location);
      }
      
      // Cache result for performance
      await this.cacheProximityResult(userId, location, zones);
      
      const performanceMs = Date.now() - startTime;
      
      typedLogger.debug('Proximity detection completed', {
        userId,
        location,
        totalFound: availablePrizes.length,
        zones: {
          hint: zones.hint.length,
          visible: zones.visible.length,
          catchable: zones.catchable.length,
        },
        performanceMs,
      });
      
      return {
        userId,
        location,
        zones,
        metadata: {
          totalNearby: availablePrizes.length,
          searchRadius: maxRadius,
          timestamp: new Date().toISOString(),
          performanceMs,
        },
      };
    } catch (error) {
      typedLogger.error('Get proximity prizes error', { error: (error as any).message, userId, location });
      throw error;
    }
  }

  /**
   * Get dynamic hints for prizes in hint zone (50m)
   */
  static async getDynamicHints(
    userId: string,
    prizeId: string,
    userLocation: { latitude: number; longitude: number }
  ): Promise<HintConfig[]> {
    try {
      const prize = await Prize.findById(prizeId);
      if (!prize || prize.status !== 'active') {
        throw new Error('PRIZE_NOT_AVAILABLE');
      }

      const distance = this.calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        prize.location.coordinates[1],
        prize.location.coordinates[0]
      );

      const hints: HintConfig[] = [];

      // Distance-based hints
      if (distance > 30) {
        hints.push({
          distance,
          hintType: 'direction',
          message: this.generateDirectionHint(userLocation, prize.location.coordinates),
          intensity: 30,
        });
      } else if (distance > 15) {
        hints.push({
          distance,
          hintType: 'proximity',
          message: `You're getting warmer! ${Math.round(distance)}m away`,
          intensity: 60,
        });
      } else {
        hints.push({
          distance,
          hintType: 'proximity',
          message: `Very close! Look around carefully`,
          intensity: 90,
        });
      }

      // Category hints
      if (distance < 40) {
        hints.push({
          distance,
          hintType: 'category',
          message: this.generateCategoryHint(prize.category),
          intensity: 50,
        });
      }

      // Value hints for rare prizes
      if (prize.rarity !== 'common' && distance < 25) {
        hints.push({
          distance,
          hintType: 'value',
          message: this.generateValueHint(prize.rarity, prize.points),
          intensity: 70,
        });
      }

      return hints;
    } catch (error) {
      typedLogger.error('Get dynamic hints error', { error: (error as any).message, userId, prizeId });
      return [];
    }
  }

  /**
   * Validate if user can catch a prize (distance and anti-cheat)
   */
  static async validateCatchAttempt(
    userId: string,
    prizeId: string,
    userLocation: { latitude: number; longitude: number; accuracy?: number },
    deviceInfo?: any
  ): Promise<{ canCatch: boolean; reason?: string; distance?: number }> {
    try {
      const prize = await Prize.findById(prizeId);
      if (!prize || prize.status !== 'active') {
        return { canCatch: false, reason: 'PRIZE_NOT_AVAILABLE' };
      }

      // Check if already claimed
      const existingClaim = await Claim.findOne({ userId, prizeId });
      if (existingClaim) {
        return { canCatch: false, reason: 'ALREADY_CLAIMED' };
      }

      // Calculate distance
      const distance = this.calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        prize.location.coordinates[1],
        prize.location.coordinates[0]
      );

      // Check if within catchable zone
      if (distance > this.ZONES.CATCHABLE) {
        return { 
          canCatch: false, 
          reason: 'TOO_FAR', 
          distance: Math.round(distance * 100) / 100 
        };
      }

      // Anti-cheat validation
      const antiCheatResult = await this.performAntiCheatValidation(
        userId,
        userLocation,
        prize.location.coordinates,
        deviceInfo
      );

      if (!antiCheatResult.valid) {
        return { 
          canCatch: false, 
          reason: antiCheatResult.reason,
          distance: Math.round(distance * 100) / 100 
        };
      }

      // Check prize availability (max claims, etc.)
      if (prize.quantity && prize.claimedCount >= prize.quantity) {
        return { canCatch: false, reason: 'MAX_CLAIMS_REACHED' };
      }

      return { 
        canCatch: true, 
        distance: Math.round(distance * 100) / 100 
      };
    } catch (error) {
      typedLogger.error('Validate catch attempt error', { error: (error as any).message, userId, prizeId });
      return { canCatch: false, reason: 'VALIDATION_ERROR' };
    }
  }

  /**
   * Update user location and get real-time proximity updates
   */
  static async updateLocationAndGetProximity(
    userId: string,
    location: { latitude: number; longitude: number; accuracy?: number; timestamp?: string }
  ): Promise<ProximityResult> {
    try {
      // Store location update
      await this.storeLocationUpdate(userId, location);
      
      // Get proximity results
      const proximityResult = await this.getProximityPrizes(userId, location);
      
      // Check for zone transitions (e.g., prize moved from hint to visible zone)
      const transitions = await this.detectZoneTransitions(userId, proximityResult);
      
      if (transitions.length > 0) {
        // Trigger real-time events for Unity client
        await this.triggerZoneTransitionEvents(userId, transitions);
      }
      
      return proximityResult;
    } catch (error) {
      typedLogger.error('Update location and get proximity error', { error: (error as any).message, userId, location });
      throw error;
    }
  }

  /**
   * Get optimized proximity data for Unity (reduced payload)
   */
  static async getUnityOptimizedProximity(
    userId: string,
    location: { latitude: number; longitude: number },
    lastUpdateTimestamp?: string
  ): Promise<any> {
    try {
      const fullResult = await this.getProximityPrizes(userId, location);
      
      // Optimize for Unity by reducing data size
      const optimized = {
        zones: {
          hint: fullResult.zones.hint.map(p => ({
            id: p.id,
            d: Math.round(p.distance),
            b: Math.round(p.bearing),
            h: p.hint,
            r: p.rarity[0], // First letter only
          })),
          visible: fullResult.zones.visible.map(p => ({
            id: p.id,
            t: p.title,
            c: p.category[0], // First letter only
            p: p.points,
            d: Math.round(p.distance),
            b: Math.round(p.bearing),
            a: p.animation,
            coords: p.coordinates,
          })),
          catchable: fullResult.zones.catchable.map(p => ({
            id: p.id,
            t: p.title,
            p: p.points,
            d: Math.round(p.distance),
            a: p.animation,
            coords: p.coordinates,
          })),
        },
        meta: {
          total: fullResult.metadata.totalNearby,
          ts: fullResult.metadata.timestamp,
          perf: fullResult.metadata.performanceMs,
        },
      };
      
      return optimized;
    } catch (error) {
      typedLogger.error('Get Unity optimized proximity error', { error: (error as any).message, userId, location });
      throw error;
    }
  }

  // Private helper methods
  private static async validateUserAndLocation(
    userId: string,
    location: { latitude: number; longitude: number; accuracy?: number }
  ): Promise<void> {
    const user = await User.findById(userId);
    if (!user || user.isBanned) {
      throw new Error('USER_NOT_VALID');
    }

    if (!location.latitude || !location.longitude) {
      throw new Error('INVALID_LOCATION');
    }

    if (Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) {
      throw new Error('INVALID_COORDINATES');
    }

    // Check location accuracy if provided
    if (location.accuracy && location.accuracy > 100) {
      typedLogger.warn('Low GPS accuracy detected', { userId, accuracy: location.accuracy });
    }
  }

  private static async getNearbyPrizes(
    location: { latitude: number; longitude: number },
    radiusMeters: number
  ): Promise<any[]> {
    try {
      // Use MongoDB geospatial query for efficient proximity search
      const radiusInRadians = radiusMeters / 6378100; // Earth radius in meters
      
      const prizes = await Prize.find({
        status: 'active',
        expiresAt: { $gt: new Date() },
        'location.coordinates': {
          $geoWithin: {
            $centerSphere: [
              [location.longitude, location.latitude],
              radiusInRadians
            ]
          }
        }
      })
      .select('title category rarity points location distribution content metadata')
      .lean();

      return prizes;
    } catch (error) {
      typedLogger.error('Get nearby prizes error', { error: (error as any).message, location, radiusMeters });
      return [];
    }
  }

  private static async filterClaimedPrizes(userId: string, prizes: any[]): Promise<any[]> {
    try {
      if (prizes.length === 0) return [];

      const prizeIds = prizes.map(p => p._id);
      const claims = await Claim.find({ 
        userId, 
        prizeId: { $in: prizeIds } 
      }).select('prizeId').lean();

      const claimedIds = new Set(claims.map(c => c.prizeId.toString()));
      
      return prizes.filter(p => !claimedIds.has(p._id.toString()));
    } catch (error) {
      typedLogger.error('Filter claimed prizes error', { error: (error as any).message, userId });
      return prizes;
    }
  }

  private static categorizeByZones(
    userLocation: { latitude: number; longitude: number },
    prizes: any[],
    includeHints: boolean
  ): { hint: ProximityPrize[]; visible: ProximityPrize[]; catchable: ProximityPrize[] } {
    const zones = {
      hint: [] as ProximityPrize[],
      visible: [] as ProximityPrize[],
      catchable: [] as ProximityPrize[],
    };

    for (const prize of prizes) {
      const distance = this.calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        prize.location.coordinates[1],
        prize.location.coordinates[0]
      );

      const bearing = this.calculateBearing(
        userLocation.latitude,
        userLocation.longitude,
        prize.location.coordinates[1],
        prize.location.coordinates[0]
      );

      const proximityPrize: ProximityPrize = {
        id: prize._id.toString(),
        title: prize.title,
        category: prize.category,
        rarity: prize.rarity,
        points: prize.points,
        distance: Math.round(distance * 100) / 100,
        bearing: Math.round(bearing),
        zone: distance <= this.ZONES.CATCHABLE ? 'catchable' : 
              distance <= this.ZONES.VISIBLE ? 'visible' : 'hint',
        animation: prize.content?.animation || 'standard',
        canCatch: distance <= this.ZONES.CATCHABLE,
        estimatedValue: this.calculateEstimatedValue(prize),
      };

      // Add coordinates for visible and catchable zones
      if (distance <= this.ZONES.VISIBLE) {
        proximityPrize.coordinates = {
          latitude: prize.location.coordinates[1],
          longitude: prize.location.coordinates[0],
        };
      }

      // Categorize into appropriate zone
      if (distance <= this.ZONES.CATCHABLE) {
        zones.catchable.push(proximityPrize);
      } else if (distance <= this.ZONES.VISIBLE) {
        zones.visible.push(proximityPrize);
      } else if (distance <= this.ZONES.HINT && includeHints) {
        zones.hint.push(proximityPrize);
      }
    }

    // Sort by distance within each zone
    zones.hint.sort((a, b) => a.distance - b.distance);
    zones.visible.sort((a, b) => a.distance - b.distance);
    zones.catchable.sort((a, b) => a.distance - b.distance);

    return zones;
  }

  private static async generateHints(
    hintPrizes: ProximityPrize[],
    userLocation: { latitude: number; longitude: number }
  ): Promise<ProximityPrize[]> {
    return hintPrizes.map(prize => ({
      ...prize,
      hint: this.generateHintMessage(prize, userLocation),
    }));
  }

  private static generateHintMessage(
    prize: ProximityPrize,
    userLocation: { latitude: number; longitude: number }
  ): string {
    const distance = prize.distance;
    const direction = this.getCardinalDirection(prize.bearing);
    
    if (distance > 40) {
      return `Something ${this.getRarityHint(prize.rarity)} is ${direction}`;
    } else if (distance > 25) {
      return `A ${prize.category} treasure awaits ${direction}`;
    } else {
      return `You're close to something ${this.getValueHint(prize.points)}!`;
    }
  }

  private static generateDirectionHint(
    userLocation: { latitude: number; longitude: number },
    prizeCoordinates: [number, number]
  ): string {
    const bearing = this.calculateBearing(
      userLocation.latitude,
      userLocation.longitude,
      prizeCoordinates[1],
      prizeCoordinates[0]
    );
    
    const direction = this.getCardinalDirection(bearing);
    return `Look ${direction}`;
  }

  private static generateCategoryHint(category: string): string {
    const hints = {
      food: "Something delicious is nearby",
      shopping: "A great deal awaits",
      entertainment: "Fun is just around the corner",
      transport: "Your journey can be rewarded",
      special: "Something extraordinary is here",
    };
    
    return hints[category] || "A treasure is hidden nearby";
  }

  private static generateValueHint(rarity: string, points: number): string {
    if (rarity === 'legendary') {
      return "An incredible treasure awaits!";
    } else if (rarity === 'epic') {
      return "Something very valuable is close!";
    } else if (points > 500) {
      return "A high-value prize is nearby!";
    } else {
      return "A nice reward is waiting!";
    }
  }

  private static getRarityHint(rarity: string): string {
    const hints = {
      common: "interesting",
      uncommon: "notable",
      rare: "valuable",
      epic: "extraordinary",
      legendary: "legendary",
    };
    
    return hints[rarity] || "mysterious";
  }

  private static getValueHint(points: number): string {
    if (points > 1000) return "very valuable";
    if (points > 500) return "valuable";
    if (points > 100) return "worthwhile";
    return "interesting";
  }

  private static getCardinalDirection(bearing: number): string {
    const directions = [
      "north", "northeast", "east", "southeast",
      "south", "southwest", "west", "northwest"
    ];
    
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }

  private static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private static calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
    
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  private static calculateEstimatedValue(prize: any): number {
    let value = prize.points;
    
    // Rarity multiplier
    const rarityMultipliers = {
      common: 1,
      uncommon: 1.2,
      rare: 1.5,
      epic: 2,
      legendary: 3,
    };
    
    value *= rarityMultipliers[prize.rarity] || 1;
    
    // Bonus multiplier
    if (prize.content?.bonusMultiplier) {
      value *= prize.content.bonusMultiplier;
    }
    
    return Math.round(value);
  }

  private static async performAntiCheatValidation(
    userId: string,
    userLocation: { latitude: number; longitude: number },
    prizeCoordinates: [number, number],
    deviceInfo?: any
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Check for GPS spoofing indicators
      if (deviceInfo?.accuracy && deviceInfo.accuracy < 1) {
        typedLogger.warn('Suspicious GPS accuracy detected', { userId, accuracy: deviceInfo.accuracy });
        return { valid: false, reason: 'SUSPICIOUS_GPS_ACCURACY' };
      }

      // Check movement speed (basic anti-teleportation)
      const lastLocationKey = `last_location:${userId}`;
      const lastLocationData = await this.redis.get(lastLocationKey);
      
      if (lastLocationData) {
        const lastLocation = JSON.parse(lastLocationData);
        const timeDiff = Date.now() - lastLocation.timestamp;
        const distance = this.calculateDistance(
          lastLocation.latitude,
          lastLocation.longitude,
          userLocation.latitude,
          userLocation.longitude
        );
        
        // Check if movement speed is humanly possible (max 100 km/h)
        const maxSpeed = 100 * 1000 / 3600; // m/s
        const actualSpeed = distance / (timeDiff / 1000);
        
        if (actualSpeed > maxSpeed && timeDiff > 5000) { // Allow 5 seconds grace period
          typedLogger.warn('Suspicious movement speed detected', {
            userId,
            distance,
            timeDiff,
            actualSpeed,
            maxSpeed,
          });
          return { valid: false, reason: 'SUSPICIOUS_MOVEMENT_SPEED' };
        }
      }

      // Store current location for next validation
      await this.redis.setex(
        `last_location:${userId}`,
        300, // 5 minutes
        JSON.stringify({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          timestamp: Date.now(),
        })
      );

      return { valid: true };
    } catch (error) {
      typedLogger.error('Anti-cheat validation error', { error: (error as any).message, userId });
      return { valid: true }; // Fail open to avoid blocking legitimate users
    }
  }

  private static async storeLocationUpdate(
    userId: string,
    location: { latitude: number; longitude: number; accuracy?: number; timestamp?: string }
  ): Promise<void> {
    try {
      const locationData = {
        ...location,
        timestamp: location.timestamp || new Date().toISOString(),
        serverTimestamp: Date.now(),
      };

      await this.redis.setex(
        `user_location:${userId}`,
        300, // 5 minutes
        JSON.stringify(locationData)
      );
    } catch (error) {
      typedLogger.error('Store location update error', { error: (error as any).message, userId });
    }
  }

  private static async cacheProximityResult(
    userId: string,
    location: { latitude: number; longitude: number },
    zones: any
  ): Promise<void> {
    try {
      const cacheKey = `proximity_result:${userId}`;
      const cacheData = {
        location,
        zones,
        timestamp: Date.now(),
      };

      await this.redis.setex(cacheKey, 30, JSON.stringify(cacheData)); // 30 seconds cache
    } catch (error) {
      typedLogger.error('Cache proximity result error', { error: (error as any).message, userId });
    }
  }

  private static async detectZoneTransitions(userId: string, currentResult: ProximityResult): Promise<any[]> {
    try {
      const lastResultKey = `proximity_result:${userId}`;
      const lastResultData = await this.redis.get(lastResultKey);
      
      if (!lastResultData) return [];
      
      const lastResult = JSON.parse(lastResultData);
      const transitions = [];
      
      // Compare current and last results to detect zone transitions
      // This would implement logic to detect when prizes move between zones
      
      return transitions;
    } catch (error) {
      typedLogger.error('Detect zone transitions error', { error: (error as any).message, userId });
      return [];
    }
  }

  private static async triggerZoneTransitionEvents(userId: string, transitions: any[]): Promise<void> {
    try {
      // This would trigger WebSocket events to Unity client
      // Implementation depends on WebSocket setup
      typedLogger.info('Zone transitions detected', { userId, transitions: transitions.length });
    } catch (error) {
      typedLogger.error('Trigger zone transition events error', { error: (error as any).message, userId });
    }
  }
}

export default ProximityService;
