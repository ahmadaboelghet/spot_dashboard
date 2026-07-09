const CACHE_NAME = 'learnaria-cache-v5';

// Only cache truly static assets - NEVER cache script.js so updates are instant
const urlsToCache = [
    '/',
    '/index.html',
    '/css/style.css',
    '/assets/images/learnaria_logo.png',
    '/assets/images/favicon.png',
];

// Files that should NEVER be served from cache (always fetch fresh)
const neverCache = [
    '/js/script.js',
    'script.js'
];

self.addEventListener('install', event => {
    // Take control immediately without waiting for old SW to finish
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('Service Worker: Cache opened v5');
            return cache.addAll(urlsToCache);
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            // Delete ALL old caches
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name !== CACHE_NAME)
                        .map(name => {
                            console.log('Service Worker: Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            }),
            // Take control of all open clients immediately
            clients.claim()
        ])
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Never serve JS files from cache - always fetch fresh
    if (url.pathname.endsWith('.js') || neverCache.some(p => url.pathname.includes(p))) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Network-first strategy for HTML pages
    if (url.pathname.endsWith('.html') || url.pathname === '/') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first for static assets (CSS, images, fonts)
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (!response || response.status !== 200) return response;
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            });
        })
    );
});