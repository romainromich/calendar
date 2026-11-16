const CACHE = 'calendar-v19';
const FILES = ['./', './index.html', './style.css', './parse.js', './app.js', './notify.js', './sync.js', './push.js', './backup.js', './prep.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let items = [];
    try {
      const c = await caches.open('push-cfg');
      const r = await c.match(new URL('push-cfg.json', self.registration.scope).href);
      if (r) {
        const cfg = await r.json();
        const d = await fetch(cfg.url + '/due?id=' + encodeURIComponent(cfg.id));
        items = (await d.json()).items || [];
      }
    } catch (err) { /* покажем общее уведомление */ }
    if (!items.length) items = [{ title: 'Календарь', body: 'Напоминание' }];
    await Promise.all(items.map((i) => self.registration.showNotification(i.title, { body: i.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: i.title + '|' + i.body })));
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow(self.registration.scope);
  }));
});
