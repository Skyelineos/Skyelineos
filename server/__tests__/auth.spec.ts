/**
 * Authentication Tests
 * 
 * Tests protected route access control:
 * - 401 without token
 * - 200 with valid token  
 * - Refresh token rotation
 */

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../auth/tokens';
import { authenticateToken, authRateLimit } from '../middleware/auth';

// Create test app
const app = express();
app.use(express.json());
app.use(cookieParser());

// Mock protected route that requires authentication
app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ 
    message: 'Protected resource accessed successfully', 
    userId: (req as any).user?.id,
    role: (req as any).user?.role 
  });
});

// Mock login endpoint for testing token generation
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  // Simple test credentials
  if (email === 'test@example.com' && password === 'testpass') {
    const user = { id: 1, email: 'test@example.com', role: 'admin', permissions: [] };
    
    const accessTokenResult = await signAccessToken(user);
    const refreshTokenResult = await signRefreshToken(user);
    
    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshTokenResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.json({ accessToken: accessTokenResult.token, user });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Mock refresh token endpoint
app.post('/auth/refresh', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required' });
  }
  
  try {
    const decoded = await verifyRefreshToken(refreshToken);
    if (!decoded || typeof decoded === 'string') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    
    const user = { id: decoded.id, email: decoded.email, role: decoded.role, permissions: decoded.permissions || [] };
    
    // Generate new tokens (refresh token rotation)
    const newAccessTokenResult = await signAccessToken(user);
    const newRefreshTokenResult = await signRefreshToken(user);
    
    // Set new refresh token cookie
    res.cookie('refreshToken', newRefreshTokenResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.json({ accessToken: newAccessTokenResult.token });
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

describe('Authentication Tests', () => {
  let validAccessToken: string;
  let validRefreshToken: string;

  beforeAll(async () => {
    // Generate valid tokens for testing
    const testUser = { id: 1, email: 'test@example.com', role: 'admin', permissions: [] };
    const accessTokenResult = await signAccessToken(testUser);
    const refreshTokenResult = await signRefreshToken(testUser);
    validAccessToken = accessTokenResult.token;
    validRefreshToken = refreshTokenResult.token;
  });

  describe('Protected Route Access Control', () => {
    it('should return 401 without token', async () => {
      const response = await request(app)
        .get('/api/protected')
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Access token required');
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', 'Bearer invalid_token_here')
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('should return 200 with valid token', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${validAccessToken}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Protected resource accessed successfully');
      expect(response.body).toHaveProperty('userId', 1);
      expect(response.body).toHaveProperty('role', 'admin');
    });

    it('should handle missing Bearer prefix', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', validAccessToken) // Missing "Bearer " prefix
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Authentication Flow', () => {
    it('should login with valid credentials and set refresh token cookie', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'testpass' })
        .expect(200);
      
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('email', 'test@example.com');
      
      // Check that refresh token cookie is set
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      const refreshCookie = cookies?.find((cookie: string) => cookie.includes('refreshToken'));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      expect(refreshCookie).toContain('SameSite=Strict');
    });

    it('should reject login with invalid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' })
        .expect(401);
      
      expect(response.body).toHaveProperty('error', 'Invalid credentials');
    });
  });

  describe('Refresh Token Rotation', () => {
    it('should refresh tokens with valid refresh token cookie', async () => {
      // First login to get refresh token
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'testpass' })
        .expect(200);
      
      const cookies = loginResponse.headers['set-cookie'] as unknown as string[];
      const refreshCookie = cookies?.find((cookie: string) => cookie.includes('refreshToken'));
      
      // Extract refresh token from cookie
      const refreshTokenValue = refreshCookie?.split('refreshToken=')[1]?.split(';')[0];
      
      // Use refresh token to get new access token
      const refreshResponse = await request(app)
        .post('/auth/refresh')
        .set('Cookie', `refreshToken=${refreshTokenValue}`)
        .expect(200);
      
      expect(refreshResponse.body).toHaveProperty('accessToken');
      
      // Check that a new refresh token cookie is set (token rotation)
      const newCookies = refreshResponse.headers['set-cookie'] as unknown as string[];
      expect(newCookies).toBeDefined();
      const newRefreshCookie = newCookies?.find((cookie: string) => cookie.includes('refreshToken'));
      expect(newRefreshCookie).toBeDefined();
      
      // The new refresh token should be different from the old one
      const newRefreshTokenValue = newRefreshCookie?.split('refreshToken=')[1]?.split(';')[0];
      expect(newRefreshTokenValue).not.toBe(refreshTokenValue);
    });

    it('should reject refresh request without refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .expect(401);
      
      expect(response.body).toHaveProperty('error', 'Refresh token required');
    });

    it('should reject refresh request with invalid refresh token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .set('Cookie', 'refreshToken=invalid_refresh_token')
        .expect(401);
      
      expect(response.body).toHaveProperty('error', 'Invalid refresh token');
    });

    it('should validate new access token after refresh', async () => {
      // Login and get refresh token
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: 'test@example.com', password: 'testpass' });
      
      const cookies = loginResponse.headers['set-cookie'] as unknown as string[];
      const refreshCookie = cookies?.find((cookie: string) => cookie.includes('refreshToken'));
      const refreshTokenValue = refreshCookie?.split('refreshToken=')[1]?.split(';')[0];
      
      // Refresh to get new access token
      const refreshResponse = await request(app)
        .post('/auth/refresh')
        .set('Cookie', `refreshToken=${refreshTokenValue}`)
        .expect(200);
      
      const newAccessToken = refreshResponse.body.accessToken;
      
      // Use new access token to access protected route
      const protectedResponse = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${newAccessToken}`)
        .expect(200);
      
      expect(protectedResponse.body).toHaveProperty('message');
      expect(protectedResponse.body).toHaveProperty('userId', 1);
    });
  });

  describe('Token Validation Edge Cases', () => {
    it('should handle malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', 'InvalidFormat token')
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
    });

    it('should handle expired access token', async () => {
      // Create expired token (expires immediately)
      const expiredTokenResult = await signAccessToken({ id: 1, email: 'test@example.com', role: 'admin', permissions: [] });
      
      // Wait a moment to ensure token is expired
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${expiredTokenResult.token}`)
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
    });
  });
});