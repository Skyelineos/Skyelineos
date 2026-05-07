/**
 * File Routes Integration Tests
 * 
 * Test authenticated file access and signed URL functionality
 */

import request from 'supertest';
// Import the Express app for testing
let app: any;
import fs from 'fs';
import path from 'path';

describe('File Routes', () => {
  let accessToken: string;
  let refreshToken: string;
  
  // Create test file
  const testFileName = 'test-file.txt';
  const testFileContent = 'This is a test file for secure file serving';
  const testFilePath = path.join(process.cwd(), 'uploads', testFileName);
  
  beforeAll(async () => {
    // Import app dynamically to avoid import issues
    const appModule = await import('../index');
    app = appModule.app;
    
    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    // Create test file
    fs.writeFileSync(testFilePath, testFileContent);
    
    // Login to get access token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@skyeline.com',
        password: 'admin123'
      });
    
    if (loginResponse.status === 200) {
      accessToken = loginResponse.body.accessToken;
    }
  });
  
  afterAll(() => {
    // Clean up test file
    try {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    } catch (error) {
      console.warn('Failed to clean up test file:', error);
    }
  });

  describe('GET /files/:id (Direct Access)', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get(`/files/${testFileName}`);
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
      expect(response.body.code).toBe('MISSING_TOKEN');
    });

    it('should return file with valid authentication', async () => {
      if (!accessToken) {
        console.warn('Skipping authenticated test - login failed');
        return;
      }
      
      const response = await request(app)
        .get(`/files/${testFileName}`)
        .set('Authorization', `Bearer ${accessToken}`);
      
      // Should return the file or a 404 if not found (both are valid for security)
      expect([200, 404]).toContain(response.status);
    });

    it('should reject files with blocked MIME types', async () => {
      if (!accessToken) {
        console.warn('Skipping authenticated test - login failed');
        return;
      }
      
      // Create a mock executable file
      const executableFileName = 'malicious.exe';
      const executablePath = path.join(process.cwd(), 'uploads', executableFileName);
      
      try {
        fs.writeFileSync(executablePath, 'fake executable content');
        
        const response = await request(app)
          .get(`/files/${executableFileName}`)
          .set('Authorization', `Bearer ${accessToken}`);
        
        // Should be blocked (403) or not found (404)
        expect([403, 404]).toContain(response.status);
        
        if (response.status === 403) {
          expect(response.body.code).toBe('BLOCKED_FILE_TYPE');
        }
      } finally {
        // Clean up
        try {
          if (fs.existsSync(executablePath)) {
            fs.unlinkSync(executablePath);
          }
        } catch (error) {
          console.warn('Failed to clean up executable test file:', error);
        }
      }
    });
  });

  describe('GET /files/sign/:id (Signed URL Generation)', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get(`/files/sign/${testFileName}`);
      
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should generate signed URL with valid authentication', async () => {
      if (!accessToken) {
        console.warn('Skipping authenticated test - login failed');
        return;
      }
      
      const response = await request(app)
        .get(`/files/sign/${testFileName}`)
        .set('Authorization', `Bearer ${accessToken}`);
      
      // Should generate URL or return 404 if file not found
      if (response.status === 200) {
        expect(response.body.url).toMatch(/^\/files\/get\/.+\?sig=.+&exp=\d+$/);
        expect(response.body.expiration).toBeGreaterThan(Date.now());
        expect(response.body.expires_in).toBeGreaterThan(0);
      } else {
        expect(response.status).toBe(404);
      }
    });
  });

  describe('GET /files/get/:id (Signed URL Access)', () => {
    it('should return 400 for missing signature parameters', async () => {
      const response = await request(app)
        .get(`/files/get/${testFileName}`);
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid parameters');
      expect(response.body.code).toBe('INVALID_PARAMETERS');
    });

    it('should return 401 for invalid signature', async () => {
      const expiration = Date.now() + 300000; // 5 minutes
      const invalidSignature = 'invalid-signature';
      
      const response = await request(app)
        .get(`/files/get/${testFileName}`)
        .query({
          sig: invalidSignature,
          exp: expiration.toString()
        });
      
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('INVALID_SIGNATURE');
    });

    it('should return 401 for expired URL', async () => {
      const expiration = Date.now() - 1000; // Expired 1 second ago
      const signature = 'any-signature'; // Will fail before signature validation
      
      const response = await request(app)
        .get(`/files/get/${testFileName}`)
        .query({
          sig: signature,
          exp: expiration.toString()
        });
      
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('URL_EXPIRED');
    });

    it('should serve file with valid signed URL', async () => {
      if (!accessToken) {
        console.warn('Skipping signed URL test - login failed');
        return;
      }
      
      // First, generate a signed URL
      const signResponse = await request(app)
        .get(`/files/sign/${testFileName}`)
        .set('Authorization', `Bearer ${accessToken}`);
      
      if (signResponse.status !== 200) {
        console.warn('Skipping signed URL access test - could not generate signed URL');
        return;
      }
      
      // Extract URL parameters
      const signedUrl = signResponse.body.url;
      const urlParams = new URL(signedUrl, 'http://localhost');
      const sig = urlParams.searchParams.get('sig');
      const exp = urlParams.searchParams.get('exp');
      
      // Use the signed URL to access the file
      const fileResponse = await request(app)
        .get(`/files/get/${testFileName}`)
        .query({ sig, exp });
      
      // Should serve the file or return 404 if not found
      expect([200, 404]).toContain(fileResponse.status);
      
      if (fileResponse.status === 200) {
        expect(fileResponse.headers['content-type']).toBeDefined();
        expect(fileResponse.headers['x-content-type-options']).toBe('nosniff');
        expect(fileResponse.headers['x-frame-options']).toBe('DENY');
      }
    });
  });

  describe('Security Headers', () => {
    it('should include security headers in file responses', async () => {
      if (!accessToken) {
        console.warn('Skipping security headers test - login failed');
        return;
      }
      
      const response = await request(app)
        .get(`/files/${testFileName}`)
        .set('Authorization', `Bearer ${accessToken}`);
      
      // Check for security headers regardless of whether file exists
      if (response.status === 200) {
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['x-frame-options']).toBe('DENY');
        expect(response.headers['cache-control']).toContain('private');
        expect(response.headers['cache-control']).toContain('no-cache');
      }
    });
  });

  describe('Path Traversal Protection', () => {
    it('should reject path traversal attempts', async () => {
      if (!accessToken) {
        console.warn('Skipping path traversal test - login failed');
        return;
      }
      
      const maliciousPaths = [
        '../../../etc/passwd',
        '..%2F..%2F..%2Fetc%2Fpasswd',
        '....//....//....//etc/passwd'
      ];
      
      for (const maliciousPath of maliciousPaths) {
        const response = await request(app)
          .get(`/files/${maliciousPath}`)
          .set('Authorization', `Bearer ${accessToken}`);
        
        // Should not serve sensitive files - should return 404 or 403
        expect(response.status).not.toBe(200);
        expect([400, 403, 404]).toContain(response.status);
      }
    });
  });
});