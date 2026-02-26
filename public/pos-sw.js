const CACHE_NAME = 'pos-cache-v4';
const DATA_CACHE_NAME = 'pos-data-v4';

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

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('POS SW: Some app shell assets failed to cache:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== DATA_CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      }),
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // CRITICAL: Only intercept same-origin GET requests.
  // Everything else (cross-origin, POST/PUT/DELETE, local network,
  // Stripe Terminal SDK, reader connections) passes through untouched.
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // CRITICAL: Never intercept Stripe-related requests
  if (url.hostname.includes('stripe.com')) return;

  // CRITICAL: Never intercept local/private network requests
  // Stripe Terminal Internet readers communicate via local HTTPS
  if (url.hostname.match(/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|localhost|127\.)/) ||
      url.hostname.endsWith('.local')) {
    return;
  }

  // API requests
  if (url.pathname.startsWith('/api/')) {
    // Only cache specific read-only API routes — let everything else pass through
    if (CACHEABLE_API_PATTERNS.some((p) => url.pathname.includes(p))) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(DATA_CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => caches.match(request))
      );
    }
    // All other API routes: don't call respondWith — browser handles natively
    return;
  }

  // POS pages — network-first with offline fallback
  if (url.pathname.startsWith('/pos')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match('/pos/offline');
          });
        })
    );
    return;
  }

  // Static assets — network-first (hashed filenames handle versioning)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.match(/\.(js|css|png|jpg|jpeg|webp|svg|woff2?)$/)
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else: don't call respondWith — browser handles natively
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
