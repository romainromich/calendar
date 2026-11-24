/* Сервер push-уведомлений для календаря (Cloudflare Worker).
   Хранит подписки и расписание напоминаний в KV (привязка с именем KV),
   раз в минуту (Cron Trigger) отправляет push без содержимого; сервис-воркер
   приложения забирает текст через /due и показывает уведомление.
   Ещё хранит зашифрованную копию данных календаря для синхронизации устройств
   (/data): сервер видит только хэш ключа и шифротекст, расшифровать его не может.
   Пользователи: владелец входит секретом OWNER, остальные — по коду приглашения,
   который владелец создаёт в приложении; у каждого свой токен и свой дневной лимит распознаваний.
   KV по ключам: acl — пользователи и приглашения; u:<хэш токена> — пользователь; idx — список устройств;
   sub:<id> — подписка и расписание устройства; f:<id> — что уже отправлено; due:<id> — тексты для показа;
   ai:<uid>:<день> — сколько картинок распознано; d:<id> — зашифрованные данные синхронизации. */
const ALLOWED = ['https://romainromich.github.io'];
const SUBJECT = 'https://romainromich.github.io/calendar/';
const WINDOW = 15 * 60 * 1000;      // опоздавшие больше чем на 15 минут не отправляются
const MAX_ITEMS = 150;
const MAX_DEVICES = 6;              // устройств с push на одного человека
const MAX_SUBS = 300;               // всего устройств на сервере
const AI_USER_DAY = 20;             // картинок в день на человека (можно поменять переменной AI_USER_LIMIT)
const MAX_DATA = 4 * 1024 * 1024;   // зашифрованные данные одного календаря

/* Распознавание расписания по картинке (Workers AI, привязка AI в настройках воркера).
   chat — модели с картинкой в сообщении (OpenAI-формат), image — Llama 3.2 Vision (картинка отдельным полем). */
const AI_MODELS = {
  '@cf/meta/llama-4-scout-17b-16e-instruct': 'chat',
  '@cf/google/gemma-4-26b-a4b-it': 'chat',
  '@cf/qwen/qwen3.8-27b': 'chat',
  '@cf/moondream/moondream3.1-9B-A2B': 'chat',
  '@cf/meta/llama-3.2-11b-vision-instruct': 'image'
};
const MAX_IMAGE = 3 * 1024 * 1024;
const SCHEDULE_PROMPT = 'Ты извлекаешь расписание учебных занятий с изображения. Верни ТОЛЬКО JSON без пояснений и без markdown, строго в формате ' +
  '{"lessons":[{"day":1,"start":"09:00","end":"10:20","title":"","kind":"","room":"","teacher":"","weeks":"all"}]}. ' +
  'day: 1 — понедельник … 7 — воскресенье. start и end: время в формате ЧЧ:ММ. title: название дисциплины полностью, как написано. ' +
  'kind: вид занятия словом (лекция, практика, лабораторная, семинар, консультация, экзамен) — сокращения Лек, Пр, Лаб, Сем раскрывай; если не указан — пустая строка. ' +
  'room: аудитория как написано, без слова «ауд.». teacher: преподаватель как написано. ' +
  'weeks: "odd" — только нечётные недели (нечёт, I, числитель), "even" — только чётные (чёт, II, знаменатель), иначе "all". ' +
  'Если в одной ячейке две разные пары для чётной и нечётной недели — это два объекта. Каждое занятие — отдельный объект. Не выдумывай: чего нет на изображении — пустая строка.';
