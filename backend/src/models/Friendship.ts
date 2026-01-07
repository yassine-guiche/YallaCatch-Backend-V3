import { Schema, model, Types, Model } from 'mongoose';

/**
 * Friendship Status Enum
 */
export enum FriendshipStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  BLOCKED = 'blocked',
}

/**
 * Friendship Interface
 */
export interface IFriendship {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  friendId: Types.ObjectId;
  status: FriendshipStatus;
  message?: string;
  requestedAt: Date;
  acceptedAt?: Date;
  rejectedAt?: Date;
  blockedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFriendshipMethods {
  accept(): void;
  reject(): void;
  block(): void;
}

/**
 * Friendship Schema
 */
const friendshipSchema = new Schema<IFriendship, Model<IFriendship, {}, IFriendshipMethods>, IFriendshipMethods>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  friendId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: Object.values(FriendshipStatus),
    default: FriendshipStatus.PENDING,
    index: true,
  },
  message: {
    type: String,
    default: '',
    maxlength: 500,
  },
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  acceptedAt: {
    type: Date,
  },
  rejectedAt: {
    type: Date,
  },
  blockedAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Index composé pour éviter les doublons et optimiser les requêtes
friendshipSchema.index({ userId: 1, friendId: 1 }, { unique: true });
friendshipSchema.index({ userId: 1, status: 1 });
friendshipSchema.index({ friendId: 1, status: 1 });

// Méthodes d'instance
friendshipSchema.methods.accept = function(): void {
  this.status = FriendshipStatus.ACCEPTED;
  this.acceptedAt = new Date();
};

friendshipSchema.methods.reject = function(): void {
  this.status = FriendshipStatus.REJECTED;
  this.rejectedAt = new Date();
};

friendshipSchema.methods.block = function(): void {
  this.status = FriendshipStatus.BLOCKED;
  this.blockedAt = new Date();
};

/**
 * Friendship Model
 */
export const Friendship = model<IFriendship, Model<IFriendship, {}, IFriendshipMethods>>('Friendship', friendshipSchema);
export default Friendship;
