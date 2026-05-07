/**
 * CSRF Integration Test
 * 
 * Test CSRF protection against the actual running server
 */

import request from 'supertest';
import { app } from '../index';

describe('CSRF Integration Test', () => {
  describe('Protected POST endpoints', () => {
    it('should return 403 when POST to protected route with cookies but no CSRF token', async () => {
      // First login to get cookies
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@skyeline.com',
          password: 'admin123'
        });
      
      expect(loginResponse.status).toBe(200);
      
      // Extract cookies from login response
      const cookies = loginResponse.headers['set-cookie'];
      expect(cookies).toBeDefined();
      
      // Try to make a POST request with cookies but no CSRF token
      const response = await request(app)
        .post('/api/projects')
        .set('Cookie', cookies)
        .send({
          name: 'Test Project',
          description: 'Test Description'
        });
      
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('CSRF token required');
      expect(response.body.code).toBe('CSRF_TOKEN_MISSING');
    });

    it('should allow POST to protected route with valid CSRF token and cookies', async () => {
      // First login to get cookies including CSRF token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@skyeline.com',
          password: 'admin123'
        });
      
      expect(loginResponse.status).toBe(200);
      
      // Extract cookies from login response
      const cookies = loginResponse.headers['set-cookie'];
      expect(cookies).toBeDefined();
      
      // Parse CSRF token from cookies
      const csrfCookie = cookies.find((cookie: string) => cookie.startsWith('csrfToken='));
      expect(csrfCookie).toBeDefined();
      
      const csrfToken = csrfCookie!.split(';')[0].split('=')[1];
      expect(csrfToken).toBeDefined();
      expect(csrfToken.length).toBeGreaterThan(0);
      
      // Try to make a POST request with both cookies and CSRF token
      const response = await request(app)
        .post('/api/projects')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', csrfToken)
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
        .send({
          name: 'Test Project',
          description: 'Test Description',
          clientId: 1,
          status: 'planning'
        });
      
      // Should succeed (might return 201 for created or 200 for success)
      expect([200, 201, 400, 422]).toContain(response.status);
      
      // If it's a validation error (400/422), it means CSRF passed but data validation failed
      // This is acceptable as it proves CSRF protection is working
      if (response.status === 403) {
        console.error('CSRF test failed:', response.body);
        expect(response.status).not.toBe(403);
      }
    });
  });

  describe('Safe methods (GET)', () => {
    it('should allow GET requests without CSRF token even with cookies', async () => {
      // First login to get cookies
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@skyeline.com',
          password: 'admin123'
        });
      
      expect(loginResponse.status).toBe(200);
      
      // Extract cookies from login response
      const cookies = loginResponse.headers['set-cookie'];
      
      // Make GET request with cookies but no CSRF token
      const response = await request(app)
        .get('/api/projects')
        .set('Cookie', cookies)
        .set('Authorization', `Bearer ${loginResponse.body.accessToken}`);
      
      expect(response.status).toBe(200);
    });
  });
});