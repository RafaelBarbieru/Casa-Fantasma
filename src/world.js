// Procedural maze generation. Pure data in -> pure data out (no DOM/GL), so a future editor can reuse it.
//
// world = {
//   seed, level, ambience,
//   rooms: [{                         rooms[0] is the start. The rooms form a tree: every room but the
//     kind: 'doors' | 'paintings',    start has exactly one way in (its parent), which is where "back" goes.
//     parent: index | -1,
//     stage: n,                       0 = reachable without keys, n = behind locked side door n (debug/editor info)
//     template: roomId,               data/rooms.json layout (slots)
//     wall, floor,                    data/surfaces.json texture ids
//     items: [{ item, slot,           item = data/items.json id, slot = slot id in the template
//               to?: index | EXIT,    doors only: target room (EXIT = the master door: next level)
//               lock?: keyIndex,      doors only: locked until key `lock` is used on it
//               key?: keyIndex }],    paintings only: a key is hidden behind it
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
//   4. Every door left over leads to a decoy painting room.
// So a level is always solvable. Each locked door gets a door art no other door in the level uses, so the key
// (whose HUD icon shows that art) clearly names its door.
import { createRng, randomSeed } from './rng.js';

export const EXIT = -1;

const fits = (slot, tag) => (slot.accepts || []).includes(tag);

export function generateWorld(seed, db, { ambience = [], maze = {}, level = 1 } = {}) {
  const rng = createRng(seed);
  const m = {
    startDoors: 3, doors: [2, 3], paintings: [1, 4], openRooms: [3, 6], sideRooms: [1, 3],
    sideLocks: [0, 1, 2, 3], masterBehindChance: 0.6, doorRoomChance: 0.45, ...maze,
  };
  const range = ([a, b]) => a + rng.int(b - a + 1);
  const sideLocks = m.sideLocks[Math.min(level, m.sideLocks.length) - 1] ?? 0;
  const masterBehind = sideLocks > 0 && rng.next() < m.masterBehindChance;
  const nLocks = 1 + sideLocks;

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
    } else {
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
  grow(0, range(m.openRooms), sideLocks + (masterBehind ? 0 : 1), nLocks);

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
  hide(0, masterBehind ? vault : 0);

  // Leftover doors -> decoy painting rooms.
  for (const o of open.slice()) {
    take(o);
    link(o, 'paintings', rooms[o.room].stage);
  }

  // --- 2. dress: pick templates, slots and art
  const tagged = (tag) => Object.keys(db.items).filter((id) => (db.items[id].placement || []).includes(tag));
  const doorArt = rng.shuffle(tagged('door'));
  const paintArt = tagged('wall');
  // Reserve one unique door art per lock when there are enough doors to go around.
  const reserved = doorArt.length >= nLocks + m.startDoors ? doorArt.slice(0, nLocks) : [];
  const commonDoors = doorArt.slice(reserved.length);
  keys.forEach((k, i) => (k.door = reserved[i] ?? null));

  const walls = Object.keys(db.surfaces?.walls ?? {}), floors = Object.keys(db.surfaces?.floors ?? {});
  const out = [];
  for (const r of rooms) {
    const tag = r.kind === 'doors' ? 'door' : 'wall';
    const need = r.kind === 'doors' ? r.doors.length : r.paintings.length;
    const templates = Object.keys(db.rooms).filter((id) => db.rooms[id].slots.filter((s) => fits(s, tag)).length >= need);
    if (!templates.length) throw new Error(`[world] no room template has ${need} "${tag}" slots`);
    const template = rng.pick(templates);
    const all = db.rooms[template].slots.filter((s) => fits(s, tag));
    // Keep the template's slot order (left -> right), just drop some at random.
    const chosen = new Set(rng.shuffle(all).slice(0, need));
    const slots = all.filter((s) => chosen.has(s));
    let items;
    if (r.kind === 'doors') {
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

  // Picked last so adding/removing loops never changes a seed's layout.
  return { seed: seed >>> 0, level, ambience: ambience.length ? rng.pick(ambience) : null, rooms: out, keys };
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
