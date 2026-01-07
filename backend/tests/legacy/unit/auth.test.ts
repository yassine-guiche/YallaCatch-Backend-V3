import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User } from '../../src/models/User';
import { AuthService } from '../../src/modules/auth';
import { generateKeyPair } from 'crypto';
import { promisify } from 'util';

const generateKeyPairAsync = promisify(generateKeyPair);

describe('AuthService', () => {
  let mongoServer: MongoMemoryServer;

  beforeEach(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Generate test keys
    const { privateKey, publicKey } = await generateKeyPairAsync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    process.env.JWT_PRIVATE_KEY_BASE64 = Buffer.from(privateKey).toString('base64');
    process.env.JWT_PUBLIC_KEY_BASE64 = Buffer.from(publicKey).toString('base64');
  });

  afterEach(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('registerUser', () => {
    it('should create a new user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        displayName: 'Test User',
        deviceId: 'device123',
        platform: 'ios' as const,
        fcmToken: 'fcm_token_123',
      };

      const result = await AuthService.registerUser(userData);

      expect(result.success).toBe(true);
      expect(result.user.email).toBe(userData.email);
      expect(result.user.displayName).toBe(userData.displayName);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();

      // Verify user was saved to database
      const savedUser = await User.findOne({ email: userData.email });
      expect(savedUser).toBeTruthy();
      expect(savedUser?.email).toBe(userData.email);
    });

    it('should reject duplicate email addresses', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        displayName: 'Test User',
        deviceId: 'device123',
        platform: 'ios' as const,
        fcmToken: 'fcm_token_123',
      };

      // Create first user
      await AuthService.registerUser(userData);

      // Try to create second user with same email
      await expect(AuthService.registerUser(userData))
        .rejects
        .toThrow('EMAIL_ALREADY_EXISTS');
    });

    it('should validate email format', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'password123',
        displayName: 'Test User',
        deviceId: 'device123',
        platform: 'ios' as const,
        fcmToken: 'fcm_token_123',
      };

      await expect(AuthService.registerUser(userData))
        .rejects
        .toThrow();
    });

    it('should validate password strength', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123', // Too short
        displayName: 'Test User',
        deviceId: 'device123',
        platform: 'ios' as const,
        fcmToken: 'fcm_token_123',
      };

      await expect(AuthService.registerUser(userData))
        .rejects
        .toThrow();
    });
  });

  describe('loginUser', () => {
    beforeEach(async () => {
      // Create a test user
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        displayName: 'Test User',
        deviceId: 'device123',
        platform: 'ios' as const,
        fcmToken: 'fcm_token_123',
      };
      await AuthService.registerUser(userData);
    });

    it('should login with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
        deviceId: 'device123',
        platform: 'ios' as const,
        fcmToken: 'fcm_token_123',
      };

      const result = await AuthService.loginUser(loginData);

      expect(result.success).toBe(true);
      expect(result.user.email).toBe(loginData.email);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should reject invalid email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123',
        deviceId: 'device123',
        platform: 'ios' as const,
        fcmToken: 'fcm_token_123',
      };

      await expect(AuthService.loginUser(loginData))
        .rejects
        .toThrow('INVALID_CREDENTIALS');
    });

    it('should reject invalid password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword',
        deviceId: 'device123',
        platform: 'ios' as const,
        fcmToken: 'fcm_token_123',
      };

      await expect(AuthService.loginUser(loginData))
        .rejects
        .toThrow('INVALID_CREDENTIALS');
    });

    it('should reject banned users', async () => {
      // Ban the user
      const user = await User.findOne({ email: 'test@example.com' });
      user!.ban('Test ban');
      await user!.save();

      const loginData = {
        email: 'test@example.com',
        password: 'password123',
        deviceId: 'device123',
        platform: 'ios' as const,
        fcmToken: 'fcm_token_123',
      };

      await expect(AuthService.loginUser(loginData))
        .rejects
        .toThrow('USER_BANNED');
    });
  });

  describe('createGuestUser', () => {
    it('should create a guest user', async () => {
      const guestData = {
        deviceId: 'device123',
        platform: 'android' as const,
        fcmToken: 'fcm_token_123',
      };

      const result = await AuthService.createGuestUser(guestData);

      expect(result.success).toBe(true);
      expect(result.user.email).toMatch(/^guest_/);
      expect(result.user.displayName).toMatch(/^Guest/);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();

      // Verify user was saved to database
      const savedUser = await User.findById(result.user.id);
      expect(savedUser).toBeTruthy();
      expect(savedUser?.role).toBe('user');
    });

    it('should generate unique guest emails', async () => {
      const guestData = {
        deviceId: 'device123',
        platform: 'android' as const,
        fcmToken: 'fcm_token_123',
      };

      const result1 = await AuthService.createGuestUser(guestData);
      const result2 = await AuthService.createGuestUser({
        ...guestData,
        deviceId: 'device456',
      });

      expect(result1.user.email).not.toBe(result2.user.email);
    });
  });

  describe('refreshToken', () => {
    let refreshToken: string;
    let userId: string;

    beforeEach(async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        displayName: 'Test User',
        deviceId: 'device123',
        platform: 'ios' as const,
        fcmToken: 'fcm_token_123',
      };
      const result = await AuthService.registerUser(userData);
      refreshToken = result.refreshToken;
      userId = result.user.id;
    });

    it('should refresh tokens with valid refresh token', async () => {
      const result = await AuthService.refreshToken(refreshToken);

      expect(result.success).toBe(true);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(refreshToken); // Should be rotated
    });

    it('should reject invalid refresh token', async () => {
      await expect(AuthService.refreshToken('invalid_token'))
        .rejects
        .toThrow('INVALID_REFRESH_TOKEN');
    });

    it('should reject expired refresh token', async () => {
      // Manually expire the session
      const user = await User.findById(userId);
      const session = user!.sessions.find(s => s.refreshToken === refreshToken);
      session!.expiresAt = new Date(Date.now() - 1000); // 1 second ago
      await user!.save();

      await expect(AuthService.refreshToken(refreshToken))
        .rejects
        .toThrow('REFRESH_TOKEN_EXPIRED');
    });
  });
});
