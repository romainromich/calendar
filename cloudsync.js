/* Синхронизация телефона и ПК через свой Cloudflare Worker (тот же, что для push).
   Данные шифруются на устройстве ключом синхронизации (AES-GCM); сервер хранит
   только шифротекст под хэшем ключа. Слияние трёхстороннее: локальное, облачное
   и последняя общая версия, поэтому правки с двух устройств не затирают друг друга. */
(function () {
  'use strict';
  var C = window.Cal;
  if (!C || !window.crypto || !crypto.subtle) return;
  var h = C.h;
  var LS_KEY = 'calendar.cloud', LS_BASE = 'calendar.cloud.base';
  var DEF = 'https://calendar-push.efremovr449.workers.dev';
  var LISTS = ['cats', 'events', 'tasks', 'habits'];
  var cfg = read(LS_KEY) || {}, busy = false, again = false, timer = null, statusEl = null, lastErr = '';

  function S() { return C.S; }
  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* нет места */ } }
  function base() { return String(S().settings.pushUrl || DEF).replace(/\/+$/, ''); }
  function on() { return !!cfg.key; }

  /* ---------- ключ и шифрование ---------- */
  var enc = new TextEncoder(), dec = new TextDecoder();
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  function b64(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); }
  function unb64(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function newKey() {
    // 20 символов без похожих букв, группами по 4: «K7QM-2XPA-…»
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(20)), out = '';
    for (var i = 0; i < 20; i++) { out += abc[r[i] % abc.length]; if (i % 4 === 3 && i < 19) out += '-'; }
    return out;
  }
  function normKey(k) { return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(?=.)/g, '$1-'); }
  function idOf(key) { return crypto.subtle.digest('SHA-256', enc.encode('calendar-id:' + key)).then(hex); }
  function aesOf(key) {
    return crypto.subtle.digest('SHA-256', enc.encode('calendar-enc:' + key)).then(function (d) {
      return crypto.subtle.importKey('raw', d, 'AES-GCM', false, ['encrypt', 'decrypt']);
    });
  }
  function seal(key, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return aesOf(key).then(function (k) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, enc.encode(JSON.stringify(obj))); })
      .then(function (ct) { return b64(iv) + '.' + b64(ct); });
  }
  function open(key, str) {
    var p = String(str).split('.');
    return aesOf(key).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p[0]) }, k, unb64(p[1])); })
      .then(function (pt) { return norm(JSON.parse(dec.decode(pt))); });
  }

  /* ---------- сеть ---------- */
  function get(id) {
    return fetch(base() + '/data?id=' + id, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('Сервер ответил ' + r.status);
      return r.json();
    });
  }
  function put(id, rev, data) {
    return fetch(base() + '/data?id=' + id, { method: 'POST', headers: C.srvHeaders(), body: JSON.stringify({ rev: rev, data: data }) })
      .then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); });
  }

  /* ---------- данные и слияние ---------- */
  function norm(d) {
    (d.events || []).forEach(function (e) { e.rep = C.normRep(e.rep); if (!e.ex) e.ex = []; });
    return d;
  }
  function pick(st) { return norm(JSON.parse(JSON.stringify({ cats: st.cats, events: st.events, tasks: st.tasks, habits: st.habits, log: st.log || {} }))); }
  function byId(list) { var m = {}; (list || []).forEach(function (x) { if (x && x.id != null) m[x.id] = x; }); return m; }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function mergeList(L, R, B) {
    var l = byId(L), r = byId(R), b = byId(B), ids = {}, out = [];
    (L || []).concat(R || []).forEach(function (x) { if (x && x.id != null) ids[x.id] = 1; });
    // порядок: как на этом устройстве, новое из облака — в конец
    Object.keys(ids).forEach(function (id) {
      var lv = l[id], rv = r[id], bv = b[id], res;
      if (same(lv, bv)) res = rv;          // здесь не меняли — берём облако (в т. ч. удаление)
      else if (same(rv, bv)) res = lv;     // в облаке не меняли — берём своё
      else res = lv || rv;                 // поменяли с обеих сторон — своё важнее, удаление проигрывает правке
      if (res) out.push(res);
    });
    return out;
  }
  function mergeLog(L, R, B) {
    var out = {}, ids = {};
    [L, R, B].forEach(function (o) { Object.keys(o || {}).forEach(function (k) { ids[k] = 1; }); });
    Object.keys(ids).forEach(function (id) {
      var l = (L || {})[id] || [], r = (R || {})[id] || [], b = (B || {})[id] || [], set = {};
      l.concat(r).forEach(function (d) { set[d] = 1; });
      b.forEach(function (d) { if (l.indexOf(d) < 0 || r.indexOf(d) < 0) delete set[d]; });   // сняли отметку на одном из устройств
      var days = Object.keys(set).sort();
      if (days.length) out[id] = days;
    });
    return out;
  }
  function merge(L, R, B) {
    var o = {};
    LISTS.forEach(function (k) { o[k] = mergeList(L[k], R[k], B[k]); });
    if (!o.cats.length) o.cats = L.cats;
    o.log = mergeLog(L.log, R.log, B.log);
    return o;
  }
  function apply(d) {
    var st = S();
    LISTS.forEach(function (k) { st[k] = d[k]; });
    st.log = d.log;
    applying = true;
    try { C.save(); } finally { applying = false; }
    C.render();
  }
  var applying = false;

  /* ---------- цикл синхронизации ---------- */
  function setStatus(t, err) { lastErr = err ? t : ''; cfg.last = err ? cfg.last : Date.now(); paint(t); }
  function run() {
    if (!on()) return Promise.resolve();
    if (busy) { again = true; return Promise.resolve(); }
    if (!navigator.onLine) { paint('Нет сети: синхронизирую, когда появится'); return Promise.resolve(); }
    busy = true;
    var key = cfg.key, id;
    var tries = 0;
    function step() {
      tries++;
      return get(id).then(function (srv) {
        var baseDoc = read(LS_BASE) || { rev: 0, data: null };
        var local = pick(S());
        if (srv.data && srv.rev === baseDoc.rev && same(local, baseDoc.data)) return 'ok';          // нигде ничего не менялось
        var remoteP = srv.data ? open(key, srv.data) : Promise.resolve(null);
        return remoteP.then(function (remote) {
          var merged;
          if (!remote) merged = local;
          else if (srv.rev === baseDoc.rev && baseDoc.data) merged = local;                    // в облаке ничего нового
          else merged = merge(local, remote, baseDoc.data || remote);
          if (!same(merged, local)) apply(merged);
          if (remote && same(merged, remote)) { write(LS_BASE, { rev: srv.rev, data: merged }); return 'ok'; }
          return seal(key, merged).then(function (ct) { return put(id, srv.rev, ct); }).then(function (res) {
            if (res._status === 409 && tries < 4) return step();
            if (res._status !== 200) throw new Error(res._status === 401 ? 'нет доступа к серверу: войдите по коду приглашения (Настройки → Доступ к серверу)' : res._status === 429 ? 'слишком много запросов, попробую позже' : res.error === 'size' ? 'Данных слишком много для сервера' : 'Сервер ответил ' + res._status);
            write(LS_BASE, { rev: res.rev, data: merged });
            return 'ok';
          });
        });
      });
    }
    return idOf(key).then(function (x) { id = x; return step(); })
      .then(function () { setStatus('Синхронизировано'); write(LS_KEY, cfg); })
      .catch(function (e) {
        var msg = e && e.name === 'OperationError' ? 'Ключ не подходит к данным в облаке' : (e && e.message) || 'ошибка';
        if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) msg = 'Сервер недоступен';
        setStatus('Не удалось: ' + msg, true);
      })
      .then(function () { busy = false; if (again) { again = false; later(500); } });
  }
  function later(ms) { clearTimeout(timer); timer = setTimeout(run, ms); }

  /* ---------- включение ---------- */
  function enable(key, join) {
    key = normKey(key);
    if (key.replace(/-/g, '').length < 16) { C.toast('Ключ короткий: проверьте, что скопировали его целиком.'); return; }
    if (join && window.CalBackup) window.CalBackup.snapshot('перед подключением синхронизации');
    var prev = cfg;
    cfg = { key: key };
    paint('Подключаю…');
    var go = Promise.resolve();
    if (join) {
      // присоединение: берём облако целиком, своё (обычно демо-данные) сохранено в автокопии
      go = idOf(key).then(get).then(function (srv) {
        if (!srv.data) throw new Error('По этому ключу в облаке пусто. Проверьте ключ.');
        return open(key, srv.data).then(function (d) { apply(d); write(LS_BASE, { rev: srv.rev, data: pick(S()) }); });
      });
    } else write(LS_BASE, null);
    return go.then(function () { write(LS_KEY, cfg); return run(); }).then(function () { rebuild(); })
      .catch(function (e) {
        cfg = prev; write(LS_KEY, cfg.key ? cfg : null);
        var msg = e && e.name === 'OperationError' ? 'Ключ не подходит' : (e && e.message) || 'ошибка';
        if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) msg = 'Сервер недоступен';
        C.toast(msg, { title: 'Синхронизация не подключена' }); rebuild();
      });
  }
  function disable() {
    if (!confirm('Отключить синхронизацию на этом устройстве? Данные останутся и здесь, и в облаке.')) return;
    cfg = {}; write(LS_KEY, null); write(LS_BASE, null); rebuild();
  }

  /* ---------- интерфейс в настройках ---------- */
  var box = null;
  function ago(t) {
    if (!t) return '';
    var m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? 'только что' : m < 60 ? m + ' мин назад' : new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function paint(t) { if (statusEl) statusEl.textContent = t + (cfg.last && !lastErr && t === 'Синхронизировано' ? ' · ' + ago(cfg.last) : ''); }
  function rebuild() { if (box) box.replaceChildren.apply(box, body()); }
  function body() {
    statusEl = h('div', { class: 'mute small', role: 'status' });
    if (!on()) {
      var inp = h('input', { type: 'text', placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
      return [
        h('p', { class: 'mute small', style: 'margin-top:0' }, 'Одни и те же события, задачи и привычки на телефоне и ПК. Данные шифруются на устройстве, сервер видит только шифротекст. Настройки и тема у каждого устройства свои.'),
        h('div', { class: 'cs-row' }, h('button', { type: 'button', class: 'btn primary', onclick: function () { enable(newKey(), false); } }, 'Включить на этом устройстве')),
        h('label', { class: 'field', style: 'margin-top:12px' }, 'Уже включили на другом устройстве? Введите его ключ', inp),
        h('div', { class: 'cs-row' }, h('button', { type: 'button', class: 'btn', onclick: function () { enable(inp.value, true); } }, 'Подключить')),
        statusEl
      ];
    }
    var keyEl = h('code', { class: 'cs-key' }, cfg.key);
    paint(lastErr || (cfg.last ? 'Синхронизировано' : 'Ещё не синхронизировано'));
    return [
      h('p', { class: 'mute small', style: 'margin-top:0' }, 'Включено. Чтобы подключить другое устройство, откройте там Настройки → Синхронизация и введите этот ключ. Храните его как пароль: с ним можно прочитать календарь.'),
      h('div', { class: 'cs-row' }, keyEl,
        h('button', { type: 'button', class: 'btn', onclick: function () {
          (navigator.clipboard ? navigator.clipboard.writeText(cfg.key) : Promise.reject()).then(function () { C.toast('Ключ скопирован'); }, function () { C.toast('Скопируйте ключ вручную: ' + cfg.key); });
        } }, 'Копировать')),
      statusEl,
      h('div', { class: 'cs-row' },
        h('button', { type: 'button', class: 'btn', onclick: function () { paint('Синхронизирую…'); run(); } }, 'Синхронизировать сейчас'),
        h('button', { type: 'button', class: 'btn danger', onclick: disable }, 'Отключить'))
    ];
  }
  C.extra.push(function () {
    box = h('div');
    rebuild();
    return h('div', { class: 'set-sec' }, h('h3', null, 'Синхронизация устройств'), box);
  });

  /* ---------- когда синхронизировать ---------- */
  C.hooks.save.push(function () { if (on() && !applying) later(4000); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') later(300); });
  window.addEventListener('online', function () { later(500); });
  setInterval(function () { if (document.visibilityState === 'visible') run(); }, 60000);
  if (on()) later(800);

  window.CalCloud = { run: run, _merge: merge, _on: on };
})();
