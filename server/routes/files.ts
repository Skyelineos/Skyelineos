/**
 * Secure File Routes
 * 
 * Implements authenticated file streaming and signed URL access
 * Replaces insecure express.static file serving
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';

// Define AuthenticatedRequest interface locally since it's not exported
interface AuthenticatedRequest extends Request {
  user: {
    id: number;
    email: string;
    role: string;
    permissions: string[];
  };
}
import { 
  getFileRecord, 
  checkFilePermission, 
  generateSignedUrl, 
  verifyFileSignature, 
  getFilePath, 
  streamFile,
  sanitizeFilename,
  isBlockedMimeType
} from '../services/fileService';

const router = Router();

// Validation schemas
const fileIdSchema = z.object({
  id: z.string().min(1).max(255)
});

const signedUrlParamsSchema = z.object({
  id: z.string().min(1).max(255),
  sig: z.string().min(1),
  exp: z.string().regex(/^\d+$/)
});

/**
 * GET /files/sign/:id
 * Generate signed URL for file access (requires authentication)
 */
router.get('/sign/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: fileId } = fileIdSchema.parse(req.params);
    const sanitizedFileId = sanitizeFilename(fileId);
    
    // Get file record from database
    const fileRecord = await getFileRecord(sanitizedFileId);
    if (!fileRecord) {
      return res.status(404).json({ 
        error: 'File not found', 
        code: 'FILE_NOT_FOUND' 
      });
    }
    
    // Check if MIME type is blocked
    if (isBlockedMimeType(fileRecord.mimeType)) {
      return res.status(403).json({ 
        error: 'File type not allowed', 
        code: 'BLOCKED_FILE_TYPE' 
      });
    }
    
    // Check user permissions
    const hasPermission = await checkFilePermission(fileRecord, req.user.id, req.user.role);
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Access denied', 
        code: 'ACCESS_DENIED' 
      });
    }
    
    // Generate signed URL
    const { url, expiration } = generateSignedUrl(sanitizedFileId);
    
    res.json({
      url,
      expiration,
      expires_in: Math.floor((expiration - Date.now()) / 1000),
      file: {
        id: fileRecord.id,
        name: fileRecord.originalName,
        size: fileRecord.size,
        type: fileRecord.mimeType
      }
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid file ID', 
        code: 'INVALID_FILE_ID',
        details: error.errors 
      });
    }
    
    console.error('Error generating signed URL:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * GET /files/get/:id?sig=...&exp=...
 * Stream file with signed URL verification (no authentication required)
 */
router.get('/get/:id', async (req: Request, res: Response) => {
  try {
    const { id: fileId, sig: signature, exp: expirationStr } = signedUrlParamsSchema.parse({
      id: req.params.id,
      sig: req.query.sig,
      exp: req.query.exp
    });
    
    const sanitizedFileId = sanitizeFilename(fileId);
    const expiration = parseInt(expirationStr, 10);
    
    // Check if URL has expired
    if (Date.now() > expiration) {
      return res.status(401).json({ 
        error: 'Signed URL expired', 
        code: 'URL_EXPIRED' 
      });
    }
    
    // Verify signature
    const isValidSignature = verifyFileSignature(sanitizedFileId, expiration, signature);
    if (!isValidSignature) {
      return res.status(401).json({ 
        error: 'Invalid signature', 
        code: 'INVALID_SIGNATURE' 
      });
    }
    
    // Get file record
    const fileRecord = await getFileRecord(sanitizedFileId);
    if (!fileRecord) {
      return res.status(404).json({ 
        error: 'File not found', 
        code: 'FILE_NOT_FOUND' 
      });
    }
    
    // Check if MIME type is blocked
    if (isBlockedMimeType(fileRecord.mimeType)) {
      return res.status(403).json({ 
        error: 'File type not allowed', 
        code: 'BLOCKED_FILE_TYPE' 
      });
    }
    
    // Stream file
    const filePath = getFilePath(sanitizedFileId);
    await streamFile(filePath, fileRecord, res);
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid parameters', 
        code: 'INVALID_PARAMETERS',
        details: error.errors 
      });
    }
    
    console.error('Error streaming file:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      code: 'INTERNAL_ERROR' 
    });
  }
});

/**
 * GET /files/:id
 * Direct authenticated file access (alternative to signed URLs)
 */
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: fileId } = fileIdSchema.parse(req.params);
    const sanitizedFileId = sanitizeFilename(fileId);
    
    // Get file record
    const fileRecord = await getFileRecord(sanitizedFileId);
    if (!fileRecord) {
      return res.status(404).json({ 
        error: 'File not found', 
        code: 'FILE_NOT_FOUND' 
      });
    }
    
    // Check if MIME type is blocked
    if (isBlockedMimeType(fileRecord.mimeType)) {
      return res.status(403).json({ 
        error: 'File type not allowed', 
        code: 'BLOCKED_FILE_TYPE' 
      });
    }
    
    // Check user permissions
    const hasPermission = await checkFilePermission(fileRecord, req.user.id, req.user.role);
    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Access denied', 
        code: 'ACCESS_DENIED' 
      });
    }
    
    // Stream file directly
    const filePath = getFilePath(sanitizedFileId);
    await streamFile(filePath, fileRecord, res);
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid file ID', 
        code: 'INVALID_FILE_ID',
        details: error.errors 
      });
    }
    
    console.error('Error streaming file:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      code: 'INTERNAL_ERROR' 
    });
  }
});

export default router;