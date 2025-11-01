/* public/service-worker.js
 * SW robusto sem addAll (evita "Request failed").
 * - Pré-cache apenas o que existir (via fetch + put).
 * - Ignora /api/* (sempre rede).
 * - Network-first para navegação (HTML).
 * - Cache-first para estáticos (CSS/JS/IMG/ICO/WEBP/PNG…).
 */

const SW_VERSION = 'cmdpii-v1.0.0';
const CACHE_NAME = `cmdpii-cache-${SW_VERSION}`;

// Liste aqui apenas itens que você TEM CERTEZA que existem.
// Pode deixar só o essencial; se algum faltar, ele será apenas ignorado.
const PRECACHE_URLS = [
  '/',                // se seu backend redireciona / -> /login.html, ok
  '/login.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Utilitário: pre-cache individual com tolerância (não quebra se 404)
async function safePrecache(cache, url) {
  try {
    const req = new Request(url, { cache: 'reload' });
    const res = await fetch(req);
    if (res && res.ok) {
      await cache.put(url, res.clone());
      // console.log('[SW] Precached:', url);
    } else {
      // console.warn('[SW] Skip precache (not OK):', url, res && res.status);
    }
  } catch (err) {
    // console.warn('[SW] Skip precache (fetch fail):', url, err);
  }
}

self.addEventListener('install', (event) => {
  // console.log('[SW] Instalando…', SW_VERSION);
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Pre-cache tolerante (sem addAll)
    await Promise.allSettled(PRECACHE_URLS.map(u => safePrecache(cache, u)));
    // Ativa imediatamente
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  // console.log('[SW] Ativando…', SW_VERSION);
  event.waitUntil((async () => {
    // Limpar caches antigos
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

  // Só tratamos GET e mesma origem
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Nunca interceptar APIs – sempre rede
  if (url.pathname.startsWith('/api/')) return;

  // Estratégia 1: navegação/HTML -> network-first, fallback cache
  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Fallback: tenta página inicial que foi pré-cacheada
        return caches.match('/login.html') || Response.error();
      }
    })());
    return;
  }

  // Estratégia 2: estáticos (css/js/img/ico/webp/png/svg/woff/ttf) -> cache-first
  const staticExt = /\.(?:css|js|mjs|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|eot|map)$/i;
  if (staticExt.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) {
        // Atualiza em segundo plano (stale-while-revalidate básico)
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

  // Demais GET (por segurança) -> network, fallback cache se existir
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

// Opcional: debug de versão
self.addEventListener('message', (event) => {
  if (event.data === 'SW_VERSION') {
    event.source?.postMessage?.({ type: 'SW_VERSION', value: SW_VERSION });
  }
});
