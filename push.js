/* Push-уведомления: работают, когда приложение закрыто (нужен сервер из папки cloudflare) */
(function () {
  'use strict';
  var C = window.Cal;
  if (!C) return;
  var h = C.h;
  var DEF = 'https://calendar-push.efremovr449.workers.dev';
  var IDK = 'calendar.pushid';
  var lastHash = '', lastErr = '', timer = null, statusEl = null;

  function S() { return C.S; }
  function base() { return String(S().settings.pushUrl || DEF).replace(/\/+$/, ''); }
  function supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function myId() { try { return localStorage.getItem(IDK) || ''; } catch (e) { return ''; } }
  function isOn() { return !!(S().settings.pushOn && myId() && supported() && Notification.permission === 'granted'); }
  function toBytes(s) {
    var p = new Array((4 - s.length % 4) % 4 + 1).join('=');
    var b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')), a = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a;
  }
  function post(path, body) {
    return fetch(base() + path, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; } return j; });
    });
  }
  function setStatus(t) { if (statusEl) statusEl.textContent = t; }
  function describe() {
    if (!supported()) return 'Этот браузер не поддерживает push (на iPhone нужно сначала добавить приложение на экран «Домой»).';
    if (lastErr) return lastErr;
    if (Notification.permission === 'denied') return 'Уведомления запрещены в настройках браузера для этого сайта.';
    return isOn() ? 'Включено: напоминания придут и при закрытом приложении.' : 'Выключено.';
  }

  /* расписание на ближайшие 3 дня */
  function buildItems() {
    var now = Date.now(), base0 = new Date(), items = [];
    base0 = new Date(base0.getFullYear(), base0.getMonth(), base0.getDate());
    for (var i = 0; i <= 2; i++) {
      var key = C.ymd(C.addDays(base0, i));
      C.eventsOn(key, true).forEach(function (e) {
        var rem = C.remMinutes(e);
        if (rem === null) return;
        if (e.allDay && typeof e.rem !== 'number') return;
        var d = C.parseYmd(key);
        var startTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), e.allDay ? 9 : Math.floor(e.start / 60), e.allDay ? 0 : e.start % 60).getTime();
        var at = startTs - rem * 60000;
        if (at < now - 10 * 60000) return;
        items.push({
          k: e._m.id + '|' + key + '|' + rem, at: at,
          title: (C.isKey(e) ? '⚑ ' : '') + e.title,
          body: e.allDay ? 'Весь день, ' + key : (rem <= 0 ? 'Начинается сейчас' : 'Через ' + rem + ' мин') + ', в ' + C.hm(e.start)
        });
      });
    }
    items.sort(function (a, b) { return a.at - b.at; });
    return items.slice(0, 100);
  }
  function sync(force) {
    if (!isOn() || !navigator.onLine) return Promise.resolve();
    var items = buildItems(), hash = JSON.stringify(items);
    if (!force && hash === lastHash) return Promise.resolve();
    return post('/schedule', { id: myId(), items: items }).then(function () { lastHash = hash; lastErr = ''; setStatus(describe()); }).catch(function (e) {
      if (e.status === 404) { lastErr = 'Сервер не знает этого устройства. Выключите и включите push заново.'; }
      else lastErr = 'Не удалось отправить расписание: ' + e.message;
      setStatus(describe());
    });
  }
  function later(ms) { clearTimeout(timer); timer = setTimeout(function () { sync(false); }, ms); }

  function enable() {
    lastErr = '';
    if (!supported()) return Promise.reject(new Error('Этот браузер не поддерживает push'));
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return Promise.reject(new Error('Откройте приложение по адресу https, а не из файла'));
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw new Error('Разрешение на уведомления не выдано');
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return fetch(base() + '/vapid').then(function (r) { if (!r.ok) throw new Error('Сервер недоступен (HTTP ' + r.status + ')'); return r.json(); }).then(function (j) {
        return reg.pushManager.getSubscription().then(function (old) { return old ? old.unsubscribe() : null; }).then(function () {
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(j.key) });
        });
      });
    }).then(function (sub) {
      return post('/subscribe', { sub: sub.toJSON() });
    }).then(function (r) {
      try { localStorage.setItem(IDK, r.id); } catch (e) { /* не критично */ }
      return caches.open('push-cfg').then(function (c) {
        return c.put(new URL('push-cfg.json', location.href).href, new Response(JSON.stringify({ url: base(), id: r.id })));
      });
    }).then(function () {
      S().settings.pushOn = true; C.save(); lastHash = '';
      return sync(true);
    });
  }
  function disable() {
    var id = myId();
    S().settings.pushOn = false; C.save(); lastHash = '';
    var p = ('serviceWorker' in navigator) ? navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) { return s ? s.unsubscribe() : null; }) : Promise.resolve();
    return p.catch(function () {}).then(function () { return id ? post('/unsubscribe', { id: id }).catch(function () {}) : null; }).then(function () { try { localStorage.removeItem(IDK); } catch (e) { /* ок */ } });
  }

  C.hooks.save.push(function () { if (isOn()) later(3000); });
  setInterval(function () { sync(false); }, 5 * 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(false); });
  setTimeout(function () { sync(false); }, 3000);

  C.extra.push(function () {
    var onoff = h('button', { type: 'button', class: 'btn primary' }, isOn() ? 'Выключить' : 'Включить');
    var test = h('button', { type: 'button', class: 'btn' }, 'Проверить');
    statusEl = h('div', { class: 'small', style: 'margin:8px 0' }, describe());
    var url = h('input', { type: 'text', value: S().settings.pushUrl || DEF, oninput: function () { S().settings.pushUrl = url.value.trim(); C.save(); } });
    function refresh() { onoff.textContent = isOn() ? 'Выключить' : 'Включить'; setStatus(describe()); onoff.disabled = false; }
    onoff.onclick = function () {
      onoff.disabled = true; setStatus('Подождите…');
      (isOn() ? disable() : enable()).catch(function (e) { lastErr = e.message || String(e); }).then(refresh);
    };
    test.onclick = function () {
      if (!isOn()) { setStatus('Сначала включите push.'); return; }
      setStatus('Отправляю проверочное уведомление…');
      post('/test', { id: myId() }).then(function (r) { setStatus(r.ok ? 'Отправлено, уведомление должно прийти через несколько секунд.' : 'Сервер уведомлений ответил ошибкой: ' + r.status); })
        .catch(function (e) { setStatus('Не удалось: ' + e.message); });
    };
    return h('div', { class: 'set-sec' }, h('h3', null, 'Push-уведомления (при закрытом приложении)'),
      h('p', { class: 'mute small', style: 'margin-top:0' }, 'Напоминания придут на это устройство, даже когда календарь закрыт. Включайте отдельно на телефоне и на компьютере. Нужен адрес https (не файл).'),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, onoff, test),
      statusEl,
      h('label', { class: 'field' }, 'Адрес сервера уведомлений', url));
  });

  window.CalPush = { enable: enable, disable: disable, sync: sync, buildItems: buildItems };
})();
