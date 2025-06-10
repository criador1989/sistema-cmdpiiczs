
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando...');
  event.waitUntil(
    caches.open('cmdpii-cache').then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/login.html',
        '/painel.html',
        '/style.css'
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((resp) => {
      return resp || fetch(event.request);
    })
  );
});
