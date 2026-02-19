import { z } from 'zod';
import { Types } from 'mongoose';
import {
    OfflineQueue,
    OfflineActionType,
    OfflineActionStatus,
    ConflictResolution
} from '@/models/OfflineQueue';
import { User } from '@/models/User';
import { Prize } from '@/models/Prize';
import { Claim } from '@/models/Claim';
import { typedLogger } from '@/lib/typed-logger';
import { ClaimsService } from '@/modules/claims';
import { syncActionsSchema, getSyncStatusSchema } from './offline.schema';

/**
 * Offline Service (Enhanced)
 */
export class OfflineService {
    /**
     * Sync offline actions
     */
    static async syncActions(
        userId: string,
        data: z.infer<typeof syncActionsSchema>
    ) {
        try {
            const results = {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                synced: [] as any[],
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                failed: [] as any[],
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                conflicts: [] as any[]
            };

            for (const action of data.actions) {
                try {
                    // Create queue entry
                    const queueEntry = new OfflineQueue({
                        userId: new Types.ObjectId(userId),
                        actionType: action.actionType as OfflineActionType,
                        actionData: action.actionData,
                        status: OfflineActionStatus.SYNCING,
                        clientTimestamp: new Date(action.clientTimestamp),
                        serverTimestamp: new Date(),
                        attempts: 1,
                        metadata: action.metadata
                    });

                    // Process action based on type
                    const result = await this.processAction(
                        userId,
                        action.actionType as OfflineActionType,
                        action.actionData,
                        data.conflictResolution as ConflictResolution
                    );

                    if (result.success) {
                        queueEntry.status = OfflineActionStatus.SYNCED;
                        queueEntry.syncedAt = new Date();
                        results.synced.push({
                            actionType: action.actionType,
                            result: result.data
                        });
                    } else if (result.conflict) {
                        queueEntry.status = OfflineActionStatus.CONFLICT;
                        queueEntry.conflict = {
                            serverData: result.serverData,
                            clientData: result.clientData,
                            resolution: data.conflictResolution as ConflictResolution,
                            resolvedData: result.resolvedData
                        };
                        results.conflicts.push({
                            actionType: action.actionType,
                            conflict: queueEntry.conflict
                        });
                    } else {
                        queueEntry.status = OfflineActionStatus.FAILED;
                        queueEntry.error = {
                            code: result.error?.code || 'UNKNOWN_ERROR',
                            message: result.error?.message || 'Unknown error',
                            details: result.error?.details
                        };
                        results.failed.push({
                            actionType: action.actionType,
                            error: queueEntry.error
                        });
                    }

                    await queueEntry.save();

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (error: any) {
                    results.failed.push({
                        actionType: action.actionType,
                        error: {
                            code: 'PROCESSING_ERROR',
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            message: (error as any).message
                        }
                    });
                }
            }

            typedLogger.info('Offline actions synced', {
                userId,
                total: data.actions.length,
                synced: results.synced.length,
                failed: results.failed.length,
                conflicts: results.conflicts.length
            });

            return results;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            typedLogger.error('Sync actions error', {
                userId,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                error: (error as any).message
            });
            throw error;
        }
    }

    /**
     * Process individual action
     */
    private static async processAction(
        userId: string,
        actionType: OfflineActionType,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        actionData: any,
        conflictResolution: ConflictResolution
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        // SECURITY HARDENING: Force SERVER_WINS for critical actions
        // This prevents hacked clients from overriding server state for prizes/rewards
        let resolution = conflictResolution;
        const criticalActions = [
            OfflineActionType.CLAIM_PRIZE,
            OfflineActionType.PURCHASE_ITEM,
            OfflineActionType.UNLOCK_ACHIEVEMENT
        ];

        if (criticalActions.includes(actionType)) {
            resolution = ConflictResolution.SERVER_WINS;
        }

        switch (actionType) {
            case OfflineActionType.CLAIM_PRIZE:
                return await this.processClaim(userId, actionData, resolution);

            case OfflineActionType.UPDATE_PROFILE:
                return await this.processProfileUpdate(userId, actionData, resolution);

            case OfflineActionType.SEND_FRIEND_REQUEST:
                return await this.processFriendRequest(userId, actionData);

            default:
                return {
                    success: false,
                    error: {
                        code: 'UNSUPPORTED_ACTION',
                        message: `Action type ${actionType} not supported`
                    }
                };
        }
    }

    /**
     * Process claim with conflict detection
     */
    private static async processClaim(
        userId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        actionData: any,
        conflictResolution: ConflictResolution
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        try {
            // Check if claim already exists (idempotency)
            const existingClaim = await Claim.findOne({
                userId: new Types.ObjectId(userId),
                prizeId: new Types.ObjectId(actionData.prizeId)
            });

            if (existingClaim) {
                // Conflict detected
                if (conflictResolution === ConflictResolution.SERVER_WINS) {
                    return {
                        success: true,
                        data: existingClaim,
                        conflict: false
                    };
                } else {
                    return {
                        success: false,
                        conflict: true,
                        serverData: existingClaim,
                        clientData: actionData,
                        resolvedData: existingClaim, // Server wins by default
                    };
                }
            }

            // Process claim normally
            const result = await ClaimsService.claimPrize(userId, actionData);

            return {
                success: true,
                data: result,
                conflict: false
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            return {
                success: false,
                error: {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    code: (error as any).message,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    message: (error as any).message,
                    details: error
                }
            };
        }
    }

    /**
     * Process profile update with conflict detection
     */
    private static async processProfileUpdate(
        userId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        actionData: any,
        conflictResolution: ConflictResolution
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        try {
            const user = await User.findById(userId);

            if (!user) {
                return {
                    success: false,
                    error: {
                        code: 'USER_NOT_FOUND',
                        message: 'User not found'
                    }
                };
            }

            // Check for conflicts
            const serverUpdatedAt = user.updatedAt;
            const clientUpdatedAt = new Date(actionData.updatedAt || 0);

            if (serverUpdatedAt > clientUpdatedAt) {
                // Conflict detected
                if (conflictResolution === ConflictResolution.SERVER_WINS) {
                    return {
                        success: true,
                        data: user,
                        conflict: false
                    };
                } else if (conflictResolution === ConflictResolution.CLIENT_WINS) {
                    // Apply client changes
                    Object.assign(user, actionData.updates);
                    await user.save();
                    return {
                        success: true,
                        data: user,
                        conflict: false
                    };
                } else {
                    // Merge strategy
                    return {
                        success: false,
                        conflict: true,
                        serverData: user,
                        clientData: actionData,
                        resolvedData: user, // Server wins by default
                    };
                }
            }

            // No conflict, apply changes
            Object.assign(user, actionData.updates);
            await user.save();

            return {
                success: true,
                data: user,
                conflict: false
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            return {
                success: false,
                error: {
                    code: 'UPDATE_ERROR',
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    message: (error as any).message
                }
            };
        }
    }

    /**
     * Process friend request
     */
    private static async processFriendRequest(
        userId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        actionData: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ): Promise<any> {
        // Implementation would go here
        return {
            success: true,
            data: { message: 'Friend request sent' },
            conflict: false
        };
    }

    /**
     * Get sync status
     */
    static async getSyncStatus(
        userId: string,
        data: z.infer<typeof getSyncStatusSchema>
    ) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const query: any = {
                userId: new Types.ObjectId(userId)
            };

            if (data.since) {
                query.createdAt = { $gte: new Date(data.since) };
            }

            const [pending, syncing, synced, failed, conflicts] = await Promise.all([
                OfflineQueue.countDocuments({ ...query, status: OfflineActionStatus.PENDING }),
                OfflineQueue.countDocuments({ ...query, status: OfflineActionStatus.SYNCING }),
                OfflineQueue.countDocuments({ ...query, status: OfflineActionStatus.SYNCED }),
                OfflineQueue.countDocuments({ ...query, status: OfflineActionStatus.FAILED }),
                OfflineQueue.countDocuments({ ...query, status: OfflineActionStatus.CONFLICT })
            ]);

            const recentActions = await OfflineQueue.find(query)
                .sort({ createdAt: -1 })
                .limit(20)
                .select('actionType status clientTimestamp syncedAt error conflict');

            return {
                status: {
                    pending,
                    syncing,
                    synced,
                    failed,
                    conflicts,
                    total: pending + syncing + synced + failed + conflicts
                },
                recentActions
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            typedLogger.error('Get sync status error', {
                userId,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                error: (error as any).message
            });
            throw error;
        }
    }

    /**
     * Get offline data package for Unity (download data for offline play)
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static async getOfflineDataPackage(userId: string, request: any) {
        try {
            const { location, dataTypes = ['prizes'], maxItems = 100 } = request;
            const user = await User.findById(userId);

            if (!user) throw new Error('USER_NOT_FOUND');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const offlinePackage: any = {
                userId,
                packageId: `offline_${userId}_${Date.now()}`,
                location,
                generatedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                data: {},
                metadata: {
                    version: '1.0',
                    totalItems: 0,
                    estimatedSize: 0
                }
            };

            // Get prizes data
            if (dataTypes.includes('prizes')) {
                const prizes = await this.getOfflinePrizes(location, maxItems, userId);
                offlinePackage.data.prizes = prizes;
                offlinePackage.metadata.totalItems += prizes.length;
            }

            // Get challenges data
            if (dataTypes.includes('challenges')) {
                const challenges = await this.getOfflineChallenges(userId);
                offlinePackage.data.challenges = challenges;
                offlinePackage.metadata.totalItems += challenges.length;
            }

            // Get leaderboard data
            if (dataTypes.includes('leaderboard')) {
                const leaderboard = await this.getOfflineLeaderboard();
                offlinePackage.data.leaderboard = leaderboard;
                offlinePackage.metadata.totalItems += leaderboard.length;
            }

            // Add user-specific data
            offlinePackage.data.user = {
                id: user._id,
                displayName: user.displayName,
                level: user.level,
                points: user.points,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                stats: user.stats || {}
            };

            offlinePackage.metadata.estimatedSize = JSON.stringify(offlinePackage).length;

            typedLogger.info('Offline package generated', {
                userId,
                packageId: offlinePackage.packageId,
                totalItems: offlinePackage.metadata.totalItems
            });

            return offlinePackage;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            typedLogger.error('Get offline data package error', { error: (error as any).message, userId });
            throw error;
        }
    }

    /**
     * Get offline capabilities and limits
     */
    static async getOfflineCapabilities(userId: string) {
        try {
            const user = await User.findById(userId);
            if (!user) throw new Error('USER_NOT_FOUND');

            const capabilities = {
                maxOfflineDuration: 7 * 24 * 60 * 60 * 1000,
                maxOfflineActions: 1000,
                maxDataPackageSize: 10 * 1024 * 1024,
                supportedActions: [
                    'claim_prize',
                    'update_profile',
                    'send_friend_request',
                    'accept_friend_request',
                    'purchase_item',
                    'unlock_achievement'
                ],
                syncInterval: 5 * 60 * 1000,
                conflictResolution: {
                    strategy: 'server_wins',
                    allowUserChoice: true
                },
                dataTypes: {
                    prizes: {
                        maxRadius: 50,
                        maxItems: 500,
                        cacheDuration: 24 * 60 * 60 * 1000
                    },
                    challenges: {
                        maxItems: 50,
                        cacheDuration: 24 * 60 * 60 * 1000
                    },
                    leaderboard: {
                        maxItems: 100,
                        cacheDuration: 30 * 60 * 1000
                    }
                }
            };

            return capabilities;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            typedLogger.error('Get offline capabilities error', { error: (error as any).message, userId });
            throw error;
        }
    }

    /**
     * Validate offline action
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static async validateOfflineAction(action: any, deviceInfo: any) {
        try {
            const validation = {
                isValid: true,
                errors: [] as string[],
                warnings: [] as string[]
            };

            // Check timestamp validity
            const actionTime = new Date(action.timestamp);
            const now = new Date();
            const maxOfflineTime = 7 * 24 * 60 * 60 * 1000;

            if (actionTime > now) {
                validation.isValid = false;
                validation.errors.push('Action timestamp is in the future');
            }

            if (now.getTime() - actionTime.getTime() > maxOfflineTime) {
                validation.isValid = false;
                validation.errors.push('Action is too old (>7 days)');
            }

            // Validate action data based on type
            switch (action.type) {
                case 'claim_prize':
                    if (!action.data.prizeId || !action.data.location) {
                        validation.isValid = false;
                        validation.errors.push('Missing required fields for prize claim');
                    }
                    break;

                case 'update_profile':
                    if (!action.data.updates) {
                        validation.isValid = false;
                        validation.errors.push('Missing profile updates');
                    }
                    break;
            }

            return validation;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            typedLogger.error('Validate offline action error', { error: (error as any).message, action });
            return {
                isValid: false,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                errors: ['Validation error: ' + (error as any).message],
                warnings: []
            };
        }
    }

    /**
     * Helper: Get offline prizes
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static async getOfflinePrizes(location: any, maxItems: number, userId: string) {
        try {
            const prizes = await Prize.find({
                status: 'active',
                'location.coordinates': {
                    $geoWithin: {
                        $centerSphere: [
                            [location.longitude, location.latitude],
                            location.radius / 6378.1
                        ]
                    }
                }
            })
                .select('title description category points rarity location expiresAt')
                .limit(maxItems)
                .lean();

            const userClaims = await Claim.find({ userId }).select('prizeId').lean();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const claimedPrizeIds = new Set(userClaims.map((claim: any) => claim.prizeId.toString()));

            return prizes
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .filter((prize: any) => !claimedPrizeIds.has(prize._id.toString()))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((prize: any) => ({
                    id: prize._id.toString(),
                    title: prize.title,
                    description: prize.description,
                    category: prize.category,
                    points: prize.points,
                    rarity: prize.rarity,
                    position: {
                        lat: prize.location.coordinates[1],
                        lng: prize.location.coordinates[0]
                    },
                    expiresAt: prize.expiresAt?.toISOString(),
                    offlineClaimable: true
                }));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            typedLogger.error('Get offline prizes error', { error: (error as any).message, location });
            return [];
        }
    }

    /**
     * Helper: Get offline challenges
     */
    private static async getOfflineChallenges(userId: string) {
        try {
            return [
                {
                    id: 'offline_distance',
                    title: 'Distance Walker',
                    description: 'Walk 2km while playing',
                    type: 'distance',
                    target: 2000,
                    progress: 0,
                    reward: 75,
                    offlineSupported: true
                },
                {
                    id: 'offline_exploration',
                    title: 'Explorer',
                    description: 'Visit 5 different locations',
                    type: 'exploration',
                    target: 5,
                    progress: 0,
                    reward: 50,
                    offlineSupported: true
                }
            ];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            typedLogger.error('Get offline challenges error', { error: (error as any).message, userId });
            return [];
        }
    }

    /**
     * Helper: Get offline leaderboard
     */
    private static async getOfflineLeaderboard() {
        try {
            const topUsers = await User.find({ isBanned: false })
                .select('displayName level points')
                .sort({ points: -1 })
                .limit(50)
                .lean();

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return topUsers.map((user: any, index: number) => ({
                rank: index + 1,
                userId: user._id.toString(),
                displayName: user.displayName,
                level: user.level,
                points: user.points
            }));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            typedLogger.error('Get offline leaderboard error', { error: (error as any).message });
            return [];
        }
    }

    /**
     * Retry failed actions
     */
    static async retryFailedActions(userId: string) {
        try {
            const failedActions = await OfflineQueue.find({
                userId: new Types.ObjectId(userId),
                status: OfflineActionStatus.FAILED,
                attempts: { $lt: 3 }
            }).limit(10);

            const results = [];

            for (const action of failedActions) {
                action.status = OfflineActionStatus.SYNCING;
                action.attempts += 1;
                await action.save();

                const result = await this.processAction(
                    userId,
                    action.actionType,
                    action.actionData,
                    ConflictResolution.SERVER_WINS
                );

                if (result.success) {
                    action.status = OfflineActionStatus.SYNCED;
                    action.syncedAt = new Date();
                } else {
                    action.status = OfflineActionStatus.FAILED;
                    action.error = result.error;
                }

                await action.save();
                results.push({
                    actionType: action.actionType,
                    success: result.success
                });
            }

            return {
                retried: results.length,
                results
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            typedLogger.error('Retry failed actions error', {
                userId,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                error: (error as any).message
            });
            throw error;
        }
    }
}
