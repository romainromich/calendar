/* Резервная копия: файл, перенос между устройствами, автокопии на устройстве, защита от автоочистки */
(function () {
  'use strict';
  var C = window.Cal;
  if (!C) return;
  var h = C.h;
  var SNAP_KEY = 'calendar.snaps', MAX_SNAPS = 6, FILE_TYPE = 'application/json';
  var DEVICE_KEYS = ['pushOn', 'pushUrl', 'lastBackup', 'lastRemind'];   // относятся к устройству, в файл не попадают
  var statusEl = null;

  function S() { return C.S; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function stamp(t) { var d = new Date(t); return C.ymd(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function ago(t) {
    var d = Math.floor((Date.now() - t) / 86400000);
    return d <= 0 ? 'сегодня' : d === 1 ? 'вчера' : d + ' дн. назад';
  }
  function words(n, a) { var m = n % 100, k = n % 10; return a[(m > 10 && m < 20) ? 2 : k === 1 ? 0 : (k > 1 && k < 5) ? 1 : 2]; }

  /* ---------- упаковка и разбор ---------- */
  function pack(st) {
    var s = Object.assign({}, st.settings);
    DEVICE_KEYS.forEach(function (k) { delete s[k]; });
    return JSON.parse(JSON.stringify({ settings: s, cats: st.cats, events: st.events, tasks: st.tasks, habits: st.habits, log: st.log, hidden: st.hidden }));
  }
  function parse(text) {
    var raw = JSON.parse(text);
    var data = raw && raw.app === 'calendar' && raw.data ? raw.data : raw;       // старые копии лежат без обёртки
    if (!data || typeof data !== 'object' || !Array.isArray(data.events)) throw new Error('bad');
    return { at: raw.exportedAt ? Date.parse(raw.exportedAt) : 0, data: data };
  }
  function counts(d) {
    return { events: (d.events || []).length, tasks: (d.tasks || []).length, habits: (d.habits || []).length };
  }
  function normEv(e) { e.rep = C.normRep(e.rep); if (!e.ex) e.ex = []; return e; }

  /* ---------- копии на устройстве ---------- */
  function readSnaps() { try { return JSON.parse(localStorage.getItem(SNAP_KEY)) || []; } catch (e) { return []; } }
  function writeSnaps(list) {
    while (list.length) {
      try { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); return true; }
      catch (e) { list.shift(); }                                               // не хватает места — выбрасываем самую старую
    }
    return false;
  }
  function snapshot(label) {
    var c = counts(S());
    if (!c.events && !c.tasks && !c.habits) return null;
    var list = readSnaps(), snap = { t: Date.now(), label: label || 'копия', data: pack(S()) };
    list.push(snap);
    writeSnaps(list.slice(-MAX_SNAPS));
    return snap;
  }
  function autoSnap() {
    var list = readSnaps(), last = list.filter(function (x) { return x.label === 'авто'; }).pop();
    if (last && C.ymd(new Date(last.t)) === C.ymd(new Date())) return;
    snapshot('авто');
  }

  /* ---------- применение данных ---------- */
  function apply(d, mode) {
    var s = S(), added = null;
    if (mode === 'replace') {
      var keep = {};
      DEVICE_KEYS.forEach(function (k) { keep[k] = s.settings[k]; });
      s.settings = Object.assign(s.settings, d.settings || {}, keep);
      s.settings.colors = Object.assign({}, s.settings.colors, (d.settings || {}).colors || {});
      s.settings.design = 2;
      if (Array.isArray(d.cats) && d.cats.length) s.cats = d.cats;
      s.events = (d.events || []).map(normEv); s.tasks = d.tasks || []; s.habits = d.habits || [];
      s.log = d.log || {}; s.hidden = d.hidden || {};
    } else {
      added = { events: 0, tasks: 0, habits: 0 };
      var have = {};
      s.events.forEach(function (e) { have[e.id] = 1; if (e.gid) have['g:' + e.gid] = 1; });
      (d.events || []).forEach(function (e) {
        if (have[e.id] || (e.gid && have['g:' + e.gid])) return;
        s.events.push(normEv(e)); added.events++;
      });
      ['tasks', 'habits'].forEach(function (k) {
        var ids = {}; s[k].forEach(function (x) { ids[x.id] = 1; });
        (d[k] || []).forEach(function (x) { if (!ids[x.id]) { s[k].push(x); added[k]++; } });
      });
      var cids = {}; s.cats.forEach(function (c) { cids[c.id] = 1; });
      (d.cats || []).forEach(function (c) { if (!cids[c.id]) s.cats.push(c); });
      Object.keys(d.log || {}).forEach(function (k) {
        var a = s.log[k] || (s.log[k] = []);
        (d.log[k] || []).forEach(function (x) { if (a.indexOf(x) < 0) a.push(x); });
      });
    }
    C.save(); C.render();
    return added;
  }
  function undoToast(msg, snap) {
    var t = C.toast(msg, { ms: 15000 });
    if (snap) t.querySelector('.grow').append(h('button', { type: 'button', class: 'btn', style: 'margin-top:8px', onclick: function () { apply(snap.data, 'replace'); t.remove(); C.toast('Вернул данные, как были.'); refreshAll(); } }, 'Отменить'));
  }

  /* ---------- файл ---------- */
  function makeFile() {
    var d = new Date();
    return {
      json: JSON.stringify({ app: 'calendar', v: 2, exportedAt: d.toISOString(), data: pack(S()) }, null, 2),
      name: 'calendar-' + C.ymd(d) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.json'
    };
  }
  function markBackup() { S().settings.lastBackup = Date.now(); C.save(); renderStatus(); }
  function download() {
    var f = makeFile(), url = URL.createObjectURL(new Blob([f.json], { type: FILE_TYPE }));
    var a = h('a', { href: url, download: f.name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    markBackup();
    C.toast('Файл ' + f.name + ' сохранён. Лучше положить его в облако или отправить себе.');
  }
  function canShare() {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['{}'], 'c.json', { type: FILE_TYPE })] })); } catch (e) { return false; }
  }
  function share() {
    var f = makeFile(), file = new File([f.json], f.name, { type: FILE_TYPE });
    navigator.share({ files: [file], title: 'Копия календаря' }).then(markBackup).catch(function (e) { if (!e || e.name !== 'AbortError') download(); });
  }

  /* ---------- импорт ---------- */
  var input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  document.body.append(input);
  input.addEventListener('change', function () {
    var f = input.files[0]; input.value = '';
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var p;
      try { p = parse(r.result); } catch (e) { C.toast('Не удалось прочитать файл: это не копия календаря.'); return; }
      askImport(p);
    };
    r.readAsText(f);
  });
  function line(label, c) {
    return h('div', { style: 'display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid var(--line)' },
      h('span', { class: 'mute' }, label),
      h('b', null, c.events + ' ' + words(c.events, ['событие', 'события', 'событий']) + ', ' + c.tasks + ' ' + words(c.tasks, ['задача', 'задачи', 'задач']) + ', ' + c.habits + ' ' + words(c.habits, ['привычка', 'привычки', 'привычек'])));
  }
  function askImport(p) {
    var dlg = h('dialog', null);
    function close() { dlg.close(); dlg.remove(); }
    function run(mode) {
      var snap = snapshot('перед импортом');
      var added = apply(p.data, mode);
      close(); refreshAll();
      undoToast(mode === 'replace' ? 'Данные заменены на копию.' :
        'Добавлено: ' + added.events + ' ' + words(added.events, ['событие', 'события', 'событий']) + ', ' + added.tasks + ' ' + words(added.tasks, ['задача', 'задачи', 'задач']) + ', ' + added.habits + ' ' + words(added.habits, ['привычка', 'привычки', 'привычек']) + '.', snap);
    }
    dlg.append(
      h('h2', null, 'Загрузить копию'),
      h('div', { style: 'margin-bottom:12px' },
        line('В файле' + (p.at ? ' (от ' + stamp(p.at) + ')' : ''), counts(p.data)),
        line('Сейчас в приложении', counts(S()))),
      h('p', { class: 'mute small', style: 'margin-top:0' }, '«Добавить» оставит всё, что есть сейчас, и подложит из файла только то, чего не хватает. «Заменить» поставит данные и вид из файла. Перед любым вариантом я сохраню текущие данные, их можно вернуть кнопкой «Отменить».'),
      h('div', { class: 'dlg-actions', style: 'flex-wrap:wrap' },
        h('button', { type: 'button', class: 'btn primary', onclick: function () { run('merge'); } }, 'Добавить к текущим'),
        h('button', { type: 'button', class: 'btn', onclick: function () { run('replace'); } }, 'Заменить всё'),
        h('button', { type: 'button', class: 'btn', onclick: close }, 'Отмена')));
    dlg.addEventListener('cancel', function () { setTimeout(function () { dlg.remove(); }, 0); });
    document.body.append(dlg);
    dlg.showModal();
  }

  /* ---------- защита от автоочистки ---------- */
  function persisted() { return navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null); }
  function askPersist() { return navigator.storage && navigator.storage.persist ? navigator.storage.persist() : Promise.resolve(false); }

  /* ---------- раздел в настройках ---------- */
  var persistEl = null, snapBox = null;
  function renderStatus() {
    if (!statusEl) return;
    var t = S().settings.lastBackup;
    statusEl.textContent = t ? 'Последняя копия в файл: ' + stamp(t) + ' (' + ago(t) + ').' : 'В файл копию ещё не сохраняли.';
  }
  function renderPersist() {
    if (!persistEl) return;
    persisted().then(function (ok) {
      persistEl.replaceChildren(ok === null ? 'Браузер не сообщает о защите хранилища.' :
        ok ? 'Хранилище защищено: браузер не будет стирать данные сам.' : 'Хранилище не защищено: при нехватке места браузер может стереть данные. Установка на главный экран обычно включает защиту.',
        ok === false ? h('button', { type: 'button', class: 'btn', style: 'margin-left:8px', onclick: function () { askPersist().then(function (g) { C.toast(g ? 'Защита включена.' : 'Браузер пока не дал защиту. Попробуйте после установки на главный экран.'); renderPersist(); }); } }, 'Запросить защиту') : null);
    });
  }
  function renderSnaps() {
    if (!snapBox) return;
    var list = readSnaps().slice().reverse();
    snapBox.replaceChildren(list.length ? h('div', null, list.map(function (sn) {
      var c = counts(sn.data);
      return h('div', { style: 'display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid var(--line)' },
        h('div', { style: 'flex:1;min-width:0' }, h('div', null, stamp(sn.t) + ' · ' + sn.label), h('div', { class: 'mute small' }, c.events + ' соб., ' + c.tasks + ' задач, ' + c.habits + ' привычек')),
        h('button', { type: 'button', class: 'btn', onclick: function () {
          if (!confirm('Вернуть данные к копии от ' + stamp(sn.t) + '? Текущие данные я сохраню отдельной копией.')) return;
          var before = snapshot('перед откатом');
          apply(sn.data, 'replace'); refreshAll(); undoToast('Данные возвращены к копии от ' + stamp(sn.t) + '.', before);
        } }, 'Вернуть'));
    })) : h('div', { class: 'mute small' }, 'Пока нет. Первая появится сама.'));
  }
  function refreshAll() { renderStatus(); renderPersist(); renderSnaps(); }

  C.extra.push(function () {
    statusEl = h('p', { class: 'small', style: 'margin:0 0 8px' });
    persistEl = h('p', { class: 'mute small', style: 'margin:8px 0' });
    snapBox = h('div');
    var btns = h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' },
      h('button', { type: 'button', class: 'btn primary', onclick: download }, 'Сохранить копию в файл'),
      canShare() ? h('button', { type: 'button', class: 'btn', onclick: share }, 'Отправить…') : null,
      h('button', { type: 'button', class: 'btn', onclick: function () { input.click(); } }, 'Загрузить из файла'));
    var sec = h('div', { class: 'set-sec' }, h('h3', null, 'Резервная копия и перенос'),
      h('p', { class: 'mute small', style: 'margin-top:0' }, 'Файл содержит события, задачи, привычки, календари и внешний вид. Так можно перенести всё на другой телефон или компьютер. Вход в Google и уведомления на каждом устройстве настраиваются отдельно.'),
      statusEl, btns, persistEl,
      h('details', { style: 'margin-top:8px' }, h('summary', null, 'Автокопии на этом устройстве'),
        h('p', { class: 'mute small' }, 'Раз в день я сохраняю копию в браузере (последние ' + MAX_SNAPS + '). Она спасает от случайного удаления, но не от очистки данных сайта: для этого нужен файл.'), snapBox));
    refreshAll();
    return sec;
  });

  /* ---------- напоминание о копии ---------- */
  function remind() {
    var s = S().settings, c = counts(S());
    if (c.events + c.tasks < 5) return;
    var last = s.lastBackup || 0, asked = s.lastRemind || 0, day = 86400000;
    if (Date.now() - Math.max(last, 0) < 21 * day || Date.now() - asked < 7 * day) return;
    s.lastRemind = Date.now(); C.save();
    var t = C.toast(last ? 'Копию в файл давно не сохраняли.' : 'Копию в файл ещё не сохраняли, а данные лежат только в браузере.', { title: 'Резервная копия', ms: 20000 });
    t.querySelector('.grow').append(h('button', { type: 'button', class: 'btn primary', style: 'margin-top:8px', onclick: function () { t.remove(); download(); } }, 'Сохранить сейчас'));
  }

  window.CalBackup = { snapshot: snapshot, download: download };
  setTimeout(function () { try { askPersist(); autoSnap(); remind(); } catch (e) { /* копии не критичны */ } }, 4000);
})();
