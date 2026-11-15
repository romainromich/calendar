/* Разбор быстрого ввода: «завтра 15:00 линал #учёба» -> событие */
(function (root) {
  var MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  var L = '(?<![\\p{L}\\d])', R = '(?![\\p{L}\\d])';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { var r = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return r; }

  var KEYWORDS = {
    deadline: /дедлайн|сдать|сдача|срок|отправить/i,
    sport: /зал|трениров|бег|спорт|плаван/i,
    study: /пара|лекци|лаб|матан|линал|физик|англ|коллок|экзамен|семинар|учёб|учеб|курсов|презент/i
  };

  function parseQuick(text, now, cats, defaultCat) {
    var s = ' ' + text + ' ';
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var res = { date: ymd(today), start: 9 * 60, end: null, cat: defaultCat || (cats[0] && cats[0].id), hasDate: false, hasTime: false };

    function take(re, fn) {
      var g = new RegExp(re.source, re.flags.indexOf('g') < 0 ? re.flags + 'g' : re.flags);
      var m;
      while ((m = g.exec(s))) {
        if (fn(m) !== false) {
          s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
          return true;
        }
      }
      return false;
    }

    // ---- дата
    take(new RegExp(L + 'послезавтра' + R, 'iu'), function () { res.date = ymd(addDays(today, 2)); res.hasDate = true; }) ||
    take(new RegExp(L + 'завтра' + R, 'iu'), function () { res.date = ymd(addDays(today, 1)); res.hasDate = true; }) ||
    take(new RegExp(L + 'сегодня' + R, 'iu'), function () { res.date = ymd(today); res.hasDate = true; }) ||
    take(new RegExp(L + '(\\d{1,2})\\s+(' + MONTHS.join('|') + ')(?:\\s+(\\d{4}))?' + R, 'iu'), function (m) {
      var mon = MONTHS.indexOf(m[2].toLowerCase());
      var y = m[3] ? +m[3] : today.getFullYear();
      var d = new Date(y, mon, +m[1]);
      if (d.getMonth() !== mon) return false;
      if (!m[3] && d < today) d = new Date(y + 1, mon, +m[1]);
      res.date = ymd(d); res.hasDate = true;
    }) ||
    take(new RegExp(L + '(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{2,4}))?' + R, 'iu'), function (m) {
      var mon = +m[2] - 1;
      if (mon < 0 || mon > 11 || +m[1] < 1 || +m[1] > 31) return false;
      var y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : today.getFullYear();
      var d = new Date(y, mon, +m[1]);
      if (d.getMonth() !== mon) return false;
      if (!m[3] && d < today) d = new Date(y + 1, mon, +m[1]);
      res.date = ymd(d); res.hasDate = true;
    }) ||
    take(new RegExp(L + '(?:(?:в|во|на)\\s+)?(понедельник|вторник|сред[ауы]|четверг|пятниц[ауы]|суббот[ауы]|воскресень[ея])' + R, 'iu'), function (m) {
      var w = m[1].toLowerCase();
      var idx = w.indexOf('пон') === 0 ? 1 : w.indexOf('вт') === 0 ? 2 : w.indexOf('сред') === 0 ? 3 : w.indexOf('чет') === 0 ? 4 : w.indexOf('пят') === 0 ? 5 : w.indexOf('суб') === 0 ? 6 : 0;
      var diff = (idx - today.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      res.date = ymd(addDays(today, diff)); res.hasDate = true;
    });

    // ---- время
    var explicitEnd = null, duration = null;
    take(new RegExp(L + '(\\d{1,2}):(\\d{2})\\s*[-–—]\\s*(\\d{1,2}):(\\d{2})' + R, 'iu'), function (m) {
      res.start = +m[1] * 60 + +m[2]; explicitEnd = +m[3] * 60 + +m[4]; res.hasTime = true;
    });
    take(new RegExp(L + 'до\\s+(\\d{1,2})(?::(\\d{2}))?' + R, 'iu'), function (m) {
      if (+m[1] > 24) return false;
      explicitEnd = +m[1] * 60 + (m[2] ? +m[2] : 0);
    });
    if (!res.hasTime) {
      take(new RegExp(L + '(?:(?:в|с|к)\\s+)?(\\d{1,2}):(\\d{2})' + R, 'iu'), function (m) {
        if (+m[1] > 23 || +m[2] > 59) return false;
        res.start = +m[1] * 60 + +m[2]; res.hasTime = true;
      }) ||
      take(new RegExp(L + '(?:в|с|к)\\s+(\\d{1,2})(?:\\s*ч(?:аса|асов|ас)?)?' + R, 'iu'), function (m) {
        if (+m[1] > 23) return false;
        res.start = +m[1] * 60; res.hasTime = true;
      });
    }
    take(new RegExp(L + '(?:на\\s+)?(\\d+(?:[.,]\\d+)?)\\s*(?:ч|час\\p{L}*)' + R, 'iu'), function (m) {
      duration = Math.round(parseFloat(m[1].replace(',', '.')) * 60);
    }) ||
    take(new RegExp(L + '(?:на\\s+)?(\\d+)\\s*мин\\p{L}*' + R, 'iu'), function (m) { duration = +m[1]; });

    if (explicitEnd != null && explicitEnd > res.start) res.end = explicitEnd;
    else res.end = res.start + (duration || 60);
    if (res.end > 24 * 60) res.end = 24 * 60;

    // ---- категория
    var tag = null;
    take(/#(\p{L}+)/u, function (m) {
      var t = m[1].toLowerCase();
      for (var i = 0; i < cats.length; i++) {
        if (cats[i].name.toLowerCase().indexOf(t) === 0 || cats[i].id.toLowerCase() === t) { tag = cats[i].id; return true; }
      }
      return false;
    });
    if (tag) res.cat = tag;
    else {
      var order = ['deadline', 'sport', 'study'];
      for (var k = 0; k < order.length; k++) {
        var has = cats.some(function (c) { return c.id === order[k]; });
        if (has && KEYWORDS[order[k]].test(text)) { res.cat = order[k]; break; }
      }
    }

    // ---- название
    var title = s.replace(/\s+/g, ' ').trim()
      .replace(/^(?:в|во|на|до|с|к)\s+/iu, '')
      .replace(/\s+(?:в|во|на|до|с|к)$/iu, '');
    res.title = title ? title.charAt(0).toUpperCase() + title.slice(1) : 'Событие';
    return res;
  }

  var api = { parseQuick: parseQuick, ymd: ymd, addDays: addDays, pad: pad };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CalParse = api;
})(typeof window !== 'undefined' ? window : this);
