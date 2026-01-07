import jwt, { Algorithm } from 'jsonwebtoken';
import { typedLogger } from '@/lib/typed-logger';
import { config, jwtPrivateKey, jwtPublicKey } from '@/config';
import { logger, logSecurity } from './logger';
import { RedisCache } from '@/config/redis';
import crypto from 'crypto';

// JWT payload interface
export interface JWTPayload {
  sub: string; // User ID
  email?: string;
  role: string;
  deviceId?: string;
  sessionId: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
  jti?: string; // JWT ID for revocation
}

// Token pair interface
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

// JWT verification result
export interface JWTVerificationResult {
  valid: boolean;
  expired: boolean;
  decoded: JWTPayload | null;
  error?: string;
}

/**
 * Generate a unique JWT ID
 */
const generateJTI = (): string => {
  return crypto.randomBytes(16).toString('hex');
};

/**
 * Sign JWT access token
 */
export const signAccessToken = (payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud' | 'jti'>): string => {
  const jti = generateJTI();
  const tokenPayload: JWTPayload = {
    ...payload,
    iss: config.JWT_ISSUER,
    aud: config.JWT_AUDIENCE,
    jti,
  };

  try {
    const token = jwt.sign(
      tokenPayload,
      jwtPrivateKey,
      {
        algorithm: 'RS256' as jwt.Algorithm | undefined,
        expiresIn: config.JWT_ACCESS_EXPIRY || '15m',
      } as jwt.SignOptions
    );

    // Store JTI for potential revocation
    RedisCache.set(`jti:${jti}`, { userId: payload.sub, type: 'access' }, 15 * 60); // 15 minutes
    // Track in user/session sets for bulk revocation
    RedisCache.sadd(`user_tokens:${payload.sub}`, jti, 15 * 60);
    if (payload.sessionId) {
      RedisCache.sadd(`session_tokens:${payload.sessionId}`, jti, 15 * 60);
    }

    typedLogger.debug('Access token signed', { userId: payload.sub, jti });
    return token;
  } catch (error) {
    typedLogger.error('Error signing access token', { error: (error as any).message, userId: payload.sub });
    throw new Error('Failed to sign access token');
  }
};

/**
 * Sign JWT refresh token
 */
export const signRefreshToken = (payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud' | 'jti'>): string => {
  const jti = generateJTI();
  const tokenPayload: JWTPayload = {
    ...payload,
    iss: config.JWT_ISSUER,
    aud: config.JWT_AUDIENCE,
    jti,
  };

  try {
    const token = jwt.sign(
      tokenPayload,
      jwtPrivateKey,
      {
        algorithm: 'RS256' as jwt.Algorithm | undefined,
        expiresIn: config.JWT_REFRESH_EXPIRY || '30d',
      } as jwt.SignOptions
    );

    // Store JTI for potential revocation (longer TTL for refresh tokens)
    const refreshTtl = 30 * 24 * 60 * 60; // 30 days
    RedisCache.set(`jti:${jti}`, { userId: payload.sub, type: 'refresh' }, refreshTtl);
    // Track in user/session sets
    RedisCache.sadd(`user_tokens:${payload.sub}`, jti, refreshTtl);
    if (payload.sessionId) {
      RedisCache.sadd(`session_tokens:${payload.sessionId}`, jti, refreshTtl);
    }

    typedLogger.debug('Refresh token signed', { userId: payload.sub, jti });
    return token;
  } catch (error) {
    typedLogger.error('Error signing refresh token', { error: (error as any).message, userId: payload.sub });
    throw new Error('Failed to sign refresh token');
  }
};

/**
 * Sign token pair (access + refresh)
 */
export const signTokenPair = (payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud' | 'jti'>): TokenPair => {
  try {
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // Parse expiry time
    const decoded = jwt.decode(accessToken) as JWTPayload;
    const expiresIn = decoded.exp! - Math.floor(Date.now() / 1000);

    typedLogger.info('Token pair generated', { userId: payload.sub, sessionId: payload.sessionId });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  } catch (error) {
    typedLogger.error('Error generating token pair', { error: (error as any).message, userId: payload.sub });
    throw new Error('Failed to generate token pair');
  }
};

/**
 * Verify JWT token
 */
export const verifyToken = async (token: string): Promise<JWTVerificationResult> => {
  try {
    const decoded = jwt.verify(token, jwtPublicKey, {
      algorithms: ['RS256'],
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
    }) as JWTPayload;

    // Check if token is revoked
    if (decoded.jti) {
      const isRevoked = await RedisCache.exists(`revoked:${decoded.jti}`);
      if (isRevoked) {
        logSecurity('revoked_token_used', 'medium', { jti: decoded.jti, userId: decoded.sub });
        return {
          valid: false,
          expired: false,
          decoded: null,
          error: 'Token has been revoked',
        };
      }
    }

    return {
      valid: true,
      expired: false,
      decoded,
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return {
        valid: false,
        expired: true,
        decoded: null,
        error: 'Token has expired',
      };
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logSecurity('invalid_token_used', 'medium', { error: (error as any).message });
      return {
        valid: false,
        expired: false,
        decoded: null,
        error: 'Invalid token',
      };
    }

    typedLogger.error('JWT verification error', { error: (error as any).message });
    return {
      valid: false,
      expired: false,
      decoded: null,
      error: 'Token verification failed',
    };
  }
};