// v2: сначала оси таблицы (дни и время), потом занятия по дням — против путаницы столбцов
const SCHEDULE_PROMPT_V2 = 'Ты извлекаешь расписание учебных занятий с изображения и возвращаешь ТОЛЬКО JSON, без пояснений и без markdown.\n' +
  'Действуй по шагам.\n' +
  'Шаг 1. Найди оси. Определи, где на изображении дни недели (заголовки столбцов, строк или разделов) и где время пар. Запиши их в "axes".\n' +
  'Шаг 2. Пройди дни по порядку. Для каждого дня перечисли занятия только из ЕГО столбца (строки, раздела). День занятия определяй по заголовку столбца, под которым стоит текст, а не по соседним ячейкам. Пустой столбец — пустой список.\n' +
  'Шаг 3. Время занятия бери из строки (или подписи), на уровне которой оно стоит. Если указан номер пары и время — используй время.\n' +
  'Недели: если ячейка разделена на верх и низ с подписями «числитель/знаменатель», «чёт/нечёт», «I/II» или похожими — верхняя или помеченная «числитель», «нечёт», «I» половина это "odd", «знаменатель», «чёт», «II» это "even". ' +
  'Текст, занимающий всю ячейку целиком, или одинаковый в обеих половинах — "all". Две разные пары в одной ячейке — два объекта.\n' +
  'Поля: title — название дисциплины полностью; kind — вид словом (лекция, практика, лабораторная, семинар, консультация, экзамен), сокращения Лек, Пр, Лаб, Сем раскрывай; room — аудитория как написано (например «3223 ОМС», «1202 м», «А-305»), без слова «ауд.»; teacher — преподаватель как написано. Чего нет на изображении — пустая строка, ничего не выдумывай.\n' +
  'Если у дня на изображении видна дата (например «25 ноября», «25.11», «Вт, 25.11»), добавь в объект дня поле "date" в формате "ДД.ММ"; если даты нет — не добавляй.\n' +
  'Формат ответа строго: {"axes":{"days":["Понедельник","…"],"times":["09:00-10:20","…"]},"days":[{"day":1,"date":"25.11","lessons":[{"start":"09:00","end":"10:20","title":"","kind":"","room":"","teacher":"","weeks":"all"}]}]}. day: 1 — понедельник … 7 — воскресенье.';
// бесплатные 10 000 нейронов в день — общие на весь сервер; обнуляются в 00:00 UTC (03:00 по Москве)
function aiError(e, json) {
  const m = String(e && e.message || e);
  if (/4006|daily free allocation|neurons/i.test(m)) return json({ error: 'quota', message: 'Лимит нейросети на сервере на сегодня исчерпан. Он обновится в 03:00 по Москве. Пока можно загрузить Excel, CSV или .ics — они разбираются без нейросети.' }, 429);
  return json({ error: 'ai', message: m.slice(0, 400) }, 502);
}
async function aiSchedule(env, b, json) {
  if (!env.AI) return json({ error: 'no-ai', message: 'К воркеру не подключён Workers AI (привязка AI)' }, 501);
  const mode = AI_MODELS[b.model];
  if (!mode) return json({ error: 'model' }, 400);
  if (typeof b.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(b.image) || b.image.length > MAX_IMAGE) return json({ error: 'image' }, 400);
  const prompt = b.prompt === 'v2' ? SCHEDULE_PROMPT_V2 : SCHEDULE_PROMPT;
  const task = 'Извлеки все занятия с этого изображения расписания.' + (b.hint ? ' Подсказка: ' + String(b.hint).slice(0, 300) : '');
  const input = mode === 'image'
    ? { messages: [{ role: 'system', content: prompt }, { role: 'user', content: task }], image: b.image, max_tokens: 6000, temperature: 0 }
    : { messages: [{ role: 'system', content: prompt }, { role: 'user', content: [{ type: 'text', text: task }, { type: 'image_url', image_url: { url: b.image } }] }], max_tokens: 6000, temperature: 0 };
  const t0 = Date.now();
  let out;
  try { out = await env.AI.run(b.model, input); }
  catch (e) {
    // Llama 3.2 Vision просит один раз принять лицензию Meta
    if (/agree/i.test(String(e && e.message)) && mode === 'image') {
      try { await env.AI.run(b.model, { prompt: 'agree' }); } catch (e3) { /* «спасибо, что согласились» приходит ошибкой */ }
      try { out = await env.AI.run(b.model, input); }
      catch (e2) { return aiError(e2, json); }
    } else return aiError(e, json);
  }
  const text = typeof out === 'string' ? out
    : out && typeof out.response === 'string' ? out.response
    : out && out.response && typeof out.response === 'object' ? JSON.stringify(out.response)
    : out && out.choices && out.choices[0] && out.choices[0].message ? (out.choices[0].message.content || '')
    : JSON.stringify(out);
  // пустой ответ (бывает у Gemma): отдаём, что пришло, чтобы понять причину
  const shown = text && text.trim() ? text : 'ПУСТОЙ ОТВЕТ, пришло: ' + JSON.stringify(out).slice(0, 1500);
  return json({ model: b.model, ms: Date.now() - t0, text: shown, usage: out && out.usage || null });
}

