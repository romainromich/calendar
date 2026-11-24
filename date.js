/* Свой календарик вместо системного окна выбора даты — в стиле остальных всплывающих окон.
   Поле остаётся <input>: для кода его value по-прежнему «ГГГГ-ММ-ДД», а человек видит «24.11.2026». */
(function () {
  'use strict';
  var T = window.CalTime;
  if (!T || !T.popover) return;                            // без всплывающих окон остаётся системный выбор
  var C = window.Cal;
  var MON = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  var MON_S = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  var DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  var proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromIso(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function human(s) { var d = fromIso(s); return d ? pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() : ''; }
  function fire(inp) {
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function weekStart() { return C && C.S && C.S.settings.weekStart === 0 ? 0 : 1; }

  /* системное поле даты → текстовое, которое показывает «ДД.ММ.ГГГГ», а коду отдаёт «ГГГГ-ММ-ДД» */
  function enhance(inp) {
    if (!inp || inp.dataset.dpick) return;
    var val = inp.value || inp.getAttribute('value') || '';
    inp.dataset.dpick = '1';
    inp.type = 'text';
    inp.readOnly = true;
    inp.setAttribute('inputmode', 'none');
    inp.placeholder = 'дд.мм.гггг';
    inp.classList.add('dpick');
    Object.defineProperty(inp, 'value', {
      configurable: true,
      get: function () { return val; },
      set: function (v) { val = fromIso(String(v || '')) ? String(v) : ''; proto.set.call(inp, human(val)); }
    });
    inp.value = val;
  }

  function open(inp) {
    if (T.isOpen(inp)) { T.popover(inp, 'dp-pop').close(); return; }
    var sel = fromIso(inp.value), today = new Date();
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var view = new Date((sel || today).getFullYear(), (sel || today).getMonth(), 1);
    var focus = sel || today, mode = 'days';
    var min = fromIso(inp.getAttribute('min')), max = fromIso(inp.getAttribute('max'));
    var p = T.popover(inp, 'dp-pop'), el = p.el;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Выбор даты');

    function btn(cls, text, on, label) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = cls; b.textContent = text;
      if (label) b.setAttribute('aria-label', label);
      b.addEventListener('click', on);
      return b;
    }
    function off(d) { return (min && d < min) || (max && d > max); }
    function pick(d) {
      if (off(d)) return;
      inp.value = iso(d);
      fire(inp);
      p.close();
      inp.focus({ preventScroll: true });
    }
    function paint() {
      el.replaceChildren();
      var head = document.createElement('div');
      head.className = 'dp-head';
      var title = btn('dp-title', mode === 'days' ? MON[view.getMonth()] + ' ' + view.getFullYear() : String(view.getFullYear()), function () { mode = mode === 'days' ? 'months' : 'days'; paint(); },
        mode === 'days' ? 'Выбрать месяц и год' : 'Вернуться к дням');
      title.append(Object.assign(document.createElement('span'), { className: 'dp-caret', textContent: mode === 'days' ? '▾' : '▴' }));
      var step = function (d) { return function () { if (mode === 'days') view = new Date(view.getFullYear(), view.getMonth() + d, 1); else view = new Date(view.getFullYear() + d, view.getMonth(), 1); paint(); }; };
      head.append(title, btn('dp-nav', '‹', step(-1), mode === 'days' ? 'Предыдущий месяц' : 'Предыдущий год'), btn('dp-nav', '›', step(1), mode === 'days' ? 'Следующий месяц' : 'Следующий год'));
      el.append(head);

      if (mode === 'months') {
        var mg = document.createElement('div');
        mg.className = 'dp-months';
        MON_S.forEach(function (m, i) {
          var b = btn('dp-m', m, function () { view = new Date(view.getFullYear(), i, 1); mode = 'days'; paint(); });
          if (sel && sel.getFullYear() === view.getFullYear() && sel.getMonth() === i) b.classList.add('on');
          if (today.getFullYear() === view.getFullYear() && today.getMonth() === i) b.classList.add('now');
          mg.append(b);
        });
        el.append(mg);
      } else {
        var grid = document.createElement('div');
        grid.className = 'dp-grid';
        grid.setAttribute('role', 'grid');
        var ws = weekStart();
        for (var k = 0; k < 7; k++) grid.append(Object.assign(document.createElement('div'), { className: 'dp-dow', textContent: DOW[(ws + k) % 7] }));
        var first = new Date(view.getFullYear(), view.getMonth(), 1), lead = (first.getDay() - ws + 7) % 7;
        var d = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
        for (var n = 0; n < 42; n++, d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
          (function (day) {
            var b = btn('dp-d', String(day.getDate()), function () { pick(day); }, day.getDate() + ' ' + MON[day.getMonth()].toLowerCase() + ' ' + day.getFullYear());
            if (day.getMonth() !== view.getMonth()) b.classList.add('out');
            if (+day === +today) b.classList.add('now');
            if (sel && +day === +sel) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
            if (+day === +focus) b.classList.add('focus');
            if (off(day)) b.disabled = true;
            b.tabIndex = -1;
            grid.append(b);
          })(d);
        }
        el.append(grid);
      }
      var foot = document.createElement('div');
      foot.className = 'dp-foot';
      if (!inp.required) foot.append(btn('dp-link', 'Очистить', function () { inp.value = ''; fire(inp); p.close(); inp.focus({ preventScroll: true }); }));
      foot.append(Object.assign(document.createElement('span'), { className: 'grow' }), btn('dp-link', 'Сегодня', function () { pick(today); }));
      el.append(foot);
    }
    function moveFocus(days, months) {
      focus = months ? new Date(focus.getFullYear(), focus.getMonth() + months, Math.min(focus.getDate(), 28)) : new Date(focus.getFullYear(), focus.getMonth(), focus.getDate() + days);
      if (focus.getMonth() !== view.getMonth() || focus.getFullYear() !== view.getFullYear()) view = new Date(focus.getFullYear(), focus.getMonth(), 1);
      paint();
    }
    el.addEventListener('keydown', function (e) {
      var k = e.key;
      if (k === 'Escape') { p.close(); inp.focus({ preventScroll: true }); }
      else if (mode !== 'days') return;
      else if (k === 'ArrowLeft') moveFocus(-1);
      else if (k === 'ArrowRight') moveFocus(1);
      else if (k === 'ArrowUp') moveFocus(-7);
      else if (k === 'ArrowDown') moveFocus(7);
      else if (k === 'PageUp') moveFocus(0, -1);
      else if (k === 'PageDown') moveFocus(0, 1);
      else if (k === 'Home') moveFocus(-((focus.getDay() - weekStart() + 7) % 7));
      else if (k === 'End') moveFocus(6 - ((focus.getDay() - weekStart() + 7) % 7));
      else if (k === 'Enter' || k === ' ') { if (e.target.closest && e.target.closest('.dp-head,.dp-foot')) return; pick(focus); }
      else return;
      e.preventDefault(); e.stopPropagation();
    });
    paint();
    T.place(el, inp);
    el.focus({ preventScroll: true });
  }

  document.addEventListener('click', function (e) {
    var inp = e.target.closest && e.target.closest('input[data-dpick]');
    if (inp && !inp.disabled) open(inp);
  });
  document.addEventListener('keydown', function (e) {
    var inp = e.target;
    if (!inp.dataset || !inp.dataset.dpick || T.isOpen(inp)) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'F4') { e.preventDefault(); open(inp); }
    else if ((e.key === 'Backspace' || e.key === 'Delete') && !inp.required) { inp.value = ''; fire(inp); }
  }, true);

  // все поля даты — и те, что уже есть, и те, что появятся (настройки, импорт)
  function scan(root) {
    if (root.matches && root.matches('input[type=date]')) enhance(root);
    if (root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll('input[type=date]'), enhance);
  }
  scan(document);
  new MutationObserver(function (list) {
    list.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) scan(n); }); });
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.CalDate = { open: open, enhance: enhance };
})();
