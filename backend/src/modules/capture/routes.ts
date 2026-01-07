import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { claimsRateLimit, adminRateLimit } from '@/middleware/distributed-rate-limit';
import { z } from 'zod';
import { Prize } from '@/models/Prize';
import { User } from '@/models/User';
import { Claim } from '@/models/Claim';
import { Report } from '@/models/Report';
import { typedLogger } from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';
import ProximityService from '@/services/proximity';
import { Settings } from '@/models/Settings';
import { ProgressionService } from '@/services/progression';
import mongoose from 'mongoose';
import { Types } from 'mongoose';

/**
 * AR Capture Module
 * Core Feature 2: Utilisateur capture â†’ Gagne les points + dÃ©couvre contenu
 * Handles the AR capture experience with animations, validation, and rewards
 */

// Schemas for capture system
const CaptureAttemptSchema = z.object({
  prizeId: z.string(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(1000).optional(),
    altitude: z.number().optional()}),
  deviceInfo: z.object({
    platform: z.enum(['iOS', 'Android']),
    deviceModel: z.string(),
    osVersion: z.string(),
    appVersion: z.string(),
    timestamp: z.string().datetime()}),
  arData: z.object({
    cameraPosition: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number()}).optional(),
    cameraRotation: z.object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      w: z.number()}).optional(),
    lightEstimation: z.number().min(0).max(1).optional(),
    trackingState: z.enum(['tracking', 'limited', 'not_tracking']).optional()}).optional(),
  captureMethod: z.enum(['tap', 'gesture', 'voice']).default('tap')});

const CaptureValidationSchema = z.object({
  prizeId: z.string(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number()}),
  preValidate: z.boolean().default(false)});

export interface CaptureResult {
  success: boolean;
  prizeId: string;
  claimId?: string;
  content: {
    type: 'mystery_box' | 'direct_points' | 'power_up' | 'special_item';
    animation: 'standard' | 'rare' | 'epic' | 'legendary';
    displayType?: 'standard' | 'mystery_box' | 'treasure' | 'bonus' | 'special';
    points: number;
    bonusMultiplier: number;
    directReward?: any;
    specialReward?: any;
    message: string;
  };
  userProgress: {
    totalPoints: number;
    newLevel?: number;
    levelProgress: number;
    nextLevelPoints: number;
  };
  effects: {
    visualEffects: string[];
    soundEffects: string[];
    hapticPattern: string;
    duration: number;
  };
  achievements?: any[];
  metadata: {
    captureTime: string;
    distance: number;
    validationScore: number;
    contentType?: string;
    rewardGranted?: boolean;
  };
}

export interface BoxAnimation {
  type: 'mystery_box' | 'treasure_chest' | 'gift_box' | 'energy_orb';
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  animation: {
    approach: string;
    idle: string;
    opening: string;
    reveal: string;
    celebration: string;
  };
  effects: {
    particles: string[];
    lighting: string;
    sound: string;
  };
  duration: {
    total: number;
    phases: number[];
  };
}

// Define interfaces for request types
interface CaptureLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
}

interface DeviceInfo {
  platform: 'iOS' | 'Android';
  deviceModel: string;
  osVersion: string;
  appVersion: string;
  timestamp: string;
}


interface CameraPosition {
  x: number;
  y: number;
  z: number;
}

interface CameraRotation {
  x: number;
  y: number;
  z: number;
  w: number;
}

interface ArData {
  cameraPosition?: CameraPosition;
  cameraRotation?: CameraRotation;
  lightEstimation?: number;
  trackingState?: 'tracking' | 'limited' | 'not_tracking';
}

interface CaptureData {
  prizeId: string;
  location: CaptureLocation;
  deviceInfo: DeviceInfo;
  arData?: ArData;
  captureMethod: 'tap' | 'gesture' | 'voice';
}

interface ValidationData {
  prizeId: string;
  location: CaptureLocation;
  preValidate?: boolean;
}

export class CaptureService {
  private static redis = redisClient;
  private static antiCheatCache: any = null;
  private static antiCheatFetchedAt = 0;
  private static readonly ANTICHEAT_CACHE_TTL_MS = 60_000;

