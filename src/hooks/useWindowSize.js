import { useState, useEffect } from 'react';

export function useWindowSize() {
  const [size, setSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  });

  useEffect(() => {
    const h = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    // Fire immediately to sync after hydration
    h();
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  return {
    ...size,
    isMobile: size.width < 640,
    isTablet: size.width >= 640 && size.width < 1024,
  };
}
