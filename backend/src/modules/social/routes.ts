import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { userRateLimit } from '@/middleware/distributed-rate-limit';
import { z } from 'zod';
import { User } from '@/models/User';
import { Friendship, IFriendship, FriendshipStatus } from '@/models/Friendship';
import { Types } from 'mongoose';
import { typedLogger } from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';
import { config } from '@/config';
import { normalizeError } from '@/utils/api-errors';

// Define proper TypeScript interfaces
interface FriendRequestData {
  targetUserId: string;
  message?: string;
}

interface TeamCreateData {
  name: string;
  description?: string;
  isPublic: boolean;
  maxMembers: number;
}

interface SocialChallengeData {
  title: string;
  description: string;
  type: 'team_claims' | 'friend_race' | 'group_distance' | 'collaborative';
  targetValue: number;
  duration: number;
  rewards: {
    points: number;
    powerUps?: string[];
    badges?: string[];
  };
  participants: {
    minUsers: number;
    maxUsers: number;
    requireTeam: boolean;
  };
}

const friendRequestSchema = z.object({
  targetUserId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  message: z.string().max(500).optional(),
});

const teamCreateSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean(),
  maxMembers: z.number().int().min(2).max(100),
});

const socialChallengeSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().min(2).max(1000),
  type: z.enum(['team_claims', 'friend_race', 'group_distance', 'collaborative']),
  targetValue: z.number().positive(),
  duration: z.number().positive(),
  rewards: z.object({
    points: z.number().nonnegative(),
    powerUps: z.array(z.string()).optional(),
    badges: z.array(z.string()).optional(),
  }),
  participants: z.object({
    minUsers: z.number().int().min(1),
    maxUsers: z.number().int().min(1),
    requireTeam: z.boolean(),
  }),
});

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

interface UserProfile {
  _id: Types.ObjectId;
  displayName: string;
  level: string;
  points: {
    available: number;
    total: number;
    spent: number;
  };
  avatar?: string;
  location?: {
    lat: number;
    lng: number;
    city: string;
    lastUpdated: Date;
  };
  stats: {
    prizesFound: number;
    rewardsRedeemed: number;
    sessionsCount: number;
    totalPlayTime: number;
    longestStreak: number;
    currentStreak: number;
    favoriteCity?: string;
    lastClaimDate?: Date;
    dailyClaimsCount: number;
  };
  lastActive: Date;
  createdAt: Date;
}

interface NearbyPlayer {
  userId: Types.ObjectId;
  displayName: string;
  level: string;
  points: any;
  avatar?: string;
  distance: number;
  lastSeen: Date;
  activity: string;
}

/**
 * Social Features Module
 * Essential for modern AR games - friends, teams, social challenges
 * Missing from current implementation but critical for user engagement
 */

// Schemas
const FriendRequestSchema = z.object({
  targetUserId: z.string(),
  message: z.string().max(200).optional()});

const TeamCreateSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().max(200).optional(),
  isPublic: z.boolean().default(true),
  maxMembers: z.number().min(2).max(50).default(10)});

const SocialChallengeSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().max(500),
  type: z.enum(['team_claims', 'friend_race', 'group_distance', 'collaborative']),
  targetValue: z.number().min(1),
  duration: z.number().min(3600).max(604800), // 1 hour to 1 week in seconds
  rewards: z.object({
    points: z.number().min(0),
    powerUps: z.array(z.string()).optional(),
    badges: z.array(z.string()).optional()}),
  participants: z.object({
    minUsers: z.number().min(2).default(2),
    maxUsers: z.number().min(2).max(100).default(10),
    requireTeam: z.boolean().default(false)})});

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
        createdAt: friendship.createdAt};
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
                  startTime: session.startTime};
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
            friendshipDate: friendship.createdAt};
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
        totalCount: friends.length};
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
          status: 'active'}],
        isPublic: teamData.isPublic,
        maxMembers: teamData.maxMembers,
        stats: {
          totalClaims: 0,
          totalPoints: 0,
          totalDistance: 0,
          activeChallenges: 0},
        settings: {
          allowInvites: true,
          requireApproval: !teamData.isPublic,
          shareLocation: true},
        createdAt: new Date(),
        updatedAt: new Date()};

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
            joinedAt: new Date()}
        }
      });

      typedLogger.info('Team created', { creatorId, teamId: team._id, name: team.name });

      return {
        teamId: team._id,
        name: team.name,
        memberCount: 1,
        role: 'leader'};
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
            status: 'active'}]},
        status: 'recruiting',
        startTime: null,
        endTime: null,
        createdAt: new Date(),
        updatedAt: new Date()};

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
        status: 'recruiting'};
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
        searchRadius: radiusKm};
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
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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
          city: user.location?.city})),
        total,
        currentUserRank: rank,
        type};
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
            sharedAt: new Date()}
        }
      });

      typedLogger.info('Capture shared', { userId, captureId, platform });

      return {
        success: true,
        shareUrl: shareUrls[platform],
        platform};
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
          friendsCount: (targetUser as any).friendsCount || 0},  // Calculate or use actual friends field if it exists
        recentCaptures,
        friendshipStatus: friendshipStatus.status,
        joinedAt: targetUser.createdAt,
        isOwnProfile: requesterId === targetUserId};
    } catch (error) {
      typedLogger.error('Get user profile error', { error: (error as any).message, requesterId, targetUserId });
      throw error;
    }
  }
}

