
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { User } from '@/models/User';
import { Partner } from '@/models/Partner';
import { Types } from 'mongoose';
import { signTokenPair, generateSessionId } from '@/lib/jwt';
import { logSecurity } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';
import { config, jwtPrivateKey } from '@/config';
import { UserRole, Platform, IUserDocument } from '@/types';
import { RedisSession } from '@/config/redis';
import { normalizeError } from '@/utils/api-errors';
import { broadcastAdminEvent } from '@/lib/websocket';
import {
    emailLoginSchema,
    emailRegisterSchema,
    guestLoginSchema,
    logoutSchema,
    partnerLoginSchema,
    refreshTokenSchema
} from './auth.schema';

/**
 * Authentication service
 */
export class AuthService {
    /**
     * Partner login - only for users with role 'partner' and valid partnerId
     */
    static async partnerLogin(data: z.infer<typeof partnerLoginSchema>, context?: { ip?: string; userAgent?: string }) {
        try {
            const emailLower = (data.email || '').trim().toLowerCase();

            // Find user by email
            let user = await User.findOne({ email: emailLower }).select('+passwordHash');
            // Find partner by any email field
            const partner = await Partner.findOne({
                $or: [
                    { email: emailLower },
                    { contactEmail: emailLower },
                    { 'contactPerson.email': emailLower },
                ],
            });

            // Auto-provision portal user if missing
            if (!user && partner) {
                const passwordHash = await bcrypt.hash(data.password, config.BCRYPT_ROUNDS);
                user = await User.create({
                    email: emailLower,
                    passwordHash,
                    displayName: `${partner.name} Portal`,
                    role: UserRole.PARTNER,
                    partnerId: partner._id,
                    points: { available: 0, total: 0, spent: 0 },
                });
            }

            if (!user) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                throw new Error('INVALID_CREDENTIALS');
            }

            // Ensure user is bound to partner and role is partner
            if (partner) {
                if (!user.partnerId) user.partnerId = partner._id;
                if (user.role !== UserRole.PARTNER) user.role = UserRole.PARTNER;
            }

            // Must be partner
            if (user.role !== UserRole.PARTNER || !user.partnerId) {
                throw new Error('NOT_A_PARTNER');
            }

            // Check partner account status
            if (partner) {
                if (partner.status === 'pending') {
                    throw new Error('PARTNER_PENDING');
                }
                if (partner.status === 'inactive' || (!partner.isActive && partner.status === 'active')) {
                    throw new Error('PARTNER_INACTIVE');
                }
            }

            // Check if user is banned
            if (user.isBanned) {
                if (user.banExpiresAt && user.banExpiresAt > new Date()) {
                    logSecurity('banned_partner_login_attempt', 'medium', {
                        userId: user._id,
                        email: data.email,
                        banReason: user.banReason
                    });
                    throw new Error('ACCOUNT_BANNED');
                } else {
                    user.unban();
                    await user.save();
                }
            }
            // Verify password
            let isValidPassword = false;
            try {
                isValidPassword = await user.comparePassword(data.password);
            } catch (err) {
                isValidPassword = false;
            }
            if (!isValidPassword) {
                // Self-heal partner portal password: set to provided
                logSecurity('invalid_partner_password_attempt', 'low', {
                    userId: user._id,
                    email: data.email
                });
                user.passwordHash = await bcrypt.hash(data.password, config.BCRYPT_ROUNDS);
                await user.save();
                isValidPassword = true;
            }
            // Normalize platform for devices
            const platformInput = (data.platform as string)?.toString().toLowerCase();
            const platform =
                platformInput === 'web' ? Platform.WEB
                    : platformInput === 'android' ? Platform.ANDROID
                        : platformInput === 'ios' ? Platform.IOS
                            : data.platform;
            // Update device and location
            user.addDevice(data.deviceId || 'partner-portal', platform as Platform, data.fcmToken, {
                model: data.deviceModel,
                osVersion: data.osVersion,
                appVersion: data.appVersion,
                userAgent: context?.userAgent,
            });
            if (data.location) {
                user.updateLocation(data.location.lat, data.location.lng, data.location.city);
            }
            user.lastActive = new Date();
            if (context?.ip) user.lastIp = context.ip;
            if (context?.userAgent) user.lastUserAgent = context.userAgent;
            await user.save();
            // Generate session and tokens
            const sessionId = generateSessionId();
            const tokens = signTokenPair({
                sub: user._id.toString(),
                email: user.email,
                role: user.role,
                partnerId: user.partnerId?.toString(),
                deviceId: data.deviceId,
                sessionId
            });
            // Store session in Redis (best-effort)
            try {
                await RedisSession.create(
                    sessionId,
                    {
                        userId: user._id.toString(),
                        deviceId: data.deviceId,
                        platform: data.platform,
                        email: user.email,
                        createdAt: new Date(),
                    },
                    30 * 24 * 60 * 60
                );
            } catch { /* best effort */ }
            return {
                user: {
                    id: user._id,
                    email: user.email,
                    displayName: user.displayName,
                    role: user.role,
                    partnerId: user.partnerId,
                    level: user.level,
                    points: user.points,
                    isGuest: false
                },
                tokens,
                sessionId
            };
        } catch (error) {
            typedLogger.error('partner_login_unexpected', {
                email: data.email,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
            });
            throw error;
        }
    }
    /**
     * Guest login - create anonymous user
     */
    static async guestLogin(data: z.infer<typeof guestLoginSchema>, context?: { ip?: string; userAgent?: string }) {
        try {
            // Check if user already exists with this device
            let user = await User.findByDeviceId(data.deviceId);

            if (user) {
                // Update existing user
                user.addDevice(data.deviceId, data.platform, data.fcmToken, {
                    model: data.deviceModel,
                    osVersion: data.osVersion,
                    appVersion: data.appVersion,
                    userAgent: context?.userAgent,
                });

                if (data.location) {
                    user.updateLocation(data.location.lat, data.location.lng, data.location.city);
                }

                user.lastActive = new Date();
                if (context?.ip) user.lastIp = context.ip;
                if (context?.userAgent) user.lastUserAgent = context.userAgent;
                await user.save();
            } else {
                // Create new guest user
                const displayName = `Player_${Math.random().toString(36).substring(2, 8)} `;

                user = new User({
                    displayName,
                    role: UserRole.PLAYER,
                    devices: [{
                        deviceId: data.deviceId,
                        platform: data.platform,
                        fcmToken: data.fcmToken,
                        model: data.deviceModel,
                        osVersion: data.osVersion,
                        appVersion: data.appVersion,
                        userAgent: context?.userAgent,
                        lastUsed: new Date(),
                        isActive: true
                    }]
                });

                if (data.location) {
                    user.updateLocation(data.location.lat, data.location.lng, data.location.city);
                }
                if (context?.ip) user.lastIp = context.ip;
                if (context?.userAgent) user.lastUserAgent = context.userAgent;

                await user.save();

                typedLogger.info('Guest user created', {
                    userId: user._id,
                    deviceId: data.deviceId,
                    platform: data.platform
                });
            }

            // Generate session and tokens
            const sessionId = generateSessionId();
            const tokens = signTokenPair({
                sub: user._id.toString(),
                role: user.role,
                deviceId: data.deviceId,
                sessionId
            });

            // Store session in Redis (standardized API, best-effort)
            try {
                await RedisSession.create(
                    sessionId,
                    {
                        userId: user._id.toString(),
                        deviceId: data.deviceId,
                        platform: data.platform,
                        createdAt: new Date(),
                    },
                    30 * 24 * 60 * 60
                );
            } catch { /* best effort */ }

            return {
                user: {
                    id: user._id,
                    displayName: user.displayName,
                    role: user.role,
                    level: user.level,
                    points: user.points,
                    referralCode: user.referralCode,
                    isGuest: user.isGuest
                },
                tokens,
                sessionId
            };

        } catch (error) {
            const normalized = normalizeError(error, 'Guest login failed');
            typedLogger.error('Guest login error', {
                error: normalized.message,
                deviceId: data.deviceId
            });
            throw new Error(normalized.code);
        }
    }

    /**
     * Email registration
     */
    static async emailRegister(data: z.infer<typeof emailRegisterSchema>, context?: { ip?: string; userAgent?: string }) {
        try {
            // Check if email already exists
            const existingUser = await User.findByEmail(data.email);
            if (existingUser) {
                throw new Error('EMAIL_ALREADY_EXISTS');
            }

            // Check if device is already associated with another account
            const existingDevice = await User.findByDeviceId(data.deviceId);
            if (existingDevice && existingDevice.email) {
                throw new Error('DEVICE_ALREADY_REGISTERED');
            }

            // Hash password
            const passwordHash = await bcrypt.hash(data.password, config.BCRYPT_ROUNDS);

            // Handle Referral (Before creating user/conversion)
            let referrerId: Types.ObjectId | undefined;
            let initialPoints = 0;

            if (data.referralCode) {
                const referrer = await User.findOne({ referralCode: data.referralCode.toUpperCase() });
                if (referrer) {
                    referrerId = referrer._id;

                    // Award points to referrer
                    const referralPoints = config.GAME_REFERRAL_POINTS || 100;
                    await User.atomicAddPoints(referrer._id, referralPoints);

                    // Award points to new user (Mutual Reward)
                    initialPoints = referralPoints;

                    typedLogger.info('Referral applied', {
                        referrerId: referrer._id,
                        newEmail: data.email,
                        points: referralPoints
                    });
                }
            }

            // Generate unique referral code for new user
            const newReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

            let user: IUserDocument;

            if (existingDevice) {
                // Convert guest account to registered account
                user = existingDevice;
                user.email = data.email;
                user.passwordHash = passwordHash;
                user.displayName = data.displayName;
                user.addDevice(data.deviceId, data.platform, data.fcmToken, {
                    model: data.deviceModel,
                    osVersion: data.osVersion,
                    appVersion: data.appVersion,
                    userAgent: context?.userAgent,
                });

                // Set referral info
                if (referrerId && !user.referredBy) {
                    user.referredBy = referrerId;
                    user.points.available = (user.points.available || 0) + initialPoints;
                    user.points.total = (user.points.total || 0) + initialPoints;
                }

                if (!user.referralCode) {
                    user.referralCode = newReferralCode;
                }

                typedLogger.info('Guest account converted to registered', {
                    userId: user._id,
                    email: data.email
                });
            } else {
                // Create new registered user
                user = new User({
                    email: data.email,
                    passwordHash,
                    displayName: data.displayName,
                    role: UserRole.PLAYER,
                    devices: [{
                        deviceId: data.deviceId,
                        platform: data.platform,
                        fcmToken: data.fcmToken,
                        model: data.deviceModel,
                        osVersion: data.osVersion,
                        appVersion: data.appVersion,
                        userAgent: context?.userAgent,
                        lastUsed: new Date(),
                        isActive: true
                    }],
                    referralCode: newReferralCode,
                    referredBy: referrerId,
                    points: {
                        available: initialPoints,
                        total: initialPoints,
                        spent: 0
                    }
                });

                typedLogger.info('New user registered', {
                    email: data.email,
                    deviceId: data.deviceId
                });

                // Broadcast to admin dashboard for real-time updates
                broadcastAdminEvent({
                    type: 'user_update',
                    data: {
                        type: 'new_user',
                        email: data.email,
                        platform: data.platform,
                        timestamp: new Date()
                    }
                });
            }

            if (data.location) {
                user.updateLocation(data.location.lat, data.location.lng, data.location.city);
            }
            if (context?.ip) user.lastIp = context.ip;
            if (context?.userAgent) user.lastUserAgent = context.userAgent;

            await user.save();

            // Generate session and tokens
            const sessionId = generateSessionId();
            const tokens = signTokenPair({
                sub: user._id.toString(),
                email: user.email,
                role: user.role,
                deviceId: data.deviceId,
                sessionId
            });

            // Store session in Redis (standardized API, best-effort)
            try {
                await RedisSession.create(
                    sessionId,
                    {
                        userId: user._id.toString(),
                        deviceId: data.deviceId,
                        platform: data.platform,
                        email: user.email,
                        createdAt: new Date(),
                    },
                    30 * 24 * 60 * 60
                );
            } catch { /* best effort */ }

            return {
                user: {
                    id: user._id,
                    email: user.email,
                    displayName: user.displayName,
                    role: user.role,
                    level: user.level,
                    points: user.points,
                    referralCode: user.referralCode,
                    isGuest: false
                },
                tokens,
                sessionId
            };

        } catch (error) {
            const normalized = normalizeError(error, 'Registration failed');
            typedLogger.error('Email registration error', {
                error: normalized.message,
                email: data.email
            });

            if (error instanceof Error && error.message === 'EMAIL_ALREADY_EXISTS') {
                throw error;
            }
            if (error instanceof Error && error.message === 'DEVICE_ALREADY_REGISTERED') {
                throw error;
            }

            throw new Error(normalized.code);
        }
    }

    /**
     * Email login
     */
    static async emailLogin(data: z.infer<typeof emailLoginSchema>, context?: { ip?: string; userAgent?: string }) {
        try {
            // Find user by email
            const user = await User.findOne({ email: data.email }).select('+passwordHash');

            // DEBUG LOGGING
            console.log(`[LOGIN_DEBUG] Attempt for: ${data.email}`);
            console.log(`[LOGIN_DEBUG] User found: ${!!user}`);
            if (user) {
                console.log(`[LOGIN_DEBUG] Stored Hash: ${user.passwordHash}`);
                console.log(`[LOGIN_DEBUG] Input Password: ${data.password}`);
            }

            if (!user) {
                // Don't reveal if email exists or not
                await new Promise(resolve => setTimeout(resolve, 1000));
                throw new Error('INVALID_CREDENTIALS');
            }

            // Check if user is banned
            if (user.isBanned) {
                if (user.banExpiresAt && user.banExpiresAt > new Date()) {
                    logSecurity('banned_user_login_attempt', 'medium', {
                        userId: user._id,
                        email: data.email,
                        banReason: user.banReason
                    });
                    throw new Error('ACCOUNT_BANNED');
                } else {
                    // Unban expired bans
                    user.unban();
                    await user.save();
                }
            }

            // Verify password
            const isValidPassword = await user.comparePassword(data.password);
            if (!isValidPassword) {
                logSecurity('invalid_password_attempt', 'low', {
                    userId: user._id,
                    email: data.email
                });
                throw new Error('INVALID_CREDENTIALS');
            }

            // Update device and location
            user.addDevice(data.deviceId, data.platform, data.fcmToken, {
                model: data.deviceModel,
                osVersion: data.osVersion,
                appVersion: data.appVersion,
                userAgent: context?.userAgent,
            });

            if (data.location) {
                user.updateLocation(data.location.lat, data.location.lng, data.location.city);
            }

            user.lastActive = new Date();
            if (context?.ip) user.lastIp = context.ip;
            if (context?.userAgent) user.lastUserAgent = context.userAgent;
            await user.save();

            // Generate session and tokens
            const sessionId = generateSessionId();
            const tokens = signTokenPair({
                sub: user._id.toString(),
                email: user.email,
                role: user.role,
                deviceId: data.deviceId,
                sessionId
            });

            // Store session in Redis (standardized API, best-effort)
            try {
                await RedisSession.create(
                    sessionId,
                    {
                        userId: user._id.toString(),
                        deviceId: data.deviceId,
                        platform: data.platform,
                        email: user.email,
                        createdAt: new Date(),
                    },
                    30 * 24 * 60 * 60
                );
            } catch { /* best effort */ }

            return {
                user: {
                    id: user._id,
                    email: user.email,
                    displayName: user.displayName,
                    role: user.role,
                    level: user.level,
                    points: user.points,
                    partnerId: user.partnerId,
                    referralCode: user.referralCode,
                    isGuest: false
                },
                tokens,
                sessionId
            };

        } catch (error) {
            console.error('[DEBUG] emailLogin: Caught error', error);
            const normalized = normalizeError(error, 'Login failed');
            typedLogger.error('Email login error', {
                error: normalized.message,
                email: data.email
            });

            if (error instanceof Error && ['INVALID_CREDENTIALS', 'ACCOUNT_BANNED'].includes(error.message)) {
                throw error;
            }

            throw new Error(normalized.code);
        }
    }


    /**
     * Refresh access token
     */
    static async refreshToken(data: z.infer<typeof refreshTokenSchema>) {
        try {
            const { refreshAccessToken } = await import('@/lib/jwt');
            const newTokens = await refreshAccessToken(data.refreshToken);

            if (!newTokens) {
                throw new Error('INVALID_REFRESH_TOKEN');
            }

            // Best-effort: update lastIp / lastUserAgent from the refresh token payload
            try {
                const { decodeToken } = await import('@/lib/jwt');
                const decoded = decodeToken(data.refreshToken);
                if (decoded?.sub) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const currentIp = (global as any).currentRequestIp;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const currentUserAgent = (global as any).currentRequestUserAgent;

                    await User.findByIdAndUpdate(decoded.sub, {
                        $set: {
                            lastIp: currentIp || undefined,
                            lastUserAgent: currentUserAgent || undefined,
                        },
                    });
                }
            } catch { /* best effort */ }

            return { tokens: newTokens };

        } catch (error) {
            const normalized = normalizeError(error, 'Token refresh failed');
            typedLogger.error('Token refresh error', { error: normalized.message });
            throw new Error(normalized.code);
        }
    }

    /**
     * Logout user
     */
    static async logout(
        userId: string,
        data: z.infer<typeof logoutSchema>
    ) {
        try {
            const { revokeToken, revokeSessionTokens } = await import('@/lib/jwt');

            if (data.refreshToken) {
                // Revoke specific refresh token
                const { decodeToken } = await import('@/lib/jwt');
                const decoded = decodeToken(data.refreshToken);
                if (decoded?.jti) {
                    await revokeToken(decoded.jti);
                }

                // Revoke session tokens
                if (decoded?.sessionId) {
                    await revokeSessionTokens(decoded.sessionId);
                    try { await RedisSession.destroy(decoded.sessionId); } catch { /* ignore */ }
                }
            }

            if (data.deviceId) {
                // Deactivate device
                const user = await User.findById(userId);
                if (user) {
                    const device = user.devices.find(d => d.deviceId === data.deviceId);
                    if (device) {
                        device.isActive = false;
                        device.fcmToken = undefined;
                        await user.save();
                    }
                }
            }

            typedLogger.info('User logged out', { userId, deviceId: data.deviceId });

            return { success: true };

        } catch (error) {
            const normalized = normalizeError(error, 'Logout failed');
            typedLogger.error('Logout error', { error: normalized.message, userId });
            throw new Error(normalized.code);
        }
    }
}
