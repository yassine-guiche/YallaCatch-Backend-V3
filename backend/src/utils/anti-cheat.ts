import { RedisCache, RedisRateLimit, redisClient } from '@/config/redis';
import { config, GAME_CONSTANTS } from '@/config';
import { logger, logSecurity } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';
import { calculateGeodesicDistance, calculateSpeed, msToKmh } from './geo';
import { Coordinates } from '@/types';

// Anti-cheat configuration
const ANTI_CHEAT_CONFIG = {
  MAX_SPEED_MS: GAME_CONSTANTS.MAX_SPEED_MS,
  GLOBAL_COOLDOWN_MS: GAME_CONSTANTS.COOLDOWN_MS,
  CITY_COOLDOWN_MS: 30 * 1000, // 30 seconds between claims in same city
  MAX_CLAIMS_PER_HOUR: 20,
  MAX_CLAIMS_PER_DAY: GAME_CONSTANTS.MAX_DAILY_CLAIMS,
  SUSPICIOUS_SPEED_THRESHOLD: 50, // m/s (180 km/h)
  TELEPORT_THRESHOLD: 1000, // meters
  MIN_TIME_BETWEEN_LOCATIONS: 5, // seconds
  MAX_LOCATION_ACCURACY: 100, // meters
} as const;

// Device signals interface
export interface DeviceSignals {
  speed?: number;
  mockLocation?: boolean;
  attestationToken?: string;
  accuracy?: number;
  provider?: string;
  timestamp?: Date;
}

// Location history entry
interface LocationEntry {
  lat: number;
  lng: number;
  timestamp: Date;
  accuracy?: number;
}

// Anti-cheat violation types
export enum ViolationType {
  SPEED_VIOLATION = 'speed_violation',
  MOCK_LOCATION = 'mock_location',
  TELEPORTATION = 'teleportation',
  RAPID_CLAIMS = 'rapid_claims',
  COOLDOWN_VIOLATION = 'cooldown_violation',
  DAILY_LIMIT_EXCEEDED = 'daily_limit_exceeded',
  SUSPICIOUS_PATTERN = 'suspicious_pattern',
  INVALID_ATTESTATION = 'invalid_attestation',
  POOR_ACCURACY = 'poor_accuracy',
}

// Anti-cheat result
export interface AntiCheatResult {
  allowed: boolean;
  violations: ViolationType[];
  riskScore: number;
  details: Record<string, any>;
}

/**
 * Comprehensive anti-cheat validation
 */
export async function validateAntiCheat(
  userId: string,
  location: Coordinates,
  deviceSignals?: DeviceSignals
): Promise<AntiCheatResult> {
  const violations: ViolationType[] = [];
  const details: Record<string, any> = {};
  let riskScore = 0;

  try {
    // 1. Speed validation
    const speedResult = await validateSpeed(userId, location, deviceSignals);
    if (!speedResult.valid) {
      violations.push(ViolationType.SPEED_VIOLATION);
      riskScore += speedResult.riskScore;
      details.speed = speedResult.details;
    }

    // 2. Mock location detection
    const mockResult = await validateMockLocation(deviceSignals);
    if (!mockResult.valid) {
      violations.push(ViolationType.MOCK_LOCATION);
      riskScore += mockResult.riskScore;
      details.mockLocation = mockResult.details;
    }

    // 3. Teleportation detection
    const teleportResult = await validateTeleportation(userId, location);
    if (!teleportResult.valid) {
      violations.push(ViolationType.TELEPORTATION);
      riskScore += teleportResult.riskScore;
      details.teleportation = teleportResult.details;
    }

    // 4. Rapid claims detection
    const rapidResult = await validateRapidClaims(userId);
    if (!rapidResult.valid) {
      violations.push(ViolationType.RAPID_CLAIMS);
      riskScore += rapidResult.riskScore;
      details.rapidClaims = rapidResult.details;
    }

    // 4b. Daily limit enforcement
    const dailyLimitResult = await validateDailyLimit(userId);
    if (!dailyLimitResult.valid) {
      violations.push(ViolationType.DAILY_LIMIT_EXCEEDED);
      riskScore += dailyLimitResult.riskScore;
      details.dailyLimit = dailyLimitResult.details;
    }

    // 5. Location accuracy validation
    const accuracyResult = await validateLocationAccuracy(deviceSignals);
    if (!accuracyResult.valid) {
      violations.push(ViolationType.POOR_ACCURACY);
      riskScore += accuracyResult.riskScore;
      details.accuracy = accuracyResult.details;
    }

    // 6. Device attestation validation (if available)
    if (deviceSignals?.attestationToken) {
      const attestationResult = await validateDeviceAttestation(deviceSignals.attestationToken);
      if (!attestationResult.valid) {
        violations.push(ViolationType.INVALID_ATTESTATION);
        riskScore += attestationResult.riskScore;
        details.attestation = attestationResult.details;
      }
    }

    // 7. Pattern analysis
    const patternResult = await analyzeUserPatterns(userId, location);
    if (!patternResult.valid) {
      violations.push(ViolationType.SUSPICIOUS_PATTERN);
      riskScore += patternResult.riskScore;
      details.patterns = patternResult.details;
    }

    // Store location history
    await storeLocationHistory(userId, location, deviceSignals);

    // Log security event if violations found
    if (violations.length > 0) {
      logSecurity('anti_cheat_violation', 'medium', {
        userId,
        violations,
        riskScore,
        location,
        deviceSignals,
      });
    }

    const allowed = violations.length === 0 && riskScore < 20;

    return {
      allowed,
      violations,
      riskScore,
      details,
    };

  } catch (error) {
    typedLogger.error('Anti-cheat validation error', {
      error: (error as any).message,
      userId,
      location,
    });

    // Fail secure - deny on error
    return {
      allowed: false,
      violations: [ViolationType.SUSPICIOUS_PATTERN],
      riskScore: 100,
      details: { error: 'Validation failed' },
    };
  }
}

