import { randomUUID } from 'crypto';
import { cacheService } from '../cache';
import { logger } from '../logger';

// Token metadata interface for comprehensive session tracking
export interface TokenMetadata {
  userId: number;
  email: string;
  role: string;
  jti: string;
  tokenType: 'access' | 'refresh';
  deviceId: string;
  familyId?: string; // For refresh token rotation tracking
  createdAt: Date;
  lastUsed: Date;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
  issuedBy: 'login' | 'refresh' | 'firebase-exchange';
}

// Session information for user devices
export interface UserSession {
  sessionId: string;
  userId: number;
  email: string;
  deviceId: string;
  deviceName: string;
  userAgent: string;
  ipAddress: string;
  createdAt: Date;
  lastActive: Date;
  accessTokenJti?: string;
  refreshTokenJti?: string;
}

// Redis key patterns for organized token storage
export const TokenKeys = {
  // Token blacklist with TTL
  blacklist: (jti: string) => `auth:blacklist:${jti}`,
  
  // User's active tokens (for bulk revocation)
  userTokens: (userId: number) => `auth:user:${userId}:tokens`,
  
  // Active sessions for a user
  userSessions: (userId: number) => `auth:user:${userId}:sessions`,
  
  // Session details
  session: (sessionId: string) => `auth:session:${sessionId}`,
  
  // Refresh token families for rotation tracking
  refreshFamily: (familyId: string) => `auth:refresh_family:${familyId}`,
  
  // Token metadata
  tokenMeta: (jti: string) => `auth:token_meta:${jti}`,
  
  // Device tracking
  device: (deviceId: string) => `auth:device:${deviceId}`,
  
  // Security events
  securityEvent: (userId: number, eventId: string) => `auth:security:${userId}:${eventId}`
};

/**
 * Enterprise-grade Token Revocation Service
 * Handles token blacklisting, session management, and security monitoring
 */
class TokenRevocationService {
  private static instance: TokenRevocationService;
  
  // TTL constants (in seconds)
  private readonly ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes
  private readonly REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days
  private readonly SESSION_TTL = 30 * 24 * 60 * 60; // 30 days
  private readonly SECURITY_EVENT_TTL = 90 * 24 * 60 * 60; // 90 days
  
  // Singleton pattern for global access
  public static getInstance(): TokenRevocationService {
    if (!TokenRevocationService.instance) {
      TokenRevocationService.instance = new TokenRevocationService();
    }
    return TokenRevocationService.instance;
  }

  /**
   * Check if a token is revoked (blacklisted)
   */
  async isTokenRevoked(jti: string): Promise<boolean> {
    try {
      const blacklistEntry = await cacheService.get(TokenKeys.blacklist(jti));
      return blacklistEntry !== null;
    } catch (error) {
      logger.error('Error checking token revocation status', { jti, error });
      // Fail secure - if we can't check, assume revoked
      return true;
    }
  }

  /**
   * Revoke a single token by adding it to blacklist
   */
  async revokeToken(
    jti: string, 
    tokenType: 'access' | 'refresh',
    reason: string = 'Manual revocation',
    revokedBy?: number
  ): Promise<boolean> {
    try {
      const ttl = tokenType === 'access' ? this.ACCESS_TOKEN_TTL : this.REFRESH_TOKEN_TTL;
      const revocationData = {
        jti,
        tokenType,
        reason,
        revokedBy,
        revokedAt: new Date().toISOString()
      };

      await cacheService.set(TokenKeys.blacklist(jti), revocationData, ttl);
      
      logger.info('Token revoked successfully', {
        jti: jti.substring(0, 8) + '...',
        tokenType,
        reason,
        revokedBy
      });

      return true;
    } catch (error) {
      logger.error('Failed to revoke token', { jti, tokenType, error });
      return false;
    }
  }

  /**
   * Store token metadata for comprehensive tracking
   */
  async storeTokenMetadata(metadata: TokenMetadata): Promise<boolean> {
    try {
      const ttl = metadata.tokenType === 'access' ? this.ACCESS_TOKEN_TTL : this.REFRESH_TOKEN_TTL;
      await cacheService.set(TokenKeys.tokenMeta(metadata.jti), metadata, ttl);
      
      // Add to user's active tokens list
      const userTokensKey = TokenKeys.userTokens(metadata.userId);
      const userTokens = await cacheService.get<string[]>(userTokensKey) || [];
      userTokens.push(metadata.jti);
      await cacheService.set(userTokensKey, userTokens, this.SESSION_TTL);

      return true;
    } catch (error) {
      logger.error('Failed to store token metadata', { jti: metadata.jti, error });
      return false;
    }
  }

