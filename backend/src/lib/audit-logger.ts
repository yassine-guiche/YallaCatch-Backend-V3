/**
 * Unified Audit Logger
 * 
 * Writes admin actions to BOTH:
 * - Pino logger (files/console) for debugging
 * - MongoDB AuditLog collection for admin dashboard display
 */

import { adminLogger } from './logger';
import { AuditLog } from '@/models/AuditLog';
import { typedLogger } from './typed-logger';

export interface AuditLogParams {
  // Who performed the action
  userId: string;
  userEmail?: string;
  userRole?: 'user' | 'moderator' | 'admin' | 'super_admin' | 'system';
  
  // What action was performed
  action: string;
  resource: string;
  resourceId?: string;
  
  // Context
  description?: string;
  category?: 'auth' | 'game' | 'admin' | 'system' | 'security' | 'business';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  
  // Additional data
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  
  // Result
  success?: boolean;
  errorMessage?: string;
}

/**
 * Log an admin action to both Pino and MongoDB
 */
export async function logAdminAction(params: AuditLogParams): Promise<void> {
  const {
    userId,
    userEmail,
    userRole = 'admin',
    action,
    resource,
    resourceId,
    description,
    category = 'admin',
    severity = 'low',
    metadata = {},
    ipAddress,
    userAgent,
    success = true,
    errorMessage,
  } = params;

  const timestamp = new Date();

  // 1. Log to Pino (files/console) for debugging
  adminLogger.info({
    action,
    adminId: userId,
    targetId: resourceId,
    resource,
    details: metadata,
    metadata: {
      userEmail,
      userRole,
      category,
      severity,
      success,
      ipAddress,
    },
    timestamp: timestamp.toISOString(),
  });

  // 2. Save to MongoDB AuditLog collection for admin dashboard
  try {
    const logEntry = {
      userId: userId || 'system',
      userEmail,
      userRole,
      action,
      resource,
      resourceId,
      description,
      category: category || 'admin', // Ensure category is always set (required)
      severity: severity || 'low',
      success: success !== undefined ? success : true, // Ensure success is always set (required)
      errorMessage,
      metadata,
      ipAddress,
      userAgent,
      timestamp,
    };
    
    console.log('[AUDIT] Creating AuditLog entry:', { action, resource, userId, category: logEntry.category, success: logEntry.success });
    
    const created = await AuditLog.create(logEntry);
    
    console.log('[AUDIT] AuditLog entry created successfully:', created._id?.toString());
  } catch (error: any) {
    // Log detailed error for debugging - use console.error to ensure visibility
    console.error('[AUDIT ERROR] Failed to save audit log to MongoDB:', {
      error: error?.message || error,
      errorName: error?.name,
      validationErrors: error?.errors ? Object.keys(error.errors).map(k => `${k}: ${error.errors[k].message}`) : null,
      action, 
      userId,
      resource,
      category,
      success,
    });
  }
}

/**
 * Quick helpers for common actions
 */
