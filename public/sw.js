/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<style>body{background:#05060a;color:#7dd3fc;font-family:monospace;display:grid;place-items:center;height:100vh;margin:0}' +
            'h1{font-size:1.2rem}</style><h1>NEXUS — tidak ada koneksi</h1>',
          { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/html' } },
        );
      }),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'NEXUS', body: 'Ada pesan baru' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}
  const options = {
    body: data.body,
    icon: '/nexus.svg',
    badge: '/nexus.svg',
    tag: 'nexus',
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || '/' },
    vibrate: [120, 40, 120],
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(event.notification.data.url || '/');
    }),
  );
});