/**
 * Validate global and per-city cooldowns for claiming.
 * Throws Error('COOLDOWN_ACTIVE') when cooldown active.
 */
export async function validateCooldowns(userId: string, city?: string): Promise<void> {
  try {
    const now = Date.now();
    const windowMs = ANTI_CHEAT_CONFIG.GLOBAL_COOLDOWN_MS;
    const keyGlobal = `cooldown:global:${userId}`;
    const keyCity = city ? `cooldown:city:${userId}:${city}` : undefined;

    const [globalExists, cityExists] = await Promise.all([
      RedisCache.exists(keyGlobal),
      keyCity ? RedisCache.exists(keyCity) : Promise.resolve(false),
    ]);

    if (globalExists || cityExists) {
      throw new Error('COOLDOWN_ACTIVE');
    }

    // Set cooldowns
    const ttlSeconds = Math.ceil(windowMs / 1000);
    await RedisCache.set(keyGlobal, { at: now }, ttlSeconds);
    if (keyCity) {
      await RedisCache.set(keyCity, { at: now }, Math.ceil(ANTI_CHEAT_CONFIG.CITY_COOLDOWN_MS / 1000));
    }
  } catch (error) {
    if (error instanceof Error && (error as any).message === 'COOLDOWN_ACTIVE') {
      throw error;
    }
    typedLogger.error('Cooldown validation error', { error: (error as any).message, userId, city });
    throw new Error('COOLDOWN_ACTIVE');
  }
}

/**
 * Validate movement speed
 */
async function validateSpeed(
  userId: string,
  location: Coordinates,
  deviceSignals?: DeviceSignals
): Promise<{ valid: boolean; riskScore: number; details: any }> {
  try {
    // Check device-reported speed first
    if (deviceSignals?.speed && deviceSignals.speed > ANTI_CHEAT_CONFIG.MAX_SPEED_MS) {
      return {
        valid: false,
        riskScore: 30,
        details: {
          reportedSpeed: msToKmh(deviceSignals.speed),
          maxAllowed: msToKmh(ANTI_CHEAT_CONFIG.MAX_SPEED_MS),
          source: 'device_reported',
        },
      };
    }

    // Calculate speed from location history
    const lastLocation = await getLastLocation(userId);
    if (lastLocation) {
      const timeDiff = (Date.now() - lastLocation.timestamp.getTime()) / 1000; // seconds
      
      if (timeDiff < ANTI_CHEAT_CONFIG.MIN_TIME_BETWEEN_LOCATIONS) {
        return {
          valid: false,
          riskScore: 20,
          details: {
            timeDiff,
            minRequired: ANTI_CHEAT_CONFIG.MIN_TIME_BETWEEN_LOCATIONS,
            reason: 'too_frequent',
          },
        };
      }

      const distance = calculateGeodesicDistance(location, lastLocation);
      const calculatedSpeed = distance / timeDiff;

      if (calculatedSpeed > ANTI_CHEAT_CONFIG.MAX_SPEED_MS) {
        return {
          valid: false,
          riskScore: calculatedSpeed > ANTI_CHEAT_CONFIG.SUSPICIOUS_SPEED_THRESHOLD ? 50 : 30,
          details: {
            calculatedSpeed: msToKmh(calculatedSpeed),
            maxAllowed: msToKmh(ANTI_CHEAT_CONFIG.MAX_SPEED_MS),
            distance,
            timeDiff,
            source: 'calculated',
          },
        };
      }
    }

    return { valid: true, riskScore: 0, details: {} };
  } catch (error) {
    typedLogger.error('Speed validation error', { error: (error as any).message, userId });
    return { valid: false, riskScore: 25, details: { error: 'validation_failed' } };
  }
}

