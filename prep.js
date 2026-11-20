/* Подготовка к ключевым событиям: два плана блоков в свободных окнах, ставятся после подтверждения */
(function () {
  'use strict';
  var C = window.Cal;
  if (!C) return;
  var h = C.h;
  var DAY_FROM = 9 * 60, DAY_TO = 21 * 60, EVENING = 14 * 60, BUF = 10;

  function S() { return C.S; }
  function words(n, a) { var m = n % 100, k = n % 10; return a[(m > 10 && m < 20) ? 2 : k === 1 ? 0 : (k > 1 && k < 5) ? 1 : 2]; }
  function dur(min) {
    var hh = Math.floor(min / 60), mm = min % 60;
    return (hh ? hh + ' ч' : '') + (hh && mm ? ' ' : '') + (mm ? mm + ' мин' : '');
  }
  function defaultHours(title) { return /экзамен|коллок|зач[её]т|защит/i.test(title) ? 8 : 3; }

  /* свободные окна дня: [start,end] в минутах, с отступами вокруг занятых событий */
  function freeWindows(key, from) {
    var lo = Math.max(DAY_FROM, from || 0), busy = [];
    C.eventsOn(key, true).forEach(function (e) {
      if (e.allDay) return;
      busy.push([Math.max(0, e.start - BUF), Math.min(24 * 60, e.end + BUF)]);
    });
    busy.sort(function (a, b) { return a[0] - b[0]; });
    var out = [], cur = lo;
    busy.forEach(function (b) {
      if (b[0] > cur) out.push([cur, Math.min(b[0], DAY_TO)]);
      cur = Math.max(cur, b[1]);
    });
    if (cur < DAY_TO) out.push([cur, DAY_TO]);
    return out.filter(function (w) { return w[1] - w[0] >= 45; });
  }
  function ceil15(m) { return Math.ceil(m / 15) * 15; }

  /* берёт из дня один блок длиной до len (не короче min): сначала окна после 14:00 */
  function pick(key, len, min, from) {
    var cands = freeWindows(key, from).map(function (w) { return [ceil15(w[0]), w[1]]; }).filter(function (w) { return w[1] - w[0] >= min; });
    if (!cands.length) return null;
    cands.sort(function (a, b) {
      var ea = a[0] >= EVENING ? 0 : 1, eb = b[0] >= EVENING ? 0 : 1;
      return ea - eb || (ea ? b[1] - b[0] - (a[1] - a[0]) : a[0] - b[0]);
    });
    var w = cands[0], l = Math.min(len, w[1] - w[0]);
    return { date: key, start: w[0], end: w[0] + l };
  }

  function daysBetween(target, back) {
    var t = C.ymd(new Date()), list = [], i, k;
    for (i = 1; i <= back; i++) {
      k = C.shiftDate(target, -i);
      if (k < t) break;
      list.unshift(k);
    }
    return list;
  }
  function nowFrom(key) {
    if (key !== C.ymd(new Date())) return 0;
    var n = new Date();
    return ceil15(n.getHours() * 60 + n.getMinutes() + 30);
  }

  /* план А: ровно, блоки по 1,5 ч, по одному в день */
  function planEven(target, total) {
    var days = daysBetween(target, 14), slots = [], need = Math.max(1, Math.round(total / 90)), len = Math.min(120, ceil15(total / need)), res = [], left = total;
    days.forEach(function (d) { var b = pick(d, len, 60, nowFrom(d)); if (b) slots.push(b); });
    var use = slots;
    if (slots.length > need) {
      use = [];
      for (var i = 0; i < need; i++) use.push(slots[need === 1 ? slots.length - 1 : Math.round(i * (slots.length - 1) / (need - 1))]);
    }
    use.forEach(function (b) {
      var l = Math.min(b.end - b.start, left);
      if (l < 30) return;
      res.push({ date: b.date, start: b.start, end: b.start + l }); left -= l;
    });
    return res;
  }
  /* план Б: плотно, блоки до 2,5 ч, до двух в день, ближе к сроку */
  function planDense(target, total) {
    var days = daysBetween(target, 7).reverse(), res = [], left = total;
    days.forEach(function (d) {
      var taken = [];
      for (var n = 0; n < 2 && left >= 45; n++) {
        var b = pick(d, Math.min(150, left), 45, nowFrom(d));
        if (!b) break;
        if (taken.length && b.start < taken[0].end + 30 && b.end + 30 > taken[0].start) break;
        res.push(b); taken.push(b); left -= b.end - b.start;
        C.S.events.push({ id: '_tmp', date: d, start: b.start, end: b.end, cat: S().cats[0].id, title: '' });  // временно занимаем окно, чтобы второй блок не наложился
      }
    });
    S().events = S().events.filter(function (e) { return e.id !== '_tmp'; });
    return res.sort(function (a, b) { return a.date.localeCompare(b.date) || a.start - b.start; });
  }
  function dayName(key) { var d = C.parseYmd(key); return C.DOW_SHORT[d.getDay()] + ', ' + d.getDate() + ' ' + C.MON_GEN[d.getMonth()]; }

  function open(occ) {
    var m = occ._m, target = occ.date, tag = m.id + '@' + target;
    var plans = { even: planEven, dense: planDense }, mode = 'even', total = defaultHours(occ.title), blocks = [], off = {};
    var old = S().events.filter(function (e) { return e.prepFor === tag; });
    var dlg = h('dialog', { id: 'prepDialog' });
    var hrs = h('input', { type: 'number', min: '1', max: '40', step: '0.5', value: String(total), style: 'width:90px' });
    var list = h('div'), sum = h('p', { class: 'mute small' });
    var planBox = h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0' });
    var okBtn = h('button', { type: 'button', class: 'btn primary' }, 'Поставить');
    function close() { dlg.close(); dlg.remove(); }

    function calc() {
      var save = S().events;
      S().events = save.filter(function (e) { return e.prepFor !== tag; });     // свои старые блоки окна не занимают
      try { blocks = plans[mode](target, Math.round(total * 60)); } finally { S().events = save; }
      off = {};
      paint();
    }
    function chosen() { return blocks.filter(function (b, i) { return !off[i]; }); }
    function paint() {
      list.replaceChildren.apply(list, blocks.map(function (b, i) {
        var cb = h('input', { type: 'checkbox', checked: true, onchange: function () { off[i] = !cb.checked; paintSum(); } });
        return h('label', { class: 'check', style: 'padding:6px 0;border-top:1px solid var(--line)' }, cb,
          h('span', null, h('b', null, dayName(b.date)), ' · ' + C.hm(b.start) + '–' + C.hm(b.end) + ' ', h('span', { class: 'mute' }, '(' + dur(b.end - b.start) + ')')));
      }));
      if (!blocks.length) list.append(h('div', { class: 'mute' }, 'Свободных окон до события не нашлось.'));
      paintSum();
    }
    function paintSum() {
      var ch = chosen(), min = ch.reduce(function (s, b) { return s + b.end - b.start; }, 0);
      sum.textContent = ch.length ? 'Итого ' + ch.length + ' ' + words(ch.length, ['блок', 'блока', 'блоков']) + ', ' + dur(min) + ' из ' + dur(Math.round(total * 60)) + '.' + (min < Math.round(total * 60) - 20 ? ' Окон на всё не хватило.' : '') : '';
      okBtn.disabled = !ch.length;
    }
    function planCard(key, title, text) {
      var b = h('button', { type: 'button', class: 'btn plancard', style: 'text-align:left;display:block;white-space:normal;height:auto;padding:10px 12px', onclick: function () { mode = key; markPlans(); calc(); } },
        h('b', null, title), h('div', { class: 'mute small', style: 'margin-top:2px' }, text));
      b.dataset.plan = key; return b;
    }
    function markPlans() { Array.prototype.forEach.call(planBox.children, function (b) { b.classList.toggle('on', b.dataset.plan === mode); }); }
    planBox.append(planCard('even', 'Спокойно', 'Блоки по 1,5–2 ч, по одному в день, равномерно за две недели'),
      planCard('dense', 'Плотно', 'До 2,5 ч, до двух блоков в день, в последние 7 дней'));
    hrs.addEventListener('input', function () { var v = parseFloat(hrs.value); if (v > 0) { total = v; calc(); } });
    okBtn.addEventListener('click', function () {
      var ch = chosen(), cats = S().cats, cat = cats.filter(function (c) { return c.id === 'study'; })[0] || C.catById(m.cat), made = [];
      S().events = S().events.filter(function (e) { return e.prepFor !== tag; });
      ch.forEach(function (b) {
        var e = { id: C.uid(), title: 'Подготовка: ' + m.title, date: b.date, start: b.start, end: b.end, cat: cat.id, notes: '', rep: null, ex: [], prepFor: tag };
        if (m.obs) e.obs = m.obs;
        S().events.push(C.mark(e)); made.push(e.id);
      });
      C.save(); C.render(); close();
      var t = C.toast('Поставил ' + ch.length + ' ' + words(ch.length, ['блок', 'блока', 'блоков']) + ' подготовки.', { ms: 15000 });
      t.querySelector('.grow').append(h('button', { type: 'button', class: 'btn', style: 'margin-top:8px', onclick: function () {
        S().events = S().events.filter(function (e) { return made.indexOf(e.id) < 0; }); C.save(); C.render(); t.remove(); C.toast('Блоки убрал.');
      } }, 'Отменить'));
    });
    dlg.append.apply(dlg, [
      h('h2', null, 'Подготовка'),
      h('p', { class: 'mute', style: 'margin:0 0 10px' }, occ.title + ' · ' + dayName(target) + (occ.allDay ? '' : ', ' + C.hm(occ.start))),
      h('label', { class: 'field' }, 'Сколько часов нужно всего', hrs),
      planBox,
      list, sum,
      old.length ? h('p', { class: 'mute small' }, 'Уже стоит ' + old.length + ' ' + words(old.length, ['блок', 'блока', 'блоков']) + ' подготовки к этому событию, они заменятся.') : null,
      h('div', { class: 'dlg-actions', style: 'flex-wrap:wrap' }, h('span', { class: 'grow' }), h('button', { type: 'button', class: 'btn', onclick: close }, 'Отмена'), okBtn)
    ].filter(Boolean));
    dlg.addEventListener('cancel', function () { setTimeout(function () { dlg.remove(); }, 0); });
    document.body.append(dlg);
    markPlans(); calc();
    dlg.showModal();
  }

  window.CalPrep = { open: open, pick: pick, nowFrom: nowFrom, _plans: { even: planEven, dense: planDense } };
})();
