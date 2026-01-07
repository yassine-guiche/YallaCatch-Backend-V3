import { Types } from 'mongoose';
import { Claim } from '@/models/Claim';
import { User } from '@/models/User';
import { typedLogger } from '@/lib/typed-logger';
import { CacheService } from './cache';
import { redisPubSub, redisPublisher } from '@/config/redis';

/**
 * Anti-Cheat Monitoring Service
 * Provides real-time visibility into fraud detection and suspicious activities
 * Enables admin to monitor, review, and override anti-cheat decisions
 */

export interface FlaggedClaim {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  prizeId: Types.ObjectId;
  riskScore: number;
  riskFactors: string[];
  flaggedAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'overridden';
  adminNotes?: string;
  overriddenBy?: Types.ObjectId;
  overriddenAt?: Date;
  antiCheatDetails: {
    speedCheck?: { flag: boolean; riskScore: number };
    mockLocationDetection?: { flag: boolean; riskScore: number };
    teleportDetection?: { flag: boolean; riskScore: number };
    rapidClaimDetection?: { flag: boolean; riskScore: number };
    dailyLimitCheck?: { flag: boolean; riskScore: number };
    accuracyCheck?: { flag: boolean; riskScore: number };
  };
}

export interface UserRiskProfile {
  userId: Types.ObjectId;
  username: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskScore: number;
  flaggedClaimsCount: number;
  rejectedClaimsCount: number;
  totalClaimsCount: number;
  lastFlaggedAt?: Date;
  suspiciousPatterns: string[];
  recommendation: 'SAFE' | 'MONITOR' | 'RESTRICT' | 'BAN';
}

export interface AntiCheatMetrics {
  totalClaimsAnalyzed: number;
  flaggedClaimsCount: number;
  approvalRate: number;
  rejectionRate: number;
  overrideRate: number;
  topRiskFactors: Array<{ factor: string; count: number }>;
  riskScoreDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  topFlaggedUsers: UserRiskProfile[];
  lastUpdated: Date;
}

export class AntiCheatMonitoringService {
  private static readonly RISK_THRESHOLD = 50;
  private static readonly CRITICAL_THRESHOLD = 75;
  private static readonly MONITORING_CHANNEL = 'anti-cheat:alerts';
  private static readonly CACHE_KEY_PREFIX = 'anti-cheat:';

