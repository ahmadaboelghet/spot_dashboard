/* eslint-disable no-restricted-globals */
/**
 * Spot Educational Platform - Service Worker (Offline-First App Shell)
 * Version: elnazer-shell-v1
 */

const CACHE_NAME = 'elnazer-shell-v1';

// Core App Shell Assets for instant offline load
const PRECACHE_ASSETS = [
    './dashboard.html',
    './manifest.json',
    './css/tailwind.css',
    './css/style.css',
    './assets/images/learnaria_logo.png',
    './assets/images/favicon.png',
    './js/config.js',
    './js/db.js',
    './js/sync.js',
    './js/scanner.js',
    './js/ai-chat.js',
    './js/dashboard.js',
    './js/script.js',
    './js/scanner-worker.js'
];

// Domains that should NEVER be intercepted or cached
const LIVE_API_HOSTS = [
    'firestore.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'cloudfunctions.net',
    'firebasestorage.googleapis.com',
    'sentry.io',
    'google-analytics.com',
    'analytics.google.com',
    'googletagmanager.com'
];

// Trusted static CDN hosts for Stale-While-Revalidate caching
const TRUSTED_STATIC_CDNS = [
    'gstatic.com',
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
];

// ── 1. Install Event: Precache Core App Shell ─────────────────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[SW] Precaching Core App Shell...');
            // Add assets individually with catch so one missing asset does not abort the entire install
            await Promise.all(
                PRECACHE_ASSETS.map(async (url) => {
                    try {
                        const response = await fetch(url, { cache: 'no-cache' });
                        if (response.ok) {
                            await cache.put(url, response);
                        }
                    } catch (err) {
                        console.warn(`[SW] Precache failed for ${url}:`, err);
                    }
                })
            );
            console.log('[SW] Precache complete.');
        })
    );
});

// ── 2. Activate Event: Clean up Old Caches & Take Immediate Control ───────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            caches.keys().then((keys) => {
                return Promise.all(
                    keys.map((key) => {
                        if (key !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', key);
                            return caches.delete(key);
                        }
                    })
                );
            }),
            self.clients.claim()
        ])
    );
});

// ── 3. Fetch Event Routing ────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // 1. Never intercept non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    const url = new URL(request.url);

    // 2. Bypass live backend, Auth, Firestore, AI and analytics endpoints
    const isLiveApi = LIVE_API_HOSTS.some((host) => url.hostname.includes(host)) || url.pathname.includes('/api/');
    if (isLiveApi) {
        return;
    }

    // 3. Navigation Requests (User opening / refreshing dashboard)
    // Network-First with 2.5s timeout fallback to cached ./dashboard.html
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    const networkPromise = fetch(request);
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Network timeout for navigation')), 2500)
                    );
                    const response = await Promise.race([networkPromise, timeoutPromise]);
                    if (response && response.status === 200) {
                        const cache = await caches.open(CACHE_NAME);
                        cache.put('./dashboard.html', response.clone());
                        return response;
                    }
                } catch (err) {
                    console.log('[SW] Navigation network fetch failed or timed out. Falling back to cached dashboard.html');
                }

                // Fallback to cached dashboard.html (ignoring search parameters and hashes)
                const cachedDash = await caches.match('./dashboard.html', { ignoreSearch: true });
                if (cachedDash) return cachedDash;
                const cachedSlash = await caches.match('/dashboard.html', { ignoreSearch: true });
                if (cachedSlash) return cachedSlash;
                return caches.match('./', { ignoreSearch: true });
            })()
        );
        return;
    }

    // 4. Same-origin static assets & trusted static CDNs
    // Stale-While-Revalidate: return cache immediately if available, update in background
    const isSameOrigin = url.origin === self.location.origin;
    const isTrustedCDN = TRUSTED_STATIC_CDNS.some((host) => url.hostname.includes(host));

    if (isSameOrigin || isTrustedCDN) {
        event.respondWith(
            (async () => {
                const cache = await caches.open(CACHE_NAME);
                const cachedResponse = await cache.match(request, { ignoreSearch: true });

                const fetchPromise = fetch(request).then((networkResponse) => {
                    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                        cache.put(request, networkResponse.clone());
                    }
                    return networkResponse;
                }).catch(() => null);

                // If in cache, return immediately while updating in background
                if (cachedResponse) {
                    return cachedResponse;
                }

                // If not in cache, wait for network
                const netRes = await fetchPromise;
                if (netRes) return netRes;

                // Fallback attempt with ignoreSearch for local files
                if (isSameOrigin) {
                    const fallback = await cache.match(url.pathname, { ignoreSearch: true });
                    if (fallback) return fallback;
                }

                return new Response('Asset unavailable offline', { status: 503, statusText: 'Service Unavailable' });
            })()
        );
    }
});