  /**
   * Create or update user session
   */
  async createSession(sessionData: Omit<UserSession, 'sessionId' | 'createdAt' | 'lastActive'>): Promise<string> {
    try {
      const sessionId = randomUUID();
      const session: UserSession = {
        ...sessionData,
        sessionId,
        createdAt: new Date(),
        lastActive: new Date()
      };

      // Store session data
      await cacheService.set(TokenKeys.session(sessionId), session, this.SESSION_TTL);
      
      // Add to user's active sessions
      const userSessionsKey = TokenKeys.userSessions(sessionData.userId);
      const userSessions = await cacheService.get<string[]>(userSessionsKey) || [];
      userSessions.push(sessionId);
      await cacheService.set(userSessionsKey, userSessions, this.SESSION_TTL);

      logger.info('User session created', {
        userId: sessionData.userId,
        sessionId: sessionId.substring(0, 8) + '...',
        deviceId: sessionData.deviceId
      });

      return sessionId;
    } catch (error) {
      logger.error('Failed to create session', { userId: sessionData.userId, error });
      throw error;
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string, accessTokenJti?: string): Promise<void> {
    try {
      const session = await cacheService.get<UserSession>(TokenKeys.session(sessionId));
      if (session) {
        session.lastActive = new Date();
        if (accessTokenJti) {
          session.accessTokenJti = accessTokenJti;
        }
        await cacheService.set(TokenKeys.session(sessionId), session, this.SESSION_TTL);
      }
    } catch (error) {
      logger.error('Failed to update session activity', { sessionId, error });
    }
  }

  /**
   * Revoke all tokens for a specific user (logout from all devices)
   */
  async revokeAllUserTokens(
    userId: number,
    reason: string = 'Logout all devices',
    revokedBy?: number
  ): Promise<{ revokedTokens: number; revokedSessions: number }> {
    try {
      let revokedTokens = 0;
      let revokedSessions = 0;

      // Get all user tokens
      const userTokensKey = TokenKeys.userTokens(userId);
      const userTokens = await cacheService.get<string[]>(userTokensKey) || [];

      // Revoke each token
      for (const jti of userTokens) {
        const metadata = await cacheService.get<TokenMetadata>(TokenKeys.tokenMeta(jti));
        if (metadata && !await this.isTokenRevoked(jti)) {
          await this.revokeToken(jti, metadata.tokenType, reason, revokedBy);
          revokedTokens++;
        }
      }

      // Get all user sessions and revoke them
      const userSessionsKey = TokenKeys.userSessions(userId);
      const userSessions = await cacheService.get<string[]>(userSessionsKey) || [];

      for (const sessionId of userSessions) {
        await cacheService.del(TokenKeys.session(sessionId));
        revokedSessions++;
      }

      // Clear user's token and session lists
      await cacheService.del(userTokensKey);
      await cacheService.del(userSessionsKey);

      // Log security event
      await this.logSecurityEvent(userId, 'BULK_TOKEN_REVOCATION', {
        reason,
        revokedTokens,
        revokedSessions,
        revokedBy
      });

      logger.info('All user tokens revoked', {
        userId,
        revokedTokens,
        revokedSessions,
        reason
      });

      return { revokedTokens, revokedSessions };
    } catch (error) {
      logger.error('Failed to revoke all user tokens', { userId, error });
      throw error;
    }
  }

  /**
   * Refresh token rotation - create new refresh token and revoke old one
   */
  async rotateRefreshToken(
    oldJti: string,
    newTokenData: Omit<TokenMetadata, 'jti' | 'createdAt' | 'tokenType'>
  ): Promise<{ newJti: string; familyId: string } | null> {
    try {
      // Get old token metadata
      const oldMetadata = await cacheService.get<TokenMetadata>(TokenKeys.tokenMeta(oldJti));
      if (!oldMetadata) {
        logger.warn('Old refresh token metadata not found', { oldJti });
        return null;
      }

      // Check if old token is already revoked
      if (await this.isTokenRevoked(oldJti)) {
        logger.warn('Attempting to rotate already revoked token', { oldJti });
        
        // If token is revoked, this might indicate token theft
        // Revoke all tokens in the same family
        if (oldMetadata.familyId) {
          await this.revokeFreshTokenFamily(oldMetadata.familyId, 'Possible token theft detected');
        }
        
        return null;
      }

      // Generate new token identifiers
      const newJti = randomUUID();
      const familyId = oldMetadata.familyId || randomUUID();

      // Create new token metadata
      const newMetadata: TokenMetadata = {
        ...newTokenData,
        jti: newJti,
        tokenType: 'refresh',
        familyId,
        createdAt: new Date(),
        lastUsed: new Date(),
        issuedBy: 'refresh'
      };

      // Store new token metadata
      await this.storeTokenMetadata(newMetadata);

      // Add to refresh family tracking
      const familyKey = TokenKeys.refreshFamily(familyId);
      const familyTokens = await cacheService.get<string[]>(familyKey) || [];
      familyTokens.push(newJti);
      await cacheService.set(familyKey, familyTokens, this.REFRESH_TOKEN_TTL);

      // Revoke the old refresh token
      await this.revokeToken(oldJti, 'refresh', 'Token rotation');

      // Log successful rotation
      logger.info('Refresh token rotated successfully', {
        userId: newMetadata.userId,
        oldJti: oldJti.substring(0, 8) + '...',
        newJti: newJti.substring(0, 8) + '...',
        familyId: familyId.substring(0, 8) + '...'
      });

      return { newJti, familyId };
    } catch (error) {
      logger.error('Failed to rotate refresh token', { oldJti, error });
      return null;
    }
  }

  /**
   * Revoke all tokens in a refresh token family (for theft detection)
   */
  async revokeFreshTokenFamily(
    familyId: string,
    reason: string = 'Security breach detected'
  ): Promise<number> {
    try {
      const familyKey = TokenKeys.refreshFamily(familyId);
      const familyTokens = await cacheService.get<string[]>(familyKey) || [];
      let revokedCount = 0;

      for (const jti of familyTokens) {
        if (!await this.isTokenRevoked(jti)) {
          await this.revokeToken(jti, 'refresh', reason);
          revokedCount++;
        }
      }

      // Clear the family tracking
      await cacheService.del(familyKey);

      // Log security event
      logger.warn('Refresh token family revoked', {
        familyId: familyId.substring(0, 8) + '...',
        revokedCount,
        reason
      });

      return revokedCount;
    } catch (error) {
      logger.error('Failed to revoke refresh token family', { familyId, error });
      return 0;
    }
  }

  /**
   * Get user's active sessions
   */
  async getUserSessions(userId: number): Promise<UserSession[]> {
    try {
      const userSessionsKey = TokenKeys.userSessions(userId);
      const sessionIds = await cacheService.get<string[]>(userSessionsKey) || [];
      const sessions: UserSession[] = [];

      for (const sessionId of sessionIds) {
        const session = await cacheService.get<UserSession>(TokenKeys.session(sessionId));
        if (session) {
          sessions.push(session);
        }
      }

      return sessions;
    } catch (error) {
      logger.error('Failed to get user sessions', { userId, error });
      return [];
    }
  }

  /**
   * Revoke specific session
   */
  async revokeSession(
    sessionId: string,
    reason: string = 'Manual session termination'
  ): Promise<boolean> {
    try {
      const session = await cacheService.get<UserSession>(TokenKeys.session(sessionId));
      if (!session) {
        return false;
      }

      // Revoke associated tokens
      if (session.accessTokenJti) {
        await this.revokeToken(session.accessTokenJti, 'access', reason);
      }
      if (session.refreshTokenJti) {
        await this.revokeToken(session.refreshTokenJti, 'refresh', reason);
      }

      // Remove session
      await cacheService.del(TokenKeys.session(sessionId));

      // Remove from user's active sessions
      const userSessionsKey = TokenKeys.userSessions(session.userId);
      const userSessions = await cacheService.get<string[]>(userSessionsKey) || [];
      const updatedSessions = userSessions.filter(id => id !== sessionId);
      await cacheService.set(userSessionsKey, updatedSessions, this.SESSION_TTL);

      logger.info('Session revoked', {
        sessionId: sessionId.substring(0, 8) + '...',
        userId: session.userId,
        reason
      });

      return true;
    } catch (error) {
      logger.error('Failed to revoke session', { sessionId, error });
      return false;
    }
  }

  /**
   * Log security events for monitoring and auditing
   */
  async logSecurityEvent(
    userId: number,
    eventType: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      const eventId = randomUUID();
      const securityEvent = {
        eventId,
        userId,
        eventType,
        details,
        timestamp: new Date().toISOString(),
        ipAddress: details.ipAddress,
        userAgent: details.userAgent
      };

      await cacheService.set(
        TokenKeys.securityEvent(userId, eventId),
        securityEvent,
        this.SECURITY_EVENT_TTL
      );

      logger.info('Security event logged', {
        userId,
        eventType,
        eventId: eventId.substring(0, 8) + '...'
      });
    } catch (error) {
      logger.error('Failed to log security event', { userId, eventType, error });
    }
  }

