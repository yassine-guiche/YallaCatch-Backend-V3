import { Connection } from 'mongoose';
import { logger } from '@/lib/logger';
import typedLogger from '@/lib/typed-logger';

/**
 * Migration: Add production fields to existing notifications
 * This migration adds the new production-level fields to existing notifications
 */
export async function up(db: Connection) {
  try {
    typedLogger.info('Starting notification schema migration');

    // Get the notifications collection
    const notificationsCollection = db.collection('notifications');

    // Update all existing notifications to include default values for new fields
    const result = await notificationsCollection.updateMany(
      {}, // Match all documents
      {
        $set: {
          // Set default values for new required fields
          deliveryMethod: { $ifNull: ['$deliveryMethod', 'all'] },
          
          // Set default values for optional fields if they don't exist
          priority: { $ifNull: ['$priority', 3] },
          channelPreferences: { $ifNull: ['$channelPreferences', {}] },
          
          // Initialize statistics if not present
          statistics: {
            totalTargets: { $ifNull: [{ $ifNull: ['$statistics.totalTargets', 0] }, 0] },
            deliveredCount: { $ifNull: [{ $ifNull: ['$statistics.deliveredCount', 0] }, 0] },
            openedCount: { $ifNull: [{ $ifNull: ['$statistics.openedCount', 0] }, 0] },
            clickedCount: { $ifNull: [{ $ifNull: ['$statistics.clickedCount', 0] }, 0] }
          }
        }
      }
    );

    typedLogger.info('Notification schema migration completed', {
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount
    });

    return result;
  } catch (error) {
    typedLogger.error('Notification schema migration failed', { error: (error as any).message });
    throw error;
  }
}

/**
 * Rollback: Remove the added fields (optional - sometimes it's better to keep them)
 */
export async function down(db: Connection) {
  try {
    typedLogger.info('Rolling back notification schema migration');

    const notificationsCollection = db.collection('notifications');

    // Remove the newly added fields
    const result = await notificationsCollection.updateMany(
      {},
      {
        $unset: [
          'priority',
          'expiresAt',
          'deliveryMethod',
          'channelPreferences',
          'statistics.totalTargets',
          'statistics.deliveredCount',
          'statistics.openedCount',
          'statistics.clickedCount',
          'statistics' // Remove the entire statistics object
        ]
      }
    );

    typedLogger.info('Notification schema rollback completed', {
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount
    });

    return result;
  } catch (error) {
    typedLogger.error('Notification schema rollback failed', { error: (error as any).message });
    throw error;
  }
}

export default { up, down };