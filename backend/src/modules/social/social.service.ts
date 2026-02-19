import { Types } from 'mongoose';
import { User } from '@/models/User';
import { Friendship, FriendshipStatus } from '@/models/Friendship';
import { redisClient } from '@/config/redis';
import { typedLogger } from '@/lib/typed-logger';
import { normalizeError } from '@/utils/api-errors';
import {
    FriendRequestData,
    TeamCreateData,
    SocialChallengeData,
    LocationData,
    UserProfile,
    NearbyPlayer
} from './social.types';

export class SocialService {
    private static redis = redisClient;

    /**
     * Send friend request
     */
    static async sendFriendRequest(fromUserId: string, data: FriendRequestData) {
        try {
            const { targetUserId, message } = data;

            // Check if users exist
            const [fromUser, targetUser] = await Promise.all([
                User.findById(fromUserId),
                User.findById(targetUserId)]);

            if (!fromUser || !targetUser) {
                throw new Error('USER_NOT_FOUND');
            }

            if (fromUserId === targetUserId) {
                throw new Error('CANNOT_ADD_SELF');
            }

            // Check if already friends or request exists using Friendship model
            const friendshipExists = await Friendship.findOne({
                $or: [
                    { userId: new Types.ObjectId(fromUserId), friendId: new Types.ObjectId(targetUserId) },
                    { userId: new Types.ObjectId(targetUserId), friendId: new Types.ObjectId(fromUserId) }
                ]
            });

            if (friendshipExists) {
                throw new Error(`FRIENDSHIP_${friendshipExists.status.toUpperCase()}`);
            }

            // Create friend request using Friendship model
            const friendship = new Friendship({
                userId: new Types.ObjectId(fromUserId),
                friendId: new Types.ObjectId(targetUserId),
                status: FriendshipStatus.PENDING,
                message: message || '',
                createdAt: new Date()
            });

            await friendship.save();

            typedLogger.info('Friend request sent', { fromUserId, targetUserId });

            return {
                success: true,
                friendshipId: friendship._id,
                message: friendship.message,
                createdAt: friendship.createdAt
            };
        } catch (error) {
            typedLogger.error('Send friend request error', { error: (error as any).message, fromUserId, data });
            throw error;
        }
    }

    /**
     * Accept/Reject friend request
     */
    static async respondToFriendRequest(userId: string, fromUserId: string, action: 'accept' | 'reject') {
        try {
            // Find the pending friendship request
            let friendship = await Friendship.findOne({
                userId: new Types.ObjectId(userId),
                friendId: new Types.ObjectId(fromUserId),
                status: FriendshipStatus.PENDING
            });

            // Check reverse direction too (in case request was made the other way)
            if (!friendship) {
                friendship = await Friendship.findOne({
                    userId: new Types.ObjectId(fromUserId),
                    friendId: new Types.ObjectId(userId),
                    status: FriendshipStatus.PENDING
                });
            }

            if (!friendship) {
                throw new Error('FRIEND_REQUEST_NOT_FOUND');
            }

            if (action === 'accept') {
                // Update friendship status to accepted
                friendship.status = FriendshipStatus.ACCEPTED;
                friendship.acceptedAt = new Date();
                await friendship.save();

                typedLogger.info('Friend request accepted', { userId, fromUserId });
            } else {
                // Update friendship status to rejected
                friendship.status = FriendshipStatus.REJECTED;
                friendship.rejectedAt = new Date();
                await friendship.save();

                typedLogger.info('Friend request rejected', { userId, fromUserId });
            }

            return { success: true, action };
        } catch (error) {
            typedLogger.error('Respond to friend request error', { error: (error as any).message, userId, fromUserId, action });
            throw error;
        }
    }

