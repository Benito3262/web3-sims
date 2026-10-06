/* Web3 Sims — airdrop farming module: protocols, tasks, points, sybil wallets, snapshot, TGE, claims. */
(function (root) {
  'use strict';
  const Sim = root.Sim;
  const { R, rand, randInt, pick, clamp, r2, toast, feed, sys, unlock } = Sim.h;

  const PROTO_POOL = [
    { name: 'Nebula Testnet v2', sym: 'NEBX', kind: 'DEX', emoji: '🌌' },
    { name: 'Quokka Bridge', sym: 'QOK', kind: 'Bridge', emoji: '🦘' },
    { name: 'Orbit Lend', sym: 'ORB', kind: 'Lending', emoji: '🪐' },
    { name: 'Glorp L2', sym: 'GL2', kind: 'L2', emoji: '🟣' },
    { name: 'Mintopia', sym: 'MINT', kind: 'NFT infra', emoji: '🏝️' },
    { name: 'Restake Rangers', sym: 'RSTK', kind: 'Restaking', emoji: '🤠' },
    { name: 'Snek AI', sym: 'SNEK', kind: 'AI agents', emoji: '🐍' },
    { name: 'Vibe Vaults', sym: 'VIBE', kind: 'Yield', emoji: '🔐' },
    { name: 'Kumbaya Chain', sym: 'KUMB', kind: 'L1', emoji: '🔥' },
    { name: 'Pixel Perps', sym: 'PXP', kind: 'Perps DEX', emoji: '👾' },
  ];
  const TASKS = {
    checkin: { label: 'Daily check-in', emoji: '✅', mins: 5, pts: 10, fx: {}, daily: true },
    testnet: { label: 'Testnet swaps', emoji: '🔄', mins: 20, pts: 25, fx: { energy: -3, fun: 1 } },
    bridge:  { label: 'Bridge funds', emoji: '🌉', mins: 30, pts: 40, gas: 0.004, fx: { energy: -4 } },
    quest:   { label: 'Questboard tasks', emoji: '🗺️', mins: 45, pts: 60, fx: { energy: -6, fun: -3 } },
    discord: { label: 'Discord role grind', emoji: '👾', mins: 40, pts: 30, fx: { energy: -4, social: 6, fun: 2 } },
  };

  let S, A;
  const mod = { id: 'airdrop' };
  mod.achievements = {
    first_claim: { name: 'Airdrop Szn', desc: 'Claim your first airdrop', emoji: '🪂' },
    sybil:       { name: 'Sybil Detected', desc: 'Get flagged at a snapshot', emoji: '🚨' },
    fat_drop:    { name: 'Life-Changing (ish)', desc: 'Claim an airdrop worth 5+ SOL', emoji: '💰' },
  };

  function newProto(offsetDays) {
    const used = new Set(A.protos.map((p) => p.sym).concat(A.claimed.map((c) => c.sym)));
    const Mk = Sim.Market && Sim.Market.M;
    let pool = PROTO_POOL.filter((p) => !used.has(p.sym) && !(Mk && Mk.tokens[p.sym]));
    if (!pool.length) pool = PROTO_POOL.map((p) => Object.assign({}, p, { name: p.name + ' S' + (A.season + 1), sym: p.sym + (A.season + 1) })).filter((p) => !used.has(p.sym));
    const b = pick(pool);
    const start = S.t;
    const snap = start + Math.round((offsetDays || 0) * 1440 + rand(3, 5) * 1440);
    return {
      id: S.nextId++, name: b.name, sym: b.sym, kind: b.kind, emoji: b.emoji,
      pts: 0, phase: 'farming', start, snapshotAt: snap, tgeAt: snap + 1440, claimEnd: snap + 1440 * 3,
      done: {}, hype: rand(0.5, 1.6), flagged: false, alloc: 0, price: 0,
    };
  }
  mod.init = function (state, fresh) {
    S = state;
    if (fresh || !S.ad) {
      S.ad = { protos: [], wallets: 1, claimed: [], season: 0, totalPts: 0 };
      A = S.ad;
      A.protos.push(newProto(0), newProto(1), newProto(2));
    }
    A = S.ad;
  };
  mod.netWorth = function () { return 0; }; // claimed tokens live in the market portfolio

  function dayKey() { return Sim.day(); }
  function taskMins(task) { return Math.round(TASKS[task].mins * (1 + 0.15 * (A.wallets - 1))); }
  function sybilRisk() { return clamp(0.07 * Math.pow(A.wallets - 1, 1.25) - (Sim.focus('farmer') ? 0.03 : 0), 0, 0.92); }

  mod.actions = function () {
    const list = {};
    for (const p of A.protos) {
      if (p.phase !== 'farming') continue;
      for (const [k, t] of Object.entries(TASKS)) {
        const gas = t.gas ? r2(t.gas * A.wallets) : 0;
        list['farm_' + p.id + '_' + k] = {
          obj: 'desk', hidden: true, label: t.label + ' · ' + p.name, emoji: t.emoji, mins: taskMins(k), fx: t.fx, cost: gas, work: k !== 'checkin',
          req: () => (t.daily && p.done[k] === dayKey() ? 'Already checked in today' : null),
          onStart: () => { if (t.daily) p.done[k] = dayKey(); },
          done: () => farmDone(p, k),
        };
      }
    }
    return list;
  };

  function farmDone(p, k) {
    if (p.phase !== 'farming') { toast('Snapshot already happened. Those points were for nothing. Classic.', 'bad'); return; }
    const t = TASKS[k];
    const q = clamp(Sim.h.quality(), 0.6, 1.3);
    const pts = Math.round(t.pts * A.wallets * q * Sim.focusMult('farmer'));
    p.pts += pts; A.totalPts += pts;
    Sim.addXP('farmer', pts / 4);
    toast(t.emoji + ' ' + p.name + ': +' + pts + ' points' + (A.wallets > 1 ? ' across ' + A.wallets + ' wallets' : ''), 'info');
  }

  function addWallet() {
    if (A.wallets >= 25) { toast('25 wallets is enough. The sybil hunters are already watching.', 'bad'); return false; }
    if (S.stats.sol < 0.02) { toast('Need 0.02 SOL to fund a new wallet.', 'bad'); return false; }
    S.stats.sol = r2(S.stats.sol - 0.02);
    A.wallets++;
    toast('👛 Spun up wallet #' + A.wallets + '. Points x' + A.wallets + ', sybil risk ' + Math.round(sybilRisk() * 100) + '%', A.wallets > 4 ? 'bad' : 'info');
    return true;
  }
  function removeWallet() {
    if (A.wallets <= 1) return false;
    A.wallets--; toast('🧹 Retired a wallet. Now farming with ' + A.wallets + '.', 'info'); return true;
  }

  function snapshot(p) {
    p.phase = 'snapshot';
    const risk = sybilRisk();
    if (A.wallets > 1 && p.pts > 0 && R() < risk) {
      p.flagged = true;
      const kept = Math.round(p.pts / A.wallets * 0.5);
      toast('🚨 SYBIL DETECTED on ' + p.name + '. ' + A.wallets + ' linked wallets filtered. Points ' + p.pts + ' → ' + kept, 'bad');
      sys(p.name + ' published its sybil list. @' + S.player.handle + ' is on it. "We see you and your ' + A.wallets + ' wallets ser" 🚨', '🚨');
      p.pts = kept; unlock('sybil');
    } else {
      sys('📸 ' + p.name + ' snapshot taken. Your ' + p.pts + ' points are locked in. TGE in ~24h.', '📸');
    }
  }
  function tge(p) {
    p.phase = 'tge';
    const sentiment = S.market || 1;
    const price = +(rand(0.15, 1.8) * p.hype * sentiment).toPrecision(3);
    const usdPerPt = rand(0.12, 0.45) * sentiment * p.hype;
    p.price = price;
    p.alloc = p.pts > 0 ? (p.pts * usdPerPt) / price : 0;
    if (Sim.Market) Sim.Market.listToken(p.sym, p.name, price, { kind: 'protocol', vol: 0.05 });
    const valSol = p.alloc * price / (Sim.Market ? Sim.Market.solPrice() : 150);
    sys('🪂 $' + p.sym + ' TGE is live at ' + (Sim.Market ? Sim.Market.fmtPrice(price) : price) + '. ' + (p.pts ? 'Your allocation: ' + Math.round(p.alloc).toLocaleString() + ' $' + p.sym + ' (~' + valSol.toFixed(2) + ' SOL). Claim within 48h!' : 'You farmed 0 points. Watching from the sidelines.'), '🪂');
    if (p.pts) toast('🪂 $' + p.sym + ' airdrop is claimable! Open the Farm tab.', 'good');
    if (Sim.Market && R() < 0.6) {
      // TGE chop: farmers dump or it rips
      const dir = R() < 0.55 ? -1 : 1;
      Sim.Market.pushNews('TGE', dir < 0 ? '$' + p.sym + ' airdrop farmers dump at TGE. "It was always a points casino"' : '$' + p.sym + ' rips post-TGE as top exchanges list it', { sym: { [p.sym]: dir * rand(0.15, 0.45) } }, { dur: 240 });
    }
  }
  function claim(id) {
    const p = A.protos.find((x) => x.id === id);
    if (!p || p.phase !== 'tge') { toast('Nothing to claim.', 'bad'); return false; }
    if (!p.alloc) { toast('0 points = 0 tokens. Farm harder next season.', 'bad'); return false; }
    const gas = 0.002;
    if (S.stats.sol < gas) { toast('Need 0.002 SOL for claim gas. Peak irony.', 'bad'); return false; }
    S.stats.sol = r2(S.stats.sol - gas);
    const Mk = Sim.Market;
    const tok = Mk && Mk.M.tokens[p.sym];
    const priceNow = tok ? tok.price : p.price;
    if (Mk) Mk.credit(p.sym, p.alloc);
    const valSol = p.alloc * priceNow / (Mk ? Mk.solPrice() : 150);
    A.claimed.unshift({ name: p.name, sym: p.sym, qty: p.alloc, valSol: r2(valSol), t: S.t, flagged: p.flagged });
    p.phase = 'claimed';
    Sim.addXP('farmer', 60 + valSol * 20);
    toast('🪂 Claimed ' + Math.round(p.alloc).toLocaleString() + ' $' + p.sym + ' (~' + valSol.toFixed(2) + ' SOL). Sell or hold?', 'good');
    feed({ name: S.player.name, handle: S.player.handle, av: 'me', text: 'just claimed my $' + p.sym + ' airdrop 🪂 ' + (valSol > 2 ? 'farming pays. thank you ' + p.name + ' 🫡' : 'enough for a jollof plate. we take those 🍛'), likes: randInt(20, 400), rts: randInt(2, 40), mine: true });
    unlock('first_claim');
    if (valSol >= 5) unlock('fat_drop');
    replace(p);
    return true;
  }
  function replace(p) {
    const i = A.protos.indexOf(p);
    A.protos.splice(i, 1);
    A.season++;
    const np = newProto(0);
    A.protos.push(np);
    sys('🧪 New testnet just dropped: ' + np.name + ' (' + np.kind + '). Points program live. "No token confirmed" (there is a token).', np.emoji);
  }

  mod.step = function () {
    for (const p of A.protos.slice()) {
      if (p.phase === 'farming' && S.t >= p.snapshotAt) snapshot(p);
      else if (p.phase === 'snapshot' && S.t >= p.tgeAt) tge(p);
      else if (p.phase === 'tge' && S.t >= p.claimEnd) {
        if (p.alloc) toast('⌛ You forgot to claim $' + p.sym + '. Unclaimed tokens returned to the treasury. Pain.', 'bad');
        p.phase = 'missed'; replace(p);
      }
    }
  };

  Sim.Airdrop = { mod, TASKS, addWallet, removeWallet, claim, sybilRisk, taskMins, get A() { return A; } };
  Sim.use(mod);
})(typeof window !== 'undefined' ? window : globalThis);
