'use client';

import { useEffect, useState } from 'react';

export function PosServiceWorker() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Version the SW registration URL with BUILD_ID so each deploy produces a
    // different URL → the browser registers a fresh SW → activate handler runs
    // → fresh chunks served on next page load. Without this versioning the SW
    // file URL is constant ('/pos-sw.js'), the browser caches it aggressively,
    // and `reg.update()` below is a no-op because the file's byte content
    // never changes between deploys. The compounding result was stale POS
    // bundle code surviving deploys — symptom: 2026-06-08 credit-loop fix
    // landed on server but operator's PWA continued executing pre-fix badge
    // code that called the old admin endpoint. BUILD_ID is inlined at build
    // time via next.config.ts's `env` block (line 23-25). The `|| 'dev'`
    // fallback is defense-in-depth — if inlining ever fails the URL stays
    // valid (just stops cache-busting between deploys until inlining is
    // fixed). See docs/dev/CHANGELOG entry 2026-06-08 for the full incident.
    navigator.serviceWorker
      .register(`/pos-sw.js?v=${process.env.BUILD_ID || 'dev'}`, { scope: '/pos' })
      .then((reg) => {
        console.log('POS SW registered:', reg.scope);

        // Check for SW-level updates every 30 minutes
        const swUpdateInterval = setInterval(() => reg.update(), 30 * 60 * 1000);
        return () => clearInterval(swUpdateInterval);
      })
      .catch((err) => console.error('POS SW registration failed:', err));

    // Listen for new version messages from service worker
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NEW_VERSION_AVAILABLE') {
        setUpdateAvailable(true);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleMessage);

    // Check for app version updates every 5 minutes
    const versionCheckInterval = setInterval(() => {
      navigator.serviceWorker.controller?.postMessage({ type: 'CHECK_VERSION' });
    }, 5 * 60 * 1000);

    // Initial version check once SW is ready
    navigator.serviceWorker.ready.then(() => {
      navigator.serviceWorker.controller?.postMessage({ type: 'CHECK_VERSION' });
    });

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
      clearInterval(versionCheckInterval);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-blue-600 text-white text-center py-2 text-sm font-medium flex items-center justify-center gap-2">
      <span>A new version is available.</span>
      <button
        onClick={() => window.location.reload()}
        className="underline font-bold"
      >
        Refresh now
      </button>
    </div>
  );
}
