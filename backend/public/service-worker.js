/* public/service-worker.js
 * SW robusto sem addAll (evita "Request failed").
 * - Pré-cache apenas o que existir (via fetch + put).
 * - Ignora /api/* (sempre rede).
 * - 🚫 NÃO cacheia HTML/navegação (segurança de acesso por perfil).
 * - Cache-first para estáticos (CSS/JS/IMG/ICO/WEBP/PNG…).
 */

const SW_VERSION = 'cmdpii-v1.1.0'; // 🔄 versão nova para forçar atualização
const CACHE_NAME = `cmdpii-cache-${SW_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/login.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

async function safePrecache(cache, url) {
  try {
    const req = new Request(url, { cache: 'reload' });
    const res = await fetch(req);
    if (res && res.ok) {
      await cache.put(url, res.clone());
    }
  } catch {}
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(PRECACHE_URLS.map(u => safePrecache(cache, u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('cmdpii-cache-') && k !== CACHE_NAME)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 🚫 APIs nunca cache
  if (url.pathname.startsWith('/api/')) return;

  // 🚫 NUNCA cachear HTML ou navegação (ESSENCIAL PRA SEGURANÇA)
  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html') ||
    url.pathname.endsWith('.html');

  if (isNavigation) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // ✅ Arquivos estáticos → cache-first
  const staticExt = /\.(?:css|js|mjs|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|eot|map)$/i;
  if (staticExt.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) {
        fetch(request).then(async (fresh) => {
          if (fresh && fresh.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, fresh.clone()).catch(() => {});
          }
        }).catch(() => {});
        return cached;
      }
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  // Outros GET → rede primeiro
  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      return Response.error();
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SW_VERSION') {
    event.source?.postMessage?.({ type: 'SW_VERSION', value: SW_VERSION });
  }
});