/**
 * Validate mock location detection
 */
async function validateMockLocation(
  deviceSignals?: DeviceSignals
): Promise<{ valid: boolean; riskScore: number; details: any }> {
  if (deviceSignals?.mockLocation === true) {
    return {
      valid: false,
      riskScore: 40,
      details: {
        detected: true,
        source: 'device_reported',
      },
    };
  }

  // Additional heuristics for mock location detection
  const suspiciousIndicators = [];

  if (deviceSignals?.provider === 'network' && deviceSignals?.accuracy && deviceSignals.accuracy < 5) {
    suspiciousIndicators.push('perfect_network_accuracy');
  }

  if (deviceSignals?.accuracy === 0) {
    suspiciousIndicators.push('zero_accuracy');
  }

  if (suspiciousIndicators.length > 0) {
    return {
      valid: false,
      riskScore: 20,
      details: {
        indicators: suspiciousIndicators,
        source: 'heuristic',
      },
    };
  }

  return { valid: true, riskScore: 0, details: {} };
}

/**
 * Validate daily claims limit using Redis counters
 */
async function validateDailyLimit(userId: string): Promise<{ valid: boolean; riskScore: number; details: any }> {
  try {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const key = `daily_claims:${userId}:${y}${m}${d}`;

    const ttlMsToMidnight = (() => {
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
      return Math.max(1, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
    })();

    const count = await RedisCache.incr(key, ttlMsToMidnight);
    const limit = ANTI_CHEAT_CONFIG.MAX_CLAIMS_PER_DAY;
    if (count > limit) {
      return {
        valid: false,
        riskScore: 30,
        details: { count, limit },
      };
    }
    return { valid: true, riskScore: 0, details: { count, limit } };
  } catch (error) {
    typedLogger.error('Daily limit validation error', { error: (error as any).message, userId });
    // Fail-open here; anti-cheat overall will still include other checks
    return { valid: true, riskScore: 0, details: { error: 'validation_failed' } };
  }
}

/**
 * Validate teleportation (impossible movement)
 */
async function validateTeleportation(
  userId: string,
  location: Coordinates
): Promise<{ valid: boolean; riskScore: number; details: any }> {
  try {
    const lastLocation = await getLastLocation(userId);
    if (!lastLocation) {
      return { valid: true, riskScore: 0, details: {} };
    }

    const distance = calculateGeodesicDistance(location, lastLocation);
    const timeDiff = (Date.now() - lastLocation.timestamp.getTime()) / 1000;

    // Check for teleportation (large distance, short time)
    if (distance > ANTI_CHEAT_CONFIG.TELEPORT_THRESHOLD && timeDiff < 60) {
      return {
        valid: false,
        riskScore: 45,
        details: {
          distance,
          timeDiff,
          threshold: ANTI_CHEAT_CONFIG.TELEPORT_THRESHOLD,
          reason: 'teleportation',
        },
      };
    }

    return { valid: true, riskScore: 0, details: {} };
  } catch (error) {
    typedLogger.error('Teleportation validation error', { error: (error as any).message, userId });
    return { valid: false, riskScore: 25, details: { error: 'validation_failed' } };
  }
}

/**
 * Validate rapid claims
 */
async function validateRapidClaims(
  userId: string
): Promise<{ valid: boolean; riskScore: number; details: any }> {
  try {
    // Check hourly rate limit
    const hourlyResult = await RedisRateLimit.checkLimit(
      'claims_hourly',
      ANTI_CHEAT_CONFIG.MAX_CLAIMS_PER_HOUR,
      60 * 60 * 1000, // 1 hour
      userId
    );

    if (!hourlyResult.allowed) {
      return {
        valid: false,
        riskScore: 35,
        details: {
          type: 'hourly_limit',
          limit: ANTI_CHEAT_CONFIG.MAX_CLAIMS_PER_HOUR,
          remaining: hourlyResult.remaining,
          resetTime: hourlyResult.resetTime,
        },
      };
    }

    // Check daily rate limit
    const dailyResult = await RedisRateLimit.checkLimit(
      'claims_daily',
      ANTI_CHEAT_CONFIG.MAX_CLAIMS_PER_DAY,
      24 * 60 * 60 * 1000, // 24 hours
      userId
    );

    if (!dailyResult.allowed) {
      return {
        valid: false,
        riskScore: 25,
        details: {
          type: 'daily_limit',
          limit: ANTI_CHEAT_CONFIG.MAX_CLAIMS_PER_DAY,
          remaining: dailyResult.remaining,
          resetTime: dailyResult.resetTime,
        },
      };
    }

    return { valid: true, riskScore: 0, details: {} };
  } catch (error) {
    typedLogger.error('Rapid claims validation error', { error: (error as any).message, userId });
    return { valid: false, riskScore: 25, details: { error: 'validation_failed' } };
  }
}

/**
 * Validate location accuracy
 */
async function validateLocationAccuracy(
  deviceSignals?: DeviceSignals
): Promise<{ valid: boolean; riskScore: number; details: any }> {
  if (!deviceSignals?.accuracy) {
    return { valid: true, riskScore: 0, details: {} };
  }

  if (deviceSignals.accuracy > ANTI_CHEAT_CONFIG.MAX_LOCATION_ACCURACY) {
    return {
      valid: false,
      riskScore: 15,
      details: {
        accuracy: deviceSignals.accuracy,
        maxAllowed: ANTI_CHEAT_CONFIG.MAX_LOCATION_ACCURACY,
        reason: 'poor_accuracy',
      },
    };
  }

  return { valid: true, riskScore: 0, details: {} };
}

/**
 * Validate device attestation (iOS DeviceCheck / Android SafetyNet)
 */
async function validateDeviceAttestation(
  attestationToken: string
): Promise<{ valid: boolean; riskScore: number; details: any }> {
  try {
    if (!config.DEVICE_ATTESTATION_REQUIRED && !attestationToken) {
      return { valid: true, riskScore: 0, details: { mode: 'not_required' } };
    }

    if (!attestationToken) {
      return { valid: false, riskScore: 25, details: { reason: 'missing_token' } };
    }

    const parts = attestationToken.split('.');
    const looksJwtLike = parts.length === 3;
    const longEnough = attestationToken.length > 100;

    if (!looksJwtLike || !longEnough) {
      return {
        valid: false,
        riskScore: 25,
        details: { reason: 'invalid_token_format' },
      };
    }

    // Minimal structural validation; real verification should call platform services.
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      if (!payload || typeof payload !== 'object') {
        return { valid: false, riskScore: 25, details: { reason: 'invalid_payload' } };
      }
    } catch {
      return { valid: false, riskScore: 25, details: { reason: 'invalid_payload' } };
    }

    // TODO: Implement actual attestation validation
    return { valid: true, riskScore: 0, details: { mode: 'structural_validation' } };
  } catch (error) {
    typedLogger.error('Attestation validation error', { error: (error as any).message });
    return { valid: false, riskScore: 15, details: { error: 'validation_failed' } };
  }
}

