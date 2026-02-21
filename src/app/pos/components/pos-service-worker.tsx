'use client';

import { useEffect } from 'react';

export function PosServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/pos-sw.js', { scope: '/pos' })
        .then((reg) => {
          console.log('POS SW registered:', reg.scope);

          // Check for updates every 30 minutes
          const interval = setInterval(() => reg.update(), 30 * 60 * 1000);
          return () => clearInterval(interval);
        })
        .catch((err) => console.error('POS SW registration failed:', err));
    }
  }, []);

  return null;
}