/* Защита. Код доступа задаётся секретом OWNER в настройках воркера (Settings → Variables and Secrets).
   Пока секрета нет, сервер работает по-старому, чтобы обновление ничего не сломало. */
const TOKEN_HDR = 'X-Cal-Token';
// push отправляется только на серверы браузеров, а не на произвольный адрес
const PUSH_HOSTS = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com|web\.push\.apple\.com)\//;
const LIMIT = { n: 300, ms: 10 * 60 * 1000 };   // записей с одного адреса за 10 минут
const hits = new Map();
function limited(req) {
  const ip = req.headers.get('CF-Connecting-IP') || 'x', now = Date.now();
  let h = hits.get(ip);
  if (!h || now - h.t > LIMIT.ms) { h = { t: now, n: 0 }; hits.set(ip, h); }
  h.n++;
  if (hits.size > 5000) hits.clear();
  return h.n > LIMIT.n;
}
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const OWNER_USER = { uid: 'owner', name: 'Владелец', owner: true };
const users = new Map();             // кэш токенов в памяти воркера, чтобы не читать KV на каждый запрос
async function who(req, env) {
  const t = req.headers.get(TOKEN_HDR) || '';
  if (!env.OWNER || same(t, env.OWNER)) return OWNER_USER;
  if (!/^[0-9a-f]{48}$/.test(t)) return null;
  const h = await sha(t), c = users.get(h);
  if (c && Date.now() - c.at < 60000) return c.u;
  const u = await env.KV.get('u:' + h, 'json');
  if (users.size > 2000) users.clear();
  users.set(h, { u, at: Date.now() });
  return u;
}
const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((x) => x.toString(16).padStart(2, '0')).join('');
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // без похожих O/0, I/1, L
const inviteCode = () => [...crypto.getRandomValues(new Uint8Array(8))].map((x) => ABC[x % ABC.length]).join('');
const today = () => new Date().toISOString().slice(0, 10);   // сутки по UTC — как у квоты Workers AI
async function aiUsed(env, uid) { return +(await env.KV.get('ai:' + uid + ':' + today())) || 0; }
async function acl(env) { const a = (await env.KV.get('acl', 'json')) || {}; a.users = a.users || {}; a.inv = a.inv || {}; return a; }
const saveAcl = (env, a) => env.KV.put('acl', JSON.stringify(a));
const joins = new Map();
function joinLimited(req) {           // подбор кодов приглашения: не больше 20 попыток с адреса за 10 минут
  const ip = req.headers.get('CF-Connecting-IP') || 'x', now = Date.now();
  let h = joins.get(ip);
  if (!h || now - h.t > LIMIT.ms) { h = { t: now, n: 0 }; joins.set(ip, h); }
  if (joins.size > 5000) joins.clear();
  return ++h.n > 20;
}

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text = (s, n) => String(s == null ? '' : s).slice(0, n);

async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
/* Устройства. Раньше всё лежало в одном ключе state; когда людей несколько, одновременные записи
   затирали бы друг друга, поэтому у каждого устройства свои ключи, а общий список idx меняется
   только при подписке и отписке. */
async function index(env) {
  let idx = await env.KV.get('idx', 'json');
  if (idx) return idx;
  idx = {};
  const old = await env.KV.get('state', 'json');       // переезд со старой схемы
  if (old && old.subs) {
    for (const [id, u] of Object.entries(old.subs)) {
      await env.KV.put('sub:' + id, JSON.stringify({ sub: u.sub, sch: u.sch || [] }));
      if (u.fired && Object.keys(u.fired).length) await env.KV.put('f:' + id, JSON.stringify(u.fired), { expirationTtl: 172800 });
      idx[id] = { uid: 'owner', t: Date.now() };
    }
    await env.KV.put('idx', JSON.stringify(idx));
    await env.KV.delete('state');
  }
  return idx;
}
const saveIdx = (env, idx) => env.KV.put('idx', JSON.stringify(idx));
async function dropDevice(env, id) {
  await Promise.all(['sub:', 'f:', 'due:'].map((p) => env.KV.delete(p + id)));
}
async function addDue(env, id, list) {
  const now = Date.now();
  const due = ((await env.KV.get('due:' + id, 'json')) || []).filter((d) => d.t > now - 3600000).concat(list);
  await env.KV.put('due:' + id, JSON.stringify(due.slice(-20)), { expirationTtl: 3600 });
}

