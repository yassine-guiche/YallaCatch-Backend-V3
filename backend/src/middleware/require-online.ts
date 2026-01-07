import { FastifyRequest, FastifyReply } from 'fastify';
import { User } from '@/models';
import { logger } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';

/**
 * Middleware to ensure user is online before performing certain actions
 * 
 * This middleware checks if:
 * 1. User has synced recently (within last 5 minutes)
 * 2. User is not in offline mode
 * 
 * Use this middleware for actions that require real-time connectivity:
 * - Marketplace purchases
 * - Reward redemptions
 * - Point transfers
 * - Real-time competitions
 */
export async function requireOnline(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const userId = request.user?.sub;
    
    if (!userId) {
      return reply.code(401).send({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
    }

    // Fetch user to check online status
    const user = await User.findById(userId).select('lastSync offlineMode');
    
    if (!user) {
      return reply.code(404).send({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    // Check if user is in offline mode
    if (user.offlineMode) {
      typedLogger.warn('Offline user attempted online-only action', {
        userId,
        path: request.url,
        method: request.method,
      });

      return reply.code(403).send({
        success: false,
        error: 'Cette action nécessite une connexion internet active',
        code: 'OFFLINE_NOT_ALLOWED',
        message: {
          en: 'This action requires an active internet connection',
          fr: 'Cette action nécessite une connexion internet active',
          ar: 'يتطلب هذا الإجراء اتصالاً نشطًا بالإنترنت',
        },
      });
    }

    // Check if last sync was recent (within 5 minutes)
    const SYNC_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds
    const lastSyncTime = user.lastSync ? new Date(user.lastSync).getTime() : 0;
    const now = Date.now();

    if (now - lastSyncTime > SYNC_THRESHOLD) {
      typedLogger.warn('User sync too old for online-only action', {
        userId,
        lastSync: user.lastSync,
        timeSinceSync: now - lastSyncTime,
        path: request.url,
      });

      return reply.code(403).send({
        success: false,
        error: 'Veuillez synchroniser votre application avant de continuer',
        code: 'SYNC_REQUIRED',
        message: {
          en: 'Please sync your app before continuing',
          fr: 'Veuillez synchroniser votre application avant de continuer',
          ar: 'يرجى مزامنة تطبيقك قبل المتابعة',
        },
        lastSync: user.lastSync,
      });
    }

    // User is online and synced - proceed
    typedLogger.debug('Online check passed', {
      userId,
      lastSync: user.lastSync,
    });

  } catch (error) {
    typedLogger.error('Error in requireOnline middleware', {
      error,
      userId: request.user?.sub,
    });

    return reply.code(500).send({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
  return undefined;
}

/**
 * Decorator to add requireOnline to Fastify instance
 */
export function registerRequireOnline(fastify: any) {
  fastify.decorate('requireOnline', requireOnline);
}

