/* Голосовой ввод события: «завтра в три линал» */
(function () {
  'use strict';
  var C = window.Cal, P = window.CalParse;
  if (!C || !P) return;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var box = document.querySelector('.quick'), input = document.getElementById('quick');
  if (!SR || !box || !input) return;
  var h = C.h, rec = null, listening = false, finalText = '', gotAny = false;
  var placeholder = input.placeholder;

  var btn = h('button', { type: 'button', class: 'mic', id: 'micBtn', 'aria-label': 'Голосовой ввод события', title: 'Сказать событие голосом' });
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  box.classList.add('hasmic');
  box.append(btn);

  function ui(on) {
    listening = on;
    btn.classList.toggle('on', on);
    input.placeholder = on ? 'Слушаю… скажите, например: завтра в три линал' : placeholder;
  }
  function done(text) {
    text = String(text || '').trim();
    input.value = '';
    input.dispatchEvent(new Event('input'));
    if (!text) { C.toast('Не расслышал. Нажмите на микрофон и повторите.'); return; }
    var S = C.S, r = P.parseQuick(text, new Date(), S.cats, S.settings.defaultCat, { spoken: true });
    var d = C.parseYmd(r.date), when = C.DOW_SHORT[d.getDay()] + ', ' + d.getDate() + ' ' + C.MON_GEN[d.getMonth()] + (r.hasTime ? ', ' + C.hm(r.start) + '–' + C.hm(r.end) : '');
    if (!r.hasTime) {                                  // без времени не угадываем: открываем форму с тем, что поняли
      C.setAnchor(d);
      C.openEvent(null, { title: r.title, date: r.date, start: r.start, end: r.end, cat: r.cat });
      C.toast('Услышал: «' + text + '». Времени не было, поставьте его в форме.');
      return;
    }
    var ev = C.mark({ id: C.uid(), title: r.title, date: r.date, start: r.start, end: r.end, cat: r.cat, notes: '', rep: null, ex: [] });
    S.events.push(ev); C.save(); C.setAnchor(d);
    var t = C.toast(r.title + ' · ' + when, { title: 'Добавил по голосу', ms: 15000 });
    var row = h('div', { style: 'display:flex;gap:8px;margin-top:8px' },
      h('button', { type: 'button', class: 'btn', onclick: function () { S.events = S.events.filter(function (x) { return x !== ev; }); C.save(); C.render(); t.remove(); } }, 'Отменить'),
      h('button', { type: 'button', class: 'btn', onclick: function () { t.remove(); C.openEvent(C.eventsOn(r.date, true).filter(function (x) { return x.id === ev.id; })[0]); } }, 'Изменить'));
    t.querySelector('.grow').append(h('div', { class: 'mute small' }, 'Услышал: «' + text + '»'), row);
  }
  function start() {
    var shown = false;
    rec = new SR();
    rec.lang = 'ru-RU'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    finalText = ''; gotAny = false;
    rec.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      gotAny = true;
      input.value = (finalText + interim).trim();
    };
    rec.onerror = function (e) {
      shown = true;
      var m = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Нет доступа к микрофону: разрешите его для сайта в настройках браузера.' :
        e.error === 'no-speech' ? 'Не расслышал. Нажмите на микрофон и повторите.' :
        e.error === 'network' ? 'Нет сети: распознавание речи работает через интернет.' :
        e.error === 'aborted' ? '' : 'Не получилось распознать речь (' + e.error + ').';
      if (m) C.toast(m);
    };
    rec.onend = function () {
      ui(false);
      if (shown) { input.value = ''; return; }
      done(finalText || input.value);
    };
    try { rec.start(); ui(true); } catch (e) { ui(false); C.toast('Не удалось включить микрофон.'); }
  }
  btn.addEventListener('click', function () {
    if (listening && rec) { try { rec.stop(); } catch (e) { /* уже остановлен */ } return; }
    start();
  });
})();
