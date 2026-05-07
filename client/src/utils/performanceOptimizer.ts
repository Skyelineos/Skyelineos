// Performance optimization utilities
export const performanceOptimizer = {
  // Optimize React Query for faster loading
  optimizeQueryClient: () => {
    // Set default stale time to reduce unnecessary network requests
    return {
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000, // 5 minutes
          cacheTime: 10 * 60 * 1000, // 10 minutes
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    };
  },

  // Preload critical resources
  preloadCriticalResources: () => {
    if (typeof document === 'undefined') return;

    // Preload commonly used stylesheets
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'style';
    link.href = '/src/index.css';
    document.head.appendChild(link);
  },

  // Setup performance monitoring
  setupPerformanceMonitoring: () => {
    if (typeof window === 'undefined') return;

    // Monitor largest contentful paint
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'largest-contentful-paint') {
              console.debug('LCP:', entry.startTime);
            }
          }
        });
        observer.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (error) {
        // Silently fail if Performance Observer is not supported
      }
    }
  },

  // Optimize images for faster loading
  enableImageOptimization: () => {
    if (typeof document === 'undefined') return;

    // Add loading="lazy" to images
    const images = document.querySelectorAll('img:not([loading])');
    images.forEach(img => {
      img.setAttribute('loading', 'lazy');
    });
  }
};