    /**
     * Get user's friends with online status
     */
    static async getFriends(userId: string) {
        try {
            // Get accepted friendships for this user
            const friendships = await Friendship.find({
                $or: [
                    { userId: new Types.ObjectId(userId), status: FriendshipStatus.ACCEPTED },
                    { friendId: new Types.ObjectId(userId), status: FriendshipStatus.ACCEPTED }
                ]
            }).populate([
                {
                    path: 'userId',
                    select: 'displayName avatar level points lastActive'
                },
                {
                    path: 'friendId',
                    select: 'displayName avatar level points lastActive'
                }
            ]);

            const friends = await Promise.all(
                friendships.map(async (friendship: any) => {
                    // Determine which user is the friend (not the current user)
                    const friend = friendship.userId.toString() === userId
                        ? friendship.friendId
                        : friendship.userId;

                    // Check online status (last active within 5 minutes)
                    const isOnline = friend.lastActive &&
                        (Date.now() - new Date(friend.lastActive).getTime()) < 5 * 60 * 1000;

                    // Get current game session if online
                    let currentActivity = null;
                    if (isOnline) {
                        const sessionKeys = await this.redis.keys(`session:game_session_${friend._id}_*`);
                        if (sessionKeys.length > 0) {
                            const sessionData = await this.redis.get(sessionKeys[0]);
                            if (sessionData) {
                                const session = JSON.parse(sessionData);
                                currentActivity = {
                                    type: 'playing',
                                    location: session.currentLocation,
                                    startTime: session.startTime
                                };
                            }
                        }
                    }

                    return {
                        userId: friend._id,
                        displayName: friend.displayName,
                        avatar: friend.avatar,
                        level: friend.level,
                        points: friend.points,
                        isOnline,
                        lastActive: friend.lastActive,
                        currentActivity,
                        friendshipDate: friendship.createdAt
                    };
                })
            );

            const onlineCount = friends.filter(f => f.isOnline).length;

            return {
                friends: friends.sort((a, b) => {
                    // Sort by online status first, then by last active
                    if (a.isOnline && !b.isOnline) return -1;
                    if (!a.isOnline && b.isOnline) return 1;
                    return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
                }),
                onlineCount,
                totalCount: friends.length
            };
        } catch (error) {
            typedLogger.error('Get friends error', { error: (error as any).message, userId });
            throw error;
        }
    }

