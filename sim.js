/* CT Creator Sim — core simulation (no DOM). Works in browser (window.Sim) and node (module.exports). */
(function (root) {
  'use strict';

  const SAVE_KEY = 'ctsim.v1';
  const NEEDS = ['energy', 'hunger', 'fun', 'social', 'hygiene'];
  const NEED_META = {
    energy: { label: 'Energy', emoji: '⚡' },
    hunger: { label: 'Hunger', emoji: '🍜' },
    fun: { label: 'Fun', emoji: '🎮' },
    social: { label: 'Social', emoji: '💬' },
    hygiene: { label: 'Hygiene', emoji: '🚿' },
  };
  // need loss per in-game hour
  const DECAY = { energy: 4, hunger: 5.5, fun: 4.5, social: 3.2, hygiene: 2.8 };

  const ITEMS = {
    plant:    { name: 'Monstera Plant', emoji: '🪴', price: 0.15, desc: 'Fun decays 15% slower. Touching grass, but indoors.' },
    chair:    { name: 'Ergo Gaming Chair', emoji: '🪑', price: 0.4, desc: 'Desk work costs 25% less energy. Lumbar support for the grind.' },
    led:      { name: 'LED Strips', emoji: '🌈', price: 0.5, desc: 'Fun decays 15% slower and +5% post quality. Aesthetic is alpha.' },
    ringlight:{ name: 'Ring Light', emoji: '💡', price: 0.6, desc: '+8% post & Space quality. You look like a KOL now.' },
    coffee:   { name: 'Coffee Machine', emoji: '☕', price: 0.8, desc: 'Unlocks "Brew coffee" in the kitchen: fast energy refill.' },
    bed:      { name: 'Memory Foam Bed', emoji: '🛏️', price: 1.0, desc: 'Sleep restores energy 40% faster. Hunger drains slower overnight.' },
    monitor2: { name: 'Second Monitor', emoji: '🖥️', price: 1.2, desc: 'Threads take 20% less time, +10% post quality. Charts on the left, drafts on the right.' },
    gamingpc: { name: 'Gaming PC', emoji: '🕹️', price: 2.5, desc: '+15% quality, faster reply-guy & outreach, unlocks "Play games" at the desk.' },
  };

  const POST_TYPES = {
    gm:        { label: 'gm post', emoji: '☀️', mins: 15, fx: { energy: -3, fun: 2 }, viral: 0.03, flop: 0.30, gain: [[0, 2], [3, 9], [40, 90]], clout: [-1, 2, 8], rep: 0, shill: 0, cat: 'post' },
    meme:      { label: 'Meme', emoji: '🐸', mins: 30, fx: { energy: -5, fun: 8 }, viral: 0.10, flop: 0.40, gain: [[0, 4], [8, 20], [80, 250]], clout: [-2, 3, 12], rep: 0, shill: 0, cat: 'meme' },
    qt:        { label: 'Quote tweet', emoji: '🔁', mins: 20, fx: { energy: -4, fun: 3, social: 2 }, viral: 0.06, flop: 0.35, gain: [[0, 3], [5, 12], [50, 150]], clout: [-1, 2, 9], rep: 0, shill: 0, cat: 'qt' },
    thread:    { label: 'Alpha thread', emoji: '🧵', mins: 90, fx: { energy: -14, fun: -4 }, viral: 0.09, flop: 0.25, gain: [[2, 6], [20, 50], [200, 600]], clout: [0, 4, 15], rep: 2, shill: -3, cat: 'thread' },
    explainer: { label: 'Project explainer', emoji: '📚', mins: 120, fx: { energy: -18, fun: -6 }, viral: 0.06, flop: 0.20, gain: [[2, 5], [15, 40], [150, 450]], clout: [0, 3, 12], rep: 4, shill: -6, cat: 'thread' },
  };

  const POST_TEXT = {
    gm: ['gm. coffee first, alpha later ☕', 'gm to everyone except people who sold the bottom', 'gm. we are so early it is basically yesterday', 'gm ser. hydrate, then speculate', 'gm. today we build (after one more scroll)', 'gm to the 3am chart watchers only'],
    meme: ['me explaining to my family why I watch a green candle at 3am', 'my portfolio after "just one more trade" 📉🤡', 'devs: "we are not a memecoin"\nalso devs: *frog logo*', 'POV: you checked the chart during dinner', '"I only trade fundamentals" — guy holding $GLORP', 'nobody:\nCT at 2am: "this changes everything 🧵"'],
    qt: ['this. so much this.', 'ser this is a casino 🎰', 'bullish on whoever wrote this', 'saving this for the bear market', 'underrated take, ngl', 'adding context because CT needs it 👇'],
    thread: ['🧵 7 Solana protocols nobody is talking about (yet). A thread 👇', 'How restaking actually works, explained like you are 5. 1/12', 'I spent 40 hours reading docs so you do not have to 🧵', 'The airdrop meta is changing. Here is what smart wallets are doing 👇', 'Onchain data says something big is cooking. Let me show you 🧵'],
    explainer: ['What is $GLORP and why does it have a 40-page whitepaper? Breaking it down 🧵', 'Tokenomics 101: how to spot a rug before it spots you 🧵', 'Account abstraction, explained without the jargon 1/9', 'Everything a new user needs to know about bridging safely 🧵', 'Why liquidity matters more than the logo. A beginner guide 👇'],
  };

  const NPCS = [
    { name: 'degen dave', handle: 'degen_dave', av: '🦍' },
    { name: 'sol maxi', handle: 'solmaxi420', av: '🟣' },
    { name: 'anon frog', handle: 'anon_frog', av: '🐸' },
    { name: 'wagmi wendy', handle: 'wagmi_wendy', av: '🌸' },
    { name: 'chart whisperer', handle: 'chartwhisper', av: '📈' },
    { name: 'ser vibes', handle: 'ser_vibes', av: '😎' },
    { name: 'onchain oracle', handle: 'onchain_oracle', av: '🔮' },
  ];
  const CHATTER = [
    'just aped into something with a dog in a hat. not financial advice. not any advice.',
    'reminder: if the DM says "urgent airdrop" it is a drainer. stay safe frens',
    'who is hosting a Space tonight? I need voices in my ears',
    'bear market is when you build. bull market is when you post about building.',
    'CT is just 400 people and 2 million bots arguing. love it here',
    'my alpha group is just me and my notes app',
    'touched grass today. 0/10, no wifi',
    'every cycle someone says "this time is different". every cycle they are right and wrong',
    'engagement farming? no ser, I call it community building',
    'just got left on read by a project with 300 followers. humbling.',
    'the real alpha was the mutuals we made along the way',
    'wen mainnet. wen token. wen sleep.',
  ];
  const PROJECTS = ['Glorp Protocol', 'Nebula DEX', 'Rugless Labs', 'YieldYeti', 'Mintopia', 'Restake Rangers', 'Kumbaya DAO', 'Lagos Layer', 'SolSpaghetti', 'Orbit Lend', 'Pixel Pals', 'Quokka Bridge', 'Snek AI', 'Vibe Vaults'];
  const LOW_PROJECTS = ['$FROGWIFHAT2', 'SafeMoonCat', 'Elon Inu Classic', '$PUMPKINU', 'DogeKiller9000', '$RUGMAXX', 'MoonShot Mega'];

  const GIG_TYPES = [
    { id: 'meme',    title: 'Meme campaign',     reqs: [{ kind: 'meme', n: 3 }], days: 2, pay: [0.15, 0.30], minF: 250, minRep: 0, lowBias: 0.6 },
    { id: 'qtraid',  title: 'QT raid',           reqs: [{ kind: 'qt', n: 3 }], days: 1, pay: [0.12, 0.25], minF: 250, minRep: 0, lowBias: 0.8 },
    { id: 'launch',  title: 'Launch coverage',   reqs: [{ kind: 'thread', n: 2 }], days: 2, pay: [0.25, 0.50], minF: 250, minRep: 25, lowBias: 0.3 },
    { id: 'space',   title: 'Space hosting',     reqs: [{ kind: 'space', n: 1 }], days: 2, pay: [0.30, 0.70], minF: 500, minRep: 35, lowBias: 0.25 },
    { id: 'package', title: 'Thread package',    reqs: [{ kind: 'thread', n: 3 }], days: 3, pay: [0.40, 0.80], minF: 600, minRep: 40, lowBias: 0.15 },
    { id: 'amb',     title: 'Ambassador role',   reqs: [{ kind: 'post', n: 5 }, { kind: 'space', n: 1 }], days: 5, pay: [1.0, 2.2], minF: 1500, minRep: 50, lowBias: 0.1 },
    { id: 'kol',     title: 'KOL round promo',   reqs: [{ kind: 'post', n: 2 }, { kind: 'thread', n: 1 }], days: 2, pay: [0.6, 1.4], minF: 5000, minRep: 55, lowBias: 0.2 },
  ];
  const REQ_LABEL = { post: 'posts (any)', meme: 'memes', qt: 'quote tweets', thread: 'threads', space: 'Spaces hosted' };

  const TITLES = [
    { name: 'Lurker', min: 0 },
    { name: 'Reply Guy', min: 250 },
    { name: 'Micro Creator', min: 1000 },
    { name: 'KOL', min: 10000 },
    { name: 'CT Legend', min: 50000, rep: 60 },
  ];

  const CAREERS = {
    creator: { name: 'CT Creator / KOL', emoji: '🎙️', desc: 'Post, thread, host Spaces, land paid gigs.', titles: [['Lurker', 0], ['Reply Guy', 250], ['Micro Creator', 1000], ['KOL', 10000], ['CT Legend', 50000]] },
    farmer:  { name: 'Airdrop Farmer', emoji: '🪂', desc: 'Testnets, bridges, quests, check-ins. Points now, bags at TGE.', titles: [['Testnet Tourist', 0], ['Quest Grinder', 150], ['Points Maxi', 600], ['Airdrop Hunter', 2000], ['Sybil Lord', 6000]] },
    trader:  { name: 'Whale / Trader', emoji: '🐋', desc: 'Trade the fake market. React to news. Become the exit liquidity of others.', titles: [['Exit Liquidity', 0], ['Paper Hands', 100], ['Swing Trader', 500], ['Whale', 2000], ['Market Maker', 6000]] },
    degen:   { name: 'NFT Degen / Minter', emoji: '🖼️', desc: 'Grind WLs, win gas wars, flip JPEGs, chase rare traits.', titles: [['JPEG Enjoyer', 0], ['Mint Sniper', 120], ['Floor Sweeper', 500], ['Blue Chip Collector', 1800], ['NFT Royalty', 5000]] },
    builder: { name: 'Builder / Dev', emoji: '🛠️', desc: 'Ship code, win hackathons, earn grants. Touch less grass.', titles: [['Script Kiddie', 0], ['Hackathon Hero', 150], ['Protocol Dev', 600], ['Core Contributor', 2000], ['Founder', 6000]] },
  };
  const HOMES = [
    { name: 'Studio Apartment', emoji: '🏚️', rent: 0.3, deposit: 0, minNW: 0, floor: ['#2a2118', '#30261b'], wall: '#1b1f2a', view: 'city', moodBonus: 0 },
    { name: 'Lekki 1BR Flat', emoji: '🏠', rent: 0.8, deposit: 4, minNW: 8, floor: ['#3a2d22', '#43342680'], wall: '#1e2a2a', view: 'lagoon', moodBonus: 0.08 },
    { name: 'Sky Penthouse', emoji: '🏙️', rent: 2, deposit: 20, minNW: 40, floor: ['#2b2d36', '#33363f'], wall: '#211b33', view: 'skyline', moodBonus: 0.15 },
    { name: 'Dubai Villa', emoji: '🏝️', rent: 5, deposit: 80, minNW: 150, floor: ['#d8cdb8', '#cfc3ac'], wall: '#2a2340', view: 'sea', moodBonus: 0.25 },
  ];

  const ACHIEVEMENTS = {
    first_post:  { name: 'Hello, CT', desc: 'Publish your first post', emoji: '✍️' },
    first_viral: { name: 'Main Character', desc: 'Go viral for the first time', emoji: '🚀' },
    ratioed:     { name: 'Character Development', desc: 'Get ratioed', emoji: '💀' },
    kol_qt:      { name: 'Noticed', desc: 'Get quote-tweeted by a big KOL', emoji: '👀' },
    first_space: { name: 'Mic Check', desc: 'Host your first X Space', emoji: '🎙️' },
    f1k:         { name: '1k Club', desc: 'Reach 1,000 followers', emoji: '🎉' },
    f10k:        { name: 'Blue Check Energy', desc: 'Reach 10,000 followers', emoji: '💎' },
    first_gig:   { name: 'Paid Creator', desc: 'Complete your first SOL gig', emoji: '💸' },
    sol10:       { name: 'Double Digits', desc: 'Earn 10 SOL total', emoji: '🏦' },
    first_buy:   { name: 'Setup Upgrade', desc: 'Buy your first upgrade', emoji: '🛒' },
    grass:       { name: 'Touched Grass', desc: 'Go outside. Willingly.', emoji: '🌱' },
    dodged:      { name: 'Not Today, Drainer', desc: 'Ignore a drainer DM', emoji: '🛡️' },
    drained:     { name: 'Expensive Lesson', desc: 'Click a drainer link', emoji: '🪤' },
    legend:      { name: 'CT Legend', desc: 'Reach the final title', emoji: '👑' },
    moved:       { name: 'Upgraded Life', desc: 'Move to a bigger place', emoji: '🔑' },
    rent_late:   { name: 'Landlord Is Typing...', desc: 'Miss a rent payment', emoji: '🧾' },
  };

  // ---------- helpers ----------
  let rng = Math.random;
  const R = () => rng();
  const rand = (a, b) => a + R() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r2 = (v) => Math.round(v * 10000) / 10000;
  const fmtSol = (v) => (Math.abs(v) < 10 ? (Math.round(v * 1000) / 1000).toFixed(3) : (Math.round(v * 100) / 100).toFixed(2));
  const fmtNum = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : n >= 1000 ? (n / 1000).toFixed(2) + 'k' : String(Math.round(n));

  let S = null; // state
  let out = []; // transient events for UI
  const mods = []; // pluggable modules: market, airdrop, nft, social, ...
  function use(mod) {
    mods.push(mod);
    if (mod.achievements) Object.assign(ACHIEVEMENTS, mod.achievements);
    return mod;
  }
  function mod(id) { return mods.find((m) => m.id === id); }
  function modCall(fn, ...args) { for (const m of mods) if (m[fn]) m[fn](...args); }

  function emit(kind, data) { out.push(Object.assign({ kind }, data)); }
  function toast(text, tone) { emit('toast', { text, tone: tone || 'info' }); }
  function feed(entry) {
    S.feed.unshift(Object.assign({ id: S.nextId++, t: S.t }, entry));
    if (S.feed.length > 70) S.feed.length = 70;
  }
  function sys(text, av) { feed({ name: 'CT Sim', handle: 'ctsim', av: av || '🤖', text, sys: true }); }
  function npcPost(text, npc) { npc = npc || pick(NPCS); feed({ name: npc.name, handle: npc.handle, av: npc.av, text, likes: randInt(3, 900), rts: randInt(0, 120) }); }

  function day() { return Math.floor(S.t / 1440) + 1; }
  function minOfDay() { return ((S.t % 1440) + 1440) % 1440; }
  function hour() { return Math.floor(minOfDay() / 60); }
  function fmtClock(t) {
    if (t === undefined) t = S.t;
    const m = ((t % 1440) + 1440) % 1440; let h = Math.floor(m / 60); const mm = Math.floor(m % 60);
    const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return h + ':' + String(mm).padStart(2, '0') + ' ' + ap;
  }
  function fmtStamp(t) { return 'D' + (Math.floor(t / 1440) + 1) + ' ' + fmtClock(t); }
  function fmtDur(mins) { mins = Math.round(mins); const h = Math.floor(mins / 60), m = mins % 60; return (h ? h + 'h' : '') + (m ? (h ? ' ' : '') + m + 'm' : (h ? '' : '0m')); }

  // ---------- state ----------
  function freshState(player) {
    return {
      v: 1,
      player: Object.assign({ name: 'Trex', handle: 'Trextxxy', color: '#9945FF', hat: 'cap', careers: ['creator'] }, player || {}),
      t: 9 * 60, // absolute game minutes (day 1, 9:00 AM)
      needs: { energy: 80, hunger: 70, fun: 70, social: 60, hygiene: 75 },
      stats: { followers: 150, clout: 10, rep: 50, shill: 0, sol: 0.5, earned: 0, posts: 0, virals: 0, spaces: 0, gigsDone: 0, peakFollowers: 150 },
      items: {},
      offers: [],
      gigs: [],
      action: null,
      feed: [],
      ach: {},
      flags: { alpha: false, shadowUntil: -1, gigHint: false, title: 'Lurker' },
      market: 1,
      lastHour: 9,
      lastDaily: 0,
      pending: null,
      nextId: 1,
      career: { xp: { creator: 0, farmer: 0, trader: 0, degen: 0, builder: 0 } },
      home: { tier: 0, missed: 0, debt: 0, nextRent: 7 * 1440 + 8 * 60 },
      nw: [],
    };
  }

  function newGame(player) {
    S = freshState(player);
    out = [];
    for (const m of mods) if (m.init) m.init(S, true);
    sys('Welcome to Web3, @' + S.player.handle + '. 150 followers, 0.50 SOL and a dream. Click objects in your apartment to grind. wagmi 🫡', '🫡');
    daily(true);
    recordNW();
    return S;
  }

  function load(json) {
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      if (!data || data.v !== 1) return null;
      const base = freshState(data.player);
      S = Object.assign(base, data);
      S.needs = Object.assign(base.needs, data.needs);
      S.stats = Object.assign(freshState().stats, data.stats);
      S.flags = Object.assign(freshState().flags, data.flags);
      S.career = { xp: Object.assign(freshState().career.xp, (data.career || {}).xp) };
      S.home = Object.assign(freshState().home, data.home);
      for (const m of mods) if (m.init) m.init(S, false);
      out = [];
      return S;
    } catch (e) { return null; }
  }
  function save() { return JSON.stringify(S); }

  // ---------- derived ----------
  function mood() {
    const n = S.needs;
    return (n.energy * 1.2 + n.hunger * 1.2 + n.fun + n.social * 0.8 + n.hygiene * 0.8) / 5;
  }
  function quality() {
    let q = 0.5 + mood() / 100 * 0.6 + HOMES[S.home.tier].moodBonus * 0.3;
    for (const k of NEEDS) if (S.needs[k] < 20) q -= 0.08;
    const it = S.items;
    let gear = 1 + (it.ringlight ? 0.08 : 0) + (it.led ? 0.05 : 0) + (it.monitor2 ? 0.10 : 0) + (it.gamingpc ? 0.15 : 0);
    return clamp(q, 0.3, 1.2) * gear;
  }
  function scale() { return Math.sqrt(1 + S.stats.followers / 400); }
  function title() {
    let t = TITLES[0];
    for (const x of TITLES) if (S.stats.followers >= x.min && (!x.rep || S.stats.rep >= x.rep)) t = x;
    return t.name;
  }
  function nextTitle() {
    const i = TITLES.findIndex((x) => x.name === title());
    return TITLES[i + 1] || null;
  }
  function gigsUnlocked() { return S.stats.followers >= 250; }
  function shadowbanned() { return S.t < S.flags.shadowUntil; }

  // ---------- careers ----------
  function careerMetric(id) { return id === 'creator' ? S.stats.followers : Math.round(S.career.xp[id] || 0); }
  function careerTitle(id) {
    const c = CAREERS[id]; let t = c.titles[0][0];
    for (const [name, min] of c.titles) if (careerMetric(id) >= min && !(id === 'creator' && name === 'CT Legend' && S.stats.rep < 60)) t = name;
    return t;
  }
  function careerNext(id) {
    const c = CAREERS[id]; const cur = careerTitle(id);
    const i = c.titles.findIndex((x) => x[0] === cur);
    return c.titles[i + 1] ? { name: c.titles[i + 1][0], min: c.titles[i + 1][1], prev: c.titles[i][1] } : null;
  }
  function focus(id) { return (S.player.careers || []).includes(id); }
  function focusMult(id) { return focus(id) ? 1.2 : 1; }
  function addXP(id, n) {
    const before = careerTitle(id);
    S.career.xp[id] = (S.career.xp[id] || 0) + n * focusMult(id);
    const after = careerTitle(id);
    if (after !== before) { toast(CAREERS[id].emoji + ' ' + CAREERS[id].name + ' rank up: ' + after, 'good'); sys('@' + S.player.handle + ' ranked up to ' + after + ' (' + CAREERS[id].name + ').', CAREERS[id].emoji); }
  }
  function toggleCareer(id) {
    const c = S.player.careers;
    const i = c.indexOf(id);
    if (i >= 0) { if (c.length > 1) c.splice(i, 1); else { toast('Keep at least one focus career.', 'bad'); return false; } }
    else { if (c.length >= 3) { toast('Max 3 focus careers. Even grinders sleep.', 'bad'); return false; } c.push(id); }
    return true;
  }
  function primaryTitle() { const id = (S.player.careers || ['creator'])[0]; return careerTitle(id); }

  // ---------- net worth & home ----------
  function netWorth() {
    let v = S.stats.sol;
    for (const m of mods) if (m.netWorth) v += m.netWorth();
    return v;
  }
  function recordNW() {
    S.nw.push([S.t, r2(netWorth())]);
    if (S.nw.length > 240) S.nw.shift();
  }
  function moveHome(tier) {
    const h = HOMES[tier]; if (!h) return false;
    if (tier === S.home.tier) return false;
    if (tier > S.home.tier && netWorth() < h.minNW) { toast('Landlord wants proof of ' + h.minNW + ' SOL net worth. Keep grinding.', 'bad'); return false; }
    if (S.stats.sol < h.deposit) { toast('Need ' + h.deposit + ' SOL liquid for the deposit.', 'bad'); return false; }
    S.stats.sol = r2(S.stats.sol - h.deposit);
    S.home.tier = tier; S.home.missed = 0;
    toast(h.emoji + ' Moved into ' + h.name + '. Rent: ' + h.rent + ' SOL/week.', 'good');
    sys('@' + S.player.handle + ' just moved into a ' + h.name + '. Up only 📈', h.emoji);
    if (tier > 0) unlock('moved');
    return true;
  }
  function payRent() {
    const h = HOMES[S.home.tier];
    const due = r2(h.rent + S.home.debt);
    if (S.stats.sol >= due) {
      S.stats.sol = r2(S.stats.sol - due); S.home.debt = 0; S.home.missed = 0;
      toast('🧾 Rent paid: ' + fmtSol(due) + ' SOL (' + h.name + ')', 'info');
    } else {
      S.home.debt = due; S.home.missed++;
      S.needs.fun = clamp(S.needs.fun - 20, 0, 100);
      unlock('rent_late');
      if (S.home.missed >= 2 && S.home.tier > 0) {
        S.home.tier--; S.home.debt = 0; S.home.missed = 0;
        toast('🚪 Evicted for unpaid rent. Back to the ' + HOMES[S.home.tier].name + '.', 'bad');
      } else toast('🧾 Could not pay rent (' + fmtSol(due) + ' SOL). Landlord: "ser, it is been a week." Pay next week or get evicted.', 'bad');
    }
    S.home.nextRent += 7 * 1440;
  }

  // ---------- actions ----------
  // obj ids: desk, phone, bed, kitchen, couch, shower, door
  function A() {
    const it = S.items;
    const deskE = it.chair ? 0.75 : 1;
    const list = {};
    for (const [k, p] of Object.entries(POST_TYPES)) {
      let mins = p.mins;
      if (p.cat === 'thread' && it.monitor2) mins *= 0.8;
      const fx = Object.assign({}, p.fx);
      fx.energy = fx.energy * deskE;
      list['post_' + k] = { obj: 'desk', group: p.cat === 'thread' ? 'Make a thread' : 'Write a post', label: p.label, emoji: p.emoji, mins, fx, work: true, done: () => resolvePost(k) };
    }
    list.reply = { obj: 'desk', group: 'Work', label: 'Reply-guy session', emoji: '💬', mins: it.gamingpc ? 45 : 60, fx: { energy: -8 * deskE, social: 12, fun: 4 }, work: true, done: doReply };
    list.outreach = { obj: 'desk', group: 'Work', label: 'DM projects (outreach)', emoji: '📨', mins: it.gamingpc ? 35 : 45, fx: { energy: -6 * deskE, social: 5 }, work: true, done: doOutreach };
    if (it.gamingpc) list.games = { obj: 'desk', group: 'Work', label: 'Play games', emoji: '🕹️', mins: 60, fx: { fun: 30, energy: -5, social: 4 } };

    list.scroll = { obj: 'phone', label: 'Scroll CT', emoji: '📱', mins: 30, fx: { fun: 15, energy: -5, social: 4 }, done: doScroll };
    list.space = { obj: 'phone', label: 'Host an X Space', emoji: '🎙️', mins: 90, fx: { energy: -15, social: 30, fun: 8 }, work: true, minFollowers: 200, done: doSpace };
    list.dms = { obj: 'phone', label: 'Check DMs', emoji: '📩', mins: 10, fx: { social: 3 }, done: doDms };

    const rate = it.bed ? 17.5 : 12.5;
    const sleepMins = clamp(Math.ceil((100 - S.needs.energy) / rate * 60), 60, 600);
    list.sleep = { obj: 'bed', label: 'Sleep', emoji: '😴', mins: sleepMins, fx: { energy: rate * sleepMins / 60, fun: 4 }, sleep: true, done: () => sys('Slept ' + fmtDur(sleepMins) + '. Rugs happened while you slept. You missed all of them. Lucky.', '🌙') };
    list.nap = { obj: 'bed', label: 'Power nap', emoji: '💤', mins: 60, fx: { energy: 15 }, sleep: true };

    list.order = { obj: 'kitchen', label: 'Order food', emoji: '🛵', mins: 20, cost: 0.05, fx: { hunger: 60, fun: 4 } };
    list.cook = { obj: 'kitchen', label: 'Cook (cheap)', emoji: '🍳', mins: 45, cost: 0.01, fx: { hunger: 50, fun: 3, energy: -3 } };
    list.snack = { obj: 'kitchen', label: 'Grab a snack', emoji: '🍪', mins: 5, fx: { hunger: 12 } };
    if (it.coffee) list.coffee = { obj: 'kitchen', label: 'Brew coffee', emoji: '☕', mins: 10, fx: { energy: 18, hunger: -2, fun: 2 } };

    list.tv = { obj: 'couch', label: 'Chill & watch TV', emoji: '📺', mins: 60, fx: { fun: 25, energy: 4 } };
    list.yt = { obj: 'couch', label: 'Watch crypto YouTube', emoji: '🎬', mins: 45, fx: { fun: 10, energy: 2 }, done: () => { if (R() < 0.3) { S.flags.alpha = true; toast('💡 Spotted some alpha. Next thread gets a boost.', 'good'); } } };

    list.shower = { obj: 'shower', label: 'Quick shower', emoji: '🚿', mins: 20, fx: { hygiene: 75, fun: 3 } };
    list.longshower = { obj: 'shower', label: 'Long shower (think)', emoji: '🧼', mins: 40, fx: { hygiene: 100, fun: 10 }, done: () => { if (R() < 0.3) { S.flags.alpha = true; toast('🚿 Shower thought: a banger thread idea. Next thread boosted.', 'good'); } } };

    list.grass = { obj: 'door', label: 'Touch grass', emoji: '🌳', mins: 180, fx: { fun: 35, social: 35, hygiene: -10, energy: -8, hunger: -5 }, outside: true, clean: true, done: doGrass };
    list.meetup = { obj: 'door', label: 'Crypto meetup', emoji: '🍻', mins: 240, cost: 0.03, fx: { social: 50, fun: 20, energy: -15, hygiene: -8 }, outside: true, clean: true, done: doMeetup };
    list.code = { obj: 'desk', group: 'Build', label: 'Ship code (builder)', emoji: '👨‍💻', mins: it.monitor2 ? 100 : 120, fx: { energy: -16 * deskE, fun: -2, social: -3 }, work: true, done: doCode };
    list.hackathon = { obj: 'desk', group: 'Build', label: 'Weekend hackathon', emoji: '🏆', mins: 360, fx: { energy: -35 * deskE, fun: 10, social: 15, hunger: -15 }, work: true, minXP: ['builder', 150], done: doHackathon };
    for (const m of mods) if (m.actions) Object.assign(list, m.actions(it, deskE));
    return list;
  }

  function actionsFor(obj) {
    const list = A();
    return Object.entries(list).filter(([, a]) => a.obj === obj && !a.hidden).map(([id, a]) => {
      const why = check(id, true);
      return { id, label: a.label, emoji: a.emoji, group: a.group || null, mins: a.mins, cost: a.cost || 0, disabled: why || null, fx: a.fx };
    });
  }

  function check(id, quiet) {
    const a = A()[id];
    if (!a) return 'Unknown action';
    const n = S.needs;
    let why = null;
    if (S.pending) why = 'Deal with your DMs first';
    else if (a.cost && S.stats.sol < a.cost) why = 'Not enough SOL. ngmi (for now)';
    else if (a.minFollowers && S.stats.followers < a.minFollowers) why = 'Need ' + a.minFollowers + ' followers to host';
    else if (a.minXP && (S.career.xp[a.minXP[0]] || 0) < a.minXP[1]) why = 'Need ' + a.minXP[1] + ' ' + CAREERS[a.minXP[0]].name + ' XP';
    else if (a.req && a.req()) why = a.req();
    else if (a.work && n.energy < 12) why = 'Too tired, ser. Sleep first 😴';
    else if (a.work && n.hunger < 8) why = 'Too hungry to think. Eat something 🍜';
    else if (a.work && n.fun < 8) why = 'Not in the mood. Needs some fun first 🎮';
    else if (a.clean && n.hygiene < 15) why = 'You smell like a rug pull. Shower first 🚿';
    else if (a.sleep && id === 'sleep' && n.energy > 90) why = 'Not sleepy. Too much alpha to read';
    if (why && !quiet) toast(why, 'bad');
    return why;
  }

  function startAction(id) {
    if (check(id)) return false;
    const a = A()[id];
    if (a.cost) S.stats.sol = r2(S.stats.sol - a.cost);
    if (a.onStart) a.onStart();
    S.action = { id, obj: a.obj, label: a.label, emoji: a.emoji, mins: a.mins, fx: a.fx, prog: 0, sleep: !!a.sleep, outside: !!a.outside };
    return true;
  }
  function cancelAction() {
    if (!S.action) return;
    if (S.action.id === 'passout') return;
    S.action = null;
  }
  function finishAction() {
    const act = S.action; S.action = null;
    if (act.id === 'passout') { sys('You woke up on the floor with a keyboard imprint on your face. Still bullish.', '🫠'); return; }
    const def = A()[act.id];
    if (def && def.done) def.done();
  }

  // ---------- outcomes ----------
  function addFollowers(n) {
    S.stats.followers = Math.max(0, Math.round(S.stats.followers + n));
    S.stats.peakFollowers = Math.max(S.stats.peakFollowers, S.stats.followers);
  }
  function progressGigs(kind) {
    for (const g of S.gigs) g.reqs.forEach((r, i) => { if ((r.kind === kind || (r.kind === 'post' && kind !== 'space')) && g.prog[i] < r.n) g.prog[i]++; });
  }
  function postKind(type) { return POST_TYPES[type].cat; }

  function resolvePost(type) {
    const P = POST_TYPES[type];
    let q = quality();
    let boosted = false;
    if (S.flags.alpha && P.cat === 'thread') { q *= 1.35; S.flags.alpha = false; boosted = true; }
    const sb = shadowbanned() ? 0.5 : 1;
    const viralP = clamp(P.viral * q * (1 + S.stats.clout / 80) * sb, 0, 0.6);
    const flopP = clamp(P.flop / q / sb, 0.05, 0.85);
    const roll = R();
    const tier = roll < viralP ? 2 : roll < viralP + flopP ? 0 : 1;
    const [lo, hi] = P.gain[tier];
    const gain = Math.round(randInt(lo, hi) * scale() * q * sb);
    addFollowers(gain);
    S.stats.clout = clamp(S.stats.clout + P.clout[tier], 0, 100);
    S.stats.rep = clamp(S.stats.rep + P.rep * (tier ? 1 : 0.5), 0, 100);
    S.stats.shill = clamp(S.stats.shill + P.shill, 0, 100);
    S.stats.posts++;
    if (tier === 2) S.stats.virals++;
    const likes = Math.max(0, Math.round((gain + randInt(1, 6)) * rand(2.5, 6) * (tier === 2 ? 3 : 1)));
    feed({ name: S.player.name, handle: S.player.handle, av: 'me', text: pick(POST_TEXT[type]), likes, rts: Math.round(likes * rand(0.08, 0.3)), replies: Math.round(likes * rand(0.05, 0.2)), mine: true, tier });
    const tierTxt = ['flopped 🫠', 'did decent 👍', 'went VIRAL 🚀'][tier];
    toast(P.emoji + ' ' + P.label + ' ' + tierTxt + ' · +' + gain + ' followers' + (boosted ? ' (alpha boost)' : ''), tier === 2 ? 'good' : tier === 0 ? 'bad' : 'info');
    unlock('first_post');
    if (tier === 2) unlock('first_viral');
    progressGigs(postKind(type));
    modCall('onPost', type, tier, gain);
    // random events
    if ((tier === 0 && R() < 0.22) || R() < 0.03) ratioed();
    else if (tier >= 1 && R() < 0.05) kolQT();
    return { tier, gain };
  }

  function ratioed() {
    const lost = randInt(2, 10);
    addFollowers(-lost);
    S.stats.clout = clamp(S.stats.clout - 6, 0, 100);
    S.needs.fun = clamp(S.needs.fun - 10, 0, 100);
    const npc = NPCS[2];
    feed({ name: npc.name, handle: npc.handle, av: npc.av, text: pick(['ratio + L + who asked', 'ratio. not your keys, not your take', 'ratio + you fell off + touch grass', 'counterpoint: no. also ratio']), likes: randInt(200, 2000), rts: randInt(10, 200), ratio: true });
    toast('💀 You got ratioed by an anon with a frog pfp. -' + lost + ' followers', 'bad');
    unlock('ratioed');
  }
  function kolQT() {
    const extra = Math.round(30 + S.stats.followers * 0.06 + randInt(50, 200));
    addFollowers(extra);
    S.stats.clout = clamp(S.stats.clout + 10, 0, 100);
    feed({ name: 'Big KOL', handle: 'bigkol_sol', av: '🐋', text: pick(['this guy gets it 👇', 'underrated account, follow them', 'best take on the TL today', 'ser cooked with this one']), likes: randInt(2000, 9000), rts: randInt(300, 1500), quote: true });
    toast('🐋 A big KOL quote-tweeted you! +' + extra + ' followers', 'good');
    unlock('kol_qt');
  }

  function doReply() {
    const g = Math.round(randInt(2, 8) * scale() * quality());
    addFollowers(g);
    S.stats.clout = clamp(S.stats.clout + 2, 0, 100);
    if (R() < 0.07) {
      const extra = Math.round(20 + randInt(10, 40) * scale());
      addFollowers(extra);
      toast('💬 A big account replied to your reply. +' + (g + extra) + ' followers', 'good');
    } else toast('💬 Reply-guy session done. +' + g + ' followers. The grind is real.', 'info');
  }
  function doOutreach() {
    const st = S.stats;
    const chance = clamp(0.18 + st.rep / 250 + Math.min(st.followers / 20000, 0.15) - st.shill / 300, 0.08, 0.7);
    if (R() < chance) {
      const o = makeOffer('premium', true);
      if (o) {
        S.offers.unshift(o);
        feed({ name: o.project, handle: o.project.toLowerCase().replace(/[^a-z0-9]/g, ''), av: '🤝', text: pick(['ser we love your content. sending a brief 📩', 'gm! saw your threads. want to work together?', 'we have budget. you have reach. lets talk 🤝']), dm: true });
        toast('📨 ' + o.project + ' replied! New premium gig in your inbox.', 'good');
        return;
      }
    }
    toast(pick(['📨 Left on read 👀', '📨 "Seen 2:14 AM". Brutal.', '📨 They replied "gm". That is it. Just gm.', '📨 Their intern said they will "circle back"']), 'info');
  }
  function doScroll() {
    if (R() < 0.3) { S.flags.alpha = true; toast('💡 Spotted alpha while scrolling. Next thread gets a boost.', 'good'); }
    else if (R() < 0.15 && !S.pending) { triggerDrainer(); }
    else npcPost(pick(CHATTER));
  }
  function doSpace() {
    const q = quality() * (S.items.ringlight ? 1.05 : 1);
    let g = Math.round(randInt(10, 30) * scale() * q * (S.flags.collab ? 2 : 1));
    if (S.flags.collab) { toast('🤝 Co-hosted with ' + S.flags.collab + '. Double reach!', 'good'); S.flags.collab = null; }
    let msg = '🎙️ Space wrapped. +' + g + ' followers';
    if (R() < 0.12) { const e = Math.round(40 + randInt(20, 80) * scale()); g += e; msg = '🎙️ A big name joined your Space as a speaker! +' + g + ' followers'; }
    addFollowers(g);
    S.stats.clout = clamp(S.stats.clout + 5, 0, 100);
    S.stats.spaces++;
    if (S.needs.hygiene < 25) msg += '. Good thing nobody can smell you on Spaces.';
    toast(msg, 'good');
    feed({ name: S.player.name, handle: S.player.handle, av: 'me', text: '🎙️ Space recap: ' + randInt(40, 400) + ' listeners, zero mic feedback (mostly). thanks for pulling up frens', likes: randInt(20, 200) + g, rts: randInt(3, 30), mine: true });
    unlock('first_space');
    progressGigs('space');
    modCall('onSpace', g);
  }
  function doDms() {
    if (R() < 0.4 && !S.pending) return triggerDrainer();
    toast(pick(['📩 14 DMs: 12 "gm", 1 "pls promote", 1 from your mom.', '📩 Someone wants you to "check out their project". It is a frog.', '📩 A fren sent you a meme. Fun restored slightly.', '📩 Nothing new. Inbox zero. Suspicious.']), 'info');
  }
  function doGrass() {
    toast('🌳 You touched grass. It was... nice? Fun & social restored.', 'good');
    unlock('grass');
  }
  function doMeetup() {
    if (R() < 0.35) {
      const o = makeOffer('premium', true);
      if (o) { S.offers.unshift(o); toast('🍻 Met the ' + o.project + ' team at the meetup. They sent a gig offer!', 'good'); return; }
    }
    toast('🍻 Meetup done. Collected 3 stickers, 2 lanyards and 0 alpha.', 'info');
  }

  function doCode() {
    const q = quality();
    const xp = Math.round(randInt(15, 35) * q);
    addXP('builder', xp);
    const b = S.flags.build = S.flags.build || { progress: 0, shipped: 0, users: 0 };
    b.progress += Math.round(randInt(12, 25) * q * focusMult('builder'));
    if (b.progress >= 100) {
      b.progress = 0; b.shipped++;
      const users = Math.round(randInt(20, 200) * (1 + b.shipped * 0.5) * q);
      b.users += users;
      const grant = r2(rand(0.2, 0.6) * (1 + b.shipped * 0.3) * S.market);
      S.stats.sol = r2(S.stats.sol + grant); S.stats.earned = r2(S.stats.earned + grant);
      addFollowers(Math.round(users / 4));
      toast('🚢 Shipped v' + b.shipped + '! +' + users + ' users and a ' + fmtSol(grant) + ' SOL ecosystem grant.', 'good');
      feed({ name: S.player.name, handle: S.player.handle, av: 'me', text: 'shipped v' + b.shipped + ' of my side project 🚢 ' + b.users + ' users and counting. built different (literally, it is on testnet)', likes: randInt(40, 300), rts: randInt(5, 60), mine: true });
      addXP('builder', 40);
    } else toast('👨‍💻 Pushed commits. Build progress ' + b.progress + '%. +' + xp + ' builder XP', 'info');
  }
  function doHackathon() {
    addXP('builder', 80);
    const place = R() < 0.25 * quality() * focusMult('builder') ? 1 : R() < 0.45 ? 2 : 0;
    if (place) {
      const prize = r2((place === 1 ? rand(2, 5) : rand(0.5, 1.5)) * S.market);
      S.stats.sol = r2(S.stats.sol + prize); S.stats.earned = r2(S.stats.earned + prize);
      addFollowers(Math.round(randInt(30, 120) * scale()));
      toast('🏆 Hackathon ' + (place === 1 ? '1st place' : 'runner-up') + '! Prize: ' + fmtSol(prize) + ' SOL', 'good');
    } else toast('🏆 Hackathon done. No prize, but the judges called your demo "interesting". +80 XP', 'info');
  }

  function triggerDrainer() {
    S.pending = { kind: 'drainer', from: pick(['Solana Support 🛡️', 'Phantom Team ✅', 'Airdrop Official', 'Jupiter Rewards ✨']), amount: pick([420, 69, 1337, 888]) };
    emit('modal', { modal: 'drainer' });
  }
  function resolvePending(choice) {
    const p = S.pending; if (!p) return;
    S.pending = null;
    if (p.kind === 'drainer') {
      if (choice === 'click') {
        const lost = r2(Math.min(S.stats.sol, Math.max(0.05, S.stats.sol * 0.5)));
        S.stats.sol = r2(S.stats.sol - lost);
        S.needs.fun = clamp(S.needs.fun - 15, 0, 100);
        toast('🪤 Wallet drained: -' + fmtSol(lost) + ' SOL. Never click airdrop links in DMs.', 'bad');
        sys('Reminder: real projects never DM you first with claim links. RIP ' + fmtSol(lost) + ' SOL 🕯️', '🚨');
        unlock('drained');
      } else {
        S.stats.rep = clamp(S.stats.rep + 2, 0, 100);
        toast('🛡️ Ignored & reported the drainer. Big brain. +2 rep', 'good');
        unlock('dodged');
      }
    }
  }

  // ---------- gigs ----------
  function makeOffer(forceTier, relaxed) {
    const st = S.stats;
    const effRep = st.rep - st.shill / 2;
    let pool = GIG_TYPES.filter((g) => st.followers >= g.minF * (relaxed ? 0.4 : 1) && effRep >= g.minRep * (relaxed ? 0.6 : 1));
    if (!pool.length) pool = [GIG_TYPES[0]];
    const gt = pick(pool);
    let tier = forceTier;
    if (!tier) {
      const lowP = clamp(gt.lowBias + st.shill / 120 - (st.rep - 50) / 200, 0.05, 0.95);
      tier = R() < lowP ? 'low' : 'normal';
    }
    const fMult = 1 + Math.max(0, Math.log10(Math.max(st.followers, 100) / 250)) * 0.9;
    const qMult = clamp(0.7 + effRep / 100 * 0.6, 0.5, 1.4);
    const tMult = tier === 'premium' ? 1.5 : tier === 'low' ? 1.25 : 1;
    const pay = Math.max(0.05, r2(rand(gt.pay[0], gt.pay[1]) * fMult * qMult * tMult * S.market));
    return {
      id: S.nextId++, type: gt.id, title: gt.title, tier,
      project: tier === 'low' ? pick(LOW_PROJECTS) : pick(PROJECTS),
      pay, days: gt.days, reqs: gt.reqs.map((r) => ({ kind: r.kind, n: r.n })),
      expires: S.t + 1440 + randInt(0, 600),
    };
  }
  function maybeOffers(n) {
    if (!gigsUnlocked()) return;
    for (let i = 0; i < n && S.offers.length < 4; i++) {
      const o = makeOffer();
      S.offers.push(o);
      feed({ name: o.project, handle: o.project.toLowerCase().replace(/[^a-z0-9]/g, ''), av: o.tier === 'low' ? '🚩' : '📣', text: 'Looking for creators: ' + o.title + '. Paying ' + fmtSol(o.pay) + ' SOL. DM open 📩', dm: true });
      emit('gig', {});
    }
  }
  function acceptGig(id) {
    const i = S.offers.findIndex((o) => o.id === id); if (i < 0) return false;
    if (S.gigs.length >= 3) { toast('Max 3 active gigs. Even KOLs have limits.', 'bad'); return false; }
    const o = S.offers.splice(i, 1)[0];
    const g = Object.assign({}, o, { deadline: S.t + o.days * 1440, prog: o.reqs.map(() => 0) });
    delete g.expires;
    S.gigs.push(g);
    toast('🤝 Accepted ' + g.title + ' for ' + g.project + '. Deadline: ' + fmtStamp(g.deadline), 'info');
    if (g.tier === 'low') S.stats.rep = clamp(S.stats.rep - 1, 0, 100);
    return true;
  }
  function declineGig(id) {
    const i = S.offers.findIndex((o) => o.id === id); if (i < 0) return false;
    S.offers.splice(i, 1); return true;
  }
  function gigReady(g) { return g.reqs.every((r, i) => g.prog[i] >= r.n); }
  function deliverGig(id) {
    const i = S.gigs.findIndex((g) => g.id === id); if (i < 0) return false;
    const g = S.gigs[i];
    if (!gigReady(g)) { toast('Not done yet: finish the requirements first.', 'bad'); return false; }
    S.gigs.splice(i, 1);
    S.stats.sol = r2(S.stats.sol + g.pay);
    S.stats.earned = r2(S.stats.earned + g.pay);
    S.stats.gigsDone++;
    if (g.tier === 'low') { S.stats.shill = clamp(S.stats.shill + 12, 0, 100); S.stats.rep = clamp(S.stats.rep - 3, 0, 100); }
    else if (g.tier === 'premium') { S.stats.shill = clamp(S.stats.shill + 2, 0, 100); S.stats.rep = clamp(S.stats.rep + 3, 0, 100); }
    else { S.stats.shill = clamp(S.stats.shill + 4, 0, 100); S.stats.rep = clamp(S.stats.rep + 1, 0, 100); }
    toast('💸 Payment issued: ' + fmtSol(g.pay) + ' SOL from ' + g.project, 'good');
    feed({ name: g.project, handle: g.project.toLowerCase().replace(/[^a-z0-9]/g, ''), av: '💸', text: 'Payment issued: ' + fmtSol(g.pay) + ' SOL to @' + S.player.handle + '. Thanks for the ' + g.title.toLowerCase() + '! 🫡', dm: true });
    if (g.tier === 'low' && S.stats.shill > 40) toast('⚠️ Shill score rising. Followers can smell the paid posts. Better gigs will dry up.', 'bad');
    unlock('first_gig');
    if (S.stats.earned >= 10) unlock('sol10');
    return true;
  }

  // ---------- buy ----------
  function buy(id) {
    const it = ITEMS[id]; if (!it) return false;
    if (S.items[id]) { toast('Already own that. Flex noted.', 'info'); return false; }
    if (S.stats.sol < it.price) { toast('Not enough SOL for ' + it.name + '. Grind some gigs.', 'bad'); return false; }
    S.stats.sol = r2(S.stats.sol - it.price);
    S.items[id] = true;
    toast(it.emoji + ' Bought ' + it.name + '. Setup upgraded.', 'good');
    unlock('first_buy');
    return true;
  }

  // ---------- achievements / titles ----------
  function unlock(id) {
    if (S.ach[id]) return;
    S.ach[id] = S.t;
    const a = ACHIEVEMENTS[id];
    emit('achv', { id, text: a.emoji + ' Achievement: ' + a.name, desc: a.desc });
  }
  function checkProgress() {
    const st = S.stats;
    if (st.followers >= 1000) unlock('f1k');
    if (st.followers >= 10000) unlock('f10k');
    const t = title();
    if (t !== S.flags.title) {
      const up = TITLES.findIndex((x) => x.name === t) > TITLES.findIndex((x) => x.name === S.flags.title);
      S.flags.title = t;
      if (up) {
        toast('🏅 New title unlocked: ' + t, 'good');
        sys('@' + S.player.handle + ' is now a ' + t + '. The TL is taking notice.', '🏅');
        if (t === 'CT Legend') unlock('legend');
        if (t === 'Reply Guy' && !S.flags.gigHint) { S.flags.gigHint = true; sys('Gig board unlocked! Projects will now DM offers. Check the Gigs tab 💼', '💼'); maybeOffers(2); }
      }
    }
  }

  // ---------- time ----------
  function daily(first) {
    S.lastDaily = day();
    if (!first) {
      if (!mod('market')) {
        const ch = rand(-0.22, 0.28);
        S.market = r2(clamp(S.market * (1 + ch), 0.5, 2.5));
        sys((ch >= 0 ? '📈 SOL pumped ' : '📉 SOL dumped ') + Math.abs(Math.round(ch * 100)) + '% overnight. Gig pay is ' + (ch >= 0 ? 'up' : 'down') + ' (market x' + S.market.toFixed(2) + ').', ch >= 0 ? '📈' : '📉');
      }
      S.stats.clout = clamp(S.stats.clout * 0.9, 0, 100);
      S.stats.shill = clamp(S.stats.shill - 2, 0, 100);
      S.offers = S.offers.filter((o) => o.expires > S.t);
      sys('Day ' + day() + '. gm CT ☀️', '☀️');
      modCall('daily');
    }
    maybeOffers(first ? 1 : randInt(1, 2));
    if (!gigsUnlocked() && !S.flags.gigHintShown) { S.flags.gigHintShown = true; sys('Tip: projects start offering paid gigs at 250 followers. Or cold-DM them from your desk 📨', '💡'); }
  }
  function hourly() {
    const sleeping = S.action && S.action.sleep;
    if (!sleeping && !S.pending && S.stats.sol > 0.05 && R() < 0.012) triggerDrainer();
    if (R() < 0.008 && !shadowbanned()) {
      S.flags.shadowUntil = S.t + 360;
      toast('👻 Shadowban scare! Impressions down 90%. Posts hit 50% weaker for 6h.', 'bad');
      sys('Is @' + S.player.handle + ' shadowbanned? Probably not. But posts are underperforming for a few hours 👻', '👻');
    }
    modCall('hourly', sleeping);
    if (hour() % 2 === 0) recordNW();
    if (!mod('market') && R() < 0.015) {
      const up = R() < 0.55; const ch = up ? rand(0.15, 0.4) : -rand(0.15, 0.35);
      S.market = r2(clamp(S.market * (1 + ch), 0.5, 2.5));
      toast((up ? '🟢 Market PUMP' : '🔴 Market DUMP') + ' ' + Math.round(Math.abs(ch) * 100) + '%. New gig offers pay x' + S.market.toFixed(2), up ? 'good' : 'bad');
      npcPost(up ? 'WE ARE SO BACK 🟢🟢🟢' : 'its so over 🔴 (see you next week when we are back)');
    }
    if (!sleeping && !mod('social') && R() < 0.2) npcPost(pick(CHATTER));
    if (R() < 0.08) maybeOffers(1);
    // expire offers / fail gigs
    S.offers = S.offers.filter((o) => {
      if (o.expires <= S.t) { emit('gig', {}); return false; }
      return true;
    });
    S.gigs = S.gigs.filter((g) => {
      if (g.deadline <= S.t) {
        S.stats.rep = clamp(S.stats.rep - 6, 0, 100);
        toast('⌛ Missed the deadline for ' + g.project + '. -6 rep. They are calling you a "fake KOL" in their TG.', 'bad');
        return false;
      }
      return true;
    });
  }

  function step(dt) {
    const n = S.needs; const it = S.items; const act = S.action;
    const h = dt / 60;
    const sleeping = act && act.sleep || (act && act.id === 'passout');
    const funMul = (it.plant ? 0.85 : 1) * (it.led ? 0.85 : 1) * (1 - HOMES[S.home.tier].moodBonus);
    n.energy -= sleeping ? 0 : DECAY.energy * h;
    n.hunger -= DECAY.hunger * h * (sleeping ? (it.bed ? 0.35 : 0.5) : 1);
    n.fun -= DECAY.fun * h * funMul * (sleeping ? 0.3 : 1);
    n.social -= DECAY.social * h * (sleeping ? 0.3 : 1);
    n.hygiene -= DECAY.hygiene * h * (sleeping ? 0.5 : 1);
    if (act) {
      const d = Math.min(dt, act.mins - act.prog);
      for (const k in act.fx) n[k] += act.fx[k] * d / act.mins;
      act.prog += dt;
    }
    for (const k of NEEDS) n[k] = clamp(n[k], 0, 100);
    S.t += dt;
    modCall('step', dt);
    if (S.t >= S.home.nextRent) payRent();
    if (act && act.prog >= act.mins) finishAction();
    // forced outcomes
    if (n.energy <= 0 && !(S.action && (S.action.sleep || S.action.id === 'passout'))) {
      S.action = { id: 'passout', obj: null, label: 'Passed out', emoji: '😵', mins: 240, fx: { energy: 45, fun: -8, hygiene: -5 }, prog: 0, sleep: true };
      toast('😵 Energy hit zero. You passed out mid-scroll.', 'bad');
    }
    if (n.hunger <= 0) {
      if (S.stats.sol >= 0.08) { S.stats.sol = r2(S.stats.sol - 0.08); n.hunger = 60; toast('🍛 Hunger hit zero. You panic-ordered jollof for 0.08 SOL.', 'bad'); }
      else { n.hunger = 45; toast('🍲 Broke and starving. Your mom sent food. wagmi.', 'bad'); }
    }
    const hr = Math.floor(S.t / 60);
    if (hr !== S.lastHour) { S.lastHour = hr; hourly(); }
    if (minOfDay() >= 480 && S.lastDaily < day()) daily(false);
    checkProgress();
  }

  function tick(mins) {
    if (!S || S.pending) return;
    while (mins > 0) {
      const dt = Math.min(5, mins);
      step(dt);
      mins -= dt;
      if (S.pending) break;
    }
  }

  function drain() { const o = out; out = []; return o; }

  const api = {
    SAVE_KEY, NEEDS, NEED_META, ITEMS, POST_TYPES, GIG_TYPES, REQ_LABEL, TITLES, ACHIEVEMENTS,
    newGame, load, save, tick, drain,
    get state() { return S; },
    actionsFor, check, startAction, cancelAction,
    actionInfo(id) { const a = A()[id]; return a ? { obj: a.obj, label: a.label, emoji: a.emoji, mins: a.mins, cost: a.cost || 0 } : null; },
    acceptGig, declineGig, deliverGig, gigReady, buy, resolvePending,
    mood, quality, title, nextTitle, gigsUnlocked, shadowbanned,
    day, hour, minOfDay, fmtClock, fmtStamp, fmtDur, fmtSol, fmtNum,
    CAREERS, HOMES, use, mod,
    careerTitle, careerNext, careerMetric, focus, focusMult, addXP, toggleCareer, primaryTitle,
    netWorth, moveHome, payRent,
    h: { R: () => R(), rand, randInt, pick, clamp, r2, toast, feed, sys, npcPost, emit, unlock, addFollowers, scale, quality, NPCS, CHATTER, PROJECTS, LOW_PROJECTS, triggerDrainer, progressGigs, makeOffer },
    _setRng(f) { rng = f || Math.random; },
    _resolvePost: (t) => resolvePost(t),
  };
  root.Sim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