  /**
   * Get revocation statistics for monitoring
   */
  async getRevocationStats(): Promise<{
    totalBlacklisted: number;
    activeSessions: number;
    securityEvents: number;
    healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  }> {
    try {
      const cacheStats = await cacheService.getStats();
      const healthCheck = await cacheService.healthCheck();

      return {
        totalBlacklisted: 0, // Would need to scan Redis keys in production
        activeSessions: 0,   // Would need to scan Redis keys in production  
        securityEvents: 0,   // Would need to scan Redis keys in production
        healthStatus: healthCheck.healthy ? 'healthy' : 'unhealthy'
      };
    } catch (error) {
      logger.error('Failed to get revocation stats', { error });
      return {
        totalBlacklisted: 0,
        activeSessions: 0,
        securityEvents: 0,
        healthStatus: 'unhealthy'
      };
    }
  }

  /**
   * Cleanup expired entries (run periodically)
   */
  async cleanupExpiredEntries(): Promise<void> {
    // Redis TTL handles this automatically, but we can log cleanup events
    logger.debug('Token revocation cleanup completed - Redis TTL handles automatic expiration');
  }
}

// Export singleton instance
export const tokenRevocationService = TokenRevocationService.getInstance();

// Export types
export type { TokenMetadata, UserSession };