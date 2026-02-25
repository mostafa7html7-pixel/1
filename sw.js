const CACHE_NAME = 'abqarieno-v1';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './library.html',
    './videos.html',
    './schedule.html',
    './reviews.html',
    './contact.html',
    './scientific-books.html',
    './style.css',
    './6.jpeg',
    './212.png'
];

// تثبيت Service Worker وتخزين الملفات
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

// استرجاع الملفات من الكاش أو الشبكة
self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((res) => {
            return res || fetch(e.request);
        })
    );
});