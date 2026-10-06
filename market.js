/* Web3 Sims — fake market module: tokens, prices, news, spot trading, whales. */
(function (root) {
  'use strict';
  const Sim = root.Sim;
  const { R, rand, randInt, pick, clamp, r2, toast, feed, sys, unlock } = Sim.h;
  const gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  const BASE_TOKENS = [
    { sym: 'SOL', name: 'Solana', kind: 'l1', price: 150, vol: 0.012, beta: 1, liq: 5e8, color: '#14F195' },
    { sym: 'GLORP', name: 'Glorp Protocol', kind: 'protocol', price: 1.2, vol: 0.03, beta: 1.4, liq: 4e6, color: '#9945FF' },
    { sym: 'NEB', name: 'Nebula DEX', kind: 'protocol', price: 2.8, vol: 0.028, beta: 1.3, liq: 6e6, color: '#4cc9f0' },
    { sym: 'YETI', name: 'YieldYeti', kind: 'protocol', price: 0.45, vol: 0.035, beta: 1.5, liq: 2e6, color: '#a0e7ff' },
    { sym: 'FROGWIF', name: 'frog wif hat', kind: 'meme', price: 0.0042, vol: 0.07, beta: 2.2, liq: 6e5, color: '#7bd389' },
    { sym: 'BONKERS', name: 'Bonkers', kind: 'meme', price: 0.00031, vol: 0.08, beta: 2.4, liq: 4e5, color: '#ffb703' },
    { sym: 'JOLLOF', name: 'Jollof Coin', kind: 'meme', price: 0.019, vol: 0.075, beta: 2.0, liq: 3e5, color: '#ff6b35' },
  ];
  const MEME_POOL = [['CATSOL', 'Cat on Sol'], ['PEPEMAXX', 'Pepe Maxx'], ['GIGACHAD', 'Giga Chad'], ['WAGMI', 'We All Gonna'], ['SERCOIN', 'Ser Coin'], ['NGMI', 'Not Gonna'], ['DOGWIFCAP', 'dog wif cap'], ['TOUCHGRASS', 'Touch Grass'], ['RATIO', 'Ratio Token'], ['GMI', 'Gonna Make It']];

  // headline templates. fx: { ALL, SOL, kind:{meme,protocol}, sym:{...} } as log-returns, applied over `dur` minutes
  const NEWS = [
    { cat: 'Geopolitics', h: 'US–Israel tensions escalate after strike reports. Risk assets slide', fx: { ALL: -0.10 } },
    { cat: 'Geopolitics', h: 'Ceasefire talks progress; markets exhale', fx: { ALL: 0.07 } },
    { cat: 'Geopolitics', h: 'Oil spikes as shipping lanes near the Strait of Hormuz are disrupted', fx: { ALL: -0.06 } },
    { cat: 'Geopolitics', h: 'China–Taiwan naval drills spook global markets', fx: { ALL: -0.07 } },
    { cat: 'Geopolitics', h: 'G20 leaders agree on a new trade framework. Risk-on vibes', fx: { ALL: 0.05 } },
    { cat: 'Geopolitics', h: 'Russia–Ukraine peace framework announced, futures rally', fx: { ALL: 0.06 } },
    { cat: 'Fed', h: 'Fed cuts rates by 25bps. Powell: "data dependent" (as always)', fx: { ALL: 0.08 } },
    { cat: 'Fed', h: 'Fed holds rates, hints at "higher for longer"', fx: { ALL: -0.05 } },
    { cat: 'Fed', h: 'Hot CPI print: inflation 4.1% vs 3.6% expected', fx: { ALL: -0.08 } },
    { cat: 'Fed', h: 'Cool CPI print sparks rate-cut hopes', fx: { ALL: 0.06 } },
    { cat: 'ETF', h: 'SEC approves spot SOL ETF 🟢', fx: { ALL: 0.05, SOL: 0.16 } },
    { cat: 'ETF', h: 'BlackRock files for a crypto index ETF including Solana tokens', fx: { ALL: 0.06 } },
    { cat: 'ETF', h: 'SEC delays ETF decision again: "we need more time"', fx: { ALL: -0.04 } },
    { cat: 'Hack', h: 'Exchange "BitVault" hacked for $400M; withdrawals paused', fx: { ALL: -0.12 } },
    { cat: 'Hack', h: 'Quokka Bridge exploited for $80M. DeFi tokens wobble', fx: { ALL: -0.03, kind: { protocol: -0.08 } } },
    { cat: 'Celebrity', h: 'Elon tweets a frog emoji. $FROGWIF holders lose their minds', fx: { sym: { FROGWIF: 0.45 } } },
    { cat: 'Celebrity', h: 'Famous rapper launches a memecoin on Solana, CT divided', fx: { kind: { meme: 0.15 } } },
    { cat: 'Celebrity', h: 'Celebrity admits they "do not really get crypto". Nobody is surprised', fx: { ALL: -0.02 } },
    { cat: 'Celebrity', h: 'Afrobeats superstar shouts out $JOLLOF at a sold-out show', fx: { sym: { JOLLOF: 0.5 } } },
    { cat: 'Regulation', h: 'Regulator floats a ban on "anything with a dog logo"', fx: { kind: { meme: -0.22 } } },
    { cat: 'Regulation', h: 'Stablecoin bill passes: clarity for builders', fx: { ALL: 0.07 } },
    { cat: 'Regulation', h: 'Tax agency mails letters to 10,000 crypto holders', fx: { ALL: -0.05 } },
    { cat: 'Regulation', h: 'Exchange delists privacy tokens citing "vibes"', fx: { ALL: -0.03 } },
    { cat: 'Protocol', h: 'Nebula DEX volume hits an all-time high', fx: { sym: { NEB: 0.2 } } },
    { cat: 'Protocol', h: 'YieldYeti audit finds a critical bug; team "investigating"', fx: { sym: { YETI: -0.3 } } },
    { cat: 'Protocol', h: 'Glorp Protocol partners with a major payments company', fx: { sym: { GLORP: 0.25 } } },
    { cat: 'Protocol', h: 'Solana network sets a TPS record; validators celebrate', fx: { SOL: 0.06, kind: { protocol: 0.04 } } },
    { cat: 'Protocol', h: 'Solana network congestion: "we are aware and working on it"', fx: { SOL: -0.06 } },
  ];

  let S, M;
  const mod = { id: 'market' };

  mod.achievements = {
    first_trade: { name: 'Exit Liquidity', desc: 'Make your first trade', emoji: '💱' },
    green_day:   { name: 'Green Candle', desc: 'Close a trade +50% in profit', emoji: '🟢' },
    whale_move:  { name: 'You Are The Whale', desc: 'Move a token price 5%+ with one buy', emoji: '🐋' },
    rugged:      { name: 'Rugged', desc: 'Hold a token when it rugs', emoji: '🧯' },
  };

  function mkToken(t) {
    return { sym: t.sym, name: t.name, kind: t.kind, price: t.price, anchor: t.price, ref: t.price, open: t.price, vol: t.vol, beta: t.beta, liq: t.liq, color: t.color || '#ccc', hist: [t.price], rugged: false, listedAt: S.t };
  }
  mod.init = function (state, fresh) {
    S = state;
    if (fresh || !S.mk) {
      S.mk = { tokens: {}, hold: {}, shocks: [], news: [], sched: [], realized: 0, trades: 0, histT: 0 };
      for (const t of BASE_TOKENS) S.mk.tokens[t.sym] = mkToken(t);
      S.mk.histT = S.t;
    }
    M = S.mk;
    updateSentiment();
  };

  function solPrice() { return M.tokens.SOL.price; }
  function tokens() { return Object.values(M.tokens); }
  function holdValueSOL() {
    let v = 0;
    for (const [sym, h] of Object.entries(M.hold)) { const t = M.tokens[sym]; if (t && h.qty > 0) v += h.qty * t.price / solPrice(); }
    return v;
  }
  mod.netWorth = holdValueSOL;

  function updateSentiment() {
    const ts = tokens().filter((t) => !t.rugged);
    let idx = 0, w = 0;
    for (const t of ts) { const wt = t.sym === 'SOL' ? 3 : t.kind === 'meme' ? 0.25 : 1; idx += wt * Math.log(t.price / t.ref); w += wt; }
    idx = w ? idx / w : 0;
    S.market = r2(clamp(Math.exp(idx * 1.4), 0.5, 2.5));
  }

  function addShock(target, ret, dur) { M.shocks.push({ target, ret, dur, left: dur }); }
  function targetMatch(target, t) {
    if (target === 'ALL') return t.beta;
    if (target.sym) return target.sym === t.sym ? 1 : 0;
    if (target.kind) return target.kind === t.kind ? 1 : 0;
    return 0;
  }
  function applyFx(fx, dur) {
    dur = dur || randInt(60, 150);
    if (fx.ALL) addShock('ALL', fx.ALL, dur);
    if (fx.SOL) addShock({ sym: 'SOL' }, fx.SOL, dur);
    if (fx.kind) for (const k in fx.kind) addShock({ kind: k }, fx.kind[k], dur);
    if (fx.sym) for (const k in fx.sym) if (M.tokens[k]) addShock({ sym: k }, fx.sym[k], dur);
  }

  function pushNews(cat, h, fx, opts) {
    opts = opts || {};
    const n = { id: S.nextId++, t: S.t, cat, h, fx, dir: fxDir(fx) };
    M.news.unshift(n); if (M.news.length > 30) M.news.length = 30;
    applyFx(fx, opts.dur);
    feed({ name: 'CT Newswire', handle: 'ctnewswire', av: '📰', text: (n.dir > 0 ? '🟢 ' : n.dir < 0 ? '🔴 ' : '') + 'BREAKING: ' + h, likes: randInt(500, 9000), rts: randInt(100, 2000), news: true });
    Sim.h.emit('news', { news: n });
    return n;
  }
  function fxDir(fx) {
    let s = (fx.ALL || 0) + (fx.SOL || 0);
    if (fx.kind) for (const k in fx.kind) s += fx.kind[k];
    if (fx.sym) for (const k in fx.sym) s += fx.sym[k];
    return Math.sign(s);
  }
  function randomNews() {
    const pool = NEWS.filter((n) => !n.fx.sym || Object.keys(n.fx.sym).every((k) => M.tokens[k] && !M.tokens[k].rugged));
    const n = pick(pool);
    return pushNews(n.cat, n.h, n.fx);
  }
  function whaleEvent() {
    const ts = tokens().filter((t) => t.sym !== 'SOL' && !t.rugged);
    if (!ts.length) return;
    const t = pick(ts);
    const buy = R() < 0.6;
    const usd = Math.round(t.liq * rand(0.05, 0.25));
    const amt = usd >= 1e6 ? (usd / 1e6).toFixed(1) + 'M' : Math.round(usd / 1e3) + 'k';
    pushNews('Whale', (buy ? '🐋 Whale wallet 7xQ…f3 bought $' + amt + ' of $' : '🐋 Whale wallet 9Kd…a1 dumped $' + amt + ' of $') + t.sym, { sym: { [t.sym]: (buy ? 1 : -1) * usd / t.liq * 1.2 } }, { dur: 20 });
  }
  function rugEvent() {
    const memes = tokens().filter((t) => t.kind === 'meme' && !t.rugged && S.t - t.listedAt > 1440);
    if (!memes.length) return;
    const t = pick(memes);
    t.rugged = true; t.anchor = t.price * 0.03; t.vol *= 0.5;
    pushNews('Rug', '$' + t.sym + ' devs pulled liquidity. Telegram deleted. Website now redirects to a cooking blog', { sym: { [t.sym]: -3.2 } }, { dur: 15 });
    if (M.hold[t.sym] && M.hold[t.sym].qty > 0) { unlock('rugged'); toast('🧯 You were holding $' + t.sym + '. It rugged. F.', 'bad'); }
  }
  function launchMeme() {
    const avail = MEME_POOL.filter(([s]) => !M.tokens[s]);
    if (!avail.length) return;
    const [sym, name] = pick(avail);
    M.tokens[sym] = mkToken({ sym, name, kind: 'meme', price: +(rand(0.0002, 0.02)).toPrecision(2), vol: rand(0.07, 0.1), beta: 2.2, liq: rand(1.5e5, 5e5), color: pick(['#f72585', '#7bd389', '#ffd166', '#06d6a0', '#ef476f']) });
    pushNews('Launch', 'New memecoin $' + sym + ' just launched. Bundled? Probably. Pumping? Definitely', { sym: { [sym]: rand(0.2, 0.8) } }, { dur: 60 });
  }
  function delistDead() {
    for (const t of tokens()) {
      if (t.rugged && S.t - t.listedAt > 1440 * 3 && !(M.hold[t.sym] && M.hold[t.sym].qty > 0)) delete M.tokens[t.sym];
    }
  }

  // public listing (used by airdrop TGEs)
  function listToken(sym, name, price, opts) {
    if (M.tokens[sym]) return M.tokens[sym];
    opts = opts || {};
    M.tokens[sym] = mkToken({ sym, name, kind: opts.kind || 'protocol', price, vol: opts.vol || 0.04, beta: 1.5, liq: opts.liq || rand(1.5e6, 5e6), color: opts.color || '#c77dff' });
    return M.tokens[sym];
  }

  mod.step = function (dt) {
    const common = gauss() * Math.sqrt(dt / 60) * 0.008;
    const shockAcc = new Map();
    for (const sh of M.shocks) {
      const d = Math.min(dt, sh.left); sh.left -= d;
      for (const t of tokens()) { const w = targetMatch(sh.target, t); if (w) shockAcc.set(t.sym, (shockAcc.get(t.sym) || 0) + sh.ret * w * d / sh.dur); }
    }
    M.shocks = M.shocks.filter((s) => s.left > 0);
    for (const t of tokens()) {
      const noise = gauss() * t.vol * Math.sqrt(dt / 60);
      const rev = -0.25 * Math.log(t.price / t.anchor) * dt / 1440;
      t.price *= Math.exp(noise + common * t.beta + (shockAcc.get(t.sym) || 0) + rev);
      t.anchor *= Math.exp((t.price > t.anchor ? 1 : -1) * 0.12 * dt / 1440); // anchor follows price slowly (momentum regime)
      if (!t.rugged) t.anchor *= Math.exp(-0.06 * Math.log(t.anchor / t.ref) * dt / 1440); // long-run pull to fair value
      t.price = Math.max(t.price, 1e-9);
    }
    if (S.t - M.histT >= 30) {
      M.histT = S.t;
      for (const t of tokens()) { t.hist.push(t.price); if (t.hist.length > 144) t.hist.shift(); }
    }
    // scheduled news (alpha leaks)
    const due = M.sched.filter((x) => x.t <= S.t);
    if (due.length) {
      M.sched = M.sched.filter((x) => x.t > S.t);
      for (const x of due) { if (x.real) pushNews(x.cat, x.h, x.fx); else feed({ name: 'CT Sim', handle: 'ctsim', av: '🤷', text: 'That "' + x.sym + ' announcement" never happened. Alpha leaks are not financial advice.', sys: true }); }
    }
    updateSentiment();
  };
  mod.hourly = function () {
    if (R() < 0.16) randomNews();
    if (R() < 0.06) whaleEvent();
    if (R() < 0.012) rugEvent();
    if (R() < 0.02) launchMeme();
  };
  mod.daily = function () {
    for (const t of tokens()) t.open = t.price;
    delistDead();
  };

  // ---------- trading ----------
  const FEE = 0.003, GAS = 0.0008; // swap fee + network gas (SOL)
  function buy(sym, solAmt) {
    const t = M.tokens[sym];
    solAmt = r2(+solAmt);
    if (!t || sym === 'SOL') return null;
    if (!(solAmt > 0)) { toast('Enter an amount, ser.', 'bad'); return null; }
    if (S.stats.sol < solAmt + GAS) { toast(S.stats.sol <= 0 ? 'Wallet is empty. Earn some SOL first (jobs, bounties, gigs).' : 'Not enough SOL (amount + ◎' + GAS + ' gas).', 'bad'); return null; }
    if (t.rugged) { toast('That token rugged. Please do not.', 'bad'); return null; }
    const usd = solAmt * solPrice() * (1 - FEE);
    const impact = usd / t.liq;
    const fill = t.price * (1 + impact / 2);
    const qty = usd / fill;
    const before = t.price;
    t.price *= 1 + impact;
    t.anchor *= 1 + impact * 0.5;
    S.stats.sol = r2(S.stats.sol - solAmt - GAS);
    M.gas = r2((M.gas || 0) + GAS);
    const h = M.hold[sym] || (M.hold[sym] = { qty: 0, cost: 0 });
    h.qty += qty; h.cost += usd;
    M.trades++;
    Sim.addXP('trader', 3 + solAmt * 8);
    unlock('first_trade');
    const move = t.price / before - 1;
    if (move >= 0.05) {
      unlock('whale_move');
      toast('🐋 Your buy pumped $' + sym + ' +' + (move * 100).toFixed(1) + '%. You are the whale now.', 'good');
      feed({ name: 'whale alert', handle: 'whale_alert_sim', av: '🚨', text: '🐋 @' + S.player.handle + ' just aped ' + solAmt + ' SOL into $' + sym + '. Price +' + (move * 100).toFixed(1) + '%', likes: randInt(50, 800), rts: randInt(10, 120) });
    } else toast('💱 Bought ' + fmtQty(qty) + ' $' + sym + ' for ' + solAmt + ' SOL', 'info');
    S.needs.fun = clamp(S.needs.fun + 2, 0, 100);
    return { qty, fill };
  }
  function sell(sym, frac) {
    const t = M.tokens[sym]; const h = M.hold[sym];
    frac = clamp(+frac || 1, 0, 1);
    if (!t || !h || h.qty <= 0) { toast('Nothing to sell.', 'bad'); return null; }
    if (S.stats.sol < GAS) { toast('Need ◎' + GAS + ' SOL for gas to sell. (Yes, really.)', 'bad'); return null; }
    const qty = h.qty * frac;
    const gross = qty * t.price;
    const impact = Math.min(gross / t.liq, 0.9);
    const usd = gross * (1 - impact / 2) * (1 - FEE);
    t.price *= 1 - impact;
    const costPart = h.cost * frac;
    const pnl = usd - costPart;
    h.qty -= qty; h.cost -= costPart;
    if (h.qty * t.price < 0.01) delete M.hold[sym];
    const sol = usd / solPrice();
    S.stats.sol = r2(S.stats.sol + sol - GAS);
    M.gas = r2((M.gas || 0) + GAS);
    M.realized += pnl / solPrice();
    M.trades++;
    const pnlSol = pnl / solPrice();
    Sim.addXP('trader', 3 + Math.max(0, pnlSol) * 40);
    unlock('first_trade');
    if (costPart > 0 && pnl / costPart >= 0.5) unlock('green_day');
    if (pnl >= 0) { toast('🟢 Sold ' + fmtQty(qty) + ' $' + sym + ' → ' + sol.toFixed(3) + ' SOL (PnL +' + pnlSol.toFixed(3) + ' SOL)', 'good'); S.needs.fun = clamp(S.needs.fun + 6, 0, 100); }
    else { toast('🔴 Sold ' + fmtQty(qty) + ' $' + sym + ' → ' + sol.toFixed(3) + ' SOL (PnL ' + pnlSol.toFixed(3) + ' SOL). Down bad.', 'bad'); S.needs.fun = clamp(S.needs.fun - 8, 0, 100); }
    return { sol, pnl: pnlSol };
  }
  // airdrop claims land here (cost basis 0)
  function credit(sym, qty) {
    const h = M.hold[sym] || (M.hold[sym] = { qty: 0, cost: 0 });
    h.qty += qty;
  }
  function scheduleLeak(sym, hours, dir, real) {
    const fx = { sym: { [sym]: dir * rand(0.15, 0.35) } };
    const h = dir > 0 ? (M.tokens[sym] ? M.tokens[sym].name : sym) + ' announces a major partnership 🤝' : (M.tokens[sym] ? M.tokens[sym].name : sym) + ' team wallet spotted moving tokens to an exchange 👀';
    M.sched.push({ t: S.t + hours * 60, sym, cat: 'Leak', h, fx, real });
  }
  function fmtQty(q) { return q >= 1e9 ? (q / 1e9).toFixed(2) + 'B' : q >= 1e6 ? (q / 1e6).toFixed(2) + 'M' : q >= 1e3 ? (q / 1e3).toFixed(1) + 'k' : q >= 1 ? q.toFixed(2) : q.toPrecision(3); }
  function fmtPrice(p) { return p >= 100 ? '$' + p.toFixed(2) : p >= 1 ? '$' + p.toFixed(3) : p >= 0.01 ? '$' + p.toFixed(4) : '$' + p.toPrecision(3); }
  function portfolio() {
    return Object.entries(M.hold).map(([sym, h]) => {
      const t = M.tokens[sym]; if (!t) return null;
      const usd = h.qty * t.price;
      return { sym, name: t.name, qty: h.qty, usd, sol: usd / solPrice(), cost: h.cost, pnlUsd: usd - h.cost, pnlPct: h.cost > 0 ? (usd / h.cost - 1) * 100 : null, rugged: t.rugged };
    }).filter(Boolean).sort((a, b) => b.usd - a.usd);
  }

  Sim.Market = { mod, GAS, FEE, buy, sell, credit, listToken, pushNews, randomNews, whaleEvent, rugEvent, launchMeme, scheduleLeak, solPrice, tokens, portfolio, holdValueSOL, fmtQty, fmtPrice, NEWS, get M() { return M; } };
  Sim.use(mod);
})(typeof window !== 'undefined' ? window : globalThis);
