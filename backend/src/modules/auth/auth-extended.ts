import { User } from '@/models/User';
import { logger, logSecurity } from '@/lib/logger';
import { typedLogger } from '@/lib/typed-logger';
import { config } from '@/config';
import { RedisCache } from '@/config/redis';
import * as bcrypt from 'bcryptjs';

/**
 * Extended authentication services
 */
export class AuthExtendedService {
  /**
   * Verify email with token
   */
  static async verifyEmail(token: string) {
    try {
      // In a real implementation, this would verify the token against a stored verification token
      // For now, returning a placeholder implementation
      const userId = await RedisCache.get(`email_verification:${token}`);
      
      if (!userId) {
        throw new Error('INVALID_TOKEN');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      user.email = user.email; // This would mark email as verified in real implementation
      await user.save();

      await RedisCache.del(`email_verification:${token}`);

      return {
        success: true,
        message: 'Email verified successfully',
        data: { userId: user._id }
      };
    } catch (error) {
      typedLogger.error('Email verification error', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Resend email verification
   */
  static async resendEmailVerification(email: string) {
    try {
      const user = await User.findByEmail(email);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // In real implementation, generate a new verification token and send email
      const verificationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

      // Store token in Redis with expiration (24 hours)
      await RedisCache.set(`email_verification:${verificationToken}`, user._id.toString(), 24 * 60 * 60);

      // In real implementation, send email here
      typedLogger.info('Email verification sent', { userId: user._id, email });

      return {
        success: true,
        message: 'Verification email sent',
        data: { sentTo: email }
      };
    } catch (error) {
      typedLogger.error('Resend email verification error', { error: (error as Error).message, email });
      throw error;
    }
  }

  /**
   * Send phone verification code
   */
  static async sendPhoneVerification(phoneNumber: string, userId: string) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Generate verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store code in Redis with expiration (10 minutes)
      await RedisCache.set(`phone_verification:${phoneNumber}`, {
        userId,
        code: verificationCode,
        attempts: 0
      }, 10 * 60);

      // In real implementation, send SMS via Twilio or similar service
      typedLogger.info('Phone verification sent', { userId, phoneNumber });

      return {
        success: true,
        message: 'Verification code sent',
        data: { phoneNumber }
      };
    } catch (error) {
      typedLogger.error('Send phone verification error', { error: (error as Error).message, userId, phoneNumber });
      throw error;
    }
  }

  /**
   * Verify phone number with code
   */
  static async verifyPhone(phoneNumber: string, code: string, userId: string) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      const storedData = await RedisCache.get(`phone_verification:${phoneNumber}`);
      if (!storedData || storedData.code !== code) {
        throw new Error('INVALID_CODE');
      }

      // Check if code has expired (Redis handles this, but we can add additional checks)
      if (storedData.attempts >= 3) {
        throw new Error('TOO_MANY_ATTEMPTS');
      }

      // Update user with phone number
      user.phoneNumber = phoneNumber;
      await user.save();

      // Remove verification code
      await RedisCache.del(`phone_verification:${phoneNumber}`);

      typedLogger.info('Phone number verified', { userId, phoneNumber });

      return {
        success: true,
        message: 'Phone number verified successfully',
        data: { userId }
      };
    } catch (error) {
      typedLogger.error('Verify phone error', { error: (error as Error).message, userId, phoneNumber });

      // Increment attempts counter if invalid code
      if (error instanceof Error && error.message === 'INVALID_CODE') {
        const storedData = await RedisCache.get(`phone_verification:${phoneNumber}`);
        if (storedData) {
          storedData.attempts = (storedData.attempts || 0) + 1;
          await RedisCache.set(`phone_verification:${phoneNumber}`, storedData, 10 * 60);
        }
      }

      throw error;
    }
  }

  /**
   * Change user password
   */
  static async changePassword(userId: string, currentPassword: string, newPassword: string) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Check if password field exists
      if (!user.passwordHash) {
        throw new Error('PASSWORD_NOT_SET');
      }

