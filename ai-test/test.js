/* Сравнение моделей Workers AI на скриншотах расписания.
   Сервер и код доступа берутся из настроек календаря (тот же сайт — общий localStorage). */
(function () {
  'use strict';
  var MODELS = [
    ['@cf/meta/llama-3.2-11b-vision-instruct', 'Llama 3.2 11B Vision'],
    ['@cf/meta/llama-4-scout-17b-16e-instruct', 'Llama 4 Scout 17B'],
    ['@cf/google/gemma-4-26b-a4b-it', 'Gemma 4 26B'],
    ['@cf/moonshotai/kimi-k2.6', 'Kimi K2.6']
  ];
  var SAMPLES = [
    ['a', 'Сетка с чёт/нечёт'], ['b', 'Список в приложении'], ['c', 'Таблица Excel'], ['d', 'Тёмная неделя']
  ];
  var DEF_URL = 'https://calendar-push.efremovr449.workers.dev';
  var DAYN = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  var WK = { all: '', odd: 'нечёт', even: 'чёт' };

  var $ = function (s) { return document.querySelector(s); };
  function el(tag, attrs) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null) e.append(x); }); }
    return e;
  }
  function server() {
    try { var u = JSON.parse(localStorage.getItem('calendar.v1') || '{}').settings.pushUrl; if (u) return String(u).replace(/\/+$/, ''); } catch (e) { /* по умолчанию */ }
    return DEF_URL;
  }
  function token() { try { return localStorage.getItem('calendar.srvtoken') || ''; } catch (e) { return ''; } }

  /* ---------- картинки ---------- */
  var truth = {}, images = [], results = [];
  SAMPLES.forEach(function (s) { images.push({ id: s[0], name: s[1], src: 'sample-' + s[0] + '.png', on: true, sample: true }); });

  function paintImages() {
    var box = $('#imgs');
    box.replaceChildren();
    images.forEach(function (im) {
      box.append(el('div', { class: 'img' + (im.on ? ' on' : ''), title: im.name, onclick: function () { im.on = !im.on; paintImages(); } },
        el('img', { src: im.src, alt: im.name }), el('span', { text: (im.on ? '✓ ' : '') + im.name }),
        im.sample ? null : el('button', { type: 'button', text: '✕', 'aria-label': 'Убрать', onclick: function (e) { e.stopPropagation(); images = images.filter(function (x) { return x !== im; }); paintImages(); } })));
    });
    box.append(el('button', { type: 'button', class: 'img add', onclick: function () { $('#file').click(); } }, el('b', { text: '+' }), el('span', { text: 'Свой скриншот', style: 'position:static;background:none' })));
  }
  $('#file').addEventListener('change', function () {
    Array.prototype.forEach.call(this.files, function (f) {
      var url = URL.createObjectURL(f);
      images.push({ id: 'u' + Date.now() + Math.random().toString(36).slice(2, 6), name: f.name.slice(0, 24), src: url, on: true, sample: false });
    });
    this.value = '';
    paintImages();
  });

  // картинка → dataURL не шире 1600 px (так дешевле и не упирается в лимит запроса)
  function toDataUrl(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = function () { rej(new Error('Не удалось открыть картинку')); };
      img.src = src;
    });
  }

  /* ---------- модели ---------- */
  var chosen = {};
  MODELS.forEach(function (m) { chosen[m[0]] = true; });
  $('#models').append.apply($('#models'), MODELS.map(function (m) {
    var cb = el('input', { type: 'checkbox' });
    cb.checked = true;
    cb.addEventListener('change', function () { chosen[m[0]] = cb.checked; });
    return el('label', { class: 'chip' }, cb, m[1]);
  }));

  /* ---------- разбор ответа и оценка ---------- */
  function parseAnswer(text) {
    var t = String(text || '').replace(/```(json)?/g, '');
    var a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) {
      var s1 = t.indexOf('['), s2 = t.lastIndexOf(']');
      if (s1 >= 0 && s2 > s1) return { lessons: JSON.parse(t.slice(s1, s2 + 1)) };
      throw new Error('В ответе нет JSON');
    }
    var o = JSON.parse(t.slice(a, b + 1));
    return Array.isArray(o) ? { lessons: o } : o;
  }
  function hhmm(v) { var m = /(\d{1,2})[:.](\d{2})/.exec(String(v || '')); return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : ''; }
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/ауд\.?|аудитория/g, '').replace(/[^a-zа-я0-9]+/g, ' ').trim(); }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function similar(a, b) {
    a = norm(a); b = norm(b);
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return true;
    return 1 - lev(a, b) / Math.max(a.length, b.length) >= 0.8;
  }
  function surname(s) { return norm(s).split(' ')[0] || ''; }
  function kindOf(s) {
    var t = norm(s);
    if (!t) return '';
    if (/^лек/.test(t)) return 'лекция'; if (/^пр/.test(t)) return 'практика'; if (/^лаб/.test(t)) return 'лабораторная';
    if (/^сем/.test(t)) return 'семинар'; return t;
  }
  function weeksOf(s) { s = String(s || '').toLowerCase(); return /odd|неч/.test(s) ? 'odd' : /even|чет|чёт/.test(s) && !/неч/.test(s) ? 'even' : 'all'; }
  var FIELDS = ['время', 'предмет', 'вид', 'аудитория', 'преподаватель', 'неделя'];
  function score(pred, gt) {
    var used = {}, rows = [], pts = 0;
    gt.forEach(function (g) {
      var best = -1, bestPts = -1, bestMarks = null;
      pred.forEach(function (p, i) {
        if (used[i] || +p.day !== g.day || hhmm(p.start) !== g.start) return;
        var marks = [hhmm(p.end) === g.end, similar(p.title, g.title), kindOf(p.kind) === kindOf(g.kind),
          norm(p.room) === norm(g.room), surname(p.teacher) === surname(g.teacher), weeksOf(p.weeks) === g.weeks];
        var n = marks.filter(Boolean).length;
        if (n > bestPts) { best = i; bestPts = n; bestMarks = marks; }
      });
      if (best >= 0) { used[best] = true; pts += bestPts; }
      rows.push({ g: g, p: best >= 0 ? pred[best] : null, marks: bestMarks });
    });
    var extra = pred.filter(function (p, i) { return !used[i]; });
    var total = 6 * Math.max(gt.length, pred.length);
    return { pct: total ? Math.round(pts / total * 100) : 0, rows: rows, extra: extra, found: pred.length, need: gt.length };
  }
  function cls(p) { return p >= 85 ? 'g' : p >= 60 ? 'm' : 'b'; }

  /* ---------- запуск ---------- */
  function call(model, dataUrl) {
    var h = { 'Content-Type': 'text/plain' }, t = token();
    if (t) h['X-Cal-Token'] = t;
    return fetch(server() + '/ai/schedule', { method: 'POST', headers: h, body: JSON.stringify({ model: model, image: dataUrl, hint: $('#hint').value.trim() }) })
      .then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); });
  }
  function errText(j) {
    if (j._status === 401) return 'Неверный код доступа к серверу (Настройки календаря → Синхронизация устройств)';
    if (j._status === 404) return 'На сервере старая версия: обновите код воркера';
    if (j.error === 'no-ai') return 'К воркеру не подключён Workers AI: Settings → Bindings → Add → Workers AI, имя AI';
    if (j._status === 429) return 'Слишком много запросов, подождите';
    return (j.message || j.error || ('HTTP ' + j._status));
  }

  $('#go').addEventListener('click', function () {
    var imgs = images.filter(function (x) { return x.on; }), models = MODELS.filter(function (m) { return chosen[m[0]]; });
    if (!imgs.length || !models.length) { $('#status').textContent = 'Выберите хотя бы одну картинку и одну модель.'; return; }
    var btn = this; btn.disabled = true; $('#copy').disabled = true;
    results = [];
    var jobs = [];
    imgs.forEach(function (im) { models.forEach(function (m) { jobs.push({ im: im, m: m }); }); });
    var done = 0, cache = {};
    paintAll();
    (function next() {
      if (done >= jobs.length) { btn.disabled = false; $('#copy').disabled = false; $('#status').textContent = 'Готово.'; return; }
      var j = jobs[done];
      $('#status').textContent = 'Распознаю ' + (done + 1) + ' из ' + jobs.length + ': ' + j.im.name + ' · ' + j.m[1] + '…';
      var r = { im: j.im, model: j.m, state: 'run' };
      results.push(r); paintAll();
      (cache[j.im.id] ? Promise.resolve(cache[j.im.id]) : toDataUrl(j.im.src).then(function (d) { cache[j.im.id] = d; return d; }))
        .then(function (d) { return call(j.m[0], d); })
        .then(function (ans) {
          if (ans._status !== 200) { r.state = 'err'; r.err = errText(ans); return; }
          r.ms = ans.ms; r.raw = ans.text; r.usage = ans.usage;
          try {
            var o = parseAnswer(ans.text);
            r.pred = (o.lessons || []).filter(function (x) { return x && typeof x === 'object'; });
            if (j.im.sample && truth[j.im.id]) r.sc = score(r.pred, truth[j.im.id]);
            r.state = 'ok';
          } catch (e) { r.state = 'bad'; r.err = 'Ответ не разобрать: ' + e.message; }
        })
        .catch(function (e) { r.state = 'err'; r.err = /fetch/i.test(e.message) ? 'Сервер недоступен' : e.message; })
        .then(function () { done++; paintAll(); next(); });
    })();
  });

  function paintAll() { paintSummary(); paintResults(); }
  function paintSummary() {
    var box = $('#summary');
    if (!results.length) { box.replaceChildren(el('span', { class: 'mute small', text: 'Пока пусто.' })); return; }
    var by = {};
    results.forEach(function (r) {
      var k = r.model[0], s = by[k] = by[k] || { name: r.model[1], pct: [], ms: [], errs: 0, n: 0 };
      if (r.state === 'run') return;
      s.n++;
      if (r.state !== 'ok') s.errs++;
      if (r.sc) s.pct.push(r.sc.pct); else if (r.state !== 'ok' && r.im.sample) s.pct.push(0);
      if (r.ms != null) s.ms.push(r.ms);
    });
    var avg = function (a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; };
    var rows = Object.keys(by).map(function (k) { var s = by[k]; return { s: s, p: avg(s.pct), t: avg(s.ms) }; })
      .sort(function (a, b) { return (b.p == null ? -1 : b.p) - (a.p == null ? -1 : a.p); });
    box.replaceChildren(el('table', null,
      el('tr', null, el('th', { text: 'Модель' }), el('th', { text: 'Точность на примерах' }), el('th', { text: 'Время' }), el('th', { text: 'Ошибок' })),
      rows.map(function (x) {
        return el('tr', null, el('td', { text: x.s.name }),
          el('td', null, x.p == null ? el('span', { class: 'mute', text: '—' }) : el('span', { class: 'score ' + cls(x.p), text: x.p + '%' })),
          el('td', { text: x.t == null ? '—' : (x.t / 1000).toFixed(1) + ' с' }),
          el('td', { text: String(x.s.errs) }));
      })));
  }
  function lessonTable(r) {
    if (r.sc) {
      return el('table', { class: 'lt' },
        el('tr', null, ['День', 'Начало'].concat(FIELDS).map(function (h) { return el('th', { text: h }); })),
        r.sc.rows.map(function (row) {
          var g = row.g, p = row.p, mk = row.marks || [];
          function c(i, val, want) { return el('td', { class: p ? (mk[i] ? 'ok' : 'x') : 'x', title: 'Нужно: ' + want }, p ? (val || '—') : '—'); }
          return el('tr', null, el('td', { text: DAYN[g.day] }), el('td', { text: g.start }),
            c(0, p && hhmm(p.start) + '–' + hhmm(p.end), g.start + '–' + g.end), c(1, p && p.title, g.title), c(2, p && p.kind, g.kind),
            c(3, p && p.room, g.room), c(4, p && p.teacher, g.teacher), c(5, p && WK[weeksOf(p.weeks)], WK[g.weeks] || 'каждую'));
        }),
        r.sc.extra.map(function (p) {
          return el('tr', { class: 'x' }, el('td', { text: DAYN[p.day] || p.day }), el('td', { text: hhmm(p.start) }),
            el('td', { colspan: '6', text: 'лишнее: ' + [p.title, p.kind, p.room, p.teacher].filter(Boolean).join(' · ') }));
        }));
    }
    return el('table', { class: 'lt' },
      el('tr', null, ['День', 'Время', 'Предмет', 'Вид', 'Ауд.', 'Преподаватель', 'Неделя'].map(function (h) { return el('th', { text: h }); })),
      (r.pred || []).map(function (p) {
        return el('tr', null, [DAYN[p.day] || p.day, hhmm(p.start) + '–' + hhmm(p.end), p.title, p.kind, p.room, p.teacher, WK[weeksOf(p.weeks)]].map(function (v) { return el('td', { text: v || '' }); }));
      }));
  }
  function paintResults() {
    var box = $('#results'), byImg = {};
    results.forEach(function (r) { (byImg[r.im.id] = byImg[r.im.id] || { im: r.im, list: [] }).list.push(r); });
    box.replaceChildren.apply(box, Object.keys(byImg).map(function (k) {
      var g = byImg[k];
      return el('div', { class: 'card', style: 'margin-bottom:12px' },
        el('b', { text: g.im.name }), g.im.sample ? el('span', { class: 'mute small', text: ' · занятий в эталоне: ' + (truth[g.im.id] || []).length }) : null,
        g.list.map(function (r) {
          var head = el('div', { style: 'margin-top:10px' }, el('b', { text: r.model[1] + ': ' }));
          if (r.state === 'run') head.append(el('span', { class: 'mute', text: 'распознаю…' }));
          else if (r.state === 'err' || r.state === 'bad') head.append(el('span', { class: 'err', text: r.err }));
          else {
            if (r.sc) head.append(el('span', { class: 'score ' + cls(r.sc.pct), text: r.sc.pct + '% ' }));
            head.append(el('span', { class: 'mute small', text: 'найдено ' + r.pred.length + (r.sc ? ' из ' + r.sc.need : '') + ' · ' + (r.ms / 1000).toFixed(1) + ' с' }));
          }
          var det = null;
          if (r.state === 'ok') det = el('details', null, el('summary', { text: 'Что распознано' }), lessonTable(r));
          var raw = r.raw ? el('details', null, el('summary', { text: 'Сырой ответ модели' }), el('pre', { text: r.raw })) : null;
          return el('div', null, head, det, raw);
        }));
    }));
  }

  $('#copy').addEventListener('click', function () {
    var lines = ['Проверка моделей на расписании, ' + new Date().toLocaleString('ru-RU'), ''];
    results.forEach(function (r) {
      lines.push(r.im.name + ' · ' + r.model[1] + ': ' + (r.state === 'ok' ? (r.sc ? r.sc.pct + '%, ' : '') + 'найдено ' + r.pred.length + (r.sc ? ' из ' + r.sc.need : '') + ', ' + (r.ms / 1000).toFixed(1) + ' с' : 'ошибка: ' + r.err));
      if (r.sc) r.sc.rows.forEach(function (row) {
        if (!row.p) { lines.push('   пропущено: ' + DAYN[row.g.day] + ' ' + row.g.start + ' ' + row.g.title); return; }
        var bad = FIELDS.filter(function (f, i) { return !row.marks[i]; });
        if (bad.length) lines.push('   ' + DAYN[row.g.day] + ' ' + row.g.start + ' ' + row.g.title + ': неверно — ' + bad.join(', '));
      });
      if (!r.im.sample && r.state === 'ok') r.pred.forEach(function (p) { lines.push('   ' + [DAYN[p.day], hhmm(p.start) + '–' + hhmm(p.end), p.title, p.kind, p.room, p.teacher, WK[weeksOf(p.weeks)]].filter(Boolean).join(' · ')); });
    });
    var text = lines.join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { $('#status').textContent = 'Отчёт скопирован — вставьте его в чат.'; },
      function () { var t = el('textarea', { rows: '10' }); t.value = text; $('#status').replaceChildren(t); });
  });

  fetch('truth.json').then(function (r) { return r.json(); }).then(function (j) { truth = j; }).catch(function () { /* без эталона */ });
  paintImages();
  if (!token()) $('#status').textContent = 'Код доступа к серверу не найден на этом устройстве: откройте страницу в том же браузере, где настроен календарь.';
})();
