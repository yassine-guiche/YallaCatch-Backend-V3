import { z } from 'zod';

export const GameSessionSchema = z.object({
    deviceId: z.string(),
    platform: z.enum(['iOS', 'Android', 'Unity']),
    version: z.string(),
    deviceModel: z.string().optional(),
    osVersion: z.string().optional(),
    appVersion: z.string().optional(),
    location: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracy: z.number().min(0)
    })
});

export const LocationUpdateSchema = z.object({
    sessionId: z.string(),
    location: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracy: z.number().min(0),
        speed: z.number().min(0).optional(),
        heading: z.number().min(0).max(360).optional()
    }),
    device: z.object({
        model: z.string().optional(),
        osVersion: z.string().optional(),
        appVersion: z.string().optional(),
    }).optional(),
    timestamp: z.string().datetime()
});

export const PowerUpUsageSchema = z.object({
    powerUpId: z.string(),
    location: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180)
    })
});

export const CaptureAttemptSchema = z.object({
    prizeId: z.string(),
    location: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracy: z.number().min(0).max(1000).optional(),
        altitude: z.number().optional()
    }),
    deviceInfo: z.object({
        platform: z.enum(['iOS', 'Android']),
        deviceModel: z.string(),
        osVersion: z.string().optional(),
        appVersion: z.string().optional(),
        timestamp: z.string().datetime().optional()
    }).optional(),
    captureMethod: z.enum(['tap', 'gesture', 'voice']).default('tap')
});

export const CaptureValidationSchema = z.object({
    prizeId: z.string(),
    location: z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180)
    })
});
