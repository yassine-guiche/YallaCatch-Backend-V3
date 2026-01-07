import { Types } from 'mongoose';
import { Friendship, FriendshipStatus } from '@/models/Friendship';
import { User } from '@/models/User';
import { typedLogger } from '@/lib/typed-logger';

/**
 * Friendship Service
 * Gère toutes les opérations liées aux amitiés
 */
export class FriendshipService {
  /**
   * Envoyer une demande d'ami
   */
  static async sendFriendRequest(userId: string, friendId: string): Promise<any> {
    try {
      // Vérifier que l'utilisateur n'essaie pas de s'ajouter lui-même
      if (userId === friendId) {
        throw new Error('CANNOT_ADD_SELF');
      }

      // Vérifier que le friend existe
      const friend = await User.findById(friendId);
      if (!friend) {
        throw new Error('USER_NOT_FOUND');
      }

      // Vérifier qu'il n'y a pas déjà une demande ou une amitié
      const existing = await Friendship.findOne({
        $or: [
          { userId: new Types.ObjectId(userId), friendId: new Types.ObjectId(friendId) },
          { userId: new Types.ObjectId(friendId), friendId: new Types.ObjectId(userId) }
        ]
      });

      if (existing) {
        throw new Error(`FRIENDSHIP_ALREADY_EXISTS_${existing.status.toUpperCase()}`);
      }

      // Créer la demande
      const friendship = new Friendship({
        userId: new Types.ObjectId(userId),
        friendId: new Types.ObjectId(friendId),
        status: FriendshipStatus.PENDING,
      });

      await friendship.save();

      typedLogger.info('Friend request sent', { userId, friendId, friendshipId: friendship._id });

      return {
        success: true,
        friendship: friendship.toJSON(),
      };
    } catch (error) {
      typedLogger.error('Send friend request error', { error: (error as any).message, userId, friendId });
      throw error;
    }
  }

  /**
   * Accepter une demande d'ami
   */
  static async acceptFriendRequest(userId: string, friendshipId: string): Promise<any> {
    try {
      const friendship = await Friendship.findById(friendshipId);

      if (!friendship) {
        throw new Error('FRIENDSHIP_NOT_FOUND');
      }

      // Vérifier que c'est bien le destinataire
      if (friendship.friendId.toString() !== userId) {
        throw new Error('FORBIDDEN');
      }

      // Vérifier le statut
      if (friendship.status !== FriendshipStatus.PENDING) {
        throw new Error(`FRIENDSHIP_ALREADY_${friendship.status.toUpperCase()}`);
      }

      // Accepter
      friendship.accept();
      await friendship.save();

      typedLogger.info('Friend request accepted', { userId, friendshipId });

      // Trigger achievements for both users (async, don't wait)
      import('@/services/achievement').then(({ default: AchievementService }) => {
        // For the user who accepts
        AchievementService.checkAchievements(userId, 'FRIEND_ADDED', {
          friendId: friendship.userId.toString(),
          friendshipId,
        }).catch(error => {
          typedLogger.error('Check achievements error (FRIEND_ADDED)', { error: (error as any).message, userId });
        });
        
        // Pour l'utilisateur qui a envoyé la demande
        AchievementService.checkAchievements(friendship.userId.toString(), 'FRIEND_ADDED', {
          friendId: userId,
          friendshipId,
        }).catch(error => {
          typedLogger.error('Check achievements error (FRIEND_ADDED)', { error: (error as any).message, userId: friendship.userId.toString() });
        });
      });

      return {
        success: true,
        friendship: friendship.toJSON(),
      };
    } catch (error) {
      typedLogger.error('Accept friend request error', { error: (error as any).message, userId, friendshipId });
      throw error;
    }
  }

  /**
   * Rejeter une demande d'ami
   */
  static async rejectFriendRequest(userId: string, friendshipId: string): Promise<any> {
    try {
      const friendship = await Friendship.findById(friendshipId);

      if (!friendship) {
        throw new Error('FRIENDSHIP_NOT_FOUND');
      }

      if (friendship.friendId.toString() !== userId) {
        throw new Error('FORBIDDEN');
      }

      if (friendship.status !== FriendshipStatus.PENDING) {
        throw new Error(`FRIENDSHIP_ALREADY_${friendship.status.toUpperCase()}`);
      }

      // Rejeter
      friendship.reject();
      await friendship.save();

      typedLogger.info('Friend request rejected', { userId, friendshipId });

      return {
        success: true,
        friendship: friendship.toJSON(),
      };
    } catch (error) {
      typedLogger.error('Reject friend request error', { error: (error as any).message, userId, friendshipId });
      throw error;
    }
  }

