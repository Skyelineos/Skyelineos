/**
 * CSRF Protection Tests
 * 
 * Tests CSRF middleware behavior:
 * - POST without x-csrf-token returns 403 when cookies are present
 * - POST with valid x-csrf-token succeeds
 * - GET requests bypass CSRF protection
 */

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { csrfProtection, generateCSRFToken } from '../middleware/csrf';

// Create test app
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(csrfProtection);

// Test routes
app.get('/api/safe', (req, res) => {
  res.json({ message: 'Safe GET request' });
});

app.post('/api/unsafe', (req, res) => {
  res.json({ message: 'Unsafe POST request', data: req.body });
});

app.put('/api/unsafe-put', (req, res) => {
  res.json({ message: 'Unsafe PUT request', data: req.body });
});

app.delete('/api/unsafe-delete', (req, res) => {
  res.json({ message: 'Unsafe DELETE request' });
});

app.patch('/api/unsafe-patch', (req, res) => {
  res.json({ message: 'Unsafe PATCH request', data: req.body });
});

// Route to get CSRF token for testing
app.get('/auth/csrf-token', (req, res) => {
  const csrfToken = generateCSRFToken();
  res.cookie('csrfToken', csrfToken, {
    httpOnly: false, // Allow JavaScript access for testing
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  res.json({ csrfToken });
});

describe('CSRF Protection Tests', () => {
  describe('Safe Methods (GET, HEAD, OPTIONS)', () => {
    it('should allow GET requests without CSRF token', async () => {
      const response = await request(app)
        .get('/api/safe')
        .expect(200);
      
      expect(response.body).toHaveProperty('message', 'Safe GET request');
    });

    it('should allow GET requests with cookies but no CSRF token', async () => {
      const response = await request(app)
        .get('/api/safe')
        .set('Cookie', 'sessionId=test123; userId=456')
        .expect(200);
      
      expect(response.body).toHaveProperty('message', 'Safe GET request');
    });
  });

  describe('Unsafe Methods (POST, PUT, DELETE, PATCH)', () => {
    describe('Requests without cookies', () => {
      it('should allow POST request without cookies and CSRF token', async () => {
        const response = await request(app)
          .post('/api/unsafe')
          .send({ test: 'data' })
          .expect(200);
        
        expect(response.body).toHaveProperty('message', 'Unsafe POST request');
        expect(response.body).toHaveProperty('data', { test: 'data' });
      });

      it('should allow PUT request without cookies', async () => {
        const response = await request(app)
          .put('/api/unsafe-put')
          .send({ test: 'data' })
          .expect(200);
        
        expect(response.body).toHaveProperty('message', 'Unsafe PUT request');
      });

      it('should allow DELETE request without cookies', async () => {
        const response = await request(app)
          .delete('/api/unsafe-delete')
          .expect(200);
        
        expect(response.body).toHaveProperty('message', 'Unsafe DELETE request');
      });
    });

    describe('Requests with cookies (CSRF protection required)', () => {
      it('should return 403 for POST with cookies but no CSRF token', async () => {
        const response = await request(app)
          .post('/api/unsafe')
          .set('Cookie', 'sessionId=test123; userId=456')
          .send({ test: 'data' })
          .expect(403);
        
        expect(response.body).toHaveProperty('error', 'CSRF token required');
        expect(response.body).toHaveProperty('code', 'CSRF_TOKEN_MISSING');
        expect(response.body).toHaveProperty('message');
      });

      it('should return 403 for PUT with cookies but no CSRF token', async () => {
        const response = await request(app)
          .put('/api/unsafe-put')
          .set('Cookie', 'sessionId=test123')
          .send({ test: 'data' })
          .expect(403);
        
        expect(response.body).toHaveProperty('error', 'CSRF token required');
        expect(response.body).toHaveProperty('code', 'CSRF_TOKEN_MISSING');
      });

      it('should return 403 for DELETE with cookies but no CSRF token', async () => {
        const response = await request(app)
          .delete('/api/unsafe-delete')
          .set('Cookie', 'sessionId=test123')
          .expect(403);
        
        expect(response.body).toHaveProperty('error', 'CSRF token required');
      });

      it('should return 403 for PATCH with cookies but no CSRF token', async () => {
        const response = await request(app)
          .patch('/api/unsafe-patch')
          .set('Cookie', 'sessionId=test123')
          .send({ test: 'data' })
          .expect(403);
        
        expect(response.body).toHaveProperty('error', 'CSRF token required');
      });
    });

    describe('Valid CSRF token scenarios', () => {
      it('should allow POST with valid CSRF token in header and cookie', async () => {
        // Get CSRF token
        const tokenResponse = await request(app)
          .get('/auth/csrf-token')
          .expect(200);
        
        const csrfToken = tokenResponse.body.csrfToken;
        const cookies = tokenResponse.headers['set-cookie'] as string[] | undefined;
        
        // Extract cookie string
        const csrfCookie = cookies?.find((cookie: string) => cookie.includes('csrfToken'));
        
        const response = await request(app)
          .post('/api/unsafe')
          .set('Cookie', csrfCookie)
          .set('x-csrf-token', csrfToken)
          .send({ test: 'data' })
          .expect(200);
        
        expect(response.body).toHaveProperty('message', 'Unsafe POST request');
        expect(response.body).toHaveProperty('data', { test: 'data' });
      });

      it('should allow PUT with valid CSRF token', async () => {
        // Get CSRF token
        const tokenResponse = await request(app)
          .get('/auth/csrf-token');
        
        const csrfToken = tokenResponse.body.csrfToken;
        const cookies = tokenResponse.headers['set-cookie'] as string[] | undefined;
        const csrfCookie = cookies?.find((cookie: string) => cookie.includes('csrfToken'));
        
        const response = await request(app)
          .put('/api/unsafe-put')
          .set('Cookie', csrfCookie)
          .set('x-csrf-token', csrfToken)
          .send({ test: 'updated data' })
          .expect(200);
        
        expect(response.body).toHaveProperty('message', 'Unsafe PUT request');
        expect(response.body).toHaveProperty('data', { test: 'updated data' });
      });
    });

    describe('Invalid CSRF token scenarios', () => {
      it('should return 403 with mismatched CSRF tokens', async () => {
        const csrfToken = generateCSRFToken();
        const differentToken = generateCSRFToken();
        
        const response = await request(app)
          .post('/api/unsafe')
          .set('Cookie', `csrfToken=${csrfToken}`)
          .set('x-csrf-token', differentToken)
          .send({ test: 'data' })
          .expect(403);
        
        expect(response.body).toHaveProperty('error', 'Invalid CSRF token');
        expect(response.body).toHaveProperty('code', 'CSRF_TOKEN_MISMATCH');
      });

      it('should return 403 with CSRF token in header but not in cookie', async () => {
        const csrfToken = generateCSRFToken();
        
        const response = await request(app)
          .post('/api/unsafe')
          .set('Cookie', 'sessionId=test123') // Has cookies but no csrfToken cookie
          .set('x-csrf-token', csrfToken)
          .send({ test: 'data' })
          .expect(403);
        
        expect(response.body).toHaveProperty('error', 'CSRF token required');
        expect(response.body).toHaveProperty('code', 'CSRF_TOKEN_MISSING');
      });

      it('should return 403 with CSRF token in cookie but not in header', async () => {
        const csrfToken = generateCSRFToken();
        
        const response = await request(app)
          .post('/api/unsafe')
          .set('Cookie', `csrfToken=${csrfToken}; sessionId=test123`)
          // Missing x-csrf-token header
          .send({ test: 'data' })
          .expect(403);
        
        expect(response.body).toHaveProperty('error', 'CSRF token required');
        expect(response.body).toHaveProperty('code', 'CSRF_TOKEN_MISSING');
      });
    });
  });

  describe('Development Mode Bypass', () => {
    const originalNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it('should bypass CSRF protection in development mode with bypass header', async () => {
      process.env.NODE_ENV = 'development';
      
      const response = await request(app)
        .post('/api/unsafe')
        .set('Cookie', 'sessionId=test123') // Has cookies but no CSRF token
        .set('x-bypass-csrf', 'development')
        .send({ test: 'bypassed' })
        .expect(200);
      
      expect(response.body).toHaveProperty('message', 'Unsafe POST request');
      expect(response.body).toHaveProperty('data', { test: 'bypassed' });
    });

    it('should not bypass CSRF protection in development mode without bypass header', async () => {
      process.env.NODE_ENV = 'development';
      
      const response = await request(app)
        .post('/api/unsafe')
        .set('Cookie', 'sessionId=test123')
        .send({ test: 'data' })
        .expect(403);
      
      expect(response.body).toHaveProperty('error', 'CSRF token required');
    });

    it('should not bypass CSRF protection in production mode even with bypass header', async () => {
      process.env.NODE_ENV = 'production';
      
      const response = await request(app)
        .post('/api/unsafe')
        .set('Cookie', 'sessionId=test123')
        .set('x-bypass-csrf', 'development')
        .send({ test: 'data' })
        .expect(403);
      
      expect(response.body).toHaveProperty('error', 'CSRF token required');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty cookie header', async () => {
      const response = await request(app)
        .post('/api/unsafe')
        .set('Cookie', '') // Empty cookie string
        .send({ test: 'data' })
        .expect(200); // Should allow since no cookies are present
      
      expect(response.body).toHaveProperty('message', 'Unsafe POST request');
    });

    it('should handle multiple cookies without CSRF token', async () => {
      const response = await request(app)
        .post('/api/unsafe')
        .set('Cookie', 'sessionId=123; userId=456; theme=dark')
        .send({ test: 'data' })
        .expect(403);
      
      expect(response.body).toHaveProperty('error', 'CSRF token required');
    });

    it('should handle case-insensitive header names', async () => {
      const tokenResponse = await request(app).get('/auth/csrf-token');
      const csrfToken = tokenResponse.body.csrfToken;
      const cookies = tokenResponse.headers['set-cookie'] as string[] | undefined;
      const csrfCookie = cookies?.find((cookie: string) => cookie.includes('csrfToken'));
      
      const response = await request(app)
        .post('/api/unsafe')
        .set('Cookie', csrfCookie || '')
        .set('X-CSRF-TOKEN', csrfToken) // Uppercase header name
        .send({ test: 'data' })
        .expect(200);
      
      expect(response.body).toHaveProperty('message', 'Unsafe POST request');
    });
  });
});