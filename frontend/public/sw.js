/**
 * Service Worker for Investment Platform
 * Provides intelligent caching and offline support (Tier 4 optimization)
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

// Static assets to pre-cache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// API endpoints with their cache strategies
const API_CACHE_RULES = {
  // Long TTL for stable data
  '/api/companies': { ttl: 300000, strategy: 'cache-first' },      // 5 min
  '/api/investors': { ttl: 600000, strategy: 'cache-first' },      // 10 min
  '/api/sectors': { ttl: 3600000, strategy: 'cache-first' },       // 1 hour

  // Medium TTL for semi-dynamic data
  '/api/companies/*/metrics': { ttl: 120000, strategy: 'network-first' },  // 2 min
  '/api/companies/*/analysis': { ttl: 120000, strategy: 'network-first' }, // 2 min

  // Short TTL or no cache for real-time data
  '/api/prices': { ttl: 30000, strategy: 'network-first' },        // 30 sec
  '/api/sentiment': { ttl: 60000, strategy: 'network-first' },     // 1 min
};

/**
 * Install event - pre-cache static assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Pre-caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name.startsWith('static-') ||
                     name.startsWith('api-') ||
                     name.startsWith('images-');
            })
            .filter((name) => {
              return name !== STATIC_CACHE &&
                     name !== API_CACHE &&
                     name !== IMAGE_CACHE;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

/**
 * Fetch event - handle requests with appropriate caching strategy
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(event.request, url));
    return;
  }

  // Handle static assets
  if (isStaticAsset(url.pathname)) {
    event.respondWith(handleStaticRequest(event.request));
    return;
  }

  // Handle images
  if (isImage(url.pathname)) {
    event.respondWith(handleImageRequest(event.request));
    return;
  }

  // Default: network first for everything else
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match(event.request))
  );
});

/**
 * Handle API requests with intelligent caching
 */
async function handleApiRequest(request, url) {
  const cacheRule = findCacheRule(url.pathname);

  if (!cacheRule) {
    // No caching for unknown endpoints
    return fetch(request);
  }

  const cache = await caches.open(API_CACHE);
  const cacheKey = request.url;

  if (cacheRule.strategy === 'cache-first') {
    // Try cache first, then network
    const cached = await getCachedResponse(cache, cacheKey, cacheRule.ttl);
    if (cached) {
      // Return cached response and refresh in background
      refreshCache(cache, request, cacheKey);
      return cached;
    }

    try {
      const response = await fetch(request);
      if (response.ok) {
        await putInCache(cache, cacheKey, response.clone());
      }
      return response;
    } catch (error) {
      // Return stale cache if network fails
      const stale = await cache.match(cacheKey);
      if (stale) return stale;
      throw error;
    }
  } else {
    // Network first, fall back to cache
    try {
      const response = await fetch(request);
      if (response.ok) {
        await putInCache(cache, cacheKey, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        console.log('[SW] Returning stale cache for:', cacheKey);
        return cached;
      }
      throw error;
    }
  }
}

/**
 * Handle static asset requests
 */
async function handleStaticRequest(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Handle image requests with long-term caching
 */
async function handleImageRequest(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Find cache rule for a given path
 */
function findCacheRule(pathname) {
  // Check exact matches first
  if (API_CACHE_RULES[pathname]) {
    return API_CACHE_RULES[pathname];
  }

  // Check pattern matches (using * as wildcard)
  for (const [pattern, rule] of Object.entries(API_CACHE_RULES)) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '[^/]+') + '$');
      if (regex.test(pathname)) {
        return rule;
      }
    }
  }

  return null;
}

/**
 * Get cached response if not expired
 */
async function getCachedResponse(cache, key, ttl) {
  const cached = await cache.match(key);
  if (!cached) return null;

  const cachedAt = cached.headers.get('sw-cached-at');
  if (cachedAt) {
    const age = Date.now() - parseInt(cachedAt, 10);
    if (age > ttl) {
      return null; // Expired
    }
  }

  return cached;
}

/**
 * Put response in cache with timestamp
 */
async function putInCache(cache, key, response) {
  const headers = new Headers(response.headers);
  headers.set('sw-cached-at', Date.now().toString());

  const cachedResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });

  await cache.put(key, cachedResponse);
}

/**
 * Refresh cache in background
 */
async function refreshCache(cache, request, key) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await putInCache(cache, key, response);
    }
  } catch (error) {
    // Ignore errors during background refresh
  }
}

/**
 * Check if path is a static asset
 */
function isStaticAsset(pathname) {
  return pathname.endsWith('.js') ||
         pathname.endsWith('.css') ||
         pathname.endsWith('.html') ||
         pathname.endsWith('.woff2') ||
         pathname.endsWith('.woff') ||
         pathname.endsWith('.ttf');
}

/**
 * Check if path is an image
 */
function isImage(pathname) {
  return pathname.endsWith('.png') ||
         pathname.endsWith('.jpg') ||
         pathname.endsWith('.jpeg') ||
         pathname.endsWith('.gif') ||
         pathname.endsWith('.svg') ||
         pathname.endsWith('.ico') ||
         pathname.endsWith('.webp');
}

/**
 * Handle messages from the main thread
 */
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((names) => {
        return Promise.all(names.map((name) => caches.delete(name)));
      })
    );
  }

  if (event.data.type === 'GET_CACHE_STATS') {
    getCacheStats().then((stats) => {
      event.source.postMessage({ type: 'CACHE_STATS', stats });
    });
  }
});

/**
 * Get cache statistics
 */
async function getCacheStats() {
  const stats = {};

  for (const cacheName of [STATIC_CACHE, API_CACHE, IMAGE_CACHE]) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    stats[cacheName] = {
      entries: keys.length
    };
  }

  return stats;
}
