import { Types } from 'mongoose';
import { User } from '@/models/User';
import { Prize } from '@/models/Prize';
import { Claim } from '@/models/Claim';
import { Reward } from '@/models/Reward';
import { Redemption } from '@/models/Redemption';
import { AuditLog } from '@/models/AuditLog';
import { typedLogger } from '@/lib/typed-logger';
import { audit } from '@/lib/audit-logger';

interface AuditLogOptions {
  page?: number;
  limit?: number;
  adminId?: string;
  action?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
}

interface DashboardStats {
  users: { total: number; active: number; new: number };
  prizes: { total: number; active: number; captured: number };
  claims: { total: number; pending: number; approved: number; rejected: number };
  rewards: { total: number; active: number };
  redemptions: { total: number; pending: number; completed: number };
}

interface AggregationResult {
  [key: string]: { count: number }[];
}

export class AdminService {
  static async getDashboardStats(): Promise<DashboardStats> {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [users, prizes, claims, rewards, redemptions] = await Promise.all([
        User.aggregate([
          {
            $facet: {
              total: [{ $count: 'count' }],
              active: [{ $match: { isActive: true } }, { $count: 'count' }],
              new: [{ $match: { createdAt: { $gte: thirtyDaysAgo } } }, { $count: 'count' }],
            },
          },
        ]),
        Prize.aggregate([
          {
            $facet: {
              total: [{ $count: 'count' }],
              active: [{ $match: { status: 'active' } }, { $count: 'count' }],
              captured: [{ $match: { status: 'captured' } }, { $count: 'count' }],
            },
          },
        ]),
        Claim.aggregate([
          {
            $facet: {
              total: [{ $count: 'count' }],
              pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
              approved: [{ $match: { status: 'approved' } }, { $count: 'count' }],
              rejected: [{ $match: { status: 'rejected' } }, { $count: 'count' }],
            },
          },
        ]),
        Reward.aggregate([
          {
            $facet: {
              total: [{ $count: 'count' }],
              active: [{ $match: { isActive: true } }, { $count: 'count' }],
            },
          },
        ]),
        Redemption.aggregate([
          {
            $facet: {
              total: [{ $count: 'count' }],
              pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
              completed: [{ $match: { status: 'completed' } }, { $count: 'count' }],
            },
          },
        ]),
      ]);

      const extractCount = (result: AggregationResult[], key: string): number =>
        result[0]?.[key]?.[0]?.count ?? 0;

      return {
        users: {
          total: extractCount(users, 'total'),
          active: extractCount(users, 'active'),
          new: extractCount(users, 'new'),
        },
        prizes: {
          total: extractCount(prizes, 'total'),
          active: extractCount(prizes, 'active'),
          captured: extractCount(prizes, 'captured'),
        },
        claims: {
          total: extractCount(claims, 'total'),
          pending: extractCount(claims, 'pending'),
          approved: extractCount(claims, 'approved'),
          rejected: extractCount(claims, 'rejected'),
        },
        rewards: {
          total: extractCount(rewards, 'total'),
          active: extractCount(rewards, 'active'),
        },
        redemptions: {
          total: extractCount(redemptions, 'total'),
          pending: extractCount(redemptions, 'pending'),
          completed: extractCount(redemptions, 'completed'),
        },
      };
    } catch (error) {
      typedLogger.error('Failed to get dashboard stats', { error });
      throw error;
    }
  }

  static async getAuditLogs(options: AuditLogOptions = {}) {
    try {
      const { page = 1, limit = 20, adminId, action, resource, startDate, endDate } = options;

      const filter: Record<string, unknown> = {};

      // AuditLog schema uses userId, not adminId
      if (adminId) {
        filter.userId = adminId;
      }
      if (action) {
        filter.action = action;
      }
      if (resource) {
        filter.resource = resource;
      }
      if (startDate || endDate) {
        const dateFilter: Record<string, Date> = {};
        if (startDate) dateFilter.$gte = startDate;
        if (endDate) dateFilter.$lte = endDate;
        filter.createdAt = dateFilter;
      }

      const skip = (page - 1) * limit;

      const [logs, total] = await Promise.all([
        AuditLog.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments(filter),
      ]);

      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      typedLogger.error('Failed to get audit logs', { error });
      throw error;
    }
  }

  /**
   * @deprecated Use audit.custom() from '@/lib/audit-logger' instead.
   * This method is kept for backwards compatibility only.
   * The unified audit logger writes to BOTH Pino and MongoDB.
   */
  static async logAdminAction(
    adminId: string | Types.ObjectId,
    action: string,
    resource: string,
    resourceId?: string | Types.ObjectId,
    metadata?: Record<string, unknown>,
    _ip?: string,
    _userAgent?: string
  ) {
    // Delegate to the unified audit logger
    return audit.custom(adminId.toString(), action, resource, resourceId?.toString(), metadata);
  }
}

export default AdminService;
