// Web3 Sims multiplayer API (Vercel Function).
// Thin, stateless proxy: auth cookie handling + request hygiene. All game rules, password hashing (bcrypt via
// pgcrypto), rate limits, blocks and sanitising live in Postgres (Supabase) behind public.w3s_api().
'use strict';
const crypto = require('crypto');

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
const SECRET = process.env.W3S_API_SECRET;
const COOKIE = 'w3s_sess';
const OPS = new Set(['signup', 'login', 'logout', 'me', 'profile', 'directory', 'user', 'follow', 'post', 'feed', 'like', 'repost',
  'dm_send', 'dm_thread', 'dm_threads', 'poll', 'block', 'report', 'handle_free', 'stats']);

function send(res, code, obj, cookie) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.end(JSON.stringify(obj));
}
function parseCookies(h) {
  const out = {};
  String(h || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function cookieStr(req, value, maxAge) {
  const host = String(req.headers.host || '');
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return COOKIE + '=' + encodeURIComponent(value) + '; Path=/api; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + (local ? '' : '; Secure');
}
async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch (e) { return null; } }
  return new Promise((resolve) => {
    let data = ''; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 16384) { resolve(null); req.destroy(); } else data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}

module.exports = async function handler(req, res) {
  if (!URL_ || !KEY || !SECRET) return send(res, 503, { ok: false, error: 'not_configured' });
  const q = new URL(req.url, 'http://x').searchParams;
  const op = q.get('op') || '';
  if (!OPS.has(op)) return send(res, 400, { ok: false, error: 'bad_op' });
  if (req.method !== 'POST' && !(req.method === 'GET' && op === 'stats')) return send(res, 405, { ok: false, error: 'method' });
  if (req.method === 'POST') {
    // CSRF hygiene: custom header (forces CORS preflight cross-site) + same-origin check
    if (req.headers['x-w3s'] !== '1') return send(res, 403, { ok: false, error: 'csrf' });
    const origin = req.headers.origin;
    if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { ok: false, error: 'csrf' }); } catch (e) { return send(res, 403, { ok: false, error: 'csrf' }); } }
  }
  const body = req.method === 'POST' ? await readBody(req) : {};
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { ok: false, error: 'bad_body' });
  if (JSON.stringify(body).length > 8000) return send(res, 413, { ok: false, error: 'too_big' });
  const token = parseCookies(req.headers.cookie)[COOKIE] || null;
  const ipRaw = String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || '').split(',')[0].trim();
  const ip = crypto.createHash('sha256').update(SECRET + '|' + ipRaw).digest('hex').slice(0, 32);
  let r;
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 9000);
    const resp = await fetch(URL_ + '/rest/v1/rpc/w3s_api', {
      method: 'POST', signal: ctl.signal,
      headers: { apikey: KEY, Authorization: KEY.indexOf('sb_') === 0 ? undefined : 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_secret: SECRET, p_op: op, p_token: token, p_args: body, p_ip: ip }),
    });
    clearTimeout(tm);
    r = await resp.json();
    if (!resp.ok) return send(res, 502, { ok: false, error: 'db_error' });
  } catch (e) {
    return send(res, 502, { ok: false, error: 'db_unreachable' });
  }
  if (!r || typeof r !== 'object') return send(res, 502, { ok: false, error: 'db_error' });
  if ((op === 'signup' || op === 'login') && r.ok && r.token) {
    const c = cookieStr(req, r.token, 60 * 60 * 24 * 30); delete r.token;
    return send(res, 200, r, c);
  }
  if (op === 'logout' || r.error === 'auth') return send(res, r.error === 'auth' ? 401 : 200, r, cookieStr(req, '', 0));
  return send(res, r.ok ? 200 : (r.error === 'forbidden' ? 500 : 400), r);
};
