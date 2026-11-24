/* Доступ к своему серверу для нескольких человек.
   Владелец входит кодом OWNER и раздаёт приглашения; тестировщик вводит код приглашения
   (или открывает ссылку …#invite=КОД) и получает личный токен. Токен хранится только на устройстве. */
(function () {
  'use strict';
  var C = window.Cal;
  if (!C) return;
  var h = C.h;
  var DEF = 'https://calendar-push.efremovr449.workers.dev';
  var me = null, box = null;

  function S() { return C.S; }
  function base() { return String(S().settings.pushUrl || DEF).replace(/\/+$/, ''); }
  function post(path, body, noToken) {
    var hd = noToken ? { 'Content-Type': 'text/plain' } : C.srvHeaders();
    return fetch(base() + path, { method: 'POST', headers: hd, body: JSON.stringify(body || {}) }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.message || (r.status === 401 ? 'Код не подошёл' : r.status === 429 ? 'Слишком много попыток, подождите' : 'Сервер ответил ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    }, function () { throw new Error('Сервер недоступен, проверьте интернет'); });
  }
  var isInvite = function (s) { return /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(s); };
  var fmtCode = function (c) { return c.slice(0, 4) + '-' + c.slice(4); };
  var link = function (c) { return location.origin + location.pathname + '#invite=' + c; };
  var dt = function (t) { var d = new Date(t); return d.getDate() + ' ' + C.MON_GEN[d.getMonth()]; };

  /* кто я: имя, владелец ли, сколько распознаваний осталось */
  function refresh() {
    if (!C.srvToken()) { me = null; paint(); return Promise.resolve(null); }
    return post('/me').then(function (j) { me = j; paint(); return j; }, function (e) {
      if (e.status === 401) { me = { bad: true }; } else me = { err: e.message };
      paint();
      return null;
    });
  }
  function enter(code) {
    code = String(code || '').trim();
    if (!code) return Promise.reject(new Error('Введите код'));
    if (isInvite(code)) {
      return post('/join', { code: code }, true).then(function (j) { C.srvToken(j.token); return refresh(); }).then(function () {
        C.toast('Готово, вы вошли как ' + (me && me.name || 'тестировщик'));
        afterLogin();
      });
    }
    // код владельца (секрет OWNER)
    var prev = C.srvToken();
    C.srvToken(code);
    return post('/me').then(function (j) { me = j; paint(); C.toast(j.owner ? 'Вы вошли как владелец' : 'Код подошёл'); afterLogin(); }, function (e) {
      C.srvToken(prev);
      throw e.status === 401 ? new Error('Код не подошёл') : e;
    });
  }
  // после входа: досинхронизировать push и облако с новым токеном
  function afterLogin() {
    if (window.CalCloud && window.CalCloud._on && window.CalCloud._on()) window.CalCloud.run();
  }
  function logout() {
    if (!confirm('Выйти? Push-уведомления, синхронизация и распознавание расписания перестанут работать на этом устройстве, пока вы снова не войдёте. Данные календаря останутся.')) return;
    C.srvToken('');
    me = null;
    paint();
  }

  /* ---------- раздел настроек ---------- */
  function loginForm(err) {
    var inp = h('input', { type: 'text', placeholder: 'например, K7M2-QX9P', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters' });
    var st = h('div', { class: 'small' + (err ? ' imp-err' : ' mute') }, err || '');
    var go = h('button', { type: 'button', class: 'btn primary' }, 'Войти');
    go.onclick = function () {
      go.disabled = true; st.className = 'small mute'; st.textContent = 'Проверяю…';
      enter(inp.value).catch(function (e) { st.className = 'small imp-err'; st.textContent = e.message; }).then(function () { go.disabled = false; });
    };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); });
    return [
      h('p', { class: 'mute small', style: 'margin-top:0' }, 'Push-уведомления, синхронизация между устройствами и распознавание расписания по скриншоту работают через сервер. Чтобы ими пользоваться, введите код приглашения, который вам прислали, или код входа, созданный на другом вашем устройстве.'),
      h('label', { class: 'field' }, 'Код приглашения или код входа', inp),
      h('div', { class: 'cs-row' }, go),
      st
    ];
  }
  function aiLine(ai) {
    if (!ai) return null;
    return ai.limit ? 'Распознавание расписания сегодня: ' + ai.used + ' из ' + ai.limit + ' картинок.' : 'Распознано картинок сегодня: ' + ai.used + ' (без лимита).';
  }
  function paint() {
    if (!box) return;
    var kids, linkBox = h('div');
    if (!C.srvToken()) kids = loginForm();
    else if (!me) kids = [h('p', { class: 'mute small' }, 'Проверяю доступ…')];
    else if (me.bad) { kids = loginForm('Сохранённый код больше не действует. Попросите новый код приглашения.'); }
    else if (me.err) kids = [h('p', { class: 'small' }, 'Не удалось связаться с сервером: ' + me.err),
      h('div', { class: 'cs-row' }, h('button', { type: 'button', class: 'btn', onclick: refresh }, 'Повторить'), h('button', { type: 'button', class: 'btn', onclick: logout }, 'Выйти'))];
    else {
      kids = [
        h('p', { style: 'margin-top:0' }, me.owner ? 'Вы владелец сервера.' : 'Вы вошли как ', me.owner ? null : h('b', null, me.name), me.owner ? null : '.'),
        h('p', { class: 'mute small' }, aiLine(me.ai)),
        h('div', { class: 'cs-row' }, h('button', { type: 'button', class: 'btn', onclick: function () { linkOther(linkBox); } }, 'Войти на другом устройстве'), h('button', { type: 'button', class: 'btn', onclick: logout }, 'Выйти')),
        linkBox
      ];
      if (me.owner) kids.push(ownerPanel());
    }
    box.replaceChildren.apply(box, kids.filter(Boolean));
  }

  /* одноразовый код на 10 минут: на другом устройстве ввести его как код приглашения или открыть ссылку */
  function linkOther(out) {
    out.replaceChildren(h('p', { class: 'mute small' }, 'Создаю код…'));
    post('/link').then(function (j) {
      var url = link(j.code), left = h('span', { class: 'mute small' }), timer;
      function tick() {
        var s = Math.max(0, Math.round((j.exp - Date.now()) / 1000));
        left.textContent = s ? 'действует ещё ' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) : 'код истёк, создайте новый';
        if (!s || !out.isConnected) clearInterval(timer);
      }
      out.replaceChildren(h('div', { class: 'acc-inv' },
        h('p', { class: 'small', style: 'margin-top:0' }, 'На другом устройстве откройте календарь → Настройки → Доступ к серверу и введите этот код. Или откройте там ссылку — например, отправьте её себе в мессенджер.'),
        h('div', { class: 'cs-row' }, h('code', { class: 'cs-key' }, fmtCode(j.code)), left),
        h('div', { class: 'cs-row' },
          h('button', { type: 'button', class: 'btn', onclick: function () { copy(url, 'Ссылка'); } }, 'Копировать ссылку'),
          h('button', { type: 'button', class: 'btn', onclick: function () { copy(fmtCode(j.code), 'Код'); } }, 'Копировать код'),
          navigator.share ? h('button', { type: 'button', class: 'btn', onclick: function () { navigator.share({ text: 'Вход в My Calendar: ' + url }).catch(function () { /* отменили */ }); } }, 'Отправить…') : null),
        h('p', { class: 'mute small' }, 'Код одноразовый. Синхронизацию данных между устройствами включите отдельно: Настройки → Синхронизация устройств.')));
      tick(); timer = setInterval(tick, 1000);
    }, function (e) { out.replaceChildren(h('p', { class: 'small imp-err' }, e.message + (e.status === 404 ? ' (обновите код воркера)' : ''))); });
  }

  /* ---------- владелец: приглашения и тестировщики ---------- */
  function copy(text, what) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { C.toast(what + ' скопирован' + (what === 'Ссылка' ? 'а' : '')); }, function () { prompt('Скопируйте:', text); });
  }
  function ownerPanel() {
    var wrap = h('div', { class: 'cs-token' });
    var name = h('input', { type: 'text', placeholder: 'например, Саша', maxlength: 40 });
    var uses = h('input', { type: 'number', min: 1, max: 30, value: 1, style: 'width:80px' });
    var out = h('div');
    var list = h('div', { class: 'acc-list' }, h('p', { class: 'mute small' }, 'Загружаю список…'));
    var make = h('button', { type: 'button', class: 'btn primary' }, 'Создать приглашение');
    make.onclick = function () {
      make.disabled = true;
      post('/admin/invite', { label: name.value, uses: +uses.value || 1 }).then(function (j) {
        out.replaceChildren(invCard(j.code, name.value.trim() || 'Тестировщик', j.left));
        name.value = ''; uses.value = 1;
        loadUsers(list);
      }, function (e) { out.replaceChildren(h('p', { class: 'small imp-err' }, e.message)); }).then(function () { make.disabled = false; });
    };
    wrap.append(
      h('h4', { style: 'margin:0 0 6px' }, 'Пригласить тестировщика'),
      h('p', { class: 'mute small', style: 'margin-top:0' }, 'Человек вводит код в Настройки → Доступ к серверу или просто открывает ссылку. Код действует 14 дней.'),
      h('div', { class: 'opts' }, h('label', null, 'Имя', name), h('label', null, 'Сколько человек', uses)),
      h('div', { class: 'cs-row' }, make),
      out,
      h('h4', { style: 'margin:14px 0 6px' }, 'Кто пользуется'),
      list);
    loadUsers(list);
    return wrap;
  }
  function invCard(code, label, left) {
    var url = link(code), msg = 'Приглашение в My Calendar: открой ' + url + ' (или введи код ' + fmtCode(code) + ' в Настройки → Доступ к серверу)';
    return h('div', { class: 'acc-inv' },
      h('div', { class: 'cs-row' }, h('code', { class: 'cs-key' }, fmtCode(code)), h('span', { class: 'mute small' }, label + (left > 1 ? ', на ' + left + ' человек' : ''))),
      h('div', { class: 'cs-row' },
        h('button', { type: 'button', class: 'btn', onclick: function () { copy(url, 'Ссылка'); } }, 'Копировать ссылку'),
        h('button', { type: 'button', class: 'btn', onclick: function () { copy(fmtCode(code), 'Код'); } }, 'Копировать код'),
        navigator.share ? h('button', { type: 'button', class: 'btn', onclick: function () { navigator.share({ text: msg }).catch(function () { /* отменили */ }); } }, 'Отправить…') : null));
  }
  function loadUsers(list) {
    post('/admin/users').then(function (j) {
      var rows = [];
      rows.push(h('div', { class: 'acc-row' }, h('b', null, 'Вы'), h('span', { class: 'mute small' }, 'картинок сегодня: ' + j.owner.ai + ' · устройств с push: ' + j.owner.devices)));
      j.users.forEach(function (u) {
        rows.push(h('div', { class: 'acc-row' },
          h('b', null, u.name),
          h('span', { class: 'mute small' }, 'с ' + dt(u.t) + ' · картинок сегодня: ' + u.ai + ' из ' + j.limit + ' · вошёл на устройствах: ' + (u.logins || 1) + ' · с push: ' + u.devices),
          h('button', { type: 'button', class: 'btn danger', onclick: function () {
            if (!confirm('Отключить «' + u.name + '» от сервера? У этого человека перестанут работать push, синхронизация и распознавание. Его данные на устройстве останутся.')) return;
            post('/admin/revoke', { uid: u.uid }).then(function () { C.toast('Отключено'); loadUsers(list); }, function (e) { C.toast(e.message); });
          } }, 'Отключить')));
      });
      if (!j.users.length) rows.push(h('p', { class: 'mute small' }, 'Пока никого: создайте приглашение выше.'));
      if (j.invites.length) {
        rows.push(h('h4', { style: 'margin:14px 0 6px' }, 'Неиспользованные приглашения'));
        j.invites.forEach(function (i) {
          rows.push(h('div', { class: 'acc-row' },
            h('code', null, fmtCode(i.code)),
            h('span', { class: 'mute small' }, i.label + ' · осталось входов: ' + i.left + ' · до ' + dt(i.exp)),
            h('button', { type: 'button', class: 'btn', onclick: function () { copy(link(i.code), 'Ссылка'); } }, 'Ссылка'),
            h('button', { type: 'button', class: 'btn', onclick: function () { post('/admin/uninvite', { code: i.code }).then(function () { loadUsers(list); }); } }, 'Отменить')));
        });
      }
      list.replaceChildren.apply(list, rows);
    }, function (e) { list.replaceChildren(h('p', { class: 'small imp-err' }, 'Список не загрузился: ' + e.message + (e.status === 404 ? ' (обновите код воркера)' : ''))); });
  }

  C.extra.push(function () {
    box = h('div');
    paint();
    refresh();
    return h('div', { class: 'set-sec' }, h('h3', null, 'Доступ к серверу'), box);
  });

  /* ---------- ссылка-приглашение …#invite=КОД ---------- */
  function fromLink() {
    var m = /[#&]invite=([A-Za-z0-9-]{8,9})/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    var code = m[1];
    if (C.srvToken() && !confirm('Вы уже вошли на этом устройстве. Войти заново по приглашению ' + fmtCode(code.replace('-', '')) + '?')) return;
    enter(code).catch(function (e) { C.toast(e.message); });
  }
  window.addEventListener('hashchange', fromLink);
  setTimeout(fromLink, 600);

  window.CalAccount = { refresh: refresh, me: function () { return me; }, enter: enter };
})();
