/* Напоминания: уведомления браузера и всплывающие подсказки, пока календарь открыт */
(function () {
  'use strict';
  var C = window.Cal;
  if (!C) return;
  var h = C.h;
  var FKEY = 'calendar.fired';
  var fired = {};
  try { fired = JSON.parse(localStorage.getItem(FKEY)) || {}; } catch (e) { fired = {}; }
  function saveFired() { try { localStorage.setItem(FKEY, JSON.stringify(fired)); } catch (e) { /* нет места */ } }

  function when(min) {
    if (min <= 0) return 'идёт сейчас';
    if (min < 60) return 'через ' + min + ' мин';
    if (min < 1440) return 'через ' + Math.floor(min / 60) + ' ч' + (min % 60 ? ' ' + (min % 60) + ' мин' : '');
    return 'завтра';
  }

  function show(title, body) {
    C.toast(body, { title: title });
    if (C.S.settings.notify && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body: body, icon: 'icon-192.png', tag: title + body }); } catch (e) { /* не поддерживается */ }
    }
  }

  function check(nowMs) {
    var now = nowMs ? new Date(nowMs) : new Date(), nowTs = now.getTime();
    var base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var changed = false;
    for (var i = 0; i <= 2; i++) {
      var key = C.ymd(C.addDays(base, i));
      C.eventsOn(key, true).forEach(function (e) {
        var rem = C.remMinutes(e);
        if (rem === null) return;
        if (e.allDay && typeof e.rem !== 'number') return; // для событий «весь день» только явное напоминание
        var d = C.parseYmd(key);
        var startTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), e.allDay ? 9 : Math.floor(e.start / 60), e.allDay ? 0 : e.start % 60).getTime();
        var endTs = e.allDay ? startTs + 12 * 3600000 : new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(e.end / 60) % 24, e.end % 60).getTime() + (e.end >= 1440 ? 86400000 : 0);
        var trigger = startTs - rem * 60000;
        var fk = e._m.id + '|' + key + '|' + rem;
        if (nowTs >= trigger && nowTs < endTs && !fired[fk]) {
          fired[fk] = nowTs; changed = true;
          var left = Math.round((startTs - nowTs) / 60000);
          show((C.isKey(e) ? '⚑ ' : '') + e.title, (e.allDay ? 'Весь день, ' + key : when(left) + ', в ' + C.hm(e.start)));
        }
      });
    }
    // сводка по задачам раз в день
    var today = C.ymd(base), bk = 'brief|' + today;
    if (!fired[bk] && now.getHours() >= 7) {
      var open = C.S.tasks.filter(function (t) { return !t.done && t.due; });
      var overdue = open.filter(function (t) { return t.due < today; }).length;
      var due = open.filter(function (t) { return t.due === today; }).length;
      fired[bk] = nowTs; changed = true;
      if (overdue || due) show('Задачи на сегодня', (due ? 'Со сроком сегодня: ' + due + '. ' : '') + (overdue ? 'Просрочено: ' + overdue + '.' : ''));
    }
    if (changed) {
      var cut = nowTs - 4 * 86400000;
      Object.keys(fired).forEach(function (k) { if (fired[k] < cut) delete fired[k]; });
      saveFired();
    }
  }

  C.extra.push(function () {
    var S = C.S;
    var perm = h('span', { class: 'mute small' }, ('Notification' in window) ? 'Разрешение: ' + (Notification.permission === 'granted' ? 'выдано' : Notification.permission === 'denied' ? 'запрещено в браузере' : 'не запрашивалось') : 'уведомления не поддерживаются');
    var sel = h('select', { onchange: function () { S.settings.remDefault = sel.value === 'none' ? null : +sel.value; C.save(); } },
      [['none', 'Не напоминать'], ['0', 'В момент начала'], ['5', 'За 5 минут'], ['10', 'За 10 минут'], ['15', 'За 15 минут'], ['30', 'За 30 минут'], ['60', 'За 1 час']]
        .map(function (r) { return h('option', { value: r[0] }, r[1]); }));
    sel.value = S.settings.remDefault === null ? 'none' : String(S.settings.remDefault);
    var chk = h('input', { type: 'checkbox', checked: !!S.settings.notify, onchange: function () {
      S.settings.notify = chk.checked; C.save();
      if (chk.checked && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(function () { perm.textContent = 'Разрешение: ' + (Notification.permission === 'granted' ? 'выдано' : 'не выдано'); });
      }
    } });
    return h('div', { class: 'set-sec' }, h('h3', null, 'Напоминания'),
      h('p', { class: 'mute small', style: 'margin-top:0' }, 'Напоминания приходят, пока календарь открыт в браузере или установлен как приложение и запущен. Закрытое приложение ничего показать не может.'),
      h('div', { class: 'opts' }, h('label', null, 'Напоминание по умолчанию', sel)),
      h('label', { class: 'check', style: 'margin-top:10px' }, chk, 'Показывать системные уведомления Windows'),
      h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, perm,
        h('button', { type: 'button', class: 'btn', onclick: function () { show('Проверка', 'Так будут выглядеть напоминания.'); } }, 'Показать пример')));
  });

  window.CalNotify = { check: check };
  setInterval(check, 20000);
  setTimeout(check, 1500);
})();
