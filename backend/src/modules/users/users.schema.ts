import { z } from 'zod';
import { UserLevel, IUserDocument, IPrize } from '@/types';
import { TUNISIA_CITIES } from '@/config';

export const updateProfileSchema = z.object({
    displayName: z.string().min(2).max(50).optional(),
    email: z.string().email().optional(),
    preferences: z.object({
        language: z.enum(['ar', 'fr', 'en']).optional(),
        theme: z.enum(['light', 'dark']).optional(),
        notifications: z.object({
            push: z.boolean().optional(),
            email: z.boolean().optional(),
            sms: z.boolean().optional()
        }).optional(),
        privacy: z.object({
            showOnLeaderboard: z.boolean().optional(),
            shareLocation: z.boolean().optional()
        }).optional()
    }).optional()
});

export const getLeaderboardSchema = z.object({
    city: z.enum(Object.keys(TUNISIA_CITIES) as [string, ...string[]]).optional(),
    level: z.enum(Object.values(UserLevel) as [string, ...string[]]).optional(),
    timeframe: z.enum(['daily', 'weekly', 'monthly', 'all-time']).default('weekly'),
    limit: z.number().min(1).max(100).default(50)
});
