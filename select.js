/* Единое выпадающее меню вместо системного списка <select> на компьютере.
   Системный список в Windows рисуется светлым и почти нечитаем в тёмной теме, а в разных
   браузерах выглядит по-разному. Сам <select> остаётся на месте (его вид, значение и события
   не меняются), подменяется только раскрывающийся список. На телефонах остаётся системный
   выбор: он там удобнее. */
(function () {
  'use strict';
  if (!HTMLElement.prototype.showPopover) return;          // без Popover API — системный список
  var fine = window.matchMedia('(pointer: fine)');
  var pop = null, cur = null, items = [], active = -1, typed = '', typedAt = 0;

  function usable(sel) { return sel && sel.tagName === 'SELECT' && !sel.multiple && !(sel.size > 1) && !sel.disabled && !sel.dataset.native && fine.matches; }

  function close(refocus) {
    if (!pop) return;
    try { pop.hidePopover(); } catch (e) { /* уже закрыт */ }
    pop.remove();
    var s = cur;
    pop = null; cur = null; items = []; active = -1;
    removeEventListener('scroll', onScroll, true);
    removeEventListener('resize', onResize);
    document.removeEventListener('pointerdown', onOutside, true);
    if (refocus && s) s.focus();
  }
  function choose(i) {
    var it = items[i], s = cur;
    if (!it || it.disabled) return;
    close(true);
    if (s.selectedIndex !== it.index) {
      s.selectedIndex = it.index;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  function setActive(i, scroll) {
    if (active >= 0 && items[active]) items[active].el.classList.remove('active');
    active = i;
    var it = items[i];
    if (!it) return;
    it.el.classList.add('active');
    pop.setAttribute('aria-activedescendant', it.el.id);
    if (scroll) it.el.scrollIntoView({ block: 'nearest' });
  }
  function move(d) {
    for (var i = active + d; i >= 0 && i < items.length; i += d) if (!items[i].disabled) { setActive(i, true); return; }
  }
  function place() {
    var r = cur.getBoundingClientRect(), vh = innerHeight, vw = innerWidth;
    pop.style.minWidth = Math.round(r.width) + 'px';
    pop.style.maxHeight = '';
    var below = vh - r.bottom - 8, above = r.top - 8, ph = pop.offsetHeight;
    var up = ph > below && above > below;
    var room = Math.max(120, up ? above : below);
    if (ph > room) { pop.style.maxHeight = room + 'px'; ph = room; }
    pop.style.top = Math.round(up ? r.top - ph - 4 : r.bottom + 4) + 'px';
    var left = Math.min(r.left, vw - pop.offsetWidth - 8);
    pop.style.left = Math.round(Math.max(8, left)) + 'px';
  }
  function onScroll(e) { if (pop && !pop.contains(e.target)) close(false); }
  function onResize() { close(false); }
  function onOutside(e) { if (pop && !pop.contains(e.target) && e.target !== cur) close(false); }

  function open(sel) {
    close(false);
    cur = sel;
    pop = document.createElement('div');
    pop.className = 'csel-pop';
    pop.setAttribute('popover', 'manual');
    pop.setAttribute('role', 'listbox');
    pop.tabIndex = -1;
    var label = sel.getAttribute('aria-label') || (sel.closest('label') && sel.closest('label').textContent.trim()) || '';
    if (label) pop.setAttribute('aria-label', label);
    var n = 0;
    Array.prototype.forEach.call(sel.children, function add(node) {
      if (node.tagName === 'OPTGROUP') {
        var g = document.createElement('div');
        g.className = 'csel-group';
        g.textContent = node.label;
        pop.append(g);
        Array.prototype.forEach.call(node.children, add);
        return;
      }
      if (node.tagName !== 'OPTION' || node.hidden) return;
      var b = document.createElement('div');
      b.className = 'csel-opt';
      b.id = 'csel-o' + (n++);
      b.setAttribute('role', 'option');
      b.textContent = node.textContent;
      var on = node.index === sel.selectedIndex;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      if (node.disabled) b.setAttribute('aria-disabled', 'true');
      var i = items.length;
      items.push({ el: b, index: node.index, disabled: node.disabled, text: node.textContent.trim().toLowerCase() });
      b.addEventListener('pointerenter', function () { if (!items[i].disabled) setActive(i, false); });
      b.addEventListener('click', function () { choose(i); });
      pop.append(b);
    });
    if (!items.length) { pop = null; cur = null; return; }
    // внутри открытого окна список должен быть его частью, иначе окно сделает его некликабельным
    (sel.closest('dialog[open]') || document.body).append(pop);
    pop.showPopover();
    place();
    var sIdx = -1;
    items.forEach(function (it, i) { if (it.index === sel.selectedIndex) sIdx = i; });
    if (sIdx < 0) { sIdx = 0; while (sIdx < items.length && items[sIdx].disabled) sIdx++; }
    setActive(sIdx, true);
    pop.focus({ preventScroll: true });
    pop.addEventListener('keydown', onKey);
    addEventListener('scroll', onScroll, true);
    addEventListener('resize', onResize);
    document.addEventListener('pointerdown', onOutside, true);
  }

  function onKey(e) {
    var k = e.key;
    if (k === 'ArrowDown') move(1);
    else if (k === 'ArrowUp') move(-1);
    else if (k === 'Home') { active = -1; move(1); }
    else if (k === 'End') { active = items.length; move(-1); }
    else if (k === 'PageDown') { for (var i = 0; i < 8; i++) move(1); }
    else if (k === 'PageUp') { for (var j = 0; j < 8; j++) move(-1); }
    else if (k === 'Enter' || k === ' ') choose(active);
    else if (k === 'Escape') close(true);
    else if (k === 'Tab') { close(true); return; }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // поиск по первым буквам, как в системном списке
      var now = Date.now();
      typed = (now - typedAt < 700 ? typed : '') + k.toLowerCase();
      typedAt = now;
      for (var a = 0; a < items.length; a++) {
        var i2 = (active + (typed.length > 1 ? 0 : 1) + a) % items.length;
        if (!items[i2].disabled && items[i2].text.indexOf(typed) === 0) { setActive(i2, true); break; }
      }
    } else return;
    e.preventDefault();
    e.stopPropagation();          // Esc закрывает только список, а не окно под ним
  }

  // мышью: вместо системного списка открываем свой
  document.addEventListener('mousedown', function (e) {
    var sel = e.target.closest && e.target.closest('select');
    if (!usable(sel) || e.button !== 0) return;
    e.preventDefault();
    if (cur === sel) { close(true); return; }
    sel.focus({ preventScroll: true });
    open(sel);
  }, true);
  // с клавиатуры: Enter, пробел, Alt+↓, F4 открывают список; стрелки без Alt меняют значение как обычно
  document.addEventListener('keydown', function (e) {
    var sel = e.target;
    if (!usable(sel) || pop) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) {
      e.preventDefault();
      open(sel);
    }
  }, true);

  window.CalSelect = { open: open, close: close };
})();
