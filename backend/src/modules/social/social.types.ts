import { Types } from 'mongoose';

export interface FriendRequestData {
    targetUserId: string;
    message?: string;
}

export interface TeamCreateData {
    name: string;
    description?: string;
    isPublic: boolean;
    maxMembers: number;
}

export interface SocialChallengeData {
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

export interface LocationData {
    latitude: number;
    longitude: number;
    accuracy?: number;
}

export interface UserProfile {
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

export interface NearbyPlayer {
    userId: Types.ObjectId;
    displayName: string;
    level: string;
    points: any;
    avatar?: string;
    distance: number;
    lastSeen: Date;
    activity: string;
}
