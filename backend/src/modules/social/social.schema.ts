import { z } from 'zod';

export const friendRequestSchema = z.object({
    targetUserId: z.string().regex(/^[0-9a-fA-F]{24}$/),
    message: z.string().max(500).optional(),
});

export const teamCreateSchema = z.object({
    name: z.string().min(2).max(100),
    description: z.string().max(500).optional(),
    isPublic: z.boolean(),
    maxMembers: z.number().int().min(2).max(100),
});

export const socialChallengeSchema = z.object({
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

export const respondFriendRequestSchema = z.object({
    action: z.enum(['accept', 'reject']),
    fromUserId: z.string().regex(/^[0-9a-fA-F]{24}$/)
});

export const updateLocationSchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().optional()
});
