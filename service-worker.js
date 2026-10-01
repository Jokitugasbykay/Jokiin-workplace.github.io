const CACHE_NAME = 'jokiin-admin-v25';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/supabaseClient.js',
  './assets/apple-touch-icon.png',
  './assets/logo-jokiin.png',
  './assets/logo-jokiin-invoice.png',
  './assets/icon-512.png',
  './assets/logo-jokiin.png',
  './assets/logo-jokiin-invoice.png',
  './assets/wordmark.png',
  './assets/secure.gif'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('jokiin-admin-') && key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== new URL(self.registration.scope).origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') {
      const home = await caches.match('./index.html');
      if (home) return home;
    }
    return Response.error();
  }));
});

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch {}
  const tab = ['orders', 'payments', 'home'].includes(payload.tab) ? payload.tab : 'orders';
  event.waitUntil(self.registration.showNotification(payload.title || 'Pesanan baru · JOKI.IN', {
    body: payload.body || 'Ada pesanan baru masuk. Buka Workplace untuk melihat detail.',
    icon: new URL('./assets/logo-jokiin.png',
  './assets/logo-jokiin-invoice.png', self.registration.scope).href,
    badge: new URL('./assets/logo-jokiin.png',
  './assets/logo-jokiin-invoice.png', self.registration.scope).href,
    tag: typeof payload.tag === 'string' ? payload.tag : 'workplace-order',
    data: { tab }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const tab = ['orders', 'payments', 'home'].includes(event.notification.data?.tab) ? event.notification.data.tab : 'orders';
  const target = new URL('./index.html', self.registration.scope);
  target.searchParams.set('tab', tab);
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const client = clients.find(c => c.url.startsWith(self.registration.scope));
    if (client) { await client.navigate(target.href); return client.focus(); }
    return self.clients.openWindow(target.href);
  }));
});