  /**
   * Supprimer un ami
   */
  static async removeFriend(userId: string, friendshipId: string): Promise<any> {
    try {
      const friendship = await Friendship.findById(friendshipId);

      if (!friendship) {
        throw new Error('FRIENDSHIP_NOT_FOUND');
      }

      // Vérifier que l'utilisateur est impliqué
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
      typedLogger.error('Remove friend error', { error: (error as any).message, userId, friendshipId });
      throw error;
    }
  }

  /**
   * Admin: remove friendship regardless of requester (with audit-friendly payload)
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
      typedLogger.error('Admin remove friendship error', { error: (error as any).message, adminId, friendshipId });
      throw error;
    }
  }

  /**
   * Bloquer un utilisateur
   */
  static async blockUser(userId: string, friendshipId: string): Promise<any> {
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

      // Bloquer
      friendship.block();
      await friendship.save();

      typedLogger.info('User blocked', { userId, friendshipId });

      return {
        success: true,
        friendship: friendship.toJSON(),
      };
    } catch (error) {
      typedLogger.error('Block user error', { error: (error as any).message, userId, friendshipId });
      throw error;
    }
  }

  /**
   * Récupérer la liste des amis
   */
  static async getFriends(userId: string): Promise<any> {
    try {
      const friendships = await Friendship.find({
        $or: [
          { userId: new Types.ObjectId(userId), status: FriendshipStatus.ACCEPTED },
          { friendId: new Types.ObjectId(userId), status: FriendshipStatus.ACCEPTED }
        ]
      })
      .populate('userId', 'displayName level points.total stats.prizesFound stats.rewardsRedeemed')
      .populate('friendId', 'displayName level points.total stats.prizesFound stats.rewardsRedeemed')
      .sort({ acceptedAt: -1 })
      .lean();

      // Extraire les infos des amis
      const friends = friendships.map(f => {
        const friend = f.userId._id.toString() === userId ? f.friendId : f.userId;
        return {
          ...friend,
          friendshipId: f._id,
          friendsSince: f.acceptedAt,
        };
      });

      return {
        friends,
        total: friends.length,
      };
    } catch (error) {
      typedLogger.error('Get friends error', { error: (error as any).message, userId });
      throw error;
    }
  }

  /**
   * Récupérer les demandes en attente
   */
  static async getPendingRequests(userId: string): Promise<any> {
    try {
      const requests = await Friendship.find({
        friendId: new Types.ObjectId(userId),
        status: FriendshipStatus.PENDING
      })
      .populate('userId', 'displayName level points.total stats.prizesFound stats.rewardsRedeemed')
      .sort({ requestedAt: -1 })
      .lean();

      return {
        requests,
        total: requests.length,
      };
    } catch (error) {
      typedLogger.error('Get pending requests error', { error: (error as any).message, userId });
      throw error;
    }
  }

  /**
   * Récupérer les demandes envoyées
   */
  static async getSentRequests(userId: string): Promise<any> {
    try {
      const requests = await Friendship.find({
        userId: new Types.ObjectId(userId),
        status: FriendshipStatus.PENDING
      })
      .populate('friendId', 'displayName level points.total stats.prizesFound stats.rewardsRedeemed')
      .sort({ requestedAt: -1 })
      .lean();

      return {
        requests,
        total: requests.length,
      };
    } catch (error) {
      typedLogger.error('Get sent requests error', { error: (error as any).message, userId });
      throw error;
    }
  }

  /**
   * Vérifier si deux utilisateurs sont amis
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
      typedLogger.error('Check friendship error', { error: (error as any).message, userId1, userId2 });
      return false;
    }
  }

  /**
   * Récupérer le statut d'amitié
   */
  static async getFriendshipStatus(userId1: string, userId2: string): Promise<string> {
    try {
      const friendship = await Friendship.findOne({
        $or: [
          { userId: new Types.ObjectId(userId1), friendId: new Types.ObjectId(userId2) },
          { userId: new Types.ObjectId(userId2), friendId: new Types.ObjectId(userId1) }
        ]
      });

      if (!friendship) {
        return 'none';
      }

      return friendship.status;
    } catch (error) {
      typedLogger.error('Get friendship status error', { error: (error as any).message, userId1, userId2 });
      return 'none';
    }
  }

  /**
   * Compter les amis d'un utilisateur
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
      typedLogger.error('Count friends error', { error: (error as any).message, userId });
      return 0;
    }
  }
}

export default FriendshipService;
