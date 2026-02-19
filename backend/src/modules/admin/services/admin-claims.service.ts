import { Types } from 'mongoose';
import { Claim } from '@/models';
import { Report } from '@/models/Report';
import { audit } from '@/lib/audit-logger';
import { typedLogger } from '@/lib/typed-logger';

export class AdminClaimsService {
  private static async logAction(
    adminId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    details: Record<string, unknown>
  ): Promise<void> {
    // Use unified audit logger - writes to both Pino and MongoDB
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action,
      resource: resourceType,
      resourceId,
      category: 'admin',
      severity: 'low',
      metadata: details,
    });
  }

  static async getClaims(options: {
    page?: number;
    limit?: number;
    status?: string;
    userId?: string;
    prizeId?: string;
    startDate?: Date | string;
    endDate?: Date | string;
  }) {
    const { page = 1, limit = 20, status, userId, prizeId, startDate, endDate } = options;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {};

    if (status) {
      query.status = status;
    }
    if (userId) {
      query.userId = new Types.ObjectId(userId);
    }
    if (prizeId) {
      query.prizeId = new Types.ObjectId(prizeId);
    }
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    if (start || end) {
      query.claimedAt = {};
      if (start) {
        (query.claimedAt as Record<string, Date>).$gte = start;
      }
      if (end) {
        (query.claimedAt as Record<string, Date>).$lte = end;
      }
    }

    const [claims, total] = await Promise.all([
      Claim.find(query)
        .populate('userId', 'username email avatar')
        .populate('prizeId', 'title type pointValue')
        .sort({ claimedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Claim.countDocuments(query)
    ]);

    return {
      claims,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  static async getClaim(claimId: string) {
    const claim = await Claim.findById(claimId)
      .populate('userId', 'username email avatar stats')
      .populate('prizeId', 'title type pointValue description location')
      .lean();

    if (!claim) {
      throw new Error('Claim not found');
    }

    return claim;
  }

  static async validateClaim(
    adminId: string,
    claimId: string,
    isValid: boolean,
    reason?: string
  ) {
    const claim = await Claim.findById(claimId);

    if (!claim) {
      throw new Error('Claim not found');
    }

    if (!claim.metadata) {
      claim.metadata = {};
    }

    claim.metadata.adminValidation = {
      isValid,
      validatedBy: new Types.ObjectId(adminId),
      validatedAt: new Date(),
      reason: reason || undefined
    };

    await claim.save();

    await this.logAction(adminId, 'VALIDATE_CLAIM', 'claim', claimId, {
      isValid,
      reason
    });

    typedLogger.info('Claim validated', { claimId, isValid, adminId });

    return claim;
  }

  static async rejectClaim(adminId: string, claimId: string, reason: string) {
    const claim = await Claim.findById(claimId);

    if (!claim) {
      throw new Error('Claim not found');
    }

    claim.set('status', 'rejected');
    if (!claim.metadata) {
      claim.metadata = {};
    }
    claim.metadata.rejectionReason = reason;
    claim.metadata.rejectedBy = new Types.ObjectId(adminId);
    claim.metadata.rejectedAt = new Date();

    await claim.save();

    await this.logAction(adminId, 'REJECT_CLAIM', 'claim', claimId, {
      reason
    });

    typedLogger.info('Claim rejected', { claimId, reason, adminId });

    return claim;
  }

  static async getClaimsStats(options: { startDate?: Date; endDate?: Date } = {}) {
    const { startDate, endDate } = options;

    const matchStage: Record<string, unknown> = {};
    if (startDate || endDate) {
      matchStage.claimedAt = {};
      if (startDate) {
        (matchStage.claimedAt as Record<string, Date>).$gte = startDate;
      }
      if (endDate) {
        (matchStage.claimedAt as Record<string, Date>).$lte = endDate;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline: any[] = [];
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    pipeline.push({
      $group: {
        _id: null,
        totalClaims: { $sum: 1 },
        totalPoints: { $sum: '$pointsAwarded' },
        avgDistance: { $avg: '$distance' },
        validClaims: {
          $sum: {
            $cond: [{ $eq: ['$metadata.adminValidation.isValid', true] }, 1, 0]
          }
        },
        rejectedClaims: {
          $sum: {
            $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0]
          }
        }
      }
    });

    const result = await Claim.aggregate(pipeline);

    return result[0] || {
      totalClaims: 0,
      totalPoints: 0,
      avgDistance: 0,
      validClaims: 0,
      rejectedClaims: 0
    };
  }

  static async getClaimsAnalytics(period: string) {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const pipeline = [
      {
        $match: {
          claimedAt: { $gte: startDate, $lte: now }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: period === 'day' ? '%Y-%m-%d-%H' : '%Y-%m-%d',
              date: '$claimedAt'
            }
          },
          count: { $sum: 1 },
          points: { $sum: '$pointsAwarded' }
        }
      },
      {
        $sort: { _id: 1 as const }
      }
    ];

    const analytics = await Claim.aggregate(pipeline);

    return {
      period,
      startDate,
      endDate: now,
      data: analytics
    };
  }

  static async getCaptureReports(options: {
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const query: Record<string, unknown> = {
      type: 'capture'
    };

    if (status) {
      query.status = status;
    }

    const [reports, total] = await Promise.all([
      Report.find(query)
        .populate('reporterId', 'username email')
        .populate('targetId', 'title type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Report.countDocuments(query)
    ]);

    return {
      reports,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
}

export default AdminClaimsService;
