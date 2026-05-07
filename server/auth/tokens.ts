import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

import { must } from '../middleware/requireEnv';
import { tokenRevocationService, TokenMetadata } from './tokenRevocation';
import { logger } from '../logger';

const JWT_SECRET = must('JWT_SECRET', 'dev-jwt-secret-not-for-production-32-chars-minimum');
const REFRESH_SECRET = must('REFRESH_SECRET', 'dev-refresh-secret-not-for-production-32-chars-minimum');

export interface AccessTokenPayload {
  id: number;
  email: string;
  role: string;
  permissions: string[];
  type: 'access';
  jti: string;
  deviceId?: string;
  sessionId?: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  id: number;
  email: string;
  role: string;
  permissions: string[];
  type: 'refresh';
  jti: string;
  deviceId?: string;
  sessionId?: string;
  familyId?: string;
  iat?: number;
  exp?: number;
}

// Device and session context for token creation
export interface TokenContext {
  deviceId?: string;
  deviceName?: string;
  userAgent?: string;
  ipAddress?: string;
  sessionId?: string;
  issuedBy?: 'login' | 'refresh' | 'firebase-exchange';
}

/**
 * Sign an access token with 15-minute expiration and store metadata
 */
export async function signAccessToken(
  payload: Omit<AccessTokenPayload, 'type' | 'jti'>,
  context?: TokenContext
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const jti = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes
  
  const tokenPayload: AccessTokenPayload = {
    ...payload,
    type: 'access',
    jti,
    deviceId: context?.deviceId,
    sessionId: context?.sessionId
  };
  
  const token = jwt.sign(tokenPayload, JWT_SECRET, {
    expiresIn: '15m',
    issuer: 'odyssey-api',
    audience: 'odyssey-client'
  });

  // Store token metadata in Redis
  try {
    const metadata: TokenMetadata = {
      userId: payload.id,
      email: payload.email,
      role: payload.role,
      jti,
      tokenType: 'access',
      deviceId: context?.deviceId || 'unknown',
      createdAt: now,
      lastUsed: now,
      expiresAt,
      userAgent: context?.userAgent,
      ipAddress: context?.ipAddress,
      issuedBy: context?.issuedBy || 'login'
    };
    
    await tokenRevocationService.storeTokenMetadata(metadata);
    
    logger.info('Access token issued', {
      userId: payload.id,
      jti: jti.substring(0, 8) + '...',
      deviceId: context?.deviceId,
      expiresAt
    });
  } catch (error) {
    logger.error('Failed to store access token metadata', { jti, error });
  }

  return { token, jti, expiresAt };
}

/**
 * Sign a refresh token with 7-day expiration and store metadata
 */
export async function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type' | 'jti'>,
  context?: TokenContext,
  familyId?: string
): Promise<{ token: string; jti: string; familyId: string; expiresAt: Date }> {
  const jti = randomUUID();
  const tokenFamilyId = familyId || randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  const tokenPayload: RefreshTokenPayload = {
    ...payload,
    type: 'refresh',
    jti,
    deviceId: context?.deviceId,
    sessionId: context?.sessionId,
    familyId: tokenFamilyId
  };
  
  const token = jwt.sign(tokenPayload, REFRESH_SECRET, {
    expiresIn: '7d',
    issuer: 'odyssey-api',
    audience: 'odyssey-client'
  });

  // Store token metadata in Redis
  try {
    const metadata: TokenMetadata = {
      userId: payload.id,
      email: payload.email,
      role: payload.role,
      jti,
      tokenType: 'refresh',
      deviceId: context?.deviceId || 'unknown',
      familyId: tokenFamilyId,
      createdAt: now,
      lastUsed: now,
      expiresAt,
      userAgent: context?.userAgent,
      ipAddress: context?.ipAddress,
      issuedBy: context?.issuedBy || 'login'
    };
    
    await tokenRevocationService.storeTokenMetadata(metadata);
    
    logger.info('Refresh token issued', {
      userId: payload.id,
      jti: jti.substring(0, 8) + '...',
      familyId: tokenFamilyId.substring(0, 8) + '...',
      deviceId: context?.deviceId,
      expiresAt
    });
  } catch (error) {
    logger.error('Failed to store refresh token metadata', { jti, error });
  }

  return { token, jti, familyId: tokenFamilyId, expiresAt };
}

