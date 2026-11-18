// Procedural maze generation. Pure data in -> pure data out (no DOM/GL), so a future editor can reuse it.
//
// world = {
//   seed, level, ambience,
//   weather: 'none' | 'windy' | 'storm',  heard through the windows (see 7. below)
//   rooms: [{                         rooms[0] is the start. The rooms form a tree: every room but the
//     kind: 'doors' | 'paintings' | 'ghost' | 'levers',  start has exactly one way in (its parent), which is where
//                                     "back" goes. 'levers' = one door locked by a row of levers (see 6. below)
//     ghost?: { id, x, y },           ghost rooms only: black room, always this ghost (data/ghosts.json id)
//     dark?: { switchAt, screamer? }, dark room: no flashlight, nothing usable until its light switch is on.
//                                     switchAt 0..1 picks the switch's spot among the free ones on the wall.
//                                     screamer: the room is empty (items: []) and a screamer jumps out at the light
//     windows?: [{ x, y }],           painting and ghost rooms only: 1-2 windows, centred on these scene px (free
//                                     painting spots of the room's layout; ghost rooms use the "gallery" layout's)
//     parent: index | -1,
//     stage: n,                       0 = reachable without keys, n = behind locked side door n (debug/editor info)
//     template: roomId,               data/rooms.json layout (slots)
//     wall, floor,                    data/surfaces.json texture ids
//     items: [{ item, slot,           item = data/items.json id, slot = slot id in the template
//               to?: index | EXIT,    doors only: target room (EXIT = the master door: next level)
//               lock?: keyIndex,      doors only: locked until key `lock` is used on it
//               levers?: [0|1, ...],  doors only: opens only with the levers of its room in this combination
//                                     (index = lever, 0 = up, 1 = down; all levers start up)
//               lever?: index,        lever rooms only: lever `index` of the row (left -> right)
//               key?: keyIndex,       paintings only: a key is hidden behind it
//               pill?: true,          paintings only: a pill is hidden behind it (never with a key)
//               clue?: [0|1, ...] }], paintings only: the lever door's combination is painted on the wall behind
//                                     it (never with a key or pill; see 6. below)
//   }],
//   keys: [{ door: itemId, room, at }]  key k opens the door with art `door` in rooms[room]; it is hidden in rooms[at].
// }                                     keys[0] is the MASTER key (opens the exit door).
//
// Layout of a level:
//   1. The open region: the start room plus a few rooms behind unlocked doors.
//   2. The master door (locked, leads to the next level) on an unused door of the open region.
//   3. From level 2 on, locked side doors (maze.sideLocks) on other unused doors, each with a small region behind.
//      Their keys are hidden in the open region. The master key is either in the open region or (masterBehindChance)
//      behind one of the side doors; the other side regions are red herrings.
//   4. Every door left over leads to a decoy painting room or, from level 2 (ghost.roomChance), a ghost room.
//   5. Some rooms are dark (darkRooms.roomChance); a dark room with nothing to find may be a screamer room.
//   6. From level 3 (levers.roomChance), maybe a lever room on an unused open-region door: one door, locked by a
//      random combination of its levers, with a small region behind it that may (levers.masterChance) hold the
//      master key. The lever door never needs a key. Rolled on its own random stream (leverRng).
//      Its combination (levers.clueChance) is painted on the wall behind one painting or poster outside the lever
//      region, picked on another stream of its own (clue).
//   7. The weather (weather.chances), and windows in some painting and ghost rooms (windows.roomChance): never on a
//      wall with a door. Both on a random stream of their own (wrng).
// So a level is always solvable. Each locked door gets a door art no other door in the level uses, so the key
// (whose HUD icon shows that art) clearly names its door.
import { createRng, randomSeed } from './rng.js';

export const EXIT = -1;

const fits = (slot, tag) => (slot.accepts || []).includes(tag);

