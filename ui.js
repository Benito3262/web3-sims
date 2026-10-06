/* Web3 Sims — UI layer (canvas room + DOM panels). */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const H = Sim.h;
  const Mk = Sim.Market, AD = Sim.Airdrop, NF = Sim.NFT, SO = Sim.Social;
  const S = () => Sim.state;

  // ================= ROOM =================
  const T = 56, COLS = 12, ROWS = 9, WALL = 48;
  const cv = $('#room'), cx = cv.getContext('2d');
  const OBJ = {
    desk:    { name: 'Desk / PC', tiles: [[1, 0], [2, 0], [3, 0]], spot: [2, 1], sit: [2, 0.9] },
    couch:   { name: 'Couch & TV', tiles: [[5, 3], [6, 3]], spot: [5, 4], sit: [5.5, 3.05] },
    tv:      { name: 'Couch & TV', tiles: [[5, 0], [6, 0]], alias: 'couch' },
    phone:   { name: 'Phone', tiles: [[7, 3]], spot: [7, 4] },
    bed:     { name: 'Bed', tiles: [[10, 0], [11, 0], [10, 1], [11, 1], [10, 2], [11, 2]], spot: [9, 1], sit: [10.5, 0.9] },
    nights:  { name: 'Nightstand', tiles: [[9, 0]], deco: true },
    kitchen: { name: 'Kitchen', tiles: [[0, 4], [0, 5], [0, 6]], spot: [1, 5] },
    shower:  { name: 'Shower', tiles: [[11, 7], [11, 8]], spot: [10, 8], sit: [11, 7.6] },
    toilet:  { name: 'Bathroom', tiles: [[11, 5]], deco: true },
    door:    { name: 'Front door', tiles: [[3, 8]], spot: [3, 8], walk: true },
    gpc:     { name: 'Gaming PC', tiles: [[4, 0]], deco: true },
    ring:    { name: 'Ring light', tiles: [[0, 1]], deco: true },
    plant:   { name: 'Plant', tiles: [[0, 0]], deco: true },
    shelf:   { name: 'Shelf', tiles: [[0, 8]], deco: true },
  };
  const blocked = new Set();
  for (const [k, o] of Object.entries(OBJ)) if (!o.walk) for (const [x, y] of o.tiles) blocked.add(x + ',' + y);
  function objAt(tx, ty) {
    for (const [k, o] of Object.entries(OBJ)) if (o.tiles.some(([x, y]) => x === tx && y === ty)) return o.alias || k;
    return null;
  }
  const char = { x: 5.5, y: 5.5, path: [], face: 1, bob: 0, walking: false };
  let pendingAct = null; // {id, obj, label, emoji, npc}
  let trip = null;       // {dest: 'home'|'town'|lotId, ride: bool}
  let speed = 1, modalOpen = false;
  const W = Sim.World, TV = window.TownView;
  const WS = () => S().world;
  function scene() { const st = S(); return st && st.world ? st.world.scene : 'home'; }
  function placeName(sc) { return sc === 'home' ? 'home' : sc === 'town' ? 'town' : (W.LOTS[sc] ? W.LOTS[sc].name : sc); }
  function grid(sc) {
    sc = sc || scene();
    if (sc === 'town') return { cols: W.TW, rows: W.TH, tile: W.TT, top: 0, blocked: (x, y) => !W.walkable(x, y) };
    if (sc === 'home') return { cols: COLS, rows: ROWS, tile: T, top: WALL, blocked: (x, y) => blocked.has(x + ',' + y) };
    const D = TV.INTERIORS[sc]; return { cols: 12, rows: 9, tile: T, top: WALL, blocked: (x, y) => D.blocked.has(x + ',' + y) };
  }
  function sceneObjs(sc) { sc = sc || scene(); if (sc === 'home') return OBJ; if (sc === 'town') return {}; return TV.INTERIORS[sc].objs; }
  function objAtScene(tx, ty) {
    const objs = sceneObjs();
    for (const k in objs) { const o = objs[k]; if (o.tiles.some(([x, y]) => x === tx && y === ty)) return o.alias || k; }
    return null;
  }

  function bfs(sx, sy, tx, ty) {
    const g = grid();
    const key = (x, y) => x + ',' + y;
    if (sx === tx && sy === ty) return [];
    const q = [[sx, sy]], prev = new Map([[key(sx, sy), null]]); let qi = 0;
    while (qi < q.length) {
      const [x, y] = q[qi++];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows || prev.has(k)) continue;
        if (g.blocked(nx, ny) && !(nx === tx && ny === ty)) continue;
        prev.set(k, [x, y]);
        if (nx === tx && ny === ty) {
          const path = []; let c = [nx, ny];
          while (c && !(c[0] === sx && c[1] === sy)) { path.unshift([c[0] + 0.5, c[1] + 0.5]); c = prev.get(key(c[0], c[1])); }
          return path;
        }
        q.push([nx, ny]);
      }
    }
    return null;
  }
  function walkTo(tx, ty) {
    const g = grid();
    const sx = clampI(Math.floor(char.x), 0, g.cols - 1), sy = clampI(Math.floor(char.y), 0, g.rows - 1);
    const p = scene() === 'town' ? W.townPath(sx, sy, tx, ty) : bfs(sx, sy, clampI(tx, 0, g.cols - 1), clampI(ty, 0, g.rows - 1));
    if (p === null) return false;
    char.path = p; return true;
  }
  const clampI = (v, a, b) => Math.max(a, Math.min(b, v));
  const atTile = (sp) => Math.floor(char.x) === sp[0] && Math.floor(char.y) === sp[1];

  // where does an action happen?
  function homeRemoteOK(id, obj) { return obj === 'phone' || (obj === 'desk' && id !== 'games'); }
  function targetFor(pa) {
    const obj = pa.obj;
    if (obj === 'npc') return { scene: scene(), npc: pa.npc };
    const i = obj.indexOf(':');
    if (i > 0) {
      const loc = obj.slice(0, i), key = obj.slice(i + 1);
      if (loc === 'park') return { scene: 'town', spot: W.PARK_SPOTS[key] };
      return { scene: loc, spot: TV.INTERIORS[loc].objs[key].spot };
    }
    return { scene: 'home', spot: (OBJ[obj] || OBJ.desk).spot };
  }
  function npcPos(id) {
    const sc = scene(); const n = WS().npcs[id]; if (!n) return null;
    if (sc === 'town') return W.npcsInTown().indexOf(id) >= 0 ? [n.x, n.y] : null;
    if (sc === 'home') return null;
    const list = W.npcsAt(sc); const i = list.indexOf(id); if (i < 0) return null;
    return TV.npcSlotPos(sc, list, i, 0);
  }
  function clearTalk() { const w = WS(); if (w) { w.approach = null; if (!(S().action && String(S().action.id).indexOf('soc_') === 0)) w.talkTo = null; } }

  function queueAction(id, extra) {
    extra = extra || {};
    const info = Sim.actionInfo(id);
    if (!info) return;
    if (info.obj === 'npc') { WS().talkTo = extra.npc; }
    if (Sim.check(id)) { flushEvents(); if (info.obj === 'npc') WS().talkTo = null; return; }
    if (S().action && S().action.id === 'passout') { toast('You are passed out. Let them sleep.', 'bad'); return; }
    if (S().action) { leaveSeat(); Sim.cancelAction(); }
    leaveSeat();
    closeMenu();
    const sc = scene();
    if (sc !== 'home' && info.obj.indexOf(':') < 0 && info.obj !== 'npc' && homeRemoteOK(id, info.obj)) {
      // do it right here on your phone / laptop (slower unless you are at the café)
      pendingAct = null; trip = null; char.path = []; clearTalk();
      Sim.startAction(id, { remote: true, minsMult: sc === 'cafe' ? 1 : 1.25 });
      flushEvents(); renderPanelSoon();
      return;
    }
    pendingAct = { id, obj: info.obj, label: info.label, emoji: info.emoji, npc: extra.npc || null };
    if (info.obj === 'npc') { WS().approach = extra.npc; WS().talkTo = extra.npc; }
    char.path = [];
    const tg = targetFor(pendingAct);
    trip = tg.scene !== sc ? { dest: tg.scene, ride: !!extra.ride } : null;
    if (trip && !trip.ride) toast('🚶 Heading to ' + placeName(tg.scene) + ' → ' + info.label, 'info');
    if (speed === 0) toast('Game is paused. Press ▶ 1x to let your sim move.', 'info');
  }
  function travel(dest, ride) {
    if (S().action && S().action.id === 'passout') return;
    if (S().action) { leaveSeat(); Sim.cancelAction(); }
    pendingAct = null; char.path = []; clearTalk(); closeMenu();
    if (dest === scene()) return;
    trip = { dest, ride: !!ride };
    if (speed === 0) toast('Game is paused. Press ▶ 1x to let your sim move.', 'info');
  }
  function leaveSeat() {
    const a = S().action;
    if (a && a.obj && !a.remote && scene() === 'home' && OBJ[a.obj]) { const sp = OBJ[a.obj].spot; char.x = sp[0] + 0.5; char.y = sp[1] + 0.5; }
  }
  function enterScene(sc, how) {
    const prev = W.setScene(sc);
    closeMenu(); char.path = [];
    if (sc === 'town') {
      const L = W.LOTS[prev];
      const d = how === 'ride' ? [12, 7] : (L && L.door) || W.LOTS.home.door;
      char.x = d[0] + 0.5; char.y = d[1] + 0.5;
    } else if (sc === 'home') { char.x = 3.5; char.y = 7.5; }
    else { char.x = 6.5; char.y = 7.5; }
    flushEvents(); renderPanelSoon();
  }
  function stepTrip() {
    const sc = scene(), dest = trip.dest;
    if (sc === dest) { trip = null; return; }
    if (trip.ride) {
      trip.ride = false;
      if (W.takeRide(dest)) { enterScene(dest, 'ride'); trip = null; }
      else { trip = null; pendingAct = null; clearTalk(); }
      flushEvents();
      return;
    }
    if (sc !== 'town') {
      const ex = sc === 'home' ? OBJ.door.spot : [6, 8];
      if (atTile(ex)) enterScene('town', 'walk');
      else if (!walkTo(ex[0], ex[1])) { trip = null; pendingAct = null; }
      return;
    }
    if (dest === 'town') { trip = null; return; }
    const L = W.LOTS[dest]; const door = L.door;
    if (!door) { trip = null; return; }
    if (atTile(door)) {
      if (L.kind !== 'home' && !W.isOpen(dest)) { toast(L.emoji + ' ' + L.name + ' is closed right now (' + W.hoursLabel(dest) + ').', 'bad'); trip = null; pendingAct = null; return; }
      enterScene(dest, 'walk'); trip = null;
    } else if (!walkTo(door[0], door[1])) { trip = null; pendingAct = null; }
  }

  function updateChar(dtReal) {
    const st = S();
    char.walking = false;
    if (st.action) {
      if (st.action.id === 'passout' && scene() !== 'home') { enterScene('home', 'ride'); toast('🚑 You passed out in town. A kind stranger dropped you home.', 'bad'); trip = null; pendingAct = null; }
      return;
    }
    if (speed <= 0) return;
    if (char.path.length) {
      const tilesPerSec = scene() === 'town' ? 5.5 : 3.4;
      const sp = tilesPerSec * Math.min(speed, 2.5) * dtReal;
      const [nx, ny] = char.path[0];
      const dx = nx - char.x, dy = ny - char.y, d = Math.hypot(dx, dy);
      if (dx) char.face = Math.sign(dx);
      if (d <= sp) { char.x = nx; char.y = ny; char.path.shift(); } else { char.x += dx / d * sp; char.y += dy / d * sp; }
      char.walking = true; char.bob += dtReal * 14;
      return;
    }
    if (trip) { stepTrip(); return; }
    if (pendingAct) {
      const tg = targetFor(pendingAct);
      if (tg.scene !== scene()) { trip = { dest: tg.scene, ride: false }; return; }
      if (pendingAct.obj === 'npc') {
        const p = npcPos(pendingAct.npc);
        if (!p) { toast('They walked off before you got there.', 'info'); pendingAct = null; clearTalk(); WS().talkTo = null; return; }
        if (Math.hypot(p[0] - char.x, p[1] - char.y) < 1.6) {
          const id = pendingAct.id; pendingAct = null; WS().approach = null;
          char.face = p[0] >= char.x ? 1 : -1;
          if (!Sim.startAction(id)) WS().talkTo = null;
          flushEvents(); renderPanelSoon();
        } else {
          const tx = Math.floor(p[0]), ty = Math.floor(p[1]);
          const g = grid(); const cands = [[tx, ty + 1], [tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty]].filter(([x, y]) => x >= 0 && y >= 0 && x < g.cols && y < g.rows && !g.blocked(x, y));
          let ok = false; for (const c of cands) if (walkTo(c[0], c[1])) { ok = true; break; }
          if (!ok) { pendingAct = null; clearTalk(); }
        }
        return;
      }
      if (atTile(tg.spot)) { const id = pendingAct.id; pendingAct = null; Sim.startAction(id); flushEvents(); renderPanelSoon(); }
      else if (!walkTo(tg.spot[0], tg.spot[1])) pendingAct = null;
    }
  }

  // ---- drawing helpers ----
  function rr(x, y, w, h, r, fill, stroke) {
    cx.beginPath(); cx.roundRect(x, y, w, h, r);
    if (fill) { cx.fillStyle = fill; cx.fill(); }
    if (stroke) { cx.strokeStyle = stroke; cx.lineWidth = 2; cx.stroke(); }
  }
  function emo(e, x, y, size) { cx.font = size + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(e, x, y); }
  const px = (tx) => tx * T, py = (ty) => WALL + ty * T;

  function skyColors(m) {
    const h = m / 60;
    if (h < 5 || h >= 21) return ['#0b1030', '#1a1f4a', true];
    if (h < 7) return ['#ff9a76', '#5b6bd6', false];
    if (h < 17) return ['#6ec6ff', '#bfe6ff', false];
    if (h < 19) return ['#ffb36b', '#ff6f91', false];
    return ['#3a2a6a', '#ff7e6b', true];
  }
  function nightAlpha(m) {
    const h = m / 60;
    if (h >= 22 || h < 5) return 0.42;
    if (h >= 19) return (h - 19) / 3 * 0.42;
    if (h < 7) return (7 - h) / 2 * 0.42;
    return 0;
  }

  function drawRoom(time) {
    const sc = scene();
    if (sc === 'town') return drawTownScene(time);
    if (sc !== 'home') return drawInteriorScene(sc, time);
    drawHome(time);
  }
  function drawHome(time) {
    const st = S(); const it = st.items; const home = Sim.HOMES[st.home.tier];
    const m = Sim.minOfDay();
    cx.clearRect(0, 0, cv.width, cv.height);
    // wall
    const wg = cx.createLinearGradient(0, 0, 0, WALL);
    wg.addColorStop(0, shade(home.wall, -10)); wg.addColorStop(1, home.wall);
    cx.fillStyle = wg; cx.fillRect(0, 0, cv.width, WALL);
    // window
    const [s1, s2, night] = skyColors(m);
    const wx = px(7) + 6, ww = T * 2 - 12;
    const sg = cx.createLinearGradient(0, 6, 0, WALL - 4); sg.addColorStop(0, s1); sg.addColorStop(1, s2);
    rr(wx, 6, ww, WALL - 10, 6, sg);
    drawView(home.view, wx, 6, ww, WALL - 10, night);
    rr(wx, 6, ww, WALL - 10, 6, null, '#5a5a66');
    cx.fillStyle = '#5a5a66'; cx.fillRect(wx + ww / 2 - 1, 6, 2, WALL - 10);
    // poster
    rr(px(9) + 14, 8, 30, 30, 4, '#111'); emo(st.home.tier >= 2 ? '🖼️' : '📈', px(9) + 29, 23, 18);
    // floor
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const bath = x >= 9 && y >= 5;
      cx.fillStyle = bath ? ((x + y) % 2 ? '#26303a' : '#2c3844') : ((x + Math.floor(y / 1)) % 2 ? home.floor[0] : home.floor[1].slice(0, 7));
      cx.fillRect(px(x), py(y), T, T);
      if (!bath) { cx.fillStyle = 'rgba(0,0,0,.12)'; cx.fillRect(px(x), py(y) + T - 2, T, 2); }
    }
    // bathroom divider
    cx.fillStyle = shade(home.wall, 10); cx.fillRect(px(9) - 3, py(5) - 3, T * 3 + 3, 6); cx.fillRect(px(9) - 3, py(5), 6, T * 1.4);
    // rug
    rr(px(4) + 6, py(2) + 10, T * 4 - 12, T * 3 - 20, 18, st.home.tier >= 2 ? '#3b2a55' : '#2f2442');
    rr(px(4) + 16, py(2) + 20, T * 4 - 32, T * 3 - 40, 12, null, 'rgba(255,255,255,.08)');
    // LED strip
    if (it.led) {
      const hue = (time / 30) % 360;
      cx.save(); cx.shadowColor = `hsl(${hue},90%,60%)`; cx.shadowBlur = 16; cx.fillStyle = `hsl(${hue},90%,60%)`;
      cx.fillRect(0, WALL - 3, cv.width, 3); cx.restore();
    }
    // desk
    rr(px(1) + 2, py(0) + 4, T * 3 - 4, T - 14, 8, '#5b3f2a'); rr(px(1) + 2, py(0) + 4, T * 3 - 4, 8, 6, '#6e4d33');
    rr(px(2) + 8, py(0) + 10, 40, 24, 4, '#111', '#333');
    cx.fillStyle = st.action && st.action.obj === 'desk' ? '#1b2f5a' : '#0e1a2e'; cx.fillRect(px(2) + 11, py(0) + 13, 34, 18);
    if (st.action && st.action.obj === 'desk') { cx.fillStyle = '#14F195'; for (let i = 0; i < 4; i++) cx.fillRect(px(2) + 14, py(0) + 16 + i * 4, 8 + ((time / 120 + i * 7) % 20), 2); }
    if (it.monitor2) { rr(px(1) + 10, py(0) + 12, 34, 22, 4, '#111', '#333'); cx.fillStyle = '#0e2a1e'; cx.fillRect(px(1) + 13, py(0) + 15, 28, 16); cx.strokeStyle = '#14F195'; cx.beginPath(); cx.moveTo(px(1) + 14, py(0) + 28); cx.lineTo(px(1) + 22, py(0) + 22); cx.lineTo(px(1) + 30, py(0) + 25); cx.lineTo(px(1) + 40, py(0) + 17); cx.stroke(); }
    emo('⌨️', px(3) + 18, py(0) + 26, 18);
    if (it.coffee) emo('☕', px(3) + 42, py(0) + 18, 13);
    // chair
    if (it.chair) { rr(px(2) + 12, py(1) + 2, 32, 30, 10, '#9945FF'); rr(px(2) + 16, py(1) + 6, 24, 22, 8, '#6b2fc0'); }
    else { rr(px(2) + 14, py(1) + 6, 28, 24, 6, '#3a3a3a'); }
    // gaming pc
    if (it.gamingpc) { rr(px(4) + 14, py(0) + 4, 28, 42, 6, '#151515', '#9945FF'); const hue = (time / 20) % 360; cx.fillStyle = `hsl(${hue},90%,60%)`; cx.fillRect(px(4) + 18, py(0) + 10, 20, 3); cx.fillRect(px(4) + 18, py(0) + 36, 20, 3); emo('🌀', px(4) + 28, py(0) + 24, 14); }
    // ring light
    if (it.ringlight) { cx.save(); cx.strokeStyle = '#fff6d6'; cx.lineWidth = 5; cx.shadowColor = '#fff6d6'; cx.shadowBlur = 14; cx.beginPath(); cx.arc(px(0) + 28, py(1) + 22, 14, 0, Math.PI * 2); cx.stroke(); cx.restore(); cx.fillStyle = '#555'; cx.fillRect(px(0) + 27, py(1) + 36, 2, 16); }
    // plant
    if (it.plant) emo('🪴', px(0) + 28, py(0) + 28, 34);
    // shelf
    rr(px(0) + 6, py(8) + 6, T - 12, T - 12, 6, '#4a3626'); emo(st.home.tier >= 1 ? '🏆' : '📚', px(0) + 28, py(8) + 28, 22);
    // TV
    rr(px(5) + 4, py(0) + 6, T * 2 - 8, 34, 6, '#0b0b0d', '#333');
    const tvOn = st.action && st.action.obj === 'couch';
    if (tvOn) { const g = cx.createLinearGradient(px(5), 0, px(7), 0); g.addColorStop(0, `hsl(${(time / 15) % 360},70%,45%)`); g.addColorStop(1, `hsl(${(time / 15 + 120) % 360},70%,45%)`); rr(px(5) + 8, py(0) + 10, T * 2 - 16, 26, 4, g); }
    else { rr(px(5) + 8, py(0) + 10, T * 2 - 16, 26, 4, '#15151a'); }
    cx.fillStyle = '#2b2b30'; cx.fillRect(px(5) + 20, py(0) + 40, T * 2 - 40, 6);
    // couch
    rr(px(5) + 2, py(3) + 8, T * 2 - 4, T - 12, 12, st.home.tier >= 2 ? '#5a3f8f' : '#3d4a6b');
    rr(px(5) + 2, py(3) + 30, T * 2 - 4, 14, 8, st.home.tier >= 2 ? '#47317a' : '#2f3a57');
    const arm = st.home.tier >= 2 ? '#3a2766' : '#26304a';
    rr(px(5) - 2, py(3) + 6, 12, T - 10, 6, arm); rr(px(7) - 10, py(3) + 6, 12, T - 10, 6, arm);
    rr(px(5) + 14, py(3) + 14, 20, 14, 6, '#ffd166'); rr(px(6) + 22, py(3) + 14, 20, 14, 6, '#14F195');
    // phone table
    rr(px(7) + 12, py(3) + 12, 32, 32, 8, '#5b3f2a'); emo('📱', px(7) + 28, py(3) + 28, 20);
    // bed
    const bedC = it.bed ? '#9945FF' : '#4c5d7a';
    rr(px(10) + 4, py(0) + 4, T * 2 - 8, T * 3 - 8, 12, '#3a2a20');
    rr(px(10) + 8, py(0) + 8, T * 2 - 16, T * 3 - 16, 10, '#e8e4dc');
    rr(px(10) + 8, py(0) + 50, T * 2 - 16, T * 3 - 58, 10, bedC);
    rr(px(10) + 16, py(0) + 14, 32, 22, 8, '#fff'); rr(px(10) + 56, py(0) + 14, 32, 22, 8, '#fff');
    // nightstand
    rr(px(9) + 8, py(0) + 8, 40, 38, 6, '#5b3f2a'); emo(it.bed ? '🕯️' : '⏰', px(9) + 28, py(0) + 26, 18);
    // kitchen
    rr(px(0) + 4, py(4) + 2, T - 8, T * 3 - 4, 8, '#3a3f47');
    rr(px(0) + 6, py(4) + 4, T - 12, T - 8, 6, '#d9e2ec'); cx.fillStyle = '#9aa7b5'; cx.fillRect(px(0) + 40, py(4) + 14, 3, 22); // fridge
    rr(px(0) + 6, py(5) + 4, T - 12, T - 8, 6, '#20242b'); for (const [a, b] of [[16, 16], [36, 16], [16, 36], [36, 36]]) { cx.beginPath(); cx.arc(px(0) + a, py(5) + b, 6, 0, 7); cx.strokeStyle = st.action && st.action.id === 'cook' ? '#ff7b39' : '#555'; cx.lineWidth = 2; cx.stroke(); }
    rr(px(0) + 6, py(6) + 4, T - 12, T - 8, 6, '#5b3f2a'); emo(it.coffee ? '☕' : '🍞', px(0) + 28, py(6) + 28, 20);
    // bathroom
    rr(px(11) + 8, py(5) + 10, 36, 36, 12, '#e8eef6'); rr(px(11) + 14, py(5) + 16, 24, 20, 8, '#cfd8e3');
    rr(px(11) + 4, py(7) + 4, T - 8, T * 2 - 8, 8, 'rgba(160,220,255,.18)', 'rgba(160,220,255,.5)');
    emo('🚿', px(11) + 28, py(7) + 20, 22);
    if (st.action && st.action.obj === 'shower') { cx.fillStyle = 'rgba(160,220,255,.6)'; for (let i = 0; i < 8; i++) cx.fillRect(px(11) + 12 + i * 4, py(7) + 32 + ((time / 8 + i * 13) % 50), 1.5, 6); }
    rr(px(9) + 10, py(8) + 10, 34, 30, 8, '#cfd8e3'); emo('🪥', px(9) + 27, py(8) + 25, 14);
    // door
    rr(px(3) + 4, py(8) + T - 10, T - 8, 10, 3, '#7a5a3a'); emo('🚪', px(3) + 28, py(8) + 30, 22);
    // villa extras
    if (st.home.tier >= 3) emo('🏊', px(8) + 28, py(7) + 28, 30);
    if (st.home.tier >= 1) emo('🎧', px(1) + 16, py(0) + 34, 12);
    // character
    drawChar(time);
    // hover highlight
    if (hoverObj && OBJ[hoverObj]) {
      cx.save(); cx.strokeStyle = 'rgba(20,241,149,.7)'; cx.lineWidth = 2; cx.setLineDash([6, 4]);
      for (const [x, y] of OBJ[hoverObj].tiles) cx.strokeRect(px(x) + 2, py(y) + 2, T - 4, T - 4);
      if (hoverObj === 'couch') for (const [x, y] of OBJ.tv.tiles) cx.strokeRect(px(x) + 2, py(y) + 2, T - 4, T - 4);
      cx.restore();
    }
    // night tint
    const na = nightAlpha(m);
    if (na > 0) {
      cx.fillStyle = `rgba(8,10,40,${na})`; cx.fillRect(0, 0, cv.width, cv.height);
      // lamp glow
      cx.save(); cx.globalCompositeOperation = 'lighter';
      const g = cx.createRadialGradient(px(9) + 28, py(0) + 26, 4, px(9) + 28, py(0) + 26, 120); g.addColorStop(0, `rgba(255,200,120,${na * 0.5})`); g.addColorStop(1, 'rgba(255,200,120,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, cv.width, cv.height);
      const g2 = cx.createRadialGradient(px(2) + 28, py(0) + 22, 4, px(2) + 28, py(0) + 22, 130); g2.addColorStop(0, `rgba(120,160,255,${na * 0.45})`); g2.addColorStop(1, 'rgba(120,160,255,0)');
      cx.fillStyle = g2; cx.fillRect(0, 0, cv.width, cv.height);
      cx.restore();
    }
    if (st.action && st.action.outside) {
      cx.fillStyle = 'rgba(10,10,12,.55)'; cx.fillRect(0, 0, cv.width, cv.height);
      rr(cv.width / 2 - 170, cv.height / 2 - 50, 340, 100, 20, 'rgba(20,20,26,.95)', '#3dd68c');
      emo(st.action.emoji, cv.width / 2, cv.height / 2 - 16, 34);
      cx.fillStyle = '#e8eef6'; cx.font = '600 16px "Space Grotesk",sans-serif'; cx.fillText(st.action.id === 'grass' ? 'Out touching grass… 🌱' : 'At a crypto meetup… 🍻', cv.width / 2, cv.height / 2 + 22);
    }
  }
  function drawView(view, x, y, w, h, night) {
    cx.save(); cx.beginPath(); cx.rect(x, y, w, h); cx.clip();
    if (night) { cx.fillStyle = '#fff'; for (let i = 0; i < 8; i++) cx.fillRect(x + (i * 37) % w, y + (i * 13) % (h / 2), 1.5, 1.5); }
    const dark = night ? '#141836' : '#3c4a6a';
    if (view === 'city' || view === 'skyline') {
      const n = view === 'skyline' ? 9 : 6;
      for (let i = 0; i < n; i++) { const bw = w / n; const bh = (view === 'skyline' ? 0.6 : 0.35) * h + ((i * 53) % 10) / 10 * h * 0.35; cx.fillStyle = dark; cx.fillRect(x + i * bw, y + h - bh, bw - 2, bh); if (night) { cx.fillStyle = '#ffd56b'; cx.fillRect(x + i * bw + 3, y + h - bh + 4, 2, 2); } }
    } else if (view === 'lagoon') {
      cx.fillStyle = night ? '#0d2240' : '#2a7ab0'; cx.fillRect(x, y + h * 0.6, w, h * 0.4);
      cx.fillStyle = dark; cx.fillRect(x + 6, y + h * 0.35, 18, h * 0.25); cx.fillRect(x + 50, y + h * 0.28, 24, h * 0.32);
    } else if (view === 'sea') {
      cx.fillStyle = night ? '#0d2240' : '#1fa3c9'; cx.fillRect(x, y + h * 0.55, w, h * 0.45);
      emo('🌴', x + 14, y + h * 0.55, 18); emo('⛵', x + w - 20, y + h * 0.6, 12);
    }
    cx.restore();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1, 7), 16);
    const r = clampI((n >> 16) + amt, 0, 255), g = clampI(((n >> 8) & 255) + amt, 0, 255), b = clampI((n & 255) + amt, 0, 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function moodColor() {
    const m = Sim.mood();
    return m > 62 ? '#14F195' : m > 42 ? '#ffd166' : m > 26 ? '#ff9a3c' : '#ff5c7a';
  }
  function drawPerson(c, x, y, scale, opts) {
    opts = opts || {};
    const p = S() ? S().player : opts.player;
    const pl = opts.player || p;
    c.save(); c.translate(x, y); c.scale(scale, scale);
    if (opts.lying) c.rotate(-Math.PI / 2);
    // shadow
    if (!opts.lying) { c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(0, 16, 14, 5, 0, 0, 7); c.fill(); }
    // body
    c.fillStyle = pl.color; c.beginPath(); c.roundRect(-11, -2, 22, 18, 8); c.fill();
    // head
    c.fillStyle = '#c68a5a'; c.beginPath(); c.arc(0, -10, 10, 0, 7); c.fill();
    // eyes
    c.fillStyle = '#1a1a1a';
    if (opts.sleep) { c.fillRect(-5, -10, 4, 1.5); c.fillRect(2, -10, 4, 1.5); }
    else { c.beginPath(); c.arc(-3.5 + (opts.face || 0), -10, 1.6, 0, 7); c.arc(3.5 + (opts.face || 0), -10, 1.6, 0, 7); c.fill(); }
    // hat
    const hat = pl.hat;
    if (hat === 'cap') { c.fillStyle = pl.color; c.beginPath(); c.arc(0, -13, 10, Math.PI, 0); c.fill(); c.fillRect(0, -14, 14, 3); }
    else if (hat === 'beanie') { c.fillStyle = '#ff6b6b'; c.beginPath(); c.arc(0, -13, 10.5, Math.PI, 0); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -24, 3, 0, 7); c.fill(); }
    else if (hat === 'headphones') { c.strokeStyle = '#222'; c.lineWidth = 3; c.beginPath(); c.arc(0, -11, 11, Math.PI, 0); c.stroke(); c.fillStyle = '#14F195'; c.fillRect(-13, -13, 5, 8); c.fillRect(8, -13, 5, 8); }
    else if (hat === 'crown') { c.fillStyle = '#ffd166'; c.beginPath(); c.moveTo(-8, -17); c.lineTo(-8, -25); c.lineTo(-4, -20); c.lineTo(0, -27); c.lineTo(4, -20); c.lineTo(8, -25); c.lineTo(8, -17); c.closePath(); c.fill(); }
    else if (hat === 'party') { c.fillStyle = '#9945FF'; c.beginPath(); c.moveTo(-7, -17); c.lineTo(0, -32); c.lineTo(7, -17); c.closePath(); c.fill(); c.fillStyle = '#14F195'; c.beginPath(); c.arc(0, -32, 2.5, 0, 7); c.fill(); }
    c.restore();
  }
  function drawPlumbob(x, y, time) {
    const w = Math.abs(Math.cos(time / 600)) * 9 + 2;
    const yy = y + Math.sin(time / 300) * 3;
    const col = moodColor();
    cx.save(); cx.shadowColor = col; cx.shadowBlur = 12;
    cx.fillStyle = col; cx.beginPath(); cx.moveTo(x, yy - 12); cx.lineTo(x + w, yy); cx.lineTo(x, yy + 12); cx.lineTo(x - w, yy); cx.closePath(); cx.fill();
    cx.shadowBlur = 0; cx.fillStyle = 'rgba(255,255,255,.35)'; cx.beginPath(); cx.moveTo(x, yy - 12); cx.lineTo(x + w, yy); cx.lineTo(x, yy); cx.closePath(); cx.fill();
    // SOL stripes
    cx.strokeStyle = 'rgba(10,10,10,.35)'; cx.lineWidth = 1.2;
    for (const o of [-4, 0, 4]) { cx.beginPath(); cx.moveTo(x - w * 0.5, yy + o); cx.lineTo(x + w * 0.5, yy + o - 1.5); cx.stroke(); }
    cx.restore();
  }
  function drawChar(time) {
    const st = S(); const a = st.action; const sc = scene();
    if (a && a.outside) return;
    let x = char.x, y = char.y, lying = false, sleep = false;
    if (sc === 'home' && a && !a.remote) {
      if (a.obj && OBJ[a.obj] && OBJ[a.obj].sit) { [x, y] = OBJ[a.obj].sit; }
      if (a.id === 'sleep' || a.id === 'nap') { lying = true; sleep = true; x = 10.5; y = 1.2; }
    }
    if (a && a.id === 'passout') { lying = true; sleep = true; }
    const g = grid(); const k = sc === 'town' ? 0.62 : 1;
    const bob = char.walking ? Math.abs(Math.sin(char.bob)) * 3 * k : 0;
    const X = x * g.tile, Y = g.top + y * g.tile - bob;
    drawPerson(cx, X, Y, 1.25 * k, { lying, sleep, face: char.face * 1.2 });
    cx.save(); cx.translate(X, Y); cx.scale(k, k);
    if (!lying || a.id !== 'passout') drawPlumbob(0, -(lying ? 40 : 52), time);
    if (a) {
      const bx = 26, by = -38;
      rr(bx - 15, by - 15, 30, 30, 15, 'rgba(255,255,255,.92)');
      cx.fillStyle = 'rgba(255,255,255,.92)'; cx.beginPath(); cx.moveTo(bx - 10, by + 8); cx.lineTo(bx - 18, by + 18); cx.lineTo(bx - 3, by + 12); cx.fill();
      emo(sleep ? '💤' : a.emoji, bx, by + 1, 17);
    } else if (pendingAct || trip) {
      emo('💭', 24, -36, 18);
    }
    cx.restore();
  }
  // ---- outside scenes ----
  const G = { cx, rr, emo, T, WALL, shade: (h, a) => shade(h, a) };
  function drawNPC(id, X, Y, k, time, labels) {
    const P = W.personInfo(id); if (!P) return;
    const n = WS().npcs[id] || {};
    const walking = !!n.dest;
    const bob = walking ? Math.abs(Math.sin(time / 90 + id.length)) * 2 * k : 0;
    drawPerson(cx, X, Y - bob, 1.15 * k, { player: { color: P.color, hat: P.hat }, face: (n.face || 0) * 1.2 });
    cx.save(); cx.translate(X, Y - bob); cx.scale(k, k);
    emo(P.av, 0, -44, 16);
    if (labels) {
      const label = P.met ? P.name.split(' ')[0] : '???';
      cx.font = '600 11px "Space Grotesk",system-ui,sans-serif'; const w = cx.measureText(label).width + 10;
      rr(-w / 2, 20, w, 15, 7, P.rival >= 50 ? 'rgba(255,92,122,.85)' : P.romance >= 60 ? 'rgba(255,92,168,.85)' : P.met ? 'rgba(20,20,26,.8)' : 'rgba(60,60,70,.7)');
      cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(label, 0, 28);
    }
    if (WS().talkTo === id && S().action && String(S().action.id).indexOf('soc_') === 0) emo('💬', 18, -40, 16);
    cx.restore();
  }
  function drawTownScene(time) {
    const m = Sim.minOfDay(); const na = nightAlpha(m);
    TV.drawTown(G, time, na > 0.2);
    const ids = W.npcsInTown();
    const items = ids.map((id) => ({ id, y: WS().npcs[id].y })).concat([{ me: true, y: char.y }]).sort((a, b) => a.y - b.y);
    for (const it of items) {
      if (it.me) drawChar(time);
      else { const n = WS().npcs[it.id]; drawNPC(it.id, n.x * W.TT, n.y * W.TT, 0.62, time, true); }
    }
    if (na > 0) TV.drawTownLights(G, na * 0.8);
    if (hoverLot) { const L = W.LOTS[hoverLot]; cx.save(); cx.strokeStyle = 'rgba(20,241,149,.8)'; cx.lineWidth = 2; cx.setLineDash([6, 4]); cx.strokeRect(L.x * W.TT, L.y * W.TT, L.w * W.TT, L.h * W.TT); cx.restore(); }
  }
  function drawInteriorScene(sc, time) {
    TV.drawInterior(G, sc, time);
    const list = W.npcsAt(sc);
    const items = list.map((id, i) => { const p = TV.npcSlotPos(sc, list, i, time); return { id, x: p[0], y: p[1] }; }).concat([{ me: true, y: char.y }]).sort((a, b) => a.y - b.y);
    for (const it of items) { if (it.me) drawChar(time); else drawNPC(it.id, it.x * T, WALL + it.y * T, 1, time, true); }
    if (hoverObj && sceneObjs()[hoverObj]) {
      cx.save(); cx.strokeStyle = 'rgba(20,241,149,.7)'; cx.lineWidth = 2; cx.setLineDash([6, 4]);
      for (const [x, y] of sceneObjs()[hoverObj].tiles) cx.strokeRect(x * T + 2, WALL + y * T + 2, T - 4, T - 4);
      cx.restore();
    }
  }

  // ---- input on canvas ----
  let hoverObj = null, hoverLot = null;
  function canvasTile(ev) {
    const r = cv.getBoundingClientRect();
    const sx = cv.width / r.width, sy = cv.height / r.height;
    const x = (ev.clientX - r.left) * sx, y = (ev.clientY - r.top) * sy;
    const g = grid();
    return { x, y, fx: x / g.tile, fy: (y - g.top) / g.tile, tx: Math.floor(x / g.tile), ty: Math.floor((y - g.top) / g.tile), cssX: ev.clientX - r.left, cssY: ev.clientY - r.top };
  }
  function onMe(p) { const g = grid(); const r = scene() === 'town' ? 1.1 : 0.55; return Math.hypot(p.fx - char.x, p.fy - (char.y - (scene() === 'town' ? 0.3 : 0.2))) < r + (g.tile < 30 ? 0.3 : 0); }
  function npcHit(p) {
    const sc = scene(); let best = null, bd = sc === 'town' ? 1.4 : 0.75;
    let pts = [];
    if (sc === 'town') pts = W.npcsInTown().map((id) => [id, WS().npcs[id].x, WS().npcs[id].y - 0.4]);
    else if (sc !== 'home') { const list = W.npcsAt(sc); pts = list.map((id, i) => { const q = TV.npcSlotPos(sc, list, i, performance.now()); return [id, q[0], q[1] - 0.2]; }); }
    for (const [id, x, y] of pts) { const d = Math.hypot(p.fx - x, p.fy - y); if (d < bd) { bd = d; best = id; } }
    return best;
  }
  function parkSpotAt(p) { for (const k in W.PARK_SPOTS) { const s2 = W.PARK_SPOTS[k]; if (Math.hypot(p.fx - (s2[0] + 0.5), p.fy - (s2[1] + 0.5)) < 1.2) return k; } return null; }
  cv.addEventListener('mousemove', (ev) => {
    const p = canvasTile(ev); const sc = scene();
    hoverObj = null; hoverLot = null;
    if (sc === 'town') {
      const l = W.lotAt(p.tx, p.ty); if (l && l !== 'park') hoverLot = l;
      cv.style.cursor = l || npcHit(p) || onMe(p) || parkSpotAt(p) ? 'pointer' : 'crosshair';
      return;
    }
    let o = p.ty >= 0 ? objAtScene(p.tx, p.ty) : null;
    const objs = sceneObjs();
    if (o && objs[o] && objs[o].deco) o = null;
    const me = onMe(p);
    hoverObj = me ? null : o;
    cv.style.cursor = o || me || npcHit(p) ? 'pointer' : 'crosshair';
  });
  cv.addEventListener('mouseleave', () => { hoverObj = null; hoverLot = null; });
  function walkHere(p) {
    closeMenu();
    const st = S();
    if (st.action) { if (st.action.id === 'passout') return; leaveSeat(); Sim.cancelAction(); }
    pendingAct = null; trip = null; clearTalk();
    const g = grid();
    walkTo(clampI(p.tx, 0, g.cols - 1), clampI(p.ty, 0, g.rows - 1));
  }
  cv.addEventListener('click', (ev) => {
    if (modalOpen) return;
    const p = canvasTile(ev);
    const st = S(); const sc = scene();
    if (st.action && st.action.outside) { openMenuFor(st.action.obj || 'door', p); return; }
    if (onMe(p) && !(st.action && st.action.id === 'passout')) { openMenuFor('phone', p, true); return; }
    if (sc === 'town') {
      const npc = npcHit(p); if (npc) { openNpcMenu(npc, p); return; }
      const ps = parkSpotAt(p); if (ps) { openMenuFor('park:' + ps, p); return; }
      const lot = W.lotAt(p.tx, p.ty);
      if (lot === 'park') { openParkMenu(p); return; }
      if (lot) { openLotMenu(lot, p); return; }
      walkHere(p); return;
    }
    if (sc !== 'home') {
      const npc = npcHit(p); if (npc) { openNpcMenu(npc, p); return; }
      if (p.ty < 0) { closeMenu(); return; }
      let o = objAtScene(p.tx, p.ty); const objs = sceneObjs();
      if (o && objs[o].deco) o = null;
      if (o === 'exit') { openExitMenu(p); return; }
      if (o) { openMenuFor(sc + ':' + o, p); return; }
      walkHere(p); return;
    }
    if (p.ty < 0) { closeMenu(); return; }
    let o = objAt(p.tx, p.ty);
    if (o && OBJ[o] && OBJ[o].deco) o = null;
    if (o) { openMenuFor(o, p); return; }
    walkHere(p);
  });

  const menu = $('#menu');
  function objName(obj) {
    const i = obj.indexOf(':');
    if (i > 0) { const loc = obj.slice(0, i), key = obj.slice(i + 1); if (loc === 'park') return '🌳 Park · ' + ({ bench: 'Bench', grass: 'Grass', jog: 'Jog path', pond: 'Duck pond' }[key] || key); const L = W.LOTS[loc]; return L.emoji + ' ' + TV.INTERIORS[loc].objs[key].name; }
    return OBJ[obj] ? OBJ[obj].name : obj;
  }
  function actButtons(acts, npc) {
    let html = '', grp = null;
    for (const a of acts) {
      if (a.group !== grp) { grp = a.group; if (grp) html += '<div class="grp">' + esc(grp) + '</div>'; }
      const meta = Sim.fmtDur(a.mins) + (a.cost ? ' · ◎' + a.cost : '');
      html += '<button data-qa="' + a.id + '"' + (npc ? ' data-npc="' + npc + '"' : '') + (a.disabled ? ' disabled title="' + esc(a.disabled) + '"' : '') + '><span class="e">' + a.emoji + '</span><span class="l">' + esc(a.label) + (a.disabled ? '<small>' + esc(a.disabled) + '</small>' : '') + '</span><span class="m">' + meta + '</span></button>';
    }
    return html;
  }
  function travelButtons(exclude) {
    let h = '<div class="grp">Go somewhere</div>';
    if (scene() !== 'town') h += '<button data-go="town"><span class="e">🚶</span><span class="l">Go outside (town)</span><span class="m">walk</span></button>';
    if (scene() !== 'home') h += '<button data-go="home"><span class="e">🏠</span><span class="l">Go home</span><span class="m">walk</span></button>';
    h += '<button data-ridemenu="1"><span class="e">🚕</span><span class="l">Call a ride…</span><span class="m">◎' + W.RIDE_COST + '</span></button>';
    return h;
  }
  function placeMenu(html, p) {
    menu.innerHTML = '<button class="mclose" data-close="1" aria-label="Close">✕</button>' + html;
    menu.hidden = false;
    const wrap = $('#wrap').getBoundingClientRect();
    let left = p.cssX + 10, top = p.cssY + 10;
    menu.style.left = '0px'; menu.style.top = '0px';
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    if (left + mw > wrap.width - 8) left = Math.max(8, p.cssX - mw - 10);
    if (left + mw > wrap.width - 4) left = Math.max(4, wrap.width - mw - 4);
    if (top + mh > wrap.height - 8) top = Math.max(8, wrap.height - mh - 8);
    menu.style.left = left + 'px'; menu.style.top = top + 'px';
    menu.scrollTop = 0;
  }
  function nowRow() { return S().action ? '<div class="grp">Now</div><button data-cancel="1"><span class="e">✋</span><span class="l">Stop: ' + esc(S().action.label) + '</span></button>' : (pendingAct || trip ? '<div class="grp">Now</div><button data-cancel="1"><span class="e">✋</span><span class="l">Stop walking</span></button>' : ''); }
  function openMenuFor(obj, p, fromChar) {
    const acts = Sim.actionsFor(obj);
    const title = fromChar ? '📱 Your phone' : objName(obj);
    let html = '<h4><span>' + esc(title) + '</span><span class="mono">' + esc(Sim.fmtClock()) + '</span></h4>';
    if (fromChar && scene() !== 'home') html += '<div class="grp" style="text-transform:none">Out and about: desk & phone stuff runs on your phone (25% slower, full speed at the café).</div>';
    html += actButtons(acts);
    if (obj === 'door') html += travelButtons();
    const links = {
      desk: [['farm', '🪂', 'Farm airdrops…'], ['nft', '🖼️', 'NFT drops & WL grind…'], ['market', '📈', 'Open trading terminal'], ['gigs', '💼', 'Gig board']],
      phone: [['market', '📈', 'Trade on phone'], ['dms', '💬', 'Open DMs'], ['feed', '🏠', 'Open the timeline'], ['town', '🗺️', 'Town map & events'], ['wallet', '👛', 'Wallet']],
      door: [['town', '🗺️', 'Town map & events'], ['life', '🏠', 'Move to a bigger place…']],
      'bank:teller': [['wallet', '👛', 'Open wallet']], 'bank:otc': [['market', '📈', 'Open trading terminal']],
    }[obj] || [];
    if (fromChar && scene() !== 'home') html += travelButtons();
    if (links.length) { html += '<div class="grp">Apps</div>'; for (const [tab, e, l] of links) html += '<button class="link" data-goto="' + tab + '"><span class="e">' + e + '</span><span class="l">' + l + '</span><span class="m">›</span></button>'; }
    html += nowRow();
    placeMenu(html, p);
  }
  function openRideMenu(p) {
    let html = '<h4><span>🚕 Call a ride</span><span class="mono">◎' + W.RIDE_COST + ' · ' + W.RIDE_MINS + 'm</span></h4>';
    const sc = scene();
    for (const k in W.LOTS) {
      if (k === sc || k === 'park') continue;
      const L = W.LOTS[k]; const ev = W.eventAt(k); const open = L.kind === 'home' || W.isOpen(k);
      html += '<button data-ride="' + k + '"' + (open ? '' : ' disabled') + '><span class="e">' + L.emoji + '</span><span class="l">' + esc(L.name) + (ev ? '<small style="color:var(--ok)">LIVE: ' + esc(ev.def.name) + '</small>' : open ? '' : '<small>closed · ' + W.hoursLabel(k) + '</small>') + '</span><span class="m">›</span></button>';
    }
    if (sc !== 'town') html += '<button data-ride="town"><span class="e">🌳</span><span class="l">Drop me by the park</span><span class="m">›</span></button>';
    placeMenu(html, p);
  }
  function openExitMenu(p) {
    let html = '<h4><span>🚪 Exit</span><span class="mono">' + esc(Sim.fmtClock()) + '</span></h4>';
    html += '<button data-go="town"><span class="e">🚶</span><span class="l">Step outside</span><span class="m">›</span></button>';
    html += '<button data-go="home"><span class="e">🏠</span><span class="l">Walk home</span><span class="m">›</span></button>';
    html += '<button data-ridemenu="1"><span class="e">🚕</span><span class="l">Call a ride…</span><span class="m">◎' + W.RIDE_COST + '</span></button>';
    placeMenu(html, p);
  }
  function whoHTML(ids) { return ids.length ? ids.map((id) => { const P = W.personInfo(id); return '<span title="' + esc(P.met ? P.name : 'someone new') + '">' + P.av + '</span>'; }).join(' ') : '<span class="muted">nobody yet</span>'; }
  function openLotMenu(id, p) {
    const L = W.LOTS[id]; const ev = W.eventAt(id); const open = L.kind === 'home' || W.isOpen(id);
    let html = '<h4><span>' + L.emoji + ' ' + esc(L.name) + '</span><span class="mono">' + (L.kind === 'home' ? '' : esc(W.hoursLabel(id))) + '</span></h4>';
    html += '<div class="lotinfo">' + esc(L.desc) + (ev ? '<div style="color:var(--ok);margin-top:.25rem"><b>LIVE: ' + ev.def.emoji + ' ' + esc(ev.def.name) + '</b> until ' + Sim.fmtClock(ev.end) + '</div>' : '') + (L.kind !== 'home' ? '<div style="margin-top:.25rem">Inside: ' + whoHTML(W.npcsAt(id)) + '</div>' : '') + (open ? '' : '<div style="color:var(--bad);margin-top:.25rem">Closed right now</div>') + '</div>';
    html += '<button data-go="' + id + '"' + (open ? '' : ' disabled') + '><span class="e">🚶</span><span class="l">' + (L.kind === 'home' ? 'Walk home' : 'Walk in') + '</span><span class="m">›</span></button>';
    html += '<button data-ride="' + id + '"' + (open ? '' : ' disabled') + '><span class="e">🚕</span><span class="l">Ride there</span><span class="m">◎' + W.RIDE_COST + '</span></button>';
    if (L.kind !== 'home') {
      const objs = TV.INTERIORS[id].objs; let acts = [];
      for (const k in objs) if (!objs[k].deco && !objs[k].exit) acts = acts.concat(Sim.actionsFor(id + ':' + k));
      if (acts.length) html += '<div class="grp">Things to do (walks you there)</div>' + actButtons(acts);
    }
    html += nowRow();
    placeMenu(html, p);
  }
  function openParkMenu(p) {
    let html = '<h4><span>🌳 Lekki Park</span><span class="mono">' + esc(Sim.fmtClock()) + '</span></h4><div class="lotinfo">Touch grass, meet people. Around: ' + whoHTML(W.npcsAt('park')) + '</div>';
    let acts = []; for (const k in W.PARK_SPOTS) acts = acts.concat(Sim.actionsFor('park:' + k));
    html += actButtons(acts) + nowRow();
    placeMenu(html, p);
  }
  function relBars(P) {
    const bar = (lbl, v, col) => '<div class="rb"><span>' + lbl + '</span><div class="bar"><i style="width:' + Math.round(v) + '%;background:' + col + '"></i></div><b>' + Math.round(v) + '</b></div>';
    return bar('Friend', P.rel, 'linear-gradient(90deg,#14F195,#3dd68c)') + bar('Rival', P.rival || 0, 'linear-gradient(90deg,#ff9a3c,#ff5c7a)') + bar('Romance', P.romance || 0, 'linear-gradient(90deg,#ff5ca8,#c77dff)');
  }
  function openNpcMenu(id, p) {
    const P = W.personInfo(id);
    let html = '<div class="npcard"><div class="nav" style="background:' + esc(P.color) + '33">' + P.av + '</div><div><b>' + esc(P.met ? P.name : 'Someone new') + '</b> <span class="muted small">' + (P.met ? '@' + esc(P.handle) : '') + '</span><div class="small muted">' + esc(P.role) + ' · ' + Sim.fmtNum(P.followers) + ' followers' + (P.follows ? ' · follows you' : '') + '</div>' + (P.met ? '' : '<div class="small" style="color:var(--warn)">Not met yet. Any interaction introduces you.</div>') + '</div></div>';
    html += '<div class="relbox">' + relBars(P) + '</div>';
    const acts = Object.keys(W.INTERACTIONS).map((k) => { const it = W.INTERACTIONS[k]; return { id: 'soc_' + k, label: it.label, emoji: it.emoji, mins: it.mins, cost: 0, group: null, disabled: S().pending ? 'Deal with your DMs first' : null }; });
    html += '<div class="pie">' + acts.map((a) => '<button data-qa="' + a.id + '" data-npc="' + id + '"' + (a.disabled ? ' disabled' : '') + '><span class="e">' + a.emoji + '</span><span class="l">' + esc(a.label) + '</span></button>').join('') + '</div>';
    if (P.met) html += '<button class="link" data-dmnpc="' + id + '"><span class="e">✉️</span><span class="l">Open DMs</span><span class="m">›</span></button>';
    placeMenu(html, p);
  }
  function closeMenu() { menu.hidden = true; }
  menu.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.qa) queueAction(d.qa, { npc: d.npc });
    else if (d.goto) { setTab(d.goto); closeMenu(); }
    else if (d.cancel) { cancelCurrent(); closeMenu(); }
    else if (d.go) travel(d.go, false);
    else if (d.ride) travel(d.ride, true);
    else if (d.ridemenu) { const r = menu.getBoundingClientRect(), w = $('#wrap').getBoundingClientRect(); openRideMenu({ cssX: r.left - w.left, cssY: r.top - w.top }); }
    else if (d.dmnpc) { dmOpen = d.dmnpc; setTab('dms'); closeMenu(); }
    else if (d.close) closeMenu();
  });
  document.addEventListener('click', (ev) => { if (!menu.hidden && !menu.contains(ev.target) && ev.target !== cv) closeMenu(); });
  function cancelCurrent() {
    const a = S().action; if (!a) { pendingAct = null; trip = null; char.path = []; clearTalk(); if (WS()) WS().talkTo = null; return; }
    if (String(a.id).indexOf('soc_') === 0 && WS()) WS().talkTo = null;
    if (a.id === 'passout') { toast('Cannot cancel passing out. Your body has spoken.', 'bad'); return; }
    leaveSeat(); Sim.cancelAction(); renderPanelSoon();
  }

  window.__UI = { queueAction, OBJ, char, get speed() { return speed; } };
  window.__UIinternal = { drawRoom, drawPerson, updateChar, closeMenu, cancelCurrent, setSpeedRef: (v) => { speed = v; }, setModal: (v) => { modalOpen = v; }, get modalOpen() { return modalOpen; }, get pendingAct() { return pendingAct; }, set pendingAct(v) { pendingAct = v; } };

  // ================= HUD / TOASTS =================
  const toastsEl = $('#toasts');
  function toast(text, tone, desc) {
    const el = document.createElement('div');
    el.className = 'toast ' + (tone || 'info');
    el.innerHTML = esc(text) + (desc ? '<small>' + esc(desc) + '</small>' : '');
    toastsEl.prepend(el);
    while (toastsEl.children.length > 5) toastsEl.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, tone === 'achv' ? 5200 : 3800);
  }
  function flushEvents() {
    const evs = Sim.drain();
    let dirty = false;
    for (const e of evs) {
      if (e.kind === 'toast') toast(e.text, e.tone);
      else if (e.kind === 'achv') toast(e.text, 'achv', e.desc);
      else if (e.kind === 'modal' && e.modal === 'drainer') showDrainer();
      else if (e.kind === 'news') updateTicker();
      dirty = true;
    }
    if (dirty) renderPanelSoon();
  }

  const needsEl = $('#needs');
  needsEl.innerHTML = Sim.NEEDS.map((k) => '<div class="need" id="n_' + k + '"><div class="nl"><span>' + Sim.NEED_META[k].emoji + ' ' + Sim.NEED_META[k].label + '</span><b>0</b></div><div class="nb"><i></i></div></div>').join('') +
    '<div class="need" id="n_mood"><div class="nl"><span>💎 Mood</span><b>0</b></div><div class="nb"><i></i></div></div>';
  const needColor = (v) => v > 60 ? 'linear-gradient(90deg,#14F195,#3dd68c)' : v > 35 ? 'linear-gradient(90deg,#ffd166,#ffb547)' : v > 18 ? 'linear-gradient(90deg,#ff9a3c,#ff7b39)' : 'linear-gradient(90deg,#ff5c7a,#ff2e63)';

  function renderHUD() {
    const st = S();
    for (const k of Sim.NEEDS) {
      const v = st.needs[k]; const el = $('#n_' + k);
      el.querySelector('b').textContent = Math.round(v);
      const i = el.querySelector('i'); i.style.width = v + '%'; i.style.background = needColor(v);
      el.classList.toggle('low', v < 18);
    }
    const md = Sim.mood(); const me = $('#n_mood');
    me.querySelector('b').textContent = Math.round(md); me.querySelector('i').style.width = md + '%'; me.querySelector('i').style.background = needColor(md);
    $('#clockDay').textContent = 'Day ' + Sim.day();
    $('#clockTime').textContent = Sim.fmtClock();
    const h = Sim.hour(); $('#dayIcon').textContent = h >= 6 && h < 18 ? '☀️' : h >= 18 && h < 20 ? '🌇' : '🌙';
    $('#solBal').textContent = Sim.fmtSol(st.stats.sol);
    $('#nwBal').textContent = Sim.fmtSol(Sim.netWorth());
    const m = st.market; const mp = $('#mkPill');
    mp.textContent = (m >= 1 ? '📈' : '📉') + ' x' + m.toFixed(2) + ' · SOL $' + Mk.solPrice().toFixed(0);
    mp.style.color = m >= 1 ? 'var(--ok)' : 'var(--bad)';
    $('#pName').textContent = st.player.name;
    $('#pHandle').textContent = '@' + st.player.handle;
    $('#pTitle').textContent = Sim.primaryTitle();
    $('#pCareers').innerHTML = st.player.careers.map((c) => '<span>' + Sim.CAREERS[c].emoji + ' ' + esc(Sim.careerTitle(c)) + '</span>').join('');
    $('#sFollowers').textContent = Sim.fmtNum(st.stats.followers);
    $('#sClout').textContent = Math.round(st.stats.clout);
    $('#sRep').textContent = Math.round(st.stats.rep);
    $('#sShill').textContent = Math.round(st.stats.shill);
    $('#sShill').style.color = st.stats.shill > 50 ? 'var(--bad)' : st.stats.shill > 25 ? 'var(--warn)' : '';
    // action bar
    const a = st.action;
    if (a) {
      $('#aEmoji').textContent = a.emoji; $('#aLabel').textContent = a.label + (a.id === 'passout' ? '' : '…');
      $('#aProg').style.width = Math.min(100, a.prog / a.mins * 100) + '%';
      $('#aLeft').textContent = Sim.fmtDur(Math.max(0, a.mins - a.prog)) + ' left';
      $('#aCancel').hidden = a.id === 'passout';
    } else if (pendingAct) {
      $('#aEmoji').textContent = '🚶'; $('#aLabel').textContent = (pendingAct.obj === 'npc' ? 'Walking up to ' + (W.personInfo(pendingAct.npc) || {}).name : 'Walking to ' + objName(pendingAct.obj)) + ' → ' + pendingAct.label;
      $('#aProg').style.width = '0%'; $('#aLeft').textContent = ''; $('#aCancel').hidden = false;
    } else if (trip) {
      $('#aEmoji').textContent = '🚶'; $('#aLabel').textContent = 'Heading to ' + placeName(trip.dest) + '…';
      $('#aProg').style.width = '0%'; $('#aLeft').textContent = ''; $('#aCancel').hidden = false;
    } else {
      $('#aEmoji').textContent = '🧍'; $('#aLabel').textContent = idleLine(); $('#aProg').style.width = '0%'; $('#aLeft').textContent = ''; $('#aCancel').hidden = true;
    }
    const sc = scene();
    const evNow = W.activeEvents()[0];
    $('#homeBadge').textContent = sc === 'home' ? Sim.HOMES[st.home.tier].emoji + ' ' + Sim.HOMES[st.home.tier].name : sc === 'town' ? '🌆 Town' + (evNow ? ' · LIVE ' + evNow.def.emoji + ' ' + evNow.def.name : '') : W.LOTS[sc].emoji + ' ' + W.LOTS[sc].name + (W.eventAt(sc) ? ' · LIVE' : '');
    $('#hint').textContent = sc === 'home' ? 'Tap objects to act · tap the door to go outside' : sc === 'town' ? 'Tap a building to go in · tap a sim to interact · tap yourself for your phone' : 'Tap objects or sims · door at the bottom leads out';
    // badges
    const ud = SO.unreadTotal(); $('#bDms').textContent = ud || '';
    const ready = st.gigs.filter(Sim.gigReady).length; $('#bGigs').textContent = (st.offers.length + ready) || '';
    const claim = AD.A.protos.filter((p) => p.phase === 'tge' && p.alloc).length; $('#bFarm').textContent = claim ? '!' : '';
    const live = NF.N.drops.filter((d) => d.phase === 'wl' && d.wl || d.phase === 'public').length; $('#bNft').textContent = live ? 'live' : '';
  }
  function idleLine() {
    const n = S().needs;
    const low = Sim.NEEDS.filter((k) => n[k] < 25).sort((a, b) => n[a] - n[b])[0];
    const lines = { energy: 'Yawning. Needs sleep or coffee ☕', hunger: 'Stomach growling louder than CT 🍜', fun: 'Bored. Go have some fun 🎮', social: 'Lonely. Hop in a Space or DM a fren 💬', hygiene: 'Smells like a rug pull. Shower 🚿' };
    return low ? lines[low] : 'Idle. Waiting for your command, ser.';
  }
  function drawAvatar() {
    const c = $('#avatar').getContext('2d'); c.clearRect(0, 0, 64, 64);
    drawPerson(c, 32, 40, 1.4, {});
  }

  // ---- ticker ----
  function updateTicker() {
    const news = Mk.M.news.slice(0, 8);
    const items = news.length ? news.map((n) => '<span class="' + (n.dir > 0 ? 'up' : n.dir < 0 ? 'down' : '') + '">' + (n.dir > 0 ? '▲' : n.dir < 0 ? '▼' : '•') + ' <b>' + esc(n.cat) + ':</b> ' + esc(n.h) + '</span>') : ['<span>Markets quiet. CT is arguing about nothing. Perfect time to farm.</span>'];
    const toks = Mk.tokens().slice(0, 7).map((t) => { const ch = (t.price / t.open - 1) * 100; return '<span><b>$' + t.sym + '</b> ' + Mk.fmtPrice(t.price) + ' <span class="' + (ch >= 0 ? 'up' : 'down') + '">' + (ch >= 0 ? '+' : '') + ch.toFixed(1) + '%</span></span>'; });
    $('#ticker').innerHTML = items.join('') + toks.join('');
  }

  // ================= TABS / PANELS =================
  let tab = 'feed', dmOpen = null, mkSel = 'GLORP', panelDirty = true, lastPanelRender = 0;
  const panel = $('#panel');
  function setTab(t) {
    tab = t;
    for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === t);
    panel.scrollTop = 0;
    renderPanel(true);
  }
  $('#tabs').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) setTab(b.dataset.tab); });
  function renderPanelSoon() { panelDirty = true; }

  function renderPanel(force) {
    const active = document.activeElement;
    const keepId = active && panel.contains(active) && active.id ? active.id : null;
    const vals = {};
    for (const el of panel.querySelectorAll('input[id]')) vals[el.id] = el.value;
    const st = panel.scrollTop;
    const fn = PANELS[tab]; panel.innerHTML = fn ? fn() : '';
    for (const [id, v] of Object.entries(vals)) { const el = document.getElementById(id); if (el) el.value = v; }
    if (keepId) { const el = document.getElementById(keepId); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} } }
    if (!force) panel.scrollTop = st;
    if (tab === 'dms' && dmOpen && force) { panel.scrollTop = panel.scrollHeight; }
    drawPanelCharts();
    panelDirty = false; lastPanelRender = performance.now();
  }

  const ago = (t) => Sim.fmtStamp(t);
  function avHTML(e) {
    if (e.av === 'me') { const p = S().player; return '<div class="av" style="background:' + esc(p.color) + ';color:#fff;font-weight:700;font-size:.9rem">' + esc((p.name || '?')[0].toUpperCase()) + '</div>'; }
    return '<div class="av">' + esc(e.av || '👤') + '</div>';
  }

  const PANELS = {};
  PANELS.feed = function () {
    const st = S();
    let h = '<div class="composer"><span class="lbl">Post something (your sim walks to the desk):</span>';
    for (const [k, p] of Object.entries(Sim.POST_TYPES)) h += '<button class="btn ghost sm" data-qa="post_' + k + '">' + p.emoji + ' ' + esc(p.label) + '</button>';
    h += '<button class="btn ghost sm" data-qa="space">🎙️ Host Space</button></div>';
    if (!st.feed.length) h += '<div class="empty">Timeline is empty. Post a gm.</div>';
    for (const e of st.feed.slice(0, 45)) {
      const liked = SO.SO.liked[e.id], rted = SO.SO.liked['rt' + e.id];
      const cls = ['tw', e.mine ? 'mine' : '', e.news ? 'news' : '', e.ratio ? 'ratio' : '', e.sys ? 'sys' : ''].join(' ');
      h += '<div class="' + cls + '">' + avHTML(e) + '<div class="bd"><div class="hd"><b>' + esc(e.name) + '</b><span>@' + esc(e.handle) + ' · ' + ago(e.t) + '</span>' + (e.role ? '<span class="chip">' + esc(e.role) + '</span>' : '') + (e.tier === 2 ? '<span class="tierv">🚀 viral</span>' : e.tier === 0 ? '<span class="tierf">flop</span>' : '') + (e.dm ? '<span class="chip purple">DM/brief</span>' : '') + '</div>';
      h += '<div class="tx">' + esc(e.text) + '</div>';
      if (e.thread && e.thread.length) h += '<div class="thr">' + e.thread.slice(0, 4).map((r) => '<div>' + esc(r.av) + ' <b>@' + esc(r.handle) + '</b>: ' + esc(r.text) + '</div>').join('') + '</div>';
      if (!e.sys) h += '<div class="mx"><span>💬 ' + Sim.fmtNum(e.replies || (e.thread ? e.thread.length : 0)) + '</span><button data-rt="' + e.id + '" class="' + (rted ? 'on' : '') + '">🔁 ' + Sim.fmtNum(e.rts || 0) + '</button><button data-like="' + e.id + '" class="' + (liked ? 'on' : '') + '">♥ ' + Sim.fmtNum(e.likes || 0) + '</button>' + (e.npc && SO.person(e.npc) && SO.person(e.npc).met ? '<button data-dm="' + e.npc + '">✉️ DM</button>' : '') + '</div>';
      h += '</div></div>';
    }
    return h;
  };

  PANELS.dms = function () {
    const st = S(); const so = SO.SO;
    if (dmOpen) {
      const p = SO.person(dmOpen);
      SO.markRead(dmOpen);
      const th = so.threads[dmOpen] || [];
      let h = '<div class="row sb"><button class="btn ghost sm" data-dmback="1">‹ Inbox</button><button class="btn ' + (p.youFollow ? 'ghost' : '') + ' sm" data-follow="' + p.id + '">' + (p.youFollow ? 'Following' : 'Follow') + '</button></div>';
      h += '<div class="card" style="margin-top:.5rem"><div class="row"><div class="av" style="width:40px;height:40px;border-radius:50%;background:#222;display:grid;place-items:center;font-size:1.3rem">' + p.av + '</div><div style="flex:1"><b>' + esc(p.name) + '</b> <span class="muted small">@' + esc(p.handle) + '</span><div class="small muted">' + esc(p.role) + ' · ' + esc(p.bio) + '</div></div></div>';
      h += '<div class="row sb small" style="margin-top:.4rem"><span class="muted">Relationship ' + Math.round(p.rel) + '/100 ' + (p.follows ? '· follows you' : '') + '</span><div class="bar relbar"><i style="width:' + p.rel + '%"></i></div></div></div>';
      h += '<div class="chat">';
      if (!th.length) h += '<div class="empty">No messages yet. Slide in with a gm.</div>';
      for (const m of th) {
        h += '<div class="msg ' + (m.from === 'me' ? 'me' : '') + (m.kind === 'scam' ? ' scam' : '') + '">' + esc(m.text);
        if (m.open && m.kind === 'scam') h += '<div class="acts"><button class="btn red sm" data-msg="' + m.id + '" data-choice="click">🔗 Open link</button><button class="btn ghost sm" data-msg="' + m.id + '" data-choice="report">🛡️ Block & report</button></div>';
        if (m.open && (m.kind === 'wl' || m.kind === 'collab')) h += '<div class="acts"><button class="btn green sm" data-msg="' + m.id + '" data-choice="yes">Yes 🙏</button><button class="btn ghost sm" data-msg="' + m.id + '" data-choice="no">Pass</button></div>';
        if (m.kind === 'gig') h += '<div class="acts"><button class="btn sm" data-goto="gigs">Open gig board</button></div>';
        if (m.kind === 'alpha') h += '<div class="acts"><button class="btn sm" data-mksel="' + esc(m.sym) + '">View $' + esc(m.sym) + ' chart</button></div>';
        h += '<span class="mt">' + ago(m.t) + '</span></div>';
      }
      h += '</div><div class="quick">';
      for (const q of ['gm ☀️', 'any alpha? 👀', 'wanna collab on a Space? 🎙️', 'thanks fren 🙏', 'lol', 'is this a scam?']) h += '<button class="btn ghost sm" data-quick="' + esc(q) + '">' + esc(q) + '</button>';
      h += '</div><div class="sendrow"><input class="input" id="dmInput" placeholder="Message @' + esc(p.handle) + '…" maxlength="280" autocomplete="off"><button class="btn" data-send="1">Send</button></div>';
      return h;
    }
    const people = SO.PEOPLE.map((x) => SO.person(x.id));
    const withThreads = people.filter((p) => (so.threads[p.id] || []).length).sort((a, b) => last(b) - last(a));
    function last(p) { const th = so.threads[p.id]; return th && th.length ? th[th.length - 1].t : 0; }
    let h = '<h3>Inbox <span class="chip">' + SO.unreadTotal() + ' unread</span></h3><div class="people">';
    if (!withThreads.length) h += '<div class="empty">No DMs yet. NPC sims will slide in soon, or start a chat below.</div>';
    for (const p of withThreads) {
      const th = so.threads[p.id]; const lm = th[th.length - 1];
      h += '<div class="person" data-open="' + p.id + '"><div class="av">' + p.av + '</div><div class="pm"><b>' + esc(p.name) + '</b> <span class="small muted" style="display:inline">· ' + esc(p.role) + '</span><span>' + (lm.from === 'me' ? 'You: ' : '') + esc(lm.text) + '</span></div>' + (so.unread[p.id] ? '<em>' + so.unread[p.id] + '</em>' : '') + '</div>';
    }
    h += '</div><h3>Sims you have met <span class="chip">meet more in town</span></h3><div class="people">';
    const metP = people.filter((p) => p.met), unmetP = people.filter((p) => !p.met && p.pers !== 'scammer');
    if (!metP.length) h += '<div class="empty small">You have not met anyone in person yet. Walk out the front door, tap a sim in town and say hi. Met sims show up here, in your feed and in DMs.</div>';
    for (const p of metP) {
      h += '<div class="person" data-open="' + p.id + '"><div class="av">' + p.av + '</div><div class="pm"><b>' + esc(p.name) + '</b> <span class="small muted" style="display:inline">@' + esc(p.handle) + '</span><span>' + esc(p.role) + ' · rel ' + Math.round(p.rel) + (p.follows ? ' · follows you' : '') + '</span></div><button class="btn ' + (p.youFollow ? 'ghost' : '') + ' sm" data-follow="' + p.id + '">' + (p.youFollow ? 'Following' : 'Follow') + '</button></div>';
    }
    if (unmetP.length) { h += '</div><h3>Not met yet <span class="chip">🔒</span></h3><div class="people">'; for (const p of unmetP) h += '<div class="person locked"><div class="av">' + p.av + '</div><div class="pm"><b>??? · ' + esc(p.role) + '</b><span>Meet them in town to unlock DMs</span></div></div>'; }
    return h + '</div>';
  };

  function reqText(g) { return g.reqs.map((r, i) => (g.prog ? g.prog[i] + '/' : '') + r.n + ' ' + Sim.REQ_LABEL[r.kind]).join(' · '); }
  PANELS.gigs = function () {
    const st = S();
    let h = '';
    h += '<h3>Active gigs <span class="chip">' + st.gigs.length + '/3</span></h3>';
    if (!st.gigs.length) h += '<div class="empty small">No active gigs. Accept an offer below.</div>';
    for (const g of st.gigs) {
      const ready = Sim.gigReady(g);
      const left = g.deadline - st.t;
      h += '<div class="card"><div class="row sb"><b>' + esc(g.title) + '</b><span class="chip ' + g.tier + '">' + (g.tier === 'low' ? '🚩 low-tier shill' : g.tier === 'premium' ? '⭐ premium' : 'standard') + '</span></div>';
      h += '<div class="small muted">' + esc(g.project) + ' · ◎ ' + Sim.fmtSol(g.pay) + ' · due in ' + Sim.fmtDur(left) + '</div>';
      g.reqs.forEach((r, i) => { h += '<div class="small" style="margin-top:.35rem">' + g.prog[i] + '/' + r.n + ' ' + Sim.REQ_LABEL[r.kind] + '</div><div class="bar"><i style="width:' + Math.min(100, g.prog[i] / r.n * 100) + '%"></i></div>'; });
      h += '<div class="row" style="margin-top:.5rem">' + (ready ? '<button class="btn green sm" data-deliver="' + g.id + '">💸 Deliver & get paid</button>' : '<span class="small muted">Do the posts/Spaces from your desk & phone.</span>') + '</div></div>';
    }
    h += '<h3>Offers & briefs</h3>';
    if (!Sim.gigsUnlocked() && !st.offers.length) h += '<div class="card small muted">🔒 Projects start sliding offers at <b>250 followers</b> (you have ' + st.stats.followers + '). Or cold-DM projects from your desk: outreach can land a gig early.</div>';
    else if (!st.offers.length) h += '<div class="empty small">No offers right now. Do outreach at your desk or wait for DMs.</div>';
    for (const o of st.offers) {
      h += '<div class="card"><div class="row sb"><b>' + esc(o.title) + '</b><span class="chip ' + o.tier + '">' + (o.tier === 'low' ? '🚩 low-tier' : o.tier === 'premium' ? '⭐ premium' : 'standard') + '</span></div>';
      h += '<div class="small muted">' + esc(o.project) + ' · <b style="color:var(--accent-2)">◎ ' + Sim.fmtSol(o.pay) + '</b> · ' + o.days + 'd deadline · expires ' + ago(o.expires) + '</div>';
      h += '<div class="small" style="margin-top:.3rem">Needs: ' + reqText(o) + '</div>';
      if (o.tier === 'low') h += '<div class="small" style="color:var(--bad)">Pays more, but delivering raises your shill score and hurts rep.</div>';
      h += '<div class="row" style="margin-top:.5rem"><button class="btn sm" data-accept="' + o.id + '">Accept</button><button class="btn ghost sm" data-decline="' + o.id + '">Decline</button></div></div>';
    }
    h += '<div class="small muted" style="margin-top:.6rem">Rep ' + Math.round(st.stats.rep) + ' · Shill ' + Math.round(st.stats.shill) + ' · Market x' + st.market.toFixed(2) + '. Higher rep and lower shill bring better gigs; a pumping market raises pay.</div>';
    return h;
  };

  function spark(id, hist, color, w, hgt) { sparkQueue.push({ id, hist, color, w, h: hgt }); return '<canvas id="' + id + '" width="' + (w * 2) + '" height="' + (hgt * 2) + '"></canvas>'; }
  let sparkQueue = [];
  PANELS.market = function () {
    sparkQueue = [];
    const toks = Mk.tokens();
    if (!Mk.M.tokens[mkSel]) mkSel = 'GLORP' in Mk.M.tokens ? 'GLORP' : toks[0].sym;
    const t = Mk.M.tokens[mkSel];
    const ch = (t.price / t.open - 1) * 100;
    const hold = Mk.M.hold[mkSel];
    let h = '<div class="row sb"><div><b style="font-size:1.1rem">$' + t.sym + '</b> <span class="muted small">' + esc(t.name) + ' · ' + t.kind + (t.rugged ? ' · <span class="down">RUGGED</span>' : '') + '</span></div><div class="mono" style="text-align:right"><b>' + Mk.fmtPrice(t.price) + '</b><div class="small ' + (ch >= 0 ? 'up' : 'down') + '">' + (ch >= 0 ? '+' : '') + ch.toFixed(2) + '% today</div></div></div>';
    h += '<div class="chartbox"><canvas id="mainChart" width="840" height="300"></canvas><div class="row sb small muted mono"><span>last ' + Math.round(t.hist.length / 2) + 'h</span><span>liq $' + Sim.fmtNum(t.liq) + '</span></div></div>';
    if (t.sym === 'SOL') h += '<div class="card small muted">SOL is your cash (fake). Its USD price moves your net worth in dollars. Pick another token to trade.</div>';
    else {
      h += '<div class="card"><div class="row sb small"><span>Balance ◎ ' + Sim.fmtSol(S().stats.sol) + '</span><span>' + (hold ? 'Holding ' + Mk.fmtQty(hold.qty) + ' ($' + (hold.qty * t.price).toFixed(2) + ')' : 'No position') + '</span></div>';
      h += '<div class="trade"><input class="input" id="mkAmt" type="number" min="0" step="0.01" placeholder="Amount in SOL"><button class="btn green" data-mkbuy="1">Buy</button></div>';
      h += '<div class="quick">' + ['0.1', '0.5', '1'].map((v) => '<button class="btn ghost sm" data-amt="' + v + '">◎' + v + '</button>').join('') + '<button class="btn ghost sm" data-amtp="0.25">25%</button><button class="btn ghost sm" data-amtp="0.5">50%</button><button class="btn ghost sm" data-amtp="1">Max</button></div>';
      if (hold) {
        const pnl = hold.qty * t.price - hold.cost;
        h += '<div class="row sb small" style="margin-top:.5rem"><span>PnL <b class="' + (pnl >= 0 ? 'up' : 'down') + '">' + (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2) + '</b>' + (hold.cost ? ' (' + ((hold.qty * t.price / hold.cost - 1) * 100).toFixed(1) + '%)' : ' (airdrop, free bag)') + '</span><span class="quick" style="margin:0"><button class="btn red sm" data-mksell="0.25">Sell 25%</button><button class="btn red sm" data-mksell="0.5">50%</button><button class="btn red sm" data-mksell="1">All</button></span></div>';
      }
      h += '<div class="small muted" style="margin-top:.4rem">0.3% fee. Big orders move price (liquidity $' + Sim.fmtNum(t.liq) + '). Whales: that could be you.</div></div>';
    }
    h += '<h3>Tokens</h3>';
    for (const k of toks) {
      const c = (k.price / k.open - 1) * 100;
      h += '<div class="tok ' + (k.sym === mkSel ? 'on' : '') + '" data-mksel="' + k.sym + '"><div class="s"><b>$' + k.sym + (Mk.M.hold[k.sym] ? ' 👜' : '') + '</b><span>' + esc(k.name) + (k.rugged ? ' · rugged' : '') + '</span></div><div class="p">' + Mk.fmtPrice(k.price) + '</div>' + spark('sp_' + k.sym, k.hist.slice(-48), c >= 0 ? '#3dd68c' : '#ff5c7a', 64, 24) + '<div class="c ' + (c >= 0 ? 'up' : 'down') + '">' + (c >= 0 ? '+' : '') + c.toFixed(1) + '%</div></div>';
    }
    h += '<h3>News feed <span class="chip">moves prices</span></h3>';
    if (!Mk.M.news.length) h += '<div class="empty small">No headlines yet. They hit every few in-game hours.</div>';
    for (const n of Mk.M.news.slice(0, 12)) h += '<div class="news"><span class="cat chip ' + (n.dir > 0 ? 'live' : n.dir < 0 ? 'low' : '') + '">' + esc(n.cat) + '</span>' + esc(n.h) + ' <span class="muted mono small">' + ago(n.t) + '</span></div>';
    return h;
  };

  PANELS.farm = function () {
    const A = AD.A; const st = S();
    const risk = AD.sybilRisk();
    let h = '<div class="card"><div class="row sb"><b>👛 Farming wallets: ' + A.wallets + '</b><span class="row"><button class="btn ghost sm" data-wallet="-1">−</button><button class="btn sm" data-wallet="1">+ Wallet (◎0.02)</button></span></div>';
    h += '<div class="small muted" style="margin-top:.3rem">Each wallet multiplies points per task, but tasks take longer and <b style="color:' + (risk > 0.3 ? 'var(--bad)' : risk > 0.1 ? 'var(--warn)' : 'var(--ok)') + '">sybil risk is ' + Math.round(risk * 100) + '%</b> at each snapshot (flagged = points slashed).</div></div>';
    for (const p of A.protos) {
      const phaseChip = { farming: '<span class="chip live">farming</span>', snapshot: '<span class="chip warn">snapshot taken</span>', tge: '<span class="chip purple">TGE live</span>' }[p.phase] || '';
      h += '<div class="card"><div class="row sb"><b>' + p.emoji + ' ' + esc(p.name) + '</b>' + phaseChip + '</div>';
      h += '<div class="small muted">' + esc(p.kind) + ' · token $' + p.sym + ' (unconfirmed 👀) · <b style="color:var(--text)">' + p.pts.toLocaleString() + ' pts</b>' + (p.flagged ? ' · <span class="down">sybil-flagged</span>' : '') + '</div>';
      if (p.phase === 'farming') {
        const left = p.snapshotAt - st.t;
        h += '<div class="small" style="margin-top:.2rem">📸 Snapshot in ~' + Sim.fmtDur(left) + ' (rumored)</div><div class="quick">';
        for (const [k, t] of Object.entries(AD.TASKS)) {
          const id = 'farm_' + p.id + '_' + k;
          const why = Sim.check(id, true);
          const gas = t.gas ? ' ◎' + (t.gas * A.wallets).toFixed(3) : '';
          h += '<button class="btn ghost sm" data-qa="' + id + '"' + (why ? ' disabled title="' + esc(why) + '"' : '') + '>' + t.emoji + ' ' + esc(t.label) + ' <span class="muted mono">' + Sim.fmtDur(AD.taskMins(k)) + ' · ~' + Math.round(t.pts * A.wallets) + 'p' + gas + '</span></button>';
        }
        h += '</div>';
      } else if (p.phase === 'snapshot') h += '<div class="small" style="margin-top:.2rem">🪂 TGE in ~' + Sim.fmtDur(p.tgeAt - st.t) + '. Allocation depends on points & market mood (x' + st.market.toFixed(2) + ').</div>';
      else if (p.phase === 'tge') {
        const tok = Mk.M.tokens[p.sym]; const price = tok ? tok.price : p.price;
        const val = p.alloc * price / Mk.solPrice();
        h += '<div class="small" style="margin-top:.3rem">Allocation: <b>' + Math.round(p.alloc).toLocaleString() + ' $' + p.sym + '</b> @ ' + Mk.fmtPrice(price) + ' ≈ <b style="color:var(--accent-2)">◎ ' + val.toFixed(3) + '</b> · claim closes in ' + Sim.fmtDur(p.claimEnd - st.t) + '</div>';
        h += '<div class="row" style="margin-top:.45rem">' + (p.alloc ? '<button class="btn green sm" data-claim="' + p.id + '">🪂 Claim airdrop</button>' : '<span class="small muted">No points, no bag.</span>') + '<button class="btn ghost sm" data-mksel="' + p.sym + '">Chart</button></div>';
      }
      h += '</div>';
    }
    h += '<h3>Claimed airdrops</h3>';
    if (!A.claimed.length) h += '<div class="empty small">Nothing claimed yet. Farm → snapshot → TGE → claim.</div>';
    for (const c of A.claimed.slice(0, 10)) h += '<div class="row sb small" style="padding:.3rem 0;border-bottom:1px dashed var(--line)"><span>🪂 $' + esc(c.sym) + ' · ' + esc(c.name) + (c.flagged ? ' <span class="down">(flagged)</span>' : '') + '</span><span class="mono">' + Mk.fmtQty(c.qty) + ' · ◎' + c.valSol.toFixed(2) + ' at claim</span></div>';
    h += '<div class="small muted" style="margin-top:.6rem">Tasks run at your desk (your sim walks over). Daily check-ins reset every in-game day.</div>';
    return h;
  };

  PANELS.nft = function () {
    sparkQueue = [];
    const N = NF.N; const st = S();
    let h = '<h3>Drops calendar</h3>';
    const drops = N.drops.filter((d) => d.phase !== 'done');
    if (!drops.length) h += '<div class="empty small">No drops scheduled. New ones get announced on the timeline.</div>';
    for (const d of drops) {
      const phase = { upcoming: '<span class="chip">WL opens in ' + Sim.fmtDur(d.wlAt - st.t) + '</span>', wl: '<span class="chip warn">WL mint live</span>', public: '<span class="chip live">PUBLIC MINT</span>' }[d.phase];
      h += '<div class="card"><div class="row sb"><b>' + d.emoji + ' ' + esc(d.name) + '</b>' + phase + '</div>';
      h += '<div class="small muted">' + d.supply + ' supply · ◎' + d.price + ' mint · hype ' + NF.hypeLabel(d.hype + (((d.id * 37) % 10) - 5) / 40) + (d.wl ? ' · <span class="up">✅ you have WL</span>' : '') + (d.mintedByMe ? ' · minted ' + d.mintedByMe : '') + '</div>';
      if (d.phase !== 'upcoming') h += '<div class="bar"><i style="width:' + Math.round(d.minted * 100) + '%"></i></div><div class="small muted mono">' + Math.round(d.minted * 100) + '% minted</div>';
      h += '<div class="row wrap" style="margin-top:.45rem">';
      if (d.phase === 'upcoming' && !d.wl) { const id = 'wl_' + d.id; const why = Sim.check(id, true); h += '<button class="btn sm" data-qa="' + id + '"' + (why ? ' disabled title="' + esc(why) + '"' : '') + '>📝 Grind WL in Discord (1h)</button>'; }
      if (d.phase === 'wl') h += '<button class="btn green sm" data-mint="' + d.id + '"' + (d.wl ? '' : ' disabled') + '>Mint (WL) ◎' + d.price + '</button><span class="small muted">Public opens ' + Sim.fmtClock(d.pubAt) + '</span>';
      if (d.phase === 'public') h += '<button class="btn green sm" data-mint="' + d.id + '">⛽ Mint (gas war)</button><span class="small muted">closes ' + Sim.fmtClock(d.endAt) + '</span>';
      h += '</div></div>';
    }
    h += '<h3>Your NFTs <span class="chip">' + N.owned.length + '</span></h3>';
    if (!N.owned.length) h += '<div class="empty small">No JPEGs yet. Mint a drop or buy a floor below.</div>';
    else {
      h += '<div class="nfts">';
      for (const n of N.owned) {
        const rar = NF.RARITY[n.rarity]; const col = N.cols[n.col];
        const val = col ? NF.nftValue(n) : null;
        h += '<div class="nft"><div class="art" style="background:linear-gradient(135deg,' + rar[2] + '33,#111)"><span class="rar" style="color:' + rar[2] + '">' + (col ? rar[0] : 'unrevealed') + '</span>' + n.emoji + '</div>';
        h += '<b>' + esc(n.col) + ' #' + n.num + '</b><div class="tr">' + (col ? Object.entries(n.traits).map(([k, v]) => k + ': ' + esc(v)).join(' · ') : 'Reveal when mint closes…') + '</div>';
        h += '<div class="small mono">cost ◎' + n.cost.toFixed(3) + (val != null ? ' · est ◎' + val.toFixed(2) : '') + '</div>';
        if (col) {
          if (n.listed) h += '<div class="row sb" style="margin-top:.3rem"><span class="chip warn">listed ◎' + n.listed + '</span><button class="btn ghost sm" data-unlist="' + n.id + '">Unlist</button></div>';
          else h += '<div class="row" style="margin-top:.3rem"><input class="input" id="lp_' + n.id + '" type="number" step="0.01" min="0" placeholder="' + (val * 1.05).toFixed(2) + '" style="padding:.25rem .4rem;font-size:.75rem"><button class="btn sm" data-list="' + n.id + '">List</button></div>';
        }
        h += '</div>';
      }
      h += '</div>';
    }
    h += '<h3>Marketplace <span class="chip">floors move hourly</span></h3>';
    for (const c of Object.values(N.cols)) {
      const ch = c.hist.length > 1 ? (c.floor / c.hist[Math.max(0, c.hist.length - 12)] - 1) * 100 : 0;
      h += '<div class="tok" style="cursor:default"><div class="s"><b>' + c.emoji + ' ' + esc(c.name) + '</b><span>' + c.supply + ' supply</span></div><div class="p">◎' + c.floor.toFixed(2) + '</div>' + spark('nsp_' + c.name.replace(/\W/g, ''), c.hist, ch >= 0 ? '#3dd68c' : '#ff5c7a', 64, 24) + '<div class="c"><button class="btn ghost sm" data-floor="' + esc(c.name) + '">Buy</button></div></div>';
    }
    h += '<div class="small muted" style="margin-top:.5rem">Rarity multiplies value: Rare 1.6x · Epic 3x · Legendary 7x floor. Listings sell when priced near fair value (2.5% fee).</div>';
    return h;
  };

  PANELS.wallet = function () {
    sparkQueue = [];
    const st = S(); const nw = Sim.netWorth(); const sp = Mk.solPrice();
    const port = Mk.portfolio();
    const nftV = NF.mod.netWorth();
    let h = '<div class="card"><div class="small muted">Net worth</div><div class="row sb"><b style="font-size:1.6rem">◎ ' + Sim.fmtSol(nw) + '</b><span class="mono muted">$' + Sim.fmtNum(nw * sp) + '</span></div>';
    h += '<div class="chartbox" style="margin:.5rem 0 0"><canvas id="nwChart" width="840" height="240"></canvas></div></div>';
    h += '<div class="statgrid"><div><b>◎ ' + Sim.fmtSol(st.stats.sol) + '</b>SOL (cash)</div><div><b>◎ ' + Sim.fmtSol(Mk.holdValueSOL()) + '</b>Tokens</div><div><b>◎ ' + Sim.fmtSol(nftV) + '</b>NFTs (est)</div>';
    h += '<div><b class="' + (Mk.M.realized >= 0 ? 'up' : 'down') + '">' + (Mk.M.realized >= 0 ? '+' : '') + Mk.M.realized.toFixed(3) + '</b>Realized PnL ◎</div><div><b>◎ ' + Sim.fmtSol(st.stats.earned) + '</b>Earned (gigs)</div><div><b>' + Mk.M.trades + '</b>Trades</div></div>';
    h += '<h3>Token holdings</h3>';
    if (!port.length) h += '<div class="empty small">No tokens. Buy something in Market or claim an airdrop.</div>';
    for (const p of port) h += '<div class="tok" data-mksel="' + p.sym + '"><div class="s"><b>$' + p.sym + '</b><span>' + Mk.fmtQty(p.qty) + (p.rugged ? ' · rugged 🧯' : '') + '</span></div><div class="p">◎' + p.sol.toFixed(3) + '</div><div class="c ' + (p.pnlUsd >= 0 ? 'up' : 'down') + '" style="grid-column: span 2">' + (p.pnlPct == null ? 'airdrop' : (p.pnlPct >= 0 ? '+' : '') + p.pnlPct.toFixed(1) + '%') + '</div></div>';
    h += '<h3>NFTs</h3>';
    if (!NF.N.owned.length) h += '<div class="empty small">No NFTs.</div>';
    for (const n of NF.N.owned) h += '<div class="row sb small" style="padding:.25rem 0"><span>' + n.emoji + ' ' + esc(n.col) + ' #' + n.num + ' <span style="color:' + NF.RARITY[n.rarity][2] + '">' + (NF.N.cols[n.col] ? NF.RARITY[n.rarity][0] : '?') + '</span></span><span class="mono">◎' + NF.nftValue(n).toFixed(2) + '</span></div>';
    h += '<h3>Claimed airdrops</h3>';
    if (!AD.A.claimed.length) h += '<div class="empty small">None yet.</div>';
    for (const c of AD.A.claimed.slice(0, 8)) h += '<div class="row sb small" style="padding:.25rem 0"><span>🪂 $' + esc(c.sym) + '</span><span class="mono">◎' + c.valSol.toFixed(2) + ' at claim</span></div>';
    const home = Sim.HOMES[st.home.tier];
    h += '<h3>Bills</h3><div class="card small">' + home.emoji + ' ' + esc(home.name) + ' · rent ◎' + home.rent + '/week · next due ' + ago(st.home.nextRent) + (st.home.debt ? ' · <span class="down">overdue ◎' + st.home.debt.toFixed(2) + '</span>' : '') + '</div>';
    return h;
  };

  PANELS.town = function () {
    const sc = scene(); const st = S();
    let h = '<div class="card"><div class="row sb"><b>📍 ' + (sc === 'home' ? 'At home' : sc === 'town' ? 'Walking around town' : 'At ' + esc(W.LOTS[sc].name)) + '</b><span class="mono small muted">' + esc(Sim.fmtClock()) + '</span></div>';
    h += '<div class="row wrap" style="margin-top:.45rem">' + (sc !== 'town' ? '<button class="btn sm" data-tgo="town">🚶 Go outside</button>' : '') + (sc !== 'home' ? '<button class="btn ghost sm" data-tgo="home">🏠 Go home</button>' : '') + '</div>';
    h += '<div class="small muted" style="margin-top:.35rem">Walking takes game time. A ride costs ◎' + W.RIDE_COST + ' and takes ' + W.RIDE_MINS + ' min. Your phone (feed, market, DMs, farming) works anywhere.</div></div>';
    h += '<h3>Events <span class="chip">on the clock</span></h3>';
    const evs = W.upcomingEvents(6);
    for (const e of evs) {
      const live = st.t >= e.start && st.t < e.end;
      h += '<div class="card"><div class="row sb"><b>' + e.def.emoji + ' ' + esc(e.def.name) + '</b>' + (live ? '<span class="chip live">LIVE now</span>' : '<span class="chip">' + (Sim.day() === Math.floor(e.start / 1440) + 1 ? 'today' : 'Day ' + (Math.floor(e.start / 1440) + 1)) + ' ' + Sim.fmtClock(e.start) + '</span>') + '</div>';
      h += '<div class="small muted">' + W.LOTS[e.def.loc].emoji + ' ' + esc(W.LOTS[e.def.loc].name) + ' · ' + Sim.fmtClock(e.start) + '–' + Sim.fmtClock(e.end) + ' · ' + esc(e.def.desc) + '</div>';
      if (e.id === 'whale') { const why = W.whaleEntry(); h += '<div class="small" style="color:' + (why ? 'var(--warn)' : 'var(--ok)') + '">' + (why ? '🔒 ' + esc(why) : '✅ You are on the list') + '</div>'; }
      h += '<div class="row" style="margin-top:.4rem"><button class="btn sm" data-tgo="' + e.def.loc + '">🚶 Walk</button><button class="btn ghost sm" data-tride="' + e.def.loc + '">🚕 Ride ◎' + W.RIDE_COST + '</button></div></div>';
    }
    h += '<h3>Places</h3>';
    for (const k in W.LOTS) {
      const L = W.LOTS[k]; if (k === 'home') continue;
      const open = L.kind === 'park' || W.isOpen(k); const who = k === 'park' ? W.npcsAt('park') : W.npcsAt(k);
      h += '<div class="tok" style="grid-template-columns:1.6fr 1fr auto;cursor:default"><div class="s"><b>' + L.emoji + ' ' + esc(L.name) + '</b><span>' + (open ? W.hoursLabel(k) : '<span class="down">closed</span> · ' + W.hoursLabel(k)) + (W.eventAt(k) ? ' · <span class="up">LIVE</span>' : '') + '</span></div><div class="small">' + (who.length ? who.map((id) => W.personInfo(id).av).join('') : '<span class="muted">empty</span>') + '</div><div class="c">' + (k === 'park' ? '<button class="btn ghost sm" data-tgo="town">Go</button>' : '<button class="btn ghost sm" data-tgo="' + k + '"' + (open ? '' : ' disabled') + '>Go</button>') + '</div></div>';
    }
    const ppl = W.TOWN_IDS.map((id) => W.personInfo(id));
    const met = ppl.filter((p) => p.met).sort((a, b) => b.rel - a.rel);
    h += '<h3>People you have met <span class="chip">' + met.length + '/' + ppl.length + '</span></h3>';
    if (!met.length) h += '<div class="empty small">Nobody yet. Go outside and tap a sim to chat. Meeting people in person unlocks their DMs and posts.</div>';
    for (const P of met) {
      const where = P.where === 'away' ? 'out of town' : P.where === 'transit' ? 'walking somewhere' : P.where === 'street' ? 'on the street' : 'at ' + W.LOTS[P.where].name;
      h += '<div class="card"><div class="row sb"><span><b>' + P.av + ' ' + esc(P.name) + '</b> <span class="small muted">' + esc(P.role) + '</span></span><span class="small muted">' + esc(where) + '</span></div><div class="relbox">' + relBars(P) + '</div>';
      h += '<div class="row" style="margin-top:.35rem"><button class="btn ghost sm" data-dm="' + P.id + '">✉️ DM</button>' + (P.where !== 'away' && P.where !== 'transit' ? '<button class="btn ghost sm" data-tgo="' + (P.where === 'street' || P.where === 'park' ? 'town' : P.where) + '">📍 Go find</button>' : '') + '</div></div>';
    }
    const unmet = ppl.filter((p) => !p.met);
    if (unmet.length) h += '<div class="small muted" style="margin-top:.5rem">Still to meet: ' + unmet.map((p) => p.av + ' ' + esc(p.role)).join(' · ') + '</div>';
    return h;
  };

  PANELS.life = function () {
    const st = S();
    let h = '<h3>Careers <span class="chip">focus up to 3 · +20% XP & outcomes</span></h3>';
    for (const [id, c] of Object.entries(Sim.CAREERS)) {
      const nx = Sim.careerNext(id); const m = Sim.careerMetric(id); const f = Sim.focus(id);
      const pct = nx ? Math.min(100, (m - nx.prev) / (nx.min - nx.prev) * 100) : 100;
      h += '<div class="card"><div class="row sb"><b>' + c.emoji + ' ' + esc(c.name) + '</b><button class="btn ' + (f ? 'green' : 'ghost') + ' sm" data-career="' + id + '">' + (f ? '★ Focus' : 'Add focus') + '</button></div>';
      h += '<div class="small muted">' + esc(c.desc) + '</div><div class="row sb small" style="margin-top:.3rem"><span class="badge">' + esc(Sim.careerTitle(id)) + '</span><span class="mono muted">' + Sim.fmtNum(m) + (id === 'creator' ? ' followers' : ' XP') + (nx ? ' → ' + esc(nx.name) + ' @ ' + Sim.fmtNum(nx.min) : ' · maxed') + '</span></div><div class="bar"><i style="width:' + pct + '%"></i></div></div>';
    }
    const nw = Sim.netWorth();
    h += '<h3>Home <span class="chip">rent weekly in SOL</span></h3>';
    Sim.HOMES.forEach((hm, i) => {
      const cur = i === st.home.tier;
      h += '<div class="card"><div class="row sb"><b>' + hm.emoji + ' ' + esc(hm.name) + '</b>' + (cur ? '<span class="chip live">you live here</span>' : '<button class="btn sm" data-move="' + i + '"' + (i > st.home.tier && nw < hm.minNW ? ' disabled' : '') + '>' + (i > st.home.tier ? 'Move in' : 'Downsize') + '</button>') + '</div>';
      h += '<div class="small muted">Rent ◎' + hm.rent + '/wk · deposit ◎' + hm.deposit + (hm.minNW ? ' · needs ◎' + hm.minNW + ' net worth' : '') + (hm.moodBonus ? ' · needs decay ' + Math.round(hm.moodBonus * 100) + '% slower (fun) + quality bonus' : '') + '</div></div>';
    });
    h += '<h3>Achievements <span class="chip">' + Object.keys(st.ach).length + '/' + Object.keys(Sim.ACHIEVEMENTS).length + '</span></h3><div class="ach">';
    for (const [id, a] of Object.entries(Sim.ACHIEVEMENTS)) h += '<div class="' + (st.ach[id] != null ? '' : 'lock') + '"><b>' + a.emoji + ' ' + esc(a.name) + '</b>' + esc(a.desc) + '</div>';
    h += '</div><h3>Stats</h3><div class="statgrid">';
    const b = st.flags.build || { shipped: 0, users: 0 };
    for (const [k, v] of [['Posts', st.stats.posts], ['Virals', st.stats.virals], ['Spaces', st.stats.spaces], ['Gigs done', st.stats.gigsDone], ['Airdrops', AD.A.claimed.length], ['NFTs minted', NF.N.mints], ['NFT flips', NF.N.flips], ['Builds shipped', b.shipped], ['Peak followers', Sim.fmtNum(st.stats.peakFollowers)]]) h += '<div><b>' + v + '</b>' + k + '</div>';
    h += '</div><div class="row" style="margin-top:.8rem"><button class="btn ghost sm" data-how="1">❓ How to play</button><button class="btn ghost sm" data-save="1">💾 Save now</button></div>';
    return h;
  };

  // ---- charts ----
  function drawLine(c, data, color, opts) {
    opts = opts || {};
    const W = c.width, Hh = c.height; const g = c.getContext('2d');
    g.clearRect(0, 0, W, Hh);
    if (!data || data.length < 2) { g.fillStyle = '#555'; g.font = '22px Space Grotesk'; g.fillText('collecting data…', 16, Hh / 2); return; }
    let mn = Math.min(...data), mx = Math.max(...data); if (mx === mn) { mx += 1e-9; mn -= 1e-9; }
    const pad = opts.pad || 6;
    const X = (i) => pad + i / (data.length - 1) * (W - pad * 2), Y = (v) => Hh - pad - (v - mn) / (mx - mn) * (Hh - pad * 2);
    if (opts.grid) { g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, Hh * i / 4); g.lineTo(W, Hh * i / 4); g.stroke(); } }
    const grad = g.createLinearGradient(0, 0, 0, Hh); grad.addColorStop(0, color + '55'); grad.addColorStop(1, color + '00');
    g.beginPath(); data.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.lineTo(X(data.length - 1), Hh); g.lineTo(X(0), Hh); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); data.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.strokeStyle = color; g.lineWidth = opts.lw || 2; g.stroke();
    if (opts.labels) { g.fillStyle = '#8b9bb0'; g.font = '20px IBM Plex Mono'; g.fillText(opts.fmt(mx), 10, 24); g.fillText(opts.fmt(mn), 10, Hh - 10); }
  }
  function drawPanelCharts() {
    for (const s of sparkQueue) { const c = document.getElementById(s.id); if (c) drawLine(c, s.hist, s.color, { pad: 3, lw: 3 }); }
    const mc = document.getElementById('mainChart');
    if (mc && Mk.M.tokens[mkSel]) { const t = Mk.M.tokens[mkSel]; const up = t.price >= t.hist[0]; drawLine(mc, t.hist.concat([t.price]), up ? '#14F195' : '#ff5c7a', { grid: true, labels: true, fmt: Mk.fmtPrice, lw: 3, pad: 12 }); }
    const nc = document.getElementById('nwChart');
    if (nc) drawLine(nc, S().nw.map((x) => x[1]).concat([Sim.netWorth()]), '#9945FF', { grid: true, labels: true, fmt: (v) => '◎' + v.toFixed(2), lw: 3, pad: 12 });
  }

  // ---- panel events ----
  panel.addEventListener('click', (ev) => {
    const tb = ev.target.closest('[data-tgo],[data-tride]');
    if (tb && !tb.disabled) { if (tb.dataset.tgo) travel(tb.dataset.tgo, false); else travel(tb.dataset.tride, true); flushEvents(); renderPanelSoon(); return; }
    const b = ev.target.closest('[data-qa],[data-like],[data-rt],[data-dm],[data-open],[data-dmback],[data-follow],[data-msg],[data-quick],[data-send],[data-goto],[data-mksel],[data-accept],[data-decline],[data-deliver],[data-mkbuy],[data-mksell],[data-amt],[data-amtp],[data-wallet],[data-claim],[data-mint],[data-list],[data-unlist],[data-floor],[data-career],[data-move],[data-how],[data-save]');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.qa) { queueAction(d.qa); return; }
    if (d.like) { SO.like(+d.like); }
    else if (d.rt) { SO.repost(+d.rt); }
    else if (d.dm) { dmOpen = d.dm; setTab('dms'); return; }
    else if (d.open) { if (ev.target.closest('[data-follow]')) return; dmOpen = d.open; renderPanel(true); return; }
    else if (d.dmback) { dmOpen = null; }
    else if (d.follow) { const p = SO.person(d.follow); SO.follow(d.follow, !p.youFollow); }
    else if (d.msg) { SO.act(+d.msg, d.choice); }
    else if (d.quick) { SO.sendDM(dmOpen, d.quick); flushEvents(); renderPanel(true); return; }
    else if (d.send) { sendTyped(); return; }
    else if (d.goto) { setTab(d.goto); return; }
    else if (d.mksel) { mkSel = d.mksel; if (tab !== 'market') { setTab('market'); return; } }
    else if (d.accept) Sim.acceptGig(+d.accept);
    else if (d.decline) Sim.declineGig(+d.decline);
    else if (d.deliver) Sim.deliverGig(+d.deliver);
    else if (d.mkbuy) { const v = parseFloat(($('#mkAmt') || {}).value); Mk.buy(mkSel, v); }
    else if (d.mksell) Mk.sell(mkSel, +d.mksell);
    else if (d.amt) { $('#mkAmt').value = d.amt; return; }
    else if (d.amtp) { $('#mkAmt').value = (Math.floor(S().stats.sol * +d.amtp * 1000) / 1000).toString(); return; }
    else if (d.wallet) { d.wallet === '1' ? AD.addWallet() : AD.removeWallet(); }
    else if (d.claim) AD.claim(+d.claim);
    else if (d.mint) NF.mint(+d.mint);
    else if (d.list) { const el = $('#lp_' + d.list); const v = parseFloat(el.value || el.placeholder); NF.list(+d.list, v); }
    else if (d.unlist) NF.unlist(+d.unlist);
    else if (d.floor) NF.buyFloor(d.floor);
    else if (d.career) Sim.toggleCareer(d.career);
    else if (d.move) Sim.moveHome(+d.move);
    else if (d.how) { showHowTo(); return; }
    else if (d.save) { saveGame(); toast('💾 Saved.', 'info'); }
    flushEvents(); renderPanel();
  });
  panel.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.id === 'dmInput') { ev.preventDefault(); sendTyped(); }
    if (ev.key === 'Enter' && ev.target.id === 'mkAmt') { ev.preventDefault(); Mk.buy(mkSel, parseFloat(ev.target.value)); flushEvents(); renderPanel(); }
  });
  function sendTyped() { const el = $('#dmInput'); if (!el || !el.value.trim()) return; SO.sendDM(dmOpen, el.value); el.value = ''; flushEvents(); renderPanel(true); const e2 = $('#dmInput'); if (e2) e2.focus(); }

  // ================= MODALS =================
  const modal = $('#modal'), mbox = $('#mbox');
  function openModal(html, onBind, opts) {
    mbox.onclick = null; mbox.innerHTML = html; modal.hidden = false; modalOpen = true;
    modal.dataset.locked = opts && opts.locked ? '1' : '';
    if (onBind) onBind(mbox);
  }
  function closeModal() { modal.hidden = true; modalOpen = false; mbox.onclick = null; mbox.innerHTML = ''; }
  modal.addEventListener('click', (ev) => { if (ev.target === modal && !modal.dataset.locked) closeModal(); });

  const COLORS = ['#9945FF', '#14F195', '#ff6a00', '#4cc9f0', '#ff5ca8', '#ffd166', '#e8eef6', '#ef476f'];
  const HATS = [['none', 'None'], ['cap', '🧢 Cap'], ['beanie', '🧶 Beanie'], ['headphones', '🎧 Headphones'], ['crown', '👑 Crown'], ['party', '🎉 Party hat']];
  function showCreate() {
    creating = true;
    const draft = { name: 'Trex', handle: 'Trextxxy', color: '#9945FF', hat: 'cap', careers: ['creator'] };
    const render = () => {
      let h = '<p class="kicker">// new sim</p><h2>Create your Web3 Sim</h2><p>Pick a name, a look and a path. You can mix careers later.</p><div class="createGrid"><div>';
      h += '<div class="field"><label>Name</label><input class="input" id="cName" maxlength="20" value="' + esc(draft.name) + '"></div>';
      h += '<div class="field"><label>X handle</label><input class="input" id="cHandle" maxlength="18" value="' + esc(draft.handle) + '"></div>';
      h += '<div class="field"><label>Color</label><div class="swatches">' + COLORS.map((c) => '<button data-color="' + c + '" class="' + (draft.color === c ? 'on' : '') + '" style="background:' + c + '" aria-label="' + c + '"></button>').join('') + '</div></div>';
      h += '<div class="field"><label>Hat</label><div class="opts">' + HATS.map(([k, l]) => '<button data-hat="' + k + '" class="' + (draft.hat === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div></div>';
      h += '</div><div class="preview"><canvas id="cPrev" width="140" height="160"></canvas></div></div>';
      h += '<div class="field"><label>Career path (first pick = main title, up to 3)</label><div class="careers">' + Object.entries(Sim.CAREERS).map(([id, c]) => '<button data-cc="' + id + '" class="' + (draft.careers.includes(id) ? 'on' : '') + '">' + (draft.careers[0] === id ? '<span class="pri">MAIN</span>' : '') + '<b>' + c.emoji + ' ' + esc(c.name) + '</b><span>' + esc(c.desc) + '</span></button>').join('') + '</div></div>';
      h += '<div class="mrow"><button class="btn green" id="cGo">Start the grind 🫡</button></div>';
      return h;
    };
    const bind = (box) => {
      const prev = () => { const c = $('#cPrev').getContext('2d'); c.clearRect(0, 0, 140, 160); drawPerson(c, 70, 100, 3, { player: draft }); };
      prev();
      box.onclick = (ev) => {
        const b = ev.target.closest('button'); if (!b) return;
        draft.name = $('#cName').value; draft.handle = $('#cHandle').value;
        if (b.dataset.color) draft.color = b.dataset.color;
        else if (b.dataset.hat) draft.hat = b.dataset.hat;
        else if (b.dataset.cc) { const i = draft.careers.indexOf(b.dataset.cc); if (i >= 0) { if (draft.careers.length > 1) draft.careers.splice(i, 1); } else if (draft.careers.length < 3) draft.careers.push(b.dataset.cc); }
        else if (b.id === 'cGo') {
          const name = draft.name.trim().slice(0, 20) || 'Anon';
          const handle = (draft.handle.trim().replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '') || 'anon').slice(0, 18);
          Sim.newGame({ name, handle, color: draft.color, hat: draft.hat, careers: draft.careers.slice() });
          char.x = 5.5; char.y = 5.5; char.path = []; pendingAct = null; trip = null;
          creating = false; closeModal(); saveGame(); drawAvatar(); renderPanel(true); updateTicker(); flushEvents();
          showHowTo();
          return;
        }
        box.innerHTML = render(); bind(box);
      };
    };
    openModal(render(), bind, { locked: true });
  }
  function showHowTo() {
    const h = '<p class="kicker">// how to play</p><h2>Welcome to Web3 Sims 💎</h2><p>Live the full onchain grinder life. Keep your sim alive, stack (fake) SOL, climb your career ladders.</p><div class="howto">' +
      '<div><b>🏠 Tap objects</b>Desk = post, farm, build, outreach. Phone = scroll, Spaces, DMs. Bed, kitchen, shower, couch keep needs up.</div>' +
      '<div><b>🚪 Go outside</b>The front door leads to town: café, Web3 Hall, club, gym, park, market, bank and your neighbors. Walk, or pay ◎0.02 for a ride.</div>' +
      '<div><b>🤝 Meet sims</b>Tap a sim for Chat, Talk crypto, Share alpha, Pitch a gig, Collab, Joke, Befriend, Flirt, Exchange handles, Space invite… or Be rude. Friend / rival / romance bars change DMs, gigs and alpha.</div>' +
      '<div><b>🗓️ Events</b>Meetups at night, Onchain Summit, Whale Party (invite-only), Hackathon weekends. Check the 🗺️ Town tab.</div>' +
      '<div><b>💎 Watch the plumbob</b>Needs decay over time. Low needs make outcomes worse; very low and your sim refuses to work (or passes out).</div>' +
      '<div><b>🪂 Farm airdrops</b>Do tasks on testnets for points → snapshot → TGE → claim tokens. More wallets = more points + sybil risk.</div>' +
      '<div><b>📈 Trade the news</b>Headlines move prices: wars dump, ceasefires pump, ETFs rip, hacks nuke. Big buys move price. Whales watch.</div>' +
      '<div><b>🖼️ Mint & flip</b>Grind WLs, survive gas wars, reveal traits, list on the marketplace. Legendary = 7x floor.</div>' +
      '<div><b>🎙️ Grind CT</b>Post, thread, host Spaces. 250 followers unlocks gigs. Too many shills tank your rep.</div>' +
      '<div><b>💬 DMs</b>NPC sims slide in with gigs, alpha leaks, WLs, collabs… and drainers. Never click claim links.</div>' +
      '<div><b>🧾 Rent is real</b>Weekly rent in SOL. Grow net worth to move from a studio to a Dubai villa.</div></div>' +
      '<p class="small">Controls: <b>Space</b> pause · <b>1/2/3</b> speed · <b>B</b> buy mode · <b>Esc</b> close. Progress autosaves in your browser. Fake money only, no wallet connection.</p>' +
      '<div class="mrow"><button class="btn green" id="hGo">LFG 🚀</button></div>';
    openModal(h, (box) => { $('#hGo').onclick = () => { S().flags.howto = true; closeModal(); }; });
  }
  function showBuy() {
    const render = () => {
      const st = S();
      let h = '<p class="kicker">// buy mode · balance ◎ ' + Sim.fmtSol(st.stats.sol) + '</p><h2>Upgrade your setup 🛒</h2><div class="shop">';
      for (const [id, it] of Object.entries(Sim.ITEMS)) {
        const own = st.items[id];
        h += '<div class="item ' + (own ? 'owned' : '') + '"><div class="row sb"><span class="ie">' + it.emoji + '</span><b class="mono">◎ ' + it.price + '</b></div><b>' + esc(it.name) + '</b><p class="muted">' + esc(it.desc) + '</p>' + (own ? '<span class="chip live">owned</span>' : '<button class="btn sm" data-buy="' + id + '"' + (st.stats.sol < it.price ? ' disabled' : '') + '>Buy</button>') + '</div>';
      }
      h += '</div><p class="small">Want a bigger place? Check <b>Life → Home</b>. Rent scales with the view.</p><div class="mrow"><button class="btn ghost" id="bClose">Close</button></div>';
      return h;
    };
    const bind = (box) => { box.onclick = (ev) => { const b = ev.target.closest('button'); if (!b) return; if (b.id === 'bClose') { closeModal(); return; } if (b.dataset.buy) { Sim.buy(b.dataset.buy); flushEvents(); box.innerHTML = render(); } }; };
    openModal(render(), bind);
  }
  function showDrainer() {
    const p = S().pending; if (!p) return;
    const h = '<p class="kicker" style="color:var(--bad)">// new DM</p><h2>📩 ' + esc(p.from || 'Unknown') + '</h2><div class="drainer">Congrats ser! 🎉 Your wallet is eligible for <b>' + (p.amount || 420) + ' $SOL</b> community airdrop. Claim before it expires (2h left ⏳):<br><br>🔗 so1ana-claim.xyz/airdrop?ref=' + esc(S().player.handle) + '</div><p>Real projects never DM you first with claim links. Your call.</p><div class="mrow"><button class="btn red" id="dClick">🎁 Claim airdrop</button><button class="btn green" id="dIgnore">🛡️ Ignore & report</button></div>';
    openModal(h, () => {
      $('#dClick').onclick = () => { Sim.resolvePending('click'); closeModal(); flushEvents(); };
      $('#dIgnore').onclick = () => { Sim.resolvePending('ignore'); closeModal(); flushEvents(); };
    }, { locked: true });
  }

  // ================= CONTROLS =================
  function setSpeed(v) { speed = v; for (const b of document.querySelectorAll('.speed button')) b.classList.toggle('on', +b.dataset.speed === v); }
  document.querySelector('.speed').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) setSpeed(+b.dataset.speed); });
  $('#btnBuy').onclick = showBuy;
  $('#btnHelp').onclick = showHowTo;
  $('#btnReset').onclick = () => {
    openModal('<h2>Reset your sim?</h2><p>This wipes your save (followers, SOL, bags, JPEGs, everything). There is no undo. Not even a governance vote.</p><div class="mrow"><button class="btn ghost" id="rNo">Cancel</button><button class="btn red" id="rYes">Reset save</button></div>', () => {
      $('#rNo').onclick = closeModal;
      $('#rYes').onclick = () => { try { localStorage.removeItem(Sim.SAVE_KEY); } catch (e) {} closeModal(); showCreate(); };
    });
  };
  $('#aCancel').onclick = cancelCurrent;
  let prevSpeed = 1;
  document.addEventListener('keydown', (ev) => {
    if (ev.target.matches('input, textarea')) return;
    if (ev.key === 'Escape') { closeMenu(); if (!modal.dataset.locked) closeModal(); }
    if (modalOpen) return;
    if (ev.key === ' ') { ev.preventDefault(); if (speed) { prevSpeed = speed; setSpeed(0); } else setSpeed(prevSpeed || 1); }
    if (ev.key === '1' || ev.key === '2' || ev.key === '3') setSpeed(+ev.key);
    if (ev.key === 'b' || ev.key === 'B') showBuy();
  });

  // ================= SAVE / LOOP =================
  let creating = false;
  function saveGame() { if (creating) return; try { if (WS()) WS().pos = [char.x, char.y]; localStorage.setItem(Sim.SAVE_KEY, Sim.save()); } catch (e) {} }
  window.__World = {
    afterLoad(fresh) {
      const sc = scene(); pendingAct = null; trip = null; char.path = [];
      if (WS()) { WS().approach = null; if (!(S().action && String(S().action.id).indexOf('soc_') === 0)) WS().talkTo = null; }
      if (sc === 'town') { const p = WS().pos; const ok = p && W.walkable(Math.floor(p[0]), Math.floor(p[1])); char.x = ok ? p[0] : 4.5; char.y = ok ? p[1] : 5.5; }
      else if (sc !== 'home') { char.x = 6.5; char.y = 7.5; }
      else if (!fresh && WS().pos && WS().pos[0] < COLS && WS().pos[1] < ROWS && !blocked.has(Math.floor(WS().pos[0]) + ',' + Math.floor(WS().pos[1]))) { char.x = WS().pos[0]; char.y = WS().pos[1]; }
    },
  };
  window.addEventListener('beforeunload', saveGame);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

  const MIN_PER_SEC = 5;
  let last = performance.now(), saveT = 0, hudT = 0, loopErrs = 0;
  function frame(now) {
    try {
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000)); last = now;
      if (S()) {
        if (!modalOpen && speed > 0 && !S().pending) Sim.tick(dt * MIN_PER_SEC * speed);
        if (S().pending && !modalOpen) showDrainer();
        updateChar(dt);
        flushEvents();
        drawRoom(now);
        hudT += dt; saveT += dt;
        if (hudT > 0.15) { hudT = 0; renderHUD(); }
        const stale = now - lastPanelRender > (tab === 'market' || tab === 'farm' || tab === 'nft' || tab === 'town' ? 1500 : 3000);
        const typing = document.activeElement && panel.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
        if ((panelDirty || stale) && !(typing && !panelDirty) && now - lastPanelRender > 250) renderPanel();
        if (saveT > 5) { saveT = 0; saveGame(); }
      }
      loopErrs = 0;
    } catch (e) {
      loopErrs++;
      if (window.console) console.error(e);
      if (loopErrs === 30 && window.__w3sFatal) window.__w3sFatal((e && e.message) || String(e));
    }
    requestAnimationFrame(frame);
  }

  function backupBadSave(raw) {
    try { localStorage.setItem(Sim.SAVE_KEY + '.backup', raw); localStorage.removeItem(Sim.SAVE_KEY); } catch (e) {}
  }
  function startFresh() { Sim.newGame(); showCreate(); }
  function boot() {
    let loaded = null, raw = null;
    try { raw = localStorage.getItem(Sim.SAVE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try { loaded = Sim.load(raw); } catch (e) { loaded = null; }
      if (!loaded) { backupBadSave(raw); toast('Your old save could not be read, so it was backed up and a fresh sim started.', 'bad'); }
    }
    try {
      if (!loaded) startFresh();
      else toast('👋 Welcome back, @' + S().player.handle + '. Save loaded.', 'good');
      if (window.__World) window.__World.afterLoad(!loaded);
      drawAvatar(); updateTicker(); renderHUD(); renderPanel(true);
    } catch (e) {
      if (!loaded) throw e;
      if (window.console) console.warn('save broke the UI, starting fresh', e);
      backupBadSave(raw);
      closeModal(); startFresh();
      if (window.__World) window.__World.afterLoad(true);
      drawAvatar(); updateTicker(); renderHUD(); renderPanel(true);
    }
    setInterval(() => { try { updateTicker(); } catch (e) {} }, 20000);
    requestAnimationFrame(frame);
    window.__w3sBooted = true;
    const ld = document.getElementById('loader'); if (ld) ld.style.display = 'none';
  }
  window.__GAME = { setSpeed, setTab, saveGame, renderPanel, flushEvents, travel, queueAction, enterScene, get tab() { return tab; }, get char() { return char; }, get trip() { return trip; }, get pendingAct() { return pendingAct; }, scene };
  boot();
})();
