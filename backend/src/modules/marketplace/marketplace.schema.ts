import { z } from 'zod';

export const PurchaseItemSchema = z.object({
    itemId: z.string(),
    location: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180)
    }).optional(),
    deviceInfo: z.object({
        platform: z.string(),
        version: z.string()
    }).optional()
});

export const RedeemItemSchema = z.object({
    redemptionCode: z.string(),
    location: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180)
    }),
    verificationCode: z.string().optional()
});