export const audit = {
  // Prize actions
  prizeCreated: (adminId: string, prizeId: string, prizeName: string, opts?: Partial<AuditLogParams>) =>
    logAdminAction({
      userId: adminId,
      action: 'CREATE_PRIZE',
      resource: 'prize',
      resourceId: prizeId,
      description: `Created prize: ${prizeName}`,
      metadata: { prizeName },
      ...opts,
    }),

  prizeUpdated: (adminId: string, prizeId: string, changes: string[], opts?: Partial<AuditLogParams>) =>
    logAdminAction({
      userId: adminId,
      action: 'UPDATE_PRIZE',
      resource: 'prize',
      resourceId: prizeId,
      description: `Updated prize fields: ${changes.join(', ')}`,
      metadata: { updatedFields: changes },
      ...opts,
    }),

  prizeDeleted: (adminId: string, prizeId: string, prizeName: string, opts?: Partial<AuditLogParams>) =>
    logAdminAction({
      userId: adminId,
      action: 'DELETE_PRIZE',
      resource: 'prize',
      resourceId: prizeId,
      severity: 'medium',
      description: `Deleted prize: ${prizeName}`,
      metadata: { prizeName },
      ...opts,
    }),

  batchPrizesCreated: (adminId: string, count: number, opts?: Partial<AuditLogParams>) =>
    logAdminAction({
      userId: adminId,
      action: 'BATCH_CREATE_PRIZES',
      resource: 'prize',
      description: `Created ${count} prizes in batch`,
      metadata: { count },
      ...opts,
    }),

  // User actions
  userBanned: (adminId: string, userId: string, details: { reason: string; duration?: number; bannedUntil?: Date; notifyUser?: boolean }, opts?: Partial<AuditLogParams>) =>
    logAdminAction({
      userId: adminId,
      action: 'USER_BANNED',
      resource: 'user',
      resourceId: userId,
      severity: 'medium',
      description: `Banned user: ${details.reason}`,
      metadata: { ...details, targetUserId: userId },
      ...opts,
    }),

  userUnbanned: (adminId: string, userId: string, opts?: Partial<AuditLogParams>) =>
    logAdminAction({
      userId: adminId,
      action: 'USER_UNBANNED',
      resource: 'user',
      resourceId: userId,
      severity: 'medium',
      description: 'Unbanned user',
      metadata: { targetUserId: userId },
      ...opts,
    }),

  pointsAdjusted: (adminId: string, userId: string, details: { points: number; reason: string; newBalance: number }, opts?: Partial<AuditLogParams>) =>
    logAdminAction({
      userId: adminId,
      action: details.points >= 0 ? 'POINTS_ADDED' : 'POINTS_DEDUCTED',
      resource: 'user',
      resourceId: userId,
      description: `${details.points >= 0 ? 'Added' : 'Deducted'} ${Math.abs(details.points)} points: ${details.reason}`,
      metadata: { ...details, targetUserId: userId },
      ...opts,
    }),

  // Auth actions
  adminLogin: (adminId: string, email: string, opts?: Partial<AuditLogParams>) =>
    logAdminAction({
      userId: adminId,
      userEmail: email,
      action: 'ADMIN_LOGIN',
      resource: 'auth',
      resourceId: adminId,
      category: 'auth',
      description: `Admin logged in: ${email}`,
      ...opts,
    }),

  adminLogout: (adminId: string, email: string, opts?: Partial<AuditLogParams>) =>
    logAdminAction({
      userId: adminId,
      userEmail: email,
      action: 'ADMIN_LOGOUT',
      resource: 'auth',
      resourceId: adminId,
      category: 'auth',
      description: `Admin logged out: ${email}`,
      ...opts,
    }),

  // Notification actions
  notificationSent: (adminId: string, type: string, recipientCount: number, opts?: Partial<AuditLogParams>) =>
    logAdminAction({
      userId: adminId,
      action: 'SEND_NOTIFICATION',
      resource: 'notification',
      description: `Sent ${type} notification to ${recipientCount} users`,
      metadata: { type, recipientCount },
      ...opts,
    }),

  // Claim actions
  claimApproved: (adminId: string, claimId: string, opts?: Partial<AuditLogParams>) =>
    logAdminAction({
      userId: adminId,
      action: 'APPROVE_CLAIM',
      resource: 'claim',
      resourceId: claimId,
      description: 'Approved claim',
      ...opts,
    }),

  claimRejected: (adminId: string, claimId: string, reason: string, opts?: Partial<AuditLogParams>) =>
    logAdminAction({
      userId: adminId,
      action: 'REJECT_CLAIM',
      resource: 'claim',
      resourceId: claimId,
      description: `Rejected claim: ${reason}`,
      metadata: { reason },
      ...opts,
    }),

  // Settings actions
  settingsUpdated: (adminId: string, settingKey: string, metadata?: Record<string, any>, opts?: Partial<AuditLogParams>) =>
    logAdminAction({
      userId: adminId,
      action: 'UPDATE_SETTINGS',
      resource: 'settings',
      resourceId: settingKey,
      description: `Updated setting: ${settingKey}`,
      metadata: { settingKey, ...(metadata || {}) },
      ...opts,
    }),

  // Generic action - supports both object and positional arguments
  custom: (
    adminIdOrParams: string | AuditLogParams,
    action?: string,
    resource?: string,
    resourceId?: string,
    metadata?: Record<string, any>
  ) => {
    // If first arg is an object, use it as full params
    if (typeof adminIdOrParams === 'object') {
      return logAdminAction(adminIdOrParams);
    }
    // Otherwise, use positional arguments
    return logAdminAction({
      userId: adminIdOrParams,
      action: action || 'CUSTOM_ACTION',
      resource: resource || 'unknown',
      resourceId,
      metadata,
    });
  },
};

export default audit;
