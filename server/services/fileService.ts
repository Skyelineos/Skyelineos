/**
 * Secure File Service
 * 
 * Handles file streaming with authentication, authorization, and signed URLs
 * Replaces direct express.static serving with secure file access
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { Response } from 'express';
import sharp from 'sharp';

// File upload directory outside web root
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// HMAC secret for signed URLs
const HMAC_SECRET = process.env.FILE_SIGNING_SECRET || 'default-file-signing-secret-change-in-production';

// Signed URL expiration (5 minutes)
const SIGNED_URL_EXPIRATION = 5 * 60 * 1000;

// Blocked executable MIME types
const BLOCKED_MIME_TYPES = [
  'application/x-executable',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-dosexec',
  'application/x-winexe',
  'application/x-sh',
  'application/x-bash',
  'text/x-shellscript',
  'application/x-perl',
  'application/x-python-code',
  'application/javascript',
  'text/javascript'
];

// Image MIME types that support EXIF
const EXIF_SUPPORTING_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/tiff'
];

export interface FileRecord {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: number;
  uploadedAt: Date;
  projectId?: number;
}

/**
 * Sanitize filename to prevent path traversal attacks
 */
export function sanitizeFilename(filename: string): string {
  // Remove path components and dangerous characters
  const sanitized = path.basename(filename)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // Remove dangerous chars
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 255); // Limit length
  
  // Ensure we have a valid filename
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    return `file_${Date.now()}`;
  }
  
  return sanitized;
}

/**
 * Check if MIME type is blocked (executable)
 */
export function isBlockedMimeType(mimeType: string): boolean {
  return BLOCKED_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Generate HMAC signature for file access
 */
export function generateFileSignature(fileId: string, expiration: number): string {
  const payload = `${fileId}:${expiration}`;
  return crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(payload)
    .digest('base64url');
}

/**
 * Verify HMAC signature for file access
 */
export function verifyFileSignature(fileId: string, expiration: number, signature: string): boolean {
  const expectedSignature = generateFileSignature(fileId, expiration);
  
  // Use crypto.timingSafeEqual to prevent timing attacks
  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(signature);
  
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Generate signed URL for file access
 */
export function generateSignedUrl(fileId: string): { url: string; expiration: number } {
  const expiration = Date.now() + SIGNED_URL_EXPIRATION;
  const signature = generateFileSignature(fileId, expiration);
  
  return {
    url: `/files/get/${fileId}?sig=${signature}&exp=${expiration}`,
    expiration
  };
}

/**
 * Check if user has permission to access file
 */
export async function checkFilePermission(fileRecord: FileRecord, userId: number, userRole: string): Promise<boolean> {
  // File owner can always access
  if (fileRecord.uploadedBy === userId) {
    return true;
  }
  
  // Admin can access all files
  if (userRole === 'admin') {
    return true;
  }
  
  // Project manager can access files in their projects
  if (userRole === 'project_manager' && fileRecord.projectId) {
    // TODO: Check if user is assigned to the project
    // For now, allow project managers to access project files
    return true;
  }
  
  // Clients can access files in their projects
  if (userRole === 'client' && fileRecord.projectId) {
    // TODO: Check if user is the client for the project
    // For now, restrict client access
    return false;
  }
  
  return false;
}

/**
 * Get file record from storage (placeholder - replace with actual DB query)
 */
export async function getFileRecord(fileId: string): Promise<FileRecord | null> {
  // TODO: Replace with actual database query
  // This is a placeholder implementation
  const filePath = path.join(UPLOADS_DIR, fileId);
  
  try {
    const stats = await fs.stat(filePath);
    return {
      id: fileId,
      filename: fileId,
      originalName: fileId,
      mimeType: 'application/octet-stream',
      size: stats.size,
      uploadedBy: 1, // Placeholder
      uploadedAt: stats.mtime,
      projectId: undefined
    };
  } catch (error) {
    return null;
  }
}

/**
 * Strip EXIF data from images
 */
export async function stripExifData(filePath: string, mimeType: string): Promise<void> {
  if (!EXIF_SUPPORTING_TYPES.includes(mimeType.toLowerCase())) {
    return;
  }
  
  try {
    const tempPath = `${filePath}.temp`;
    
    // Use Sharp to remove EXIF data
    await sharp(filePath)
      .rotate() // Auto-rotate based on EXIF orientation then remove EXIF
      .jpeg({ quality: 95 }) // Re-compress slightly to ensure EXIF removal
      .toFile(tempPath);
    
    // Replace original with cleaned version
    await fs.rename(tempPath, filePath);
    
    // Development logging removed
  } catch (error) {
    console.error(`Failed to strip EXIF data from ${path.basename(filePath)}:`, error);
    // Continue without EXIF stripping if it fails
  }
}

/**
 * Stream file to response with proper headers
 */
export async function streamFile(filePath: string, fileRecord: FileRecord, res: Response): Promise<void> {
  if (!existsSync(filePath)) {
    res.status(404).json({ error: 'File not found', code: 'FILE_NOT_FOUND' });
    return;
  }
  
  try {
    const stats = await fs.stat(filePath);
    
    // Set security headers
    res.set({
      'Content-Type': fileRecord.mimeType || 'application/octet-stream',
      'Content-Length': stats.size.toString(),
      'Content-Disposition': `attachment; filename="${fileRecord.originalName}"`,
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    
    // Handle range requests for large files
    const range = res.req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      
      res.status(206);
      res.set({
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize.toString()
      });
      
      const stream = createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      // Stream entire file
      const stream = createReadStream(filePath);
      stream.pipe(res);
    }
    
  } catch (error) {
    console.error('Error streaming file:', error);
    res.status(500).json({ error: 'Internal server error', code: 'STREAM_ERROR' });
  }
}

/**
 * Get file path from file ID
 */
export function getFilePath(fileId: string): string {
  // Sanitize file ID to prevent path traversal
  const sanitizedId = sanitizeFilename(fileId);
  return path.join(UPLOADS_DIR, sanitizedId);
}