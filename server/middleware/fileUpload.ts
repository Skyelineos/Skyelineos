/**
 * Secure File Upload Middleware
 * 
 * Integrates with the secure file service for handling uploads
 */

import multer from 'multer';
import path from 'path';
import { sanitizeFilename, isBlockedMimeType, stripExifData } from '../services/fileService';
import { AuthenticatedRequest } from '../../shared/auth-types';

// Configure multer for secure file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate secure filename with timestamp and sanitization
    const timestamp = Date.now();
    const sanitizedOriginal = sanitizeFilename(file.originalname);
    const extension = path.extname(sanitizedOriginal);
    const basename = path.basename(sanitizedOriginal, extension);
    const secureFilename = `${timestamp}-${basename}${extension}`;
    
    cb(null, secureFilename);
  }
});

// File filter for security
const fileFilter = (req: AuthenticatedRequest, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Block dangerous MIME types
  if (isBlockedMimeType(file.mimetype)) {
    return cb(new Error(`File type ${file.mimetype} is not allowed`));
  }
  
  // Additional checks can be added here
  cb(null, true);
};

// Configure upload middleware
export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10 // Max 10 files per request
  }
});

/**
 * Post-upload processing middleware
 * Strips EXIF data and performs additional security checks
 */
export const postUploadProcessing = async (req: AuthenticatedRequest, res: any, next: any) => {
  if (!req.files && !req.file) {
    return next();
  }
  
  const files = req.files as Express.Multer.File[] || [req.file as Express.Multer.File];
  
  try {
    // Process each uploaded file
    for (const file of files) {
      if (file) {
        // Strip EXIF data from images
        await stripExifData(file.path, file.mimetype);
        
        // Log upload for audit
        // Development logging removed
      }
    }
    
    next();
  } catch (error) {
    console.error('Post-upload processing error:', error);
    res.status(500).json({
      error: 'File processing failed',
      code: 'PROCESSING_ERROR'
    });
  }
};