/**
 * Analyze user behavior patterns
 */
async function analyzeUserPatterns(
  userId: string,
  location: Coordinates
): Promise<{ valid: boolean; riskScore: number; details: any }> {
  try {
    const patterns = await getUserPatterns(userId);
    const suspiciousIndicators = [];
    let riskScore = 0;

    // Check for perfectly regular patterns (bot-like behavior)
    if (patterns.regularityScore > 0.95) {
      suspiciousIndicators.push('too_regular');
      riskScore += 20;
    }

    // Check for impossible travel patterns
    if (patterns.impossibleTravelCount > 3) {
      suspiciousIndicators.push('impossible_travel');
      riskScore += 25;
    }

    // Check for clustering in unusual locations
    if (patterns.unusualLocationScore > 0.8) {
      suspiciousIndicators.push('unusual_locations');
      riskScore += 15;
    }

    // Check for time pattern anomalies
    if (patterns.timeAnomalyScore > 0.7) {
      suspiciousIndicators.push('time_anomalies');
      riskScore += 10;
    }

    return {
      valid: riskScore < 30,
      riskScore,
      details: {
        indicators: suspiciousIndicators,
        patterns,
      },
    };
  } catch (error) {
    typedLogger.error('Pattern analysis error', { error: (error as any).message, userId });
    return { valid: true, riskScore: 0, details: {} };
  }
}



/**
 * Store location history for analysis
 */
