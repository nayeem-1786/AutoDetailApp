const CACHE_NAME = 'pos-cache-v2';
const DATA_CACHE_NAME = 'pos-data-v2';

// App shell assets to pre-cache
const APP_SHELL = [
  '/pos',
  '/pos/offline',
];

// API routes to cache for offline access (read-only data)
const CACHEABLE_API_PATTERNS = [
  '/api/pos/services',
  '/api/pos/products',
  '/api/pos/categories',
  '/api/pos/settings',
  '/api/pos/favorites',
];

// API routes that should NEVER be cached (mutations)
const NEVER_CACHE_PATTERNS = [
  '/api/pos/transactions',
  '/api/pos/sync-offline-transaction',
  '/api/pos/checkout',
  '/api/pos/refund',
  '/api/stripe',
  '/api/pos/customers',
  '/api/pos/version',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll may fail if pages require auth — gracefully handle
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('POS SW: Some app shell assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== DATA_CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST, PUT, DELETE are mutations)
  if (request.method !== 'GET') return;

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // Never cache certain API routes
  if (NEVER_CACHE_PATTERNS.some((p) => url.pathname.includes(p))) return;

  // API requests — network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    if (CACHEABLE_API_PATTERNS.some((p) => url.pathname.includes(p))) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            // Only cache successful responses
            if (response.ok) {
              const clone = response.clone();
              caches.open(DATA_CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => caches.match(request))
      );
    }
    return;
  }

  // POS pages — stale-while-revalidate: serve cached, update in background
  if (url.pathname.startsWith('/pos')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => null);

        if (cached) {
          // Serve cached immediately, fire background update
          networkFetch;
          return cached;
        }

        // No cache — must wait for network, fall back to offline page
        return networkFetch.then((response) => {
          if (response) return response;
          return caches.match('/pos/offline');
        });
      })
    );
    return;
  }

  // Static assets — cache first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.match(/\.(js|css|png|jpg|jpeg|webp|svg|woff2?)$/)
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return (
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
        );
      })
    );
  }
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'CHECK_VERSION') {
    fetch('/api/pos/version', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        const currentVersion = self.__POS_VERSION;
        if (currentVersion && data.version !== currentVersion) {
          // New version detected — purge all POS caches
          caches.keys().then((keys) =>
            Promise.all(
              keys.filter((k) => k.startsWith('pos-')).map((k) => caches.delete(k))
            )
          ).then(() => {
            self.clients.matchAll().then((clients) => {
              clients.forEach((client) =>
                client.postMessage({ type: 'NEW_VERSION_AVAILABLE' })
              );
            });
          });
        }
        self.__POS_VERSION = data.version;
      })
      .catch(() => {
        // Silently fail if offline
      });
  }
});
