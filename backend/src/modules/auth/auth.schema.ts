import { z } from 'zod';
import { Platform } from '@/types';

export const guestLoginSchema = z.object({
    deviceId: z.string().min(1).max(100),
    platform: z.enum([Platform.IOS, Platform.ANDROID, Platform.WEB]),
    fcmToken: z.string().optional(),
    deviceModel: z.string().optional(),
    osVersion: z.string().optional(),
    appVersion: z.string().optional(),
    location: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        city: z.string().min(1).max(50)
    }).optional()
});

export const emailRegisterSchema = z.object({
    email: z.string().email().max(255),
    password: z.string().min(8).max(128),
    displayName: z.string().min(2).max(50),
    deviceId: z.string().min(1).max(100),
    platform: z.enum([Platform.IOS, Platform.ANDROID, Platform.WEB]),
    fcmToken: z.string().optional(),
    deviceModel: z.string().optional(),
    osVersion: z.string().optional(),
    appVersion: z.string().optional(),
    referralCode: z.string().optional(),
    location: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        city: z.string().min(1).max(50)
    }).optional()
});

export const emailLoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
    deviceId: z.string().min(1).max(100),
    platform: z.enum([Platform.IOS, Platform.ANDROID, Platform.WEB]),
    fcmToken: z.string().optional(),
    deviceModel: z.string().optional(),
    osVersion: z.string().optional(),
    appVersion: z.string().optional(),
    location: z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        city: z.string().min(1).max(50)
    }).optional()
});

// Partner login schema (reuse email login structure)
export const partnerLoginSchema = emailLoginSchema;

export const partnerRegisterSchema = z.object({
    name: z.string().min(2).max(100),
    description: z.string().max(500).optional(),
    contactEmail: z.string().email(),
    contactPhone: z.string().min(8).max(20),
    category: z.string().min(1).max(50),
    website: z.string().url().optional().or(z.literal('')),
});

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1)
});

export const logoutSchema = z.object({
    refreshToken: z.string().optional(),
    deviceId: z.string().optional()
});
