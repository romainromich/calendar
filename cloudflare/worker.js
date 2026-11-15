/* Сервер push-уведомлений для календаря (Cloudflare Worker).
   Хранит подписки и расписание напоминаний в KV (привязка с именем KV),
   раз в минуту (Cron Trigger) отправляет push без содержимого; сервис-воркер
   приложения забирает текст через /due и показывает уведомление. */
const ALLOWED = ['https://romainromich.github.io', 'http://localhost:8080'];
const SUBJECT = 'https://romainromich.github.io/calendar/';
const WINDOW = 15 * 60 * 1000;      // опоздавшие больше чем на 15 минут не отправляются
const MAX_ITEMS = 150;

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text = (s, n) => String(s == null ? '' : s).slice(0, n);

async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
async function load(env) {
  const s = (await env.KV.get('state', 'json')) || {};
  s.subs = s.subs || {}; s.due = s.due || {};
  return s;
}
const save = (env, s) => env.KV.put('state', JSON.stringify(s));

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

/* Раз в минуту: что пора отправить */
async function tick(env) {
  const now = Date.now();
  const s = await load(env);
  const todo = [];
  let changed = false;
  for (const [id, u] of Object.entries(s.subs)) {
    const items = u.sch || [];
    u.fired = u.fired || {};
    const fire = items.filter((i) => i.at <= now && i.at > now - WINDOW && !u.fired[i.k]);
    const keep = items.filter((i) => i.at > now);
    if (keep.length !== items.length) changed = true;
    u.sch = keep;
    for (const k of Object.keys(u.fired)) if (u.fired[k] < now - 86400000) { delete u.fired[k]; changed = true; }
    if (fire.length) {
      changed = true;
      fire.forEach((i) => { u.fired[i.k] = now; });
      (s.due[id] = s.due[id] || []).push(...fire.map((i) => ({ title: i.title, body: i.body, t: now })));
      todo.push(id);
    }
  }
  for (const id of Object.keys(s.due)) {
    s.due[id] = s.due[id].filter((d) => d.t > now - 3600000);
    if (!s.due[id].length) { delete s.due[id]; changed = true; }
  }
  if (!todo.length) { if (changed) await save(env, s); return { sent: 0 }; }
  await save(env, s);                         // сначала сохраняем: приложение сразу запросит /due
  const v = await vapid(env);
  const gone = [];
  for (const id of todo) {
    try { const st = await sendPush(s.subs[id].sub, v); if (st === 404 || st === 410) gone.push(id); } catch (e) { /* повторится по следующему расписанию */ }
  }
  if (gone.length) {
    const s2 = await load(env);
    gone.forEach((id) => { delete s2.subs[id]; delete s2.due[id]; });
    await save(env, s2);
  }
  return { sent: todo.length, gone: gone.length };
}

function corsFor(req) {
  const o = req.headers.get('Origin');
  const h = { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
  if (o && ALLOWED.includes(o)) h['Access-Control-Allow-Origin'] = o;
  return h;
}

async function handle(req, env) {
  const url = new URL(req.url);
  const cors = corsFor(req);
  const origin = req.headers.get('Origin');
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (origin && !ALLOWED.includes(origin)) return json({ error: 'origin' }, 403);
  if (url.pathname === '/') return new Response('calendar-push ok', { headers: cors });
  if (url.pathname === '/vapid') return json({ key: (await vapid(env)).pub });
  if (url.pathname === '/due') {
    const id = url.searchParams.get('id') || '';
    const s = await load(env);
    const items = s.due[id] || [];
    if (items.length) { delete s.due[id]; await save(env, s); }
    return json({ items });
  }
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body;
  try { body = JSON.parse(await req.text()); } catch (e) { return json({ error: 'json' }, 400); }
  const s = await load(env);

  if (url.pathname === '/subscribe') {
    const sub = body && body.sub;
    if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint)) return json({ error: 'sub' }, 400);
    const id = await sha(sub.endpoint);
    s.subs[id] = { sub: { endpoint: sub.endpoint, keys: sub.keys || {} }, sch: (s.subs[id] && s.subs[id].sch) || [], fired: (s.subs[id] && s.subs[id].fired) || {} };
    if (Object.keys(s.subs).length > 20) return json({ error: 'limit' }, 429);
    await save(env, s);
    return json({ id });
  }
  const u = s.subs[body && body.id];
  if (!u) return json({ error: 'unknown' }, 404);

  if (url.pathname === '/schedule') {
    const raw = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
    const now = Date.now();
    u.fired = u.fired || {};
    const items = raw
      .filter((i) => i && typeof i.at === 'number' && typeof i.k === 'string' && i.at > now - WINDOW && i.at < now + 4 * 86400000 && !u.fired[i.k])
      .map((i) => ({ k: text(i.k, 120), at: Math.round(i.at), title: text(i.title, 120), body: text(i.body, 200) }))
      .sort((a, b) => a.at - b.at);
    if (JSON.stringify(items) !== JSON.stringify(u.sch || [])) { u.sch = items; await save(env, s); }
    return json({ ok: true, n: items.length });
  }
  if (url.pathname === '/test') {
    (s.due[body.id] = s.due[body.id] || []).push({ title: 'Календарь', body: 'Push-уведомления работают', t: Date.now() });
    await save(env, s);
    const st = await sendPush(u.sub, await vapid(env));
    return json({ ok: st >= 200 && st < 300, status: st });
  }
  if (url.pathname === '/unsubscribe') {
    delete s.subs[body.id]; delete s.due[body.id];
    await save(env, s);
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
