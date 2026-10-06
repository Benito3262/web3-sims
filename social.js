/* Web3 Sims — social layer: NPC sims, follows, relationships, feed interactions and DMs.
 *
 * Multiplayer-ready seam: everything that would talk to other real players goes through `Adapter`.
 * v1 ships LocalNPCAdapter (NPC brains run in the browser). A future backend adapter only needs to
 * implement the same methods (people, sendDM, postStatus, like, follow, pull) and push incoming events
 * through Social.receive(...). Nothing else in the game calls NPC logic directly.
 */
(function (root) {
  'use strict';
  const Sim = root.Sim;
  const { R, rand, randInt, pick, clamp, r2, toast, feed, sys, unlock } = Sim.h;

  const PEOPLE = [
    { id: 'ada', name: 'Ada Onchain', handle: 'ada_onchain', av: '👩🏾‍💻', role: 'Builder', pers: 'wholesome', bio: 'Solidity by day, Rust by night. Mentor energy.' },
    { id: 'dave', name: 'degen dave', handle: 'degen_dave', av: '🦍', role: 'Trader', pers: 'degen', bio: '100x or bust. Mostly bust.' },
    { id: 'frog', name: 'anon frog', handle: 'anon_frog', av: '🐸', role: 'Shitposter', pers: 'toxic', bio: 'ratio enjoyer. not your fren.' },
    { id: 'wendy', name: 'wagmi wendy', handle: 'wagmi_wendy', av: '🌸', role: 'CT Creator', pers: 'wholesome', bio: 'gm-ing since 2020. we all gonna make it.' },
    { id: 'oracle', name: 'onchain oracle', handle: 'onchain_oracle', av: '🔮', role: 'Alpha Caller', pers: 'alpha', bio: 'I read wallets so you do not have to.' },
    { id: 'kemi', name: 'Kemi Farms', handle: 'kemi_farms', av: '🧑🏾‍🌾', role: 'Airdrop Farmer', pers: 'farmer', bio: '42 wallets (allegedly). Points are a lifestyle.' },
    { id: 'jpeg', name: 'jpeg jimmy', handle: 'jpegjimmy', av: '🖼️', role: 'NFT Degen', pers: 'degen', bio: 'floor sweeper. trait sniper. broke.' },
    { id: 'whale', name: 'Silent Whale', handle: 'silentwhale', av: '🐋', role: 'Whale', pers: 'alpha', bio: 'I do not tweet. I move markets.' },
    { id: 'chad', name: 'Chad Ventures', handle: 'chadventures', av: '💼', role: 'VC', pers: 'shill', bio: 'Pre-seed, post-vibes. DMs open for founders.' },
    { id: 'tunde', name: 'Tunde Spaces', handle: 'tunde_spaces', av: '🎙️', role: 'Space Host', pers: 'wholesome', bio: 'Hosting Spaces every night. Pull up.' },
    { id: 'shill', name: 'Moon Marketing', handle: 'moonmktg', av: '📣', role: 'Shill Agency', pers: 'shill', bio: 'We 100x your token (impressions). Pay in SOL.' },
    { id: 'scam1', name: 'Solana Support 🛡️', handle: 'so1ana_suppport', av: '🛡️', role: 'Totally Legit', pers: 'scammer', bio: 'Official support (not official).' },
  ];

  const POSTS = {
    wholesome: ['gm frens ☀️ drink water, ship something small today', 'reminder: your worth is not your portfolio 💜', 'shoutout to everyone building in the bear. you will be early in the bull', 'what are you all working on this week? drop it below 👇', 'small accounts: reply to this and I will follow you back'],
    degen: ['just aped my rent into $' + '{MEME}' + '. see you on the other side', 'up 400% on a coin I bought because the logo was cute. skill.', 'liquidated again. anyway, longing', 'who is minting tonight? I need a new jpeg to stare at', 'my risk management is called "vibes"'],
    toxic: ['your favorite KOL is paid. mine too. we all know', 'imagine holding $' + '{TOKEN}' + ' in this economy lmao', 'thread guys when the thread is 1/47 💀', 'another day, another "community-led" rug', 'ratio is a love language'],
    alpha: ['watching a fresh wallet accumulate $' + '{TOKEN}' + ' quietly. interesting.', 'smart money rotating into protocol tokens. memes cooling off.', 'not saying anything. just saying watch the $' + '{TOKEN}' + ' chart this week', 'the next narrative is already here. most of you are not paying attention', 'if you need me to explain it, you are early. if I explain it, you are late'],
    farmer: ['daily check-ins done across 6 testnets before breakfast 🧑🏾‍🌾', 'points programs are just loyalty cards for degens and I love it', 'snapshot rumor for {PROTO}. max your activity frens', 'sybil hunters are getting smarter. one wallet, real usage, trust', 'farmed 3 months for an airdrop worth 2 plates of jollof. no regrets'],
    shill: ['🚀 HUGE partnership coming for a project I advise (disclosure: I advise)', 'this is the most undervalued token on Solana (I hold a lot)', 'looking for KOLs for a campaign. budget is real. DMs open', 'we are hiring ambassadors! must love the moon', 'not financial advice but financially it is advice'],
    scammer: ['🎁 Solana community airdrop is LIVE. Claim in bio before it ends', '⚠️ Wallet verification required for all holders. DM us now'],
  };

  const REPLIES_TO_YOU = {
    wholesome: ['love this 💜', 'great thread, saving it', 'this is why I follow you', 'so true ser', 'needed this today'],
    degen: ['LFG 🚀', 'aped. no questions asked', 'wen token ser', 'this but unironically', 'ok but what coin'],
    toxic: ['ratio', 'who asked', 'paid post?', 'mid', 'you fell off (you were never on)'],
    alpha: ['👀', 'interesting. more people should read this', 'early.', 'correct.', 'you are onto something'],
    farmer: ['adding this to my farm checklist', 'points?', 'does this qualify for the airdrop', 'based farmer content', 'bookmarked for the snapshot'],
    shill: ['great content! check DMs 📩', 'would love to collab, DM open', 'have you heard of our project?', 'this but with our token', '🚀🚀🚀'],
    scammer: ['Congrats! You are selected for a reward, check DMs', 'Your wallet is eligible 🎁 DM'],
  };

  let S, SO;
  const mod = { id: 'social' };
  mod.achievements = {
    mutuals:    { name: 'Mutuals', desc: 'Reach 60+ relationship with a sim', emoji: '🤝' },
    first_dm:   { name: 'Slide Into DMs', desc: 'Send your first DM', emoji: '📩' },
    alpha_leak: { name: 'Insider (Allegedly)', desc: 'Receive an alpha leak', emoji: '🤫' },
  };

  mod.init = function (state, fresh) {
    S = state;
    if (fresh || !S.so) {
      S.so = { people: {}, threads: {}, unread: {}, queue: [], liked: {} };
      for (const p of PEOPLE) S.so.people[p.id] = { rel: p.pers === 'scammer' ? 0 : randInt(5, 25), follows: false, youFollow: false };
    }
    SO = S.so;
  };

  function person(id) { const p = PEOPLE.find((x) => x.id === id); return p ? Object.assign({}, p, SO.people[id]) : null; }
  function fill(text) {
    const Mk = Sim.Market && Sim.Market.M;
    const toks = Mk ? Object.values(Mk.tokens).filter((t) => t.sym !== 'SOL' && !t.rugged) : [];
    const memes = toks.filter((t) => t.kind === 'meme');
    const protos = Sim.Airdrop ? Sim.Airdrop.A.protos.filter((p) => p.phase === 'farming') : [];
    return text.replace('{TOKEN}', toks.length ? pick(toks).sym : 'GLORP').replace('{MEME}', memes.length ? pick(memes).sym : 'FROGWIF').replace('{PROTO}', protos.length ? pick(protos).name : 'Quokka Bridge');
  }
  function relUp(id, n) {
    const r = SO.people[id]; if (!r) return;
    const before = r.rel;
    r.rel = clamp(r.rel + n, 0, 100);
    if (before < 60 && r.rel >= 60) { unlock('mutuals'); toast('🤝 You and @' + person(id).handle + ' are mutuals now. Expect more alpha & collabs.', 'good'); }
    if (!r.follows && r.rel >= 35 && R() < 0.4) { r.follows = true; Sim.h.addFollowers(1); toast(person(id).av + ' @' + person(id).handle + ' followed you', 'info'); }
  }

  // ---------- adapter (local NPC brains) ----------
  const LocalNPCAdapter = {
    people() { return PEOPLE.map((p) => person(p.id)); },
    sendDM(id, text) { addMsg(id, 'me', text); planReply(id, text); },
    postStatus() { /* local feed is already in state.feed */ },
    like(entry) { if (entry.npc) relUp(entry.npc, 2); },
    follow(id, on) {
      const r = SO.people[id]; r.youFollow = on;
      if (on) { relUp(id, 5); if (!r.follows && R() < 0.25 + r.rel / 200) { r.follows = true; Sim.h.addFollowers(1); toast(person(id).av + ' @' + person(id).handle + ' followed you back', 'good'); } }
    },
  };
  let Adapter = LocalNPCAdapter;

  // ---------- DMs ----------
  function addMsg(id, from, text, extra) {
    const th = SO.threads[id] || (SO.threads[id] = []);
    th.push(Object.assign({ id: S.nextId++, from, text, t: S.t }, extra || {}));
    if (th.length > 40) th.shift();
    if (from !== 'me') { SO.unread[id] = (SO.unread[id] || 0) + 1; Sim.h.emit('dm', { from: id }); }
  }
  function receive(id, text, extra) { addMsg(id, 'them', text, extra); }
  function markRead(id) { SO.unread[id] = 0; }
  function unreadTotal() { return Object.values(SO.unread).reduce((a, b) => a + (b || 0), 0); }

  const KEYWORDS = [
    [/\b(gm|gn|hello|hi|hey)\b/i, { wholesome: ['gm gm! hope the grind is treating you well ☀️', 'gm fren 💜'], degen: ['gm. what are we aping today', 'gm ser. charts look spicy'], toxic: ['gm I guess', 'it is literally afternoon'], alpha: ['gm.', 'gm. watch the market today'], farmer: ['gm! did you do your check-ins?', 'gm farmer 🧑🏾‍🌾'], shill: ['gm! have you seen our deck? 🚀', 'gm superstar!'], scammer: ['Hello dear. Have you claimed your reward?'] }],
    [/\b(alpha|tip|leak|wen|signal)\b/i, { wholesome: ['best alpha: sleep 8h and ship', 'honestly? learn to read docs. that is the alpha'], degen: ['alpha is buying high and selling higher', 'I have no alpha, only conviction'], toxic: ['alpha is not DMing people for alpha', 'lol no'], alpha: ['keep an eye on news cycles. they move this market more than you think', 'when everyone is scared, look at protocol tokens'], farmer: ['check-in daily, bridge weekly, never more than a few wallets', 'farm protocols with real usage. sybil filters are brutal now'], shill: ['our token is the alpha 🚀', 'alpha? our TGE. you are early'], scammer: ['Big alpha: connect wallet at so1ana-claim.xyz'] }],
    [/\b(collab|space|together|cohost|co-host)\b/i, { wholesome: ['yes! let us cohost a Space soon 🎙️', 'always down to collab 💜'], degen: ['collab? only if there is a token', 'sure, if you shill my bags'], toxic: ['collab with you? bold', 'maybe after you hit 10k'], alpha: ['I do not collab. but I respect it', 'maybe.'], farmer: ['collab on a farming thread? 🧑🏾‍🌾', 'lets make a farming guide together'], shill: ['YES. rate card attached 📎', 'love it, lets talk budget'], scammer: ['Sure dear, first verify wallet'] }],
    [/\b(thanks|thank you|ty|appreciate)\b/i, { wholesome: ['anytime 💜', 'we all gonna make it'], degen: ['np ser', 'pay me in memecoins'], toxic: ['ok', 'sure'], alpha: ['👍', 'remember who told you'], farmer: ['np! good luck with the snapshot', 'np 🧑🏾‍🌾'], shill: ['of course! 🚀', 'my pleasure superstar'], scammer: ['Welcome. Now claim reward'] }],
    [/\b(scam|drainer|fake|report)\b/i, { wholesome: ['good call. stay safe out there 🛡️'], degen: ['been drained 3 times, I feel you'], toxic: ['imagine getting scammed lol'], alpha: ['always verify.'], farmer: ['never sign random txs ser'], shill: ['we are 100% legit (audit pending)'], scammer: ['This is official support. Trust.'] }],
  ];
  const FALLBACK = { wholesome: ['haha love that', 'so real', 'keep going, you are doing great'], degen: ['lmao', 'based', 'ok but are you long or short'], toxic: ['k', 'cool story', 'and?'], alpha: ['noted.', '…', 'interesting'], farmer: ['true true', 'back to farming 🧑🏾‍🌾', 'points are forever'], shill: ['great point! 🚀', 'love the energy', 'lets hop on a call'], scammer: ['Please claim reward urgently'] };

  function planReply(id, text) {
    const p = person(id);
    let opts = null;
    for (const [re, map] of KEYWORDS) if (re.test(text)) { opts = map[p.pers]; break; }
    if (!opts) opts = FALLBACK[p.pers];
    SO.queue.push({ t: S.t + randInt(5, 35), id, text: pick(opts) });
    if (p.pers !== 'scammer') relUp(id, 3);
    S.needs.social = clamp(S.needs.social + 2, 0, 100);
    if (/\b(collab|space|cohost|co-host)\b/i.test(text) && ['wholesome', 'farmer'].includes(p.pers) && SO.people[id].rel >= 30) {
      SO.queue.push({ t: S.t + randInt(20, 50), id, text: 'ok locked in: next time you host a Space I will co-host. double the reach 🎙️', collab: true });
    }
  }
  function sendDM(id, text) {
    text = String(text || '').trim().slice(0, 280);
    if (!text) return false;
    Adapter.sendDM(id, text);
    unlock('first_dm');
    return true;
  }

  // structured incoming DMs (offers, leaks, collabs, scams)
  function incomingDM(sleeping) {
    if (sleeping) return;
    const roll = R();
    const st = S.stats;
    if (roll < 0.22) {
      const p = person('scam1');
      receive('scam1', pick(['Congrats! Your wallet is eligible for 420 $SOL community airdrop 🎁 Claim: so1ana-claim.xyz', 'URGENT: suspicious activity on your wallet. Verify now at phantom-secure-login.app or funds will be frozen ⚠️', 'Hello dear, you won our NFT giveaway! Mint free at mintopia-free.claims']), { kind: 'scam', open: true });
      return;
    }
    if (roll < 0.42) {
      const ids = ['oracle', 'whale', 'dave'].filter((i) => SO.people[i].rel >= 20 || R() < 0.3);
      if (!ids.length || !Sim.Market) return;
      const id = pick(ids); const r = SO.people[id].rel;
      const toks = Object.values(Sim.Market.M.tokens).filter((t) => t.sym !== 'SOL' && !t.rugged);
      const tok = pick(toks); const dir = R() < 0.7 ? 1 : -1; const hours = randInt(3, 8);
      const real = R() < (id === 'dave' ? 0.4 : 0.55 + r / 250);
      Sim.Market.scheduleLeak(tok.sym, hours, dir, real);
      receive(id, dir > 0 ? 'psst. $' + tok.sym + ' has something big dropping in ~' + hours + 'h. you did not hear it from me 🤫' : 'heads up: team wallets on $' + tok.sym + ' look ready to dump in ~' + hours + 'h. be careful', { kind: 'alpha', sym: tok.sym });
      unlock('alpha_leak');
      return;
    }
    if (roll < 0.6 && st.followers >= 150) {
      const id = pick(['chad', 'shill', 'wendy', 'tunde']);
      const tier = id === 'shill' ? 'low' : id === 'chad' ? 'normal' : 'premium';
      const o = Sim.h.makeOffer(tier, true);
      S.offers.unshift(o);
      receive(id, id === 'shill' ? 'ser we pay ' + Sim.fmtSol(o.pay) + ' SOL for a ' + o.title.toLowerCase() + ' for ' + o.project + ' 🚀 no due diligence needed 😉' : 'hey! ' + o.project + ' is looking for a creator for a ' + o.title.toLowerCase() + '. ' + Sim.fmtSol(o.pay) + ' SOL. sent the brief to your gig board 📩', { kind: 'gig', offerId: o.id });
      Sim.h.emit('gig', {});
      return;
    }
    if (roll < 0.72 && Sim.NFT) {
      const d = Sim.NFT.N.drops.find((x) => x.phase === 'upcoming' && !x.wl);
      if (d) { receive('jpeg', 'got a spare WL for ' + d.name + ' ' + d.emoji + '. want it? first come first serve', { kind: 'wl', dropId: d.id, open: true }); return; }
    }
    if (roll < 0.82) {
      const id = pick(['wendy', 'tunde', 'kemi', 'ada']);
      receive(id, pick(['wanna co-host a Space this week? 🎙️', 'thinking of doing a collab thread. you in?', 'your last post was fire. lets do something together']), { kind: 'collab', open: true });
      return;
    }
    const id = pick(['wendy', 'ada', 'kemi', 'dave', 'frog', 'tunde']);
    const p = person(id);
    receive(id, pick({ wholesome: ['how is the grind going? 💜', 'saw your post, proud of you fr', 'remember to touch grass this week'], degen: ['bro are you in on $' + fill('{MEME}') + ' yet', 'I am down 60% today. how about you', 'mint tonight?'], toxic: ['your last post flopped lol', 'who writes your threads', 'ratio incoming'], farmer: ['did you check in on ' + fill('{PROTO}') + ' today?', 'how many wallets are you running? (asking for a fren)', 'snapshot szn is coming 🧑🏾‍🌾'] }[p.pers] || ['gm']));
  }

  function act(msgId, choice) {
    for (const [id, th] of Object.entries(SO.threads)) {
      const m = th.find((x) => x.id === msgId);
      if (!m || !m.open) continue;
      m.open = false;
      if (m.kind === 'scam') {
        if (choice === 'click') { S.pending = { kind: 'drainer' }; Sim.resolvePending('click'); addMsg(id, 'me', '*clicks link*'); receive(id, 'Thank you for verifying 🙏 (your SOL is ours now)'); }
        else { S.pending = { kind: 'drainer' }; Sim.resolvePending('ignore'); addMsg(id, 'me', 'blocked & reported 🛡️'); m.blocked = true; }
      } else if (m.kind === 'wl') {
        if (choice === 'yes') { const d = Sim.NFT && Sim.NFT.giveWL(m.dropId); addMsg(id, 'me', 'yes pls 🙏'); if (d) { receive(id, 'done, you are on the list for ' + d.name + ' ✅'); toast('📝 WL secured for ' + d.name + ' via @jpegjimmy', 'good'); relUp(id, 6); } else receive(id, 'ah too late, it is gone'); }
        else addMsg(id, 'me', 'nah, pass');
      } else if (m.kind === 'collab') {
        if (choice === 'yes') { S.flags.collab = '@' + person(id).handle; addMsg(id, 'me', 'lets do it 🤝'); receive(id, 'locked in! your next Space we co-host 🎙️'); relUp(id, 10); toast('🤝 Collab locked: your next X Space gets double reach.', 'good'); }
        else { addMsg(id, 'me', 'busy this week, next time!'); relUp(id, 1); }
      }
      return true;
    }
    return false;
  }

  // ---------- feed interactions ----------
  function like(entryId) {
    const e = S.feed.find((x) => x.id === entryId); if (!e || SO.liked[entryId]) return false;
    SO.liked[entryId] = 1; e.likes = (e.likes || 0) + 1;
    Adapter.like(e);
    S.needs.social = clamp(S.needs.social + 0.5, 0, 100);
    return true;
  }
  function repost(entryId) {
    const e = S.feed.find((x) => x.id === entryId); if (!e || SO.liked['rt' + entryId]) return false;
    SO.liked['rt' + entryId] = 1; e.rts = (e.rts || 0) + 1;
    if (e.npc) relUp(e.npc, 4);
    S.stats.clout = clamp(S.stats.clout + 0.5, 0, 100);
    return true;
  }
  function follow(id, on) { Adapter.follow(id, on); return true; }

  function npcPostNow(p) {
    p = p || pick(PEOPLE.filter((x) => x.pers !== 'scammer' || R() < 0.2));
    feed({ npc: p.id, name: p.name, handle: p.handle, av: p.av, text: fill(pick(POSTS[p.pers])), likes: randInt(3, 900), rts: randInt(0, 150), role: p.role });
  }

  mod.onPost = function (type, tier) {
    const mine = S.feed.find((e) => e.mine);
    const n = tier === 2 ? randInt(2, 4) : tier === 1 ? randInt(0, 2) : (R() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      let p = pick(PEOPLE.filter((x) => x.pers !== 'scammer'));
      if (tier === 0 && R() < 0.4) p = PEOPLE.find((x) => x.id === 'frog');
      const text = pick(REPLIES_TO_YOU[p.pers]);
      if (mine) { mine.thread = mine.thread || []; mine.thread.push({ npc: p.id, av: p.av, handle: p.handle, text }); }
      if (p.pers !== 'toxic') relUp(p.id, 1);
    }
    for (const p of PEOPLE) {
      const r = SO.people[p.id];
      if (!r.follows && p.pers !== 'scammer' && R() < 0.02 * (tier + 1) * (1 + S.stats.followers / 5000)) { r.follows = true; toast(p.av + ' @' + p.handle + ' (' + p.role + ') followed you', 'info'); }
    }
  };
  mod.onSpace = function () {
    for (const id of ['tunde', 'wendy']) if (R() < 0.5) relUp(id, 3);
  };
  mod.hourly = function (sleeping) {
    if (!sleeping && R() < 0.45) npcPostNow();
    if (R() < 0.12) incomingDM(sleeping);
  };
  mod.step = function () {
    if (!SO.queue.length) return;
    const due = SO.queue.filter((q) => q.t <= S.t);
    if (!due.length) return;
    SO.queue = SO.queue.filter((q) => q.t > S.t);
    for (const q of due) { receive(q.id, q.text); if (q.collab) { S.flags.collab = '@' + person(q.id).handle; toast('🤝 ' + S.flags.collab + ' will co-host your next Space.', 'good'); } }
  };

  Sim.Social = {
    mod, PEOPLE, person, sendDM, receive, markRead, unreadTotal, act, like, repost, follow, npcPostNow, incomingDM,
    setAdapter(a) { Adapter = a; }, get adapter() { return Adapter; }, get SO() { return SO; },
  };
  Sim.use(mod);
})(typeof window !== 'undefined' ? window : globalThis);