/**
 * Verify and decode access token with Redis blacklist check
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: 'odyssey-api',
      audience: 'odyssey-client'
    }) as AccessTokenPayload;
    
    if (payload.type !== 'access') {
      logger.debug('Invalid token type for access token', { type: payload.type });
      return null;
    }
    
    // Check if token is revoked in Redis
    const isRevoked = await tokenRevocationService.isTokenRevoked(payload.jti);
    if (isRevoked) {
      logger.info('Access token is revoked', { 
        jti: payload.jti.substring(0, 8) + '...',
        userId: payload.id 
      });
      return null;
    }
    
    return payload;
  } catch (error) {
    logger.warn('Access token verification failed', { 
      error: (error as Error).message 
    });
    return null;
  }
}

/**
 * Verify and decode refresh token with Redis blacklist check
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  try {
    const payload = jwt.verify(token, REFRESH_SECRET, {
      issuer: 'odyssey-api',
      audience: 'odyssey-client'
    }) as RefreshTokenPayload;
    
    if (payload.type !== 'refresh') {
      logger.debug('Invalid token type for refresh token', { type: payload.type });
      return null;
    }
    
    // Check if token is revoked in Redis
    const isRevoked = await tokenRevocationService.isTokenRevoked(payload.jti);
    if (isRevoked) {
      logger.info('Refresh token is revoked', { 
        jti: payload.jti.substring(0, 8) + '...',
        userId: payload.id 
      });
      return null;
    }
    
    return payload;
  } catch (error) {
    logger.warn('Refresh token verification failed', { 
      error: (error as Error).message 
    });
    return null;
  }
}

/**
 * Revoke a token using Redis-based revocation service
 */
export async function revokeToken(
  jti: string, 
  tokenType: 'access' | 'refresh' = 'access',
  reason: string = 'Manual revocation',
  revokedBy?: number
): Promise<boolean> {
  return await tokenRevocationService.revokeToken(jti, tokenType, reason, revokedBy);
}

/**
 * Check if a token is revoked using Redis
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  return await tokenRevocationService.isTokenRevoked(jti);
}

/**
 * Refresh token rotation with theft detection
 */
export async function rotateRefreshToken(
  oldToken: string,
  newTokenData: Omit<RefreshTokenPayload, 'type' | 'jti'>,
  context?: TokenContext
): Promise<{ token: string; jti: string; familyId: string } | null> {
  try {
    // Verify the old token first
    const oldPayload = await verifyRefreshToken(oldToken);
    if (!oldPayload) {
      logger.warn('Cannot rotate invalid refresh token');
      return null;
    }

    // Use the token revocation service to rotate
    const result = await tokenRevocationService.rotateRefreshToken(oldPayload.jti, {
      userId: newTokenData.id,
      email: newTokenData.email,
      role: newTokenData.role,
      deviceId: context?.deviceId || 'unknown',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      userAgent: context?.userAgent,
      ipAddress: context?.ipAddress,
      issuedBy: 'refresh'
    });

    if (!result) {
      return null;
    }

    // Create new JWT token
    const newTokenPayload: RefreshTokenPayload = {
      ...newTokenData,
      type: 'refresh',
      jti: result.newJti,
      familyId: result.familyId,
      deviceId: context?.deviceId,
      sessionId: context?.sessionId
    };

    const newToken = jwt.sign(newTokenPayload, REFRESH_SECRET, {
      expiresIn: '7d',
      issuer: 'odyssey-api',
      audience: 'odyssey-client'
    });

    return {
      token: newToken,
      jti: result.newJti,
      familyId: result.familyId
    };
  } catch (error) {
    logger.error('Failed to rotate refresh token', { error });
    return null;
  }
}

/**
 * Revoke all tokens for a user (logout from all devices)
 */
export async function revokeAllUserTokens(
  userId: number,
  reason: string = 'Logout all devices',
  revokedBy?: number
): Promise<{ revokedTokens: number; revokedSessions: number }> {
  return await tokenRevocationService.revokeAllUserTokens(userId, reason, revokedBy);
}

/**
 * Get revocation statistics for monitoring
 */
export async function getTokenStats(): Promise<{
  totalBlacklisted: number;
  activeSessions: number;
  securityEvents: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
}> {
  return await tokenRevocationService.getRevocationStats();
}

/**
 * Generate device ID from request information
 */
export function generateDeviceId(userAgent?: string, ipAddress?: string): string {
  const deviceString = `${userAgent || 'unknown'}-${ipAddress || 'unknown'}`;
  return Buffer.from(deviceString).toString('base64').substring(0, 16);
}

/**
 * Extract device name from user agent
 */
export function extractDeviceName(userAgent?: string): string {
  if (!userAgent) return 'Unknown Device';
  
  // Simple device detection
  if (userAgent.includes('Mobile')) return 'Mobile Device';
  if (userAgent.includes('Tablet')) return 'Tablet';
  if (userAgent.includes('Chrome')) return 'Chrome Browser';
  if (userAgent.includes('Firefox')) return 'Firefox Browser';
  if (userAgent.includes('Safari')) return 'Safari Browser';
  
  return 'Desktop Browser';
}