import { useEffect } from 'react';
import { useLocation } from 'wouter';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

// Custom NProgress configuration with accessibility fixes
NProgress.configure({
  showSpinner: false,
  speed: 500,
  minimum: 0.3,
  easing: 'ease',
  trickleSpeed: 200,
});

// Safe ARIA fix with MutationObserver for better DOM readiness
const fixNProgressAria = () => {
  // Guard against SSR or missing document
  if (typeof document === 'undefined') {
    return;
  }
  
  // Use MutationObserver to safely watch for NProgress DOM changes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(() => {
      try {
        const progressBars = document.querySelectorAll('#nprogress .bar[role="bar"]');
        progressBars.forEach(bar => {
          if (bar && bar.getAttribute('role') === 'bar') {
            bar.setAttribute('role', 'progressbar');
            bar.setAttribute('aria-label', 'Loading page content');
          }
        });
      } catch (error) {
        // Silently fail to avoid runtime errors
      }
    });
  });
  
  // Observe changes to nprogress container
  const nprogress = document.getElementById('nprogress');
  if (nprogress) {
    observer.observe(nprogress, { 
      childList: true, 
      subtree: true, 
      attributes: true,
      attributeFilter: ['role']
    });
  }
  
  // Clean up observer after 2 seconds
  setTimeout(() => {
    observer.disconnect();
  }, 2000);
};

// Override NProgress start with safer approach
const originalStart = NProgress.start;
NProgress.start = function() {
  const result = originalStart.call(this);
  // Use setTimeout instead of requestAnimationFrame for safer timing
  setTimeout(() => {
    fixNProgressAria();
  }, 10);
  return result;
};

export function NavigationHandler() {
  const [location] = useLocation();

  useEffect(() => {
    // Start progress bar on route change
    NProgress.start();
    
    // Complete progress bar after a short delay to allow for component loading
    const timer = setTimeout(() => {
      NProgress.done();
    }, 100);

    return () => {
      clearTimeout(timer);
      NProgress.done(); // Ensure progress bar is always completed
    };
  }, [location]);

  return null; // This component doesn't render anything visual
}