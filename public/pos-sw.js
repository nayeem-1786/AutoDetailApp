const CACHE_NAME = 'pos-cache-v1';
const DATA_CACHE_NAME = 'pos-data-v1';

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

  // POS pages — cache first, network update in background (stale-while-revalidate)
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

        // Return cached version immediately, or wait for network
        if (cached) {
          // Fire and forget network update
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
});