export function generateWorld(seed, db, {
  ambience = [], avoidAmbience = null, maze = {}, ghost = {}, pills = {}, dark = {}, levers = {}, windows = {},
  weather = { none: 1 }, level = 1,
} = {}) {
  const rng = createRng(seed);
  const perLevel = (arr) => (arr?.length ? arr[Math.min(level, arr.length) - 1] : 0);
  // Lever room: its own stream, always the same number of draws, so it never shifts anything else it doesn't add.
  // A level without one (levels 1-2) gets exactly the layout it had before lever rooms existed.
  const lrng = createRng((seed ^ 0x1e7e25) >>> 0);
  const nLevers = levers.count ?? 5;
  const leverRoll = lrng.next(), leverVaultRoll = lrng.next();
  const combo = Array.from({ length: nLevers }, () => (lrng.next() < 0.5 ? 1 : 0));
  const hasLevers = !!db.rooms.levers && Object.values(db.items).some((d) => (d.placement || []).includes('lever'))
    && leverRoll < perLevel(levers.roomChance);
  const leverVault = hasLevers && leverVaultRoll < (levers.masterChance ?? 0);
  const m = {
    startDoors: 3, doors: [2, 3], paintings: [1, 4], openRooms: [3, 6], sideRooms: [1, 3],
    sideLocks: [0, 1, 2, 3], masterBehindChance: 0.6, doorRoomChance: 0.45, ...maze,
  };
  const range = ([a, b]) => a + rng.int(b - a + 1);
  const sideLocks = m.sideLocks[Math.min(level, m.sideLocks.length) - 1] ?? 0;
  const masterRoll = sideLocks > 0 && rng.next() < m.masterBehindChance;
  const masterBehind = masterRoll && !leverVault; // the lever region is the vault instead
  const nLocks = 1 + sideLocks;
  const leverStage = sideLocks + 1;

  // --- 1. graph
  const rooms = [];
  const open = []; // unassigned doors: { room, door }
  const addRoom = (kind, parent, stage) => {
    const id = rooms.length;
    const r = { kind, parent, stage, doors: [], paintings: [] };
    if (kind === 'doors') {
      const n = parent < 0 ? m.startDoors : range(m.doors);
      for (let i = 0; i < n; i++) {
        r.doors.push({ to: null, lock: null });
        open.push({ room: id, door: i });
      }
    } else if (kind === 'levers') {
      r.doors.push({ to: null, lock: null, levers: combo }); // linked below, never left open
    } else if (kind === 'paintings') {
      const n = range(m.paintings);
      for (let i = 0; i < n; i++) r.paintings.push({ key: null });
    }
    rooms.push(r);
    return id;
  };
  const take = (o) => open.splice(open.indexOf(o), 1);
  const link = (o, kind, stage) => (rooms[o.room].doors[o.door].to = addRoom(kind, o.room, stage));
  const openIn = (stage) => open.filter((o) => rooms[o.room].stage === stage);
  const freePaintings = (stage) => rooms
    .filter((r) => r.kind === 'paintings' && r.stage === stage)
    .reduce((n, r) => n + r.paintings.filter((p) => p.key === null).length, 0);
  const randomKind = () => (rng.next() < m.doorRoomChance ? 'doors' : 'paintings');

  // Grow a region (the rooms of one stage) through its unused doors until it has at least `target` new rooms,
  // `minPaint` free paintings (to hide keys behind) and `minOpen` unused doors (to put locks on).
  const grow = (stage, target, minPaint, minOpen) => {
    for (let k = 0; k < 64; k++) {
      const here = openIn(stage);
      if (!here.length) return;
      if (k >= target && freePaintings(stage) >= minPaint && here.length >= minOpen) return;
      const o = rng.pick(here);
      take(o);
      const left = here.length - 1;
      let kind = randomKind();
      if (k >= target - 1 && freePaintings(stage) < minPaint) kind = 'paintings';
      // Keep enough unused doors for the locks, and never close the region off while it still needs rooms.
      const done = k + 1 >= target && (kind === 'paintings' || freePaintings(stage) >= minPaint);
      if (left < minOpen || (left === 0 && !done)) kind = 'doors';
      link(o, kind, stage);
    }
  };

  addRoom('doors', -1, 0);
  grow(0, range(m.openRooms), sideLocks + (masterBehind || leverVault ? 0 : 1), nLocks + (hasLevers ? 1 : 0));

  const keys = [];
  const lock = (k) => {
    const o = rng.pick(openIn(0));
    take(o);
    rooms[o.room].doors[o.door].lock = k;
    keys[k] = { room: o.room, at: null, door: null };
    return o;
  };
  // Master door (key 0) -> next level.
  const mo = lock(0);
  rooms[mo.room].doors[mo.door].to = EXIT;
  // Side doors (keys 1..sideLocks); one of them may hold the master key.
  const vault = masterBehind ? 1 + rng.int(sideLocks) : -1;
  for (let k = 1; k <= sideLocks; k++) {
    const o = lock(k);
    link(o, k === vault ? 'paintings' : randomKind(), k);
  }
  for (let k = 1; k <= sideLocks; k++) grow(k, range(m.sideRooms) - 1, 0, 0);
  // Lever room (stage 0) on a free open-region door; its lever door leads to region `leverStage`.
  if (hasLevers) {
    const o = rng.pick(openIn(0));
    take(o);
    const lr = link(o, 'levers', 0);
    link({ room: lr, door: 0 }, leverVault ? 'paintings' : randomKind(), leverStage);
    grow(leverStage, range(m.sideRooms) - 1, 0, 0);
  }

  // Hide keys: side keys in the open region, the master key in the open region or in the vault.
  const hide = (k, stage) => {
    const cands = rooms.map((_, i) => i).filter((i) =>
      rooms[i].kind === 'paintings' && rooms[i].stage === stage && rooms[i].paintings.some((p) => p.key === null));
    const untouched = cands.filter((i) => rooms[i].paintings.every((p) => p.key === null));
    const at = rng.pick(untouched.length ? untouched : cands);
    rng.pick(rooms[at].paintings.filter((p) => p.key === null)).key = k;
    keys[k].at = at;
  };
  for (let k = 1; k <= sideLocks; k++) hide(k, 0);
  hide(0, leverVault ? leverStage : masterBehind ? vault : 0);

  // Leftover doors -> decoy painting rooms, or (from level 2) ghost-only rooms. They are dead ends, so they never
  // block the way. A level whose chance is > 0 gets at least one ghost room when it has a leftover door.
  const ghostIds = Object.keys(db.ghosts?.ghosts ?? {});
  const ghostChance = ghostIds.length ? perLevel(ghost.roomChance) : 0;
  const leftovers = open.slice();
  const haunted = new Set();
  if (ghostChance > 0) {
    for (const o of leftovers) if (rng.next() < ghostChance) haunted.add(o);
    if (!haunted.size && leftovers.length) haunted.add(rng.pick(leftovers));
  }
  for (const o of leftovers) {
    take(o);
    link(o, haunted.has(o) ? 'ghost' : 'paintings', rooms[o.room].stage);
  }

  // --- 2. dress: pick templates, slots and art
  const tagged = (tag) => Object.keys(db.items).filter((id) => (db.items[id].placement || []).includes(tag));
  const doorArt = rng.shuffle(tagged('door'));
  const paintArt = tagged('wall');
  const leverArt = tagged('lever');
  // Reserve one unique door art per lock when there are enough doors to go around.
  const reserved = doorArt.length >= nLocks + m.startDoors ? doorArt.slice(0, nLocks) : [];
  const commonDoors = doorArt.slice(reserved.length);
  keys.forEach((k, i) => (k.door = reserved[i] ?? null));

  const walls = Object.keys(db.surfaces?.walls ?? {}), floors = Object.keys(db.surfaces?.floors ?? {});
  const out = [];
  for (const r of rooms) {
    if (r.kind === 'ghost') {
      // Pitch black, nothing but the same ghost every time. x, y = ghost centre (scene px).
      const g = { id: rng.pick(ghostIds), x: 360 + rng.int(1200), y: 380 + rng.int(240) };
      out.push({ kind: 'ghost', parent: r.parent, stage: r.stage, template: null, wall: null, floor: null, items: [], ghost: g });
      continue;
    }
    const tag = r.kind === 'paintings' ? 'wall' : 'door';
    const need = r.kind === 'paintings' ? r.paintings.length : r.doors.length;
    // Lever rooms always use the "levers" layout (its single door slot keeps it out of the other rooms).
    const templates = r.kind === 'levers' ? ['levers']
      : Object.keys(db.rooms).filter((id) => db.rooms[id].slots.filter((s) => fits(s, tag)).length >= need);
    if (!templates.length) throw new Error(`[world] no room template has ${need} "${tag}" slots`);
    const template = rng.pick(templates);
    const all = db.rooms[template].slots.filter((s) => fits(s, tag));
    // Keep the template's slot order (left -> right), just drop some at random.
    const chosen = new Set(rng.shuffle(all).slice(0, need));
    const slots = all.filter((s) => chosen.has(s));
    let items;
    if (r.kind === 'levers') {
      // One lever per lever slot (up to levers.count); the combination covers exactly those.
      const d = r.doors[0], art = rng.pick(leverArt);
      const ls = db.rooms[template].slots.filter((s) => fits(s, 'lever')).slice(0, nLevers);
      items = [{ item: rng.pick(commonDoors), slot: slots[0].id, to: d.to, levers: d.levers.slice(0, ls.length) }];
      ls.forEach((s, i) => items.push({ item: art, slot: s.id, lever: i }));
    } else if (r.kind === 'doors') {
      const used = new Set(r.doors.filter((d) => d.lock !== null && reserved[d.lock]).map((d) => reserved[d.lock]));
      const art = (d) => {
        if (d.lock !== null && reserved[d.lock]) return reserved[d.lock];
        const pick = rng.pick(commonDoors.filter((a) => !used.has(a)));
        used.add(pick);
        return pick;
      };
      items = rng.shuffle(r.doors).map((d, i) => {
        const it = { item: art(d), slot: slots[i].id, to: d.to };
        if (d.lock !== null) it.lock = d.lock;
        return it;
      });
    } else {
      const art = rng.shuffle(paintArt);
      items = r.paintings.map((p, i) => {
        const it = { item: art[i % art.length], slot: slots[i].id };
        if (p.key !== null) it.key = p.key;
        return it;
      });
    }
    // Surfaces: a different wall from the room you came from, so walking through a door visibly changes the room.
    const prev = r.parent >= 0 ? out[r.parent] : null;
    const pickOther = (list, not) => rng.pick(list.length > 1 ? list.filter((x) => x !== not) : list) ?? null;
    const wall = pickOther(walls, prev?.wall), floor = pickOther(floors, null);
    out.push({ kind: r.kind, parent: r.parent, stage: r.stage, template, wall, floor, items });
  }
  // Without reserved art, a key names the art its door happened to get.
  keys.forEach((k, i) => {
    if (!k.door) k.door = out[k.room].items.find((it) => it.lock === i).item;
  });

  // Pills: on their own random stream, so tuning them never changes a seed's layout. Any painting without a key.
  const prng = createRng((seed ^ 0x50111e5) >>> 0);
  const expected = perLevel(pills.perLevel);
  const nPills = Math.floor(expected) + (prng.next() < expected % 1 ? 1 : 0);
  const spots = out.flatMap((r) => (r.kind === 'paintings' ? r.items.filter((it) => it.key === undefined) : []));
  for (const it of prng.shuffle(spots).slice(0, nPills)) it.pill = true;

  // Lever clue: its own stream too (always 2 draws), so it never shifts layouts, pills or dark rooms.
  const crng = createRng((seed ^ 0xc10e5) >>> 0);
  const clueRoll = crng.next(), clueAt = crng.next();
  const leverDoor = out.find((r) => r.kind === 'levers')?.items.find((it) => it.levers);
  if (leverDoor && clueRoll < (levers.clueChance ?? 1)) {
    const spots = out.flatMap((r) => (r.kind === 'paintings' && r.stage !== leverStage
      ? r.items.filter((it) => it.key === undefined && !it.pill) : []));
    if (spots.length) spots[Math.floor(clueAt * spots.length)].clue = leverDoor.levers.slice();
  }

  // Dark rooms: their own random stream as well (3 draws per room, always), so they never shift layouts or pills.
  // Any room but the first and ghost rooms. A dark painting room with no key, pill or clue behind any painting may become
  // a screamer room: emptied, only the light switch left.
  const drng = createRng((seed ^ 0xda4c0de) >>> 0);
  const darkChance = perLevel(dark.roomChance), scareChance = perLevel(dark.screamerChance);
  out.forEach((r, i) => {
    const isDark = drng.next() < darkChance, switchAt = drng.next(), scare = drng.next() < scareChance;
    if (i === 0 || r.kind === 'ghost' || !isDark) return;
    r.dark = { switchAt };
    if (scare && r.kind === 'paintings' && r.items.every((it) => it.key === undefined && !it.pill && !it.clue)) {
      r.dark.screamer = true;
      r.items = [];
    }
  });

  // Weather + windows: their own stream too (1 draw, then 4 per room, always), so they never shift anything else.
  // Windows go in free painting spots, so never on a wall with a door: painting rooms and ghost rooms only.
  const wrng = createRng((seed ^ 0x3171d0) >>> 0);
  const odds = Object.entries(weather).filter(([, w]) => w > 0);
  let roll = wrng.next() * odds.reduce((n, [, w]) => n + w, 0), sky = 'none';
  for (const [k, w] of odds) if ((roll -= w) < 0) { sky = k; break; }
  const wallSlots = (t) => (db.rooms[t]?.slots ?? []).filter((s) => fits(s, 'wall'));
  const ghostSlots = wallSlots(db.rooms.gallery ? 'gallery' : Object.keys(db.rooms).find((t) => wallSlots(t).length));
  out.forEach((r) => {
    const has = wrng.next() < (windows.roomChance ?? 0), two = wrng.next() < (windows.twoChance ?? 0);
    const a = wrng.next(), b = wrng.next();
    if (!has || (r.kind !== 'paintings' && r.kind !== 'ghost')) return;
    const used = new Set(r.items.map((it) => it.slot));
    const free = (r.kind === 'ghost' ? ghostSlots : wallSlots(r.template)).filter((s) => !used.has(s.id));
    if (!free.length) return;
    const first = free[Math.floor(a * free.length)], rest = free.filter((s) => s !== first);
    const picks = two && rest.length ? [first, rest[Math.floor(b * rest.length)]] : [first];
    r.windows = picks.sort((p, q) => p.x - q.x).map((s) => ({ x: s.x, y: s.y }));
  });

  // Picked last so adding/removing loops never changes a seed's layout.
  const loops = ambience.length > 1 ? ambience.filter((a) => a !== avoidAmbience) : ambience;
  return { seed: seed >>> 0, level, ambience: loops.length ? rng.pick(loops) : null, weather: sky, rooms: out, keys };
}

// ?level=N starts at level N (for testing).
export function levelFromUrl() {
  const s = new URLSearchParams(location.search).get('level');
  return s !== null && /^\d+$/.test(s) && Number(s) > 0 ? Number(s) : 1;
}

export function seedFromUrl() {
  const s = new URLSearchParams(location.search).get('seed');
  if (s !== null && /^\d+$/.test(s)) return Number(s) >>> 0;
  return randomSeed();
}
