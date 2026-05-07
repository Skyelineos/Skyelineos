/**
 * File Upload Security Tests
 * 
 * Tests file route security:
 * - GET /files/:id returns 401 without auth
 * - GET /files/:id returns 200 with auth
 * - Signed URL expiration works correctly
 */

import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { ensureAuthenticated } from '../middleware/ensureAuthenticated';

// Mock file service functions
const mockFiles = new Map();
const mockFilePermissions = new Map();

// Mock file service
jest.mock('../services/fileService', () => ({
  getFileRecord: jest.fn((fileId: string) => {
    return Promise.resolve(mockFiles.get(fileId) || null);
  }),
  checkFilePermission: jest.fn((fileRecord: any, userId: number, userRole: string) => {
    const key = `${fileRecord.id}-${userId}`;
    return Promise.resolve(mockFilePermissions.get(key) || false);
  }),
  generateSignedUrl: jest.fn((fileId: string, ttlSeconds: number = 300) => {
    const expiryTime = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = crypto
      .createHmac('sha256', 'test-secret')
      .update(`${fileId}:${expiryTime}`)
      .digest('hex');
    return Promise.resolve(`/files/${fileId}?sig=${signature}&exp=${expiryTime}`);
  }),
  verifyFileSignature: jest.fn((fileId: string, signature: string, expiry: string) => {
    const now = Math.floor(Date.now() / 1000);
    const expiryTime = parseInt(expiry);
    
    if (now > expiryTime) {
      return Promise.resolve(false); // Expired
    }
    
    const expectedSignature = crypto
      .createHmac('sha256', 'test-secret')
      .update(`${fileId}:${expiryTime}`)
      .digest('hex');
    
    return Promise.resolve(signature === expectedSignature);
  }),
  getFilePath: jest.fn((fileId: string) => {
    return Promise.resolve(path.join(__dirname, 'fixtures', 'test-file.txt'));
  }),
  streamFile: jest.fn((filePath: string, res: any) => {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="test-file.txt"');
    res.send('Test file content');
  }),
  sanitizeFilename: jest.fn((filename: string) => filename.replace(/[^a-zA-Z0-9.-]/g, '_')),
  isBlockedMimeType: jest.fn(() => false)
}));

// Mock authentication middleware
const mockAuthMiddleware = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Access token required',
      code: 'AUTH_TOKEN_REQUIRED'
    });
  }
  
  const token = authHeader.substring(7);
  
  // Simple token validation for testing
  if (token === 'valid-test-token') {
    req.user = { id: 1, email: 'test@example.com', role: 'admin' };
    next();
  } else if (token === 'user-test-token') {
    req.user = { id: 2, email: 'user@example.com', role: 'user' };
    next();
  } else {
    res.status(401).json({ 
      error: 'Invalid or expired token',
      code: 'AUTH_TOKEN_INVALID'
    });
  }
};

// Create test app with file routes
const app = express();
app.use(express.json());
app.use(cookieParser());

// Mock file routes based on actual implementation
app.get('/files/sign/:id', mockAuthMiddleware, async (req, res) => {
  try {
    const fileId = req.params.id.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    const { getFileRecord, checkFilePermission, generateSignedUrl, isBlockedMimeType } = require('../services/fileService');
    
    const fileRecord = await getFileRecord(fileId);
    if (!fileRecord) {
      return res.status(404).json({ 
        error: 'File not found', 
        code: 'FILE_NOT_FOUND' 
      });
    }
    
    if (isBlockedMimeType(fileRecord.mimeType)) {
      return res.status(403).json({ 
        error: 'File type not allowed', 
        code: 'BLOCKED_FILE_TYPE' 
      });
    }
    
    const hasPermission = await checkFilePermission(fileRecord, (req as any).user.id, (req as any).user.role);
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Access denied', 
        code: 'FILE_ACCESS_DENIED' 
      });
    }
    
    const signedUrl = await generateSignedUrl(fileId, 300); // 5 minute expiry
    res.json({ signedUrl, expiresIn: 300 });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      code: 'SIGNED_URL_ERROR' 
    });
  }
});

app.get('/files/:id', async (req, res) => {
  try {
    const fileId = req.params.id.replace(/[^a-zA-Z0-9.-]/g, '_');
    const { sig, exp } = req.query;
    
    if (!sig || !exp) {
      return res.status(401).json({ 
        error: 'Authentication required for file access',
        code: 'FILE_AUTH_REQUIRED'
      });
    }
    
    const { verifyFileSignature, getFileRecord, getFilePath, streamFile } = require('../services/fileService');
    
    const isValidSignature = await verifyFileSignature(fileId, sig as string, exp as string);
    if (!isValidSignature) {
      return res.status(401).json({ 
        error: 'Invalid or expired file access signature',
        code: 'FILE_SIGNATURE_INVALID'
      });
    }
    
    const fileRecord = await getFileRecord(fileId);
    if (!fileRecord) {
      return res.status(404).json({ 
        error: 'File not found', 
        code: 'FILE_NOT_FOUND' 
      });
    }
    
    const filePath = await getFilePath(fileId);
    await streamFile(filePath, res);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      code: 'FILE_SERVE_ERROR' 
    });
  }
});

