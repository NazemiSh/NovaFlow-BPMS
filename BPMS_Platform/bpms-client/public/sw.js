const CACHE_NAME = 'novaflow-pwa-network-first-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/api/branding/pwa-icon/') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname.startsWith('/swagger') ||
    url.pathname === '/sw.js' ||
    url.pathname === '/manifest.json' ||
    url.pathname.startsWith('/icons/')
  ) {
    return;
  }

  // باندل‌های JS و CSS دارای هش هستند؛ همیشه مستقیماً از شبکه دریافت شوند تا نسخه قدیمی در کش نماند
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' }).catch(() => caches.match(request))
    );
    return;
  }

  // برای صفحات ناوبری و فایل‌های ایستا (مانند manifest، فونت‌ها و آیکن‌ها): استراتژی Network-First
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const fallback = await caches.match('/');
          if (fallback) return fallback;
        }
        return new Response('در حال حاضر دسترسی به شبکه برقرار نیست.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});