/**
 * Refresh access token using refresh token
 */
export const refreshAccessToken = async (refreshToken: string): Promise<TokenPair | null> => {
  try {
    const verificationResult = await verifyToken(refreshToken);
    
    if (!verificationResult.valid || !verificationResult.decoded) {
      logSecurity('invalid_refresh_token', 'medium', { error: verificationResult.error });
      return null;
    }

    const { sub, email, role, deviceId, sessionId } = verificationResult.decoded;

    // Generate new token pair
    const newTokenPair = signTokenPair({
      sub,
      email,
      role,
      deviceId,
      sessionId,
    });

    // Revoke old refresh token
    if (verificationResult.decoded.jti) {
      await revokeToken(verificationResult.decoded.jti);
    }

    typedLogger.info('Access token refreshed', { userId: sub, sessionId });
    return newTokenPair;
  } catch (error) {
    typedLogger.error('Error refreshing access token', { error: (error as any).message });
    return null;
  }
};

/**
 * Revoke a token by JTI
 */
export const revokeToken = async (jti: string): Promise<void> => {
  try {
    // Add to revocation list with a TTL matching the token's max lifetime
    await RedisCache.set(`revoked:${jti}`, true, 30 * 24 * 60 * 60); // 30 days
    
    // Remove from active JTI list
    await RedisCache.del(`jti:${jti}`);
    
    typedLogger.info('Token revoked', { jti });
  } catch (error) {
    typedLogger.error('Error revoking token', { error: (error as any).message, jti });
    throw new Error('Failed to revoke token');
  }
};

/**
 * Revoke all tokens for a user
 */
export const revokeAllUserTokens = async (userId: string): Promise<void> => {
  try {
    // Get all active JTIs for the user
    const pattern = `jti:*`;
    const keys = await RedisCache.smembers(`user_tokens:${userId}`);
    
    // Revoke each token
    const revokePromises = keys.map(jti => revokeToken(jti));
    await Promise.all(revokePromises);
    
    // Clear user token list
    await RedisCache.del(`user_tokens:${userId}`);
    
    typedLogger.info('All user tokens revoked', { userId, count: keys.length });
  } catch (error) {
    typedLogger.error('Error revoking all user tokens', { error: (error as any).message, userId });
    throw new Error('Failed to revoke user tokens');
  }
};

/**
 * Revoke all tokens for a session
 */
export const revokeSessionTokens = async (sessionId: string): Promise<void> => {
  try {
    // Get all active JTIs for the session
    const keys = await RedisCache.smembers(`session_tokens:${sessionId}`);
    
    // Revoke each token
    const revokePromises = keys.map(jti => revokeToken(jti));
    await Promise.all(revokePromises);
    
    // Clear session token list
    await RedisCache.del(`session_tokens:${sessionId}`);
    
    typedLogger.info('All session tokens revoked', { sessionId, count: keys.length });
  } catch (error) {
    typedLogger.error('Error revoking session tokens', { error: (error as any).message, sessionId });
    throw new Error('Failed to revoke session tokens');
  }
};

/**
 * Extract token from Authorization header
 */
export const extractTokenFromHeader = (authHeader?: string): string | null => {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
};

/**
 * Decode token without verification (for debugging)
 */
export const decodeToken = (token: string): JWTPayload | null => {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    typedLogger.error('Error decoding token', { error: (error as any).message });
    return null;
  }
};

/**
 * Get token expiration time
 */
export const getTokenExpiration = (token: string): Date | null => {
  try {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.exp) {
      return null;
    }
    return new Date(decoded.exp * 1000);
  } catch (error) {
    typedLogger.error('Error getting token expiration', { error: (error as any).message });
    return null;
  }
};

/**
 * Check if token is expired
 */
export const isTokenExpired = (token: string): boolean => {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return true;
  }
  return expiration.getTime() < Date.now();
};

/**
 * Get remaining token lifetime in seconds
 */
export const getTokenRemainingLifetime = (token: string): number => {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return 0;
  }
  return Math.max(0, Math.floor((expiration.getTime() - Date.now()) / 1000));
};

/**
 * Validate token format
 */
export const isValidTokenFormat = (token: string): boolean => {
  if (!token || typeof token !== 'string') {
    return false;
  }

  // JWT should have 3 parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }

  // Each part should be valid base64
  try {
    parts.forEach(part => {
      Buffer.from(part, 'base64');
    });
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Generate secure session ID
 */
export const generateSessionId = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Hash sensitive data for logging
 */
export const hashForLogging = (data: string): string => {
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 8);
};
