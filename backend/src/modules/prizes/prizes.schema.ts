import { z } from 'zod';
import { PrizeType, PrizeCategory, PrizeRarity, LocationType, IPrizeDocument } from '@/types';
import { config, TUNISIA_CITIES } from '@/config';

// Validation schemas
export const nearbyPrizesSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radius: z.number().min(0.1).max(50).default(5), // km
    category: z.enum(Object.values(PrizeCategory) as [string, ...string[]]).optional(),
    rarity: z.enum(Object.values(PrizeRarity) as [string, ...string[]]).optional(),
    minPoints: z.number().min(1).optional(),
    maxPoints: z.number().min(1).optional(),
    limit: z.number().min(1).max(100).default(50)
});

export const cityPrizesSchema = z.object({
    city: z.enum(Object.keys(TUNISIA_CITIES) as [string, ...string[]]),
    category: z.enum(Object.values(PrizeCategory) as [string, ...string[]]).optional(),
    rarity: z.enum(Object.values(PrizeRarity) as [string, ...string[]]).optional(),
    limit: z.number().min(1).max(100).default(50),
    page: z.number().min(1).default(1)
});

export const prizeDetailsSchema = z.object({
    prizeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid prize ID')
});

export const searchPrizesSchema = z.object({
    query: z.string().min(1).max(100),
    city: z.enum(Object.keys(TUNISIA_CITIES) as [string, ...string[]]).optional(),
    category: z.enum(Object.values(PrizeCategory) as [string, ...string[]]).optional(),
    limit: z.number().min(1).max(50).default(20),
    page: z.number().min(1).default(1)
});

export const createPrizeSchema = z.object({
    name: z.string().min(2).max(100),
    description: z.string().min(10).max(500),
    type: z.enum(Object.values(PrizeType) as [string, ...string[]]),
    category: z.enum(Object.values(PrizeCategory) as [string, ...string[]]),
    points: z.number().min(1).max(10000),
    rarity: z.enum(Object.values(PrizeRarity) as [string, ...string[]]),
    quantity: z.number().min(1).max(1000).default(1),
    location: z.object({
        type: z.enum(Object.values(LocationType) as [string, ...string[]]).default(LocationType.GPS),
        coordinates: z.array(z.number()).length(2), // [lng, lat]
        radius: z.number().min(10).max(500).default(50),
        city: z.enum(Object.keys(TUNISIA_CITIES) as [string, ...string[]]),
        address: z.string().max(200).optional(),
        markerUrl: z.string().url().optional(),
        confidenceThreshold: z.number().min(0.1).max(1.0).default(0.8)
    }),
    visibility: z.object({
        startAt: z.string().datetime().optional(),
        endAt: z.string().datetime().optional()
    }).optional(),
    expiresAt: z.string().datetime().optional(),
    imageUrl: z.string().url().optional(),
    value: z.number().min(0).optional(),
    tags: z.array(z.string().max(20)).max(10).default([])
});

export const updatePrizeSchema = createPrizeSchema.partial();

export const bulkCreatePrizesSchema = z.object({
    prizes: z.array(createPrizeSchema).min(1).max(100)
});
