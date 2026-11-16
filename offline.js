/* Офлайн-индикатор: показывает плашку, когда нет сети. Данные лежат на устройстве, приложение работает без интернета. */
(function () {
  'use strict';
  var pill = document.createElement('div');
  pill.id = 'offlinePill';
  pill.setAttribute('role', 'status');
  pill.hidden = true;
  pill.innerHTML = '<i aria-hidden="true"></i><span>Нет сети — работаю офлайн</span>';
  document.body.appendChild(pill);
  var was = navigator.onLine;
  function sync() {
    var on = navigator.onLine;
    pill.hidden = on;
    document.documentElement.classList.toggle('offline', !on);
    if (on && !was && window.Cal && Cal.toast) Cal.toast('Сеть снова есть');
    was = on;
  }
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
})();