async function vapid(env) {
  let v = await env.KV.get('vapid', 'json');
  if (!v) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = { jwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)) };
    await env.KV.put('vapid', JSON.stringify(v));
  }
  return v;
}
async function jwt(v, aud) {
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ typ: 'JWT', alg: 'ES256' });
  const body = enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT });
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head + '.' + body));
  return head + '.' + body + '.' + b64u(sig);
}
async function sendPush(sub, v) {
  const aud = new URL(sub.endpoint).origin;
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { Authorization: 'vapid t=' + (await jwt(v, aud)) + ', k=' + v.pub, TTL: '600', Urgency: 'high' } });
  return r.status;
}

/* Раз в минуту: что пора отправить. Пишет в KV только когда действительно что-то отправляет. */
async function tick(env) {
  const now = Date.now();
  const idx = await index(env), ids = Object.keys(idx);
  if (!ids.length) return { sent: 0 };
  const subs = await Promise.all(ids.map((id) => env.KV.get('sub:' + id, 'json')));
  let v = null, sent = 0;
  const gone = [];
  for (let n = 0; n < ids.length; n++) {
    const id = ids[n], u = subs[n];
    if (!u) continue;
    const cand = (u.sch || []).filter((i) => i.at <= now && i.at > now - WINDOW);
    if (!cand.length) continue;
    const fired = (await env.KV.get('f:' + id, 'json')) || {};
    const fire = cand.filter((i) => !fired[i.k]);
    if (!fire.length) continue;
    fire.forEach((i) => { fired[i.k] = now; });
    for (const k of Object.keys(fired)) if (fired[k] < now - 86400000) delete fired[k];
    await env.KV.put('f:' + id, JSON.stringify(fired), { expirationTtl: 172800 });
    await addDue(env, id, fire.map((i) => ({ title: i.title, body: i.body, t: now })));   // сначала текст: приложение сразу запросит /due
    v = v || await vapid(env);
    try { const st = await sendPush(u.sub, v); sent++; if (st === 404 || st === 410) gone.push(id); } catch (e) { /* повторится по следующему расписанию */ }
  }
  if (gone.length) {
    const idx2 = await index(env);
    for (const id of gone) { delete idx2[id]; await dropDevice(env, id); }
    await saveIdx(env, idx2);
  }
  return { sent, gone: gone.length };
}

function corsFor(req) {
  const o = req.headers.get('Origin');
  const h = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, ' + TOKEN_HDR, 'Access-Control-Max-Age': '86400', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' };
  if (o && ALLOWED.includes(o)) h['Access-Control-Allow-Origin'] = o;
  return h;
}

