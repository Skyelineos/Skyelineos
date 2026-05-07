import { Request, Response, NextFunction } from 'express';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Initialize DOMPurify with JSDOM for server-side sanitization
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window as any);

// Configuration for HTML sanitization
const SANITIZE_CONFIG = {
  // Allow basic formatting but strip dangerous elements
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'blockquote'],
  ALLOWED_ATTR: [],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
  FORBID_ATTR: ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur'],
  KEEP_CONTENT: false, // Remove content of forbidden tags
  ALLOW_DATA_ATTR: false
};

// Fields that should be sanitized (typically user-generated content)
const SANITIZABLE_FIELDS = [
  'notes',
  'comments', 
  'description',
  'feedback',
  'message',
  'content',
  'remarks',
  'summary',
  'details'
];

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return DOMPurify.sanitize(obj, SANITIZE_CONFIG);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  if (typeof obj === 'object') {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (SANITIZABLE_FIELDS.includes(key.toLowerCase()) || 
          key.toLowerCase().includes('note') ||
          key.toLowerCase().includes('comment') ||
          key.toLowerCase().includes('description')) {
        
        if (typeof value === 'string') {
          sanitized[key] = DOMPurify.sanitize(value, SANITIZE_CONFIG);
        } else {
          sanitized[key] = sanitizeObject(value);
        }
      } else {
        sanitized[key] = sanitizeObject(value);
      }
    }
    
    return sanitized;
  }

  return obj;
}

/**
 * Express middleware to sanitize request body, query, and params
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  try {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize route parameters (usually not needed but for completeness)
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    console.error('Error sanitizing input:', error);
    res.status(500).json({
      error: 'Input sanitization failed',
      code: 'SANITIZATION_ERROR'
    });
  }
}

/**
 * Utility function to sanitize a single string
 */
export function sanitizeString(input: string): string {
  return DOMPurify.sanitize(input, SANITIZE_CONFIG);
}

/**
 * Utility function to sanitize markdown content more permissively
 */
export function sanitizeMarkdown(input: string): string {
  const markdownConfig = {
    ...SANITIZE_CONFIG,
    ALLOWED_TAGS: [...SANITIZE_CONFIG.ALLOWED_TAGS, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre', 'a'],
    ALLOWED_ATTR: ['href', 'title', 'target']
  };
  
  return DOMPurify.sanitize(input, markdownConfig);
}