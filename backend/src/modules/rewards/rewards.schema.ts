import { z } from 'zod';
import { RewardCategory, ListingType } from '@/types';

export const getRewardsSchema = z.object({
    category: z.enum(Object.values(RewardCategory) as [string, ...string[]]).optional(),
    minCost: z.number().min(1).optional(),
    maxCost: z.number().min(1).optional(),
    popular: z.boolean().optional(),
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(50),
    sort: z.enum(['pointsCost', 'name', 'popularity']).default('pointsCost'),
    listingType: z.enum(Object.values(ListingType) as [string, ...string[]]).optional()
});

export const searchRewardsSchema = z.object({
    query: z.string().min(1).max(100),
    category: z.enum(Object.values(RewardCategory) as [string, ...string[]]).optional(),
    limit: z.number().min(1).max(50).default(20)
});

export const redeemRewardSchema = z.object({
    rewardId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid reward ID'),
    idempotencyKey: z.string().min(1).max(100)
});

export const createRewardSchema = z.object({
    name: z.string().min(2).max(100),
    description: z.string().min(10).max(500),
    category: z.enum(Object.values(RewardCategory) as [string, ...string[]]),
    pointsCost: z.number().min(1).max(100000),
    stockQuantity: z.number().min(1).max(10000),
    imageUrl: z.string().url().optional(),
    isPopular: z.boolean().default(false),
    partnerId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
    metadata: z.record(z.any()).optional(),
    listingType: z.enum(Object.values(ListingType) as [string, ...string[]]).default(ListingType.GAME_REWARD)
});

export const updateRewardSchema = createRewardSchema.partial();

export const addStockSchema = z.object({
    quantity: z.number().min(1).max(1000)
});

export const promoCodeSchema = z.object({
    code: z.string().min(4).max(64)
});