async function handle(req, env) {
  const url = new URL(req.url);
  const cors = corsFor(req);
  const origin = req.headers.get('Origin');
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (url.pathname === '/') return new Response('calendar-push ok', { headers: cors });
  // /due и /vapid читает сервис-воркер; /due отдаёт только по секретному id устройства
  const open = req.method === 'GET' && (url.pathname === '/due' || url.pathname === '/vapid');
  if (!open && (!origin || !ALLOWED.includes(origin))) return json({ error: 'origin' }, 403);      // остальное только со страницы календаря
  let me = null;
  if (req.method === 'POST') {
    if (limited(req)) return json({ error: 'rate' }, 429);
    if (url.pathname === '/join') return join(req, env, json);
    me = await who(req, env);
    if (!me) return json({ error: 'token', message: 'Нет доступа к серверу: войдите по коду приглашения (Настройки → Доступ к серверу)' }, 401);
  }
  if (url.pathname === '/vapid') return json({ key: (await vapid(env)).pub });
  if (url.pathname === '/due') {
    const id = url.searchParams.get('id') || '';
    if (!/^[0-9a-f]{16,64}$/.test(id)) return json({ items: [] });
    const items = (await env.KV.get('due:' + id, 'json')) || [];
    if (items.length) await env.KV.delete('due:' + id);
    return json({ items });
  }
  if (url.pathname === '/ai/schedule') {
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    let b;
    try { b = JSON.parse(await req.text()); } catch (e) { return json({ error: 'json' }, 400); }
    const lim = me.owner ? 0 : (+env.AI_USER_LIMIT || AI_USER_DAY), used = await aiUsed(env, me.uid);
    if (lim && used >= lim) return json({ error: 'limit', message: 'Сегодня вы уже распознали ' + used + ' картинок из ' + lim + '. Лимит обновится в 03:00 по Москве; Excel, CSV и .ics можно загружать без ограничений.' }, 429);
    await env.KV.put('ai:' + me.uid + ':' + today(), String(used + 1), { expirationTtl: 172800 });
    return aiSchedule(env, b, json);
  }
  if (url.pathname === '/data') {
    // синхронизация: id — хэш секретного ключа (64 hex), data — шифротекст
    const id = url.searchParams.get('id') || '';
    if (!/^[0-9a-f]{64}$/.test(id)) return json({ error: 'id' }, 400);
    const k = 'd:' + id;
    const cur = (await env.KV.get(k, 'json')) || { rev: 0, data: null, t: 0 };
    if (req.method === 'GET') return json(cur);
    if (req.method !== 'POST') return json({ error: 'method' }, 405);
    const raw = await req.text();
    if (raw.length > MAX_DATA) return json({ error: 'size' }, 413);
    let b;
    try { b = JSON.parse(raw); } catch (e) { return json({ error: 'json' }, 400); }
    if (typeof b.data !== 'string' || typeof b.rev !== 'number') return json({ error: 'body' }, 400);
    if (b.rev !== cur.rev) return json({ error: 'conflict', ...cur }, 409);   // кто-то успел раньше: клиент сольёт и повторит
    const next = { rev: cur.rev + 1, data: b.data, t: Date.now() };
    await env.KV.put(k, JSON.stringify(next));
    return json({ rev: next.rev, t: next.t });
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body;
  try { body = JSON.parse(await req.text()); } catch (e) { return json({ error: 'json' }, 400); }
  body = body || {};

  if (url.pathname === '/me') {
    const lim = me.owner ? 0 : (+env.AI_USER_LIMIT || AI_USER_DAY);
    return json({ uid: me.uid, name: me.name, owner: !!me.owner, ai: { used: await aiUsed(env, me.uid), limit: lim } });
  }
  if (url.pathname.startsWith('/admin/')) {
    if (!me.owner) return json({ error: 'owner' }, 403);
    return admin(url.pathname.slice(7), body, env, json);
  }

  const idx = await index(env);
  if (url.pathname === '/subscribe') {
    const sub = body.sub;
    if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1000 || !PUSH_HOSTS.test(sub.endpoint)) return json({ error: 'sub' }, 400);
    const keys = sub.keys || {};
    if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 100) return json({ error: 'keys' }, 400);
    const id = await sha(sub.endpoint);
    if (!idx[id]) {
      const mine = Object.keys(idx).filter((k) => idx[k].uid === me.uid).sort((a, b) => idx[a].t - idx[b].t);
      if (mine.length >= MAX_DEVICES) { delete idx[mine[0]]; await dropDevice(env, mine[0]); }   // самое старое устройство уступает место
      if (Object.keys(idx).length >= MAX_SUBS) return json({ error: 'limit', message: 'На сервере слишком много устройств' }, 429);
    }
    const old = await env.KV.get('sub:' + id, 'json');
    await env.KV.put('sub:' + id, JSON.stringify({ sub: { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, sch: (old && old.sch) || [] }));
    if (!idx[id] || idx[id].uid !== me.uid) { idx[id] = { uid: me.uid, t: Date.now() }; await saveIdx(env, idx); }
    return json({ id });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  const dev = idx[id];
  if (!dev || (dev.uid !== me.uid && !me.owner)) return json({ error: 'unknown' }, 404);
  const u = await env.KV.get('sub:' + id, 'json');
  if (!u) return json({ error: 'unknown' }, 404);

  if (url.pathname === '/schedule') {
    const raw = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
    const now = Date.now(), fired = (await env.KV.get('f:' + id, 'json')) || {};
    const items = raw
      .filter((i) => i && typeof i.at === 'number' && typeof i.k === 'string' && i.at > now - WINDOW && i.at < now + 4 * 86400000 && !fired[i.k])
      .map((i) => ({ k: text(i.k, 120), at: Math.round(i.at), title: text(i.title, 120), body: text(i.body, 200) }))
      .sort((a, b) => a.at - b.at);
    if (JSON.stringify(items) !== JSON.stringify(u.sch || [])) { u.sch = items; await env.KV.put('sub:' + id, JSON.stringify(u)); }
    return json({ ok: true, n: items.length });
  }
  if (url.pathname === '/test') {
    await addDue(env, id, [{ title: 'Календарь', body: 'Push-уведомления работают', t: Date.now() }]);
    const st = await sendPush(u.sub, await vapid(env));
    return json({ ok: st >= 200 && st < 300, status: st });
  }
  if (url.pathname === '/unsubscribe') {
    delete idx[id];
    await saveIdx(env, idx);
    await dropDevice(env, id);
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

/* Вход по коду приглашения: код одноразовый (или на несколько человек), взамен выдаётся личный токен */
async function join(req, env, json) {
  if (joinLimited(req)) return json({ error: 'rate', message: 'Слишком много попыток, подождите 10 минут' }, 429);
  let b;
  try { b = JSON.parse(await req.text()); } catch (e) { return json({ error: 'json' }, 400); }
  const code = String(b && b.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const a = await acl(env), inv = a.inv[code];
  if (!/^[A-Z0-9]{8}$/.test(code) || !inv || inv.left <= 0 || inv.exp < Date.now()) return json({ error: 'code', message: 'Код приглашения не подошёл: проверьте его или попросите новый' }, 404);
  const tok = hex(24), h = await sha(tok), uid = hex(5);
  const u = { uid, name: inv.label || 'Тестировщик', t: Date.now() };
  await env.KV.put('u:' + h, JSON.stringify(u));
  a.users[uid] = { name: u.name, t: u.t, h };
  if (--inv.left <= 0) delete a.inv[code];
  await saveAcl(env, a);
  return json({ token: tok, uid, name: u.name });
}

/* Управление тестировщиками — только для владельца */
async function admin(cmd, b, env, json) {
  const a = await acl(env), now = Date.now();
  for (const c of Object.keys(a.inv)) if (a.inv[c].exp < now) delete a.inv[c];
  if (cmd === 'invite') {
    const code = inviteCode(), left = Math.max(1, Math.min(30, Math.round(+b.uses || 1)));
    a.inv[code] = { label: text(b.label, 40).trim() || 'Тестировщик', left, t: now, exp: now + 14 * 86400000 };
    await saveAcl(env, a);
    return json({ code, left, exp: a.inv[code].exp });
  }
  if (cmd === 'users') {
    const idx = await index(env), day = today();
    const list = await Promise.all(Object.entries(a.users).map(async ([uid, u]) => ({
      uid, name: u.name, t: u.t, ai: +(await env.KV.get('ai:' + uid + ':' + day)) || 0,
      devices: Object.values(idx).filter((d) => d.uid === uid).length
    })));
    const ownerAi = +(await env.KV.get('ai:owner:' + day)) || 0;
    return json({ users: list.sort((x, y) => y.t - x.t), invites: Object.entries(a.inv).map(([code, i]) => ({ code, label: i.label, left: i.left, exp: i.exp })), owner: { ai: ownerAi, devices: Object.values(idx).filter((d) => d.uid === 'owner').length }, limit: +env.AI_USER_LIMIT || AI_USER_DAY });
  }
  if (cmd === 'revoke') {
    const u = a.users[b.uid];
    if (!u) return json({ error: 'unknown' }, 404);
    await env.KV.delete('u:' + u.h);
    users.delete(u.h);
    delete a.users[b.uid];
    await saveAcl(env, a);
    const idx = await index(env);
    const mine = Object.keys(idx).filter((k) => idx[k].uid === b.uid);
    for (const id of mine) { delete idx[id]; await dropDevice(env, id); }
    if (mine.length) await saveIdx(env, idx);
    return json({ ok: true });
  }
  if (cmd === 'uninvite') {
    delete a.inv[String(b.code || '')];
    await saveAcl(env, a);
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(req, env) {
    try { return await handle(req, env); } catch (e) { return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: { ...corsFor(req), 'Content-Type': 'application/json' } }); }
  },
  async scheduled(event, env, ctx) { ctx.waitUntil(tick(env)); }
};
