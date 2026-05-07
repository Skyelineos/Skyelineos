import { useState, useEffect, useRef } from 'react';

interface TouchGesture {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  direction: 'left' | 'right' | 'up' | 'down' | null;
  distance: number;
}

interface UseTouchOptions {
  threshold?: number;
  preventDefault?: boolean;
}

export function useTouch(options: UseTouchOptions = {}) {
  const { threshold = 50, preventDefault = false } = options;
  const [gesture, setGesture] = useState<TouchGesture | null>(null);
  const touchRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = touchRef.current;
    if (!element) return;

    let startX = 0;
    let startY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (preventDefault) e.preventDefault();
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (preventDefault) e.preventDefault();
      const touch = e.changedTouches[0];
      const endX = touch.clientX;
      const endY = touch.clientY;
      
      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      if (distance < threshold) return;

      let direction: TouchGesture['direction'] = null;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        direction = deltaX > 0 ? 'right' : 'left';
      } else {
        direction = deltaY > 0 ? 'down' : 'up';
      }

      setGesture({
        startX,
        startY,
        endX,
        endY,
        direction,
        distance
      });
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: !preventDefault });
    element.addEventListener('touchend', handleTouchEnd, { passive: !preventDefault });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [threshold, preventDefault]);

  return { gesture, touchRef, setGesture };
}

// Hook for detecting touch device
export function useIsTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const checkTouch = () => {
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    
    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  return isTouchDevice;
}