import { z } from 'zod';

export const startARViewSchema = z.object({
    prizeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid prize ID'),
    metadata: z.object({
        deviceModel: z.string().optional(),
        osVersion: z.string().optional(),
        arKitVersion: z.string().optional(),
        arCoreVersion: z.string().optional(),
        cameraPermission: z.boolean(),
        locationPermission: z.boolean()
    })
});

export const captureARScreenshotSchema = z.object({
    sessionId: z.string().uuid(),
    screenshot: z.object({
        base64: z.string().min(1), // Base64 encoded image
        location: z.object({
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180)
        }).optional()
    })
});

export const endARSessionSchema = z.object({
    sessionId: z.string().uuid(),
    duration: z.number().min(0), // seconds
});