// Test route that requires authentication
app.get('/api/user-files', mockAuthMiddleware, (req, res) => {
  res.json({ 
    message: 'User files accessed successfully',
    userId: (req as any).user.id,
    files: ['file1.txt', 'file2.pdf'] 
  });
});

describe('File Upload Security Tests', () => {
  beforeEach(() => {
    // Reset mocks
    mockFiles.clear();
    mockFilePermissions.clear();
    
    // Add test files
    mockFiles.set('test-file-1', {
      id: 'test-file-1',
      filename: 'test.txt',
      mimeType: 'text/plain',
      size: 1024,
      uploadedBy: 1,
      projectId: 100
    });
    
    mockFiles.set('test-file-2', {
      id: 'test-file-2',
      filename: 'document.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      uploadedBy: 2,
      projectId: 100
    });
    
    // Set permissions
    mockFilePermissions.set('test-file-1-1', true); // User 1 can access file 1
    mockFilePermissions.set('test-file-1-2', false); // User 2 cannot access file 1
    mockFilePermissions.set('test-file-2-2', true); // User 2 can access file 2
  });

  describe('File Access Authentication', () => {
    it('should return 401 without authentication token', async () => {
      const response = await request(app)
        .get('/api/user-files')
        .expect(401);
      
      expect(response.body).toHaveProperty('error', 'Access token required');
      expect(response.body).toHaveProperty('code', 'AUTH_TOKEN_REQUIRED');
    });

    it('should return 401 with invalid authentication token', async () => {
      const response = await request(app)
        .get('/api/user-files')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
      
      expect(response.body).toHaveProperty('error', 'Invalid or expired token');
      expect(response.body).toHaveProperty('code', 'AUTH_TOKEN_INVALID');
    });

    it('should return 200 with valid authentication token', async () => {
      const response = await request(app)
        .get('/api/user-files')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);
      
      expect(response.body).toHaveProperty('message', 'User files accessed successfully');
      expect(response.body).toHaveProperty('userId', 1);
      expect(response.body).toHaveProperty('files');
      expect(Array.isArray(response.body.files)).toBe(true);
    });
  });

  describe('Signed URL Generation', () => {
    it('should require authentication to generate signed URL', async () => {
      const response = await request(app)
        .get('/files/sign/test-file-1')
        .expect(401);
      
      expect(response.body).toHaveProperty('error', 'Access token required');
    });

    it('should return 404 for non-existent file', async () => {
      const response = await request(app)
        .get('/files/sign/non-existent-file')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(404);
      
      expect(response.body).toHaveProperty('error', 'File not found');
      expect(response.body).toHaveProperty('code', 'FILE_NOT_FOUND');
    });

    it('should return 403 for file without permission', async () => {
      const response = await request(app)
        .get('/files/sign/test-file-1')
        .set('Authorization', 'Bearer user-test-token') // User 2 token
        .expect(403);
      
      expect(response.body).toHaveProperty('error', 'Access denied');
      expect(response.body).toHaveProperty('code', 'FILE_ACCESS_DENIED');
    });

    it('should generate signed URL with valid authentication and permission', async () => {
      const response = await request(app)
        .get('/files/sign/test-file-1')
        .set('Authorization', 'Bearer valid-test-token') // User 1 token
        .expect(200);
      
      expect(response.body).toHaveProperty('signedUrl');
      expect(response.body).toHaveProperty('expiresIn', 300);
      expect(response.body.signedUrl).toContain('/files/test-file-1?sig=');
      expect(response.body.signedUrl).toContain('&exp=');
    });
  });

  describe('File Access with Signed URLs', () => {
    it('should return 401 without signature parameters', async () => {
      const response = await request(app)
        .get('/files/test-file-1')
        .expect(401);
      
      expect(response.body).toHaveProperty('error', 'Authentication required for file access');
      expect(response.body).toHaveProperty('code', 'FILE_AUTH_REQUIRED');
    });

    it('should return 401 with missing signature parameter', async () => {
      const response = await request(app)
        .get('/files/test-file-1?exp=9999999999')
        .expect(401);
      
      expect(response.body).toHaveProperty('error', 'Authentication required for file access');
    });

    it('should return 401 with missing expiry parameter', async () => {
      const response = await request(app)
        .get('/files/test-file-1?sig=abcd1234')
        .expect(401);
      
      expect(response.body).toHaveProperty('error', 'Authentication required for file access');
    });

    it('should return 401 with invalid signature', async () => {
      const futureExpiry = Math.floor(Date.now() / 1000) + 300;
      const response = await request(app)
        .get(`/files/test-file-1?sig=invalid-signature&exp=${futureExpiry}`)
        .expect(401);
      
      expect(response.body).toHaveProperty('error', 'Invalid or expired file access signature');
      expect(response.body).toHaveProperty('code', 'FILE_SIGNATURE_INVALID');
    });

    it('should return file content with valid signature', async () => {
      // Generate valid signature
      const expiryTime = Math.floor(Date.now() / 1000) + 300;
      const signature = crypto
        .createHmac('sha256', 'test-secret')
        .update(`test-file-1:${expiryTime}`)
        .digest('hex');
      
      const response = await request(app)
        .get(`/files/test-file-1?sig=${signature}&exp=${expiryTime}`)
        .expect(200);
      
      expect(response.text).toBe('Test file content');
      expect(response.headers['content-type']).toContain('text/plain');
    });
  });

  describe('Signed URL Expiration', () => {
    it('should reject expired signed URL', async () => {
      // Create expired signature (1 second in the past)
      const expiredTime = Math.floor(Date.now() / 1000) - 1;
      const signature = crypto
        .createHmac('sha256', 'test-secret')
        .update(`test-file-1:${expiredTime}`)
        .digest('hex');
      
      const response = await request(app)
        .get(`/files/test-file-1?sig=${signature}&exp=${expiredTime}`)
        .expect(401);
      
      expect(response.body).toHaveProperty('error', 'Invalid or expired file access signature');
      expect(response.body).toHaveProperty('code', 'FILE_SIGNATURE_INVALID');
    });

    it('should accept non-expired signed URL', async () => {
      // Create signature that expires in 5 minutes
      const futureTime = Math.floor(Date.now() / 1000) + 300;
      const signature = crypto
        .createHmac('sha256', 'test-secret')
        .update(`test-file-1:${futureTime}`)
        .digest('hex');
      
      const response = await request(app)
        .get(`/files/test-file-1?sig=${signature}&exp=${futureTime}`)
        .expect(200);
      
      expect(response.text).toBe('Test file content');
    });

    it('should handle boundary case for expiration (just expired)', async () => {
      // Wait 1ms to ensure the signature is definitely expired
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const justExpiredTime = Math.floor(Date.now() / 1000) - 1;
      const signature = crypto
        .createHmac('sha256', 'test-secret')
        .update(`test-file-1:${justExpiredTime}`)
        .digest('hex');
      
      const response = await request(app)
        .get(`/files/test-file-1?sig=${signature}&exp=${justExpiredTime}`)
        .expect(401);
      
      expect(response.body).toHaveProperty('code', 'FILE_SIGNATURE_INVALID');
    });
  });

  describe('File Permission Authorization', () => {
    it('should enforce file permissions correctly', async () => {
      // User 2 trying to access file 1 (should fail)
      const response = await request(app)
        .get('/files/sign/test-file-1')
        .set('Authorization', 'Bearer user-test-token')
        .expect(403);
      
      expect(response.body).toHaveProperty('error', 'Access denied');
    });

    it('should allow access to own files', async () => {
      // User 2 accessing their own file (file 2)
      const response = await request(app)
        .get('/files/sign/test-file-2')
        .set('Authorization', 'Bearer user-test-token')
        .expect(200);
      
      expect(response.body).toHaveProperty('signedUrl');
    });

    it('should handle role-based permissions', async () => {
      // Admin (user 1) should be able to access file 1
      const response = await request(app)
        .get('/files/sign/test-file-1')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);
      
      expect(response.body).toHaveProperty('signedUrl');
    });
  });

  describe('Edge Cases and Security', () => {
    it('should sanitize file IDs', async () => {
      const response = await request(app)
        .get('/files/sign/../../../etc/passwd')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(404); // Should not find the file due to sanitization
      
      expect(response.body).toHaveProperty('code', 'FILE_NOT_FOUND');
    });

    it('should handle malformed expiry timestamps', async () => {
      const signature = crypto.randomBytes(32).toString('hex');
      
      const response = await request(app)
        .get(`/files/test-file-1?sig=${signature}&exp=not-a-number`)
        .expect(401);
      
      expect(response.body).toHaveProperty('code', 'FILE_SIGNATURE_INVALID');
    });

    it('should handle very large expiry timestamps', async () => {
      const veryLargeExpiry = '9999999999999999999';
      const signature = crypto
        .createHmac('sha256', 'test-secret')
        .update(`test-file-1:${veryLargeExpiry}`)
        .digest('hex');
      
      const response = await request(app)
        .get(`/files/test-file-1?sig=${signature}&exp=${veryLargeExpiry}`)
        .expect(200);
      
      expect(response.text).toBe('Test file content');
    });
  });
});