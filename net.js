/* Web3 Sims — real multiplayer layer.
 * Talks to /api/mp (Vercel Function → Supabase Postgres). The single-player sim stays local; this syncs the
 * profile, follow graph, posts and DMs, and plugs into Social through the swappable Adapter.
 * If the backend is unreachable the game keeps running single-player and Net.status becomes 'offline'. */
(function (root) {
  'use strict';
  const Sim = root.Sim;
  const LS_KEY = 'w3s.net';
  const POLL_MS = 4000, POLL_HIDDEN_MS = 15000, FEED_MS = 20000, PROFILE_MS = 45000;

  const Net = {
    status: 'off',        // off (not signed in) | connecting | online | offline
    me: null, onlineCount: 0, online: [], dir: [], dirAll: [], threads: [], thread: {}, unreadDms: 0,
    lastErr: '', worldPosts: [], profiles: {},
    onChange: null,
  };
  let st = load();
  let fails = 0, pollTimer = null, feedT = 0, profT = 0, polling = false, openThread = null;
  let LocalAdapter = null;

  function load() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(st)); } catch (e) {} }
  function changed() { if (Net.onChange) try { Net.onChange(); } catch (e) {} }
  const ERR = {
    handle_taken: 'That @handle is taken. Try another.', bad_handle: 'Handle: 3–15 letters, numbers or _.', handle_reserved: 'That handle is reserved.',
    bad_password: 'Password must be 6–72 characters.', bad_login: 'Wrong handle or password.', too_many_attempts: 'Too many attempts. Wait 10 minutes.',
    rate_limited: 'Too many sign-ups from here. Try again later.', slow_down: 'Slow down a bit (rate limit).', blocked: 'You can\'t interact with this player.',
    empty: 'Type something first.', no_user: 'Player not found.', self: 'That\'s you.', auth: 'Signed out. Please log in again.', banned: 'This account is banned.',
    db_unreachable: 'Server unreachable. Playing offline.', not_configured: 'Multiplayer is not configured on this server.', no_post: 'Post not found.',
  };
  Net.errText = (e) => ERR[e] || ('Something went wrong (' + e + ')');

  async function api(op, body) {
    let r;
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const tm = setTimeout(() => { if (ctl) ctl.abort(); }, 10000);
      const resp = await fetch('/api/mp?op=' + op, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-W3S': '1' }, body: JSON.stringify(body || {}), signal: ctl ? ctl.signal : undefined });
      clearTimeout(tm);
      const ct = resp.headers.get('content-type') || '';
      if (ct.indexOf('json') < 0) throw new Error('bad_response');
      r = await resp.json();
      if (resp.status >= 500 && (!r || !r.error || r.error === 'db_unreachable' || r.error === 'db_error' || r.error === 'not_configured')) throw new Error(r && r.error || 'server');
    } catch (e) {
      fails++;
      Net.lastErr = String(e && e.message || e);
      if (Net.status !== 'off' || st.handle) { if (fails >= 2 && Net.status !== 'offline') { Net.status = 'offline'; changed(); } }
      return { ok: false, error: 'db_unreachable', offline: true };
    }
    fails = 0;
    if (Net.status === 'offline' && Net.me) { Net.status = 'online'; changed(); }
    if (r && r.error === 'auth') { signedOut(); }
    return r || { ok: false, error: 'bad_response' };
  }
  Net.api = api;

  function signedOut() {
    Net.me = null; Net.status = 'off'; st.handle = null; save();
    if (LocalAdapter && Sim.Social) Sim.Social.setAdapter(LocalAdapter);
    stopPoll(); changed();
  }
  function signedIn(me) {
    const first = !st.handle || st.handle !== me.handle;
    Net.me = me; Net.status = 'online';
    if (first) { st = { handle: me.handle, sn: null, sd: null }; save(); }
    st.handle = me.handle; save();
    installAdapter();
    startPoll(); refreshFeed(); loadThreads(); changed();
  }

  // ---------- account ----------
  function profilePayload() {
    const S = Sim.state; if (!S) return {};
    const W = root.__GAME, ch = W && W.char;
    return {
      title: Sim.primaryTitle(), careers: (S.player.careers || []).slice(0, 3), followers: Math.round(S.stats.followers), rep: Math.round(S.stats.rep),
      nw: Math.round(Sim.netWorth() * 100) / 100, day: Sim.day(), color: S.player.color, hat: S.player.hat, home: Sim.HOMES[S.home.tier].name,
      scene: S.world ? S.world.scene : 'home', x: ch ? Math.round(ch.x * 10) / 10 : 0, y: ch ? Math.round(ch.y * 10) / 10 : 0,
    };
  }
  Net.signup = async function (handle, password) {
    Net.status = 'connecting'; changed();
    const r = await api('signup', { handle, password, name: Sim.state ? Sim.state.player.name : handle, profile: profilePayload() });
    if (r.ok) { signedIn(r.me); } else if (Net.status === 'connecting') { Net.status = r.offline ? 'offline' : 'off'; changed(); }
    return r;
  };
  Net.login = async function (handle, password) {
    Net.status = 'connecting'; changed();
    const r = await api('login', { handle, password });
    if (r.ok) { signedIn(r.me); api('profile', { profile: profilePayload() }); } else if (Net.status === 'connecting') { Net.status = r.offline ? 'offline' : 'off'; changed(); }
    return r;
  };
  Net.logout = async function () { await api('logout', {}); signedOut(); };
  Net.resume = async function () {
    // the session cookie is httpOnly; ask the server who we are
    if (!st.handle) { Net.status = 'off'; return; }
    Net.status = 'connecting'; changed();
    const r = await api('me', {});
    if (r.ok && r.me) signedIn(r.me);
    else if (r.offline) { Net.status = 'offline'; changed(); setTimeout(Net.resume, 20000); }
    else signedOut();
  };

  // ---------- polling (near real time) ----------
  function startPoll() { stopPoll(); schedule(300); }
  function stopPoll() { if (pollTimer) clearTimeout(pollTimer); pollTimer = null; }
  function schedule(ms) { stopPoll(); pollTimer = setTimeout(poll, ms); }
  async function poll() {
    if (!Net.me || polling) { if (Net.me) schedule(POLL_MS); return; }
    polling = true;
    const body = { since_notif: st.sn || 0, since_dm: st.sd || 0, presence: profilePayload() };
    const r = await api('poll', body);
    polling = false;
    if (!Net.me) return;
    if (r.ok) {
      const firstSync = st.sn === null || st.sn === undefined;
      Net.me = r.me; Net.onlineCount = r.online_count; Net.online = r.online || []; Net.unreadDms = r.unread_dms || 0;
      if (!firstSync) {
        for (const n of r.notifs || []) deliverNotif(n);
        for (const d of r.dms || []) deliverDm(d);
      } else if ((r.dms || []).length || (r.notifs || []).length) { loadThreads(); }
      st.sn = Math.max(st.sn || 0, r.max_notif || 0); st.sd = Math.max(st.sd || 0, r.max_dm || 0); save();
      if (openThread) await loadThread(openThread, true);
      const now = Date.now();
      if (now - feedT > FEED_MS) refreshFeed();
      if (now - profT > PROFILE_MS) { profT = now; }
      changed();
      schedule(document.hidden ? POLL_HIDDEN_MS : (openThread ? 2500 : POLL_MS));
    } else {
      schedule(r.offline ? Math.min(60000, 5000 * Math.pow(2, Math.min(fails, 4))) : POLL_MS);
    }
  }
  Net.pollNow = () => { if (Net.me) schedule(50); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Net.me) schedule(200); });

  const NK = { follow: ['followed you', 'players'], like: ['liked your post', 'feed'], repost: ['reposted your post', 'feed'], reply: ['replied', 'feed'], mention: ['mentioned you', 'feed'] };
  function deliverNotif(n) {
    const k = NK[n.kind] || ['', 'feed'];
    const who = '@' + (n.from || '?') + ' 🌐';
    const txt = n.kind === 'follow' ? 'followed you' : n.kind === 'reply' || n.kind === 'mention' ? k[0] + ': ' + (n.text || '') : k[0] + (n.text ? ': "' + n.text + '"' : '');
    if (Sim.h.notify) Sim.h.notify(n.kind === 'follow' ? 'follow' : n.kind === 'like' || n.kind === 'repost' ? 'like' : 'mention', who, txt, k[1]);
    if (n.kind === 'follow' && Sim.state) { Sim.h.addFollowers(1); }
    if (n.kind === 'reply' || n.kind === 'like' || n.kind === 'repost') feedT = 0;
  }
  function deliverDm(d) {
    if (Sim.h.notify) Sim.h.notify('dm', '@' + d.from + ' 🌐', d.text, 'dms');
    const th = Net.thread[d.from.toLowerCase()];
    if (th && !th.some((m) => m.id === d.id)) th.push(d);
    loadThreads();
  }

  // ---------- social graph ----------
  Net.loadDirectory = async function (q) {
    const r = await api('directory', { q: q || '' });
    if (r.ok) { Net.dir = r.users || []; Net.onlineCount = r.online; Net.total = r.total; changed(); }
    return r;
  };
  Net.loadUser = async function (handle) {
    const r = await api('user', { handle });
    if (r.ok) { Net.profiles[handle.toLowerCase()] = { user: r.user, posts: r.posts, t: Date.now() }; changed(); }
    return r;
  };
  function patchUser(u) {
    if (!u) return;
    for (const list of [Net.dir]) { const i = list.findIndex((x) => x.id === u.id); if (i >= 0) list[i] = u; }
    const p = Net.profiles[u.handle.toLowerCase()]; if (p) p.user = u;
  }
  Net.follow = async function (handle, on) { const r = await api('follow', { handle, on: !!on }); if (r.ok) { patchUser(r.user); feedT = 0; refreshFeed(); } changed(); return r; };
  Net.block = async function (handle, on) { const r = await api('block', { handle, on: !!on }); if (r.ok) { patchUser(r.user); if (on) purgeAuthor(handle); } changed(); return r; };
  Net.report = async function (handle, postId, reason) { return api('report', { handle, post_id: postId || null, reason: reason || 'reported in game' }); };
  function purgeAuthor(handle) {
    const S = Sim.state; if (!S) return; const h = handle.toLowerCase();
    S.feed = S.feed.filter((e) => !(e.real && !e.mine && String(e.handle).toLowerCase() === h));
    Net.threads = Net.threads.filter((t) => t.handle.toLowerCase() !== h);
  }

  // ---------- posts ----------
  function postToEntry(p, mine) {
    return {
      real: true, rid: p.id, mine: !!mine, name: p.author.name, handle: p.author.handle, av: mine ? 'me' : '🌐', role: p.author.title || 'player',
      text: p.text, paid: p.paid || null, sym: p.sym || null, likes: p.likes, rts: p.reposts, replies: p.replies,
      rliked: p.liked, rrted: p.reposted, rthread: (p.thread || []).map((r) => ({ av: '🌐', handle: r.handle, text: r.text, rid: r.id })),
      online: p.author.online, ts: Date.parse(p.created_at) || Date.now(),
    };
  }
  async function refreshFeed() {
    if (!Net.me) return;
    feedT = Date.now();
    const r = await api('feed', { limit: 30 });
    if (!r.ok || !Sim.state) return;
    mergeFeed(r.posts || []);
    changed();
  }
  Net.refreshFeed = refreshFeed;
  function mergeFeed(posts) {
    const S = Sim.state; const me = Net.me && Net.me.handle.toLowerCase();
    const byRid = {}; for (const e of S.feed) if (e.rid) byRid[e.rid] = e;
    const fresh = [];
    for (const p of posts) {
      const mine = p.author.handle.toLowerCase() === me;
      const e = byRid[p.id];
      if (e) {
        if (mine) { e.rlikes = p.likes; e.rrts = p.reposts; e.rreplies = p.replies; e.rthread = postToEntry(p, true).rthread; }
        else { const n = postToEntry(p, false); e.likes = n.likes; e.rts = n.rts; e.replies = n.replies; e.rthread = n.rthread; e.rliked = n.rliked; e.rrted = n.rrted; e.online = n.online; }
      } else if (!mine && p.id > (st.feedMax || 0) - 200) {
        fresh.push(Object.assign({ id: S.nextId++, t: S.t }, postToEntry(p, false)));
      }
      st.feedMax = Math.max(st.feedMax || 0, p.id);
    }
    if (fresh.length) {
      fresh.sort((a, b) => a.rid - b.rid);
      for (const e of fresh.slice(-15)) S.feed.unshift(e);
      if (S.feed.length > 70) S.feed.length = 70;
    }
    save();
  }
  Net.loadWorld = async function () { const r = await api('feed', { all: true, limit: 20 }); if (r.ok) { Net.worldPosts = r.posts || []; changed(); } return r; };
  // push a local post (game post, paid or not) to followers
  Net.pushPost = async function (entry, text) {
    if (!Net.me || !entry) return null;
    await null; // let the other post hooks (paid tag, $SYM) finish first
    if (entry.rid) return null;
    const kind = entry.ptype || (entry.paid ? 'paid' : 'post');
    const r = await api('post', { text: text || entry.text, kind, paid: entry.paid || null, sym: entry.sym || null });
    if (r.ok) { entry.rid = r.post.id; entry.real = true; entry.rlikes = 0; entry.rrts = 0; entry.rthread = []; changed(); }
    else if (!r.offline && r.error) Sim.h.toast('🌐 ' + Net.errText(r.error), 'bad');
    return r;
  };
  Net.reply = async function (rid, text) {
    const r = await api('post', { text, reply_to: rid });
    if (r.ok) { const e = Sim.state.feed.find((x) => x.rid === rid); if (e) { e.rthread = e.rthread || []; e.rthread.push({ av: 'me', handle: Net.me.handle, text: r.post.text, rid: r.post.id }); if (e.mine) e.rreplies = (e.rreplies || 0) + 1; else e.replies = (e.replies || 0) + 1; } changed(); }
    return r;
  };
  Net.like = async function (rid, on) {
    const r = await api('like', { id: rid, on: !!on });
    if (r.ok) { const e = Sim.state.feed.find((x) => x.rid === rid); if (e) { e.rliked = r.post.liked; if (e.mine) e.rlikes = r.post.likes; else e.likes = r.post.likes; } changed(); }
    return r;
  };
  Net.repost = async function (rid, on) {
    const r = await api('repost', { id: rid, on: !!on });
    if (r.ok) { const e = Sim.state.feed.find((x) => x.rid === rid); if (e) { e.rrted = r.post.reposted; if (e.mine) e.rrts = r.post.reposts; else e.rts = r.post.reposts; } changed(); }
    return r;
  };

  // ---------- DMs ----------
  async function loadThreads() { if (!Net.me) return; const r = await api('dm_threads', {}); if (r.ok) { Net.threads = r.threads || []; changed(); } }
  Net.loadThreads = loadThreads;
  async function loadThread(handle, incremental) {
    const k = handle.toLowerCase(); const cur = Net.thread[k] || [];
    const after = incremental && cur.length ? cur[cur.length - 1].id : null;
    const r = await api('dm_thread', after ? { handle, after } : { handle });
    if (r.ok) {
      Net.thread[k] = after ? cur.concat((r.dms || []).filter((d) => !cur.some((c) => c.id === d.id))) : (r.dms || []);
      Net.threadUser = Net.threadUser || {}; Net.threadUser[k] = r.user;
      const t = Net.threads.find((x) => x.handle.toLowerCase() === k); if (t) t.unread = 0;
      changed();
    }
    return r;
  }
  Net.loadThread = loadThread;
  Net.openThread = (handle) => { openThread = handle; if (handle) { loadThread(handle); schedule(1500); } };
  Net.dmSend = async function (handle, text) {
    const r = await api('dm_send', { handle, text });
    if (r.ok) { const k = handle.toLowerCase(); (Net.thread[k] = Net.thread[k] || []).push(r.dm); loadThreads(); changed(); }
    return r;
  };

  // ---------- adapter: NPC brains stay local, real players go over the network ----------
  function installAdapter() {
    if (!Sim.Social) return;
    if (!LocalAdapter) LocalAdapter = Sim.Social.adapter;
    const L = LocalAdapter;
    Sim.Social.setAdapter(Object.assign({}, L, {
      name: 'network',
      postStatus(entry) { L.postStatus(entry); if (entry && entry.mine && !entry.rid) Net.pushPost(entry); },
      like(entry) { if (entry && entry.real && entry.rid) Net.like(entry.rid, true); else L.like(entry); },
    }));
  }

  Net.init = function () { if (st.handle) Net.resume(); };
  Net.isReal = (e) => !!(e && e.real);
  Sim.Net = Net;
})(typeof window !== 'undefined' ? window : globalThis);
