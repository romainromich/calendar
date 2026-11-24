/* Фокус на текущем событии: список дня как барабан. Строки в центре чёткие, к краям уменьшаются и тают. */
(function () {
  'use strict';
  var view = document.getElementById('view'), title = document.getElementById('title');
  if (!view) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fadeT = document.createElement('div'), fadeB = document.createElement('div');
  fadeT.id = 'fadeTop'; fadeB.id = 'fadeBot';
  fadeT.setAttribute('aria-hidden', 'true'); fadeB.setAttribute('aria-hidden', 'true');
  (document.getElementById('app') || document.body).append(fadeT, fadeB);

  var raf = 0, lastKey = '', had = false;

  function rows() { return Array.prototype.slice.call(view.querySelectorAll('.tl > .tl-row')); }
  // на компьютере прокручивается сам календарь (#view), на телефоне — страница
  function sc() { var o = getComputedStyle(view).overflowY; return o === 'auto' || o === 'scroll' ? view : null; }
  function box() { var s = sc(); if (!s) return { top: 0, h: window.innerHeight }; var r = s.getBoundingClientRect(); return { top: r.top, h: s.clientHeight }; }
  function focusY() { var b = box(); return b.top + b.h * 0.42; }

  function apply() {
    raf = 0;
    var rs = rows(), on = rs.length > 0;
    document.documentElement.classList.toggle('drum', on);
    if (!on) return;
    var fy = focusY(), span = box().h * 0.46;
    rs.forEach(function (r) {
      var b = r.getBoundingClientRect(), c = b.top + b.height / 2, d = c - fy, t = Math.min(1, Math.abs(d) / span);
      t = t * t * (3 - 2 * t);
      r.style.opacity = (1 - 0.55 * t).toFixed(3);
      r.style.transform = reduce ? '' : 'perspective(650px) rotateX(' + (-Math.sign(d) * 7 * t).toFixed(2) + 'deg) scale(' + (1 - 0.04 * t).toFixed(3) + ') translateZ(0)';
    });
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(apply); }

  function target() {
    var rs = rows();
    return view.querySelector('.tl > .tl-row.now') || rs.filter(function (r) { return !r.classList.contains('past'); })[0] || rs[rs.length - 1];
  }
  function focusNow(smooth) {
    var t = target(); if (!t) return;
    var b = t.getBoundingClientRect(), s = sc(), how = smooth && !reduce ? 'smooth' : 'auto';
    if (s) s.scrollTo({ top: Math.max(0, s.scrollTop + b.top + b.height / 2 - focusY()), behavior: how });
    else window.scrollTo({ top: Math.max(0, window.scrollY + b.top + b.height / 2 - focusY()), behavior: how });
  }

  new MutationObserver(function () {
    var has = rows().length > 0, key = title ? title.textContent : '';
    if (has && (!had || key !== lastKey)) setTimeout(function () { focusNow(had); schedule(); }, 60);
    had = has; lastKey = key; schedule();
  }).observe(view, { childList: true, subtree: true });
  window.addEventListener('scroll', schedule, { passive: true });
  view.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  window.CalFocus = { focusNow: function () { focusNow(true); } };
  setTimeout(function () {
    if (rows().length) { had = true; lastKey = title ? title.textContent : ''; focusNow(false); }
    schedule();
  }, 150);
})();
