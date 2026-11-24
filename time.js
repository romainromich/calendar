/* Выбор времени без системных окон.
   — Время пары и события (начало, конец, таблица импорта) — барабан как на iPhone: часы и минуты.
   — Время привычки — такой же выпадающий список, как «+ время» у задач.
   Поле остаётся обычным <input> со значением «ЧЧ:ММ», поэтому остальной код не меняется. */
(function () {
  'use strict';
  if (!HTMLElement.prototype.showPopover) return;          // без Popover API остаются системные поля
  var ITEM = 36, VIS = 5;                                   // высота строки барабана и сколько строк видно
  var cur = null;                                           // открытое окно { el, close }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parse(v) { var m = /^(\d{1,2})[:.](\d{2})/.exec(String(v || '')); return m ? (+m[1] % 24) * 60 + Math.min(59, +m[2]) : null; }
  function fmt(min) { return pad(Math.floor(min / 60) % 24) + ':' + pad(min % 60); }
  function fire(inp) {
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function labelOf(el) {
    var l = el.closest('label');
    if (l) { for (var n = l.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.textContent.trim()) return n.textContent.trim(); }
    return el.getAttribute('aria-label') || '';
  }

  /* общее всплывающее окно: поверх всего, внутри открытого диалога, если он есть */
  function popover(anchor, cls, onClose) {
    if (cur) cur.close();
    var el = document.createElement('div');
    el.className = cls;
    el.setAttribute('popover', 'manual');
    el.tabIndex = -1;
    (anchor.closest('dialog[open]') || document.body).append(el);
    function outside(e) { if (!el.contains(e.target) && e.target !== anchor) close(); }
    function scroll(e) { if (!el.contains(e.target)) close(); }
    function close() {
      if (!el.isConnected) return;
      try { el.hidePopover(); } catch (e) { /* уже скрыто */ }
      el.remove();
      document.removeEventListener('pointerdown', outside, true);
      removeEventListener('scroll', scroll, true);
      removeEventListener('resize', close);
      if (cur && cur.el === el) cur = null;
      if (onClose) onClose();
    }
    setTimeout(function () {
      document.addEventListener('pointerdown', outside, true);
      addEventListener('scroll', scroll, true);
      addEventListener('resize', close);
    }, 0);
    cur = { el: el, close: close, anchor: anchor };
    return cur;
  }
  function place(el, anchor) {
    el.showPopover();
    var r = anchor.getBoundingClientRect(), ph = el.offsetHeight, pw = el.offsetWidth;
    var below = innerHeight - r.bottom - 8, up = ph > below && r.top - 8 > below;
    el.style.top = Math.round(Math.max(8, up ? r.top - ph - 4 : Math.min(r.bottom + 4, innerHeight - ph - 8))) + 'px';
    el.style.left = Math.round(Math.max(8, Math.min(r.left, innerWidth - pw - 8))) + 'px';
  }

  /* ---------- барабан ---------- */
  function wheel(inp) {
    var start = parse(inp.value), had = inp.value;
    var base = start == null ? Math.min(23 * 60 + 55, Math.ceil((new Date().getHours() * 60 + new Date().getMinutes()) / 5) * 5) : start;
    var hours = [], mins = [];
    for (var i = 0; i < 24; i++) hours.push(i);
    for (var j = 0; j < 60; j += 5) mins.push(j);
    if (mins.indexOf(base % 60) < 0) { mins.push(base % 60); mins.sort(function (a, b) { return a - b; }); }   // 10:22 из расписания не теряем
    var val = { h: Math.floor(base / 60), m: base % 60 }, done = false;
    var p = popover(inp, 'tw-pop', function () { if (!done) inp.focus({ preventScroll: true }); });
    var el = p.el;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Выбор времени' + (labelOf(inp) ? ': ' + labelOf(inp) : ''));

    function col(list, key, aria) {
      var c = document.createElement('div');
      c.className = 'tw-col';
      c.tabIndex = 0;
      c.setAttribute('role', 'listbox');
      c.setAttribute('aria-label', aria);
      var pre = document.createElement('div'); pre.style.height = ITEM * ((VIS - 1) / 2) + 'px';
      c.append(pre);
      list.forEach(function (v, k) {
        var it = document.createElement('div');
        it.className = 'tw-item';
        it.setAttribute('role', 'option');
        it.textContent = pad(v);
        it.addEventListener('click', function () { c.scrollTo({ top: k * ITEM, behavior: 'smooth' }); });
        c.append(it);
      });
      var post = pre.cloneNode(); c.append(post);
      var t = null;
      function sync() {
        var k = Math.max(0, Math.min(list.length - 1, Math.round(c.scrollTop / ITEM)));
        Array.prototype.forEach.call(c.querySelectorAll('.tw-item'), function (x, n) { x.classList.toggle('on', n === k); x.setAttribute('aria-selected', n === k ? 'true' : 'false'); });
        if (val[key] !== list[k]) { val[key] = list[k]; apply(); }
      }
      c.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(sync, 60); });
      c.addEventListener('keydown', function (e) {
        var k = Math.round(c.scrollTop / ITEM);
        if (e.key === 'ArrowDown') k++; else if (e.key === 'ArrowUp') k--; else return;
        e.preventDefault();
        c.scrollTo({ top: Math.max(0, Math.min(list.length - 1, k)) * ITEM });
      });
      c._set = function (v) { var k = list.indexOf(v); if (k < 0) k = 0; c.scrollTop = k * ITEM; sync(); };
      return c;
    }
    function apply() { var v = fmt(val.h * 60 + val.m); if (inp.value !== v) { inp.value = v; fire(inp); } }

    var hc = col(hours, 'h', 'Часы'), mc = col(mins, 'm', 'Минуты');
    var cols = document.createElement('div');
    cols.className = 'tw-cols';
    var band = document.createElement('div'); band.className = 'tw-band';
    var sep = document.createElement('div'); sep.className = 'tw-sep'; sep.textContent = ':';
    cols.append(band, hc, sep, mc);
    var head = document.createElement('div');
    head.className = 'tw-head';
    var ttl = document.createElement('span'); ttl.textContent = labelOf(inp) || 'Время';
    var ok = document.createElement('button');
    ok.type = 'button'; ok.className = 'btn primary tw-ok'; ok.textContent = 'Готово';
    ok.addEventListener('click', function () { done = true; p.close(); inp.focus({ preventScroll: true }); });
    head.append(ttl, ok);
    el.append(head, cols);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (inp.value !== had) { inp.value = had; fire(inp); } p.close(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); ok.click(); }
      else if (e.key === 'ArrowRight' && document.activeElement === hc) { e.preventDefault(); mc.focus(); }
      else if (e.key === 'ArrowLeft' && document.activeElement === mc) { e.preventDefault(); hc.focus(); }
    });
    place(el, inp);
    hc._set(val.h); mc._set(val.m);
    if (start == null) apply();                     // пустое поле сразу получает показанное время
    hc.focus({ preventScroll: true });
  }

  /* ---------- список, как у «+ время» ---------- */
  function list(anchor, value, onPick, opts) {
    opts = opts || {};
    var p = popover(anchor, 'csel-pop tl-pop');
    var el = p.el, items = [], active = -1;
    el.setAttribute('role', 'listbox');
    el.setAttribute('aria-label', opts.label || 'Время');
    function add(v, text) {
      var b = document.createElement('div');
      b.className = 'csel-opt';
      b.setAttribute('role', 'option');
      b.textContent = text;
      b.setAttribute('aria-selected', v === value ? 'true' : 'false');
      var i = items.length;
      items.push({ v: v, el: b });
      b.addEventListener('pointerenter', function () { setActive(i); });
      b.addEventListener('click', function () { pick(i); });
      el.append(b);
    }
    function setActive(i, scroll) {
      if (items[active]) items[active].el.classList.remove('active');
      active = Math.max(0, Math.min(items.length - 1, i));
      items[active].el.classList.add('active');
      if (scroll) items[active].el.scrollIntoView({ block: 'center' });
    }
    function pick(i) { var v = items[i].v; p.close(); onPick(v); if (anchor.focus) anchor.focus({ preventScroll: true }); }
    var vals = [];
    for (var m = (opts.from == null ? 5 * 60 : opts.from); m <= (opts.to == null ? 23 * 60 + 45 : opts.to); m += (opts.step || 15)) vals.push(m);
    if (value != null && vals.indexOf(value) < 0) { vals.push(value); vals.sort(function (x, y) { return x - y; }); }   // нестандартное время (7:10) — на своём месте
    add(null, opts.empty || 'Без времени');
    vals.forEach(function (v) { add(v, fmt(v)); });
    el.style.minWidth = Math.max(120, anchor.getBoundingClientRect().width) + 'px';
    el.style.maxHeight = '300px';
    place(el, anchor);
    var now = new Date().getHours() * 60 + new Date().getMinutes(), target = value != null ? value : now, best = 1;
    items.forEach(function (x, n) { if (x.v != null && x.v <= target) best = n; });
    setActive(value === null && opts.highlightEmpty ? 0 : best, true);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') setActive(active + 1, true);
      else if (e.key === 'ArrowUp') setActive(active - 1, true);
      else if (e.key === 'Enter' || e.key === ' ') pick(active);
      else if (e.key === 'Escape') { p.close(); if (anchor.focus) anchor.focus({ preventScroll: true }); }
      else return;
      e.preventDefault(); e.stopPropagation();
    });
    el.focus({ preventScroll: true });
  }

  /* ---------- поля ---------- */
  // превращаем системное поле времени в текстовое «ЧЧ:ММ», которое открывает наш выбор
  function enhance(inp, kind) {
    if (!inp || inp.dataset.tpick) return;
    inp.dataset.tpick = kind;
    if (inp.type === 'time') inp.type = 'text';
    inp.readOnly = true;
    inp.setAttribute('inputmode', 'none');
    if (!inp.placeholder) inp.placeholder = '--:--';
    inp.classList.add('tpick');
  }
  function openFor(inp) {
    if (cur && cur.anchor === inp) { cur.close(); return; }
    if (inp.dataset.tpick === 'list') list(inp, parse(inp.value), function (v) { inp.value = v == null ? '' : fmt(v); fire(inp); }, { label: labelOf(inp) });
    else wheel(inp);
  }
  document.addEventListener('click', function (e) {
    var inp = e.target.closest && e.target.closest('input[data-tpick]');
    if (inp && !inp.disabled) openFor(inp);
  });
  document.addEventListener('keydown', function (e) {
    var inp = e.target;
    if (!inp.dataset || !inp.dataset.tpick || cur) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'F4') { e.preventDefault(); openFor(inp); }
    else if ((e.key === 'Backspace' || e.key === 'Delete') && inp.dataset.tpick === 'list') { inp.value = ''; fire(inp); }
  }, true);

  ['evStart', 'evEnd'].forEach(function (id) { enhance(document.getElementById(id), 'wheel'); });
  enhance(document.getElementById('habitAt'), 'list');

  window.CalTime = { wheel: wheel, list: list, enhance: enhance, parse: parse, fmt: fmt, popover: popover, place: place, isOpen: function (a) { return !!(cur && cur.anchor === a); } };
})();
