import { z } from 'zod';

export const claimPrizeSchema = z.object({
    prizeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid prize ID'),
    location: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracy: z.number().min(0).optional()
    }),
    deviceSignals: z.object({
        speed: z.number().min(0).optional(),
        mockLocation: z.boolean().optional(),
        attestationToken: z.string().optional()
    }).optional(),
    idempotencyKey: z.string().min(1).max(100)
});

export const getUserClaimsSchema = z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(50),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
});

export const getClaimDetailsSchema = z.object({
    claimId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid claim ID')
});
