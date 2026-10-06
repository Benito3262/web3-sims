/* Web3 Sims — town + building interior layouts and drawing (canvas only, no game logic). */
(function (root) {
  'use strict';
  const Sim = root.Sim, W = Sim.World;

  // ---------- interiors: 12 x 9 tiles, 56px, 48px wall (same grid as the apartment) ----------
  const EXIT = { name: 'Exit to town', tiles: [[6, 8]], spot: [6, 8], walk: true, exit: true };
  function I(def) {
    def.objs.exit = EXIT;
    def.blocked = new Set();
    for (const k in def.objs) { const o = def.objs[k]; if (!o.walk) for (const [x, y] of o.tiles) def.blocked.add(x + ',' + y); }
    return def;
  }
  const INTERIORS = {
    cafe: I({ floor: ['#3b2a1e', '#432f22'], wall: '#2a1d14', accent: '#c58b4e', objs: {
      counter: { name: 'Coffee counter', tiles: [[1, 0], [2, 0], [3, 0], [4, 0]], spot: [2, 1], color: '#6e4d33', emoji: '☕' },
      tables:  { name: 'Cowork tables', tiles: [[7, 2], [8, 2], [10, 2], [7, 5], [8, 5], [10, 5]], spot: [9, 3], color: '#5b3f2a', emoji: '💻' },
      founders:{ name: 'Founders table', tiles: [[2, 4], [3, 4], [2, 5], [3, 5]], spot: [4, 5], color: '#7a5a3a', emoji: '🧑‍🚀' },
      plant1:  { name: 'Plant', tiles: [[11, 0]], deco: true, emoji: '🪴' },
      menu:    { name: 'Menu board', tiles: [[6, 0]], deco: true, color: '#1a1a1a', emoji: '📋' },
    }, slots: [[1, 2], [5, 2], [9, 1], [6, 4], [1, 6], [4, 7], [9, 6], [11, 4], [6, 2], [8, 7]] }),
    hall: I({ floor: ['#221a3a', '#281f44'], wall: '#160f2a', accent: '#9945FF', objs: {
      stage:  { name: 'Main stage', tiles: [[3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0]], spot: [5, 1], color: '#3b2a6a', emoji: '🎤' },
      floor:  { name: 'Networking floor', tiles: [[5, 4], [6, 4]], spot: [5, 4], walk: true, color: 'rgba(153,69,255,.25)', emoji: '🍻' },
      booths: { name: 'Sponsor booths', tiles: [[0, 3], [0, 4], [0, 5], [11, 3], [11, 4], [11, 5]], spot: [1, 4], color: '#2a6fdb', emoji: '🎟️' },
      tables: { name: 'Hacker tables', tiles: [[2, 6], [3, 6], [8, 6], [9, 6]], spot: [4, 7], color: '#2b2d36', emoji: '👨‍💻' },
      banner: { name: 'Banner', tiles: [[0, 0], [11, 0]], deco: true, color: '#14F195', emoji: '🏳️' },
    }, slots: [[2, 2], [9, 2], [4, 3], [7, 3], [3, 5], [8, 4], [6, 6], [1, 7], [10, 7], [5, 2], [7, 5], [2, 4]] }),
    club: I({ floor: ['#1a0f1f', '#22132a'], wall: '#120a16', accent: '#ff5ca8', objs: {
      bar:   { name: 'Bar', tiles: [[0, 2], [0, 3], [0, 4], [0, 5]], spot: [1, 4], color: '#5a1f4a', emoji: '🍹' },
      floor: { name: 'Dance floor', tiles: [[5, 3], [6, 3], [5, 4], [6, 4]], spot: [5, 4], walk: true, color: 'disco', emoji: '' },
      vip:   { name: 'VIP booth', tiles: [[9, 0], [10, 0], [11, 0], [10, 1], [11, 1]], spot: [9, 2], color: '#7a5a00', emoji: '🐋' },
      dj:    { name: 'DJ booth', tiles: [[5, 0], [6, 0]], deco: true, color: '#2a2a2a', emoji: '🎧' },
    }, slots: [[4, 3], [7, 4], [5, 5], [6, 2], [2, 3], [8, 2], [10, 3], [3, 6], [8, 6], [11, 3], [7, 3], [4, 5]] }),
    gym: I({ floor: ['#20262e', '#262d36'], wall: '#151a20', accent: '#4cc9f0', objs: {
      weights: { name: 'Weights', tiles: [[1, 1], [2, 1], [1, 3], [2, 3]], spot: [3, 2], color: '#3a3f47', emoji: '🏋️' },
      tread:   { name: 'Treadmills', tiles: [[6, 0], [7, 0], [8, 0]], spot: [7, 1], color: '#2b2d36', emoji: '🏃' },
      shower:  { name: 'Showers', tiles: [[11, 6], [11, 7]], spot: [10, 7], color: 'rgba(160,220,255,.25)', emoji: '🚿' },
      mirror:  { name: 'Mirror', tiles: [[11, 1], [11, 2]], deco: true, color: '#9fb4c8', emoji: '🪞' },
    }, slots: [[4, 2], [3, 4], [7, 2], [9, 1], [5, 5], [8, 5], [2, 6], [9, 7]] }),
    market: I({ floor: ['#3a3222', '#42392a'], wall: '#2a2418', accent: '#ffd166', objs: {
      shelves: { name: 'Grocery shelves', tiles: [[1, 1], [2, 1], [3, 1], [1, 4], [2, 4], [3, 4]], spot: [2, 2], color: '#5b4a2a', emoji: '🧺' },
      stall:   { name: 'Mama Put stall', tiles: [[8, 1], [9, 1], [10, 1]], spot: [9, 2], color: '#7a3a1a', emoji: '🍢' },
      crates:  { name: 'Crates', tiles: [[11, 5], [11, 6]], deco: true, color: '#6b4a2a', emoji: '🍅' },
    }, slots: [[4, 2], [7, 3], [9, 4], [5, 5], [2, 6], [8, 6], [10, 3], [4, 7]] }),
    bank: I({ floor: ['#1e2a2a', '#233131'], wall: '#142020', accent: '#14F195', objs: {
      teller: { name: 'Teller', tiles: [[2, 0], [3, 0], [4, 0], [5, 0]], spot: [3, 1], color: '#2f5a5a', emoji: '🧾' },
      otc:    { name: 'OTC desk', tiles: [[9, 2], [10, 2]], spot: [9, 3], color: '#1f3d3d', emoji: '🤝' },
      vault:  { name: 'Vault', tiles: [[11, 0]], deco: true, color: '#555', emoji: '🔒' },
    }, slots: [[2, 2], [5, 2], [8, 4], [10, 4], [3, 5], [7, 6], [1, 4]] }),
  };
  for (const nh of ['nh1', 'nh2', 'nh3']) {
    INTERIORS[nh] = I({ floor: nh === 'nh3' ? ['#2a2420', '#30291f'] : ['#3a2d22', '#43342a'], wall: nh === 'nh1' ? '#3a1f2f' : nh === 'nh2' ? '#1f3a2a' : '#2a2a2a', accent: '#ff9a3c', objs: {
      couch:   { name: 'Couch', tiles: [[4, 3], [5, 3]], spot: [4, 4], color: '#4c5d7a', emoji: '🛋️' },
      kitchen: { name: 'Kitchen', tiles: [[0, 4], [0, 5]], spot: [1, 4], color: '#3a3f47', emoji: '🍲' },
      bed:     { name: 'Bed', tiles: [[10, 0], [11, 0], [10, 1], [11, 1]], deco: true, color: '#8a7a9a', emoji: '🛏️' },
      tv:      { name: 'TV', tiles: [[4, 0], [5, 0]], deco: true, color: '#111', emoji: '📺' },
    }, slots: [[6, 4], [3, 5], [7, 2], [2, 2]] });
  }

  // group adjacent tiles so split objects (booths on both walls, table rows) get one icon each
  function clusters(tiles) {
    const left = tiles.slice(), out = [];
    while (left.length) {
      const cl = [left.shift()];
      for (let i = 0; i < cl.length; i++) for (let j = left.length - 1; j >= 0; j--) if (Math.abs(left[j][0] - cl[i][0]) + Math.abs(left[j][1] - cl[i][1]) === 1) cl.push(left.splice(j, 1)[0]);
      out.push(cl);
    }
    return out;
  }
  // ---------- drawing ----------
  function drawInterior(G, id, time) {
    const { cx, rr, emo, T, WALL } = G;
    const D = INTERIORS[id], L = W.LOTS[id];
    const cw = cx.canvas.width, ch = cx.canvas.height;
    cx.clearRect(0, 0, cw, ch);
    const wg = cx.createLinearGradient(0, 0, 0, WALL); wg.addColorStop(0, G.shade(D.wall, -10)); wg.addColorStop(1, D.wall);
    cx.fillStyle = wg; cx.fillRect(0, 0, cw, WALL);
    cx.fillStyle = D.accent; cx.fillRect(0, WALL - 3, cw, 3);
    cx.fillStyle = 'rgba(255,255,255,.85)'; cx.font = '700 15px "Space Grotesk",system-ui,sans-serif'; cx.textAlign = 'left'; cx.textBaseline = 'middle';
    cx.fillText(L.emoji + ' ' + L.name, 12, WALL / 2);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) { cx.fillStyle = (x + y) % 2 ? D.floor[0] : D.floor[1]; cx.fillRect(x * T, WALL + y * T, T, T); }
    for (const k in D.objs) {
      const o = D.objs[k]; if (o.exit) continue;
      for (const [x, y] of o.tiles) {
        const X = x * T, Y = WALL + y * T;
        if (o.color === 'disco') { const hue = (time / 8 + (x + y) * 60) % 360; rr(X + 2, Y + 2, T - 4, T - 4, 6, 'hsl(' + hue + ',80%,45%)'); continue; }
        rr(X + 3, Y + 3, T - 6, T - 6, 8, o.color || '#333', o.walk ? null : 'rgba(255,255,255,.06)');
      }
      if (o.emoji) for (const cl of clusters(o.tiles)) { let sx = 0, sy = 0; for (const [x, y] of cl) { sx += x; sy += y; } emo(o.emoji, (sx / cl.length + 0.5) * T, WALL + (sy / cl.length + 0.5) * T, 24); }
    }
    // event decor
    const ev = W.eventAt(id);
    if (ev) {
      cx.fillStyle = 'rgba(20,241,149,.92)'; rr(cw - 230, 8, 220, WALL - 16, 10, 'rgba(20,20,26,.9)', '#14F195');
      cx.fillStyle = '#14F195'; cx.font = '700 13px "Space Grotesk",system-ui,sans-serif'; cx.textAlign = 'center'; cx.fillText('LIVE: ' + ev.def.emoji + ' ' + ev.def.name, cw - 120, WALL / 2);
      for (let i = 0; i < 14; i++) { cx.fillStyle = 'hsla(' + ((i * 47 + time / 20) % 360) + ',90%,60%,.7)'; cx.fillRect((i * 97 + time / 30) % cw, WALL + 4 + (i * 13) % 20, 6, 3); }
    }
    // exit door
    rr(6 * T + 4, WALL + 8 * T + T - 10, T - 8, 10, 3, '#7a5a3a'); emo('🚪', 6 * T + 28, WALL + 8 * T + 28, 22);
    if (!W.isOpen(id) && L.kind !== 'house') { cx.fillStyle = 'rgba(0,0,0,.35)'; cx.fillRect(0, WALL, cw, ch - WALL); emo('🔒', cw / 2, ch / 2, 40); }
  }
  function npcSlotPos(id, list, idx, time) {
    const D = INTERIORS[id]; const s = D.slots[idx % D.slots.length];
    const wob = Math.sin(time / 900 + idx * 1.7) * 0.12;
    return [s[0] + 0.5 + wob, s[1] + 0.5];
  }

  // ---------- town ----------
  const TT = W.TT;
  function drawTown(G, time, night) {
    const { cx, rr, emo } = G;
    const cw = cx.canvas.width, ch = cx.canvas.height;
    cx.clearRect(0, 0, cw, ch);
    // grass base
    cx.fillStyle = '#1d3a24'; cx.fillRect(0, 0, cw, ch);
    for (let y = 0; y < W.TH; y++) for (let x = 0; x < W.TW; x++) if ((x * 7 + y * 13) % 5 === 0) { cx.fillStyle = 'rgba(255,255,255,.035)'; cx.fillRect(x * TT + 6, y * TT + 8, 3, 3); }
    // roads + sidewalks
    cx.fillStyle = '#7d8590';
    for (const y of [5, 8, 14, 17]) cx.fillRect(0, y * TT + (y === 5 || y === 14 ? TT - 5 : 0), cw, 5);
    cx.fillStyle = '#2b2f36';
    for (const y of W.ROADS_H) cx.fillRect(0, y * TT, cw, TT);
    for (const x of W.ROADS_V) cx.fillRect(x * TT, 0, TT, ch);
    cx.fillStyle = '#e8d36a';
    for (const y of [7, 16]) for (let x = 0; x < cw; x += 28) cx.fillRect(x, y * TT - 1, 14, 2);
    for (const x of [9, 19]) for (let y = 0; y < ch; y += 28) cx.fillRect(x * TT - 1, y, 2, 14);
    // crosswalks
    cx.fillStyle = 'rgba(255,255,255,.5)';
    for (const [x, y] of [[8, 6], [18, 6], [8, 15], [18, 15]]) for (let i = 0; i < 4; i++) cx.fillRect(x * TT + i * 12 + 2, y * TT - 6, 7, 5);
    // park
    const P = W.LOTS.park;
    rr(P.x * TT + 2, P.y * TT + 2, P.w * TT - 4, P.h * TT - 4, 14, '#2f6b3a');
    cx.strokeStyle = '#c9b38a'; cx.lineWidth = 6; cx.beginPath(); cx.moveTo(P.x * TT + 10, 14 * TT + 12); cx.lineTo(P.x * TT + 10, 9 * TT + 12); cx.lineTo(17 * TT + 12, 9 * TT + 12); cx.stroke();
    cx.beginPath(); cx.ellipse(16.5 * TT, 9 * TT, TT * 1.2, TT * 0.8, 0, 0, 7); cx.fillStyle = night ? '#173a5a' : '#2a8ac0'; cx.fill();
    emo('🦆', 16.6 * TT, 9.1 * TT, 12);
    for (const [x, y] of W.TREES) emo('🌳', x * TT + 12, y * TT + 12, 24);
    emo('🪑', W.PARK_SPOTS.bench[0] * TT + 12, (W.PARK_SPOTS.bench[1] - 1) * TT + 14, 16);
    emo('🌱', W.PARK_SPOTS.grass[0] * TT + 12, W.PARK_SPOTS.grass[1] * TT + 12, 14);
    cx.fillStyle = 'rgba(255,255,255,.75)'; cx.font = '700 11px "Space Grotesk",system-ui,sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('🌳 LEKKI PARK', (P.x + P.w / 2) * TT, (P.y + P.h - 0.5) * TT);
    // buildings
    const evs = W.activeEvents();
    for (const k in W.LOTS) {
      const L = W.LOTS[k]; if (L.kind === 'park') continue;
      const X = L.x * TT, Y = L.y * TT, w = L.w * TT, h = L.h * TT;
      cx.fillStyle = 'rgba(0,0,0,.35)'; cx.fillRect(X + 4, Y + 6, w, h);
      rr(X + 1, Y + 1, w - 2, h - 2, 8, L.color);
      rr(X + 1, Y + 1, w - 2, Math.min(18, h / 3), 8, L.roof);
      // windows (lit at night if open)
      const open = W.isOpen(k);
      for (let i = 0; i < L.w - 1; i++) { cx.fillStyle = night ? (open || L.kind !== 'bldg' ? 'rgba(255,214,107,.85)' : 'rgba(30,30,40,.9)') : 'rgba(180,220,255,.45)'; cx.fillRect(X + 10 + i * TT, Y + h - 22, 10, 8); }
      emo(L.emoji, X + w / 2, Y + h / 2 - 2, L.kind === 'house' ? 20 : 26);
      cx.fillStyle = '#fff'; cx.font = '700 10px "Space Grotesk",system-ui,sans-serif'; cx.textAlign = 'center';
      cx.fillText(L.name.toUpperCase(), X + w / 2, Y + 10);
      if (L.door) { rr(L.door[0] * TT + 6, L.door[1] * TT - 2, 12, 6, 2, '#e8d36a'); }
      if (L.kind === 'bldg' && !open) { cx.fillStyle = 'rgba(0,0,0,.45)'; cx.fillRect(X + 1, Y + 1, w - 2, h - 2); cx.fillStyle = '#ff9aa9'; cx.fillText('CLOSED', X + w / 2, Y + h - 30); }
      const ev = evs.find((e) => e.def.loc === k);
      if (ev) { const pulse = 0.6 + Math.sin(time / 250) * 0.4; rr(X - 2, Y - 2, w + 4, h + 4, 10, null, 'rgba(20,241,149,' + pulse + ')'); rr(X + w / 2 - 60, Y + h - 16, 120, 16, 8, 'rgba(10,10,12,.85)'); cx.fillStyle = '#14F195'; cx.fillText('LIVE ' + ev.def.emoji + ' ' + ev.def.name, X + w / 2, Y + h - 8); }
      if (k === 'home') { cx.fillStyle = '#c9a7ff'; cx.fillText('YOU', X + w / 2, Y + h - 30); }
    }
    // street lamps
    for (const [x, y] of [[7, 5], [17, 5], [7, 14], [17, 14], [27, 5], [0, 14], [10, 17], [20, 17]]) {
      cx.fillStyle = '#555'; cx.fillRect(x * TT + 11, y * TT + 4, 2, 16);
      cx.fillStyle = night ? '#ffd56b' : '#999'; cx.beginPath(); cx.arc(x * TT + 12, y * TT + 4, 3, 0, 7); cx.fill();
    }
    // ride stand
    emo('🚕', 27 * TT + 10, 6 * TT + 12, 16);
  }
  function drawTownLights(G, na) {
    const { cx } = G; const cw = cx.canvas.width, ch = cx.canvas.height;
    cx.fillStyle = 'rgba(8,10,40,' + na + ')'; cx.fillRect(0, 0, cw, ch);
    cx.save(); cx.globalCompositeOperation = 'lighter';
    for (const [x, y] of [[7, 5], [17, 5], [7, 14], [17, 14], [27, 5], [0, 14], [10, 17], [20, 17]]) {
      const g = cx.createRadialGradient(x * TT + 12, y * TT + 6, 2, x * TT + 12, y * TT + 6, 70); g.addColorStop(0, 'rgba(255,200,120,' + na * 0.55 + ')'); g.addColorStop(1, 'rgba(255,200,120,0)');
      cx.fillStyle = g; cx.fillRect(x * TT - 60, y * TT - 60, 144, 144);
    }
    cx.restore();
  }

  root.TownView = { INTERIORS, drawInterior, drawTown, drawTownLights, npcSlotPos };
})(typeof window !== 'undefined' ? window : globalThis);
