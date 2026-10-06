/* Web3 Sims — NFT module: drops (WL, public mint, gas wars), reveals, traits, floors, marketplace. */
(function (root) {
  'use strict';
  const Sim = root.Sim;
  const { R, rand, randInt, pick, clamp, r2, toast, feed, sys, unlock } = Sim.h;

  const NAMES = [['Solana Sloths', '🦥'], ['Degen Ducks', '🦆'], ['Mad Lagosians', '🕶️'], ['Pixel Penguins', '🐧'], ['Okay Bulls', '🐂'], ['Glorp Gremlins', '👹'], ['Based Bananas', '🍌'], ['Chill Chameleons', '🦎'], ['Moon Moles', '🐹'], ['Cyber Snails', '🐌'], ['Rug Raccoons', '🦝'], ['Frog Society', '🐸'], ['Ape Acolytes', '🐒'], ['Sad Sharks', '🦈'], ['Jollof Jaguars', '🐆']];
  const TRAITS = {
    Background: [['Charcoal', 40], ['Purple Haze', 25], ['Mint', 20], ['Sunset', 10], ['Solana Aura', 5]],
    Body: [['Basic', 45], ['Zombie', 20], ['Robot', 15], ['Gold', 7], ['Diamond', 3]],
    Eyes: [['Sleepy', 40], ['Shades', 30], ['Hearts', 15], ['3D Glasses', 10], ['Laser Eyes', 5]],
    Head: [['None', 35], ['Beanie', 25], ['Cap', 20], ['Halo', 12], ['Gold Crown', 8]],
  };
  const RARITY = [['Common', 1, '#8b9bb0'], ['Rare', 1.6, '#4cc9f0'], ['Epic', 3, '#c77dff'], ['Legendary', 7, '#ffd166']];

  let S, N;
  const mod = { id: 'nft' };
  mod.achievements = {
    first_mint: { name: 'Minted', desc: 'Mint your first NFT', emoji: '🖼️' },
    gas_loss:   { name: 'Outbid', desc: 'Lose a gas war', emoji: '⛽' },
    legendary:  { name: 'Grail', desc: 'Own a Legendary NFT', emoji: '🏆' },
    first_flip: { name: 'Flipper', desc: 'Sell an NFT for profit', emoji: '🔁' },
    got_wl:     { name: 'Whitelisted', desc: 'Win a whitelist spot', emoji: '📝' },
  };

  function rollTraits(floorBias) {
    const t = {}; let score = 1;
    for (const [k, opts] of Object.entries(TRAITS)) {
      const total = opts.reduce((a, o) => a + o[1], 0);
      let r = R() * total * (floorBias ? 0.85 : 1); let chosen = opts[0];
      for (const o of opts) { r -= o[1]; if (r <= 0) { chosen = o; break; } }
      t[k] = chosen[0]; score *= total / chosen[1] / 4;
    }
    const tier = score > 40 ? 3 : score > 12 ? 2 : score > 4 ? 1 : 0;
    return { traits: t, rarity: tier };
  }
  function mkCollection(name, emoji, floor, supply, hype) {
    return { name, emoji, floor, supply, hype, hist: [floor], vol24: 0 };
  }
  function newDrop(delayH) {
    const used = new Set(Object.keys(N.cols).concat(N.drops.map((d) => d.name)));
    const avail = NAMES.filter(([n]) => !used.has(n));
    const [name, emoji] = avail.length ? pick(avail) : [pick(NAMES)[0] + ' S' + (N.season + 1), '✨'];
    N.season++;
    const wlAt = S.t + Math.round((delayH || rand(10, 20)) * 60);
    return {
      id: S.nextId++, name, emoji, supply: pick([333, 777, 1111, 2222, 3333, 5555]), price: +(rand(0.1, 0.9)).toFixed(2),
      hype: R(), wlAt, pubAt: wlAt + 120, endAt: wlAt + 300, phase: 'upcoming', minted: 0, wl: false, mintedByMe: 0,
    };
  }
  mod.init = function (state, fresh) {
    S = state;
    if (fresh || !S.nf) {
      S.nf = { cols: {}, drops: [], owned: [], season: 0, mints: 0, flips: 0, profit: 0 };
      N = S.nf;
      N.cols['Solana Sloths'] = mkCollection('Solana Sloths', '🦥', 2.4, 5555, 0.8);
      N.cols['Degen Ducks'] = mkCollection('Degen Ducks', '🦆', 0.6, 3333, 0.6);
      N.cols['Mad Lagosians'] = mkCollection('Mad Lagosians', '🕶️', 1.3, 2222, 0.7);
      N.drops.push(newDrop(6), newDrop(26));
    }
    N = S.nf;
  };
  function nftValue(n) { const c = N.cols[n.col]; return c ? c.floor * RARITY[n.rarity][1] : n.cost; }
  mod.netWorth = function () { return N.owned.reduce((a, n) => a + (N.cols[n.col] ? nftValue(n) * 0.9 : n.cost), 0); };

  mod.actions = function (it, deskE) {
    const list = {};
    for (const d of N.drops) {
      if (d.phase !== 'upcoming' || d.wl) continue;
      list['wl_' + d.id] = {
        obj: 'desk', hidden: true, label: 'Grind WL · ' + d.name, emoji: '📝', mins: 60, fx: { energy: -6 * deskE, social: 8, fun: -2 }, work: true,
        req: () => (d.phase !== 'upcoming' ? 'WL closed' : d.wl ? 'Already WL' : null),
        done: () => grindWL(d),
      };
    }
    return list;
  };
  function grindWL(d) {
    if (d.phase !== 'upcoming') { toast('Too late, WL phase already started.', 'bad'); return; }
    const chance = clamp(0.25 + S.needs.social / 300 + Math.min(S.stats.followers / 8000, 0.2) + (Sim.focus('degen') ? 0.1 : 0), 0.1, 0.85);
    Sim.addXP('degen', 8);
    if (R() < chance) { d.wl = true; Sim.addXP('degen', 10); unlock('got_wl'); toast('📝 WL secured for ' + d.name + '! Mint at ' + d.price + ' SOL with no gas war.', 'good'); }
    else toast('📝 Spammed "LFG 🔥" in ' + d.name + ' Discord for an hour. No WL. Mods muted you.', 'bad');
  }
  function giveWL(dropId) { const d = N.drops.find((x) => x.id === dropId); if (d && d.phase !== 'done') { d.wl = true; return d; } return null; }

  function mintCount(d) { return d.mintedByMe; }
  function mint(id) {
    const d = N.drops.find((x) => x.id === id);
    if (!d) return false;
    if (d.phase === 'upcoming') { toast('Mint not live yet.', 'bad'); return false; }
    if (d.phase === 'done' || d.minted >= 1) { toast('Minted out / closed. Check the marketplace.', 'bad'); return false; }
    if (d.phase === 'wl' && !d.wl) { toast('WL-only phase. Public opens at ' + Sim.fmtClock(d.pubAt) + '.', 'bad'); return false; }
    if (mintCount(d) >= 2) { toast('Max 2 per wallet. (Your other 9 wallets are on cooldown.)', 'bad'); return false; }
    const isWL = d.phase === 'wl';
    const gas = isWL ? 0.002 : r2(d.price * rand(0.03, 0.35) * (0.4 + d.hype));
    const total = r2(d.price + gas);
    if (S.stats.sol < total) { toast('Need ' + total + ' SOL (mint + gas).', 'bad'); return false; }
    const win = isWL ? R() < 0.97 : R() < clamp(1.15 - d.hype * 0.9 - d.minted * 0.3 + (Sim.focus('degen') ? 0.1 : 0), 0.15, 0.95);
    if (!win) {
      S.stats.sol = r2(S.stats.sol - gas);
      unlock('gas_loss');
      toast('⛽ Lost the gas war for ' + d.name + '. Burned ' + gas.toFixed(3) + ' SOL in fees. Bots win again.', 'bad');
      S.needs.fun = clamp(S.needs.fun - 6, 0, 100);
      return false;
    }
    S.stats.sol = r2(S.stats.sol - total);
    const r = rollTraits(false);
    const n = { id: S.nextId++, col: d.name, emoji: d.emoji, num: randInt(1, d.supply), traits: r.traits, rarity: r.rarity, cost: total, listed: 0, t: S.t, revealed: false, dropId: d.id };
    N.owned.push(n); d.mintedByMe++; N.mints++;
    Sim.addXP('degen', 15);
    unlock('first_mint');
    toast('🖼️ Minted ' + d.name + ' #' + n.num + ' for ' + total.toFixed(3) + ' SOL' + (isWL ? ' (WL)' : ' (gas ' + gas.toFixed(3) + ')') + '. Reveal after mint closes.', 'good');
    return n;
  }
  function closeDrop(d) {
    d.phase = 'done';
    const sold = d.hype > 0.5 || d.minted >= 1;
    const floor = sold ? r2(d.price * rand(1.3, 2 + d.hype * 4)) : r2(d.price * rand(0.15, 0.8));
    N.cols[d.name] = mkCollection(d.name, d.emoji, floor, d.supply, d.hype);
    for (const n of N.owned) if (n.dropId === d.id) { n.revealed = true; if (n.rarity === 3) unlock('legendary'); }
    const mine = N.owned.filter((n) => n.dropId === d.id);
    sys((sold ? '🔥 ' + d.name + ' SOLD OUT. Floor opens at ' + floor.toFixed(2) + ' SOL (' + (floor / d.price).toFixed(1) + 'x mint).' : '🧊 ' + d.name + ' flopped. ' + Math.round(d.minted * 100) + '% minted. Floor ' + floor.toFixed(2) + ' SOL, below mint. Devs "extending the mint".') + (mine.length ? ' Your reveal: ' + mine.map((n) => RARITY[n.rarity][0]).join(', ') : ''), d.emoji);
    if (mine.length) toast(d.emoji + ' ' + d.name + ' revealed: ' + mine.map((n) => RARITY[n.rarity][0]).join(', ') + '. Floor ' + floor.toFixed(2) + ' SOL', sold ? 'good' : 'bad');
  }

  function list(id, price) {
    const n = N.owned.find((x) => x.id === id); price = r2(+price);
    if (!n) return false;
    if (!N.cols[n.col]) { toast('Not revealed yet. Wait for mint to close.', 'bad'); return false; }
    if (!(price > 0)) { toast('Set a price.', 'bad'); return false; }
    n.listed = price; toast('🏷️ Listed ' + n.col + ' #' + n.num + ' at ' + price + ' SOL', 'info'); return true;
  }
  function unlist(id) { const n = N.owned.find((x) => x.id === id); if (n) { n.listed = 0; return true; } return false; }
  function sellNow(n) {
    const proceeds = r2(n.listed * 0.975);
    S.stats.sol = r2(S.stats.sol + proceeds);
    const profit = proceeds - n.cost;
    N.owned.splice(N.owned.indexOf(n), 1);
    N.flips++; N.profit = r2(N.profit + profit);
    const c = N.cols[n.col]; if (c) c.vol24 += n.listed;
    Sim.addXP('degen', 10 + Math.max(0, profit) * 30);
    if (profit > 0) unlock('first_flip');
    toast('💰 Sold ' + n.col + ' #' + n.num + ' for ' + n.listed.toFixed(2) + ' SOL (' + (profit >= 0 ? '+' : '') + profit.toFixed(3) + ' SOL after fees)', profit >= 0 ? 'good' : 'bad');
  }
  function buyFloor(colName) {
    const c = N.cols[colName]; if (!c) return false;
    const price = r2(c.floor * 1.01);
    if (S.stats.sol < price) { toast('Need ' + price + ' SOL to buy the floor.', 'bad'); return false; }
    S.stats.sol = r2(S.stats.sol - price);
    const r = rollTraits(true);
    const n = { id: S.nextId++, col: colName, emoji: c.emoji, num: randInt(1, c.supply), traits: r.traits, rarity: Math.min(r.rarity, 1), cost: price, listed: 0, t: S.t, revealed: true };
    N.owned.push(n);
    c.floor = r2(c.floor * 1.015);
    Sim.addXP('degen', 6);
    toast('🛍️ Bought ' + colName + ' #' + n.num + ' off the floor for ' + price.toFixed(2) + ' SOL', 'info');
    return n;
  }

  mod.step = function (dt) {
    for (const d of N.drops.slice()) {
      if (d.phase === 'upcoming' && S.t >= d.wlAt) { d.phase = 'wl'; if (d.wl) toast('📝 ' + d.name + ' WL mint is LIVE. Go mint (NFT tab).', 'good'); }
      if (d.phase === 'wl' && S.t >= d.pubAt) { d.phase = 'public'; sys('⛽ ' + d.name + ' public mint is live. ' + d.supply + ' supply, ' + d.price + ' SOL. Gas war incoming.', d.emoji); }
      if (d.phase === 'wl' || d.phase === 'public') d.minted = Math.min(1, d.minted + dt / 300 * (0.3 + d.hype * 1.6) * (d.phase === 'public' ? 1.4 : 0.6));
      if ((d.phase === 'public' && (S.t >= d.endAt || d.minted >= 1))) closeDrop(d);
    }
    N.drops = N.drops.filter((d) => d.phase !== 'done' || S.t - d.endAt < 600);
  };
  mod.hourly = function () {
    const sent = S.market || 1;
    for (const c of Object.values(N.cols)) {
      const g = (R() - 0.5) * 0.06 + (sent - 1) * 0.01 - (c.hype < 0.4 ? 0.008 : 0);
      c.floor = Math.max(0.01, r2(c.floor * Math.exp(g)));
      if (Sim.hour() % 2 === 0) { c.hist.push(c.floor); if (c.hist.length > 72) c.hist.shift(); }
    }
    if (R() < 0.04 && Object.keys(N.cols).length) {
      const c = N.cols[pick(Object.keys(N.cols))]; const up = R() < 0.6;
      c.floor = r2(c.floor * (up ? rand(1.2, 1.6) : rand(0.6, 0.85)));
      feed({ name: 'NFT alerts', handle: 'nft_alerts_sim', av: c.emoji, text: up ? '🧹 Whale just swept 40 ' + c.name + ' off the floor. Floor now ' + c.floor.toFixed(2) + ' SOL' : '📉 Someone panic-listed 60 ' + c.name + '. Floor down to ' + c.floor.toFixed(2) + ' SOL', likes: randInt(50, 900), rts: randInt(5, 120) });
    }
    // listings sell?
    for (const n of N.owned.slice()) {
      if (!n.listed) continue;
      const fair = nftValue(n);
      const p = clamp(0.45 * Math.pow(fair * 1.05 / n.listed, 4), 0, 0.85);
      if (R() < p) sellNow(n);
    }
    if (N.drops.filter((d) => d.phase !== 'done').length < 2 && R() < 0.12) {
      const d = newDrop(); N.drops.push(d);
      sys('🗓️ New NFT drop announced: ' + d.name + ' (' + d.supply + ' supply, ' + d.price + ' SOL). WL opens ' + Sim.fmtStamp(d.wlAt) + '.', d.emoji);
    }
  };
  mod.daily = function () { for (const c of Object.values(N.cols)) c.vol24 = 0; };

  function hypeLabel(h) { return h > 0.75 ? 'Insane 🔥🔥🔥' : h > 0.5 ? 'High 🔥🔥' : h > 0.3 ? 'Mid 🔥' : 'Low 🧊'; }

  Sim.NFT = { mod, mint, list, unlist, buyFloor, giveWL, nftValue, hypeLabel, RARITY, TRAITS, get N() { return N; } };
  Sim.use(mod);
})(typeof window !== 'undefined' ? window : globalThis);
