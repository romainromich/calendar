/* Синхронизация с Google Calendar (основной календарь), без сервера:
   вход через Google Identity Services, обмен через Calendar REST API. */
(function () {
  'use strict';
  var C = window.Cal;
  if (!C) return;
  var h = C.h;
  var BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  var SCOPE = 'https://www.googleapis.com/auth/calendar.events';
  var TKEY = 'calendar.gtoken';
  var TZ = 'UTC';
  try { TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { /* UTC */ }
  var DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

  var tok = null;
  try { tok = JSON.parse(localStorage.getItem(TKEY)); } catch (e) { tok = null; }
  var busy = false, again = false, saving = false, timer = null, lastError = '';
  function S() { return C.S; }
  function tokenOk() { return !!(tok && tok.t && tok.exp > Date.now() + 30000); }

  /* ---------- вход ---------- */
  function loadGis(cb) {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return cb();
    var el = document.createElement('script');
    el.src = 'https://accounts.google.com/gsi/client';
    el.onload = cb;
    el.onerror = function () { lastError = 'Не удалось загрузить скрипт входа Google (нет сети?).'; updateCard(); };
    document.head.append(el);
  }
  function connect() {
    var cid = S().settings.gClientId;
    if (!cid) { C.openSettings(); return; }
    if (location.protocol === 'file:') {
      lastError = 'Вход через Google работает только по адресу http://localhost:8080, а не из файла.';
      updateCard(); return;
    }
    loadGis(function () {
      var client = window.google.accounts.oauth2.initTokenClient({
        client_id: cid, scope: SCOPE,
        callback: function (r) {
          if (r.error) { lastError = 'Ошибка входа: ' + r.error; updateCard(); return; }
          tok = { t: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 };
          try { localStorage.setItem(TKEY, JSON.stringify(tok)); } catch (e) { /* не критично */ }
          lastError = '';
          firstLink();
          sync('login');
        },
        error_callback: function () { lastError = 'Вход отменён.'; updateCard(); }
      });
      client.requestAccessToken({ prompt: S().g.linked ? '' : 'consent' });
    });
  }
  function firstLink() {
    var s = S();
    if (s.g.linked) return;
    var local = s.events.filter(function (e) { return !e.gid && !e.ro; });
    if (local.length) {
      var send = confirm('В календаре уже есть события (' + local.length + ', включая примеры). Отправить их в Google Calendar?\n\nОК — отправить.\nОтмена — оставить только здесь, из Google загрузятся только его события.');
      if (!send) local.forEach(function (e) { e.nosync = true; });
    }
    s.g.linked = true;
    saving = true; C.save(); saving = false;
  }
  function disconnect() {
    try { if (tok && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(tok.t, function () {}); } catch (e) { /* не критично */ }
    tok = null; localStorage.removeItem(TKEY); lastError = ''; updateCard();
  }

  /* ---------- HTTP ---------- */
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: { Authorization: 'Bearer ' + (tok && tok.t), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 401) { tok = null; localStorage.removeItem(TKEY); throw new Error('auth'); }
      if (r.status === 204) return null;
      return r.json().catch(function () { return null; }).then(function (j) {
        if (!r.ok) { var er = new Error((j && j.error && j.error.message) || ('HTTP ' + r.status)); er.status = r.status; throw er; }
        return j;
      });
    });
  }
  function listAll(single) {
    var out = [], tmin = new Date(Date.now() - 90 * 86400000).toISOString(), tmax = new Date(Date.now() + 400 * 86400000).toISOString();
    function page(pt) {
      var u = BASE + '?maxResults=250&showDeleted=true&singleEvents=' + (single ? 'true' : 'false') + '&timeMin=' + encodeURIComponent(tmin) + '&timeMax=' + encodeURIComponent(tmax) + (pt ? '&pageToken=' + encodeURIComponent(pt) : '');
      return api('GET', u).then(function (j) {
        out = out.concat((j && j.items) || []);
        return j && j.nextPageToken ? page(j.nextPageToken) : out;
      });
    }
    return page('');
  }

  /* ---------- правила повторов ---------- */
  function untilToKey(u) {
    if (u.length === 8) return u.slice(0, 4) + '-' + u.slice(4, 6) + '-' + u.slice(6, 8);
    var d = new Date(Date.UTC(+u.slice(0, 4), +u.slice(4, 6) - 1, +u.slice(6, 8), +u.slice(9, 11) || 0, +u.slice(11, 13) || 0, +u.slice(13, 15) || 0));
    return C.ymd(d);
  }
  function untilByCount(startKey, rep, n) {
    var tmp = { date: startKey, rep: { type: rep.type, interval: rep.interval, days: rep.days, until: '' }, ex: [] }, cnt = 0;
    for (var i = 0; i < 3660; i++) {
      var k = C.shiftDate(startKey, i);
      if (C.occursOn(tmp, k)) { cnt++; if (cnt >= n) return k; }
    }
    return '';
  }
  function parseRecurrence(lines, startKey) {
    var rr = null, ex = [], bad = false;
    (lines || []).forEach(function (l) {
      if (/^RRULE:/i.test(l)) rr = l.slice(6);
      else if (/^EXDATE/i.test(l)) { (l.split(':')[1] || '').split(',').forEach(function (x) { if (x.length >= 8) ex.push(x.slice(0, 4) + '-' + x.slice(4, 6) + '-' + x.slice(6, 8)); }); }
      else if (/^(RDATE|EXRULE)/i.test(l)) bad = true;
    });
    if (!rr || bad) return null;
    var o = {};
    rr.split(';').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1); });
    var type = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[o.FREQ];
    if (!type) return null;
    var allowed = { FREQ: 1, INTERVAL: 1, BYDAY: 1, UNTIL: 1, COUNT: 1, WKST: 1, BYMONTHDAY: 1, BYMONTH: 1 };
    for (var k in o) if (!allowed[k]) return null;
    var rep = { type: type, interval: o.INTERVAL ? +o.INTERVAL : 1, until: '' };
    if (!(rep.interval >= 1)) return null;
    var sd = C.parseYmd(startKey);
    if (o.BYDAY) {
      if (type !== 'weekly' || !/^((MO|TU|WE|TH|FR|SA|SU),?)+$/.test(o.BYDAY)) return null;
      rep.days = o.BYDAY.split(',').map(function (x) { return DOW.indexOf(x); });
      if (rep.days.length === 1 && rep.days[0] === sd.getDay()) delete rep.days;
    }
    if (o.BYMONTHDAY && (type !== 'monthly' || +o.BYMONTHDAY !== sd.getDate())) return null;
    if (o.BYMONTH && (type !== 'yearly' || +o.BYMONTH !== sd.getMonth() + 1)) return null;
    if (o.UNTIL) rep.until = untilToKey(o.UNTIL);
    else if (o.COUNT) { rep.until = untilByCount(startKey, rep, +o.COUNT); if (!rep.until) return null; }
    return { rep: rep, ex: ex };
  }
  function untilStamp(u) {
    var d = C.parseYmd(u);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }
  function rruleOf(e) {
    var r = e.rep, p = ['FREQ=' + { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[r.type]];
    if ((r.interval || 1) > 1) p.push('INTERVAL=' + r.interval);
    if (r.type === 'weekly' && r.days && r.days.length) {
      p.push('BYDAY=' + r.days.slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); }).map(function (d) { return DOW[d]; }).join(','));
    }
    if (r.until) p.push('UNTIL=' + (e.allDay ? r.until.replace(/-/g, '') : untilStamp(r.until)));
    return p.join(';');
  }

  /* ---------- преобразование событий ---------- */
  function iso(dateKey, min) {
    var d = C.parseYmd(dateKey);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(min / 60), min % 60).toISOString();
  }
  function toG(e, forPatch) {
    var b = { summary: e.title, description: e.notes || '' };
    if (e.allDay) {
      b.start = { date: e.date }; b.end = { date: C.shiftDate(e.date, e.days || 1) };
      if (forPatch) { b.start.dateTime = null; b.end.dateTime = null; }
    } else {
      b.start = { dateTime: iso(e.date, e.start), timeZone: TZ }; b.end = { dateTime: iso(e.date, Math.max(e.end, e.start + 5)), timeZone: TZ };
      if (forPatch) { b.start.date = null; b.end.date = null; }
    }
    if (e.rep) b.recurrence = ['RRULE:' + rruleOf(e)]; else if (forPatch) b.recurrence = null;
    var m = C.remMinutes(e);
    b.reminders = m === null ? { useDefault: false, overrides: [] } : { useDefault: false, overrides: [{ method: 'popup', minutes: m }] };
    return b;
  }
  function applyFromG(e, g, rec) {
    e.title = g.summary || '(без названия)'; e.notes = g.description || '';
    e.gid = g.id; e.gu = g.updated || ''; e.dirty = false;
    if (g.start && g.start.date) {
      e.allDay = true; e.date = g.start.date; e.start = 0; e.end = 1440;
      var n = g.end && g.end.date ? C.dayDiff(g.end.date, g.start.date) : 1;
      if (n > 1) e.days = n; else delete e.days;
    } else if (g.start && g.start.dateTime) {
      delete e.allDay; delete e.days;
      var s = new Date(g.start.dateTime), en = new Date(g.end.dateTime);
      e.date = C.ymd(s); e.start = s.getHours() * 60 + s.getMinutes();
      e.end = Math.min(e.start + Math.round((en - s) / 60000), 2880);    // через полночь — больше 24:00
      if (e.end <= e.start) e.end = Math.min(e.start + 30, 1440);
    }
    if (g.reminders && g.reminders.useDefault === false) {
      var ov = (g.reminders.overrides || []).filter(function (o) { return o.method === 'popup'; });
      e.rem = ov.length ? ov[0].minutes : null;
    } else delete e.rem;
    if (rec) { e.rep = rec.rep; e.ex = (e.ex || []).concat(rec.ex.filter(function (d) { return (e.ex || []).indexOf(d) < 0; })); }
    else { e.rep = null; if (!e.ex) e.ex = []; }
    return e;
  }
  function instanceId(m, dateKey) {
    return m.gid + '_' + (m.allDay ? dateKey.replace(/-/g, '') : iso(dateKey, m.start).replace(/[-:]/g, '').replace(/\.\d{3}/, ''));
  }
  function keyOfOrig(o) { return o.date ? o.date : C.ymd(new Date(o.dateTime)); }

  /* ---------- сам обмен ---------- */
  function doSync() {
    var s = S(), st = { pulled: 0, pushed: 0, removed: 0, failed: 0 }, unsup = {};
    s.events = s.events.filter(function (e) { return !e.ro; });
    return listAll(false).then(function (items) {
      var byGid = {};
      s.events.forEach(function (e) { if (e.gid) byGid[e.gid] = e; });
      function removeLocal(e) { s.events = s.events.filter(function (x) { return x !== e; }); delete byGid[e.gid]; st.removed++; }
      function addEx(m, key) { m.ex = m.ex || []; m.gex = m.gex || []; if (m.ex.indexOf(key) < 0) m.ex.push(key); if (m.gex.indexOf(key) < 0) m.gex.push(key); }

      items.filter(function (g) { return !g.recurringEventId; }).forEach(function (g) {
        var local = byGid[g.id];
        if (g.status === 'cancelled') {
          if (!local) return;
          if (local.dirty && !local.nosync) { delete byGid[g.id]; local.gid = null; } else removeLocal(local);
          return;
        }
        if (!g.start) return;
        var rec = null;
        if (g.recurrence) {
          rec = parseRecurrence(g.recurrence, g.start.date || C.ymd(new Date(g.start.dateTime)));
          if (!rec) { unsup[g.id] = true; if (local) removeLocal(local); return; }
        }
        if (!local) {
          var n = applyFromG({ id: C.uid(), cat: s.settings.defaultCat }, g, rec);
          n.gex = n.ex.slice();
          s.events.push(n); byGid[g.id] = n; st.pulled++;
        } else if (local.dirty && !local.nosync) { /* локальная версия новее: уйдёт в Google */ }
        else if (local.gu !== g.updated) {
          applyFromG(local, g, rec); local.gex = (local.gex || []).concat(rec ? rec.ex : []); st.pulled++;
        }
      });
      items.filter(function (g) { return g.recurringEventId; }).forEach(function (g) {
        if (unsup[g.recurringEventId]) return;
        var m = byGid[g.recurringEventId];
        if (!m || !g.originalStartTime) return;
        var okey = keyOfOrig(g.originalStartTime);
        addEx(m, okey);
        var local = byGid[g.id];
        if (g.status === 'cancelled') { if (local) removeLocal(local); return; }
        if (!local) {
          var n = applyFromG({ id: C.uid(), cat: m.cat }, g, null);
          s.events.push(n); byGid[g.id] = n; st.pulled++;
        } else if (!local.dirty && local.gu !== g.updated) { applyFromG(local, g, null); st.pulled++; }
      });
      if (!Object.keys(unsup).length) return;
      return listAll(true).then(function (inst) {
        inst.forEach(function (g) {
          if (!unsup[g.recurringEventId] || g.status === 'cancelled' || !g.start) return;
          var e = applyFromG({ id: C.uid(), cat: s.settings.defaultCat }, g, null);
          e.ro = true; e.nosync = true; delete e.gid; e.rgid = g.id;
          s.events.push(e);
        });
      });
    }).then(function () {
      var jobs = [];
      s.tomb.splice(0).forEach(function (gid) {
        jobs.push(function () { return api('DELETE', BASE + '/' + encodeURIComponent(gid)).then(function () { st.removed++; }, function (e) { if (e.status !== 404 && e.status !== 410) throw e; }); });
      });
      s.events.slice().forEach(function (e) {
        if (e.ro || e.nosync || e.demo) return;
        if (!e.gid || e.dirty) {
          jobs.push(function () {
            function insert() { return api('POST', BASE, toG(e, false)); }
            var p = e.gid ? api('PATCH', BASE + '/' + encodeURIComponent(e.gid), toG(e, true)).catch(function (er) { if (er.status === 404 || er.status === 410) return insert(); throw er; }) : insert();
            return p.then(function (res) { e.gid = res.id; e.gu = res.updated || e.gu; e.dirty = false; st.pushed++; });
          });
        }
      });
      // отмена вхождений, удалённых локально
      s.events.slice().forEach(function (e) {
        if (e.ro || e.nosync || e.demo || !e.rep) return;
        (e.ex || []).forEach(function (d) {
          if ((e.gex || []).indexOf(d) >= 0) return;
          jobs.push(function () {
            if (!e.gid) return null;
            return api('PATCH', BASE + '/' + encodeURIComponent(instanceId(e, d)), { status: 'cancelled' })
              .catch(function (er) { if (er.status !== 404 && er.status !== 410) throw er; })
              .then(function () { e.gex = (e.gex || []).concat(d); });
          });
        });
      });
      return jobs.reduce(function (p, j) {
        return p.then(function () { return j(); }).catch(function (er) { if (er && er.message === 'auth') throw er; st.failed++; lastError = 'Часть изменений не отправилась: ' + (er && er.message); });
      }, Promise.resolve()).then(function () { return st; });
    });
  }

  function sync() {
    if (busy) { again = true; return Promise.resolve(); }
    if (!tokenOk()) { lastError = 'Нужно войти в аккаунт Google.'; updateCard(); return Promise.resolve(); }
    busy = true; lastError = ''; updateCard();
    return doSync().then(function (st) {
      S().g.last = Date.now(); S().g.stats = st;
      saving = true; C.save(); saving = false; C.render();
    }).catch(function (e) {
      lastError = e && e.message === 'auth' ? 'Сессия Google истекла. Нажмите «Войти через Google».' : 'Ошибка синхронизации: ' + (e && e.message);
    }).then(function () {
      busy = false; updateCard();
      if (again) { again = false; schedule(1500); }
    });
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(sync, ms); }

  C.hooks.save.push(function () {
    if (saving || !tokenOk() || !S().settings.gAuto) return;
    var s = S();
    if (s.tomb.length || s.events.some(function (e) { return (e.dirty || !e.gid) && !e.nosync && !e.demo && !e.ro; })) schedule(4000);
  });

  /* ---------- интерфейс ---------- */
  function ago(ts) {
    if (!ts) return 'ещё не было';
    var m = Math.round((Date.now() - ts) / 60000);
    return m < 1 ? 'только что' : m < 60 ? m + ' мин назад' : Math.round(m / 60) + ' ч назад';
  }
  function statusLine() {
    var s = S().settings;
    if (!s.gClientId) return 'Не настроено: нужен Client ID.';
    if (busy) return 'Идёт синхронизация…';
    if (lastError) return lastError;
    if (!tokenOk()) return 'Нужно войти в аккаунт Google.';
    var st = S().g.stats;
    return 'Синхронизировано ' + ago(S().g.last) + (st ? ' (загружено ' + st.pulled + ', отправлено ' + st.pushed + ')' : '');
  }
  function updateCard() {
    var el = document.getElementById('gcard'), s = S().settings;
    var line = statusLine(), label, fn;
    if (!s.gClientId) { label = 'Настроить'; fn = function () { C.openSettings(); }; }
    else if (!tokenOk()) { label = 'Войти через Google'; fn = connect; }
    else { label = 'Синхронизировать'; fn = function () { sync(); }; }
    if (el) el.replaceChildren(h('b', null, 'Google Calendar'), h('div', { class: 'mute small' }, line), h('button', { type: 'button', class: 'btn wide', disabled: busy, onclick: fn }, label));
    var st = document.getElementById('gStatus');
    if (st) st.textContent = line;
  }

  C.extra.push(function () {
    var s = S().settings;
    var cid = h('input', { type: 'text', value: s.gClientId || '', placeholder: '1234567890-abc….apps.googleusercontent.com', oninput: function () { s.gClientId = cid.value.trim(); C.save(); updateCard(); } });
    var auto = h('input', { type: 'checkbox', checked: s.gAuto !== false, onchange: function () { s.gAuto = auto.checked; C.save(); } });
    var origin = location.protocol === 'file:' ? 'http://localhost:8080' : location.origin;
    return h('div', { class: 'set-sec' }, h('h3', null, 'Google Calendar'),
      h('label', { class: 'field' }, 'Client ID (OAuth, тип «Веб-приложение»)', cid),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px' },
        h('button', { type: 'button', class: 'btn primary', onclick: connect }, 'Войти через Google'),
        h('button', { type: 'button', class: 'btn', onclick: function () { sync(); } }, 'Синхронизировать'),
        h('button', { type: 'button', class: 'btn', onclick: disconnect }, 'Выйти')),
      h('label', { class: 'check' }, auto, 'Синхронизировать автоматически (каждые 5 минут и после изменений)'),
      h('div', { id: 'gStatus', class: 'small', style: 'margin-bottom:8px' }, statusLine()),
      h('details', null, h('summary', null, 'Как получить Client ID'),
        h('ol', { class: 'small' },
          h('li', null, 'Откройте console.cloud.google.com и создайте проект.'),
          h('li', null, 'APIs & Services → Library → включите «Google Calendar API».'),
          h('li', null, 'OAuth consent screen → тип External, добавьте свой Gmail в Test users.'),
          h('li', null, 'Credentials → Create credentials → OAuth client ID → «Web application».'),
          h('li', null, 'В «Authorized JavaScript origins» добавьте ' + origin + '.'),
          h('li', null, 'Скопируйте Client ID в поле выше и нажмите «Войти через Google».')),
        h('p', { class: 'small mute' }, 'Вход работает только по адресу http://localhost:8080 (python -m http.server 8080 в папке приложения) или с вашего хостинга по https, но не из файла. Синхронизируется основной календарь. Если событие изменено в обоих местах, побеждает версия из приложения.')));
  });

  window.CalSync = { sync: sync, doSync: doSync, parseRecurrence: parseRecurrence, toG: toG, rruleOf: rruleOf, setToken: function (t) { tok = t; }, updateCard: updateCard, instanceId: instanceId };
  updateCard();
  setInterval(updateCard, 30000);
  setInterval(function () { if (S().settings.gAuto !== false && tokenOk()) sync(); }, 5 * 60000);
  setTimeout(function () { if (S().settings.gAuto !== false && tokenOk()) sync(); }, 2500);
})();
