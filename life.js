/* Web3 Sims — "real life" layer: free starter jobs, phone alerts (price / airdrop / NFT),
 * and paid KOL posts that show up in followers' feeds and move prices. */
(function (root) {
  'use strict';
  const Sim = root.Sim;
  const H = Sim.h;
  const { R, rand, randInt, pick, clamp, r2, toast, feed, unlock, addFollowers, notify } = H;

  let S, L;
  const mod = { id: 'life' };
  mod.achievements = {
    first_job:  { name: 'Day Job', desc: 'Finish your first paid job or bounty', emoji: '🧾' },
    first_sol:  { name: 'First SOL', desc: 'Earn 1 SOL total from zero', emoji: '🌱' },
    paid_post:  { name: '#ad', desc: 'Publish a paid post', emoji: '💰' },
    callout:    { name: 'Shill Detector', desc: 'Call out a paid shill post', emoji: '🧢' },
  };
  mod.init = function (state, fresh) {
    S = state;
    if (fresh || !S.life || typeof S.life !== 'object') S.life = { jobs: {}, px: {}, phases: {}, rx: [], grow: [] };
    L = S.life;
    L.jobs = L.jobs || {}; L.px = L.px || {}; L.phases = L.phases || {}; L.rx = L.rx || []; L.grow = L.grow || [];
  };

  // ---------------- jobs: always-available free income ----------------
  // where: 'phone' (anywhere), 'pc' (desk at home), or a town spot
  const JOBS = {
    job_raid:  { label: 'Raid shift (like/RT/reply campaign)', emoji: '⚔️', where: 'phone', mins: 60, pay: [0.012, 0.025], fx: { energy: -6, fun: -3, social: 4 }, xp: ['creator', 4], shill: 0.6, desc: 'Projects pay raiders to pump engagement.' },
    job_mod:   { label: 'Discord mod shift', emoji: '🛡️', where: 'phone', mins: 120, pay: [0.03, 0.05], fx: { energy: -10, social: 6, fun: -4 }, xp: ['farmer', 6], desc: 'Ban bots, answer "wen token" 400 times.' },
    job_tasks: { label: 'Community bounties (Zealy/Galxe)', emoji: '🎯', where: 'phone', mins: 45, pay: [0.008, 0.02], fx: { energy: -4, fun: -2 }, xp: ['farmer', 8], pts: [20, 50], desc: 'Small paid quests + airdrop points.' },
    job_write: { label: 'Ghostwrite a thread for a project', emoji: '✍️', where: 'pc', mins: 120, pay: [0.04, 0.09], fx: { energy: -14, fun: -4 }, xp: ['creator', 10], q: true, desc: 'Your words, their account. Pays better on PC.' },
    job_qa:    { label: 'Beta-test a dApp & file bugs', emoji: '🐞', where: 'pc', mins: 90, pay: [0.03, 0.07], fx: { energy: -10, fun: 2 }, xp: ['builder', 15], q: true, desc: 'QA bounties. Builders earn more.' },
    job_cafe:  { label: 'Barista shift at Crypto Café (4h)', emoji: '☕', where: 'cafe:counter', mins: 240, pay: [0.08, 0.1], fx: { energy: -25, social: 20, hunger: -10 }, xp: null, town: 'cafe', desc: 'Steady pay, free coffee, founders tip.' },
    job_mkt:   { label: 'Help out at Mama Put (3h)', emoji: '🍲', where: 'market:stall', mins: 180, pay: [0.05, 0.07], fx: { energy: -18, social: 15, hunger: 25 }, xp: null, town: 'market', desc: 'Pay + free food.' },
  };
  function dayKey() { return 'd' + Sim.day(); }
  function jobCount(id) { const d = L.jobs[dayKey()] || {}; return d[id] || 0; }
  function rankMult() {
    const st = S.stats;
    const lvl = Math.log10(1 + st.followers / 400) * 0.35 + Math.log10(1 + (S.career.xp.farmer + S.career.xp.builder + S.career.xp.creator) / 300) * 0.35;
    return clamp((1 + lvl) * (0.8 + st.rep / 250), 0.7, 3);
  }
  function jobPay(id) {
    const j = JOBS[id];
    const dim = Math.pow(0.85, jobCount(id));
    const base = (j.pay[0] + j.pay[1]) / 2;
    return r2(base * (j.town ? 1 : rankMult()) * dim * (j.q ? clamp(H.quality(), 0.7, 1.3) : 1));
  }
  function doJob(id) {
    const j = JOBS[id];
    const pay = r2(rand(j.pay[0], j.pay[1]) / ((j.pay[0] + j.pay[1]) / 2) * jobPay(id));
    const d = L.jobs[dayKey()] || (L.jobs[dayKey()] = {}); d[id] = (d[id] || 0) + 1;
    for (const k in L.jobs) if (k !== dayKey()) delete L.jobs[k];
    S.stats.sol = r2(S.stats.sol + pay); S.stats.earned = r2(S.stats.earned + pay); S.stats.jobsDone = (S.stats.jobsDone || 0) + 1;
    if (j.xp) Sim.addXP(j.xp[0], j.xp[1]);
    if (j.shill) S.stats.shill = clamp(S.stats.shill + j.shill, 0, 100);
    let extra = '';
    if (j.pts && Sim.Airdrop) { const p = Sim.Airdrop.A.protos.find((x) => x.phase === 'farming'); if (p) { const pts = randInt(j.pts[0], j.pts[1]); p.pts += pts; extra = ' +' + pts + ' pts on ' + p.name; } }
    if (id === 'job_cafe' && R() < 0.25 && Sim.World) { const ids = Sim.World.npcsAt('cafe'); if (ids.length) Sim.World.meet(pick(ids)); }
    toast(j.emoji + ' ' + j.label.split(' (')[0] + ' done: +◎' + Sim.fmtSol(pay) + extra, 'good');
    notify('pay', 'Payment received', '◎' + Sim.fmtSol(pay) + ' for ' + j.label.split(' (')[0], 'wallet');
    unlock('first_job');
    if (S.stats.earned >= 1) unlock('first_sol');
  }
  mod.actions = function () {
    const list = {};
    for (const id in JOBS) {
      const j = JOBS[id];
      const obj = j.where === 'phone' ? 'phone' : j.where === 'pc' ? 'desk' : j.where;
      list[id] = { obj, group: 'Jobs (free income)', label: j.label, emoji: j.emoji, mins: j.mins, fx: j.fx, work: true, pcOnly: j.where === 'pc', hidden: j.where === 'phone' || j.where === 'pc' ? false : false,
        req: j.town ? () => (Sim.World && !Sim.World.isOpen(j.town) ? Sim.World.LOTS[j.town].name + ' is closed' : null) : null,
        done: () => doJob(id) };
    }
    return list;
  };

  // ---------------- alerts that ping the phone ----------------
  mod.hourly = function (sleeping) {
    const Mk = Sim.Market && Sim.Market.M;
    if (Mk) {
      for (const sym in Mk.hold) {
        const t = Mk.tokens[sym]; if (!t) continue;
        const last = L.px[sym];
        if (last && Math.abs(t.price / last - 1) >= 0.08) notify('price', '$' + sym + ' price alert', (t.price > last ? '▲ +' : '▼ ') + ((t.price / last - 1) * 100).toFixed(1) + '% in the last hour · ' + Sim.Market.fmtPrice(t.price), 'market');
        L.px[sym] = t.price;
      }
      for (const sym in L.px) if (!Mk.hold[sym]) delete L.px[sym];
    }
    if (Sim.Airdrop) for (const p of Sim.Airdrop.A.protos) {
      const k = 'a' + p.id, prev = L.phases[k];
      if (prev && prev !== p.phase) {
        if (p.phase === 'snapshot') notify('airdrop', p.name, '📸 Snapshot taken. TGE soon.', 'farm');
        if (p.phase === 'tge') notify('airdrop', p.name, '🪂 TGE live: claim your $' + p.sym + ' before it closes', 'farm');
      }
      if (!prev) { if (Object.keys(L.phases).length) notify('airdrop', p.name, '🆕 New points program. Testnet tasks are free.', 'farm'); }
      L.phases[k] = p.phase;
    }
    if (Sim.NFT) for (const d of Sim.NFT.N.drops) {
      const k = 'n' + d.id, prev = L.phases[k];
      if (prev && prev !== d.phase) {
        if (d.phase === 'wl' && d.wl) notify('nft', d.name, '📝 Your WL mint is live', 'nft');
        if (d.phase === 'public') notify('nft', d.name, '⛽ Public mint live · ◎' + d.price, 'nft');
      }
      L.phases[k] = d.phase;
    }
    if (!sleeping && R() < 0.1) npcPaidPost();
  };

  // ---------------- paid posts ----------------
  const SHILL_CALLS = ['paid post? 👀', 'how much did they pay you ser', '#ad energy', 'another shill lmao', 'disclose your bags', 'bro got the bag and the brief at the same time', 'this reads like a press release'];
  const PAID_LIKES = { wholesome: ['looks interesting, will check it out', 'love the transparency on the #ad 🙏', 'good breakdown'], degen: ['aped 🚀', 'LFG', 'wen token', 'buying the dip on this'], toxic: SHILL_CALLS, alpha: ['interesting angle', 'not convinced. show me the onchain data', '👀'], farmer: ['is there a points program?', 'testnet when?', 'bookmarked'], shill: ['great partnership! 🚀', 'our team loves this', '🔥🔥'], scammer: ['Claim the official airdrop in my bio'] };
  function tokenFor(project) {
    const Mk = Sim.Market && Sim.Market.M; if (!Mk) return null;
    const toks = Object.values(Mk.tokens).filter((t) => t.sym !== 'SOL' && !t.rugged);
    if (!toks.length) return null;
    const exact = toks.find((t) => project && project.toLowerCase().indexOf(t.name.toLowerCase().split(' ')[0]) >= 0);
    if (exact) return exact;
    let h = 0; for (const c of String(project)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return toks[h % toks.length];
  }
  function bump(tok, pct) { if (!tok) return; tok.price *= 1 + pct; if (tok.anchor) tok.anchor *= 1 + pct * 0.3; }

  mod.onPost = function (type, tier, gain, entry) {
    if (!entry || !entry.mine) return;
    const paid = !!entry.paid;
    // every post keeps collecting engagement for a few hours; paid posts also collect replies
    L.grow.push({ id: entry.id, until: S.t + (paid ? 300 : 180), rate: Math.max(0.5, (entry.likes || 1) / 40), last: S.t });
    if (L.grow.length > 12) L.grow.shift();
    if (paid) {
      unlock('paid_post');
      const tok = tokenFor(entry.paid);
      entry.sym = tok ? tok.sym : null;
      L.rx.push({ id: entry.id, until: S.t + 300, next: S.t + randInt(10, 30), project: entry.paid, sym: entry.sym, low: entry.paidTier === 'low', calls: 0, n: 0 });
    }
  };
  function reactPlayerPaid(rx, e) {
    const PEOPLE = Sim.Social.PEOPLE.filter((p) => p.pers !== 'scammer');
    const followers = PEOPLE.filter((p) => S.so.people[p.id] && S.so.people[p.id].follows);
    const p = followers.length && R() < 0.7 ? pick(followers) : pick(PEOPLE);
    const shillP = clamp(0.12 + S.stats.shill / 140 + (rx.low ? 0.25 : 0) + (p.pers === 'toxic' ? 0.5 : p.pers === 'alpha' ? 0.15 : 0), 0, 0.9);
    const isCall = R() < shillP;
    const text = isCall ? pick(SHILL_CALLS) : pick(PAID_LIKES[p.pers] || PAID_LIKES.wholesome);
    e.thread = e.thread || []; e.thread.push({ npc: p.id, av: p.av, handle: p.handle, text });
    e.replies = (e.replies || 0) + 1;
    rx.n++; if (isCall) rx.calls++;
    if (rx.n === 1) notify('mention', '@' + p.handle + ' replied', text, 'feed');
  }
  function finishPlayerPaid(rx, e) {
    const tok = rx.sym && Sim.Market ? Sim.Market.M.tokens[rx.sym] : null;
    const eng = (e.likes || 0) + (e.rts || 0) * 3;
    const ratio = rx.n ? rx.calls / rx.n : 0;
    const pct = clamp(eng / 4000, 0.004, 0.06) * (1 - ratio * 0.8);
    bump(tok, pct);
    let repD = ratio > 0.45 ? -2 : ratio < 0.2 ? 1 : 0;
    if (rx.low) repD -= 1;
    S.stats.rep = clamp(S.stats.rep + repD, 0, 100);
    toast('📣 Your paid post for ' + rx.project + ': ' + Sim.fmtNum(e.likes || 0) + ' likes, ' + rx.calls + ' shill call-outs' + (tok ? ' · $' + tok.sym + ' +' + (pct * 100).toFixed(1) + '%' : '') + (repD ? ' · rep ' + (repD > 0 ? '+' : '') + repD : ''), repD < 0 ? 'bad' : 'info');
  }

  // NPC KOLs get paid too. Followers (including you, if you follow them) see it.
  const KOLS = ['wendy', 'tunde', 'oracle', 'chad', 'shill', 'zara', 'lola', 'frog'];
  const KOL_TEXT = {
    wholesome: ['Been testing $SYM for a week. Honestly smooth UX 💜 #ad', 'Proud to partner with $SYM. Building real stuff 🙏 (sponsored)'],
    alpha: ['$SYM onchain looks strong. Smart wallets accumulating. (paid partnership, DYOR)', 'Watching $SYM. Narrative + liquidity. #ad'],
    shill: ['🚀 $SYM IS THE MOST UNDERVALUED TOKEN ON SOLANA 🚀', '$SYM just announced a HUGE partnership 🤝 do not fade'],
    toxic: ['ok fine $SYM is kinda based. (they paid me, still based)', 'unpopular opinion: $SYM will flip your bags'],
    degen: ['aped $SYM. not financial advice (financial advice)', '$SYM chart is a rocket 🚀'],
    farmer: ['$SYM points program is live. farm it 🧑🏾‍🌾 #ad'],
  };
  function npcPaidPost() {
    const Mk = Sim.Market && Sim.Market.M; if (!Mk || !S.so) return;
    const id = pick(KOLS); const P = Sim.Social.PEOPLE.find((p) => p.id === id); if (!P) return;
    const toks = Object.values(Mk.tokens).filter((t) => t.sym !== 'SOL' && !t.rugged); if (!toks.length) return;
    const tok = pick(toks);
    const fol = (Sim.World ? Sim.World.personInfo(id).followers : 10000);
    const pct = clamp(fol / 1e6, 0.005, 0.05) * rand(0.6, 1.4);
    bump(tok, pct); // their followers buy regardless of whether you see it
    const r = S.so.people[id];
    if (!r || !r.youFollow) return; // you only see posts from accounts you follow
    const text = pick(KOL_TEXT[P.pers] || KOL_TEXT.shill).replace(/\$SYM/g, '$' + tok.sym);
    const thread = [];
    const others = Sim.Social.PEOPLE.filter((p) => p.id !== id && p.pers !== 'scammer');
    for (let i = 0; i < randInt(2, 4); i++) { const q = pick(others); const call = R() < (q.pers === 'toxic' ? 0.7 : 0.25); thread.push({ npc: q.id, av: q.av, handle: q.handle, text: call ? pick(SHILL_CALLS) : pick(PAID_LIKES[q.pers] || PAID_LIKES.wholesome) }); }
    feed({ npc: id, name: P.name, handle: P.handle, av: P.av, role: P.role, text, likes: Math.round(fol * rand(0.004, 0.02)), rts: Math.round(fol * rand(0.0005, 0.003)), replies: thread.length + randInt(5, 60), thread, paid: tok.name, sym: tok.sym, kol: true });
    notify('post', P.name + ' posted', text, 'feed');
  }
  // player reacting to an NPC KOL's paid post
  function reactToKol(entryId, kind) {
    const e = S.feed.find((x) => x.id === entryId); if (!e || !e.kol || e.reacted) return false;
    e.reacted = kind;
    const r = S.so.people[e.npc]; const tok = e.sym && Sim.Market ? Sim.Market.M.tokens[e.sym] : null;
    e.thread = e.thread || [];
    if (kind === 'bull') {
      e.thread.push({ av: '🫵', handle: S.player.handle, text: pick(['bullish 🚀', 'been watching this one too', 'LFG $' + (e.sym || '')]) });
      if (r) r.rel = clamp(r.rel + 4, 0, 100);
      bump(tok, 0.003); addFollowers(randInt(0, 3)); S.stats.shill = clamp(S.stats.shill + 1, 0, 100);
      toast('🚀 You hyped the post. @' + e.handle + ' noticed (+rel). Your followers saw it too.', 'info');
    } else {
      e.thread.push({ av: '🫵', handle: S.player.handle, text: pick(['this is a paid post, disclose it properly 🧢', 'how much for this one?', 'sponsored. DYOR frens']) });
      if (r) { r.rel = clamp(r.rel - 6, 0, 100); r.rival = clamp((r.rival || 0) + 10, 0, 100); }
      S.stats.rep = clamp(S.stats.rep + 1, 0, 100); addFollowers(randInt(1, 8)); bump(tok, -0.004);
      unlock('callout');
      toast('🧢 You called out the shill. +rep with your followers, @' + e.handle + ' is not happy.', 'info');
    }
    return true;
  }

  mod.step = function () {
    if (S.home && S.home.grace && S.stats.earned >= 1 && S.home.nextRent > S.t) S.home.nextRent = S.t; // flip off the couch right away
    // engagement growth on your recent posts
    for (const g of L.grow) {
      if (S.t >= g.until || S.t - g.last < 10) continue;
      const e = S.feed.find((x) => x.id === g.id); if (!e) { g.until = 0; continue; }
      const mins = S.t - g.last; g.last = S.t;
      const add = Math.round(g.rate * mins / 10 * rand(0.5, 1.5) * Math.sqrt(1 + S.stats.followers / 500));
      e.likes = (e.likes || 0) + add; e.rts = (e.rts || 0) + Math.round(add * rand(0.05, 0.25));
    }
    L.grow = L.grow.filter((g) => g.until > S.t);
    for (const rx of L.rx) {
      const e = S.feed.find((x) => x.id === rx.id);
      if (!e) { rx.until = 0; continue; }
      if (S.t >= rx.next && S.t < rx.until) { reactPlayerPaid(rx, e); rx.next = S.t + randInt(20, 60); }
      if (S.t >= rx.until && !rx.done) { rx.done = true; finishPlayerPaid(rx, e); }
    }
    L.rx = L.rx.filter((rx) => !rx.done);
  };

  Sim.Life = { mod, JOBS, jobPay, jobCount, reactToKol, tokenFor, npcPaidPost, get L() { return L; } };
  Sim.use(mod);
})(typeof window !== 'undefined' ? window : globalThis);