async function storeLocationHistory(
  userId: string,
  location: Coordinates,
  deviceSignals?: DeviceSignals
): Promise<void> {
  const entry: LocationEntry = {
    lat: location.lat,
    lng: location.lng,
    timestamp: new Date(),
    accuracy: deviceSignals?.accuracy,
  };

  // Store in Redis with TTL
  await RedisCache.lpush(`location_history:${userId}`, entry, 24 * 60 * 60); // 24 hours

  // Keep only last 50 locations
  const history = await RedisCache.lrange(`location_history:${userId}`, 0, 49);
  if (history.length > 50) {
    await RedisCache.del(`location_history:${userId}`);
    await Promise.all(
      history.slice(0, 50).map(entry => 
        RedisCache.lpush(`location_history:${userId}`, entry, 24 * 60 * 60)
      )
    );
  }
}

/**
 * Get last known location
 */
async function getLastLocation(userId: string): Promise<LocationEntry | null> {
  const history = await RedisCache.lrange<LocationEntry>(`location_history:${userId}`, 0, 0);
  const normalized = history[0] ? normalizeLocationEntry(history[0]) : null;
  return normalized;
}

/**
 * Get user behavior patterns
 */
async function getUserPatterns(userId: string): Promise<any> {
  const historyRaw = await RedisCache.lrange<LocationEntry>(`location_history:${userId}`, 0, -1);
  const history = historyRaw
    .map(normalizeLocationEntry)
    .filter((entry): entry is LocationEntry => !!entry);
  
  if (history.length < 5) {
    return {
      regularityScore: 0,
      impossibleTravelCount: 0,
      unusualLocationScore: 0,
      timeAnomalyScore: 0,
    };
  }

  // Analyze patterns (simplified implementation)
  let impossibleTravelCount = 0;
  let totalDistance = 0;
  let totalTime = 0;

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    
    const distance = calculateGeodesicDistance(prev, curr);
    const timeDiff = (curr.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
    
    if (timeDiff > 0) {
      const speed = distance / timeDiff;
      if (speed > ANTI_CHEAT_CONFIG.SUSPICIOUS_SPEED_THRESHOLD) {
        impossibleTravelCount++;
      }
      
      totalDistance += distance;
      totalTime += timeDiff;
    }
  }

  // Calculate regularity (simplified)
  const distances = [];
  for (let i = 1; i < history.length; i++) {
    distances.push(calculateGeodesicDistance(history[i - 1], history[i]));
  }
  
  const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
  const variance = distances.reduce((a, b) => a + Math.pow(b - avgDistance, 2), 0) / distances.length;
  const regularityScore = variance === 0 ? 1 : Math.max(0, 1 - (Math.sqrt(variance) / avgDistance));

  return {
    regularityScore,
    impossibleTravelCount,
    unusualLocationScore: 0, // TODO: Implement location clustering analysis
    timeAnomalyScore: 0, // TODO: Implement time pattern analysis
    totalLocations: history.length,
    averageDistance: avgDistance,
    averageSpeed: totalTime > 0 ? totalDistance / totalTime : 0,
  };
}

/**
 * Get anti-cheat statistics for monitoring
 */
export async function getAntiCheatStats(): Promise<any> {
  // This would return aggregated statistics about anti-cheat violations
  // for monitoring and tuning purposes
  
  return {
    totalViolations: 0,
    violationsByType: {},
    averageRiskScore: 0,
    falsePositiveRate: 0,
    // TODO: Implement actual statistics collection
  };
}

/**
 * Reset user anti-cheat data (for testing or appeals)
 */
export async function resetUserAntiCheatData(userId: string): Promise<void> {
  const keys = [
    `last_claim:${userId}`,
    `location_history:${userId}`,
    `claims_hourly:${userId}`,
    `claims_daily:${userId}`,
    `cooldown:global:${userId}`,
  ];

  await Promise.all(keys.map(key => RedisCache.del(key)));

  try {
    const cityKeys = redisClient ? await redisClient.keys(`cooldown:city:${userId}:*`) : [];
    if (cityKeys.length && redisClient) {
      await redisClient.del(...cityKeys);
    }
  } catch (err) {
    typedLogger.error('Anti-cheat reset city cooldown error', { userId, error: (err as any).message });
  }
  
  typedLogger.info('User anti-cheat data reset', { userId });
}

function normalizeLocationEntry(raw: any): LocationEntry | null {
  if (!raw || typeof raw.lat !== 'number' || typeof raw.lng !== 'number') {
    return null;
  }
  const timestamp = raw.timestamp instanceof Date ? raw.timestamp : new Date(raw.timestamp);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }
  return {
    lat: raw.lat,
    lng: raw.lng,
    timestamp,
    accuracy: raw.accuracy,
  };
}
