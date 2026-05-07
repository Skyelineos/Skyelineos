/**
 * Security Middleware Tests
 * 
 * Tests for CSP headers, rate limiting, and CORS configuration
 */

import request from 'supertest';
import express from 'express';
import { apiSecurityMiddleware, securityHeadersMiddleware, corsMiddleware, rateLimitMiddleware } from '../middleware/security';

describe('Security Middleware', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
  });

  describe('CSP Headers in Production', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeAll(() => {
      process.env.NODE_ENV = 'production';
      process.env.CORS_ORIGIN = 'https://example.com';
    });

    afterAll(() => {
      process.env.NODE_ENV = originalEnv;
      delete process.env.CORS_ORIGIN;
    });

    it('should set strict CSP headers in production mode', async () => {
      app.use(securityHeadersMiddleware);
      app.get('/test', (req, res) => res.json({ test: 'ok' }));

      const response = await request(app).get('/test');
      
      expect(response.headers['content-security-policy']).toBeDefined();
      
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("style-src 'self' https://fonts.googleapis.com");
      expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
      expect(csp).toContain("img-src 'self' data:");
      expect(csp).toContain("connect-src 'self' https://example.com");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
    });

    it('should set HSTS header in production', async () => {
      app.use(securityHeadersMiddleware);
      app.get('/test', (req, res) => res.json({ test: 'ok' }));

      const response = await request(app).get('/test');
      
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
    });

    it('should set other security headers', async () => {
      app.use(securityHeadersMiddleware);
      app.get('/test', (req, res) => res.json({ test: 'ok' }));

      const response = await request(app).get('/test');
      
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-dns-prefetch-control']).toBe('off');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    });
  });

  describe('CSP Headers in Development', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeAll(() => {
      process.env.NODE_ENV = 'development';
    });

    afterAll(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should set permissive CSP headers in development mode', async () => {
      app.use(securityHeadersMiddleware);
      app.get('/test', (req, res) => res.json({ test: 'ok' }));

      const response = await request(app).get('/test');
      
      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
      expect(csp).toContain("connect-src 'self' ws: wss: http: https:");
    });

    it('should not set HSTS header in development', async () => {
      app.use(securityHeadersMiddleware);
      app.get('/test', (req, res) => res.json({ test: 'ok' }));

      const response = await request(app).get('/test');
      
      expect(response.headers['strict-transport-security']).toBeUndefined();
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      // Reset rate limit for each test
      process.env.RATE_LIMIT_MAX_REQUESTS = '3';
      process.env.RATE_LIMIT_WINDOW_MS = '60000'; // 1 minute
    });

    afterEach(() => {
      delete process.env.RATE_LIMIT_MAX_REQUESTS;
      delete process.env.RATE_LIMIT_WINDOW_MS;
    });

    it('should allow requests under the limit', async () => {
      app.use(rateLimitMiddleware);
      app.get('/test', (req, res) => res.json({ test: 'ok' }));

      // First request should succeed
      const response1 = await request(app).get('/test');
      expect(response1.status).toBe(200);
      expect(response1.headers['ratelimit-remaining']).toBeDefined();
      
      // Second request should succeed
      const response2 = await request(app).get('/test');
      expect(response2.status).toBe(200);
    });

    it('should block requests over the limit', async () => {
      app.use(rateLimitMiddleware);
      app.get('/test', (req, res) => res.json({ test: 'ok' }));

      // Make requests up to the limit
      await request(app).get('/test');
      await request(app).get('/test');
      await request(app).get('/test');
      
      // Fourth request should be blocked
      const response = await request(app).get('/test');
      expect(response.status).toBe(429);
      expect(response.body.error).toBe('Too many requests from this IP');
      expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should include rate limit headers', async () => {
      app.use(rateLimitMiddleware);
      app.get('/test', (req, res) => res.json({ test: 'ok' }));

      const response = await request(app).get('/test');
      
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
    });
  });

  describe('CORS Configuration', () => {
    describe('Production CORS', () => {
      const originalEnv = process.env.NODE_ENV;

      beforeAll(() => {
        process.env.NODE_ENV = 'production';
        process.env.CORS_ORIGIN = 'https://example.com';
      });

      afterAll(() => {
        process.env.NODE_ENV = originalEnv;
        delete process.env.CORS_ORIGIN;
      });

      it('should allow requests from configured origin', async () => {
        app.use(corsMiddleware);
        app.get('/test', (req, res) => res.json({ test: 'ok' }));

        const response = await request(app)
          .get('/test')
          .set('Origin', 'https://example.com');
        
        expect(response.status).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe('https://example.com');
        expect(response.headers['access-control-allow-credentials']).toBe('true');
      });

      it('should block requests from unauthorized origins', async () => {
        app.use(corsMiddleware);
        app.get('/test', (req, res) => res.json({ test: 'ok' }));

        const response = await request(app)
          .get('/test')
          .set('Origin', 'https://malicious.com')
          .expect(500); // CORS error
      });
    });

    describe('Development CORS', () => {
      const originalEnv = process.env.NODE_ENV;

      beforeAll(() => {
        process.env.NODE_ENV = 'development';
        process.env.CORS_ORIGIN = 'http://localhost:3000';
      });

      afterAll(() => {
        process.env.NODE_ENV = originalEnv;
        delete process.env.CORS_ORIGIN;
      });

      it('should allow configured origin and localhost variants', async () => {
        app.use(corsMiddleware);
        app.get('/test', (req, res) => res.json({ test: 'ok' }));

        // Test configured origin
        const response1 = await request(app)
          .get('/test')
          .set('Origin', 'http://localhost:3000');
        expect(response1.status).toBe(200);

        // Test localhost variant
        const response2 = await request(app)
          .get('/test')
          .set('Origin', 'http://127.0.0.1:3000');
        expect(response2.status).toBe(200);
      });
    });

    it('should handle preflight OPTIONS requests', async () => {
      app.use(corsMiddleware);
      app.get('/test', (req, res) => res.json({ test: 'ok' }));

      const response = await request(app)
        .options('/test')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type');
      
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
    });
  });

  describe('Complete Security Stack', () => {
    it('should apply all security middleware in order', async () => {
      app.use(apiSecurityMiddleware);
      app.get('/test', (req, res) => {
        // Check if security context is attached
        expect((req as any).security).toBeDefined();
        expect((req as any).security.timestamp).toBeDefined();
        res.json({ test: 'ok' });
      });

      const response = await request(app).get('/test');
      
      expect(response.status).toBe(200);
      // Should have CSP headers
      expect(response.headers['content-security-policy']).toBeDefined();
      // Should have rate limit headers
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      // Should have other security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should detect suspicious requests', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      app.use(apiSecurityMiddleware);
      app.get('/test', (req, res) => res.json({ test: 'ok' }));

      await request(app).get('/test?payload=<script>alert(1)</script>');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚨 Suspicious request detected:'),
        expect.objectContaining({
          method: 'GET',
          url: expect.stringContaining('<script>')
        })
      );
      
      consoleSpy.mockRestore();
    });
  });
});