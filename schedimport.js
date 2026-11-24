/* Импорт расписания занятий.
   Источники: скриншот/фото (нейросеть на своём сервере: Qwen 3.8, запасная — Llama 4 Scout),
   таблица Excel (.xlsx) или CSV (разбор прямо в браузере), файл календаря .ics.
   Всё сводится к одному списку пар → предпросмотр с правкой → повторяющиеся события
   с учётом числителя/знаменателя от начала семестра. */
(function () {
  'use strict';
  var C = window.Cal;
  if (!C) return;
  var h = C.h;
  var DEF_URL = 'https://calendar-push.efremovr449.workers.dev';
  var MODELS = ['@cf/qwen/qwen3.8-27b', '@cf/meta/llama-4-scout-17b-16e-instruct'];
  var DAYS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  var WEEKS = [['all', 'каждую'], ['odd', 'числитель'], ['even', 'знаменатель'], ['c1', 'Ч-I'], ['z1', 'З-I'], ['c2', 'Ч-II'], ['z2', 'З-II']];
  var KINDS = ['', 'лекция', 'практика', 'лабораторная', 'семинар', 'консультация', 'экзамен', 'зачёт'];
  // частое расписание звонков — только если в таблице есть номер пары без времени
  var BELLS = { 1: ['09:00', '10:20'], 2: ['10:30', '11:50'], 3: ['12:00', '13:20'], 4: ['14:00', '15:20'], 5: ['15:30', '16:50'], 6: ['17:00', '18:20'], 7: ['18:30', '19:50'], 8: ['20:00', '21:20'] };

  function S() { return C.S; }
  function base() { return String(S().settings.pushUrl || DEF_URL).replace(/\/+$/, ''); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toMin(v) { var m = /(\d{1,2})[:.](\d{2})/.exec(String(v || '')); return m ? +m[1] * 60 + +m[2] : null; }
  function hhmm(min) { return min == null ? '' : pad(Math.floor(min / 60)) + ':' + pad(min % 60); }

  /* ---------- нормализация одного занятия ---------- */
  function dayOf(v) {
    if (typeof v === 'number') return v >= 1 && v <= 7 ? v : null;
    var s = String(v || '').trim().toLowerCase();
    if (/^[1-7]$/.test(s)) return +s;
    var map = [['пн', 1], ['пон', 1], ['вт', 2], ['ср', 3], ['чт', 4], ['чет', 4], ['пт', 5], ['пят', 5], ['сб', 6], ['суб', 6], ['вс', 7], ['вос', 7],
      ['mon', 1], ['tue', 2], ['wed', 3], ['thu', 4], ['fri', 5], ['sat', 6], ['sun', 7]];
    for (var i = 0; i < map.length; i++) if (s.indexOf(map[i][0]) === 0) return map[i][1];
    return null;
  }
  function kindOf(v) {
    var t = String(v || '').toLowerCase().replace(/[\[\]().]/g, '').trim();
    if (!t) return '';
    if (/^лек/.test(t)) return 'лекция';
    if (/^пр/.test(t)) return 'практика';
    if (/^лаб/.test(t)) return 'лабораторная';
    if (/^сем/.test(t)) return 'семинар';
    if (/^конс/.test(t)) return 'консультация';
    if (/^экз/.test(t)) return 'экзамен';
    if (/^зач/.test(t)) return 'зачёт';
    return t;
  }
  function weeksOf(v, extra) {
    var s = (String(v || '') + ' ' + String(extra || '')).toLowerCase().replace(/ё/g, 'е');
    var r4 = /([чз])\s*-\s*(ii|i|2|1)\b/.exec(s);
    if (r4) return (r4[1] === 'ч' ? 'c' : 'z') + (r4[2] === 'ii' || r4[2] === '2' ? '2' : '1');
    if (/odd|неч|числ|\bi\b(?!i)/.test(s) && !/знам|\bii\b/.test(s)) return 'odd';
    if (/even|чет|знам|\bii\b/.test(s)) return 'even';
    if (/^(c1|c2|z1|z2)$/.test(s.trim())) return s.trim();
    return 'all';
  }
  // «25.11» или «25 ноября» → ближайшая к сегодняшнему дню дата с таким числом и месяцем
  var MON = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  function dateOf(v) {
    var s = String(v || '').toLowerCase(), m = /(\d{1,2})[.\/](\d{1,2})/.exec(s), dd, mm;
    if (m) { dd = +m[1]; mm = +m[2] - 1; }
    else {
      m = /(\d{1,2})\s+([а-я]+)/.exec(s);
      if (!m) return null;
      dd = +m[1]; mm = -1;
      for (var i = 0; i < MON.length; i++) if (m[2].indexOf(MON[i]) === 0 && !(i === 4 && /^мар/.test(m[2]))) { mm = i; break; }
      if (mm < 0) return null;
    }
    if (mm < 0 || mm > 11 || dd < 1 || dd > 31) return null;
    var now = new Date(), best = null;
    [-1, 0, 1].forEach(function (k) { var d = new Date(now.getFullYear() + k, mm, dd); if (!best || Math.abs(d - now) < Math.abs(best - now)) best = d; });
    return C.ymd(best);
  }
  function clean(l) {
    var start = toMin(l.start), end = toMin(l.end);
    if (start == null && l.pair && BELLS[l.pair]) { start = toMin(BELLS[l.pair][0]); end = toMin(BELLS[l.pair][1]); }
    if (start != null && (end == null || end <= start)) end = start + 90;
    var title = String(l.title || '').trim(), room = String(l.room || '').replace(/^\s*(ауд\.?|аудитория)\s*/i, '').trim();
    var note = String(l.note || '').trim();
    // «Ч-I | 3118 | Основы программирования» — пометка недель попала в аудиторию или название
    var wk = weeksOf(l.weeks, /[чз]\s*-\s*i/i.test(title + ' ' + room) ? (title + ' ' + room) : '');
    room = room.replace(/^[чз]\s*-\s*i{1,2}\s*\|?\s*/i, '');
    title = title.replace(/^[чз]\s*-\s*i{1,2}\s*\|?\s*/i, '');
    var dt = dateOf(l.date), day = dayOf(l.day) || (dt ? (C.parseYmd(dt).getDay() || 7) : null);
    return { on: !!(title && start != null && day), day: day, dates: dt ? [dt] : null, start: start, end: end, title: title, kind: kindOf(l.kind),
      room: room, teacher: String(l.teacher || '').trim(), weeks: wk, note: note };
  }

  /* ---------- ответ нейросети ---------- */
  function fixObj(s) {
    var t2 = s.replace(/[“”«»]/g, '"').replace(/,\s*}/g, '}').replace(/([{,]\s*)([a-zA-Z_]+)\s*:/g, '$1"$2":').replace(/"\s+"(?=[a-zA-Z_]+"\s*:)/g, '","');
    var tries = [s, t2];
    for (var i = 0; i < tries.length; i++) { try { return JSON.parse(tries[i]); } catch (e) { /* следующая попытка */ } }
    return null;
  }
  function parseAnswer(text) {
    var t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(json)?/g, '');
    try {
      var a = t.indexOf('{'), b = t.lastIndexOf('}'), o = JSON.parse(t.slice(a, b + 1)), out = [];
      if (Array.isArray(o.lessons)) out = o.lessons;
      else if (Array.isArray(o.days)) o.days.forEach(function (d) { (d.lessons || []).forEach(function (l) { out.push(Object.assign({}, l, { day: l.day || d.day, date: l.date || d.date })); }); });
      if (out.length) return out;
    } catch (e) { /* ниже — поштучно */ }
    var lessons = [], day = null, date = null, re = /"day"\s*:\s*(\d)\s*,\s*(?:"date"\s*:\s*"([^"]*)"\s*,\s*)?"lessons"|\{[^{}\[\]]*"start"[^{}\[\]]*\}/g, m;
    while ((m = re.exec(t))) {
      if (m[1]) { day = +m[1]; date = m[2] || null; continue; }
      var obj = fixObj(m[0]);
      if (!obj) continue;
      if (obj.day == null && day != null) obj.day = day;
      if (obj.date == null && date) obj.date = date;
      lessons.push(obj);
    }
    return lessons;
  }
  function toDataUrl(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Не удалось открыть картинку')); };
      img.src = url;
    });
  }
  function recognize(img, onStep) {
    return Promise.resolve().then(function () {
      var i = 0, lastErr = null;
      function next() {
        if (i >= MODELS.length) throw lastErr || new Error('Не удалось распознать');
        var model = MODELS[i++];
        if (i > 1) onStep('запасная модель');
        return fetch(base() + '/ai/schedule', { method: 'POST', headers: C.srvHeaders(), body: JSON.stringify({ model: model, image: img, prompt: 'v2' }) })
          .then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); })
          .then(function (j) {
            if (j._status === 401) throw Object.assign(new Error(C.srvToken() ? 'Код доступа больше не действует: войдите заново (Настройки → Доступ к серверу)' : 'Чтобы распознавать скриншоты, войдите по коду приглашения: Настройки → Доступ к серверу'), { fatal: true });
            if (j.error === 'limit' || j.error === 'quota') throw Object.assign(new Error(j.message), { fatal: true });
            if (j._status === 404) throw Object.assign(new Error('На сервере старая версия: обновите код воркера'), { fatal: true });
            if (j.error === 'no-ai') throw Object.assign(new Error('К серверу не подключён Workers AI'), { fatal: true });
            if (j._status !== 200) { lastErr = new Error(j.message || j.error || 'Сервер ответил ' + j._status); return next(); }
            var list = parseAnswer(j.text);
            if (!list.length) { lastErr = new Error('Нейросеть не нашла занятий на картинке'); return next(); }
            return list;
          }, function (e) { if (e.fatal) throw e; lastErr = /fetch/i.test(e.message) ? new Error('Сервер недоступен') : e; return next(); });
      }
      return next();
    });
  }

  /* ---------- несколько скриншотов ---------- */
  function loadImg(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('Не удалось открыть «' + file.name + '»')); };
      img.src = url;
    });
  }
  function canvasOf(w, hgt) { var c = document.createElement('canvas'); c.width = w; c.height = hgt; return c; }
  function gray(img, w) {
    var k = w / img.naturalWidth, hh = Math.round(img.naturalHeight * k), c = canvasOf(w, hh), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, hh);
    var d = x.getImageData(0, 0, w, hh).data, g = new Float32Array(w * hh);
    for (var i = 0; i < g.length; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
    return { g: g, w: w, h: hh, k: k };
  }
  function rowDiff(a, ya, b, yb, w) { var s = 0; for (var x = 0; x < w; x += 2) s += Math.abs(a.g[ya * w + x] - b.g[yb * w + x]); return s / (w / 2); }
  function rowStd(a, y, w) { var m = 0, q = 0, n = 0; for (var x = 0; x < w; x += 2) { var v = a.g[y * w + x]; m += v; q += v * v; n++; } m /= n; return Math.sqrt(Math.max(0, q / n - m * m)); }
  // скриншоты прокрутки одной таблицы → одна картинка; иначе null
  function stitch(imgs) {
    var W = Math.min(480, imgs[0].naturalWidth), gs = imgs.map(function (im) { return gray(im, W); }), H = gs[0].h, top = 0, bot = H - 1;
    var same = function (y) { var s = 0; for (var i = 1; i < gs.length; i++) s += rowDiff(gs[i - 1], y, gs[i], y, W); return s / (gs.length - 1) < 4; };
    while (top < H * 0.25 && same(top)) top++;            // строка состояния и шапка приложения одинаковы на всех кадрах
    while (bot > H * 0.75 && same(bot)) bot--;            // нижняя панель навигации
    var ch = bot - top + 1, offs = [];
    for (var i = 1; i < gs.length; i++) {
      var A = gs[i - 1], B = gs[i], best = null;
      for (var sft = Math.round(ch * 0.1); sft <= ch - Math.round(ch * 0.15); sft++) {
        var ov = ch - sft, d = 0, n = 0;
        for (var y = 0; y < ov; y += 2) { d += rowDiff(A, top + sft + y, B, top + y, W); n++; }
        d /= n;
        if (!best || d < best.d) best = { d: d, s: sft, ov: ov };
      }
      // перекрытие должно быть похожим и непустым: иначе это разные экраны, а не прокрутка
      var info = 0; for (var yy = 0; yy < best.ov; yy += 2) info += rowStd(B, top + yy, W) > 12 ? 1 : 0;
      if (!best || best.d > 9 || info < best.ov / 2 * 0.15) return null;
      offs.push(best.s);
    }
    var k = imgs[0].naturalWidth / W, t = Math.round(top * k), cH = Math.round(ch * k);
    var total = cH + offs.reduce(function (a, b) { return a + Math.round(b * k); }, 0), c = canvasOf(imgs[0].naturalWidth, total), x = c.getContext('2d'), y0 = 0;
    imgs.forEach(function (im, i) {
      x.drawImage(im, 0, t, im.naturalWidth, cH, 0, y0, im.naturalWidth, cH);
      if (i < offs.length) y0 += Math.round(offs[i] * k);
    });
    return c;
  }
  function canvasToData(c, max) {
    var k = Math.min(1, max / Math.max(c.width, c.height));
    if (k < 1) { var c2 = canvasOf(Math.round(c.width * k), Math.round(c.height * k)); c2.getContext('2d').drawImage(c, 0, 0, c2.width, c2.height); c = c2; }
    return c.toDataURL('image/jpeg', 0.88);
  }
  function imgToData(im) { var c = canvasOf(im.naturalWidth, im.naturalHeight); c.getContext('2d').drawImage(im, 0, 0); return canvasToData(c, 1600); }
  // файлы → список картинок для нейросети: подряд идущие кадры прокрутки склеиваются
  function prepare(files) {
    return Promise.all(files.map(loadImg)).then(function (imgs) {
      if (imgs.length === 1) return { parts: [imgToData(imgs[0])], stitched: false };
      var sameSize = imgs.every(function (im) { return im.naturalWidth === imgs[0].naturalWidth && im.naturalHeight === imgs[0].naturalHeight; });
      var c = sameSize ? stitch(imgs) : null;
      if (c) return { parts: [canvasToData(c, 2000)], stitched: true };
      return { parts: imgs.map(imgToData), stitched: false };
    });
  }
  // одинаковые пары с разных скриншотов — одна строка; даты копятся, чтобы потом понять чётность
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ''); }
  function merge(rows) {
    var out = [], by = {};
    rows.forEach(function (r) {
      var k = [r.day, r.start, norm(r.title), norm(r.room), r.weeks].join('|'), x = by[k];
      if (!x) { by[k] = Object.assign({}, r, { dates: r.dates ? r.dates.slice() : null }); out.push(by[k]); return; }
      if (r.dates) x.dates = (x.dates || []).concat(r.dates.filter(function (d) { return (x.dates || []).indexOf(d) < 0; }));
      if (!x.teacher && r.teacher) x.teacher = r.teacher;
      if (!x.kind && r.kind) x.kind = r.kind;
    });
    return out;
  }
  // по датам скриншотов: пара есть в обе недели — каждую, в одну — числитель или знаменатель
  function weeksByDates(rows, sem) {
    if (!sem) return;
    var all = {};
    rows.forEach(function (r) { (r.dates || []).forEach(function (d) { all[weekNo(C.parseYmd(d), sem) % 2] = 1; }); });
    if (!(all[0] && all[1])) return;                    // скриншоты только за одну неделю — чётность не понять
    rows.forEach(function (r) {
      if (!r.dates || r.weeksTouched) return;
      var p = {};
      r.dates.forEach(function (d) { p[weekNo(C.parseYmd(d), sem) % 2] = 1; });
      r.weeks = p[0] && p[1] ? 'all' : p[1] ? 'odd' : 'even';
    });
  }

  /* ---------- CSV и Excel ---------- */
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    var first = text.split(/\r?\n/)[0] || '', delim = [';', '\t', ','].sort(function (a, b) { return first.split(b).length - first.split(a).length; })[0];
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  // .xlsx — это zip с XML внутри; распаковка встроенным DecompressionStream
  function unzip(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf), eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Это не файл Excel (.xlsx)');
    var n = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true), files = {};
    for (var k = 0; k < n; k++) {
      var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true), nl = dv.getUint16(off + 28, true),
        xl = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
      var name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nl));
      files[name] = { method: method, csize: csize, lho: lho };
      off += 46 + nl + xl + cl;
    }
    return function read(name) {
      var f = files[name];
      if (!f) return Promise.resolve(null);
      var start = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true), data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return Promise.resolve(new TextDecoder().decode(data));
      var ds = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(ds).text();
    };
  }
  function colIdx(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + m[1].charCodeAt(i) - 64; return n - 1; }
  function parseXlsx(buf) {
    var read = unzip(buf), xml = function (s) { return new DOMParser().parseFromString(s || '<x/>', 'application/xml'); };
    return Promise.all([read('xl/workbook.xml'), read('xl/_rels/workbook.xml.rels'), read('xl/sharedStrings.xml')]).then(function (r) {
      var wb = xml(r[0]), rels = xml(r[1]), ss = [];
      Array.prototype.forEach.call(xml(r[2]).getElementsByTagName('si'), function (si) {
        ss.push(Array.prototype.map.call(si.getElementsByTagName('t'), function (t) { return t.textContent; }).join(''));
      });
      var target = {};
      Array.prototype.forEach.call(rels.getElementsByTagName('Relationship'), function (x) { target[x.getAttribute('Id')] = x.getAttribute('Target'); });
      var sheets = Array.prototype.map.call(wb.getElementsByTagName('sheet'), function (sh) {
        var t = target[sh.getAttribute('r:id')] || target[sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')] || '';
        return { name: sh.getAttribute('name'), path: t.indexOf('/') === 0 ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '') };
      });
      return Promise.all(sheets.map(function (s) { return read(s.path); })).then(function (texts) {
        return sheets.map(function (s, i) {
          var rows = [];
          Array.prototype.forEach.call(xml(texts[i]).getElementsByTagName('row'), function (row) {
            var arr = [];
            Array.prototype.forEach.call(row.getElementsByTagName('c'), function (c) {
              var t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], val = '';
              if (t === 's' && v) val = ss[+v.textContent] || '';
              else if (t === 'inlineStr') val = Array.prototype.map.call(c.getElementsByTagName('t'), function (x) { return x.textContent; }).join('');
              else if (v) val = v.textContent;
              arr[colIdx(c.getAttribute('r') || 'A1')] = val;
            });
            rows.push(arr);
          });
          return { name: s.name, rows: rows };
        });
      });
    });
  }
  // строки таблицы → занятия: ищем строку-шапку по знакомым словам
  var HEAD = { day: /^(день|дни|day)/i, pair: /^(пара|№|номер)/i, time: /^(время|time)$/i, start: /^(начало|с$|start|время начала)/i, end: /^(конец|окончание|до$|end|время окончания)/i,
    weeks: /^(недел|чёт|чет|числ|week)/i, title: /^(дисциплин|предмет|название|занятие|subject)/i, kind: /^(вид|тип|type)/i, room: /^(ауд|место|кабинет|room)/i,
    teacher: /^(преподав|учител|teacher)/i, note: /^(примеч|коммент|note)/i };
  function tableToLessons(rows) {
    for (var r = 0; r < Math.min(rows.length, 15); r++) {
      var map = {}, hits = 0;
      (rows[r] || []).forEach(function (cell, i) {
        var t = String(cell || '').trim();
        Object.keys(HEAD).forEach(function (k) { if (map[k] == null && HEAD[k].test(t)) { map[k] = i; hits++; } });
      });
      if (hits >= 3 && map.title != null && (map.day != null)) {
        var out = [];
        rows.slice(r + 1).forEach(function (row) {
          if (!row || !row.some(function (x) { return String(x || '').trim(); })) return;
          var g = function (k) { return map[k] == null ? '' : row[map[k]]; };
          var st = g('start'), en = g('end'), tm = String(g('time') || '');
          // время числом из Excel (доля суток) или «9:00-10:20» в одной ячейке
          if (st && !isNaN(+st) && +st < 1) st = hhmm(Math.round(+st * 1440));
          if (en && !isNaN(+en) && +en < 1) en = hhmm(Math.round(+en * 1440));
          var mm = /(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})/.exec(tm + ' ' + st);
          if (mm) { st = mm[1]; en = mm[2]; }
          out.push({ day: g('day'), pair: parseInt(g('pair'), 10) || null, start: st, end: en, title: g('title'), kind: g('kind'), room: g('room'), teacher: g('teacher'), weeks: g('weeks'), note: g('note') });
        });
        return out;
      }
    }
    return null;
  }

  /* ---------- .ics ---------- */
  function parseIcs(text) {
    var lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/), evs = [], cur = null;
    function dt(prop, val) {
      var m = /(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(val);
      if (!m) return null;
      var d = m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
      return { d: d, allDay: !m[4] };
    }
    function unesc(s) { return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }
    lines.forEach(function (ln) {
      if (ln === 'BEGIN:VEVENT') cur = {};
      else if (ln === 'END:VEVENT') { if (cur && cur.start) evs.push(cur); cur = null; }
      else if (cur) {
        var i = ln.indexOf(':'), key = ln.slice(0, i), val = ln.slice(i + 1), name = key.split(';')[0];
        if (name === 'SUMMARY') cur.title = unesc(val);
        else if (name === 'LOCATION') cur.room = unesc(val);
        else if (name === 'DESCRIPTION') cur.desc = unesc(val);
        else if (name === 'DTSTART') cur.start = dt(key, val);
        else if (name === 'DTEND') cur.end = dt(key, val);
        else if (name === 'RRULE') cur.rrule = val;
        else if (name === 'EXDATE') (cur.ex = cur.ex || []).push(val);
      }
    });
    return evs.map(function (e) {
      var s = e.start.d, en = e.end ? e.end.d : new Date(s.getTime() + 3600000), rep = null;
      if (e.rrule) {
        var p = {};
        e.rrule.split(';').forEach(function (kv) { var a = kv.split('='); p[a[0]] = a[1]; });
        var until = p.UNTIL ? C.ymd(dt('', p.UNTIL).d) : '';
        if (!until && p.COUNT) until = C.ymd(C.addDays(s, (p.FREQ === 'WEEKLY' ? 7 : 1) * (+p.INTERVAL || 1) * (+p.COUNT - 1)));
        var byd = p.BYDAY ? p.BYDAY.split(',').map(function (x) { return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].indexOf(x.slice(-2)); }).filter(function (x) { return x >= 0; }) : null;
        if (p.FREQ === 'WEEKLY') rep = { type: 'weekly', interval: +p.INTERVAL || 1, days: byd && byd.length ? byd : [s.getDay()], until: until };
        else if (p.FREQ === 'DAILY') rep = { type: 'daily', interval: +p.INTERVAL || 1, until: until };
        else if (p.FREQ === 'MONTHLY') rep = { type: 'monthly', interval: +p.INTERVAL || 1, until: until };
      }
      var ex = (e.ex || []).join(',').split(',').filter(Boolean).map(function (v) { var x = dt('', v); return x ? C.ymd(x.d) : null; }).filter(Boolean);
      var startMin = s.getHours() * 60 + s.getMinutes(), endMin = Math.round((en - s) / 60000) + startMin;
      return { on: true, ics: true, date: C.ymd(s), allDay: e.start.allDay, start: e.start.allDay ? 0 : startMin, end: e.start.allDay ? 1440 : Math.min(endMin, startMin + 16 * 60),
        title: e.title || '(без названия)', room: e.room || '', note: e.desc || '', rep: rep, ex: ex, kind: kindOf(((e.title || '').match(/\((лек|пр|лаб|сем)[^)]*\)|\[(лек|пр|лаб|сем)[^\]]*\]/i) || [''])[0]) };
    });
  }

  /* ---------- семестр и чётность ---------- */
  function guessSem() {
    var n = new Date(), y = n.getFullYear();
    if (n.getMonth() >= 7) return y + '-09-01';
    // весна: второй понедельник февраля
    var d = new Date(y, 1, 1); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + 7);
    return C.ymd(d);
  }
  function guessEnd(sem) { var d = C.parseYmd(sem); return d.getMonth() >= 7 ? d.getFullYear() + '-12-31' : d.getFullYear() + '-06-30'; }
  function weekNo(date, sem) { return Math.round((C.startOfWeek(date) - C.startOfWeek(C.parseYmd(sem))) / 604800000) + 1; }
  function weekFits(w, n) {
    if (w === 'all') return true;
    if (w === 'odd') return n % 2 === 1;
    if (w === 'even') return n % 2 === 0;
    var k = ((n - 1) % 4 + 4) % 4;      // 0: Ч-I, 1: З-I, 2: Ч-II, 3: З-II
    return { c1: 0, z1: 1, c2: 2, z2: 3 }[w] === k;
  }
  function makeEvent(l, o) {
    var jsDay = l.day % 7, d = C.parseYmd(o.from);
    for (var i = 0; i < 35; i++) {
      if (d.getDay() === jsDay && weekFits(l.weeks, weekNo(d, o.sem))) break;
      d = C.addDays(d, 1);
    }
    var date = C.ymd(d);
    if (date > o.until) return null;
    var iv = l.weeks === 'all' ? 1 : l.weeks === 'odd' || l.weeks === 'even' ? 2 : 4;
    return { id: C.uid(), title: l.title, date: date, start: l.start, end: l.end, cat: o.cat, notes: l.note || '',
      place: l.room || undefined, teacher: l.teacher || undefined, kind: l.kind || undefined,
      rep: { type: 'weekly', interval: iv, days: [jsDay], until: o.until }, ex: [], imp: o.batch };
  }

  /* ---------- окно ---------- */
  var dlg = null, state = null;
  function close() { if (dlg) { dlg.close(); dlg.remove(); dlg = null; } }
  function open() {
    close();
    state = { rows: [], src: '', note: '' };
    dlg = h('dialog', { class: 'wide-dlg imp-dlg', 'aria-label': 'Импорт расписания' });
    dlg.addEventListener('cancel', function () { setTimeout(close, 0); });
    document.body.append(dlg);
    stepSource();
    dlg.showModal();
  }
  function head(title, sub) {
    return h('div', { class: 'imp-head' }, h('h2', null, title), sub ? h('p', { class: 'mute small' }, sub) : null);
  }
  function stepSource(err) {
    var file = h('input', { type: 'file', accept: 'image/*,.xlsx,.csv,.ics,text/csv,text/calendar', hidden: true });
    var status = h('div', { class: 'imp-status', role: 'status' }, err ? h('span', { class: 'imp-err' }, err) : null);
    file.addEventListener('change', function () {
      var fs = Array.prototype.slice.call(file.files);
      if (!fs.length) return;
      var imgs = fs.filter(function (f) { return /^image\//.test(f.type); });
      if (imgs.length > 1 || (imgs.length === 1 && fs.length === 1)) loadImages(imgs, status); else load(fs[0], status);
    });
    var pick = function (accept, multi) { return function () { file.accept = accept; file.multiple = !!multi; file.click(); }; };
    dlg.replaceChildren(
      head('Импорт расписания', 'Выберите, откуда взять пары. Перед добавлением всё можно проверить и поправить.'),
      h('div', { class: 'imp-src' },
        h('button', { type: 'button', class: 'imp-card', onclick: pick('image/*', true) }, h('b', null, 'Скриншоты или фото'),
          h('span', { class: 'mute small' }, 'Один или несколько: куски длинной таблицы склеятся сами, отдельные дни объединятся. Распознаёт нейросеть, до полутора минут на картинку.')),
        h('button', { type: 'button', class: 'imp-card', onclick: pick('.xlsx,.csv,text/csv') }, h('b', null, 'Таблица Excel или CSV'),
          h('span', { class: 'mute small' }, 'Строка — одно занятие: день, время, предмет, аудитория… Разбирается сразу, без интернета.')),
        h('button', { type: 'button', class: 'imp-card', onclick: pick('.ics,text/calendar') }, h('b', null, 'Файл календаря .ics'),
          h('span', { class: 'mute small' }, 'Выгрузка из приложения расписания или из другого календаря.'))),
      file, status,
      h('div', { class: 'dlg-actions' }, h('button', { type: 'button', class: 'btn', onclick: close }, 'Закрыть')));
  }
  function load(f, status) {
    var name = f.name.toLowerCase(), t0 = Date.now(), timer = null;
    var say = function (msg, busy) {
      status.replaceChildren(h('span', { class: busy ? 'imp-busy' : '' }, msg));
    };
    var done = function (list, src) {
      clearInterval(timer);
      state.src = src;
      state.rows = list.map(function (l) { return l.ics ? l : clean(l); });
      if (!state.rows.length) { stepSource('Занятий не нашлось. ' + (src === 'image' ? 'Попробуйте скриншот почётче или крупнее.' : 'Проверьте, что в таблице есть столбцы «День», «Время» и «Дисциплина».')); return; }
      stepPreview();
    };
    var fail = function (e) { clearInterval(timer); stepSource(e && e.message ? e.message : String(e)); };
    if (/\.xlsx$/.test(name)) {
      say('Читаю таблицу…', true);
      f.arrayBuffer().then(parseXlsx).then(function (sheets) {
        for (var i = 0; i < sheets.length; i++) { var l = tableToLessons(sheets[i].rows); if (l && l.length) return done(l, 'table'); }
        throw new Error('Не нашёл лист-список с занятиями. Нужна таблица, где строка — одно занятие, а в шапке есть «День» и «Дисциплина».');
      }).catch(fail);
    } else if (/\.csv$/.test(name) || f.type === 'text/csv') {
      f.text().then(function (t) { var l = tableToLessons(parseCsv(t)); if (!l) throw new Error('В CSV не нашёл шапку со столбцами «День» и «Дисциплина».'); done(l, 'table'); }).catch(fail);
    } else if (/\.ics$/.test(name) || f.type === 'text/calendar') {
      f.text().then(function (t) { done(parseIcs(t), 'ics'); }).catch(fail);
    } else fail(new Error('Этот тип файла не поддерживается. Подойдёт картинка, .xlsx, .csv или .ics.'));
  }

  function loadImages(files, status) {
    var t0 = Date.now(), msg = 'Готовлю картинки…', timer;
    var paint = function () { status.replaceChildren(h('span', { class: 'imp-busy' }, msg + ' · ' + Math.round((Date.now() - t0) / 1000) + ' с')); };
    var say = function (m) { msg = m; paint(); };
    timer = setInterval(paint, 1000); paint();
    var fail = function (e) { clearInterval(timer); stepSource(e && e.message ? e.message : String(e)); };
    prepare(files).then(function (prep) {
      // хватит ли дневного лимита распознаваний на все картинки
      var acc = window.CalAccount;
      return (acc && C.srvToken() ? acc.refresh() : Promise.resolve(null)).then(function (me) {
        var ai = me && me.ai, left = ai && ai.limit ? ai.limit - ai.used : Infinity;
        if (left <= 0) throw new Error('Сегодня лимит распознаваний исчерпан (' + ai.used + ' из ' + ai.limit + '). Он обновится в 03:00 по Москве; Excel, CSV и .ics можно загрузить без ограничений.');
        if (prep.parts.length > left) throw new Error('Картинок ' + prep.parts.length + ', а распознаваний на сегодня осталось ' + left + '. Выберите меньше скриншотов или снимите таблицу прокруткой одним куском — тогда скриншоты склеятся в одну картинку.');
        return prep;
      });
    }).then(function (prep) {
      var parts = prep.parts, n = parts.length, done = 0, results = new Array(n), errors = [], next = 0, extra = '';
      if (prep.stitched) say('Склеил ' + files.length + ' скриншотов в одну таблицу. Распознаю…');
      else say(n > 1 ? 'Распознаю 0 из ' + n + '…' : 'Распознаю расписание…');
      return new Promise(function (resolve) {
        function worker() {
          if (next >= n) return Promise.resolve();
          var i = next++;
          return recognize(parts[i], function (m) { extra = ' (' + m + ')'; })
            .then(function (l) { results[i] = l; }, function (e) { if (e.fatal) throw e; errors.push((n > 1 ? 'картинка ' + (i + 1) + ': ' : '') + e.message); results[i] = []; })
            .then(function () { done++; if (n > 1) say('Распознаю ' + done + ' из ' + n + '…' + extra); return worker(); });
        }
        Promise.all([worker(), worker(), worker()]).then(resolve, fail);
      }).then(function () {
        clearInterval(timer);
        var rows = merge([].concat.apply([], results).map(clean));
        state.src = 'image';
        state.rows = rows;
        state.note = (prep.stitched ? 'Склеено из ' + files.length + ' скриншотов. ' : n > 1 ? 'Объединено из ' + n + ' картинок. ' : '') + (errors.length ? 'Не распознано: ' + errors.join('; ') + '. ' : '');
        if (!rows.length) { stepSource('Занятий не нашлось. ' + (errors[0] || 'Попробуйте скриншот почётче или крупнее.')); return; }
        stepPreview();
      });
    }).catch(fail);
  }

  function stepPreview() {
    var ics = state.src === 'ics', st = S().settings;
    var sem = h('input', { type: 'date', value: st.semStart || guessSem() });
    var from = h('input', { type: 'date' }), until = h('input', { type: 'date', value: guessEnd(sem.value) });
    var today = C.ymd(C.startOfWeek(new Date()));
    from.value = sem.value > today ? sem.value : today;
    sem.addEventListener('change', function () { until.value = guessEnd(sem.value); if (from.value < sem.value) from.value = sem.value; paintWeek(); weeksByDates(state.rows, sem.value); paintRows(); });
    weeksByDates(state.rows, sem.value);
    var cats = S().cats, cat = h('select', null, cats.map(function (c) { return h('option', { value: c.id }, c.name); }));
    cat.value = cats.some(function (c) { return c.id === 'study'; }) ? 'study' : (st.defaultCat || cats[0].id);
    var prev = S().events.filter(function (e) { return e.imp; }), replace = h('input', { type: 'checkbox' });
    replace.checked = prev.length > 0;
    var demo = C.hasDemo && C.hasDemo(), dropDemo = h('input', { type: 'checkbox' });
    dropDemo.checked = true;
    var weekNote = h('div', { class: 'mute small' });
    function paintWeek() {
      if (!sem.value) { weekNote.textContent = ''; return; }
      var n = weekNo(new Date(), sem.value);
      weekNote.textContent = n >= 1 ? 'Первая неделя семестра — числитель, сейчас идёт ' + n + '-я — ' + (n % 2 ? 'числитель' : 'знаменатель') + '. Если это не так, поправьте дату начала семестра.' : 'Семестр ещё не начался.';
    }
    paintWeek();

    var tbody = h('tbody');
    function sel(opts, val, onch) {
      var s = h('select', null, opts.map(function (o) { return h('option', { value: o[0] }, o[1]); }));
      s.value = val; s.addEventListener('change', function () { onch(s.value); }); return s;
    }
    function inp(val, onch, type, cls) {
      var i = h('input', { type: type || 'text', value: val == null ? '' : val, class: cls || '', inputmode: cls === 'imp-t' ? 'numeric' : 'text', placeholder: cls === 'imp-t' ? '09:00' : '' });
      if (cls === 'imp-t' && window.CalTime) window.CalTime.enhance(i, 'wheel');   // время пары — барабаном
      i.addEventListener('change', function () { onch(i.value); }); return i;
    }
    function paintRows() {
      tbody.replaceChildren.apply(tbody, state.rows.map(function (r) {
        var chk = h('input', { type: 'checkbox', 'aria-label': 'Добавлять' }); chk.checked = r.on;
        chk.addEventListener('change', function () { r.on = chk.checked; tr.classList.toggle('off', !r.on); count(); });
        var tr = h('tr', { class: r.on ? '' : 'off' },
          h('td', null, chk),
          h('td', null, ics ? h('span', { class: 'small' }, r.date.slice(8) + '.' + r.date.slice(5, 7) + (r.rep ? ' ↻' : '')) : sel(DAYS.slice(1).map(function (d, i) { return [i + 1, d]; }), r.day || 1, function (v) { r.day = +v; })),
          h('td', null, h('div', { class: 'imp-time' }, inp(hhmm(r.start), function (v) { r.start = toMin(v); }, 'text', 'imp-t'), h('span', null, '–'), inp(hhmm(r.end), function (v) { r.end = toMin(v); }, 'text', 'imp-t'))),
          h('td', null, inp(r.title, function (v) { r.title = v; }, 'text', 'imp-title')),
          h('td', null, sel(KINDS.map(function (k) { return [k, k || '—']; }).concat(KINDS.indexOf(r.kind) < 0 ? [[r.kind, r.kind]] : []), r.kind || '', function (v) { r.kind = v; })),
          h('td', null, inp(r.room, function (v) { r.room = v; }, 'text', 'imp-room')),
          ics ? null : h('td', null, inp(r.teacher, function (v) { r.teacher = v; }, 'text', 'imp-teacher')),
          ics ? null : h('td', null, sel(WEEKS, r.weeks, function (v) { r.weeks = v; r.weeksTouched = true; })));
        return tr;
      }));
    }
    var go = h('button', { type: 'button', class: 'btn primary' });
    function count() { var n = state.rows.filter(function (r) { return r.on; }).length; go.textContent = 'Добавить ' + n + ' ' + plural(n); go.disabled = !n; }
    function plural(n) { var a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'занятие' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'занятия' : 'занятий'; }
    go.addEventListener('click', function () {
      if (!ics && !sem.value) { sem.focus(); return; }
      apply({ sem: sem.value, from: from.value || sem.value, until: until.value || guessEnd(sem.value), cat: cat.value, replace: replace.checked && prev.length, dropDemo: demo && dropDemo.checked });
    });
    paintRows(); count();

    var settings = ics ? h('div', { class: 'imp-opts' }, h('label', null, 'Календарь', cat)) : h('div', { class: 'imp-opts' },
      h('label', null, 'Начало семестра', sem),
      h('label', null, 'Добавлять с', from),
      h('label', null, 'Повторять до', until),
      h('label', null, 'Календарь', cat));
    dlg.replaceChildren.apply(dlg, [
      head('Проверьте занятия', (state.note || '') + (state.src === 'image' ? 'Распознано нейросетью — проверьте недели и аудитории. ' : '') + 'Снимите галочку, чтобы пропустить занятие.'),
      settings, ics ? null : weekNote,
      demo ? h('label', { class: 'imp-replace' }, dropDemo, ' Удалить демонстрационное расписание') : null,
      prev.length ? h('label', { class: 'imp-replace' }, replace, ' Заменить прошлый импорт (' + prev.length + ' ' + plural(prev.length).replace('занят', 'событ').replace('событие', 'событие') + ')') : null,
      h('div', { class: 'imp-table' }, h('table', null,
        h('thead', null, h('tr', null, ['', ics ? 'Дата' : 'День', 'Время', 'Предмет', 'Вид', 'Ауд.'].concat(ics ? [] : ['Преподаватель', 'Неделя']).map(function (t) { return h('th', null, t); }))),
        tbody)),
      h('div', { class: 'dlg-actions' }, go,
        h('button', { type: 'button', class: 'btn', onclick: function () { stepSource(); } }, 'Назад'),
        h('button', { type: 'button', class: 'btn', onclick: close }, 'Отмена'))
    ].filter(Boolean));   // null в replaceChildren превращается в текст «null»
  }

  function apply(o) {
    var snap = C.snapshot(), st = S().settings, batch = 'imp' + Date.now().toString(36), made = 0, skipped = 0;
    if (o.replace) {
      S().events.filter(function (e) { return e.imp; }).forEach(function (e) { C.dropMaster(e); });
    }
    if (o.dropDemo) C.clearDemo(true);    // откат — общей кнопкой «Отменить» импорта (снимок сделан выше)
    if (state.src !== 'ics' && o.sem) st.semStart = o.sem;
    state.rows.forEach(function (r) {
      if (!r.on || r.start == null || !String(r.title || '').trim()) { if (r.on) skipped++; return; }
      var ev;
      if (r.ics) {
        ev = { id: C.uid(), title: r.title, date: r.date, start: r.start, end: r.end, allDay: r.allDay || undefined, cat: o.cat, notes: r.note || '',
          place: r.room || undefined, kind: r.kind || undefined, rep: r.rep ? C.normRep(r.rep) : null, ex: r.ex || [], imp: batch };
      } else ev = makeEvent(r, Object.assign({ batch: batch }, o));
      if (!ev) { skipped++; return; }
      S().events.push(C.mark(ev)); made++;
    });
    C.save(); C.render();
    close();
    C.offerUndo(snap, 'Добавлено занятий: ' + made + (skipped ? ', пропущено: ' + skipped : ''));
  }

  /* ---------- раздел в настройках ---------- */
  C.extra.push(function () {
    var n = S().events.filter(function (e) { return e.imp; }).length;
    return h('div', { class: 'set-sec' }, h('h3', null, 'Расписание занятий'),
      h('p', { class: 'mute small', style: 'margin-top:0' }, 'Добавить пары на весь семестр из скриншота, таблицы или файла календаря. Числитель и знаменатель считаются от начала семестра.'),
      h('div', { class: 'cs-row' },
        h('button', { type: 'button', class: 'btn primary', onclick: function () { open(); } }, 'Импортировать расписание…'),
        n ? h('button', { type: 'button', class: 'btn danger', onclick: function () {
          if (!confirm('Удалить все импортированные занятия (' + n + ')? Можно будет отменить.')) return;
          var snap = C.snapshot();
          S().events.filter(function (e) { return e.imp; }).forEach(function (e) { C.dropMaster(e); });
          C.save(); C.render(); C.offerUndo(snap, 'Импортированные занятия удалены');
          C.openSettings();
        } }, 'Удалить импортированное') : null));
  });

  window.CalImport = { open: open, _stitch: stitch, _prepare: prepare, _merge: merge, _weeksByDates: weeksByDates, _dateOf: dateOf, _parseAnswer: parseAnswer, _clean: clean, _table: tableToLessons, _csv: parseCsv, _xlsx: parseXlsx, _ics: parseIcs, _makeEvent: makeEvent, _weekNo: weekNo };
})();
