/**
 * File Service Tests
 * 
 * Test secure file serving, signed URLs, and authentication
 */

import request from 'supertest';
import express from 'express';
import { expect } from '@jest/globals';
import { 
  sanitizeFilename, 
  isBlockedMimeType, 
  generateFileSignature, 
  verifyFileSignature, 
  generateSignedUrl 
} from '../services/fileService';

describe('File Service', () => {
  describe('sanitizeFilename', () => {
    it('should remove dangerous characters', () => {
      expect(sanitizeFilename('../../etc/passwd')).toBe('etcpasswd');
      expect(sanitizeFilename('<script>alert("xss")</script>.jpg')).toBe('scriptalert(xss)script.jpg');
      expect(sanitizeFilename('file|with?danger*chars')).toBe('filewithtearngerchars');
    });

    it('should replace spaces with underscores', () => {
      expect(sanitizeFilename('my file name.pdf')).toBe('my_file_name.pdf');
    });

    it('should remove leading dots', () => {
      expect(sanitizeFilename('...hidden.txt')).toBe('hidden.txt');
    });

    it('should generate fallback for empty/invalid names', () => {
      expect(sanitizeFilename('')).toMatch(/^file_\d+$/);
      expect(sanitizeFilename('.')).toMatch(/^file_\d+$/);
      expect(sanitizeFilename('..')).toMatch(/^file_\d+$/);
    });

    it('should limit filename length', () => {
      const longName = 'a'.repeat(300) + '.txt';
      expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(255);
    });
  });

  describe('isBlockedMimeType', () => {
    it('should block executable MIME types', () => {
      expect(isBlockedMimeType('application/x-executable')).toBe(true);
      expect(isBlockedMimeType('application/x-msdownload')).toBe(true);
      expect(isBlockedMimeType('application/javascript')).toBe(true);
      expect(isBlockedMimeType('text/x-shellscript')).toBe(true);
    });

    it('should allow safe MIME types', () => {
      expect(isBlockedMimeType('image/jpeg')).toBe(false);
      expect(isBlockedMimeType('image/png')).toBe(false);
      expect(isBlockedMimeType('application/pdf')).toBe(false);
      expect(isBlockedMimeType('text/plain')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isBlockedMimeType('APPLICATION/X-EXECUTABLE')).toBe(true);
      expect(isBlockedMimeType('Application/JavaScript')).toBe(true);
    });
  });

  describe('File Signatures', () => {
    const fileId = 'test-file-123';
    const expiration = Date.now() + 300000; // 5 minutes

    it('should generate valid signatures', () => {
      const signature = generateFileSignature(fileId, expiration);
      expect(signature).toBeDefined();
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);
    });

    it('should verify valid signatures', () => {
      const signature = generateFileSignature(fileId, expiration);
      const isValid = verifyFileSignature(fileId, expiration, signature);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const validSignature = generateFileSignature(fileId, expiration);
      const invalidSignature = validSignature + 'tampered';
      const isValid = verifyFileSignature(fileId, expiration, invalidSignature);
      expect(isValid).toBe(false);
    });

    it('should reject signatures for different files', () => {
      const signature = generateFileSignature(fileId, expiration);
      const isValid = verifyFileSignature('different-file', expiration, signature);
      expect(isValid).toBe(false);
    });

    it('should reject signatures with different expiration', () => {
      const signature = generateFileSignature(fileId, expiration);
      const isValid = verifyFileSignature(fileId, expiration + 1000, signature);
      expect(isValid).toBe(false);
    });
  });

  describe('Signed URLs', () => {
    it('should generate signed URLs with expiration', () => {
      const fileId = 'test-file';
      const { url, expiration } = generateSignedUrl(fileId);
      
      expect(url).toMatch(/^\/files\/get\/test-file\?sig=.+&exp=\d+$/);
      expect(expiration).toBeGreaterThan(Date.now());
      expect(expiration).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000 + 1000); // 5 minutes + 1s buffer
    });

    it('should generate different URLs for different files', () => {
      const { url: url1 } = generateSignedUrl('file1');
      const { url: url2 } = generateSignedUrl('file2');
      
      expect(url1).not.toBe(url2);
    });
  });
});