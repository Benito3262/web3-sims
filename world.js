/* Web3 Sims — the outside world: town map, locations, NPC schedules, in-person interactions,
 * relationships (friend / rival / romance), timed events and travel. Pure sim logic (no DOM). */
(function (root) {
  'use strict';
  const Sim = root.Sim;
  const H = Sim.h;
  const { R, rand, randInt, pick, clamp, r2, toast, feed, sys, unlock, addFollowers } = H;

  // ---------------- town map (28 x 23 tiles, 24px each on the 672x552 canvas) ----------------
  const TW = 28, TH = 23, TT = 24;
  const ROADS_H = [6, 7, 15, 16], ROADS_V = [8, 9, 18, 19];
  // lots: footprint (x,y,w,h) is solid; door = walkable tile in front of the entrance
  const LOTS = {
    home:   { name: 'Your place', emoji: '🏠', x: 1, y: 1, w: 6, h: 4, door: [4, 5], color: '#3d4a6b', roof: '#26304a', hours: null, kind: 'home', desc: 'Home sweet home. Bed, desk, shower, rent.' },
    cafe:   { name: 'Crypto Café', emoji: '☕', x: 11, y: 1, w: 6, h: 4, door: [13, 5], color: '#6b4a2f', roof: '#4a3220', hours: [7, 23], kind: 'bldg', desc: 'Coworking, coffee, founders pitching on napkins.' },
    hall:   { name: 'Web3 Hall', emoji: '🎪', x: 20, y: 0, w: 7, h: 5, door: [23, 5], color: '#3b2a6a', roof: '#2a1d4d', hours: [8, 24], kind: 'bldg', desc: 'Meetups, conferences, panels and hackathons.' },
    nh1:    { name: "Wendy's house", emoji: '🏡', x: 1, y: 9, w: 3, h: 3, door: [2, 12], color: '#6a3b55', roof: '#4a2840', hours: [9, 23], kind: 'house', owner: 'wendy', desc: 'Neighbor: wagmi wendy.' },
    nh2:    { name: "Kemi's house", emoji: '🏡', x: 5, y: 9, w: 3, h: 3, door: [6, 12], color: '#3b6a4a', roof: '#284a33', hours: [9, 23], kind: 'house', owner: 'kemi', desc: 'Neighbor: Kemi Farms (42 wallets, allegedly).' },
    park:   { name: 'Lekki Park', emoji: '🌳', x: 10, y: 8, w: 8, h: 7, door: null, color: '#1f5a32', roof: null, hours: null, kind: 'park', desc: 'Touch grass. Literally.' },
    club:   { name: 'Club Liquidity', emoji: '🪩', x: 20, y: 9, w: 7, h: 4, door: [23, 13], color: '#5a1f4a', roof: '#3d1433', hours: [20, 28], kind: 'bldg', desc: 'Parties, bottle service, whales in the VIP.' },
    gym:    { name: 'Gains Gym', emoji: '🏋️', x: 1, y: 18, w: 6, h: 4, door: [4, 17], color: '#2f4a6b', roof: '#20334a', hours: [6, 22], kind: 'bldg', desc: 'Lift, run, shower. Discipline is alpha.' },
    market: { name: 'Mama Put Market', emoji: '🛒', x: 11, y: 18, w: 6, h: 4, door: [13, 17], color: '#6b5a2f', roof: '#4a3e20', hours: [7, 21], kind: 'bldg', desc: 'Groceries, suya, jollof, gist.' },
    bank:   { name: 'Bank & OTC', emoji: '🏦', x: 20, y: 18, w: 4, h: 4, door: [21, 17], color: '#2f5a5a', roof: '#1f3d3d', hours: [9, 18], kind: 'bldg', desc: 'Pay bills, OTC desk, free (bad) financial advice.' },
    nh3:    { name: "Dave's house", emoji: '🏚️', x: 25, y: 18, w: 3, h: 3, door: [26, 17], color: '#5a4a3a', roof: '#3d3226', hours: [12, 26], kind: 'house', owner: 'dave', desc: 'Neighbor: degen dave. Curtains always closed.' },
  };
  const EDGES = [[0, 6], [27, 7], [0, 16], [27, 15]]; // where off-map sims enter/leave town
  const PARK_SPOTS = { bench: [12, 10], grass: [15, 12], jog: [10, 14], pond: [15, 9] };
  const TREES = [[11, 11], [13, 12], [14, 13], [17, 13], [16, 11]];
  const PARK_SOLID = TREES.concat([[16, 8], [17, 8], [16, 9], [17, 9]]); // trees + pond tiles
  const solid = new Set();
  for (const k in LOTS) { const L = LOTS[k]; if (L.kind === 'park') continue; for (let x = L.x; x < L.x + L.w; x++) for (let y = L.y; y < L.y + L.h; y++) solid.add(x + ',' + y); }
  for (const [x, y] of PARK_SOLID) solid.add(x + ',' + y);
  function walkable(x, y) { return x >= 0 && y >= 0 && x < TW && y < TH && !solid.has(x + ',' + y); }
  function townPath(sx, sy, tx, ty) {
    sx = clamp(Math.floor(sx), 0, TW - 1); sy = clamp(Math.floor(sy), 0, TH - 1);
    tx = clamp(Math.floor(tx), 0, TW - 1); ty = clamp(Math.floor(ty), 0, TH - 1);
    if (!walkable(tx, ty)) { const n = nearestWalkable(tx, ty); if (!n) return null; tx = n[0]; ty = n[1]; }
    if (sx === tx && sy === ty) return [];
    const key = (x, y) => x + ',' + y;
    const q = [[sx, sy]], prev = {}; prev[key(sx, sy)] = null; let qi = 0;
    while (qi < q.length) {
      const [x, y] = q[qi++];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (!walkable(nx, ny) || k in prev) continue;
        prev[k] = [x, y];
        if (nx === tx && ny === ty) {
          const path = []; let c = [nx, ny];
          while (c && !(c[0] === sx && c[1] === sy)) { path.unshift([c[0] + 0.5, c[1] + 0.5]); c = prev[key(c[0], c[1])]; }
          return path;
        }
        q.push([nx, ny]);
      }
    }
    return null;
  }
  function nearestWalkable(x, y) {
    for (let r = 1; r < 6; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (walkable(x + dx, y + dy)) return [x + dx, y + dy];
    return null;
  }
  function lotAt(tx, ty) {
    for (const k in LOTS) { const L = LOTS[k]; if (tx >= L.x && tx < L.x + L.w && ty >= L.y && ty < L.y + L.h) return k; }
    for (const k in LOTS) { const L = LOTS[k]; if (L.door && L.door[0] === tx && L.door[1] === ty) return k; }
    return null;
  }
  function isOpen(id, t) {
    const L = LOTS[id]; if (!L || !L.hours) return true;
    const h = ((t === undefined ? Sim.state.t : t) % 1440) / 60;
    const [o, c] = L.hours;
    if (c > 24) return h >= o || h < c - 24;
    return h >= o && h < c;
  }
  function hoursLabel(id) {
    const L = LOTS[id]; if (!L.hours) return 'Open 24/7';
    const f = (h) => { h = h % 24; return (h % 12 || 12) + (h < 12 ? 'am' : 'pm'); };
    return f(L.hours[0]) + '–' + f(L.hours[1]);
  }

  // ---------------- people in town ----------------
  // extra town sims (added to the social roster so DMs/feed/follows work for them too)
  const EXTRA = [
    { id: 'femi', name: 'Femi Founder', handle: 'femi_builds', av: '🧑🏿‍🚀', role: 'Founder', pers: 'wholesome', bio: 'Building a Solana payments app. Always hiring creators.' },
    { id: 'lola', name: 'Lola Launchpad', handle: 'lola_bd', av: '💃🏽', role: 'BD Lead', pers: 'shill', bio: 'BD @ a launchpad. Has every founder on speed dial.' },
    { id: 'kofi', name: 'Kofi Gains', handle: 'kofi_gains', av: '🏋🏿', role: 'Gym Bro Trader', pers: 'degen', bio: 'Leg day and leverage day are the same day.' },
    { id: 'zara', name: 'Zara Research', handle: 'zara_research', av: '👩🏽‍🔬', role: 'Researcher', pers: 'alpha', bio: 'Writes the reports funds pretend to read.' },
  ];
  const FOLLOWERS = { ada: 8200, dave: 3100, frog: 12400, wendy: 25300, oracle: 48000, kemi: 6100, jpeg: 4300, whale: 121000, chad: 15200, tunde: 18700, shill: 9400, femi: 5200, lola: 7600, kofi: 2300, zara: 31000 };
  const COLORS = { ada: '#14F195', dave: '#ff9a3c', frog: '#3dd68c', wendy: '#ff5ca8', oracle: '#9945FF', kemi: '#ffd166', jpeg: '#4cc9f0', whale: '#2a6fdb', chad: '#e8eef6', tunde: '#ef476f', shill: '#ff6a00', femi: '#00c2a8', lola: '#c77dff', kofi: '#ff4d4d', zara: '#7bdff2' };
  const HATS = { ada: 'headphones', dave: 'cap', frog: 'beanie', wendy: 'party', oracle: 'crown', kemi: 'cap', jpeg: 'beanie', whale: 'crown', chad: 'none', tunde: 'headphones', shill: 'cap', femi: 'none', lola: 'party', kofi: 'none', zara: 'headphones' };
  // daily schedules: [fromHour, location]; 'away' = off map (they live elsewhere)
  const SCHED = {
    ada:    [[0, 'away'], [8, 'cafe'], [12, 'hall'], [17, 'park'], [19, 'cafe'], [22, 'away']],
    dave:   [[0, 'club'], [3, 'nh3'], [13, 'market'], [15, 'bank'], [17, 'nh3'], [21, 'club']],
    frog:   [[0, 'club'], [1, 'away'], [11, 'park'], [14, 'cafe'], [18, 'street'], [21, 'club']],
    wendy:  [[0, 'nh1'], [9, 'cafe'], [13, 'park'], [16, 'nh1'], [19, 'hall'], [22, 'nh1']],
    oracle: [[0, 'away'], [10, 'bank'], [13, 'cafe'], [16, 'away'], [21, 'club']],
    kemi:   [[0, 'nh2'], [7, 'park'], [9, 'nh2'], [12, 'market'], [14, 'cafe'], [18, 'nh2']],
    jpeg:   [[0, 'away'], [11, 'market'], [14, 'park'], [17, 'cafe'], [20, 'club']],
    whale:  [[0, 'club'], [2, 'away'], [14, 'bank'], [16, 'away'], [22, 'club']],
    chad:   [[0, 'away'], [9, 'cafe'], [12, 'bank'], [14, 'hall'], [18, 'away'], [21, 'club']],
    tunde:  [[0, 'away'], [10, 'gym'], [12, 'cafe'], [16, 'park'], [18, 'hall'], [23, 'away']],
    shill:  [[0, 'away'], [10, 'hall'], [13, 'street'], [15, 'cafe'], [19, 'club'], [23, 'away']],
    femi:   [[0, 'away'], [8, 'cafe'], [13, 'hall'], [16, 'cafe'], [20, 'away']],
    lola:   [[0, 'away'], [11, 'hall'], [14, 'cafe'], [17, 'market'], [20, 'club']],
    kofi:   [[0, 'away'], [6, 'gym'], [10, 'market'], [12, 'bank'], [14, 'gym'], [18, 'park'], [20, 'away']],
    zara:   [[0, 'away'], [9, 'hall'], [12, 'cafe'], [15, 'park'], [17, 'bank'], [19, 'away']],
  };
  const TOWN_IDS = Object.keys(SCHED);

  // ---------------- events ----------------
  const EVENT_DEFS = {
    meetup: { name: 'Lagos Web3 Meetup', emoji: '🍻', loc: 'hall', from: 19, to: 23, days: (d) => d % 2 === 1 && !(d % 7 === 6 || d % 7 === 0), desc: 'Networking night. Meet founders, land gigs, eat free small chops.', crowd: ['ada', 'wendy', 'femi', 'lola', 'tunde', 'chad', 'kemi', 'jpeg'] },
    summit: { name: 'Onchain Summit', emoji: '🎤', loc: 'hall', from: 10, to: 18, days: (d) => d % 7 === 3, desc: 'Conference day: keynotes, panels, booths giving out WL spots.', crowd: ['ada', 'zara', 'chad', 'femi', 'lola', 'oracle', 'tunde', 'shill', 'wendy'] },
    whale:  { name: 'Whale Party', emoji: '🐋', loc: 'club', from: 21, to: 27, days: (d) => d % 7 === 5, desc: 'Invite-only VIP night. Whales talk alpha after the 3rd bottle.', crowd: ['whale', 'oracle', 'chad', 'dave', 'lola', 'kofi', 'jpeg'] },
    hack:   { name: 'Hackathon Weekend', emoji: '🏆', loc: 'hall', from: 9, to: 21, days: (d) => d % 7 === 6 || d % 7 === 0, desc: 'Two days of building. Prizes in SOL, judges are VCs.', crowd: ['ada', 'femi', 'zara', 'chad', 'kemi'] },
  };
  function eventsOnDay(d) {
    const out = [];
    for (const id in EVENT_DEFS) { const e = EVENT_DEFS[id]; if (e.days(d)) out.push({ id, def: e, start: (d - 1) * 1440 + e.from * 60, end: (d - 1) * 1440 + e.to * 60 }); }
    return out;
  }
  function activeEvents(t) {
    t = t === undefined ? Sim.state.t : t;
    const d = Math.floor(t / 1440) + 1;
    return eventsOnDay(d - 1).concat(eventsOnDay(d)).filter((e) => t >= e.start && t < e.end);
  }
  function eventAt(loc, t) { return activeEvents(t).find((e) => e.def.loc === loc) || null; }
  function upcomingEvents(n) {
    const t = Sim.state.t, d = Math.floor(t / 1440) + 1; let out = [];
    for (let i = 0; i < 8 && out.length < (n || 6); i++) out = out.concat(eventsOnDay(d + i).filter((e) => e.end > t));
    return out.slice(0, n || 6);
  }

  // ---------------- state ----------------
  let S, W;
  const mod = { id: 'world' };
  mod.achievements = {
    outside:   { name: 'Outside Is Real', desc: 'Leave your apartment and walk into town', emoji: '🚶' },
    networker: { name: 'Networker', desc: 'Meet 8 sims in person', emoji: '🤝' },
    event1:    { name: 'Pulled Up', desc: 'Attend a town event', emoji: '🎟️' },
    vip:       { name: 'VIP Access', desc: 'Get into the Whale Party', emoji: '🍾' },
    beef:      { name: 'CT Beef', desc: 'Make a rival', emoji: '🥩' },
    romance:   { name: 'Onchain Situationship', desc: 'Reach 60 romance with a sim', emoji: '💘' },
    ride:      { name: 'Too Rich To Walk', desc: 'Take a ride across town', emoji: '🚕' },
  };

  function SO() { return S.so; }
  function rel(id) {
    const so = SO(); if (!so) return null;
    if (!so.people[id]) so.people[id] = { rel: randInt(5, 20), follows: false, youFollow: false };
    const r = so.people[id];
    if (r.rival == null) r.rival = 0;
    if (r.romance == null) r.romance = 0;
    if (r.met == null) r.met = false;
    return r;
  }
  function personInfo(id) {
    const P = Sim.Social.PEOPLE.find((p) => p.id === id); if (!P) return null;
    const r = rel(id);
    return Object.assign({}, P, r, { followers: FOLLOWERS[id] || 1000, color: COLORS[id] || '#888', hat: HATS[id] || 'none', where: npcLoc(id) });
  }

  mod.init = function (state, fresh) {
    S = state;
    const PEOPLE = Sim.Social.PEOPLE;
    for (const e of EXTRA) if (!PEOPLE.find((p) => p.id === e.id)) PEOPLE.push(e);
    if (fresh || !S.world || typeof S.world !== 'object') {
      S.world = { scene: 'home', pos: null, npcs: {}, attended: {}, metCount: 0, groceries: 0, fitUntil: -1, rides: 0, lastTalk: {}, invite: false };
    }
    W = S.world;
    W.npcs = W.npcs || {}; W.attended = W.attended || {}; W.lastTalk = W.lastTalk || {};
    if (!LOTS[W.scene] && W.scene !== 'town' && W.scene !== 'home') W.scene = 'home';
    if (S.so) {
      for (const p of PEOPLE) rel(p.id);
      // old saves: anyone you already DM with counts as met
      for (const id in S.so.threads) if ((S.so.threads[id] || []).length && S.so.people[id]) S.so.people[id].met = true;
    }
    for (const id of TOWN_IDS) if (!W.npcs[id]) W.npcs[id] = { loc: 'away', x: EDGES[0][0] + 0.5, y: EDGES[0][1] + 0.5, path: [], dest: null };
    placeAll(true);
  };

  // ---------------- NPC movement ----------------
  function schedLoc(id, t) {
    const ev = activeEvents(t).find((e) => e.def.crowd.indexOf(id) >= 0);
    if (ev) return ev.def.loc;
    const h = (t % 1440) / 60;
    const sc = SCHED[id]; let loc = sc[sc.length - 1][1];
    for (const [from, l] of sc) if (h >= from) loc = l;
    if (LOTS[loc] && !isOpen(loc, t) && LOTS[loc].kind === 'bldg') loc = 'away';
    return loc;
  }
  function doorOf(loc) {
    if (loc === 'away') return null;
    if (loc === 'street') return null;
    if (loc === 'park') return [10 + randInt(1, 6), 8 + randInt(1, 5)];
    return LOTS[loc] && LOTS[loc].door;
  }
  function streetSpot() { const pts = [[5, 6], [13, 7], [22, 6], [9, 11], [18, 11], [4, 15], [14, 16], [24, 15], [8, 20], [19, 21]]; return pick(pts); }
  function placeAll(teleport) {
    for (const id of TOWN_IDS) {
      const n = W.npcs[id]; const want = schedLoc(id, S.t);
      if (teleport || n.loc === undefined) {
        n.dest = null; n.path = []; n.loc = want;
        const d = want === 'street' ? streetSpot() : doorOf(want) || pick(EDGES);
        n.x = d[0] + 0.5; n.y = d[1] + 0.5;
      }
    }
  }
  const NPC_SPEED = 0.9; // tiles per game minute
  function npcInTown(n) { return n.dest || n.loc === 'park' || n.loc === 'street'; }
  function updateNPCs(dt) {
    for (const id of TOWN_IDS) {
      const n = W.npcs[id];
      if (W.talkTo === id && (S.action && S.action.id && S.action.id.indexOf('soc_') === 0 || W.approach === id)) continue; // frozen while chatting
      const want = schedLoc(id, S.t);
      if (!n.dest && want !== n.loc) {
        // leave current place and walk to the next
        const from = n.loc === 'away' ? pick(EDGES) : n.loc === 'street' || n.loc === 'park' ? [Math.floor(n.x), Math.floor(n.y)] : (LOTS[n.loc] && LOTS[n.loc].door) || pick(EDGES);
        const to = want === 'away' ? EDGES.slice().sort((a, b) => Math.hypot(a[0] - from[0], a[1] - from[1]) - Math.hypot(b[0] - from[0], b[1] - from[1]))[0] : want === 'street' ? streetSpot() : doorOf(want);
        n.x = from[0] + 0.5; n.y = from[1] + 0.5;
        n.path = townPath(from[0], from[1], to[0], to[1]) || [];
        n.dest = want; n.loc = 'transit';
      }
      if (n.dest) {
        let budget = NPC_SPEED * dt;
        while (budget > 0 && n.path.length) {
          const [px, py] = n.path[0]; const dx = px - n.x, dy = py - n.y, d = Math.hypot(dx, dy);
          if (d <= budget) { n.x = px; n.y = py; n.path.shift(); budget -= d; } else { n.x += dx / d * budget; n.y += dy / d * budget; budget = 0; }
          n.face = dx > 0 ? 1 : dx < 0 ? -1 : n.face;
        }
        if (!n.path.length) { n.loc = n.dest; n.dest = null; }
      } else if ((n.loc === 'park' || n.loc === 'street') && R() < dt * 0.04) {
        // wander a little
        const tx = Math.floor(n.x) + randInt(-3, 3), ty = Math.floor(n.y) + randInt(-2, 2);
        const inPark = n.loc === 'park';
        if (walkable(tx, ty) && (!inPark || (tx >= 10 && tx < 18 && ty >= 8 && ty < 15))) { n.path = townPath(n.x, n.y, tx, ty) || []; if (n.path.length) { n.dest = n.loc; } }
      }
    }
  }
  function npcLoc(id) { const n = W && W.npcs[id]; return n ? (n.dest ? 'transit' : n.loc) : 'away'; }
  function npcsAt(loc) { return TOWN_IDS.filter((id) => { const n = W.npcs[id]; return !n.dest && n.loc === loc; }); }
  function npcsInTown() { return TOWN_IDS.filter((id) => { const n = W.npcs[id]; return n.dest || n.loc === 'park' || n.loc === 'street'; }); }

  // ---------------- interactions ----------------
  const INTERACTIONS = {
    chat:    { label: 'Chat', emoji: '💬', mins: 20, fx: { social: 12, fun: 3 } },
    crypto:  { label: 'Talk about crypto', emoji: '📈', mins: 25, fx: { social: 10, fun: 4 } },
    alpha:   { label: 'Share alpha', emoji: '🤫', mins: 15, fx: { social: 6 } },
    pitch:   { label: 'Pitch a gig', emoji: '💼', mins: 20, fx: { social: 5, energy: -3 } },
    collab:  { label: 'Ask for collab', emoji: '🤝', mins: 20, fx: { social: 8 } },
    joke:    { label: 'Tell a joke', emoji: '😂', mins: 10, fx: { fun: 8, social: 5 } },
    befriend:{ label: 'Befriend', emoji: '🫂', mins: 30, fx: { social: 15, fun: 5 } },
    flirt:   { label: 'Flirt', emoji: '😘', mins: 15, fx: { social: 8, fun: 6 } },
    handles: { label: 'Exchange handles (follow on X)', emoji: '📲', mins: 5, fx: { social: 4 } },
    space:   { label: 'Invite to your Space', emoji: '🎙️', mins: 10, fx: { social: 5 } },
    rude:    { label: 'Be rude', emoji: '🖕', mins: 5, fx: { fun: 4, social: -4 } },
  };
  const HIRERS = ['femi', 'lola', 'chad', 'shill', 'wendy', 'tunde', 'ada', 'zara'];
  const LIKES_CRYPTO = ['dave', 'oracle', 'kemi', 'jpeg', 'whale', 'kofi', 'zara', 'chad'];

  function meet(id, quiet) {
    const r = rel(id); if (r.met) return false;
    r.met = true; W.metCount = (W.metCount || 0) + 1;
    const p = personInfo(id);
    if (!quiet) toast('👋 Met ' + p.av + ' ' + p.name + ' (' + p.role + ') in person. They are now in your DMs & feed.', 'good');
    if (W.metCount >= 8) unlock('networker');
    return true;
  }
  function relChange(id, friend, rival, romance) {
    const r = rel(id); const p = personInfo(id);
    const before = r.rel, beforeRiv = r.rival, beforeRom = r.romance;
    r.rel = clamp(r.rel + (friend || 0), 0, 100);
    r.rival = clamp(r.rival + (rival || 0), 0, 100);
    r.romance = clamp(r.romance + (romance || 0), 0, 100);
    if (before < 60 && r.rel >= 60) { unlock('mutuals'); toast('🤝 You and @' + p.handle + ' are close friends now.', 'good'); }
    if (beforeRiv < 50 && r.rival >= 50) { unlock('beef'); toast('🥩 @' + p.handle + ' is officially your rival. Expect subtweets.', 'bad'); }
    if (beforeRom < 60 && r.romance >= 60) { unlock('romance'); toast('💘 You and ' + p.name + ' are a thing now. CT is shipping it.', 'good'); }
    if (!r.follows && r.rel >= 35 && R() < 0.35) { r.follows = true; addFollowers(1); toast(p.av + ' @' + p.handle + ' followed you', 'info'); }
  }
  function moodFactor() { return clamp(Sim.mood() / 70, 0.5, 1.3); }
  function interact(id, kind) {
    const p = personInfo(id); if (!p) return;
    const r = rel(id);
    const firstMeet = meet(id);
    W.lastTalk[id] = S.t;
    const mf = moodFactor();
    const smelly = S.needs.hygiene < 20;
    const roll = R();
    const say = (t, tone) => toast(p.av + ' ' + p.name + ': ' + t, tone || 'info');
    if (smelly && kind !== 'rude' && R() < 0.5) { relChange(id, -4); say('"...did you shower this week?" 🤢', 'bad'); return; }
    switch (kind) {
      case 'chat': {
        const g = Math.round(rand(3, 7) * mf); relChange(id, g);
        say(pick(['"so what are you building these days?"', '"lagos traffic is a bear market of its own"', '"gm gm! good to finally meet IRL"', '"I see your posts all the time!"']));
        break;
      }
      case 'crypto': {
        const fan = LIKES_CRYPTO.indexOf(id) >= 0;
        relChange(id, fan ? Math.round(rand(5, 9) * mf) : Math.round(rand(1, 4) * mf));
        if (fan && R() < 0.3) { S.flags.alpha = true; say('"between us, I am rotating into protocol tokens." (next thread boosted 💡)', 'good'); }
        else say(fan ? '"finally someone who reads charts" 📈' : '"…can we talk about literally anything else" 😅');
        Sim.addXP('trader', 4);
        break;
      }
      case 'alpha': {
        if (S.flags.alpha) {
          S.flags.alpha = false; relChange(id, Math.round(rand(8, 13) * mf));
          say('"wait that is actually good alpha. I owe you one" 🤝', 'good');
          if (r.rel >= 35 && Sim.Market && (['oracle', 'whale', 'zara', 'dave', 'kofi'].indexOf(id) >= 0 || R() < 0.3)) giveLeak(id);
        } else if (r.rel >= 45 && Sim.Market) {
          relChange(id, 2); giveLeak(id);
        } else { relChange(id, -2); say('"you came to me with no alpha and asked for alpha?" 🙄 (bring alpha or build trust first)', 'bad'); }
        break;
      }
      case 'pitch': {
        if (HIRERS.indexOf(id) < 0) { relChange(id, -1); say('"ser I am not hiring, I can barely pay rent" 😂'); break; }
        const chance = clamp(0.15 + r.rel / 160 + S.stats.rep / 400 + Math.min(S.stats.followers / 15000, 0.15) - S.stats.shill / 300, 0.08, 0.85) * mf;
        if (roll < chance) {
          const o = H.makeOffer(r.rel >= 50 || id === 'femi' ? 'premium' : id === 'shill' ? 'low' : 'normal', true);
          if (o) { o.project = id === 'femi' ? 'Femi Pay' : o.project; S.offers.unshift(o); H.emit('gig', {}); say('"send me your rate card. brief is in your Gigs tab" 💼 (' + Sim.fmtSol(o.pay) + ' SOL)', 'good'); relChange(id, 2); }
        } else { relChange(id, r.rel < 25 ? -2 : 0); say(pick(['"we are good for now, but keep in touch"', '"budget is tight this quarter, ser"', '"get your numbers up a bit and hit me up"'])); }
        break;
      }
      case 'collab': {
        if (r.rel >= 25 || R() < 0.25) {
          S.flags.collab = '@' + p.handle; relChange(id, 4);
          say('"locked in, I will co-host your next Space" 🎙️ (double reach)', 'good');
        } else { relChange(id, -1); say('"we just met… maybe after a few more convos"'); }
        break;
      }
      case 'joke': {
        const good = R() < (p.pers === 'toxic' ? 0.35 : 0.6) * mf + 0.1;
        if (good) { relChange(id, Math.round(rand(4, 8))); say(pick(['"LMAOOO 💀 ok you are funny"', '"I am stealing that for a tweet"', '"😂😂 stop"']), 'good'); }
        else { relChange(id, -2); say(pick(['"…was that a joke?"', '"that joke rugged harder than $PUMPKINU"', '"crickets 🦗"']), 'bad'); }
        break;
      }
      case 'befriend': {
        const g = Math.round((firstMeet ? rand(6, 10) : rand(8, 14)) * mf);
        relChange(id, g, -5);
        say(pick(['"we should link up more often fr"', '"you are good people"', '"adding you to the group chat 🫡"']), 'good');
        break;
      }
      case 'flirt': {
        if (r.rel >= 30 && R() < 0.7 * mf) { relChange(id, 2, 0, Math.round(rand(8, 15))); say(pick(['"you are kinda cute for a degen" 😳', '"stop it 🙈"', '"drinks after the next meetup?" 💘']), 'good'); }
        else { relChange(id, -4, 0, -2); say(pick(['"haha… awkward" 😬', '"I have a girlfriend/boyfriend/bags"', '"let us keep it professional, ser"']), 'bad'); }
        break;
      }
      case 'handles': {
        const so = SO();
        if (!r.youFollow) r.youFollow = true;
        if (!r.follows && (r.rel >= 15 || R() < 0.5)) { r.follows = true; addFollowers(1); }
        relChange(id, 3);
        say(r.follows ? '"followed! drop a post and I will engage" 📲' : '"I will follow later" (they did not)', r.follows ? 'good' : 'info');
        if (so && !(so.threads[id] || []).length) Sim.Social.receive(id, 'gm! nice meeting you IRL 👋');
        break;
      }
      case 'space': {
        const big = p.followers >= 15000;
        if (r.rel >= (big ? 40 : 20) || (id === 'tunde' && r.rel >= 10)) {
          S.flags.collab = '@' + p.handle; relChange(id, 3);
          say(big ? '"sure, I will pull up as a speaker" 🎙️ (big reach boost)' : '"I am there! send the link" 🎙️', 'good');
        } else { relChange(id, -1); say(big ? '"my calendar is full, ser" (need more rapport with big accounts)' : '"maybe next time"'); }
        break;
      }
      case 'rude': {
        if (p.pers === 'toxic' && R() < 0.4) { relChange(id, 5, 10); say('"based. finally someone with a spine" 🐸'); }
        else { relChange(id, -15, 22); say(pick(['"wow. ok. remember this"', '"blocked. IRL."', '"I am subtweeting you tonight"']), 'bad'); }
        break;
      }
    }
    S.stats.clout = clamp(S.stats.clout + 0.5, 0, 100);
  }
  function giveLeak(id) {
    const p = personInfo(id);
    const toks = Object.values(Sim.Market.M.tokens).filter((t) => t.sym !== 'SOL' && !t.rugged);
    if (!toks.length) return;
    const tok = pick(toks); const dir = R() < 0.72 ? 1 : -1; const hours = randInt(2, 7);
    const real = R() < clamp(0.55 + rel(id).rel / 200 + (id === 'whale' || id === 'oracle' || id === 'zara' ? 0.1 : 0) - (id === 'dave' ? 0.25 : 0), 0.2, 0.95);
    Sim.Market.scheduleLeak(tok.sym, hours, dir, real);
    toast(p.av + ' ' + p.name + ' whispers: "' + (dir > 0 ? '$' + tok.sym + ' has news dropping in ~' + hours + 'h. load up 🤫' : 'team wallets on $' + tok.sym + ' look ready to dump in ~' + hours + 'h') + '"', 'good');
    unlock('alpha_leak');
  }

  // ---------------- location actions ----------------
  function needOpen(loc) { return () => (isOpen(loc) ? null : LOTS[loc].name + ' is closed (' + hoursLabel(loc) + ')'); }
  function needEvent(evId) { return () => { const e = eventAt(EVENT_DEFS[evId].loc); return e && e.id === evId ? null : 'Only during ' + EVENT_DEFS[evId].name + ' (check Town tab)'; }; }
  function attend(evId) {
    const key = evId + '@' + Sim.day();
    if (!W.attended[key]) { W.attended[key] = 1; unlock('event1'); }
  }
  function meetCrowd(loc, n) {
    const here = npcsAt(loc).filter((id) => !rel(id).met);
    const pool = here.length ? here : npcsAt(loc);
    let out = [];
    for (let i = 0; i < n && pool.length; i++) { const id = pool.splice(Math.floor(R() * pool.length), 1)[0]; if (meet(id, true)) out.push(id); relChange(id, randInt(3, 7)); }
    if (out.length) toast('👋 Met ' + out.map((id) => personInfo(id).av + ' ' + personInfo(id).name).join(', ') + '. Now in your DMs.', 'good');
    return out;
  }
  function giveWLRandom(src) {
    if (!Sim.NFT) return null;
    const d = Sim.NFT.N.drops.find((x) => x.phase === 'upcoming' && !x.wl) || Sim.NFT.N.drops.find((x) => x.phase === 'wl' && !x.wl);
    if (d) { Sim.NFT.giveWL(d.id); toast('📝 ' + src + ' gave you a WL spot for ' + d.name + ' ' + d.emoji, 'good'); return d; }
    return null;
  }
  function boostFarm(pts, src) {
    if (!Sim.Airdrop) return;
    const p = Sim.Airdrop.A.protos.find((x) => x.phase === 'farming'); if (!p) return;
    p.pts += pts; toast('🪂 +' + pts + ' points on ' + p.name + ' from ' + src, 'good');
  }
  function earn(sol, why) { sol = r2(sol); S.stats.sol = r2(S.stats.sol + sol); S.stats.earned = r2(S.stats.earned + sol); return sol; }
  function whaleEntry() {
    const r = rel('whale');
    if (S.stats.followers >= 1500 || Sim.netWorth() >= 12 || r.rel >= 35 || W.invite) return null;
    return 'Bouncer: "Not on the list." (need 1.5k followers, 12 SOL net worth, whale friendship 35+ or an invite)';
  }

  mod.actions = function () {
    const L = {};
    const add = (id, a) => { a.obj = a.obj; a.outsideOnly = true; L[id] = a; };
    // café
    add('cafe_coffee', { obj: 'cafe:counter', label: 'Buy a flat white', emoji: '☕', mins: 10, cost: 0.01, fx: { energy: 20, hunger: 4, fun: 3 }, req: needOpen('cafe') });
    add('cafe_food', { obj: 'cafe:counter', label: 'Eat a croissant & jollof bowl', emoji: '🥐', mins: 25, cost: 0.03, fx: { hunger: 50, fun: 5 }, req: needOpen('cafe') });
    add('cafe_cowork', { obj: 'cafe:tables', group: 'Cowork', label: 'Cowork session (post + network)', emoji: '💻', mins: 90, fx: { energy: -10, social: 15, fun: 2 }, work: true, req: needOpen('cafe'), done: () => {
      const g = Math.round(randInt(4, 14) * H.scale() * H.quality()); addFollowers(g);
      toast('💻 Productive cowork session. +' + g + ' followers' , 'good'); Sim.addXP('builder', 8); Sim.addXP('farmer', 8);
      if (R() < 0.45) meetCrowd('cafe', 1);
      if (R() < 0.18) { const o = H.makeOffer('normal', true); if (o) { S.offers.unshift(o); H.emit('gig', {}); toast('💼 The founder at the next table asked for your rate card. New gig!', 'good'); } }
    } });
    add('cafe_founders', { obj: 'cafe:founders', group: 'Cowork', label: 'Pitch founders at the big table', emoji: '🧑‍🚀', mins: 45, fx: { energy: -6, social: 12 }, work: true, req: needOpen('cafe'), done: () => {
      const chance = clamp(0.25 + S.stats.rep / 300 + Math.min(S.stats.followers / 10000, 0.2), 0.1, 0.8);
      if (R() < chance) { const o = H.makeOffer('premium', true); if (o) { S.offers.unshift(o); H.emit('gig', {}); toast('🧑‍🚀 A founder loved your pitch: premium gig (' + Sim.fmtSol(o.pay) + ' SOL) in Gigs.', 'good'); } }
      else toast('🧑‍🚀 "Interesting. Let us circle back." (they will not)', 'info');
      meetCrowd('cafe', 1);
    } });
    // hall (events)
    add('hall_mingle', { obj: 'hall:floor', group: 'Lagos Web3 Meetup 🍻', label: 'Mingle at the meetup', emoji: '🍻', mins: 90, fx: { social: 40, fun: 15, energy: -10, hunger: 15 }, clean: true, req: needEvent('meetup'), done: () => {
      attend('meetup'); meetCrowd('hall', 2); const g = Math.round(randInt(8, 25) * H.scale()); addFollowers(g);
      let msg = '🍻 Great meetup. +' + g + ' followers, free small chops.';
      if (R() < 0.4) { const o = H.makeOffer('premium', true); if (o) { S.offers.unshift(o); H.emit('gig', {}); msg += ' A team slid you a premium gig!'; } }
      toast(msg, 'good');
    } });
    add('hall_talk', { obj: 'hall:stage', group: 'Lagos Web3 Meetup 🍻', label: 'Give a lightning talk', emoji: '⚡', mins: 45, fx: { energy: -12, social: 20, fun: 10 }, work: true, minFollowers: 300, req: needEvent('meetup'), done: () => {
      attend('meetup'); const g = Math.round(randInt(30, 90) * H.scale() * H.quality()); addFollowers(g); S.stats.clout = clamp(S.stats.clout + 8, 0, 100); S.stats.rep = clamp(S.stats.rep + 2, 0, 100);
      toast('⚡ Your lightning talk slapped. +' + g + ' followers, +rep', 'good');
    } });
    add('hall_keynote', { obj: 'hall:floor', group: 'Onchain Summit 🎤', label: 'Attend the keynotes', emoji: '🎤', mins: 120, cost: 0.05, fx: { social: 20, fun: 10, energy: -10 }, req: needEvent('summit'), done: () => {
      attend('summit'); S.flags.alpha = true; Sim.addXP('trader', 20); Sim.addXP('builder', 20); meetCrowd('hall', 1);
      toast('🎤 Keynotes done. Your notes are pure alpha (next thread boosted).', 'good');
    } });
    add('hall_panel', { obj: 'hall:stage', group: 'Onchain Summit 🎤', label: 'Speak on a panel', emoji: '🗣️', mins: 90, fx: { energy: -15, social: 25, fun: 10 }, work: true, minFollowers: 1000, req: needEvent('summit'), done: () => {
      attend('summit'); const g = Math.round(randInt(120, 300) * H.scale() * H.quality()); addFollowers(g); S.stats.rep = clamp(S.stats.rep + 5, 0, 100); S.stats.clout = clamp(S.stats.clout + 12, 0, 100);
      toast('🗣️ Panel went great. +' + g + ' followers and a lot of "great panel ser" DMs', 'good'); meetCrowd('hall', 2);
    } });
    add('hall_booths', { obj: 'hall:booths', group: 'Onchain Summit 🎤', label: 'Work the sponsor booths', emoji: '🎟️', mins: 90, fx: { social: 25, energy: -12, fun: 5 }, req: needEvent('summit'), done: () => {
      attend('summit'); if (!giveWLRandom('A booth')) toast('🎟️ Collected 9 lanyards and a hoodie.', 'info'); boostFarm(randInt(80, 200), 'a booth quest');
      if (R() < 0.35) { const o = H.makeOffer('normal', true); if (o) { S.offers.unshift(o); H.emit('gig', {}); toast('💼 A sponsor wants you for a campaign. Check Gigs.', 'good'); } }
    } });
    add('hall_hack', { obj: 'hall:tables', group: 'Hackathon Weekend 🏆', label: 'Hack with a team (6h)', emoji: '🏆', mins: 360, fx: { energy: -38, fun: 12, social: 20, hunger: -20 }, work: true, req: needEvent('hack'), done: () => {
      attend('hack'); Sim.addXP('builder', 110); meetCrowd('hall', 2);
      const p = 0.18 * H.quality() * Sim.focusMult('builder') + Math.min((S.career.xp.builder || 0) / 4000, 0.25);
      if (R() < p) { const prize = earn(rand(3, 7) * S.market); addFollowers(Math.round(randInt(80, 200) * H.scale())); toast('🏆 1st place at the hackathon! ' + Sim.fmtSol(prize) + ' SOL prize', 'good'); sys('@' + S.player.handle + ' won the Hackathon Weekend 🏆', '🏆'); }
      else if (R() < 0.4) { const prize = earn(rand(0.6, 1.6) * S.market); toast('🥈 Runner-up! ' + Sim.fmtSol(prize) + ' SOL', 'good'); }
      else toast('🏆 No prize, but your team wants to keep building. +110 builder XP', 'info');
    } });
    add('hall_judge', { obj: 'hall:stage', group: 'Hackathon Weekend 🏆', label: 'Mentor teams', emoji: '🧑‍🏫', mins: 90, fx: { energy: -8, social: 20 }, minXP: ['builder', 600], req: needEvent('hack'), done: () => {
      attend('hack'); const pay = earn(rand(0.3, 0.8)); S.stats.rep = clamp(S.stats.rep + 3, 0, 100); toast('🧑‍🏫 Mentored 4 teams. ' + Sim.fmtSol(pay) + ' SOL stipend, +rep', 'good'); meetCrowd('hall', 1);
    } });
    add('hall_browse', { obj: 'hall:booths', label: 'Browse the hall (no event)', emoji: '🚶', mins: 30, fx: { fun: 4, social: 4 }, req: needOpen('hall'), done: () => { if (R() < 0.4) meetCrowd('hall', 1); else toast('🎪 Empty hall. Someone is setting up chairs for the next event.', 'info'); } });
    // club
    add('club_dance', { obj: 'club:floor', label: 'Dance', emoji: '💃', mins: 60, fx: { fun: 40, social: 25, energy: -14, hygiene: -12 }, clean: true, req: needOpen('club'), done: () => { if (R() < 0.4) meetCrowd('club', 1); } });
    add('club_drink', { obj: 'club:bar', label: 'Get a drink', emoji: '🍹', mins: 20, cost: 0.03, fx: { fun: 18, social: 10, energy: -4 }, req: needOpen('club') });
    add('club_vip', { obj: 'club:vip', group: 'Whale Party 🐋', label: 'Network with whales (VIP)', emoji: '🐋', mins: 120, cost: 0.1, fx: { social: 35, fun: 25, energy: -15 }, clean: true, req: () => needEvent('whale')() || whaleEntry(), done: () => {
      attend('whale'); unlock('vip'); meetCrowd('club', 2); relChange('whale', 6);
      if (Sim.Market) giveLeak(R() < 0.6 ? 'whale' : 'oracle');
      const g = Math.round(randInt(20, 60) * H.scale()); addFollowers(g);
      toast('🍾 You partied with whales. +' + g + ' followers (the selfie went viral)', 'good');
    } });
    add('club_bottle', { obj: 'club:vip', group: 'Whale Party 🐋', label: 'Pop bottles (flex)', emoji: '🍾', mins: 60, cost: 0.3, fx: { fun: 55, social: 30, energy: -10 }, req: () => needEvent('whale')() || whaleEntry(), done: () => {
      attend('whale'); const g = Math.round(randInt(40, 120) * H.scale()); addFollowers(g); S.stats.clout = clamp(S.stats.clout + 10, 0, 100); S.stats.shill = clamp(S.stats.shill + 2, 0, 100);
      toast('🍾 Bottle flex video: +' + g + ' followers. Some say you are exit liquidity.', 'good');
    } });
    // gym
    add('gym_lift', { obj: 'gym:weights', label: 'Lift weights', emoji: '🏋️', mins: 60, fx: { energy: -14, fun: 12, hygiene: -25, hunger: -10 }, req: needOpen('gym'), done: () => { W.fitUntil = S.t + 1440; toast('💪 Pumped. +6% post quality for 24h.', 'good'); if (R() < 0.3) meetCrowd('gym', 1); } });
    add('gym_cardio', { obj: 'gym:tread', label: 'Treadmill cardio', emoji: '🏃', mins: 45, fx: { energy: -10, fun: 10, hygiene: -20 }, req: needOpen('gym'), done: () => { W.fitUntil = S.t + 1440; toast('🏃 Ran 5k while watching charts. +6% post quality for 24h.', 'good'); } });
    add('gym_shower', { obj: 'gym:shower', label: 'Shower at the gym', emoji: '🚿', mins: 20, fx: { hygiene: 85, fun: 2 }, req: needOpen('gym') });
    // market
    add('mkt_suya', { obj: 'market:stall', label: 'Eat suya & jollof', emoji: '🍢', mins: 30, cost: 0.02, fx: { hunger: 55, fun: 8, social: 4 }, req: needOpen('market') });
    add('mkt_groceries', { obj: 'market:shelves', label: 'Buy groceries (cook at home cheaper)', emoji: '🧺', mins: 25, cost: 0.04, fx: { energy: -3 }, req: needOpen('market'), done: () => { W.groceries = (W.groceries || 0) + 4; toast('🧺 Groceries stocked: ' + W.groceries + ' home-cooked meals (+hunger bonus when cooking).', 'good'); } });
    add('mkt_gist', { obj: 'market:stall', label: 'Gist with the traders', emoji: '🗣️', mins: 30, fx: { social: 15, fun: 8 }, req: needOpen('market'), done: () => { if (R() < 0.35) { S.flags.alpha = true; toast('🗣️ Mama Put says everybody is buying $SOL now. Market sentiment noted (alpha).', 'good'); } else toast('🗣️ Heard 3 conspiracy theories and 1 recipe.', 'info'); if (R() < 0.3) meetCrowd('market', 1); } });
    // bank
    add('bank_rent', { obj: 'bank:teller', label: 'Pay rent now', emoji: '🧾', mins: 15, fx: {}, req: needOpen('bank'), done: () => Sim.payRent() });
    add('bank_advice', { obj: 'bank:teller', label: 'Ask the banker for advice', emoji: '👔', mins: 20, fx: { fun: -2 }, req: needOpen('bank'), done: () => toast(pick(['👔 "Have you considered a fixed deposit at 4%?" You laughed in APY.', '👔 "Crypto is a bubble." He holds 3 BTC. You checked.', '👔 "Diversify." Noted: buying 3 memecoins instead of 1.']), 'info') });
    add('bank_otc', { obj: 'bank:otc', label: 'OTC deal with a desk trader', emoji: '🤝', mins: 40, fx: { social: 6, energy: -4 }, req: () => needOpen('bank')() || (Sim.netWorth() < 3 ? 'OTC desk wants 3+ SOL net worth' : null), done: () => {
      if (!Sim.Market) return;
      const toks = Object.values(Sim.Market.M.tokens).filter((t) => t.sym !== 'SOL' && !t.rugged && t.kind !== 'meme');
      const tok = pick(toks.length ? toks : Object.values(Sim.Market.M.tokens).filter((t) => t.sym !== 'SOL'));
      const size = r2(Math.min(S.stats.sol * 0.3, 2)); if (size < 0.05) { toast('🤝 Not enough liquid SOL for a block.', 'bad'); return; }
      const disc = rand(0.06, 0.14); const usd = size * Sim.Market.solPrice(); const qty = usd / (tok.price * (1 - disc));
      S.stats.sol = r2(S.stats.sol - size); Sim.Market.credit(tok.sym, qty); const h = Sim.Market.M.hold[tok.sym]; h.cost += usd;
      Sim.addXP('trader', 25); toast('🤝 OTC block: ' + Sim.Market.fmtQty(qty) + ' $' + tok.sym + ' at ' + Math.round(disc * 100) + '% below market for ' + size + ' SOL. No slippage.', 'good');
    } });
    // park (in town)
    add('park_grass', { obj: 'park:grass', label: 'Touch grass', emoji: '🌱', mins: 60, fx: { fun: 25, social: 10, energy: 3 }, done: () => { toast('🌱 You touched grass. It was... nice?', 'good'); unlock('grass'); } });
    add('park_bench', { obj: 'park:bench', label: 'Sit & people-watch', emoji: '🪑', mins: 30, fx: { fun: 10, social: 10, energy: 4 }, done: () => { if (R() < 0.4) meetCrowd('park', 1); } });
    add('park_jog', { obj: 'park:jog', label: 'Jog around the park', emoji: '🏃', mins: 40, fx: { energy: -8, fun: 14, hygiene: -18 }, done: () => { W.fitUntil = S.t + 1440; } });
    add('park_ducks', { obj: 'park:pond', label: 'Feed the ducks', emoji: '🦆', mins: 20, fx: { fun: 12 }, done: () => { if (R() < 0.15) { S.flags.alpha = true; toast('🦆 A duck stared at you and you understood the market. (alpha)', 'good'); } } });
    // neighbors
    for (const nh of ['nh1', 'nh2', 'nh3']) {
      const owner = LOTS[nh].owner;
      const home = () => (npcsAt(nh).indexOf(owner) >= 0 ? null : personInfo(owner).name + ' is not home right now');
      add(nh + '_hang', { obj: nh + ':couch', label: 'Hang out with ' + personInfo0(owner).name, emoji: '🛋️', mins: 60, fx: { fun: 20, social: 30 }, req: () => needOpen(nh)() || home(), done: () => { meet(owner); relChange(owner, randInt(6, 12)); toast('🛋️ Good vibes at your neighbor\'s place.', 'good'); if (owner === 'kemi' && R() < 0.5) boostFarm(randInt(40, 120), 'Kemi\'s farming tips'); if (owner === 'dave' && R() < 0.5 && Sim.Market) giveLeak('dave'); if (owner === 'wendy' && R() < 0.4) { S.flags.collab = '@wagmi_wendy'; toast('🎙️ Wendy will co-host your next Space.', 'good'); } } });
      add(nh + '_food', { obj: nh + ':kitchen', label: 'Ask for leftover food', emoji: '🍲', mins: 20, fx: { hunger: 35 }, req: () => needOpen(nh)() || home(), done: () => relChange(owner, rel(owner).rel > 30 ? 1 : -3) });
    }
    // social interactions (with whoever you walked up to)
    for (const k in INTERACTIONS) {
      const it = INTERACTIONS[k];
      L['soc_' + k] = { obj: 'npc', hidden: true, label: it.label, emoji: it.emoji, mins: it.mins, fx: it.fx, outsideOnly: true,
        req: () => (W.talkTo ? null : 'Walk up to someone first'),
        done: () => { if (W.talkTo) interact(W.talkTo, k); W.talkTo = null; } };
    }
    return L;
  };
  function personInfo0(id) { return Sim.Social.PEOPLE.find((p) => p.id === id) || EXTRA.find((p) => p.id === id) || { name: id }; }

  // ---------------- hooks ----------------
  mod.step = function (dt) {
    updateNPCs(dt);
    // romance partner keeps you less lonely
    const so = SO();
    if (so) { let partner = false; for (const id in so.people) if ((so.people[id].romance || 0) >= 60) partner = true; if (partner) S.needs.social = clamp(S.needs.social + 1.2 * dt / 60, 0, 100); }
    if (W.fitUntil > S.t) S.needs.energy = clamp(S.needs.energy + 0.4 * dt / 60, 0, 100);
  };
  mod.hourly = function (sleeping) {
    const so = SO(); if (!so) return;
    // rivals subtweet
    for (const id in so.people) {
      const r = so.people[id];
      if ((r.rival || 0) >= 50 && R() < 0.05) {
        const p = personInfo(id); if (!p) continue;
        const swing = R() < 0.5 ? randInt(5, 30) : -randInt(3, 15); addFollowers(swing);
        feed({ npc: id, name: p.name, handle: p.handle, av: p.av, text: pick(['some people met me IRL and still could not hold a conversation 💀', 'imagine being rude at a meetup and then posting "community first"', 'not naming names but @' + S.player.handle + ' knows', 'ratio this if you have ever been ignored at a meetup']), likes: randInt(100, 900), rts: randInt(10, 120), ratio: swing < 0 });
        toast('🥩 @' + p.handle + ' subtweeted you. ' + (swing >= 0 ? 'Beef engagement: +' + swing + ' followers' : swing + ' followers'), swing >= 0 ? 'info' : 'bad');
      }
      if ((r.romance || 0) >= 60 && !sleeping && R() < 0.06) Sim.Social.receive(id, pick(['thinking about you 💘', 'dinner after you finish that thread? 🍝', 'saw a meme that reminded me of you 😂', 'proud of you, grinder 💜']));
    }
    // events: a heads-up toast the hour before they start
    const t = S.t;
    for (const e of upcomingEvents(4)) if (e.start - t > 0 && e.start - t <= 60) { toast(e.def.emoji + ' ' + e.def.name + ' starts at ' + Sim.fmtClock(e.start) + ' at ' + LOTS[e.def.loc].name + '. Pull up!', 'info'); }
    // whale invite via DM when friendly
    if (!W.invite && rel('whale').rel >= 25 && R() < 0.05) { W.invite = true; Sim.Social.receive('whale', 'you are on the list for the next Whale Party 🐋 do not tell anyone.'); }
  };
  mod.daily = function () {
    const evs = eventsOnDay(Sim.day());
    if (evs.length) sys('Today in town: ' + evs.map((e) => e.def.emoji + ' ' + e.def.name + ' @ ' + LOTS[e.def.loc].name + ' ' + Sim.fmtClock(e.start)).join(' · '), '🗓️');
  };

  // ---------------- travel ----------------
  const RIDE_COST = 0.02, RIDE_MINS = 10;
  function rideCheck() { if (S.stats.sol < RIDE_COST) return 'Need ◎' + RIDE_COST + ' for a ride'; if (S.pending) return 'Deal with your DMs first'; return null; }
  function takeRide(dest) {
    const why = rideCheck(); if (why) { toast(why, 'bad'); return false; }
    S.stats.sol = r2(S.stats.sol - RIDE_COST); W.rides = (W.rides || 0) + 1; unlock('ride');
    Sim.tick(RIDE_MINS);
    toast('🚕 Ride to ' + (LOTS[dest] ? LOTS[dest].name : 'town') + ': ◎' + RIDE_COST + ', ' + RIDE_MINS + ' min.', 'info');
    return true;
  }
  function setScene(sc) {
    const prev = W.scene; W.scene = sc;
    if (sc !== 'home' && prev === 'home') unlock('outside');
    return prev;
  }
  function qualityBonus() { return W && W.fitUntil > S.t ? 1.06 : 1; }

  Sim.World = {
    mod, TW, TH, TT, LOTS, EDGES, PARK_SPOTS, TREES, ROADS_H, ROADS_V, INTERACTIONS, EVENT_DEFS, RIDE_COST, RIDE_MINS,
    walkable, townPath, lotAt, isOpen, hoursLabel, solid,
    npcsAt, npcsInTown, npcLoc, personInfo, rel, meet, interact, schedLoc,
    activeEvents, eventAt, upcomingEvents, eventsOnDay, whaleEntry,
    rideCheck, takeRide, setScene, qualityBonus, placeAll,
    get W() { return W; }, TOWN_IDS, COLORS, HATS,
  };
  Sim.use(mod);
})(typeof window !== 'undefined' ? window : globalThis);