export default async function socialRoutes(fastify: FastifyInstance) {
  const sendError = (reply: FastifyReply, error: unknown, fallback: string, status = 400) => {
    const normalized = normalizeError(error, fallback);
    reply.code(status).send({ success: false, error: normalized.code, message: normalized.message });
  };
  // Friend management
  fastify.post('/friends/request', {
    preHandler: [authenticate, userRateLimit],
    schema: { body: friendRequestSchema }
  }, async (request: FastifyRequest<{ Body: FriendRequestData }>, reply) => {
    try {
      const result = await SocialService.sendFriendRequest(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply, error, 'Friend request failed');
    }
  });

  fastify.post('/friends/respond', {
    preHandler: [authenticate, userRateLimit],
    schema: {
      body: {
        type: 'object',
        required: ['fromUserId', 'action'],
        properties: {
          fromUserId: { type: 'string' },
          action: {
            type: 'string',
            enum: ['accept', 'reject']
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: { fromUserId: string; action: 'accept' | 'reject' };
  }>, reply: FastifyReply) => {
    try {
      const result = await SocialService.respondToFriendRequest(
        request.user.sub,
        request.body.fromUserId,
        request.body.action
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply, error, 'Friend response failed');
    }
  });

  fastify.get('/friends', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await SocialService.getFriends(request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply as FastifyReply, error, 'Get friends failed', 500);
    }
  });

  // Team management
  fastify.post('/teams', {
    preHandler: [authenticate, userRateLimit],
    schema: { body: teamCreateSchema }
  }, async (request: FastifyRequest<{ Body: TeamCreateData }>, reply) => {
    try {
      const result = await SocialService.createTeam(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply, error, 'Team creation failed');
    }
  });

  // Social challenges
  fastify.post('/challenges', {
    preHandler: [authenticate, userRateLimit],
    schema: { body: socialChallengeSchema }
  }, async (request: FastifyRequest<{ Body: SocialChallengeData }>, reply) => {
    try {
      const result = await SocialService.createSocialChallenge(request.user.sub, request.body);
      reply.send({ success: true, data: result });
    } catch (error) {
      sendError(reply, error, 'Challenge creation failed');
    }
  });

  // Leaderboard
  fastify.get('/leaderboard', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['global', 'city', 'friends'], default: 'global' },
          city: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'number', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: {
      type?: 'global' | 'city' | 'friends';
      city?: string;
      limit?: number;
      offset?: number;
    }
  }>, reply: FastifyReply) => {
    try {
      const result = await SocialService.getLeaderboard(
        request.user.sub,
        request.query.type,
        request.query.city,
        request.query.limit,
        request.query.offset
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Share capture
  fastify.post('/share', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['captureId', 'platform'],
        properties: {
          captureId: { type: 'string' },
          platform: {
            type: 'string',
            enum: ['facebook', 'instagram', 'twitter', 'whatsapp']
          },
          message: { type: 'string', maxLength: 500 }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: {
      captureId: string;
      platform: 'facebook' | 'instagram' | 'twitter' | 'whatsapp';
      message?: string;
    }
  }>, reply: FastifyReply) => {
    try {
      const result = await SocialService.shareCapture(
        request.user.sub,
        request.body.captureId,
        request.body.platform,
        request.body.message
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(400).send({ success: false, error: (error as any).message });
    }
  });

  // Get user profile
  fastify.get('/profile/:userId', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { userId: string };
  }>, reply: FastifyReply) => {
    try {
      const result = await SocialService.getUserProfile(
        request.user.sub,
        request.params.userId
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(404).send({ success: false, error: (error as any).message });
    }
  });

  // Nearby players
  fastify.get('/nearby', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        required: ['latitude', 'longitude', 'radius'],
        properties: {
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          radius: { type: 'number', minimum: 0.1, maximum: 50, default: 5 }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: {
      latitude: number;
      longitude: number;
      radius: number;
    }
  }>, reply: FastifyReply) => {
    try {
      const result = await SocialService.getNearbyPlayers(
        request.user.sub,
        { latitude: request.query.latitude, longitude: request.query.longitude },
        request.query.radius
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // ========================================
  // NEW FRIENDSHIP ROUTES (using FriendshipService)
  // ========================================

  // Send friend request
  fastify.post('/friends/send', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['friendId'],
        properties: {
          friendId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Body: { friendId: string };
  }>, reply: FastifyReply) => {
    try {
      const FriendshipService = (await import('@/services/friendship')).default;
      const result = await FriendshipService.sendFriendRequest(
        request.user.sub,
        request.body.friendId
      );
      reply.code(201).send(result);
    } catch (error) {
      const statusCode = (error as any).message === 'USER_NOT_FOUND' ? 404 :
                         (error as any).message === 'CANNOT_ADD_SELF' ? 400 :
                         (error as any).message.startsWith('FRIENDSHIP_ALREADY_EXISTS') ? 409 : 500;
      reply.code(statusCode).send({ success: false, error: (error as any).message });
    }
  });

  // Accept friend request
  fastify.post('/friends/accept/:friendshipId', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['friendshipId'],
        properties: {
          friendshipId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { friendshipId: string };
  }>, reply: FastifyReply) => {
    try {
      const FriendshipService = (await import('@/services/friendship')).default;
      const result = await FriendshipService.acceptFriendRequest(
        request.user.sub,
        request.params.friendshipId
      );
      reply.send(result);
    } catch (error) {
      const statusCode = (error as any).message === 'FRIENDSHIP_NOT_FOUND' ? 404 :
                         (error as any).message === 'FORBIDDEN' ? 403 : 400;
      reply.code(statusCode).send({ success: false, error: (error as any).message });
    }
  });

  // Reject friend request
  fastify.post('/friends/reject/:friendshipId', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['friendshipId'],
        properties: {
          friendshipId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { friendshipId: string };
  }>, reply: FastifyReply) => {
    try {
      const FriendshipService = (await import('@/services/friendship')).default;
      const result = await FriendshipService.rejectFriendRequest(
        request.user.sub,
        request.params.friendshipId
      );
      reply.send(result);
    } catch (error) {
      const statusCode = (error as any).message === 'FRIENDSHIP_NOT_FOUND' ? 404 :
                         (error as any).message === 'FORBIDDEN' ? 403 : 400;
      reply.code(statusCode).send({ success: false, error: (error as any).message });
    }
  });

  // Remove friend
  fastify.delete('/friends/:friendshipId', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['friendshipId'],
        properties: {
          friendshipId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { friendshipId: string };
  }>, reply: FastifyReply) => {
    try {
      const FriendshipService = (await import('@/services/friendship')).default;
      const result = await FriendshipService.removeFriend(
        request.user.sub,
        request.params.friendshipId
      );
      reply.send(result);
    } catch (error) {
      const statusCode = (error as any).message === 'FRIENDSHIP_NOT_FOUND' ? 404 :
                         (error as any).message === 'FORBIDDEN' ? 403 : 500;
      reply.code(statusCode).send({ success: false, error: (error as any).message });
    }
  });

  // Block user
  fastify.post('/friends/block/:friendshipId', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['friendshipId'],
        properties: {
          friendshipId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { friendshipId: string };
  }>, reply: FastifyReply) => {
    try {
      const FriendshipService = (await import('@/services/friendship')).default;
      const result = await FriendshipService.blockUser(
        request.user.sub,
        request.params.friendshipId
      );
      reply.send(result);
    } catch (error) {
      const statusCode = (error as any).message === 'FRIENDSHIP_NOT_FOUND' ? 404 :
                         (error as any).message === 'FORBIDDEN' ? 403 : 500;
      reply.code(statusCode).send({ success: false, error: (error as any).message });
    }
  });

  // Get pending friend requests (received)
  fastify.get('/friends/requests/pending', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const FriendshipService = (await import('@/services/friendship')).default;
      const result = await FriendshipService.getPendingRequests(request.user.sub);
      reply.send(result);
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get sent friend requests
  fastify.get('/friends/requests/sent', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const FriendshipService = (await import('@/services/friendship')).default;
      const result = await FriendshipService.getSentRequests(request.user.sub);
      reply.send(result);
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Check friendship status
  fastify.get('/friends/status/:userId', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Params: { userId: string };
  }>, reply: FastifyReply) => {
    try {
      const FriendshipService = (await import('@/services/friendship')).default;
      const status = await FriendshipService.getFriendshipStatus(
        request.user.sub,
        request.params.userId
      );
      reply.send({ status });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get friends count
  fastify.get('/friends/count', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const FriendshipService = (await import('@/services/friendship')).default;
      const count = await FriendshipService.countFriends(request.user.sub);
      reply.send({ count });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
}
