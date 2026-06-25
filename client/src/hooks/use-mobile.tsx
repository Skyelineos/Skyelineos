import { useState, useEffect } from 'react';

export function useMobile() {
  // Initialise synchronously so the first render already has the correct value.
  // This prevents components gated on !isMobile from flashing briefly on mobile.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

// Alias for compatibility
export const useIsMobile = useMobile;