      // Verify current password
      const isValidPassword = await user.comparePassword(currentPassword);
      if (!isValidPassword) {
        throw new Error('INVALID_CURRENT_PASSWORD');
      }

      // Validate new password
      if (newPassword.length < 8) {
        throw new Error('PASSWORD_TOO_SHORT');
      }

      // Hash new password - use bcrypt for portability
      user.passwordHash = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS || 12);

      await user.save();

      typedLogger.info('Password changed', { userId });

      return {
        success: true,
        message: 'Password changed successfully'
      };
    } catch (error) {
      typedLogger.error('Change password error', { error: (error as Error).message, userId });
      throw error;
    }
  }

  /**
   * Delete user account
   */
  static async deleteAccount(userId: string, password: string) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // Verify password
      if (user.passwordHash) {
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
          throw new Error('INVALID_PASSWORD');
        }
      }

      // Soft delete the user
      user.softDelete();
      await user.save();

      typedLogger.info('User account deleted', { userId });

      return {
        success: true,
        message: 'Account deleted successfully'
      };
    } catch (error) {
      typedLogger.error('Delete account error', { error: (error as Error).message, userId });
      throw error;
    }
  }
}

/**
 * Extended user services
 */
export class UserExtendedService {
  /**
   * Get user statistics
   */
  static async getUserStats(userId: string) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      return {
        id: user._id,
        level: user.level,
        points: user.points,
        stats: user.stats,
        levelProgress: {
          progress: user.levelProgress?.progress || 0,
          pointsToNext: user.levelProgress?.pointsToNext || 0,
          nextLevel: user.levelProgress?.nextLevel || null,
          currentLevel: user.level,
          pointsForNext: (user.levelProgress?.pointsToNext || 0) + user.points.total
        },
        createdAt: user.createdAt,
        lastActive: user.lastActive
      };
    } catch (error) {
      typedLogger.error('Get user stats error', { error: (error as Error).message, userId });
      throw error;
    }
  }

  /**
   * Upload user avatar
   */
  static async uploadAvatar(userId: string, avatar: unknown) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // In real implementation, upload avatar to cloud storage service (e.g., S3, Cloudinary)
      // For now, we'll generate a placeholder filename

      // Generate unique avatar filename
      const avatarFilename = `avatar_${userId}_${Date.now()}.jpg`;
      const avatarUrl = `/uploads/avatars/${avatarFilename}`;

      // Update user with avatar URL
      user.avatar = avatarUrl;
      await user.save();

      typedLogger.info('Avatar uploaded', { userId, avatar: avatarUrl });

      return {
        success: true,
        message: 'Avatar uploaded successfully',
        data: { avatarUrl }
      };
    } catch (error) {
      typedLogger.error('Upload avatar error', { error: (error as Error).message, userId });
      throw error;
    }
  }

  /**
   * Get user achievements
   */
  static async getUserAchievements(userId: string) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      // In a real implementation, this would fetch user-specific achievements from a separate collection
      // For now, returning placeholder achievements based on user stats
      const achievements = [];

      // Example achievements based on user activity
      if (user.stats.prizesFound >= 1) {
        achievements.push({ id: 'first_prize', name: 'First Prize', description: 'Found your first prize', earned: true });
      }
      if (user.stats.prizesFound >= 10) {
        achievements.push({ id: 'ten_prizes', name: 'Treasure Hunter', description: 'Found 10 prizes', earned: true });
      }
      if (user.points.total >= 1000) {
        achievements.push({ id: 'point_collector', name: 'Point Collector', description: 'Earned 1000 points', earned: true });
      }
      if (user.stats.currentStreak >= 7) {
        achievements.push({ id: 'streak_master', name: 'Streak Master', description: 'Maintained 7-day streak', earned: true });
      }

      return {
        achievements,
        totalEarned: achievements.filter(a => a.earned).length,
        userId
      };
    } catch (error) {
      typedLogger.error('Get user achievements error', { error: (error as Error).message, userId });
      throw error;
    }
  }
}
