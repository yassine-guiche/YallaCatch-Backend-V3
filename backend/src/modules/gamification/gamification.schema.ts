import { z } from 'zod';

// Define proper TypeScript interfaces
export interface AchievementData {
    name: string;
    description: string;
    icon: string;
    category: 'explorer' | 'collector' | 'social' | 'master' | 'special';
    trigger: 'PRIZE_CLAIMED' | 'LEVEL_UP' | 'REWARD_REDEEMED' | 'FRIEND_ADDED' | 'STREAK_MILESTONE' | 'DISTANCE_MILESTONE' | 'MANUAL';
    condition: {
        type: 'TOTAL_CLAIMS' | 'TOTAL_POINTS' | 'LEVEL_REACHED' | 'STREAK_DAYS' | 'CATEGORY_CLAIMS' | 'RARITY_CLAIMS' | 'DISTANCE_TRAVELED' | 'FRIENDS_COUNT' | 'REWARDS_REDEEMED';
        target: number;
        category?: string;
        rarity?: string;
    };
    rewards: {
        type: 'POINTS' | 'POWER_UP' | 'COSMETIC' | 'TITLE' | 'BADGE';
        value: any;
        description: string;
    }[];
    isActive: boolean;
    isHidden: boolean;
    order: number;
}

export interface UpdateAchievementData {
    name?: string;
    description?: string;
    icon?: string;
    category?: 'explorer' | 'collector' | 'social' | 'master' | 'special';
    trigger?: 'PRIZE_CLAIMED' | 'LEVEL_UP' | 'REWARD_REDEEMED' | 'FRIEND_ADDED' | 'STREAK_MILESTONE' | 'DISTANCE_MILESTONE' | 'MANUAL';
    condition?: {
        type: 'TOTAL_CLAIMS' | 'TOTAL_POINTS' | 'LEVEL_REACHED' | 'STREAK_DAYS' | 'CATEGORY_CLAIMS' | 'RARITY_CLAIMS' | 'DISTANCE_TRAVELED' | 'FRIENDS_COUNT' | 'REWARDS_REDEEMED';
        target: number;
        category?: string;
        rarity?: string;
    };
    rewards?: {
        type: 'POINTS' | 'POWER_UP' | 'COSMETIC' | 'TITLE' | 'BADGE';
        value: any;
        description: string;
    }[];
    isActive?: boolean;
    isHidden?: boolean;
    order?: number;
}

// Validation schemas
export const achievementSchema = z.object({
    name: z.string().min(3).max(100),
    description: z.string().min(10).max(500),
    icon: z.string().optional().default(''),
    category: z.enum(['explorer', 'collector', 'social', 'master', 'special']),
    trigger: z.enum(['PRIZE_CLAIMED', 'LEVEL_UP', 'REWARD_REDEEMED', 'FRIEND_ADDED', 'STREAK_MILESTONE', 'DISTANCE_MILESTONE', 'MANUAL']),
    condition: z.object({
        type: z.enum(['TOTAL_CLAIMS', 'TOTAL_POINTS', 'LEVEL_REACHED', 'STREAK_DAYS', 'CATEGORY_CLAIMS', 'RARITY_CLAIMS', 'DISTANCE_TRAVELED', 'FRIENDS_COUNT', 'REWARDS_REDEEMED']),
        target: z.number().min(1),
        category: z.string().optional(),
        rarity: z.string().optional()
    }),
    rewards: z.array(z.object({
        type: z.enum(['POINTS', 'POWER_UP', 'COSMETIC', 'TITLE', 'BADGE']),
        value: z.any(),
        description: z.string().min(1)
    })).min(1),
    isActive: z.boolean().default(true),
    isHidden: z.boolean().default(false),
    order: z.number().default(0)
});

export const updateAchievementSchema = z.object({
    name: z.string().min(3).max(100).optional(),
    description: z.string().min(10).max(500).optional(),
    icon: z.string().optional(),
    category: z.enum(['explorer', 'collector', 'social', 'master', 'special']).optional(),
    trigger: z.enum(['PRIZE_CLAIMED', 'LEVEL_UP', 'REWARD_REDEEMED', 'FRIEND_ADDED', 'STREAK_MILESTONE', 'DISTANCE_MILESTONE', 'MANUAL']).optional(),
    condition: z.object({
        type: z.enum(['TOTAL_CLAIMS', 'TOTAL_POINTS', 'LEVEL_REACHED', 'STREAK_DAYS', 'CATEGORY_CLAIMS', 'RARITY_CLAIMS', 'DISTANCE_TRAVELED', 'FRIENDS_COUNT', 'REWARDS_REDEEMED']),
        target: z.number().min(1),
        category: z.string().optional(),
        rarity: z.string().optional()
    }).optional(),
    rewards: z.array(z.object({
        type: z.enum(['POINTS', 'POWER_UP', 'COSMETIC', 'TITLE', 'BADGE']),
        value: z.any(),
        description: z.string().min(1)
    })).optional(),
    isActive: z.boolean().optional(),
    isHidden: z.boolean().optional(),
    order: z.number().optional()
});

export const achievementParamsSchema = z.object({
    achievementId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid achievement ID")
});
