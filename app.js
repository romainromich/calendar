/* Календарь: приложение для ПК (без сборки, данные в localStorage) */
(function () {
  'use strict';
  var P = window.CalParse;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ---------- вспомогательное ---------- */
  function h(tag, a) {
    var e = document.createElement(tag);
    a = a || {};
    for (var k in a) {
      var v = a[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    var kids = Array.prototype.slice.call(arguments, 2);
    (function add(list) {
      list.forEach(function (c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) return add(c);
        e.append(c.nodeType ? c : document.createTextNode(String(c)));
      });
    })(kids);
    return e;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function pad(n) { return P.pad(n); }
  function ymd(d) { return P.ymd(d); }
  function parseYmd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { return P.addDays(d, n); }
  function hm(min) { return Math.floor(min / 60) + ':' + pad(min % 60); }
  function toInput(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function fromInput(v) { var p = v.split(':'); return +p[0] * 60 + +p[1]; }
  function sameDay(a, b) { return ymd(a) === ymd(b); }

  var MON_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  var MON_NOM = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  var MON_SHORT = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  var DOW_SHORT = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  var DOW_LONG = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];

  /* ---------- данные ---------- */
  var KEY = 'calendar.v1';
  var PRESETS = {
    night:    { name: 'Мята и сирень', c: { bg: '#08090C', panel: '#14161B', ink: '#F4F5F7', line: '#2A2D33', accent: '#5EEAD4', a2: '#A78BFA' } },
    amber:    { name: 'Янтарь',   c: { bg: '#0B0907', panel: '#17140F', ink: '#F6F1EA', line: '#2E2A22', accent: '#FF9A3D', a2: '#FF6B6B' } },
    indigo:   { name: 'Индиго',   c: { bg: '#090A12', panel: '#14151F', ink: '#F2F3FA', line: '#2A2C3B', accent: '#8B9BFF', a2: '#F0ABFC' } },
    lime:     { name: 'Лайм',     c: { bg: '#090B08', panel: '#131610', ink: '#F3F6EE', line: '#2A2F24', accent: '#C6F24E', a2: '#5EEAD4' } },
    rose:     { name: 'Роза',     c: { bg: '#0D090B', panel: '#191215', ink: '#F8F1F3', line: '#33282D', accent: '#FF7AA8', a2: '#FFC6A0' } },
    dayMint:  { name: 'Мята · день',   c: { bg: '#F1F6F4', panel: '#FFFFFF', ink: '#10231F', line: '#D8E5E1', accent: '#0FA98F', a2: '#7C5CE0' } },
    dayAmber: { name: 'Янтарь · день', c: { bg: '#FAF4EC', panel: '#FFFFFF', ink: '#2A1D10', line: '#EADFCF', accent: '#E8730C', a2: '#D9455B' } },
    dayIndigo:{ name: 'Индиго · день', c: { bg: '#F3F4FB', panel: '#FFFFFF', ink: '#12142B', line: '#DEE0F0', accent: '#4F5FE0', a2: '#C04BE0' } },
    dayLime:  { name: 'Лайм · день',   c: { bg: '#F5F8EC', panel: '#FFFFFF', ink: '#1B2410', line: '#E0E8CC', accent: '#5E8F0B', a2: '#0FA98F' } },
    dayRose:  { name: 'Роза · день',   c: { bg: '#FBF2F4', panel: '#FFFFFF', ink: '#2B1119', line: '#F0DCE2', accent: '#E0457B', a2: '#F08A4B' } },
    light:    { name: 'Светлая',  c: { bg: '#F4F5F7', panel: '#FFFFFF', ink: '#14171C', line: '#E3E6EB', accent: '#3B5BDB' } },
    dark:     { name: 'Тёмная',   c: { bg: '#0F1217', panel: '#171B22', ink: '#E8EBF0', line: '#2A313C', accent: '#8FA8FF' } },
    warm:     { name: 'Тёплая',   c: { bg: '#F6F1E9', panel: '#FFFCF7', ink: '#2B2118', line: '#E6DCCB', accent: '#C2410C' } },
    graphite: { name: 'Графит',   c: { bg: '#1B1D21', panel: '#25282D', ink: '#ECECEC', line: '#383C43', accent: '#F2B84B' } },
    mint:     { name: 'Мятная',   c: { bg: '#EEF6F3', panel: '#FFFFFF', ink: '#10231D', line: '#D5E7E0', accent: '#0F9A82' } }
  };
  var COLOR_LABELS = [['bg', 'Фон приложения'], ['panel', 'Таблички и панели'], ['ink', 'Текст'], ['line', 'Линии и границы'], ['accent', 'Акцент']];

  function defaults() {
    return {
      settings: { colors: Object.assign({}, PRESETS.night.c), design: 2, semStart: '', font: 13, density: 'normal', weekStart: 1, hourStart: 8, hourEnd: 21, defaultCat: 'study',
        view: (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) ? 'day' : 'week',
        remDefault: 10, notify: false, vault: '', obsFolder: 'Календарь', gClientId: '', gAuto: true },
      cats: [
        { id: 'study', name: 'Учёба', color: '#4C6EF5' },
        { id: 'deadline', name: 'Дедлайны', color: '#E8590C' },
        { id: 'sport', name: 'Спорт', color: '#12B886' },
        { id: 'personal', name: 'Личное', color: '#F59F00' }
      ],
      events: [], tasks: [], habits: [], log: {}, hidden: {}, seeded: false, tomb: [], g: {}
    };
  }
  function load() {
    var d = defaults();
    try {
      var raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && typeof raw === 'object') {
        d.settings = Object.assign(d.settings, raw.settings || {});
        d.settings.colors = Object.assign({}, PRESETS.light.c, (raw.settings || {}).colors || {});
        if ((raw.settings || {}).design !== 2) { d.settings.colors = Object.assign({}, PRESETS.night.c); d.settings.design = 2; }
        ['cats', 'events', 'tasks', 'habits'].forEach(function (k) { if (Array.isArray(raw[k]) && (k !== 'cats' || raw[k].length)) d[k] = raw[k]; });
        d.log = raw.log || {}; d.hidden = raw.hidden || {}; d.seeded = !!raw.seeded;
        d.tomb = Array.isArray(raw.tomb) ? raw.tomb : []; d.g = raw.g || {};
      }
    } catch (e) { /* пустые данные */ }
    d.events.forEach(function (e) { e.rep = normRep(e.rep); if (!e.ex) e.ex = []; });
    return d;
  }
  function normRep(r) {
    if (!r) return null;
    if (r.type === 'weekdays') return { type: 'weekly', interval: 1, days: [1, 2, 3, 4, 5], until: r.until || '' };
    if (r.type === 'biweekly') return { type: 'weekly', interval: 2, until: r.until || '' };
    var o = { type: r.type, interval: r.interval || 1, until: r.until || '' };
    if (r.days && r.days.length) o.days = r.days.slice();
    return o;
  }
  var hooks = { save: [] };
  var extra = [];
  var S = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* хранилище недоступно */ }
    hooks.save.forEach(function (f) { try { f(); } catch (e) { /* хук не должен ломать сохранение */ } });
  }
  function mark(e) { e.dirty = true; delete e.demo; return e; }

  function seed() {
    if (S.seeded) return;
    S.seeded = true;
    var ws = startOfWeek(new Date());
    var rows = [
      [0, 9, 10.5, 'Матанализ', 'study'], [0, 10.67, 12.17, 'Физика', 'study'], [0, 15, 16.5, 'Слайды к презентации', 'study'], [0, 19, 20.25, 'Зал', 'sport'],
      [1, 9, 10.5, 'Линейная алгебра', 'study'], [1, 12.33, 13.83, 'Программирование', 'study'], [1, 15, 16, 'Английский', 'study'],
      [2, 9, 10.5, 'Матанализ', 'study'], [2, 13, 15, 'Лаба по физике', 'study'], [2, 19, 20.25, 'Зал', 'sport'],
      [3, 10.67, 12.17, 'Линейная алгебра', 'study'], [3, 16, 17.5, 'Подготовка к тесту', 'study'],
      [4, 9, 10.5, 'Программирование', 'study'], [4, 17.5, 18, 'Сдать лабу', 'deadline'],
      [5, 11, 12.25, 'Зал', 'sport'], [5, 17, 19, 'Встреча', 'personal'], [6, 20, 20.5, 'План недели', 'personal']
    ];
    rows.forEach(function (r) {
      S.events.push({ id: uid(), title: r[3], date: ymd(addDays(ws, r[0])), start: Math.round(r[1] * 60), end: Math.round(r[2] * 60), cat: r[4], notes: '', demo: true });
    });
    S.tasks.push({ id: uid(), title: 'Сдать лабу по физике', due: ymd(addDays(ws, 4)), done: false });
    S.tasks.push({ id: uid(), title: 'Дописать слайды презентации', due: ymd(ws), done: false });
    S.habits.push({ id: uid(), title: 'Взвешивание утром' }, { id: uid(), title: 'Английский 20 минут' }, { id: uid(), title: 'Конспект дня' });
    save();
  }

  /* ---------- даты и вид ---------- */
  var today = function () { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  var anchor = today();
  var mini = new Date(anchor.getFullYear(), anchor.getMonth(), 1);

  function startOfWeek(d) {
    var diff = (d.getDay() - S.settings.weekStart + 7) % 7;
    return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -diff);
  }
  function HH() { return { compact: 40, normal: 48, comfy: 60 }[S.settings.density] || 48; }
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  }
  function viewDays() {
    var m = S.settings.view;
    if (m === 'day') return [anchor];
    var s = startOfWeek(anchor), a = [];
    for (var i = 0; i < 7; i++) a.push(addDays(s, i));
    return a;
  }
  function viewRange() {
    var m = S.settings.view;
    if (m === 'month') return [new Date(anchor.getFullYear(), anchor.getMonth(), 1), new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)];
    var d = viewDays();
    return [d[0], d[d.length - 1]];
  }
  function setAnchor(d) { anchor = d; mini = new Date(d.getFullYear(), d.getMonth(), 1); $('#app').classList.remove('menu'); render(); }
  function shift(dir) {
    var m = S.settings.view;
    if (m === 'month') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
    else setAnchor(addDays(anchor, dir * (m === 'day' ? 1 : 7)));
  }
  function catById(id) { return S.cats.filter(function (c) { return c.id === id; })[0] || S.cats[0]; }
  function dayDiff(a, b) { return Math.round((parseYmd(a) - parseYmd(b)) / 86400000); }
  function shiftDate(key, n) { return ymd(addDays(parseYmd(key), n)); }
  function occursOn(m, key) {
    if (!m.rep) {
      if (m.allDay && m.days > 1) return key >= m.date && key <= shiftDate(m.date, m.days - 1);
      return m.date === key;
    }
    if (key < m.date) return false;
    var r = m.rep;
    if (r.until && key > r.until) return false;
    if (m.ex && m.ex.indexOf(key) >= 0) return false;
    var d = parseYmd(key), s0 = parseYmd(m.date), diff = dayDiff(key, m.date), iv = r.interval || 1;
    if (r.type === 'daily') return diff % iv === 0;
    if (r.type === 'weekly') {
      var startMon = addDays(s0, -((s0.getDay() + 6) % 7));
      var wk = Math.floor(Math.round((d - startMon) / 86400000) / 7);
      if (wk % iv !== 0) return false;
      return r.days && r.days.length ? r.days.indexOf(d.getDay()) >= 0 : d.getDay() === s0.getDay();
    }
    if (r.type === 'monthly') {
      var mm = (d.getFullYear() - s0.getFullYear()) * 12 + d.getMonth() - s0.getMonth();
      return mm % iv === 0 && d.getDate() === s0.getDate();
    }
    if (r.type === 'yearly') {
      return d.getMonth() === s0.getMonth() && d.getDate() === s0.getDate() && (d.getFullYear() - s0.getFullYear()) % iv === 0;
    }
    return false;
  }
  function repPreset(r) {
    if (!r) return 'none';
    var iv = r.interval || 1, dd = r.days && r.days.length ? r.days.slice().sort().join() : '';
    if (r.type === 'daily' && iv === 1) return 'daily';
    if (r.type === 'weekly') {
      if (dd) return iv === 1 && dd === '1,2,3,4,5' ? 'weekdays' : (iv === 1 ? 'custom' : 'keep');
      if (iv === 1) return 'weekly';
      if (iv === 2) return 'biweekly';
    }
    if (r.type === 'monthly' && iv === 1) return 'monthly';
    if (r.type === 'yearly' && iv === 1) return 'yearly';
    return 'keep';
  }
  function presetRep(p, days, until) {
    var u = until || '', r = null;
    if (p === 'daily') r = { type: 'daily', interval: 1 };
    else if (p === 'weekdays') r = { type: 'weekly', interval: 1, days: [1, 2, 3, 4, 5] };
    else if (p === 'weekly') r = { type: 'weekly', interval: 1 };
    else if (p === 'biweekly') r = { type: 'weekly', interval: 2 };
    else if (p === 'monthly') r = { type: 'monthly', interval: 1 };
    else if (p === 'yearly') r = { type: 'yearly', interval: 1 };
    else if (p === 'custom') r = days && days.length ? { type: 'weekly', interval: 1, days: days.slice() } : { type: 'weekly', interval: 1 };
    if (r) r.until = u;
    return r;
  }
  function eventsOn(date, all) {
    var out = [];
    S.events.forEach(function (m) {
      if ((all || !S.hidden[m.cat]) && occursOn(m, date)) out.push(Object.assign({}, m, { date: date, _m: m }));
    });
    return out.sort(function (a, b) { return (b.allDay ? 1 : 0) - (a.allDay ? 1 : 0) || a.start - b.start || a.end - b.end; });
  }
  var TRAVELS = [[0, 'Не нужна'], [5, '5 мин'], [10, '10 мин'], [15, '15 мин'], [20, '20 мин'], [30, '30 мин'], [45, '45 мин'], [60, '1 ч'], [90, '1,5 ч']];
  function leaveBuf() { return typeof S.settings.leaveBuf === 'number' ? S.settings.leaveBuf : 5; }
  function nowMin() { var n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
  function remMinutes(e) {
    if (e.rem === null) return null;
    if (typeof e.rem === 'number') return e.rem;
    var c = S.cats.filter(function (x) { return x.id === e.cat; })[0];
    if (c && c.rem === null) return null;
    if (c && typeof c.rem === 'number') return c.rem;
    return typeof S.settings.remDefault === 'number' ? S.settings.remDefault : null;
  }
  function isKey(e) { return e.cat === 'deadline' || /коллок|экзамен|зач[её]т|дедлайн|контрольн|защит|сдать/i.test(e.title); }
  function evLabel(e) { return (isKey(e) ? '⚑ ' : '') + e.title; }
  function isMobile() { return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches); }

  /* ---------- тема ---------- */
  function lum(hex) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function f(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function applyTheme() {
    var r = document.documentElement.style, c = S.settings.colors;
    COLOR_LABELS.forEach(function (p) { r.setProperty('--' + p[0], c[p[0]]); });
    r.setProperty('--a2', c.a2 || '#A78BFA');
    r.setProperty('--glow', lum(c.bg) < 0.25 ? '1' : '.7');
    r.setProperty('--onaccent', lum(c.accent) > 0.4 ? '#111111' : '#FFFFFF');
    r.setProperty('--fs', S.settings.font + 'px');
    r.setProperty('--hh', HH() + 'px');
    var meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', c.bg);
    document.documentElement.style.colorScheme = lum(c.bg) < 0.25 ? 'dark' : 'light';
  }

  /* ---------- отрисовка ---------- */
  function render() {
    applyTheme();
    $('#app').setAttribute('data-view', S.settings.view);
    renderTheme(); renderTop(); renderMini(); renderCats(); renderView(); renderDeadlines(); renderTasks(); renderHabits(); renderLoad();
    $('#logo').textContent = new Date().getDate();
  }

  var THEME_PAIR = { night: 'dayMint', dayMint: 'night', amber: 'dayAmber', dayAmber: 'amber', indigo: 'dayIndigo', dayIndigo: 'indigo', lime: 'dayLime', dayLime: 'lime', rose: 'dayRose', dayRose: 'rose' };
  function presetKey() {
    var c = S.settings.colors;
    return Object.keys(PRESETS).filter(function (k) { return PRESETS[k].c.bg === c.bg && PRESETS[k].c.accent === c.accent; })[0] || '';
  }
  function renderTheme() {
    var k = presetKey(), el = $('#themeName');
    if (el) el.textContent = k ? PRESETS[k].name : 'Своя';
  }
  $('#themeToggle').addEventListener('click', function () {
    var k = presetKey(), to = THEME_PAIR[k] || (lum(S.settings.colors.bg) < 0.25 ? 'dayMint' : 'night');
    S.settings.colors = Object.assign({}, PRESETS[to].c); save(); render();
  });

  function renderTop() {
    var m = S.settings.view, t;
    if (m === 'month') t = MON_NOM[anchor.getMonth()] + ' ' + anchor.getFullYear();
    else if (m === 'day') t = DOW_LONG[anchor.getDay()] + ', ' + anchor.getDate() + ' ' + MON_GEN[anchor.getMonth()] + ' ' + anchor.getFullYear();
    else {
      var d = viewDays(), a = d[0], b = d[6];
      t = a.getMonth() === b.getMonth()
        ? a.getDate() + '–' + b.getDate() + ' ' + MON_GEN[b.getMonth()] + ' ' + b.getFullYear()
        : a.getDate() + ' ' + MON_SHORT[a.getMonth()] + ' – ' + b.getDate() + ' ' + MON_SHORT[b.getMonth()] + ' ' + b.getFullYear();
    }
    var ttl = $('#title');
    if (m === 'day') ttl.replaceChildren(h('small', null, DOW_LONG[anchor.getDay()]), h('span', null, anchor.getDate() + ' ' + MON_GEN[anchor.getMonth()]));
    else ttl.textContent = t;
    $('#weekNo').textContent = m === 'week' ? 'неделя ' + isoWeek(viewDays()[S.settings.weekStart === 1 ? 0 : 1]) : '';
    var seg = $('#seg');
    seg.replaceChildren.apply(seg, [['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц']].map(function (v) {
      return h('button', { type: 'button', 'aria-pressed': S.settings.view === v[0] ? 'true' : 'false', onclick: function () { S.settings.view = v[0]; save(); render(); } }, v[1]);
    }));
  }

  function renderMini() {
    $('#miniTitle').textContent = MON_NOM[mini.getMonth()] + ' ' + mini.getFullYear();
    var root = $('#mini'), kids = [];
    for (var i = 0; i < 7; i++) kids.push(h('div', { class: 'dow' }, DOW_SHORT[(S.settings.weekStart + i) % 7]));
    var first = startOfWeek(mini), range = viewRange(), td = today();
    for (var j = 0; j < 42; j++) {
      (function (d) {
        var cls = [];
        if (d.getMonth() !== mini.getMonth()) cls.push('out');
        if (d >= range[0] && d <= range[1]) cls.push('inweek');
        if (sameDay(d, td)) cls.push('today');
        kids.push(h('button', { type: 'button', class: cls.join(' '), onclick: function () { setAnchor(d); } }, d.getDate()));
      })(addDays(first, j));
    }
    root.replaceChildren.apply(root, kids);
  }

  function renderCats() {
    var root = $('#cats');
    root.replaceChildren.apply(root, S.cats.map(function (c) {
      var off = !!S.hidden[c.id];
      return h('button', { type: 'button', class: 'cat-row' + (off ? ' off' : ''), 'aria-pressed': off ? 'false' : 'true', style: '--c:' + c.color,
        onclick: function () { S.hidden[c.id] = !S.hidden[c.id]; save(); render(); } },
        h('span', { class: 'swatch' }), h('span', { class: 'grow' }, c.name),
        h('span', { class: 'mute' }, S.events.filter(function (e) { return e.cat === c.id; }).length));
    }));
  }

  function layoutDay(evs) {
    var out = [], cluster = [], clusterEnd = -1;
    function flush() {
      if (!cluster.length) return;
      var lanes = [];
      cluster.forEach(function (e) {
        var i = 0;
        while (lanes[i] !== undefined && lanes[i] > e.start) i++;
        lanes[i] = e.end; e._lane = i;
      });
      cluster.forEach(function (e) { e._lanes = lanes.length; });
      out = out.concat(cluster); cluster = [];
    }
    evs.forEach(function (src) {
      var e = { ev: src, start: src.start, end: src.end };
      if (e.start >= clusterEnd) { flush(); clusterEnd = e.end; } else clusterEnd = Math.max(clusterEnd, e.end);
      cluster.push(e);
    });
    flush();
    return out;
  }

  function adChip(e) {
    var chip = h('button', { type: 'button', class: 'ad-chip' + (isKey(e) ? ' key' : ''), style: '--c:' + catById(e.cat).color,
      onclick: function (ev) { ev.stopPropagation(); openEvent(e); } }, evLabel(e) + (e._m.rep ? ' ↻' : ''));
    return chip;
  }

  function renderView() {
    var root = $('#view');
    if (S.settings.view === 'month') { root.replaceChildren(renderMonth()); return; }
    if (S.settings.view === 'day') { root.replaceChildren(renderAgenda()); return; }
    var days = viewDays(), hh = HH(), hs = S.settings.hourStart, he = S.settings.hourEnd, td = today();
    var now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
    var head = h('div', { class: 'wk-head', style: '--n:' + days.length }, h('div', null));
    var adCells = [];
    var body = h('div', { class: 'wk-body', style: '--n:' + days.length }, (function () {
      var g = h('div', { class: 'gutter', style: 'height:' + (he - hs) * hh + 'px' });
      for (var x = hs + 1; x < he; x++) g.append(h('span', { style: 'top:' + ((x - hs) * hh - 7) + 'px' }, x + ':00'));
      return g;
    })());
    days.forEach(function (d) {
      var key = ymd(d), isToday = sameDay(d, td), all = eventsOn(key);
      var evs = all.filter(function (e) { return !e.allDay; });
      adCells.push(h('div', { class: 'ad-cell' }, all.filter(function (e) { return e.allDay; }).map(adChip)));
      var mins = evs.reduce(function (a, e) { return a + (e.end - e.start); }, 0);
      var load = all.length ? (mins ? Math.floor(mins / 60) + ' ч' + (mins % 60 ? ' ' + (mins % 60) + ' м' : '') + ' · ' : '') + all.length + ' соб.' : 'свободно';
      head.append(h('div', { class: 'dh' + (isToday ? ' today' : '') },
        h('div', { class: 'top' }, h('span', { class: 'mute' }, DOW_SHORT[d.getDay()]),
          h('button', { type: 'button', class: 'num', 'aria-label': 'Открыть день', onclick: function () { S.settings.view = 'day'; save(); setAnchor(d); } }, d.getDate())),
        h('div', { class: 'load' }, load)));
      var col = h('div', { class: 'col' + (isToday ? ' today' : ''), 'data-date': key, style: 'height:' + (he - hs) * hh + 'px',
        onpointerdown: function (ev) { startCreate(ev, col, key); } });
      layoutDay(evs).forEach(function (L) {
        var e = L.ev;
        if (e.end <= hs * 60 || e.start >= he * 60) return;
        var top = (Math.max(e.start, hs * 60) - hs * 60) / 60 * hh;
        var height = (Math.min(e.end, he * 60) - Math.max(e.start, hs * 60)) / 60 * hh - 2;
        var w = 100 / L._lanes;
        var node = h('div', { class: 'ev' + (isKey(e) ? ' key' : ''), tabindex: '0', role: 'button', 'aria-label': e.title + ', ' + hm(e.start) + '–' + hm(e.end) + (e._m.rep ? ', повторяется' : ''),
          style: '--c:' + catById(e.cat).color + ';top:' + (top + 1) + 'px;height:' + Math.max(height, 18) + 'px;left:calc(' + (L._lane * w) + '% + 2px);width:calc(' + w + '% - 4px)',
          onpointerdown: function (evt) { startMove(evt, node, e); },
          onkeydown: function (evt) { if (evt.key === 'Enter' || evt.key === ' ') { evt.preventDefault(); openEvent(e); } } },
          h('b', null, evLabel(e)), h('span', null, hm(e.start) + '–' + hm(e.end) + (e._m.rep ? ' ↻' : '') + (e.obs ? ' ↗' : '')),
          h('div', { class: 'rz', 'aria-hidden': 'true', onpointerdown: function (evt) { startResize(evt, node, e); } }));
        col.append(node);
      });
      if (isToday && nowM >= hs * 60 && nowM <= he * 60) col.append(h('div', { class: 'nowline', style: 'top:' + (nowM - hs * 60) / 60 * hh + 'px' }));
      body.append(col);
    });
    var parts = [head];
    if (adCells.some(function (c) { return c.childNodes.length; })) {
      parts.push(h('div', { class: 'wk-head wk-allday', style: '--n:' + days.length }, h('div', { class: 'ad-label' }, 'весь день'), adCells));
    }
    parts.push(body);
    root.replaceChildren(h('div', { class: 'wk' }, h('div', { class: 'wk-in' }, parts)));
  }

  function weekInfo(d) {
    var ss = S.settings.semStart;
    if (ss) {
      var n = Math.round((startOfWeek(d) - startOfWeek(parseYmd(ss))) / 604800000) + 1;
      if (n >= 1) return { n: n, par: n % 2 ? 'числитель' : 'знаменатель' };
    }
    return { n: isoWeek(startOfWeek(d)), par: '' };
  }
  function fmtDur(min) {
    if (min < 60) return min + ' мин';
    return Math.floor(min / 60) + ' ч' + (min % 60 ? ' ' + (min % 60) + ' мин' : '');
  }
  function firstLine(t) { return String(t || '').split('\n').filter(function (x) { return x.trim(); })[0] || ''; }

  function renderAgenda() {
    var key = ymd(anchor), td = today(), ws = startOfWeek(anchor), isToday = sameDay(anchor, td), isPast = anchor < td, nm = nowMin();
    var wi = weekInfo(anchor);
    var chip = h('button', { type: 'button', class: 'wk-chip', 'aria-label': 'Показать неделю целиком', onclick: function () { S.settings.view = 'week'; save(); render(); } },
      h('span', null, wi.n + ' неделя', wi.par ? h('small', null, ' · ' + wi.par) : null), h('b', { 'aria-hidden': 'true' }, '›'));
    var strip = h('div', { class: 'strip2' }, [0, 1, 2, 3, 4, 5, 6].map(function (i) {
      var d = addDays(ws, i), es = eventsOn(ymd(d)), timed = es.filter(function (e) { return !e.allDay; });
      var mins = timed.reduce(function (a, e) { return a + (e.end - e.start); }, 0);
      var w = es.length ? Math.max(14, Math.min(100, Math.round(mins / 480 * 100))) : 0;
      return h('button', { type: 'button', class: 'sd' + (sameDay(d, anchor) ? ' sel' : '') + (sameDay(d, td) ? ' today' : ''),
        'aria-label': DOW_LONG[d.getDay()] + ', ' + d.getDate() + ' ' + MON_GEN[d.getMonth()] + ', событий: ' + es.length, onclick: function () { setAnchor(d); } },
        h('span', null, DOW_SHORT[d.getDay()]), h('b', null, d.getDate()),
        h('em', { class: es.some(isKey) ? 'key' : '' }, h('i', { style: 'width:' + w + '%' })));
    }));

    var evs = eventsOn(key), ad = evs.filter(function (e) { return e.allDay; }), timed = evs.filter(function (e) { return !e.allDay; });
    var tl = h('div', { class: 'tl' });
    var upcomingMarked = false;
    function noteOf(e) {
      var n = firstLine(e.notes), bits = [];
      if (e.place) bits.push(e.place);
      if (e.travel && !e.allDay) bits.push('дорога ' + fmtDur(e.travel) + ', выйти в ' + hm(Math.max(0, e.start - e.travel)));
      if (!n && !bits.length) return null;
      return h('div', null, bits.length ? h('div', { class: 'tl-note' }, bits.join(' · ')) : null, n ? h('div', { class: 'tl-note' }, n) : null);
    }
    function badges(e) { return (e._m.rep ? ' ↻' : '') + (e.obs ? ' ↗' : ''); }
    timed.forEach(function (e, i) {
      var cat = catById(e.cat), state = isPast ? 'past' : isToday ? (e.end <= nm ? 'past' : e.start <= nm ? 'now' : 'next') : 'next';
      var cls = 'tl-card' + (isKey(e) ? ' keyc' : '');
      if (state === 'past') {
        tl.append(h('div', { class: 'tl-row past' }, h('span', { class: 'dot', 'aria-hidden': 'true' }, '✓'),
          h('button', { type: 'button', class: 'tl-past', onclick: function () { openEvent(e); } }, hm(e.start) + ' · ' + evLabel(e))));
      } else if (state === 'now') {
        var pct = Math.max(2, Math.min(100, Math.round((nm - e.start) / Math.max(1, e.end - e.start) * 100)));
        tl.append(h('div', { class: 'tl-row now' }, h('span', { class: 'dot', 'aria-hidden': 'true' }),
          h('button', { type: 'button', class: cls + ' now', style: '--c:' + cat.color, onclick: function () { openEvent(e); } },
            h('div', { class: 'meta' }, h('span', { class: 'tag' }, cat.name), h('b', { class: 'tm' }, hm(e.start) + '–' + hm(e.end)), h('em', { class: 'live' }, 'идёт сейчас')),
            h('div', { class: 'tl-title' }, evLabel(e) + badges(e)), noteOf(e),
            h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: 'width:' + pct + '%' })),
            h('div', { class: 'left' }, 'Осталось ' + fmtDur(e.end - nm) + ' · до ' + hm(e.end)))));
      } else {
        var until = (isToday && !upcomingMarked) ? 'через ' + fmtDur(e.start - nm) : '';
        if (isToday) upcomingMarked = true;
        tl.append(h('div', { class: 'tl-row' }, h('span', { class: 'dot', 'aria-hidden': 'true' }),
          h('button', { type: 'button', class: cls, style: '--c:' + cat.color, onclick: function () { openEvent(e); } },
            h('div', { class: 'meta' }, h('span', { class: 'tag' }, cat.name), h('b', { class: 'tm' }, hm(e.start) + '–' + hm(e.end)), until ? h('span', { class: 'sub' }, until) : null),
            h('div', { class: 'tl-title' }, evLabel(e) + badges(e)), noteOf(e))));
      }
      var nx = timed[i + 1];
      if (nx && nx.start - e.end >= 15) {
        var gapPast = isPast || (isToday && nx.start <= nm);
        if (!gapPast) {
          var gap = nx.start - e.end, t0 = taskForWindow(gap);
          tl.append(h('div', { class: 'tl-row win' }, h('span', { class: 'dot', 'aria-hidden': 'true' }),
            h('div', { class: 'tl-win' },
              h('div', { class: 'win-h' }, 'Окно ' + fmtDur(gap), h('span', { class: 'sub' }, hm(e.end) + '–' + hm(nx.start))),
              t0 ? h('button', { type: 'button', class: 'win-task', onclick: function () { t0.done = true; save(); render(); } },
                h('span', { class: 'ck', 'aria-hidden': 'true' }, '○'), h('span', null, h('b', null, 'Успеть: '), t0.title + (t0.dur ? ' · ' + durLabel(t0.dur) : ''))) : null)));
        }
      }
    });
    if (!evs.length) tl.append(h('div', { class: 'empty big' }, 'На этот день ничего нет.', h('br'), 'Нажми «+», чтобы добавить событие.'));
    var adBox = ad.length ? h('div', { class: 'tl-ad' }, ad.map(adChip)) : null;
    return h('div', { class: 'ag-wrap' }, chip, strip, adBox, tl);
  }

  function renderMonth() {
    var first = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), td = today();
    var head = h('div', { class: 'mo-head' });
    for (var i = 0; i < 7; i++) head.append(h('div', null, DOW_SHORT[(S.settings.weekStart + i) % 7]));
    var grid = h('div', { class: 'mo-grid' });
    for (var j = 0; j < 42; j++) {
      (function (d) {
        var key = ymd(d), evs = eventsOn(key), cls = 'mo-cell';
        if (d.getMonth() !== anchor.getMonth()) cls += ' out';
        if (sameDay(d, td)) cls += ' today';
        var cell = h('div', { class: cls, 'data-date': key, onclick: function () { openEvent(null, { date: key, start: 9 * 60, end: 10 * 60 }); } },
          h('button', { type: 'button', class: 'n', onclick: function (e) { e.stopPropagation(); S.settings.view = 'day'; save(); setAnchor(d); } }, d.getDate()));
        evs.slice(0, 3).forEach(function (e) {
          var chip = h('button', { type: 'button', class: 'mo-ev' + (isKey(e) ? ' key' : ''), style: '--c:' + catById(e.cat).color,
            onpointerdown: function (evt) { startChipDrag(evt, chip, e); },
            onclick: function (evt) { evt.stopPropagation(); if (evt.detail === 0) openEvent(e); } },
            (e.allDay ? '' : hm(e.start) + ' ') + evLabel(e) + (e._m.rep ? ' ↻' : ''));
          cell.append(chip);
        });
        if (evs.length > 3) cell.append(h('div', { class: 'more' }, 'ещё ' + (evs.length - 3)));
        grid.append(cell);
      })(addDays(first, j));
    }
    return h('div', null, head, grid);
  }

  function renderDeadlines() {
    var root = $('#deadlines'), list = [], td = today(), nm = nowMin();
    for (var i = 0; i < 45 && list.length < 8; i++) {
      (function (i) {
        var d = addDays(td, i);
        eventsOn(ymd(d)).forEach(function (e) {
          if (!isKey(e)) return;
          if (i === 0 && !e.allDay && e.end <= nm) return;
          list.push({ d: d, e: e, n: i });
        });
      })(i);
    }
    if (!list.length) { root.replaceChildren(h('div', { class: 'empty' }, 'Дедлайнов и коллоквиумов в ближайшие 45 дней нет.')); return; }
    root.replaceChildren.apply(root, list.map(function (x) {
      var when = x.n === 0 ? 'сегодня' : x.n === 1 ? 'завтра' : 'через ' + x.n + ' дн.';
      return h('button', { type: 'button', class: 'dl-row', style: '--c:' + catById(x.e.cat).color, onclick: function () { S.settings.view = 'day'; save(); setAnchor(x.d); } },
        h('span', { class: 'dl-when' + (x.n <= 1 ? ' soon' : '') }, when),
        h('span', { class: 'dl-body' }, h('b', null, x.e.title),
          h('span', { class: 'mute small' }, DOW_SHORT[x.d.getDay()] + ' ' + x.d.getDate() + ' ' + MON_SHORT[x.d.getMonth()] + (x.e.allDay ? '' : ', ' + hm(x.e.start)))));
    }));
  }

  function checkBtn(on, label, round, fn) {
    return h('button', { type: 'button', class: 'chk' + (round ? ' round' : '') + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', 'aria-label': label, onclick: fn }, on ? '✓' : '');
  }

  var TASK_DURS = [[0, 'Без времени'], [15, '15 мин'], [30, '30 мин'], [45, '45 мин'], [60, '1 ч'], [90, '1,5 ч'], [120, '2 ч'], [180, '3 ч']];
  function durOptions(sel, cur) {
    sel.replaceChildren.apply(sel, TASK_DURS.map(function (d) { return h('option', { value: String(d[0]) }, d[1]); }));
    sel.value = String(TASK_DURS.some(function (d) { return d[0] === cur; }) ? cur : 0);
  }
  function durLabel(m) { var d = TASK_DURS.filter(function (x) { return x[0] === m; })[0]; return d ? d[1] : fmtDur(m); }
  /* задача для окна: по сроку; если время указано, она должна поместиться, из подходящих берём самую крупную */
  function taskForWindow(gap) {
    var open = S.tasks.filter(function (t) { return !t.done && (!t.dur || t.dur <= gap); });
    open.sort(function (a, b) { return String(a.due || '9').localeCompare(String(b.due || '9')) || (b.dur || 0) - (a.dur || 0); });
    return open[0] || null;
  }
  function renderTasks() {
    var root = $('#tasks'), td = ymd(today());
    var list = S.tasks.slice().sort(function (a, b) { return (a.done - b.done) || String(a.due || '9').localeCompare(String(b.due || '9')); });
    $('#taskCount').textContent = S.tasks.filter(function (t) { return t.done; }).length + ' из ' + S.tasks.length;
    if (!list.length) { root.replaceChildren(h('div', { class: 'empty' }, 'Задач пока нет.')); return; }
    root.replaceChildren.apply(root, list.map(function (t) {
      var due = '';
      if (t.due) { var d = parseYmd(t.due); due = DOW_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + MON_SHORT[d.getMonth()] + (!t.done && t.due < td ? ' · просрочено' : ''); }
      return h('div', { class: 'item' },
        checkBtn(t.done, 'Выполнено: ' + t.title, false, function () { t.done = !t.done; save(); renderTasks(); }),
        h('div', { class: 'body' }, h('div', { class: 't' + (t.done ? ' done' : '') }, t.title),
          h('div', { class: 'mute small tmeta' }, due ? due + ' · ' : '', (function () {
            var sel = h('select', { class: 'durchip', 'aria-label': 'Сколько времени займёт: ' + t.title, onchange: function () { t.dur = +sel.value || undefined; save(); renderTasks(); render(); } });
            durOptions(sel, t.dur || 0);
            if (!t.dur) sel.options[0].textContent = '+ время';
            return sel;
          })())),
        h('button', { type: 'button', class: 'x', 'aria-label': 'Удалить задачу', onclick: function () { S.tasks = S.tasks.filter(function (x) { return x !== t; }); save(); renderTasks(); } }, '✕'));
    }));
  }

  function streak(id) {
    var log = S.log[id] || [], d = today(), n = 0;
    if (log.indexOf(ymd(d)) < 0) d = addDays(d, -1);
    while (log.indexOf(ymd(d)) >= 0) { n++; d = addDays(d, -1); }
    return n;
  }
  function renderHabits() {
    var root = $('#habits'), td = ymd(today());
    if (!S.habits.length) { root.replaceChildren(h('div', { class: 'empty' }, 'Привычек пока нет.')); return; }
    root.replaceChildren.apply(root, S.habits.map(function (hb) {
      var on = (S.log[hb.id] || []).indexOf(td) >= 0;
      return h('div', { class: 'habit' + (on ? ' on' : '') },
        checkBtn(on, 'Сегодня сделано: ' + hb.title, true, function () {
          var l = S.log[hb.id] || (S.log[hb.id] = []), i = l.indexOf(td);
          if (i >= 0) l.splice(i, 1); else l.push(td);
          save(); renderHabits();
        }),
        h('span', { class: 't' }, hb.title),
        h('span', { class: 'mute small' }, 'серия ' + streak(hb.id)),
        h('button', { type: 'button', class: 'x', 'aria-label': 'Удалить привычку', style: 'border:0;background:transparent;color:var(--mute)', onclick: function () {
          if (!confirm('Удалить привычку «' + hb.title + '» вместе с историей?')) return;
          S.habits = S.habits.filter(function (x) { return x !== hb; }); delete S.log[hb.id]; save(); renderHabits();
        } }, '✕'));
    }));
  }

  function renderLoad() {
    var s = startOfWeek(anchor), root = $('#load'), kids = [];
    for (var i = 0; i < 7; i++) {
      var d = addDays(s, i), key = ymd(d);
      var mins = eventsOn(key).filter(function (e) { return !e.allDay; }).reduce(function (a, e) { return a + (e.end - e.start); }, 0);
      kids.push(h('div', { title: Math.round(mins / 6) / 10 + ' ч' },
        h('i', { class: sameDay(d, anchor) ? 'cur' : '', style: 'height:' + Math.max(3, Math.min(56, mins / 60 * 9)) + 'px' }),
        h('span', null, DOW_SHORT[d.getDay()])));
    }
    root.replaceChildren(h('div', { class: 'bars' }, kids));
  }

  /* ---------- изменение событий и повторов ---------- */
  var FIELDS = ['title', 'start', 'end', 'cat', 'notes', 'allDay', 'days', 'rem', 'obs'];
  function baseFields(m) {
    return { title: m.title, start: m.start, end: m.end, cat: m.cat, notes: m.notes || '', allDay: m.allDay, days: m.days, rem: m.rem, obs: m.obs };
  }

  function applyChange(occ, scope, patch) {
    var m = occ._m, od = occ.date;
    function copyFields(t) { FIELDS.forEach(function (k) { if (k in patch) t[k] = patch[k]; }); }
    if (!m.rep || scope === 'all' || (scope === 'following' && od === m.date)) {
      var delta = patch.date ? dayDiff(patch.date, od) : 0;
      copyFields(m);
      if (delta) m.date = shiftDate(m.date, delta);
      if ('rep' in patch) { m.rep = patch.rep; if (!patch.rep) m.ex = []; }
      mark(m);
    } else if (scope === 'one') {
      m.ex = (m.ex || []).concat(od); mark(m);
      var one = Object.assign(baseFields(m), { id: uid(), date: patch.date || od, rep: null, ex: [] });
      copyFields(one); S.events.push(mark(one));
    } else {
      var oldEx = m.ex || [];
      var next = Object.assign(baseFields(m), { id: uid(), date: patch.date || od, rep: normRep(m.rep), ex: oldEx.filter(function (d) { return d >= od; }) });
      copyFields(next);
      if ('rep' in patch) next.rep = patch.rep;
      var old = normRep(m.rep); old.until = shiftDate(od, -1);
      m.rep = old; m.ex = oldEx.filter(function (d) { return d < od; }); mark(m);
      S.events.push(mark(next));
    }
    save(); render();
  }
  function dropMaster(m) {
    if (m.gid) S.tomb.push(m.gid);
    S.events = S.events.filter(function (x) { return x !== m; });
  }
  function deleteOcc(occ, scope) {
    var m = occ._m, od = occ.date;
    if (!m.rep || scope === 'all' || (scope === 'following' && od === m.date)) dropMaster(m);
    else if (scope === 'one') { m.ex = (m.ex || []).concat(od); mark(m); }
    else { var r = normRep(m.rep); r.until = shiftDate(od, -1); m.rep = r; mark(m); }
    save(); render();
  }

  var scopeDlg = $('#scopeDialog');
  function askScope(verb, onPick, onCancel) {
    var chosen = false;
    $('#scopeHeading').textContent = verb + ': повторяющееся событие';
    var box = $('#scopeList');
    box.replaceChildren.apply(box, [['one', 'Только это событие'], ['following', 'Это и все следующие'], ['all', 'Все события серии']].map(function (o) {
      return h('button', { type: 'button', class: 'btn wide', onclick: function () { chosen = true; scopeDlg.close(); onPick(o[0]); } }, o[1]);
    }));
    scopeDlg.addEventListener('close', function once() {
      scopeDlg.removeEventListener('close', once);
      if (!chosen && onCancel) onCancel();
    });
    scopeDlg.showModal();
  }
  $('#scopeCancel').addEventListener('click', function () { scopeDlg.close(); });

  function applyEdit(occ, patch, verb) {
    if (occ._m.rep) askScope(verb, function (scope) { applyChange(occ, scope, patch); }, render);
    else applyChange(occ, 'all', patch);
  }

  /* ---------- перетаскивание ---------- */
  var dragging = false;
  function snap(min) { return Math.round(min / 15) * 15; }
  function colsInfo() {
    return Array.prototype.map.call(document.querySelectorAll('.wk-body .col'), function (c) {
      var r = c.getBoundingClientRect();
      return { date: c.getAttribute('data-date'), left: r.left, right: r.right };
    });
  }
  function colAt(cols, x) {
    var best = x >= cols[cols.length - 1].right ? cols[cols.length - 1] : cols[0];
    cols.forEach(function (c) { if (x >= c.left && x < c.right) best = c; });
    return best;
  }
  function track(el, pid, move, end) {
    try { el.setPointerCapture(pid); } catch (x) { /* не критично */ }
    function stop(ev, ok) {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      try { el.releasePointerCapture(pid); } catch (x) { /* не критично */ }
      end(ev, ok);
    }
    function up(ev) { stop(ev, true); }
    function cancel(ev) { stop(ev, false); }
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  }

  function tapOnly(evt, el, fn) {
    var tx = evt.clientX, ty = evt.clientY;
    el.addEventListener('pointerup', function up(u) {
      el.removeEventListener('pointerup', up);
      if (Math.abs(u.clientX - tx) + Math.abs(u.clientY - ty) < 10) {
        /* браузер после касания шлёт ещё и click: он попал бы в открывшееся окно, поэтому гасим его */
        var swallow = function (c) { c.stopPropagation(); c.preventDefault(); };
        document.addEventListener('click', swallow, true);
        setTimeout(function () { document.removeEventListener('click', swallow, true); }, 450);
        fn();
      }
    });
  }
  function startMove(evt, node, e) {
    if (evt.button !== 0) return;
    evt.stopPropagation();
    if (evt.pointerType === 'touch') { tapOnly(evt, node, function () { openEvent(e); }); return; }
    var hh = HH(), hs = S.settings.hourStart, he = S.settings.hourEnd, cols = colsInfo();
    var src = colAt(cols, evt.clientX), sx = evt.clientX, sy = evt.clientY, dur = e.end - e.start;
    var started = false, ns = e.start, nd = e.date, timeEl = node.querySelector('span');
    track(node, evt.pointerId, function (ev) {
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!started && Math.abs(dx) + Math.abs(dy) < 5) return;
      if (!started) { started = true; dragging = true; node.classList.add('dragging'); }
      var target = colAt(cols, ev.clientX);
      ns = Math.max(hs * 60, Math.min(Math.max(he * 60 - dur, hs * 60), snap(e.start + dy / hh * 60)));
      nd = target.date;
      node.style.transform = 'translate(' + (target.left - src.left) + 'px,' + (ns - e.start) / 60 * hh + 'px)';
      timeEl.textContent = hm(ns) + '–' + hm(ns + dur) + (e._m.rep ? ' ↻' : '');
    }, function (ev, ok) {
      dragging = false;
      if (!ok) { render(); return; }
      if (!started) { openEvent(e); return; }
      if (nd === e.date && ns === e.start) { render(); return; }
      applyEdit(e, { date: nd, start: ns, end: ns + dur }, 'Переместить');
    });
  }

  function startResize(evt, node, e) {
    if (evt.button !== 0 || evt.pointerType === 'touch') return;
    evt.stopPropagation(); evt.preventDefault();
    var hh = HH(), he = S.settings.hourEnd, sy = evt.clientY, ne = e.end, started = false, timeEl = node.querySelector('span');
    track(evt.target, evt.pointerId, function (ev) {
      var dy = ev.clientY - sy;
      if (!started && Math.abs(dy) < 4) return;
      if (!started) { started = true; dragging = true; node.classList.add('dragging'); }
      ne = Math.max(e.start + 15, Math.min(he * 60, snap(e.end + dy / hh * 60)));
      node.style.height = Math.max(18, (ne - e.start) / 60 * hh - 2) + 'px';
      timeEl.textContent = hm(e.start) + '–' + hm(ne) + (e._m.rep ? ' ↻' : '');
    }, function (ev, ok) {
      dragging = false;
      if (!ok || !started || ne === e.end) { render(); return; }
      applyEdit(e, { end: ne }, 'Изменить');
    });
  }

  function startCreate(ev, col, key) {
    if (ev.button !== 0 || ev.target !== col || ev.pointerType === 'touch') return;
    var hh = HH(), hs = S.settings.hourStart, he = S.settings.hourEnd, top = col.getBoundingClientRect().top, y0 = ev.clientY;
    function minAt(y) { return snap(hs * 60 + (y - top) / hh * 60); }
    var m0 = Math.max(hs * 60, Math.min(he * 60 - 15, minAt(y0))), a = m0, b = m0 + 60, started = false, ghost = null, gl = null;
    track(col, ev.pointerId, function (e2) {
      if (!started && Math.abs(e2.clientY - y0) < 5) return;
      if (!started) {
        started = true; dragging = true;
        gl = h('span', null, '');
        ghost = h('div', { class: 'ev new' }, h('b', null, 'Новое событие'), gl);
        col.append(ghost);
      }
      var m1 = Math.max(hs * 60, Math.min(he * 60, minAt(e2.clientY)));
      a = Math.min(m0, m1); b = Math.max(Math.max(m0, m1), a + 15);
      b = Math.min(b, he * 60);
      ghost.style.top = (a - hs * 60) / 60 * hh + 1 + 'px';
      ghost.style.height = Math.max(18, (b - a) / 60 * hh - 2) + 'px';
      gl.textContent = hm(a) + '–' + hm(b);
    }, function (e2, ok) {
      dragging = false;
      if (ghost) ghost.remove();
      if (!ok) return;
      if (!started) openEvent(null, { date: key, start: m0, end: Math.min(m0 + 60, 24 * 60) });
      else openEvent(null, { date: key, start: a, end: b });
    });
  }

  function startChipDrag(evt, chip, e) {
    if (evt.button !== 0) return;
    evt.stopPropagation();
    if (evt.pointerType === 'touch') { tapOnly(evt, chip, function () { openEvent(e); }); return; }
    var sx = evt.clientX, sy = evt.clientY, started = false, target = null, lastCell = null;
    track(chip, evt.pointerId, function (ev) {
      if (!started && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 5) return;
      if (!started) { started = true; dragging = true; chip.classList.add('dragging'); chip.style.pointerEvents = 'none'; }
      var el = document.elementFromPoint(ev.clientX, ev.clientY), cell = el && el.closest ? el.closest('.mo-cell') : null;
      if (lastCell) lastCell.classList.remove('drop');
      lastCell = cell;
      if (cell) cell.classList.add('drop');
      target = cell ? cell.getAttribute('data-date') : null;
    }, function (ev, ok) {
      dragging = false;
      if (lastCell) lastCell.classList.remove('drop');
      chip.style.pointerEvents = '';
      if (!ok) { render(); return; }
      if (!started) { openEvent(e); return; }
      if (target && target !== e.date) applyEdit(e, { date: target, start: e.start, end: e.end }, 'Переместить');
      else render();
    });
  }

  /* ---------- диалог события ---------- */
  var editing = null;
  var evDlg = $('#evDialog');
  var REPS = [['none', 'Не повторять'], ['daily', 'Каждый день'], ['weekdays', 'По будням'], ['weekly', 'Каждую неделю'], ['biweekly', 'Раз в две недели'],
    ['custom', 'По дням недели…'], ['monthly', 'Каждый месяц'], ['yearly', 'Каждый год']];
  var REMS = [['def', 'По умолчанию'], ['none', 'Не напоминать'], ['0', 'В момент начала'], ['5', 'За 5 минут'], ['10', 'За 10 минут'], ['15', 'За 15 минут'],
    ['30', 'За 30 минут'], ['60', 'За 1 час'], ['120', 'За 2 часа'], ['1440', 'За 1 день']];
  var DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  $('#evRem').replaceChildren.apply($('#evRem'), REMS.map(function (r) { return h('option', { value: r[0] }, r[1]); }));
  $('#evDays').replaceChildren.apply($('#evDays'), DAY_ORDER.map(function (d) {
    return h('label', { class: 'daytog' }, h('input', { type: 'checkbox', value: String(d) }), DOW_SHORT[d]);
  }));
  function syncRep() {
    var v = $('#evRep').value;
    $('#evUntilWrap').style.display = v === 'none' ? 'none' : '';
    $('#evDays').hidden = v !== 'custom';
  }
  function syncAllDay() {
    var on = $('#evAllDay').checked;
    $('#evStartWrap').style.display = on ? 'none' : '';
    $('#evEndWrap').style.display = on ? 'none' : '';
    $('#evStart').required = !on; $('#evEnd').required = !on;
  }
  $('#evRep').addEventListener('change', syncRep);
  $('#evAllDay').addEventListener('change', syncAllDay);

  function remToValue(r) { return r === undefined ? 'def' : r === null ? 'none' : String(r); }
  function valueToRem(v) { return v === 'def' ? undefined : v === 'none' ? null : +v; }

  function openEvent(ev, preset) {
    editing = ev;
    var d = ev || Object.assign({ title: '', date: ymd(anchor), start: 9 * 60, end: 10 * 60, cat: S.settings.defaultCat, notes: '' }, preset || {});
    var rep = ev && ev._m.rep, ro = !!(ev && ev._m.ro);
    $('#evHeading').textContent = ev ? (rep ? 'Редактировать повторяющееся событие' : 'Редактировать событие') : 'Новое событие';
    $('#evTitle').value = d.title; $('#evDate').value = d.date;
    $('#evAllDay').checked = !!d.allDay; syncAllDay();
    $('#evStart').value = toInput(d.start); $('#evEnd').value = toInput(d.end >= 24 * 60 ? 23 * 60 + 59 : d.end);
    var sel = $('#evCat');
    sel.replaceChildren.apply(sel, S.cats.map(function (c) { return h('option', { value: c.id }, c.name); }));
    sel.value = catById(d.cat).id;
    $('#evRem').value = remToValue(d.rem);
    $('#evNotes').value = d.notes || '';
    $('#evPlace').value = d.place || '';
    var tsel = $('#evTravel'); tsel.value = String(TRAVELS.some(function (t) { return t[0] === d.travel; }) ? d.travel : 0);
    $('#evObs').value = d.obs || '';
    var preset = repPreset(rep);
    var rs = $('#evRep');
    rs.replaceChildren.apply(rs, REMOVE_KEEP(REPS, preset === 'keep').map(function (r) { return h('option', { value: r[0] }, r[1]); }));
    rs.value = preset;
    $('#evUntil').value = rep && rep.until ? rep.until : '';
    var days = rep && rep.days ? rep.days.map(String) : [];
    Array.prototype.forEach.call($('#evDays').querySelectorAll('input'), function (i) { i.checked = days.indexOf(i.value) >= 0; });
    syncRep();
    $('#evDelete').style.display = ev && !ro ? '' : 'none';
    $('#evPrep').style.display = ev && !ro && !ev._m.prepFor && isKey(ev) && ev.date >= ymd(new Date()) && window.CalPrep ? '' : 'none';
    $('#evSave').style.display = ro ? 'none' : '';
    $('#evRo').hidden = !ro;
    Array.prototype.forEach.call($('#evForm').querySelectorAll('input,select,textarea'), function (i) { i.disabled = ro; });
    evDlg.showModal();
    /* на телефоне не открываем клавиатуру сразу: название вводится по нажатию */
    if (!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches)) $('#evTitle').focus();
  }
  function REMOVE_KEEP(list, needKeep) { return needKeep ? list.concat([['keep', 'Как в Google (без изменений)']]) : list; }

  function obsUri(action, params) {
    var q = [];
    if (S.settings.vault) q.push('vault=' + encodeURIComponent(S.settings.vault));
    Object.keys(params).forEach(function (k) { q.push(k + '=' + encodeURIComponent(params[k])); });
    return 'obsidian://' + action + '?' + q.join('&');
  }
  function go(uri) { var a = h('a', { href: uri }); document.body.append(a); a.click(); a.remove(); }
  (function () {
    var sel = $('#evTravel');
    sel.replaceChildren.apply(sel, TRAVELS.map(function (t) { return h('option', { value: String(t[0]) }, t[1]); }));
    $('#evPlace').addEventListener('change', function () {
      var k = $('#evPlace').value.trim().toLowerCase(), known = S.settings.places && S.settings.places[k];
      if (known && !+sel.value) sel.value = String(known);
    });
  })();
  $('#evObsOpen').addEventListener('click', function () {
    var v = $('#evObs').value.trim();
    if (v) go(obsUri('open', { file: v }));
  });
  $('#evObsNew').addEventListener('click', function () {
    var title = $('#evTitle').value.trim() || 'Событие', date = $('#evDate').value;
    var name = (date ? date + ' ' : '') + title.replace(/[\\/:*?"<>|#^\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    var file = (S.settings.obsFolder ? S.settings.obsFolder.replace(/^\/+|\/+$/g, '') + '/' : '') + name;
    var cat = catById($('#evCat').value);
    var when = $('#evAllDay').checked ? 'весь день' : $('#evStart').value + '–' + $('#evEnd').value;
    var content = '# ' + title + '\n\n- Дата: ' + date + '\n- Время: ' + when + '\n- Календарь: ' + cat.name + '\n\n## Заметки\n\n';
    $('#evObs').value = file;
    go(obsUri('new', { file: file, content: content }));
  });

  $('#evPrep').addEventListener('click', function () {
    if (!editing || !window.CalPrep) return;
    var occ = editing; evDlg.close(); window.CalPrep.open(occ);
  });
  $('#evBack').addEventListener('click', function () { evDlg.close(); });
  $('#evCancel').addEventListener('click', function () { evDlg.close(); });
  $('#evDelete').addEventListener('click', function () {
    if (!editing) return;
    var occ = editing;
    evDlg.close();
    if (occ._m.rep) askScope('Удалить', function (scope) { deleteOcc(occ, scope); });
    else deleteOcc(occ, 'all');
  });
  $('#evForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var allDay = $('#evAllDay').checked;
    var s0 = allDay ? 0 : fromInput($('#evStart').value), en = allDay ? 24 * 60 : fromInput($('#evEnd').value);
    if (!allDay && en <= s0) en = Math.min(s0 + 30, 24 * 60);
    var pv = $('#evRep').value, rep;
    if (pv === 'keep') rep = editing ? normRep(editing._m.rep) : null;
    else {
      var checked = Array.prototype.filter.call($('#evDays').querySelectorAll('input'), function (i) { return i.checked; }).map(function (i) { return +i.value; });
      rep = presetRep(pv, checked, $('#evUntil').value);
    }
    var data = { title: $('#evTitle').value.trim() || 'Событие', date: $('#evDate').value, start: s0, end: en, cat: $('#evCat').value, notes: $('#evNotes').value,
      allDay: allDay || undefined, rem: valueToRem($('#evRem').value), obs: $('#evObs').value.trim() || undefined,
      place: $('#evPlace').value.trim() || undefined, travel: (!allDay && +$('#evTravel').value) || undefined };
    if (data.place && data.travel) { (S.settings.places || (S.settings.places = {}))[data.place.toLowerCase()] = data.travel; }
    if (!allDay) data.days = undefined; else if (editing && editing._m.days) data.days = editing._m.days;
    var occ = editing;
    evDlg.close();
    if (!occ) {
      S.events.push(mark(Object.assign({ id: uid(), rep: rep, ex: [] }, data)));
      save(); setAnchor(parseYmd(data.date));
      return;
    }
    var patch = Object.assign({ rep: rep }, data);
    var done = function (scope) { applyChange(occ, scope, patch); if (data.date) setAnchor(parseYmd(data.date)); };
    if (occ._m.rep) askScope('Изменить', done); else done('all');
  });
  $('#newEvent').addEventListener('click', function () { $('#app').classList.remove('menu'); openEvent(null); });
  $('#fab').addEventListener('click', function () { openEvent(null); });

  /* ---------- поиск ---------- */
  var srDlg = $('#searchDialog');
  function renderSearch() {
    var q = $('#srIn').value.trim().toLowerCase(), box = $('#srList'), td = ymd(today());
    var list = S.events.filter(function (m) { return !q || (m.title + ' ' + (m.notes || '')).toLowerCase().indexOf(q) >= 0; }).slice(0, 300);
    var rows = list.map(function (m) {
      var d = m.date;
      if (m.rep) for (var i = 0; i < 400; i++) { var k = shiftDate(td, i); if (occursOn(m, k)) { d = k; break; } }
      return { m: m, date: d };
    });
    rows.sort(function (a, b) { return Math.abs(dayDiff(a.date, td)) - Math.abs(dayDiff(b.date, td)); });
    if (!rows.length) { box.replaceChildren(h('div', { class: 'empty' }, 'Ничего не найдено.')); return; }
    box.replaceChildren.apply(box, rows.slice(0, 40).map(function (r) {
      var d = parseYmd(r.date), m = r.m;
      return h('button', { type: 'button', class: 'sr-row', style: '--c:' + catById(m.cat).color, onclick: function () {
        srDlg.close(); S.settings.view = 'day'; save(); setAnchor(d);
      } }, h('span', { class: 'swatch' }), h('span', { class: 'grow' }, h('b', null, m.title), h('span', { class: 'mute small' }, ' ' + (m.allDay ? 'весь день' : hm(m.start) + '–' + hm(m.end)) + (m.rep ? ' · ↻' : ''))),
        h('span', { class: 'mute small' }, DOW_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + MON_SHORT[d.getMonth()] + ' ' + d.getFullYear()));
    }));
  }
  function openSearch() { $('#srIn').value = ''; renderSearch(); srDlg.showModal(); $('#srIn').focus(); }
  $('#srIn').addEventListener('input', renderSearch);
  $('#srClose').addEventListener('click', function () { srDlg.close(); });
  $('#searchBtn').addEventListener('click', openSearch);

  /* ---------- быстрый ввод ---------- */
  var q = $('#quick'), pop = $('#quickPop');
  function quickParse() { return P.parseQuick(q.value, new Date(), S.cats, S.settings.defaultCat); }
  function updateQuick() {
    if (!q.value.trim()) { pop.hidden = true; return; }
    var r = quickParse(), c = catById(r.cat), d = parseYmd(r.date);
    pop.replaceChildren(
      h('div', { class: 'mute small' }, 'Будет добавлено'),
      h('div', { style: 'font-weight:600' }, r.title),
      h('div', { class: 'chips' },
        h('span', { class: 'chip' + (r.hasDate ? '' : ' dim') }, DOW_SHORT[d.getDay()] + ', ' + d.getDate() + ' ' + MON_GEN[d.getMonth()] + (r.hasDate ? '' : ' (по умолчанию)')),
        h('span', { class: 'chip' + (r.hasTime ? '' : ' dim') }, hm(r.start) + '–' + hm(r.end) + (r.hasTime ? '' : ' (по умолчанию)')),
        h('span', { class: 'chip', style: '--c:' + c.color }, c.name)),
      h('div', { class: 'mute small' }, 'Enter — добавить, Esc — отмена. Календарь можно указать через #: «#спорт».'));
    pop.hidden = false;
  }
  q.addEventListener('input', updateQuick);
  q.addEventListener('focus', updateQuick);
  q.addEventListener('blur', function () { pop.hidden = true; });
  q.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { q.value = ''; q.blur(); }
    if (e.key === 'Enter' && q.value.trim()) {
      var r = quickParse();
      S.events.push(mark({ id: uid(), title: r.title, date: r.date, start: r.start, end: r.end, cat: r.cat, notes: '', rep: null, ex: [] }));
      save(); q.value = ''; pop.hidden = true; setAnchor(parseYmd(r.date));
    }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); q.focus(); }
  });

  /* ---------- задачи и привычки: формы ---------- */
  $('#taskForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = $('#taskIn').value.trim();
    if (!t) return;
    S.tasks.push({ id: uid(), title: t, due: $('#taskDue').value || '', done: false, dur: +$('#taskDur').value || undefined });
    $('#taskIn').value = ''; $('#taskDue').value = ''; $('#taskDur').value = '0'; save(); render();
  });
  $('#habitForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = $('#habitIn').value.trim();
    if (!t) return;
    S.habits.push({ id: uid(), title: t });
    $('#habitIn').value = ''; save(); renderHabits();
  });

  /* ---------- навигация ---------- */
  $('#prev').addEventListener('click', function () { shift(-1); });
  $('#next').addEventListener('click', function () { shift(1); });
  $('#today').addEventListener('click', function () { setAnchor(today()); });
  $('#miniPrev').addEventListener('click', function () { mini = new Date(mini.getFullYear(), mini.getMonth() - 1, 1); renderMini(); });
  $('#miniNext').addEventListener('click', function () { mini = new Date(mini.getFullYear(), mini.getMonth() + 1, 1); renderMini(); });

  /* ---------- настройки ---------- */
  var setDlg = $('#setDialog'), setBody = $('#setBody');
  var colorInputs = {}, catBox;

  function commit() { save(); render(); }

  function selectField(label, opts, value, onchange) {
    var s = h('select', { onchange: function () { onchange(s.value); } }, opts.map(function (o) { return h('option', { value: o[0] }, o[1]); }));
    s.value = String(value);
    return h('label', null, label, s);
  }

  function demoEvents() {
    return S.cats.slice(0, 4).map(function (c) {
      return h('div', { class: 'ev', style: '--c:' + c.color }, h('b', null, c.name), h('span', null, '9:00–10:30'));
    });
  }
  var demoBox;
  function refreshDemo() { demoBox.replaceChildren.apply(demoBox, demoEvents()); }

  function renderCatEditor() {
    catBox.replaceChildren.apply(catBox, S.cats.map(function (c) {
      var name = h('input', { type: 'text', value: c.name, 'aria-label': 'Название календаря', oninput: function () { c.name = name.value; save(); renderCats(); renderView(); refreshDemo(); } });
      var col = h('input', { type: 'color', value: c.color, 'aria-label': 'Цвет календаря ' + c.name, oninput: function () { c.color = col.value; save(); renderCats(); renderView(); refreshDemo(); } });
      var del = h('button', { type: 'button', class: 'btn danger', disabled: S.cats.length <= 1, onclick: function () {
        if (!confirm('Удалить календарь «' + c.name + '»? Его события перейдут в «' + S.cats.filter(function (x) { return x !== c; })[0].name + '».')) return;
        var rest = S.cats.filter(function (x) { return x !== c; });
        S.events.forEach(function (e) { if (e.cat === c.id) { e.cat = rest[0].id; mark(e); } });
        S.cats = rest; if (S.settings.defaultCat === c.id) S.settings.defaultCat = rest[0].id;
        delete S.hidden[c.id]; commit(); renderCatEditor(); refreshDemo();
      } }, 'Удалить');
      var rsel = h('select', { 'aria-label': 'Напоминание для календаря ' + c.name, onchange: function () {
        c.rem = rsel.value === 'def' ? undefined : rsel.value === 'none' ? null : +rsel.value; save();
      } }, [['def', 'Напоминание: общее'], ['none', 'Без напоминаний'], ['5', 'За 5 мин'], ['10', 'За 10 мин'], ['30', 'За 30 мин'], ['60', 'За 1 час'], ['1440', 'За 1 день']]
        .map(function (r) { return h('option', { value: r[0] }, r[1]); }));
      rsel.value = c.rem === undefined ? 'def' : c.rem === null ? 'none' : String(c.rem);
      return h('div', { class: 'cat-edit' }, col, name, rsel, del);
    }));
  }

  function setColors(c) {
    S.settings.colors = Object.assign({}, c);
    COLOR_LABELS.forEach(function (p) { colorInputs[p[0]].value = c[p[0]]; });
    commit();
  }

  function buildSettings() {
    colorInputs = {};
    var presetRow = h('div', { class: 'presets' }, Object.keys(PRESETS).map(function (k) {
      var p = PRESETS[k];
      return h('button', { type: 'button', class: 'preset', onclick: function () { setColors(p.c); } },
        h('span', { class: 'dots' }, [p.c.bg, p.c.panel, p.c.accent].map(function (x) { return h('i', { style: 'background:' + x }); })), p.name);
    }));
    presetRow.append(h('button', { type: 'button', class: 'preset', onclick: function () {
      setColors(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? PRESETS.dark.c : PRESETS.light.c);
    } }, 'Как в системе'));

    var colors = h('div', { class: 'colors' }, COLOR_LABELS.map(function (p) {
      var inp = h('input', { type: 'color', value: S.settings.colors[p[0]], 'aria-label': p[1], oninput: function () { S.settings.colors[p[0]] = inp.value; commit(); } });
      colorInputs[p[0]] = inp;
      return h('label', { class: 'colorf' }, p[1], inp);
    }));

    demoBox = h('div', { class: 'demo' });
    catBox = h('div', null);

    var hoursStart = [], hoursEnd = [];
    for (var i = 0; i <= 12; i++) hoursStart.push([i, i + ':00']);
    for (var j = 13; j <= 24; j++) hoursEnd.push([j, j + ':00']);

    var view = h('div', { class: 'opts' },
      selectField('Размер шрифта', [[12, 'Мелкий (12)'], [13, 'Обычный (13)'], [14, 'Крупный (14)'], [16, 'Очень крупный (16)']], S.settings.font, function (v) { S.settings.font = +v; commit(); }),
      selectField('Плотность сетки', [['compact', 'Компактная'], ['normal', 'Обычная'], ['comfy', 'Просторная']], S.settings.density, function (v) { S.settings.density = v; commit(); }),
      selectField('Неделя начинается с', [[1, 'Понедельника'], [0, 'Воскресенья']], S.settings.weekStart, function (v) { S.settings.weekStart = +v; commit(); }),
      selectField('Сетка начинается с', hoursStart, S.settings.hourStart, function (v) { S.settings.hourStart = Math.min(+v, S.settings.hourEnd - 1); commit(); }),
      selectField('Сетка заканчивается в', hoursEnd, S.settings.hourEnd, function (v) { S.settings.hourEnd = Math.max(+v, S.settings.hourStart + 1); commit(); }),
      h('label', null, 'Начало семестра (для номера недели и числителя/знаменателя)',
        (function () { var inp = h('input', { type: 'date', value: S.settings.semStart || '', onchange: function () { S.settings.semStart = inp.value; commit(); } }); return inp; })()),
      selectField('Календарь по умолчанию', S.cats.map(function (c) { return [c.id, c.name]; }), S.settings.defaultCat, function (v) { S.settings.defaultCat = v; save(); }));

    var data = h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' },
      h('button', { type: 'button', class: 'btn danger', onclick: function () {
        if (!confirm('Удалить все события, задачи и привычки? Настройки сохранятся. События из Google вернутся при следующей синхронизации.')) return;
        if (window.CalBackup) window.CalBackup.snapshot('перед очисткой');
        S.events = []; S.tasks = []; S.habits = []; S.log = {}; S.tomb = []; commit();
      } }, 'Очистить данные'),
      h('button', { type: 'button', class: 'btn danger', onclick: function () {
        if (!confirm('Сбросить ВСЁ, включая цвета и календари?')) return;
        if (window.CalBackup) window.CalBackup.snapshot('перед сбросом');
        S = defaults(); S.seeded = true; save(); applyTheme(); buildSettings(); render();
      } }, 'Сбросить всё'));

    setBody.replaceChildren(
      h('div', { style: 'display:flex;align-items:center;margin-bottom:6px' }, h('h2', { style: 'margin:0;flex:1' }, 'Настройки'),
        h('button', { type: 'button', class: 'btn primary', onclick: function () { setDlg.close(); } }, 'Готово')),
      h('div', { class: 'set-sec' }, h('h3', null, 'Цвета и тема'), presetRow, colors, demoBox),
      h('div', { class: 'set-sec' }, h('h3', null, 'Вид'), view),
      h('div', { class: 'set-sec' }, h('h3', null, 'Календари и их цвета'), catBox,
        h('button', { type: 'button', class: 'btn', onclick: function () {
          S.cats.push({ id: 'c' + uid(), name: 'Новый календарь', color: '#845EF7' }); commit(); renderCatEditor(); refreshDemo();
        } }, '+ Добавить календарь')),
      h('div', { class: 'set-sec' }, h('h3', null, 'Данные'),
        h('p', { class: 'mute small', style: 'margin-top:0' }, 'Всё хранится только на этом устройстве. Файл с копией можно сделать в разделе выше.'), data));
    var dataSec = setBody.lastElementChild;
    var vaultIn = h('input', { type: 'text', value: S.settings.vault || '', placeholder: 'например, Мои заметки', oninput: function () { S.settings.vault = vaultIn.value.trim(); save(); } });
    var folderIn = h('input', { type: 'text', value: S.settings.obsFolder || '', placeholder: 'Календарь', oninput: function () { S.settings.obsFolder = folderIn.value.trim(); save(); } });
    var obs = h('div', { class: 'set-sec' }, h('h3', null, 'Obsidian'),
      h('p', { class: 'mute small', style: 'margin-top:0' }, 'В карточке события кнопки «Открыть» и «Создать» вызывают Obsidian по ссылке obsidian://. Если хранилище одно, имя можно не указывать.'),
      h('div', { class: 'opts' }, h('label', null, 'Имя хранилища', vaultIn), h('label', null, 'Папка для новых заметок', folderIn)));
    setBody.insertBefore(obs, dataSec);
    extra.forEach(function (f) { try { setBody.insertBefore(f(), dataSec); } catch (e) { /* секция модуля недоступна */ } });
    renderCatEditor(); refreshDemo();
  }

  $('#openSettings').addEventListener('click', function () { buildSettings(); setDlg.showModal(); });

  /* ---------- уведомления на странице ---------- */
  function toast(msg, opts) {
    opts = opts || {};
    var box = $('#toasts');
    var t = h('div', { class: 'toast', role: 'status' },
      h('div', { class: 'grow' }, opts.title ? h('b', null, opts.title) : null, h('div', null, msg)),
      h('button', { type: 'button', class: 'x', 'aria-label': 'Закрыть', onclick: function () { t.remove(); } }, '✕'));
    box.append(t);
    if (!opts.sticky) setTimeout(function () { t.remove(); }, opts.ms || 9000);
    return t;
  }

  /* ---------- мобильная навигация, поиск, клавиши ---------- */
  $('#menuBtn').addEventListener('click', function () { $('#app').classList.toggle('menu'); });
  $('#scrim').addEventListener('click', function () { $('#app').classList.remove('menu'); });
  $('#sheetSearch').addEventListener('click', function () { $('#app').classList.remove('menu'); openSearch(); });
  /* шторку можно утащить вниз за верхнюю часть (ползунок и заголовок) */
  (function () {
    var head = $('.sheet-head'), side = $('#side'), y0 = null, dy = 0, t0 = 0;
    head.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      y0 = e.clientY; dy = 0; t0 = Date.now();
      side.style.transition = 'none';
      try { head.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
    });
    head.addEventListener('pointermove', function (e) {
      if (y0 == null) return;
      dy = Math.max(0, e.clientY - y0);
      side.style.transform = 'translateY(' + dy + 'px)';
    });
    function end() {
      if (y0 == null) return;
      var fast = dy / (Date.now() - t0 + 1) > 0.5;
      y0 = null;
      side.style.transition = ''; side.style.transform = '';
      if (dy > 90 || (fast && dy > 30)) $('#app').classList.remove('menu');
    }
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('#app').classList.remove('menu'); });
  })();
  $('#openSettings').addEventListener('click', function () { $('#app').classList.remove('menu'); });
  Array.prototype.forEach.call(document.querySelectorAll('#bottomNav [data-tab]'), function (b) {
    b.addEventListener('click', function () {
      $('#app').setAttribute('data-tab', b.getAttribute('data-tab'));
      var v = b.getAttribute('data-view');
      if (v) { S.settings.view = v; save(); render(); }
      syncNav();
    });
  });
  function syncNav() {
    var tab = $('#app').getAttribute('data-tab');
    Array.prototype.forEach.call(document.querySelectorAll('#bottomNav [data-tab]'), function (b) {
      var t = b.getAttribute('data-tab'), v = b.getAttribute('data-view');
      b.setAttribute('aria-current', t === tab && (!v || v === S.settings.view) ? 'page' : 'false');
    });
  }
  hooks.save.push(syncNav);
  /* свайп по дню: влево — следующий день, вправо — предыдущий */
  (function () {
    var x0 = 0, y0 = 0, on = false;
    var v = $('#view');
    v.addEventListener('touchstart', function (e) { var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; on = e.touches.length === 1 && isMobile() && S.settings.view === 'day'; }, { passive: true });
    v.addEventListener('touchend', function (e) {
      if (!on) return; on = false;
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45) shift(dx < 0 ? 1 : -1);
    }, { passive: true });
  })();
  syncNav();
  window.addEventListener('scroll', function () { $('#app').classList.toggle('scrolled', window.scrollY > 6); }, { passive: true });
  if (window.matchMedia) window.matchMedia('(max-width: 760px)').addEventListener('change', function () { render(); });

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || document.querySelector('dialog[open]')) return;
    var k = e.key;
    if (k === 'ArrowLeft') { shift(-1); e.preventDefault(); }
    else if (k === 'ArrowRight') { shift(1); e.preventDefault(); }
    else if (k === 't' || k === 'е') setAnchor(today());
    else if (k === 'n' || k === 'т') { e.preventDefault(); openEvent(null); }
    else if (k === 'd' || k === 'в') { S.settings.view = 'day'; save(); render(); }
    else if (k === 'w' || k === 'ц') { S.settings.view = 'week'; save(); render(); }
    else if (k === 'm' || k === 'ь') { S.settings.view = 'month'; save(); render(); }
    else if (k === '/') { e.preventDefault(); openSearch(); }
  });

  /* ---------- API для модулей (напоминания, Google) ---------- */
  window.Cal = {
    get S() { return S; }, set S(v) { S = v; },
    save: save, render: render, uid: uid, ymd: ymd, parseYmd: parseYmd, shiftDate: shiftDate, dayDiff: dayDiff, addDays: addDays,
    occursOn: occursOn, eventsOn: eventsOn, catById: catById, hm: hm, toast: toast, mark: mark, normRep: normRep, remMinutes: remMinutes,
    isKey: isKey, hooks: hooks, extra: extra, DOW_SHORT: DOW_SHORT, MON_GEN: MON_GEN, MON_SHORT: MON_SHORT, setAnchor: setAnchor,
    openSettings: function () { buildSettings(); if (!setDlg.open) setDlg.showModal(); }, h: h, dropMaster: dropMaster, editing: function () { return editing; }, openEvent: openEvent, leaveBuf: leaveBuf
  };

  /* клик по затемнённому фону закрывает окно (на ПК; как Escape) */
  var downOnBackdrop = null;
  function onBackdrop(e) {
    var d = e.target;
    if (!d || d.tagName !== 'DIALOG' || !d.open) return false;
    var r = d.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  }
  document.addEventListener('mousedown', function (e) { downOnBackdrop = onBackdrop(e) ? e.target : null; });
  document.addEventListener('click', function (e) {
    var d = downOnBackdrop; downOnBackdrop = null;
    if (!d || e.target !== d || !onBackdrop(e)) return;
    if (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) return;
    if (d.dispatchEvent(new Event('cancel', { cancelable: true }))) d.close();
  });

  /* ---------- запуск ---------- */
  durOptions($('#taskDur'), 0);
  seed();
  render();
  setInterval(function () { if (!dragging) renderView(); }, 60000);
  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
