'use client';

import { useState, useEffect, useCallback } from 'react';
import { Maximize, Minimize } from 'lucide-react';

export function FullscreenToggle() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(
      !!(
        document.documentElement.requestFullscreen ||
        (document.documentElement as any).webkitRequestFullscreen
      )
    );

    const handler = () =>
      setIsFullscreen(
        !!document.fullscreenElement ||
          !!(document as any).webkitFullscreenElement
      );

    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (
        !document.fullscreenElement &&
        !(document as any).webkitFullscreenElement
      ) {
        const el = document.documentElement;
        if (el.requestFullscreen) await el.requestFullscreen();
        else if ((el as any).webkitRequestFullscreen)
          await (el as any).webkitRequestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if ((document as any).webkitExitFullscreen)
          await (document as any).webkitExitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  if (!supported) return null;

  return (
    <button
      onClick={toggle}
      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      {isFullscreen ? (
        <Minimize className="h-5 w-5 text-gray-600 dark:text-gray-400" />
      ) : (
        <Maximize className="h-5 w-5 text-gray-600 dark:text-gray-400" />
      )}
    </button>
  );
}