    /**
     * Create team for collaborative gameplay
     */
    static async createTeam(creatorId: string, teamData: TeamCreateData) {
        try {
            const creator = await User.findById(creatorId);
            if (!creator) throw new Error('USER_NOT_FOUND');

            const team = {
                _id: `team_${creatorId}_${Date.now()}`,
                name: teamData.name,
                description: teamData.description || '',
                creatorId,
                members: [{
                    userId: creatorId,
                    role: 'leader',
                    joinedAt: new Date(),
                    status: 'active'
                }],
                isPublic: teamData.isPublic,
                maxMembers: teamData.maxMembers,
                stats: {
                    totalClaims: 0,
                    totalPoints: 0,
                    totalDistance: 0,
                    activeChallenges: 0
                },
                settings: {
                    allowInvites: true,
                    requireApproval: !teamData.isPublic,
                    shareLocation: true
                },
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // Store team data
            await this.redis.setex(
                `team:${team._id}`,
                30 * 24 * 60 * 60, // 30 days
                JSON.stringify(team)
            );

            // Add team to user's profile
            await User.findByIdAndUpdate(creatorId, {
                $push: {
                    'social.teams': {
                        teamId: team._id,
                        role: 'leader',
                        joinedAt: new Date()
                    }
                }
            });

            typedLogger.info('Team created', { creatorId, teamId: team._id, name: team.name });

            return {
                teamId: team._id,
                name: team.name,
                memberCount: 1,
                role: 'leader'
            };
        } catch (error) {
            typedLogger.error('Create team error', { error: (error as any).message, creatorId, teamData });
            throw error;
        }
    }

    /**
     * Create social challenge
     */
    static async createSocialChallenge(creatorId: string, challengeData: SocialChallengeData) {
        try {
            const creator = await User.findById(creatorId);
            if (!creator) throw new Error('USER_NOT_FOUND');

            const challenge = {
                _id: `social_challenge_${creatorId}_${Date.now()}`,
                title: challengeData.title,
                description: challengeData.description,
                type: challengeData.type,
                creatorId,
                targetValue: challengeData.targetValue,
                currentValue: 0,
                duration: challengeData.duration,
                rewards: challengeData.rewards,
                participants: {
                    ...challengeData.participants,
                    current: 1,
                    users: [{
                        userId: creatorId,
                        joinedAt: new Date(),
                        contribution: 0,
                        status: 'active'
                    }]
                },
                status: 'recruiting',
                startTime: null,
                endTime: null,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // Store challenge
            await this.redis.setex(
                `social_challenge:${challenge._id}`,
                challengeData.duration + 24 * 60 * 60, // Duration + 1 day buffer
                JSON.stringify(challenge)
            );

            // Add to global challenges list
            await this.redis.lpush('social_challenges:active', challenge._id);

            typedLogger.info('Social challenge created', {
                creatorId,
                challengeId: challenge._id,
                type: challenge.type
            });

            return {
                challengeId: challenge._id,
                title: challenge.title,
                type: challenge.type,
                participantCount: 1,
                status: 'recruiting'
            };
        } catch (error) {
            typedLogger.error('Create social challenge error', { error: (error as any).message, creatorId, challengeData });
            throw error;
        }
    }

    /**
     * Get nearby players for social interactions
     */
    static async getNearbyPlayers(userId: string, location: LocationData, radiusKm: number = 5) {
        try {
            // Calculate actual distances using aggregation
            const result = await User.aggregate([
                {
                    $geoNear: {
                        near: { type: 'Point', coordinates: [location.longitude, location.latitude] },
                        distanceField: 'distance',
                        maxDistance: radiusKm * 1000, // Convert km to meters
                        query: {
                            _id: { $ne: new Types.ObjectId(userId) }, // Exclude self
                            isBanned: false,
                            lastActive: { $gte: new Date(Date.now() - 3600000) } // Active in last hour
                        },
                        includeLocs: 'location',
                        spherical: true
                    }
                },
                {
                    $limit: 20
                }
            ]);

            // Calculate actual distances using our helper function for consistency
            return {
                players: result.map(user => {
                    // Calculate distance using our helper function
                    // User location has the coordinates in {lat, lng} format
                    const userLocation = user.location;
                    if (!userLocation) {
                        // If user has no location, return Infinity distance
                        return {
                            userId: user._id,
                            displayName: user.displayName,
                            level: user.level,
                            points: user.points,
                            avatar: user.avatar,
                            distance: Infinity,
                            lastSeen: user.lastActive,
                            activity: 'active'
                        };
                    }

                    const distance = this.calculateDistance(
                        location.latitude,
                        location.longitude,
                        userLocation.lat,
                        userLocation.lng
                    );

                    return {
                        userId: user._id,
                        displayName: user.displayName,
                        level: user.level,
                        points: user.points,
                        avatar: user.avatar,
                        distance: Math.round(distance * 100) / 100, // Round to 2 decimals
                        lastSeen: user.lastActive,
                        activity: 'active' // All returned users are active based on the filter
                    };
                }),
                total: result.length,
                searchRadius: radiusKm
            };
        } catch (error) {
            typedLogger.error('Get nearby players error', { error: (error as any).message, userId, location });
            throw error;
        }
    }

    // Helper methods
    private static async checkFriendshipStatus(userId1: string, userId2: string) {
        // Use Friendship model to check the status
        const friendship = await Friendship.findOne({
            $or: [
                { userId: new Types.ObjectId(userId1), friendId: new Types.ObjectId(userId2) },
                { userId: new Types.ObjectId(userId2), friendId: new Types.ObjectId(userId1) }
            ]
        });

        if (!friendship) {
            return { status: 'none' };
        }

        switch (friendship.status) {
            case FriendshipStatus.ACCEPTED:
                return { status: 'friends' };
            case FriendshipStatus.PENDING:
                // Determine if it's incoming or outgoing based on who initiated
                if (friendship.userId.toString() === userId2) {
                    return { status: 'pending_outgoing' };
                } else {
                    return { status: 'pending_incoming' };
                }
            case FriendshipStatus.REJECTED:
                return { status: 'rejected' };
            case FriendshipStatus.BLOCKED:
                return { status: 'blocked' };
            default:
                return { status: 'none' };
        }
    }

    private static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Get leaderboard
     */
    static async getLeaderboard(
        userId: string,
        type: 'global' | 'city' | 'friends',
        city?: string,
        limit: number = 50,
        offset: number = 0
    ) {
        try {
            let query: any = {};

            if (type === 'city' && city) {
                query['location.city'] = city;
            } else if (type === 'friends') {
                // Get friends using the Friendship model instead of non-existent social.friends field
                const friendships = await Friendship.find({
                    $or: [
                        { userId: new Types.ObjectId(userId), status: FriendshipStatus.ACCEPTED },
                        { friendId: new Types.ObjectId(userId), status: FriendshipStatus.ACCEPTED }
                    ]
                });

                const friendIds = friendships.map(f =>
                    f.userId.toString() === userId ? f.friendId.toString() : f.userId.toString()
                );

                query._id = { $in: [...friendIds, userId] };
            }

            const leaderboard = await User.find(query)
                .select('displayName level points avatar location.city')
                .sort({ points: -1, level: -1 })
                .skip(offset)
                .limit(limit)
                .lean();

            const total = await User.countDocuments(query);

            // Find current user rank
            const currentUser = await User.findById(userId).select('points level').lean();
            const rank = currentUser ? await User.countDocuments({
                ...query,
                $or: [
                    { points: { $gt: currentUser.points } },
                    { points: currentUser.points, level: { $gt: currentUser.level } }
                ]
            }) + 1 : null;

            return {
                leaderboard: leaderboard.map((user, index) => ({
                    rank: offset + index + 1,
                    userId: user._id,
                    displayName: user.displayName,
                    level: user.level,
                    points: user.points,
                    avatar: user.avatar,
                    city: user.location?.city
                })),
                total,
                currentUserRank: rank,
                type
            };
        } catch (error) {
            typedLogger.error('Get leaderboard error', { error: (error as any).message, userId, type });
            throw error;
        }
    }

    /**
     * Share capture
     */
    static async shareCapture(
        userId: string,
        captureId: string,
        platform: 'facebook' | 'instagram' | 'twitter' | 'whatsapp',
        message?: string
    ) {
        try {
            const { Claim } = await import('@/models/Claim');
            const claim = await Claim.findById(captureId);

            if (!claim || claim.userId.toString() !== userId) {
                throw new Error('CAPTURE_NOT_FOUND');
            }

            // Generate share URL - using environment var instead of config object
            const frontendUrl = process.env.FRONTEND_URL || 'https://yallacatch.com';
            const shareUrl = `${frontendUrl}/captures/${captureId}`;
            const shareText = message || `Je viens de capturer un prix sur YallaCatch! 🎁`;

            // Platform-specific share URLs
            const shareUrls: Record<string, string> = {
                facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
                twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
                whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`,
                instagram: shareUrl, // Instagram doesn't support direct sharing, return capture URL
            };

            // Log share activity
            await User.findByIdAndUpdate(userId, {
                $inc: { 'stats.rewardsRedeemed': 1 },  // Using rewardsRedeemed instead of non-existent totalShares
                $push: {
                    'stats.shareHistory': {  // Using stats.shareHistory instead of non-existent social.recentShares
                        captureId,
                        platform,
                        sharedAt: new Date()
                    }
                }
            });

            typedLogger.info('Capture shared', { userId, captureId, platform });

            return {
                success: true,
                shareUrl: shareUrls[platform],
                platform
            };
        } catch (error) {
            typedLogger.error('Share capture error', { error: (error as any).message, userId, captureId });
            throw error;
        }
    }

    /**
     * Get user profile
     */
    static async getUserProfile(requesterId: string, targetUserId: string) {
        try {
            const targetUser = await User.findById(targetUserId)
                .select('displayName level points avatar location stats createdAt')
                .lean();

            if (!targetUser) {
                throw new Error('USER_NOT_FOUND');
            }

            // Check friendship status
            const friendshipStatus = await this.checkFriendshipStatus(requesterId, targetUserId);

            // Get recent captures (public or if friends)
            let recentCaptures = [];
            if (friendshipStatus.status === 'friends' || requesterId === targetUserId) {
                const { Claim } = await import('@/models/Claim');
                recentCaptures = await Claim.find({ userId: targetUserId, status: 'validated' })
                    .sort({ claimedAt: -1 })
                    .limit(10)
                    .select('prizeId claimedAt points')
                    .lean();
            }

            return {
                userId: targetUser._id,
                displayName: targetUser.displayName,
                level: targetUser.level,
                points: targetUser.points,
                avatar: targetUser.avatar,
                bio: '',  // Bio field doesn't exist in user model
                city: targetUser.location?.city,
                stats: {
                    totalCaptures: targetUser.stats?.prizesFound || 0,  // Using prizesFound instead of non-existent totalCaptures
                    totalPoints: targetUser.points,
                    totalShares: targetUser.stats?.rewardsRedeemed || 0,  // Using rewardsRedeemed instead of non-existent totalShares
                    friendsCount: (targetUser as any).friendsCount || 0
                },  // Calculate or use actual friends field if it exists
                recentCaptures,
                friendshipStatus: friendshipStatus.status,
                joinedAt: targetUser.createdAt,
                isOwnProfile: requesterId === targetUserId
            };
        } catch (error) {
            typedLogger.error('Get user profile error', { error: (error as any).message, requesterId, targetUserId });
            throw error;
        }
    }
    /**
     * Remove a friend
     */
    static async removeFriend(userId: string, friendshipId: string): Promise<{ success: boolean; message: string }> {
        try {
            const friendship = await Friendship.findById(friendshipId);

            if (!friendship) {
                throw new Error('FRIENDSHIP_NOT_FOUND');
            }

            // Check if user is involved
            if (
                friendship.userId.toString() !== userId &&
                friendship.friendId.toString() !== userId
            ) {
                throw new Error('FORBIDDEN');
            }

            await friendship.deleteOne();

            typedLogger.info('Friend removed', { userId, friendshipId });

            return {
                success: true,
                message: 'Friend removed',
            };
        } catch (error) {
            typedLogger.error('Remove friend error', { error: error instanceof Error ? error.message : String(error), userId, friendshipId });
            throw error;
        }
    }

    /**
     * Admin: remove friendship regardless of requester
     */
    static async adminRemoveFriendship(adminId: string, friendshipId: string) {
        try {
            const friendship = await Friendship.findById(friendshipId);
            if (!friendship) {
                throw new Error('FRIENDSHIP_NOT_FOUND');
            }

            await friendship.deleteOne();

            typedLogger.info('Admin removed friendship', { adminId, friendshipId });

            return {
                success: true,
                message: 'Friendship removed',
                friendshipId,
                userIds: {
                    userId: friendship.userId,
                    friendId: friendship.friendId
                }
            };
        } catch (error) {
            typedLogger.error('Admin remove friendship error', { error: error instanceof Error ? error.message : String(error), adminId, friendshipId });
            throw error;
        }
    }

    /**
     * Block a user
     */
    static async blockUser(userId: string, friendshipId: string) {
        try {
            const friendship = await Friendship.findById(friendshipId);

            if (!friendship) {
                throw new Error('FRIENDSHIP_NOT_FOUND');
            }

            if (
                friendship.userId.toString() !== userId &&
                friendship.friendId.toString() !== userId
            ) {
                throw new Error('FORBIDDEN');
            }

            // Block
            friendship.block();
            await friendship.save();

            typedLogger.info('User blocked', { userId, friendshipId });

            return {
                success: true,
                friendship: friendship.toJSON(),
            };
        } catch (error) {
            typedLogger.error('Block user error', { error: error instanceof Error ? error.message : String(error), userId, friendshipId });
            throw error;
        }
    }

    /**
     * Get pending friend requests
     */
    static async getPendingRequests(userId: string) {
        try {
            const requests = await Friendship.find({
                friendId: new Types.ObjectId(userId),
                status: FriendshipStatus.PENDING
            })
                .populate('userId', 'displayName level points avatar')
                .sort({ requestedAt: -1 })
                .lean();

            return {
                requests,
                total: requests.length,
            };
        } catch (error) {
            typedLogger.error('Get pending requests error', { error: error instanceof Error ? error.message : String(error), userId });
            throw error;
        }
    }

    /**
     * Get sent friend requests
     */
    static async getSentRequests(userId: string) {
        try {
            const requests = await Friendship.find({
                userId: new Types.ObjectId(userId),
                status: FriendshipStatus.PENDING
            })
                .populate('friendId', 'displayName level points avatar')
                .sort({ requestedAt: -1 })
                .lean();

            return {
                requests,
                total: requests.length,
            };
        } catch (error) {
            typedLogger.error('Get sent requests error', { error: error instanceof Error ? error.message : String(error), userId });
            throw error;
        }
    }

    /**
     * Check if two users are friends
     */
    static async areFriends(userId1: string, userId2: string): Promise<boolean> {
        try {
            const friendship = await Friendship.findOne({
                $or: [
                    { userId: new Types.ObjectId(userId1), friendId: new Types.ObjectId(userId2), status: FriendshipStatus.ACCEPTED },
                    { userId: new Types.ObjectId(userId2), friendId: new Types.ObjectId(userId1), status: FriendshipStatus.ACCEPTED }
                ]
            });

            return !!friendship;
        } catch (error) {
            typedLogger.error('Check friendship error', { error: error instanceof Error ? error.message : String(error), userId1, userId2 });
            return false;
        }
    }

    /**
     * Count friends for a user
     */
    static async countFriends(userId: string): Promise<number> {
        try {
            const count = await Friendship.countDocuments({
                $or: [
                    { userId: new Types.ObjectId(userId), status: FriendshipStatus.ACCEPTED },
                    { friendId: new Types.ObjectId(userId), status: FriendshipStatus.ACCEPTED }
                ]
            });

            return count;
        } catch (error) {
            typedLogger.error('Count friends error', { error: error instanceof Error ? error.message : String(error), userId });
            return 0;
        }
    }
}
