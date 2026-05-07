/**
 * CSRF Protection Tests
 */

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { csrfProtection, generateCSRFToken } from '../middleware/csrf';

describe('CSRF Protection Middleware', () => {
  let app: express.Application;
  
  beforeEach(() => {
    app = express();
    app.use(cookieParser());
    app.use(csrfProtection);
    app.use(express.json());
    
    // Test routes
    app.get('/api/test', (req, res) => {
      res.json({ message: 'GET request successful' });
    });
    
    app.post('/api/test', (req, res) => {
      res.json({ message: 'POST request successful' });
    });
    
    app.put('/api/protected', (req, res) => {
      res.json({ message: 'Protected resource updated' });
    });
  });

  describe('Safe Methods (GET, HEAD, OPTIONS)', () => {
    it('should allow GET requests without CSRF token', async () => {
      const response = await request(app)
        .get('/api/test');
        
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('GET request successful');
    });

    it('should allow HEAD requests without CSRF token', async () => {
      const response = await request(app)
        .head('/api/test');
        
      expect(response.status).toBe(200);
    });

    it('should allow OPTIONS requests without CSRF token', async () => {
      const response = await request(app)
        .options('/api/test');
        
      expect(response.status).toBe(200);
    });
  });

  describe('Unsafe Methods (POST, PUT, DELETE, PATCH)', () => {
    it('should allow POST requests without cookies', async () => {
      const response = await request(app)
        .post('/api/test')
        .send({ data: 'test' });
        
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('POST request successful');
    });

    it('should block POST requests with cookies but no CSRF token', async () => {
      const csrfToken = generateCSRFToken();
      
      const response = await request(app)
        .post('/api/test')
        .set('Cookie', [`csrfToken=${csrfToken}`, 'refreshToken=sometoken'])
        .send({ data: 'test' });
        
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('CSRF token required');
      expect(response.body.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('should block POST requests with mismatched CSRF tokens', async () => {
      const csrfToken = generateCSRFToken();
      const wrongToken = generateCSRFToken();
      
      const response = await request(app)
        .post('/api/test')
        .set('Cookie', [`csrfToken=${csrfToken}`, 'refreshToken=sometoken'])
        .set('X-CSRF-Token', wrongToken)
        .send({ data: 'test' });
        
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Invalid CSRF token');
      expect(response.body.code).toBe('CSRF_TOKEN_MISMATCH');
    });

    it('should allow POST requests with valid CSRF token and cookies', async () => {
      const csrfToken = generateCSRFToken();
      
      const response = await request(app)
        .post('/api/test')
        .set('Cookie', [`csrfToken=${csrfToken}`, 'refreshToken=sometoken'])
        .set('X-CSRF-Token', csrfToken)
        .send({ data: 'test' });
        
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('POST request successful');
    });

    it('should allow PUT requests with valid CSRF token and cookies', async () => {
      const csrfToken = generateCSRFToken();
      
      const response = await request(app)
        .put('/api/protected')
        .set('Cookie', [`csrfToken=${csrfToken}`, 'refreshToken=sometoken'])
        .set('X-CSRF-Token', csrfToken)
        .send({ data: 'update' });
        
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Protected resource updated');
    });
  });

  describe('Development Mode Bypass', () => {
    beforeEach(() => {
      // Set development mode
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      // Reset to production for other tests
      process.env.NODE_ENV = 'production';
    });

    it('should bypass CSRF validation in development with bypass header', async () => {
      const response = await request(app)
        .post('/api/test')
        .set('Cookie', ['csrfToken=sometoken', 'refreshToken=sometoken'])
        .set('X-Bypass-CSRF', 'development')
        .send({ data: 'test' });
        
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('POST request successful');
    });

    it('should not bypass CSRF validation in development without bypass header', async () => {
      const response = await request(app)
        .post('/api/test')
        .set('Cookie', ['csrfToken=sometoken', 'refreshToken=sometoken'])
        .send({ data: 'test' });
        
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('CSRF token required');
    });
  });

  describe('Token Generation', () => {
    it('should generate unique CSRF tokens', () => {
      const token1 = generateCSRFToken();
      const token2 = generateCSRFToken();
      
      expect(token1).not.toBe(token2);
      expect(token1).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 pattern
      expect(token2).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 pattern
    });

    it('should generate tokens of expected length', () => {
      const token = generateCSRFToken();
      const buffer = Buffer.from(token, 'base64');
      
      expect(buffer.length).toBe(16); // 128 bits = 16 bytes
    });
  });
});