  /**
   * Get all flagged claims with optional filters
   */
  static async getFlaggedClaims(
    filters: {
      userId?: string;
      riskLevel?: 'high' | 'critical';
      status?: 'pending' | 'approved' | 'rejected' | 'overridden';
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ claims: FlaggedClaim[]; total: number }> {
    try {
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;

      const query: any = {};
      
      if (filters.userId) {
        query.userId = new Types.ObjectId(filters.userId);
      }

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.riskLevel === 'high') {
        query.riskScore = { $gte: this.RISK_THRESHOLD, $lt: this.CRITICAL_THRESHOLD };
      } else if (filters.riskLevel === 'critical') {
        query.riskScore = { $gte: this.CRITICAL_THRESHOLD };
      }

      const claims = await Claim.find(query)
        .sort({ flaggedAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean();

      const total = await Claim.countDocuments(query);

      return { claims: (claims as any) as FlaggedClaim[], total };
    } catch (error) {
      typedLogger.error('Failed to get flagged claims', { error });
      throw error;
    }
  }

  /**
   * Get detailed user risk profile
   */
  static async getUserRiskProfile(userId: string): Promise<UserRiskProfile | null> {
    try {
      const cacheKey = `${this.CACHE_KEY_PREFIX}user-risk:${userId}`;

      // Try cache first
      const cached = await CacheService.get<UserRiskProfile>(cacheKey);
      if (cached) {
        return cached;
      }

      const user = await User.findById(userId);
      if (!user) {
        return null;
      }

      // Get user's claims
      const userClaims = await Claim.find({ userId: new Types.ObjectId(userId) }).lean();
      const totalClaims = userClaims.length;

      // Filter flagged claims
      const flaggedClaims = userClaims.filter((c: any) => c.riskScore > 0);
      const flaggedCount = flaggedClaims.length;
      const rejectedCount = flaggedClaims.filter((c: any) => c.status === 'rejected').length;

      // Calculate average risk score
      const avgRiskScore = flaggedClaims.length > 0
        ? flaggedClaims.reduce((sum: number, c: any) => sum + (c.riskScore || 0), 0) /
          flaggedClaims.length
        : 0;

      // Determine risk level
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      if (avgRiskScore >= this.CRITICAL_THRESHOLD) {
        riskLevel = 'CRITICAL';
      } else if (avgRiskScore >= this.RISK_THRESHOLD) {
        riskLevel = 'HIGH';
      } else if (avgRiskScore >= 25) {
        riskLevel = 'MEDIUM';
      }

      // Identify suspicious patterns
      const suspiciousPatterns = this.identifySuspiciousPatterns(userClaims);

      // Generate recommendation
      const recommendation = this.generateRecommendation(
        riskLevel,
        rejectedCount,
        totalClaims,
        suspiciousPatterns
      );

      const profile: UserRiskProfile = {
        userId: new Types.ObjectId(userId),
        username: user.displayName || user.email || 'Unknown',
        riskLevel,
        riskScore: avgRiskScore,
        flaggedClaimsCount: flaggedCount,
        rejectedClaimsCount: rejectedCount,
        totalClaimsCount: totalClaims,
        lastFlaggedAt:
          flaggedClaims.length > 0
            ? new Date(Math.max(...flaggedClaims.map((c: any) => new Date(c.createdAt).getTime())))
            : undefined,
        suspiciousPatterns,
        recommendation,
      };

      // Cache the profile
      await CacheService.set(cacheKey, profile, {
        ttl: 3600, // 1 hour
        tags: ['anti-cheat', 'user-risk'],
      });

      return profile;
    } catch (error) {
      typedLogger.error('Failed to get user risk profile', { error, userId });
      throw error;
    }
  }

  /**
   * Get anti-cheat metrics and statistics
   */
  static async getMetrics(): Promise<AntiCheatMetrics> {
    try {
      const cacheKey = `${this.CACHE_KEY_PREFIX}metrics`;

      // Try cache first
      const cached = await CacheService.get<AntiCheatMetrics>(cacheKey);
      if (cached) {
        return cached;
      }

      // Get all claims
      const allClaims = await Claim.find({}).lean();
      const totalAnalyzed = allClaims.length;

      // Count by status
      const flaggedCount = allClaims.filter((c: any) => c.riskScore > 0).length;
      const rejectedCount = allClaims.filter((c: any) => c.status === 'rejected').length;
      const approvedCount = allClaims.filter((c: any) => c.status === 'approved').length;
      const overriddenCount = allClaims.filter((c: any) => c.status === 'overridden').length;

      // Calculate risk score distribution
      const riskDistribution = {
        low: allClaims.filter((c: any) => (c.riskScore || 0) < 25).length,
        medium: allClaims.filter((c: any) => (c.riskScore || 0) >= 25 && (c.riskScore || 0) < this.RISK_THRESHOLD).length,
        high: allClaims.filter((c: any) => (c.riskScore || 0) >= this.RISK_THRESHOLD && (c.riskScore || 0) < this.CRITICAL_THRESHOLD).length,
        critical: allClaims.filter((c: any) => (c.riskScore || 0) >= this.CRITICAL_THRESHOLD).length,
      };

      // Identify top risk factors
      const riskFactorCounts: { [key: string]: number } = {};
      allClaims.forEach((c: any) => {
        if (c.riskFactors && Array.isArray(c.riskFactors)) {
          c.riskFactors.forEach((factor: string) => {
            riskFactorCounts[factor] = (riskFactorCounts[factor] || 0) + 1;
          });
        }
      });

      const topRiskFactors = Object.entries(riskFactorCounts)
        .map(([factor, count]) => ({ factor, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Get top flagged users
      const userRisks: { [userId: string]: UserRiskProfile } = {};
      for (const claim of allClaims.filter((c: any) => c.riskScore > 0)) {
        const userId = (claim as any).userId?.toString();
        if (userId && !userRisks[userId]) {
          const profile = await this.getUserRiskProfile(userId);
          if (profile) {
            userRisks[userId] = profile;
          }
        }
      }

      const topFlaggedUsers = Object.values(userRisks)
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 10);

      const metrics: AntiCheatMetrics = {
        totalClaimsAnalyzed: totalAnalyzed,
        flaggedClaimsCount: flaggedCount,
        approvalRate: totalAnalyzed > 0 ? (approvedCount / totalAnalyzed) * 100 : 0,
        rejectionRate: totalAnalyzed > 0 ? (rejectedCount / totalAnalyzed) * 100 : 0,
        overrideRate: totalAnalyzed > 0 ? (overriddenCount / totalAnalyzed) * 100 : 0,
        topRiskFactors,
        riskScoreDistribution: riskDistribution,
        topFlaggedUsers,
        lastUpdated: new Date(),
      };

      // Cache metrics
      await CacheService.set(cacheKey, metrics, {
        ttl: 600, // 10 minutes
        tags: ['anti-cheat', 'metrics'],
      });

      return metrics;
    } catch (error) {
      typedLogger.error('Failed to get metrics', { error });
      throw error;
    }
  }

  /**
   * Override anti-cheat decision
   */
  static async overrideClaim(
    claimId: string,
    adminId: string,
    decision: 'approve' | 'reject',
    notes?: string
  ): Promise<FlaggedClaim | null> {
    try {
      typedLogger.info('Overriding claim anti-cheat decision', { claimId, adminId, decision });

      const claim = await Claim.findByIdAndUpdate(
        claimId,
        {
          status: decision === 'approve' ? 'approved' : 'rejected',
          overriddenBy: new Types.ObjectId(adminId),
          overriddenAt: new Date(),
          adminNotes: notes,
        },
        { new: true }
      ).lean();

      if (!claim) {
        throw new Error('Claim not found');
      }

      // Broadcast override event (use redisPublisher, not redisPubSub which is in subscriber mode)
      await redisPublisher.publish(
        this.MONITORING_CHANNEL,
        JSON.stringify({
          event: 'claim_overridden',
          claimId,
          decision,
          adminId,
          timestamp: new Date(),
        })
      );

      // Invalidate user risk cache
      const userId = (claim as any).userId?.toString();
      if (userId) {
        await CacheService.invalidate(`${this.CACHE_KEY_PREFIX}user-risk:${userId}`);
        await CacheService.invalidate(`${this.CACHE_KEY_PREFIX}metrics`);
      }

      return (claim as any) as FlaggedClaim;
    } catch (error) {
      typedLogger.error('Failed to override claim', { error, claimId });
      throw error;
    }
  }

  /**
   * Get fraud pattern analysis
   */
  static async analyzeFraudPatterns(): Promise<{
    patterns: Array<{
      name: string;
      description: string;
      affectedUsersCount: number;
      severity: 'low' | 'medium' | 'high' | 'critical';
    }>;
    recommendations: string[];
  }> {
    try {
      const allClaims = await Claim.find({}).lean();
      const patterns = [];

      // Pattern 1: Rapid consecutive claims
      const rapidClaimers = new Map<string, number>();
      allClaims.forEach((c: any) => {
        const userId = c.userId?.toString();
        if (userId) {
          rapidClaimers.set(userId, (rapidClaimers.get(userId) || 0) + 1);
        }
      });

      const rapidClaimCount = Array.from(rapidClaimers.values()).filter(
        (count) => count > 50
      ).length;

      if (rapidClaimCount > 0) {
        patterns.push({
          name: 'Rapid Claims',
          description: 'Users claiming prizes in rapid succession',
          affectedUsersCount: rapidClaimCount,
          severity: rapidClaimCount > 10 ? 'critical' : 'high',
        });
      }

      // Pattern 2: Geographic impossibilities
      const geographicPatterns = allClaims.filter((c: any) => 
        c.riskFactors?.includes('teleportDetection')
      ).length;

      if (geographicPatterns > 0) {
        patterns.push({
          name: 'Geographic Anomalies',
          description: 'Users with impossible movements (teleportation)',
          affectedUsersCount: geographicPatterns,
          severity: geographicPatterns > 20 ? 'critical' : 'high',
        });
      }

      // Pattern 3: Mock location usage
      const mockLocationCount = allClaims.filter((c: any) =>
        c.riskFactors?.includes('mockLocationDetection')
      ).length;

      if (mockLocationCount > 0) {
        patterns.push({
          name: 'Mock Location Detection',
          description: 'Users using location spoofing services',
          affectedUsersCount: mockLocationCount,
          severity: mockLocationCount > 30 ? 'critical' : 'high',
        });
      }

      const recommendations = [
        'Monitor flagged users with CRITICAL risk level closely',
        'Consider temporary ban for users with >75 avg risk score',
        'Implement additional location verification for high-risk regions',
        'Review and adjust anti-cheat thresholds based on false positive rate',
      ];

      return { patterns, recommendations };
    } catch (error) {
      typedLogger.error('Failed to analyze fraud patterns', { error });
      throw error;
    }
  }

  /**
   * Identify suspicious patterns from user claims
   */
  private static identifySuspiciousPatterns(claims: any[]): string[] {
    const patterns: Set<string> = new Set();

    // Check for rapid consecutive claims
    if (claims.length > 50) {
      patterns.add('Excessive claims volume');
    }

    // Check for geographic anomalies
    const teleportClaims = claims.filter((c) => c.riskFactors?.includes('teleportDetection'));
    if (teleportClaims.length > claims.length * 0.1) {
      patterns.add('Geographic anomalies');
    }

    // Check for mock location usage
    const mockLocationClaims = claims.filter((c) => c.riskFactors?.includes('mockLocationDetection'));
    if (mockLocationClaims.length > claims.length * 0.1) {
      patterns.add('Mock location usage detected');
    }

    // Check for speed violations
    const speedClaims = claims.filter((c) => c.riskFactors?.includes('speedCheck'));
    if (speedClaims.length > claims.length * 0.15) {
      patterns.add('Speed violations');
    }

    // Check for low GPS accuracy
    const accuracyClaims = claims.filter((c) => c.riskFactors?.includes('accuracyCheck'));
    if (accuracyClaims.length > claims.length * 0.2) {
      patterns.add('Consistently low GPS accuracy');
    }

    return Array.from(patterns);
  }

  /**
   * Generate recommendation based on risk profile
   */
  private static generateRecommendation(
    riskLevel: string,
    rejectedCount: number,
    totalCount: number,
    patterns: string[]
  ): 'SAFE' | 'MONITOR' | 'RESTRICT' | 'BAN' {
    // If critical risk and multiple suspicious patterns
    if (riskLevel === 'CRITICAL' && patterns.length >= 2) {
      return 'BAN';
    }

    // If high rejection rate
    if (totalCount > 10 && rejectedCount / totalCount > 0.3) {
      return 'RESTRICT';
    }

    // If high risk with patterns
    if ((riskLevel === 'HIGH' || riskLevel === 'CRITICAL') && patterns.length > 0) {
      return 'RESTRICT';
    }

    // If high risk
    if (riskLevel === 'HIGH') {
      return 'MONITOR';
    }

    // If medium risk with patterns
    if (riskLevel === 'MEDIUM' && patterns.length > 0) {
      return 'MONITOR';
    }

    return 'SAFE';
  }
}
