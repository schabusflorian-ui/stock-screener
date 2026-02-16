/**
 * Service Worker for Investment Platform
 * Provides intelligent caching and offline support (Tier 4 optimization)
 */

const CACHE_VERSION = 'v4'; // v4: bump to clear stale chunks after deploy; ErrorBoundary handles ChunkLoadError
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

// Static assets to pre-cache (exclude HTML so deploy serves fresh index; JS/CSS are network-first)
const STATIC_ASSETS = [
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

  // Handle API requests - wrap so we never leave FetchEvent with a rejected promise
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      handleApiRequest(event.request, url).catch((err) => {
        console.warn('[SW] handleApiRequest error:', err);
        return networkErrorResponse(event.request.url);
      })
    );
    return;
  }

  // HTML/JS/CSS: network-first so deploy always serves new chunks (avoids ChunkLoadError)
  if (isHtmlJsCss(url.pathname)) {
    event.respondWith(handleHtmlJsCssRequest(event.request));
    return;
  }

  // Other static assets (fonts, etc.)
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
 * Return a JSON error response so the client always gets a Response (no uncaught rejections)
 */
function networkErrorResponse(url) {
  return new Response(
    JSON.stringify({ error: 'Network error', message: 'Service unavailable. Please try again.' }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

/**
 * Handle API requests with intelligent caching
 * Never rejects: returns synthetic 503 if network fails and no cache is available.
 */
async function handleApiRequest(request, url) {
  const cacheRule = findCacheRule(url.pathname);

  if (!cacheRule) {
    // No caching for unknown endpoints - still catch so we don't leave promise rejected
    try {
      return await fetch(request);
    } catch (error) {
      console.warn('[SW] Network failed for (no cache rule):', request.url);
      return networkErrorResponse(request.url);
    }
  }

  const cache = await caches.open(API_CACHE);
  const cacheKey = request.url;

  if (cacheRule.strategy === 'cache-first') {
    const cached = await getCachedResponse(cache, cacheKey, cacheRule.ttl);
    if (cached) {
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
      const stale = await cache.match(cacheKey);
      if (stale) return stale;
      console.warn('[SW] Network failed (cache-first):', request.url);
      return networkErrorResponse(request.url);
    }
  } else {
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
      console.warn('[SW] Network failed (network-first):', request.url);
      return networkErrorResponse(request.url);
    }
  }
}

/**
 * Paths that must never be cache-first (after deploy, new hashes; old chunks 404)
 */
function isHtmlJsCss(pathname) {
  return pathname === '/' ||
         pathname === '/index.html' ||
         pathname.endsWith('.js') ||
         pathname.endsWith('.css');
}

/**
 * Network-first for HTML/JS/CSS so users always get current chunks after deploy
 */
async function handleHtmlJsCssRequest(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.open(STATIC_CACHE).then((c) => c.match(request));
    return cached || response503();
  }
}

function response503() {
  return new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });
}

/**
 * Handle other static asset requests (fonts, etc.) – cache-first
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
 * Check if path is a static asset (excluding HTML/JS/CSS handled by isHtmlJsCss)
 */
function isStaticAsset(pathname) {
  return pathname.endsWith('.woff2') ||
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
