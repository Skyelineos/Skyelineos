import { useEffect } from 'react';
import { useLocation } from 'wouter';

export function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    // Scroll to top when route changes
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, [location]);

  return null;
}