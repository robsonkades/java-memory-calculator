/*
 * JVM Expert service worker.
 * - navigations: network-first, falling back to the cached page, then '/'
 * - same-origin GET assets (incl. /_next/static/): stale-while-revalidate
 * - /api/ is never cached (query-driven results must stay fresh)
 * Bump VERSION to invalidate every cache on deploy.
 */
const VERSION = 'jvme-v1';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(VERSION)
            .then((cache) => cache.addAll(['/']))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/')) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(VERSION).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match(request).then((hit) => hit ?? caches.match('/'))),
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((hit) => {
            const refresh = fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(VERSION).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => hit);
            return hit ?? refresh;
        }),
    );
});
