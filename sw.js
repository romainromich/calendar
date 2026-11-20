const V = '55';
const CACHE = 'calendar-v' + V;
const FILES = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png']
  .concat(['style.css', 'parse.js', 'app.js', 'notify.js', 'sync.js', 'push.js', 'backup.js', 'prep.js', 'voice.js', 'review.js', 'offline.js', 'focus.js', 'cloudsync.js', 'boot.js', 'splash.js'].map((f) => './' + f + '?v=' + V));
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match(e.request, { ignoreSearch: true })).then((r) => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined))));
});

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let items = [];
    const c = await caches.open('push-cfg');
    const u = (n) => new URL(n, self.registration.scope).href;
    const read = async (n, def) => { try { const r = await c.match(u(n)); return r ? await r.json() : def; } catch (err) { return def; } };
    const shown = await read('push-shown.json', {});
    try {
      const cfg = await read('push-cfg.json', null);
      if (cfg) {
        const d = await fetch(cfg.url + '/due?id=' + encodeURIComponent(cfg.id));
        items = (await d.json()).items || [];
      }
    } catch (err) { /* сервер не ответил — возьмём текст из копии расписания */ }
    const now = Date.now();
    if (!items.length) {
      const local = await read('push-items.json', []);
      items = local.filter((i) => i.at <= now + 2 * 60000 && i.at >= now - 20 * 60000 && !shown[i.k]);
    }
    items = items.filter((i) => !i.k || !shown[i.k]);
    if (!items.length) items = [{ title: 'Календарь', body: 'Откройте приложение, чтобы увидеть напоминание' }];
    items.forEach((i) => { if (i.k) shown[i.k] = now; });
    Object.keys(shown).forEach((k) => { if (now - shown[k] > 3 * 86400000) delete shown[k]; });
    await c.put(u('push-shown.json'), new Response(JSON.stringify(shown)));
    await Promise.all(items.map((i) => self.registration.showNotification(i.title, { body: i.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: i.k || (i.title + '|' + i.body) })));
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow(self.registration.scope);
  }));
});
