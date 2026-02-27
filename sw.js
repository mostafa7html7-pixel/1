const CACHE_NAME = 'abqarieno-v17'; // Fix CORS Error & Force Cloudinary
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './library.html',
    './videos.html',
    './profile.html',
    './subscription.html',
    './auth.html',
    './schedule.html',
    './reviews.html',
    './contact.html',
    './scientific-books.html',
    './admin.html',
    './style.css',
    './main.js',
    './6.jpeg',
    './212.png'
];

// تثبيت Service Worker
self.addEventListener('install', (e) => {
    self.skipWaiting(); // Force new SW to take over immediately
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

// تفعيل Service Worker وحذف الكاش القديم
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
            if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        }).then(() => self.clients.claim()) // السيطرة على الصفحات المفتوحة فوراً
    );
});

// Stale-While-Revalidate Strategy
self.addEventListener('fetch', (e) => {
    // Only handle GET requests and ignore external resources we don't want to cache.
    if (e.request.method !== 'GET' || e.request.url.includes('firebase') || e.request.url.includes('googleapis')) {
        return;
    }

    e.respondWith(
        // Open the cache once for efficiency.
        caches.open(CACHE_NAME).then((cache) => {
            return cache.match(e.request).then((cachedResponse) => {
                // Start fetching from the network to get the latest version.
                const networkFetch = fetch(e.request).then((networkResponse) => {
                    // If the fetch is successful, update the cache.
                    // We need to clone the response as it can only be read once.
                    cache.put(e.request, networkResponse.clone());
                    return networkResponse;
                }).catch(err => {
                    console.error('Service Worker fetch failed:', err);
                    // This error will propagate to the browser if no cached response is available.
                });

                // Return the cached response immediately if it exists, otherwise, wait for the network.
                return cachedResponse || networkFetch;
            });
        })
    );
});