  /**
   * Attempt to capture a prize with full AR validation
   */
  static async attemptCapture(userId: string, captureData: z.infer<typeof CaptureAttemptSchema>): Promise<CaptureResult> {
    try {
      const { prizeId, location, deviceInfo, arData, captureMethod } = captureData;
      // Since Zod validation ensures required fields are present, we can safely assert non-null values

      // Step 1: Validate capture attempt
      // Ensure required location fields are present (Zod validation ensures this)
      const safeLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        altitude: location.altitude
      };

      // Type assertion to ensure required fields exist based on Zod validation
      const typedLocationForValidation: CaptureLocation = {
        latitude: location.latitude!,
        longitude: location.longitude!,
        accuracy: location.accuracy,
        altitude: location.altitude
      };

      const validation = await ProximityService.validateCatchAttempt(
        userId,
        prizeId,
        typedLocationForValidation,
        deviceInfo
      );

      if (!validation.canCatch) {
        throw new Error(`CAPTURE_FAILED: ${validation.reason}`);
      }

      // Step 2: Get prize and user data
      const [prize, user] = await Promise.all([
        Prize.findById(prizeId),
        User.findById(userId)]);

      if (!prize || !user) {
        throw new Error('PRIZE_OR_USER_NOT_FOUND');
      }

      // Step 3: Additional anti-cheat validation
      // Ensure required location fields are present for anti-cheat
      const antiCheatLocation = {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        altitude: location.altitude
      };

      // Type assertion to ensure required fields exist based on Zod validation
      const typedLocationForAntiCheat: CaptureLocation = {
        latitude: location.latitude!,
        longitude: location.longitude!,
        accuracy: location.accuracy,
        altitude: location.altitude
      };

      const antiCheatResult = await this.performAdvancedAntiCheat(
        userId,
        typedLocationForAntiCheat,
        prize,
        deviceInfo,
        arData
      );

      if (!antiCheatResult.valid) {
        throw new Error(`ANTI_CHEAT_FAILED: ${antiCheatResult.reason}`);
      }

      // Step 4: Process the capture
      // Type assertion to ensure required fields exist based on Zod validation
      const typedLocationForProcessing: CaptureLocation = {
        latitude: location.latitude!,
        longitude: location.longitude!,
        accuracy: location.accuracy,
        altitude: location.altitude
      };

      const captureResult = await this.processCaptureSuccess(
        userId,
        prize,
        user,
        typedLocationForProcessing,
        validation.distance || 0,
        captureMethod,
        antiCheatResult.validationScore
      );

      // Step 5: Update prize claims counter
      await Prize.findByIdAndUpdate(prizeId, {
        $inc: { 'distribution.currentClaims': 1 },
        $set: { 'metadata.lastClaimed': new Date() }});

      // Step 6: Log capture event
      typedLogger.info('Prize captured successfully', {
        userId,
        prizeId,
        points: captureResult.content.points,
        distance: validation.distance,
        method: captureMethod,
        validationScore: antiCheatResult.validationScore});

      return captureResult;
    } catch (error) {
      typedLogger.error('Capture attempt error', { error: (error as any).message, userId, captureData });
      throw error;
    }
  }

  /**
   * Pre-validate capture possibility (for UI feedback)
   */
  static async preValidateCapture(userId: string, validationData: z.infer<typeof CaptureValidationSchema>): Promise<{
    canCapture: boolean;
    reason?: string;
    distance?: number;
    animation?: any;
    estimatedReward?: {
      minPoints: number;
      maxPoints: number;
      rarity: string;
    };
  }> {
    try {
      const { prizeId, location } = validationData;

      // Ensure required location fields are present (Zod validation ensures this)
      const safeLocation = {
        latitude: location.latitude,
        longitude: location.longitude
      };

      // Type assertion to ensure required fields exist based on Zod validation
      const typedLocation: CaptureLocation = {
        latitude: location.latitude!,
        longitude: location.longitude!
      };

      const validation = await ProximityService.validateCatchAttempt(
        userId,
        prizeId,
        typedLocation
      );

      const prize = await Prize.findById(prizeId);
      if (!prize) {
        return { canCapture: false, reason: 'PRIZE_NOT_FOUND' };
      }

      // Get capture animation info for UI preparation
      const animationInfo = await this.getCaptureAnimationInfo(prize);

      return {
        canCapture: validation.canCatch,
        reason: validation.reason,
        distance: validation.distance,
        animation: animationInfo,
        estimatedReward: {
          minPoints: prize.points,
          maxPoints: prize.points * (prize.pointsReward?.bonusMultiplier || 1),
          rarity: prize.rarity}};
    } catch (error) {
      typedLogger.error('Pre-validate capture error', { error: (error as any).message, userId, validationData });
      return { canCapture: false, reason: 'VALIDATION_ERROR' };
    }
  }

  /**
   * Get box animation configuration for Unity
   */
  static async getBoxAnimation(prizeId: string): Promise<BoxAnimation> {
    try {
      const prize = await Prize.findById(prizeId);
      if (!prize) {
        throw new Error('PRIZE_NOT_FOUND');
      }

      const animationType = this.determineBoxType(prize);
      const animation = this.generateBoxAnimation(animationType, prize.rarity);

      return animation;
    } catch (error) {
      typedLogger.error('Get box animation error', { error: (error as any).message, prizeId });
      throw error;
    }
  }

  /**
   * Process capture success and generate rewards
   */
  private static async processCaptureSuccess(
    userId: string,
    prize: any, // Keeping 'any' for prize since it can be complex
    user: any, // Keeping 'any' for user since it has dynamic methods
    location: CaptureLocation,
    distance: number,
    captureMethod: 'tap' | 'gesture' | 'voice',
    validationScore: number
  ): Promise<CaptureResult> {
    try {
      // Import Redemption and Reward models
      const Redemption = mongoose.models.Redemption || mongoose.model('Redemption');
      const Reward = mongoose.models.Reward || mongoose.model('Reward');

      // Determine content type (with backward compatibility)
      const contentType = prize.contentType || 'points';

      // Calculate final points with bonuses (for points-based rewards)
      const basePoints = prize.pointsReward?.amount || prize.points || 0;
      let finalPoints = basePoints;
      let bonusMultiplier = prize.pointsReward?.bonusMultiplier || 1;

      // Distance bonus (closer = better)
      if (distance < 2) {
        bonusMultiplier *= 1.2; // 20% bonus for very close captures
      } else if (distance < 1) {
        bonusMultiplier *= 1.5; // 50% bonus for perfect captures
      }

      // Capture method bonus
      if (captureMethod === 'gesture') {
        bonusMultiplier *= 1.1; // 10% bonus for gesture captures
      }

      // Validation score bonus
      if (validationScore > 0.9) {
        bonusMultiplier *= 1.1; // 10% bonus for high validation scores
      }

      finalPoints = Math.round(basePoints * bonusMultiplier);

      // Variables for reward handling
      let directRedemption = null;
      let rewardGranted = false;
      let rewardDetails = null;

      // Handle different content types
      if (contentType === 'reward' || contentType === 'hybrid') {
        // Check if we should grant a direct reward
        const shouldGrantReward = contentType === 'reward' ||
          (contentType === 'hybrid' && Math.random() < (prize.directReward?.probability || 0));

        if (shouldGrantReward && prize.directReward?.rewardId) {
          // Get reward details
          const reward = await Reward.findById(prize.directReward.rewardId);

          if (reward && reward.isAvailable) {
            // Reserve stock
            const stockReserved = reward.reserveStock(1);

            if (stockReserved) {
              await reward.save();

              // Create automatic redemption
              directRedemption = new Redemption({
                userId,
                rewardId: reward._id,
                pointsSpent: 0, // Free reward from prize capture
                status: 'fulfilled',
                redeemedAt: new Date(),
                fulfilledAt: new Date(),
                idempotencyKey: `capture_${prize._id}_${userId}_${Date.now()}`,
                metadata: {
                  source: 'prize_capture',
                  prizeId: prize._id,
                  autoRedeemed: true}});

              await directRedemption.save();

              // Confirm stock redemption
              reward.confirmRedemption(1);
              await reward.save();

              rewardGranted = true;
              rewardDetails = {
                id: reward._id,
                name: reward.name,
                description: reward.description,
                category: reward.category,
                imageUrl: reward.imageUrl,
                redemptionId: directRedemption._id};

              typedLogger.info('Direct reward granted from prize capture', {
                userId,
                prizeId: prize._id,
                rewardId: reward._id,
                redemptionId: directRedemption._id});
            }
          }
        }
      }

      // Create claim record
      const claim = new Claim({
        userId,
        prizeId: prize._id,
        location: {
          type: 'Point',
          coordinates: [location.longitude, location.latitude]},
        claimedAt: new Date(),
        pointsAwarded: finalPoints,
        bonusMultiplier,
        captureMethod,
        distance,
        validationScore,
        status: 'verified',
        metadata: {
          contentType,
          rewardGranted,
          redemptionId: directRedemption?._id}});

      await claim.save();

      // Update user points (only if contentType includes points)
      // Hybrid logic: If reward is granted, no points (Points OR Reward). If no reward, fallback to points.
      let pointsToAdd = 0;
      if (contentType === 'points') {
        pointsToAdd = finalPoints;
      } else if (contentType === 'hybrid') {
        pointsToAdd = rewardGranted ? 0 : finalPoints;
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
          $inc: {
            points: pointsToAdd,
            'stats.totalClaims': 1,
            'stats.totalPoints': pointsToAdd,
            ...(rewardGranted && { 'stats.rewardsRedeemed': 1 })},
          $set: { lastActive: new Date() }},
        { new: true }
      );

      // Check for level progression
      const levelProgress = await this.checkLevelProgression(updatedUser);

      // Check for achievements
      const achievements = await this.checkAchievements(userId, prize, claim);

      // Generate capture effects
      const effects = this.generateCaptureEffects(prize.rarity, bonusMultiplier);

      // Generate content reveal message
      const message = this.generateRevealMessage(prize, finalPoints, bonusMultiplier);

      return {
        success: true,
        prizeId: prize._id.toString(),
        claimId: claim._id.toString(),
        content: {
          type: contentType,
          displayType: (prize as any).displayType || 'standard',
          animation: (prize as any).content?.animation || this.getAnimationForDisplayType((prize as any).displayType),
          points: pointsToAdd,
          bonusMultiplier,
          directReward: rewardGranted ? rewardDetails : undefined,
          specialReward: (prize as any).content?.specialReward,
          message: this.generateRevealMessage(prize, pointsToAdd, bonusMultiplier, rewardDetails)},
        userProgress: {
          totalPoints: (updatedUser as any).points,
          newLevel: levelProgress.leveledUp ? levelProgress.newLevel : undefined,
          levelProgress: levelProgress.progress,
          nextLevelPoints: levelProgress.nextLevel?.pointsToNext},
        effects,
        achievements: achievements.length > 0 ? achievements : undefined,
        metadata: {
          captureTime: new Date().toISOString(),
          distance: Math.round(distance * 100) / 100,
          validationScore: Math.round(validationScore * 100) / 100,
          contentType,
          rewardGranted}};
    } catch (error) {
      typedLogger.error('Process capture success error', { error: (error as any).message, userId, prizeId: prize._id });
      throw error;
    }
  }

  /**
   * Advanced anti-cheat validation for AR captures
   */
  private static async performAdvancedAntiCheat(
    userId: string,
    location: any, // Accepting inferred type from Zod
    prize: any, // Keeping 'any' for prize
    deviceInfo: any, // Accepting inferred type from Zod
    arData: any // Accepting inferred type from Zod
  ): Promise<{ valid: boolean; reason?: string; validationScore: number }> {
    try {
      const cfg = await this.getAntiCheatConfig();
      let validationScore = 1.0;
      const issues = [];

      // Check device consistency
      const deviceKey = `device:${userId}`;
      const lastDevice = await this.redis.get(deviceKey);
      if (lastDevice) {
        const device = JSON.parse(lastDevice);
        if (device.deviceModel !== deviceInfo.deviceModel) {
          validationScore -= cfg.penalties.deviceChange;
          issues.push('Device model changed');
        }
      }
      await this.redis.setex(deviceKey, 86400, JSON.stringify(deviceInfo));

      // Check capture frequency (prevent rapid-fire captures)
      const captureKey = `captures:${userId}:${Math.floor(Date.now() / 60000)}`; // per minute
      const captureCount = await this.redis.incr(captureKey);
      await this.redis.expire(captureKey, 60);

      if (captureCount > cfg.captureFrequencyPerMinute) {
        return { valid: false, reason: 'TOO_MANY_CAPTURES', validationScore: 0 };
      }

      // Check AR data consistency (if provided)
      if (arData) {
        if (arData.trackingState === 'not_tracking') {
          validationScore -= cfg.penalties.trackingNotTracking;
          issues.push('Poor AR tracking');
        }

        if (arData.lightEstimation !== undefined && arData.lightEstimation < 0.1) {
          validationScore -= cfg.penalties.lowLight;
          issues.push('Suspicious lighting conditions');
        }
      }

      // Check location accuracy
      if (location.accuracy && location.accuracy > cfg.gpsAccuracyThreshold) {
        validationScore -= cfg.penalties.lowAccuracy;
        issues.push('Low GPS accuracy');
      }

      // Check for impossible travel speed
      const lastCaptureKey = `last_capture:${userId}`;
      const lastCapture = await this.redis.get(lastCaptureKey);
      if (lastCapture) {
        const last = JSON.parse(lastCapture);
        const timeDiff = Date.now() - last.timestamp;
        if (last.location.latitude !== undefined && last.location.longitude !== undefined &&
            location.latitude !== undefined && location.longitude !== undefined) {
          const distance = this.calculateDistance(
            last.location.latitude,
            last.location.longitude,
            location.latitude,
            location.longitude
          );

        const speed = distance / (timeDiff / 1000); // m/s
        const maxSpeed = cfg.maxSpeedMps;

        if (speed > maxSpeed && timeDiff > 1000) {
          return { valid: false, reason: 'IMPOSSIBLE_TRAVEL_SPEED', validationScore: 0 };
        }
        }
      }

      // Store current capture for next validation
      await this.redis.setex(lastCaptureKey, 300, JSON.stringify({
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          altitude: location.altitude
        },
        timestamp: Date.now()}));

      // Final validation score check
      if (validationScore < cfg.validationScoreFloor) {
        return { valid: false, reason: 'LOW_VALIDATION_SCORE', validationScore };
      }

      if (issues.length > 0) {
        typedLogger.warn('Capture validation issues detected', { userId, issues, validationScore });
      }

      return { valid: true, validationScore };
    } catch (error) {
      typedLogger.error('Advanced anti-cheat error', { error: (error as any).message, userId });
      return { valid: true, validationScore: 0.5 }; // Fail open
    }
  }

  /**
   * Check for level progression after points award
   */
  private static async checkLevelProgression(user: any) {
    try {
      const result = await ProgressionService.updateLevelForUser(user);
      return result;
    } catch (error) {
      typedLogger.error('Check level progression error', { error: (error as any).message, userId: user._id });
      return { leveledUp: false, newLevel: user.level, progress: 0, nextLevel: null };
    }
  }

  /**
   * Check for achievements triggered by capture
   */
  private static async checkAchievements(userId: string, prize: any, claim: any): Promise<any[]> {
    try {
      const achievements = [];

      // First capture achievement
      const claimCount = await Claim.countDocuments({ userId });
      if (claimCount === 1) {
        achievements.push({
          id: 'first_capture',
          title: 'First Catch!',
          description: 'Captured your first prize',
          icon: 'first_catch',
          points: 50});
      }

      // Distance-based achievements
      if (claim.distance < 1) {
        achievements.push({
          id: 'perfect_catch',
          title: 'Perfect Catch',
          description: 'Captured a prize from less than 1 meter',
          icon: 'perfect_catch',
          points: 25});
      }

      // Rarity-based achievements
      if (prize.rarity === 'legendary') {
        achievements.push({
          id: 'legendary_hunter',
          title: 'Legendary Hunter',
          description: 'Captured a legendary prize',
          icon: 'legendary_hunter',
          points: 200});
      }

      // Store achievements in user record
      if (achievements.length > 0) {
        await User.findByIdAndUpdate(userId, {
          $push: {
            'achievements': {
              $each: achievements.map(ach => ({
                ...ach,
                unlockedAt: new Date()}))
            }
          }
        });
      }

      return achievements;
    } catch (error) {
      typedLogger.error('Check achievements error', { error: (error as any).message, userId });
      return [];
    }
  }

  /**
   * Generate visual and audio effects for capture
   */
  private static generateCaptureEffects(rarity: string, bonusMultiplier: number): any {
    const baseEffects = {
      visualEffects: ['sparkles', 'glow'],
      soundEffects: ['capture_success'],
      hapticPattern: 'light',
      duration: 2000};

    // Enhance effects based on rarity
    switch (rarity) {
      case 'uncommon':
        baseEffects.visualEffects.push('blue_particles');
        baseEffects.soundEffects.push('uncommon_chime');
        baseEffects.hapticPattern = 'medium';
        break;
      case 'rare':
        baseEffects.visualEffects.push('purple_particles', 'ring_explosion');
        baseEffects.soundEffects.push('rare_fanfare');
        baseEffects.hapticPattern = 'heavy';
        baseEffects.duration = 3000;
        break;
      case 'epic':
        baseEffects.visualEffects.push('golden_particles', 'lightning', 'screen_flash');
        baseEffects.soundEffects.push('epic_fanfare', 'thunder');
        baseEffects.hapticPattern = 'intense';
        baseEffects.duration = 4000;
        break;
      case 'legendary':
        baseEffects.visualEffects.push('rainbow_particles', 'fireworks', 'screen_shake', 'light_rays');
        baseEffects.soundEffects.push('legendary_fanfare', 'choir', 'explosion');
        baseEffects.hapticPattern = 'legendary';
        baseEffects.duration = 5000;
        break;
    }

    // Bonus multiplier effects
    if (bonusMultiplier > 1.5) {
      baseEffects.visualEffects.push('bonus_multiplier_text');
      baseEffects.soundEffects.push('bonus_sound');
    }

    return baseEffects;
  }

  /**
   * Generate reveal message for captured content
   */
  private static generateRevealMessage(prize: any, points: number, bonusMultiplier: number, rewardDetails?: any): string {
    let message = `You found ${prize.name}!`;

    // Points message
    if (points > 0) {
      message += ` Earned ${points} points`;
      if (bonusMultiplier > 1) {
        message += ` (${Math.round((bonusMultiplier - 1) * 100)}% bonus!)`;
      }
      message += '!';
    }

    // Direct reward message
    if (rewardDetails) {
      if (points > 0) {
        message += ` Plus a special reward: ${rewardDetails.name}!`;
      } else {
        message += ` You won: ${rewardDetails.name}!`;
      }
    }

    // Legacy special reward
    if (prize.content?.specialReward && !rewardDetails) {
      message += ` Plus a special reward: ${prize.content.specialReward}`;
    }

    return message;
  }

  /**
   * Get animation type based on display type
   */
  private static getAnimationForDisplayType(displayType: string): string {
    const animationMap: Record<string, string> = {
      'standard': 'standard',
      'mystery_box': 'mystery_reveal',
      'treasure': 'treasure_open',
      'bonus': 'bonus_burst',
      'special': 'special_event'};
    return animationMap[displayType] || 'standard';
  }

  /**
   * Get capture animation info for UI preparation
   */
  private static async getCaptureAnimationInfo(prize: any): Promise<any> {
    const boxType = this.determineBoxType(prize);

    return {
      boxType,
      rarity: prize.rarity,
      estimatedDuration: this.getAnimationDuration(prize.rarity),
      preloadAssets: this.getPreloadAssets(boxType, prize.rarity)};
  }

  /**
   * Determine box type based on prize characteristics
   */
  private static determineBoxType(prize: any): string {
    if (prize.category === 'special' || prize.rarity === 'legendary') {
      return 'energy_orb';
    } else if (prize.rarity === 'epic' || prize.rarity === 'rare') {
      return 'treasure_chest';
    } else if (prize.type === 'power_up') {
      return 'energy_orb';
    } else {
      return 'mystery_box';
    }
  }

  /**
   * Generate complete box animation configuration
   */
  private static generateBoxAnimation(boxType: string, rarity: string): BoxAnimation {
    const baseAnimation = {
      approach: 'float_down',
      idle: 'gentle_bob',
      opening: 'lid_open',
      reveal: 'content_emerge',
      celebration: 'sparkle_burst'};

    const baseEffects = {
      particles: ['dust', 'sparkles'],
      lighting: 'soft_glow',
      sound: 'box_open'};

    const baseDuration = {
      total: 3000,
      phases: [500, 1000, 1000, 500], // approach, idle, opening, celebration
    };

    // Customize based on rarity
    if (rarity === 'legendary') {
      baseAnimation.approach = 'dramatic_descent';
      baseAnimation.opening = 'explosive_open';
      baseAnimation.celebration = 'fireworks_burst';
      baseEffects.particles.push('golden_rays', 'rainbow_sparkles');
      baseEffects.lighting = 'intense_glow';
      baseEffects.sound = 'legendary_reveal';
      baseDuration.total = 5000;
      baseDuration.phases = [1000, 1500, 2000, 500];
    }

    return {
      type: boxType as any,
      rarity: rarity as any,
      animation: baseAnimation,
      effects: baseEffects,
      duration: baseDuration};
  }

  /**
   * Get animation duration based on rarity
   */
  private static getAnimationDuration(rarity: string): number {
    const durations = {
      common: 2000,
      uncommon: 2500,
      rare: 3000,
      epic: 4000,
      legendary: 5000};

    return durations[rarity] || 2000;
  }

  /**
   * Get assets to preload for smooth animation
   */
  private static getPreloadAssets(boxType: string, rarity: string): string[] {
    const assets = [`box_${boxType}`, `particles_${rarity}`];

    if (rarity === 'legendary') {
      assets.push('fireworks', 'rainbow_particles', 'light_rays');
    } else if (rarity === 'epic') {
      assets.push('golden_particles', 'lightning');
    }

    return assets;
  }

  /**
   * Load anti-cheat config from Settings.custom.antiCheat or defaults.
   */
  private static async getAntiCheatConfig() {
    const now = Date.now();
    if (this.antiCheatCache && (now - this.antiCheatFetchedAt) < this.ANTICHEAT_CACHE_TTL_MS) {
      return this.antiCheatCache;
    }

    const defaults = {
      captureFrequencyPerMinute: 10,
      maxSpeedMps: 50,
      validationScoreFloor: 0.3,
      gpsAccuracyThreshold: 50,
      penalties: {
        deviceChange: 0.1,
        trackingNotTracking: 0.2,
        lowLight: 0.1,
        lowAccuracy: 0.1,
      }
    };

    try {
      const settings = await Settings.findOne({}, { 'custom.antiCheat': 1 }).lean();
      const cfg = (settings as any)?.custom?.get?.('antiCheat') || (settings as any)?.custom?.antiCheat;
      if (cfg) {
        this.antiCheatCache = {
          captureFrequencyPerMinute: cfg.captureFrequencyPerMinute ?? defaults.captureFrequencyPerMinute,
          maxSpeedMps: cfg.maxSpeedMps ?? defaults.maxSpeedMps,
          validationScoreFloor: cfg.validationScoreFloor ?? defaults.validationScoreFloor,
          gpsAccuracyThreshold: cfg.gpsAccuracyThreshold ?? defaults.gpsAccuracyThreshold,
          penalties: {
            deviceChange: cfg.penalties?.deviceChange ?? defaults.penalties.deviceChange,
            trackingNotTracking: cfg.penalties?.trackingNotTracking ?? defaults.penalties.trackingNotTracking,
            lowLight: cfg.penalties?.lowLight ?? defaults.penalties.lowLight,
            lowAccuracy: cfg.penalties?.lowAccuracy ?? defaults.penalties.lowAccuracy,
          },
        };
        this.antiCheatFetchedAt = now;
        return this.antiCheatCache;
      }
    } catch (error) {
      typedLogger.warn('Anti-cheat settings load failed, using defaults', { error: (error as any).message });
    }

    this.antiCheatCache = defaults;
    this.antiCheatFetchedAt = now;
    return defaults;
  }

  /**
   * Calculate distance between two points
   */
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
}

export default async function captureRoutes(fastify: FastifyInstance): Promise<void> {
  // Attempt capture
  fastify.post('/attempt', {
    preHandler: [authenticate, claimsRateLimit],
    schema: {
      body: CaptureAttemptSchema
    }
  }, async (request: FastifyRequest<{ Body: z.infer<typeof CaptureAttemptSchema> }>, reply) => {
    try {
      const result = await CaptureService.attemptCapture(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Pre-validate capture
  fastify.post('/validate', {
    preHandler: [authenticate, claimsRateLimit],
    schema: {
      body: CaptureValidationSchema
    }
  }, async (request: FastifyRequest<{ Body: z.infer<typeof CaptureValidationSchema> }>, reply) => {
    try {
      const result = await CaptureService.preValidateCapture(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Get box animation
  fastify.get('/animation/:prizeId', {
    preHandler: [authenticate, claimsRateLimit],
    schema: {
      params: z.object({
        prizeId: z.string()
      })
    }
  }, async (request: FastifyRequest<{ Params: { prizeId: string } }>, reply) => {
    try {
      const result = await CaptureService.getBoxAnimation(request.params.prizeId);
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

}

