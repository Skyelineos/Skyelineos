import compression from 'compression';
import { constants as zlibConstants } from 'zlib';
import { Request, Response, NextFunction } from 'express';

// Custom compression middleware for API responses
export const compressionMiddleware = compression({
  // Only compress responses larger than 1KB
  threshold: 1024,
  
  // Compression level (1-9, higher is better compression but slower)
  level: 6,
  
  // Custom filter for what to compress
  filter: (req: Request, res: Response) => {
    // Don't compress if the response is already compressed
    if (res.headersSent) {
      return false;
    }

    // Don't compress images, videos, or already compressed files
    const contentType = res.getHeader('content-type') as string;
    if (contentType) {
      const skipTypes = [
        'image/',
        'video/',
        'audio/',
        'application/pdf',
        'application/zip',
        'application/gzip'
      ];
      
      if (skipTypes.some(type => contentType.includes(type))) {
        return false;
      }
    }

    // Compress JSON, HTML, CSS, JS, and text responses
    return compression.filter(req, res);
  },
  
  // Memory level (1-9, higher uses more memory but may be faster)
  memLevel: 8,
  
  // Compression strategy
  strategy: zlibConstants.Z_DEFAULT_STRATEGY
});

// Middleware to add cache headers for static assets
export const cacheHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Add cache headers for static assets
  if (req.url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    // Cache static assets for 1 year
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (req.url.startsWith('/api/')) {
    // API responses: cache for 30 seconds
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');
  } else {
    // HTML pages: cache for 5 minutes
    res.setHeader('Cache-Control', 'public, max-age=300');
  }
  
  next();
};