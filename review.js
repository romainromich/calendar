/* Итоги недели (воскресная сводка) и неделя в Obsidian */
(function () {
  'use strict';
  var C = window.Cal;
  if (!C) return;
  var h = C.h, FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  function S() { return C.S; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function words(n, a) { var m = n % 100, k = n % 10; return a[(m > 10 && m < 20) ? 2 : k === 1 ? 0 : (k > 1 && k < 5) ? 1 : 2]; }
  function startOfWeek(d) {
    var diff = (d.getDay() - S().settings.weekStart + 7) % 7;
    return C.addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -diff);
  }
  function dayLabel(d) { return C.DOW_SHORT[d.getDay()] + ' ' + d.getDate() + ' ' + C.MON_GEN[d.getMonth()]; }
  function rangeLabel(ws) { var we = C.addDays(ws, 6); return ws.getDate() + (ws.getMonth() !== we.getMonth() ? ' ' + C.MON_GEN[ws.getMonth()] : '') + '–' + we.getDate() + ' ' + C.MON_GEN[we.getMonth()]; }
  function nowMin() { var n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
  function streak(id) {
    var log = S().log[id] || [], d = new Date(), n = 0;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (log.indexOf(C.ymd(d)) < 0) d = C.addDays(d, -1);
    while (log.indexOf(C.ymd(d)) >= 0) { n++; d = C.addDays(d, -1); }
    return n;
  }
  function weekEvents(ws) {
    var out = [];
    for (var i = 0; i < 7; i++) { var d = C.addDays(ws, i), key = C.ymd(d); C.eventsOn(key).forEach(function (e) { if (!e._cont) out.push({ d: d, key: key, e: e }); }); }
    return out;
  }
  function isPast(x, todayKey) { return x.key < todayKey || (x.key === todayKey && (x.e.allDay || x.e.end <= nowMin())); }

  /* ---------- сводка ---------- */
  function stats() {
    var td = new Date(), todayKey = C.ymd(td), ws = startOfWeek(td), nws = C.addDays(ws, 7);
    var evs = weekEvents(ws), past = evs.filter(function (x) { return isPast(x, todayKey); });
    var wsKey = C.ymd(ws), weKey = C.ymd(C.addDays(ws, 6));
    var tasksDone = S().tasks.filter(function (t) { return t.done && t.doneAt && t.doneAt >= wsKey && t.doneAt <= weKey; });
    var habits = S().habits.map(function (hb) {
      var log = S().log[hb.id] || [], n = 0;
      for (var i = 0; i < 7; i++) if (log.indexOf(C.ymd(C.addDays(ws, i))) >= 0) n++;
      return { hb: hb, n: n, streak: streak(hb.id) };
    });
    var next = weekEvents(nws), nwsKey = C.ymd(nws), nweKey = C.ymd(C.addDays(nws, 6));
    return {
      ws: ws, nws: nws,
      lessons: past.filter(function (x) { return x.e.cat === 'study' && !x.e.prepFor; }).length,
      preps: past.filter(function (x) { return x.e.prepFor; }).length,
      eventsPast: past.length, eventsAll: evs.length,
      tasksDone: tasksDone, habits: habits,
      overdue: S().tasks.filter(function (t) { return !t.done && t.due && t.due < todayKey; }),
      nextCount: next.length, nextKey: next.filter(function (x) { return C.isKey(x.e); }),
      nextTasks: S().tasks.filter(function (t) { return !t.done && t.due && t.due >= nwsKey && t.due <= nweKey; })
    };
  }

  function tile(n, label) { return h('div', { class: 'rv-tile' }, h('b', null, String(n)), h('span', null, label)); }
  function openReview() {
    var st = stats(), dlg = h('dialog', { id: 'reviewDialog' });
    function close() { dlg.close(); dlg.remove(); }
    var kids = [
      h('div', { class: 'dlg-head' }, h('h2', null, 'Итоги недели'), h('button', { type: 'button', class: 'dlg-x', 'aria-label': 'Закрыть', onclick: close }, '✕')),
      h('p', { class: 'mute', style: 'margin:0 0 12px' }, rangeLabel(st.ws)),
      h('div', { class: 'rv-tiles' },
        tile(st.lessons, words(st.lessons, ['занятие проведено', 'занятия проведено', 'занятий проведено'])),
        tile(st.tasksDone.length, words(st.tasksDone.length, ['задача выполнена', 'задачи выполнено', 'задач выполнено'])),
        tile(st.preps, words(st.preps, ['блок подготовки', 'блока подготовки', 'блоков подготовки']))),
      st.overdue.length ? h('p', { class: 'rv-warn' }, 'Просрочено задач: ' + st.overdue.length + '. ' + st.overdue.slice(0, 3).map(function (t) { return t.title; }).join(', ') + (st.overdue.length > 3 ? '…' : '')) : null,
      h('h3', null, 'Привычки'),
      st.habits.length ? h('div', null, st.habits.map(function (x) {
        return h('div', { class: 'rv-row' }, h('span', { class: 't' }, x.hb.title),
          h('span', { class: 'rv-dots', 'aria-label': x.n + ' из 7' }, [0, 1, 2, 3, 4, 5, 6].map(function (i) { return h('i', { class: i < x.n ? 'on' : '' }); })),
          h('span', { class: 'mute small' }, 'серия ' + x.streak));
      })) : h('div', { class: 'mute small' }, 'Привычек нет.'),
      h('h3', null, 'Следующая неделя, ' + rangeLabel(st.nws)),
      h('div', { class: 'mute', style: 'margin-bottom:6px' }, st.nextCount ? 'Событий: ' + st.nextCount + '.' : 'Событий пока нет.'),
      st.nextKey.length ? h('div', null, st.nextKey.map(function (x) {
        return h('div', { class: 'rv-row' }, h('span', { class: 't' }, '⚑ ' + x.e.title), h('span', { class: 'mute small' }, dayLabel(x.d) + (x.e.allDay ? '' : ', ' + C.hm(x.e.start))));
      })) : null,
      st.nextTasks.length ? h('div', { class: 'mute small', style: 'margin-top:6px' }, 'Задачи со сроком: ' + st.nextTasks.map(function (t) { return t.title; }).join(', ')) : null,
      h('div', { class: 'dlg-actions', style: 'flex-wrap:wrap;margin-top:14px' },
        h('button', { type: 'button', class: 'btn', onclick: function () { writeObsidian(); } }, 'Записать расписание в Obsidian'),
        h('span', { class: 'grow' }),
        h('button', { type: 'button', class: 'btn primary', onclick: close }, 'Закрыть'))
    ].filter(Boolean);
    dlg.append.apply(dlg, kids);
    dlg.addEventListener('cancel', function () { setTimeout(function () { dlg.remove(); }, 0); });
    document.body.append(dlg);
    dlg.showModal();
  }

  /* ---------- заметка «Неделя» в Obsidian ---------- */
  function weekNoteText() {
    var ws = startOfWeek(new Date()), n = new Date(), lines = ['# Расписание', '', 'Обновлено из календаря: ' + C.ymd(n) + ' ' + pad(n.getHours()) + ':' + pad(n.getMinutes()), ''];
    [0, 7].forEach(function (shift) {
      var w0 = C.addDays(ws, shift);
      lines.push('## ' + (shift ? 'Следующая неделя' : 'Эта неделя') + ', ' + rangeLabel(w0), '');
      for (var i = 0; i < 7; i++) {
        var d = C.addDays(w0, i), key = C.ymd(d), es = C.eventsOn(key);
        lines.push('### ' + FULL[d.getDay()].charAt(0).toUpperCase() + FULL[d.getDay()].slice(1) + ', ' + d.getDate() + ' ' + C.MON_GEN[d.getMonth()]);
        if (!es.length) lines.push('- —');
        es.forEach(function (e) {
          var t = e.allDay ? 'весь день' : C.hm(e.start) + '–' + C.hm(e.end), extra = [];
          if (e.place) extra.push(e.place);
          if (e.travel && !e.allDay) extra.push('выйти в ' + C.hm(Math.max(0, e.start - e.travel)));
          lines.push('- ' + (C.isKey(e) ? '⚑ ' : '') + t + ' · ' + e.title + (extra.length ? ' (' + extra.join(', ') + ')' : '') + (e.obs ? ' [[' + e.obs + ']]' : ''));
        });
        lines.push('');
      }
    });
    var open = S().tasks.filter(function (t) { return !t.done; });
    lines.push('## Задачи', '');
    if (!open.length) lines.push('- —');
    open.sort(function (a, b) { return String(a.due || '9').localeCompare(String(b.due || '9')); }).forEach(function (t) {
      lines.push('- [ ] ' + t.title + (t.due ? ' · до ' + t.due : '') + (t.dur ? ' · ' + t.dur + ' мин' : ''));
    });
    lines.push('', '## Привычки', '');
    S().habits.forEach(function (hb) { lines.push('- ' + hb.title + (typeof hb.at === 'number' ? ' (' + C.hm(hb.at) + ')' : '') + ': серия ' + streak(hb.id)); });
    if (!S().habits.length) lines.push('- —');
    return lines.join('\n') + '\n';
  }
  function writeObsidian() {
    var file = (S().settings.obsWeekNote || 'Календарь/Неделя').replace(/^\/+|\/+$/g, ''), text = weekNoteText();
    function viaContent() { C.go(C.obsUri('new', { file: file, content: text, overwrite: 'true' })); C.toast('Открываю Obsidian: заметка «' + file + '» обновится.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {       // через буфер обмена: нет ограничения на длину ссылки
      navigator.clipboard.writeText(text).then(function () {
        C.go(C.obsUri('new', { file: file, clipboard: 'true', overwrite: 'true' }));
        C.toast('Открываю Obsidian: заметка «' + file + '» обновится. Буфер обмена теперь содержит это расписание.');
      }, viaContent);
    } else viaContent();
  }

  /* ---------- вызов, настройки, воскресенье ---------- */
  var tile0 = document.getElementById('openReview');
  if (tile0) tile0.addEventListener('click', function () { var side = document.getElementById('side'); if (side) side.classList.remove('open'); document.getElementById('app').classList.remove('menu'); openReview(); });

  C.extra.push(function () {
    var chk = h('input', { type: 'checkbox', checked: S().settings.weekReview !== false, onchange: function () { S().settings.weekReview = chk.checked; C.save(); } });
    var inp = h('input', { type: 'text', value: S().settings.obsWeekNote || '', placeholder: 'Календарь/Неделя', style: 'width:100%', onchange: function () { S().settings.obsWeekNote = inp.value.trim() || undefined; C.save(); } });
    return h('div', { class: 'set-sec' }, h('h3', null, 'Итоги недели'),
      h('label', { class: 'check' }, chk, 'В воскресенье после 12:00 показывать итоги недели'),
      h('label', { class: 'field', style: 'margin-top:8px' }, 'Заметка с расписанием в Obsidian (путь внутри хранилища)', inp));
  });

  function maybeAuto() {
    var n = new Date();
    if (n.getDay() !== 0 || n.getHours() < 12 || S().settings.weekReview === false) return;
    var key = C.ymd(startOfWeek(n));
    if (S().settings.reviewShown === key || document.querySelector('dialog[open]')) return;
    S().settings.reviewShown = key; C.save();
    openReview();
  }
  setTimeout(maybeAuto, 5000);

  window.CalReview = { open: openReview, stats: stats, weekNote: weekNoteText };
})();
