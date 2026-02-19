import { z } from 'zod';

export const PartnerItemSchema = z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1),
    pointsCost: z.number().int().min(0),
    stockQuantity: z.number().int().min(0),
    imageUrl: z.string().optional().or(z.literal('')).refine(
        (val) => !val || val.startsWith('/uploads/') || /^https?:\/\/.+/.test(val),
        { message: 'Image must be a valid URL or uploaded file path' }
    ).transform(v => v || undefined),
    isActive: z.boolean().optional(),
    isPopular: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
});

export const PartnerProfileSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
    logo: z.string().optional().or(z.literal('')),
    website: z.string().url().optional().or(z.literal('')),
    contactPhone: z.string().optional().or(z.literal('')),
    contactEmail: z.string().email().optional().or(z.literal('')),
    socialMedia: z.record(z.string()).optional(),
});

export const PartnerLocationSchema = z.object({
    locationId: z.string().optional(),
    name: z.string().min(1).max(100),
    address: z.string().min(1).max(200),
    city: z.string().min(1).max(50),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    phone: z.string().max(20).optional(),
    isActive: z.boolean().optional(),
    features: z.array(z.string()).optional(),
});
