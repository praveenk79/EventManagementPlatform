// Simple service worker for offline support
const CACHE_NAME = 'event-platform-v1';
const urlsToCache = [
  '/',
  '/admin',
  '/programs',
  '/organizer',
  '/auth/login',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
