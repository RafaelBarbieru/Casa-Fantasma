// Procedural maze generation. Pure data in -> pure data out (no DOM/GL), so a future editor can reuse it.
//
// world = {
//   seed, ambience,
//   rooms: [{                         rooms[0] is the start. The rooms form a tree: every room but the
//     kind: 'doors' | 'paintings',    start has exactly one way in (its parent), which is where "back" goes.
//     parent: index | -1,
//     stage: n,                       which key-stage first makes this room reachable (debug/editor info)
//     template: roomId,               data/rooms.json layout (slots)
//     wall, floor,                    data/surfaces.json texture ids
//     items: [{ item, slot,           item = data/items.json id, slot = slot id in the template
//               to?: index | EXIT,    doors only: target room
//               lock?: keyIndex,      doors only: locked until key `lock` is used on it
//               key?: keyIndex }],    paintings only: a key is hidden behind it
//   }],
//   keys: [{ door: itemId, room, at }]  key k opens the door with art `door` in rooms[room]; it is hidden in rooms[at]
// }
//
// Lock-and-key layout, built in stages so it is always solvable:
//   stage s: open up a few rooms behind unlocked doors -> hide key s in one of the new painting rooms ->
//   lock a still-unused door somewhere already reachable with key s. It leads to stage s+1, or is the exit.
// Every door that is left over at the end leads to a decoy painting room.
// Each locked door gets a door art that no other door in the level uses, so the key (whose HUD icon shows that
// art) clearly names its door.
import { createRng, randomSeed } from './rng.js';

export const EXIT = -1;

const fits = (slot, tag) => (slot.accepts || []).includes(tag);

export function generateWorld(seed, db, { ambience = [], maze = {} } = {}) {
  const rng = createRng(seed);
  const m = { locks: 3, startDoors: 3, doors: [2, 3], paintings: [1, 4], roomsPerStage: [2, 4], doorRoomChance: 0.45, ...maze };
  const range = ([a, b]) => a + rng.int(b - a + 1);

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
  const openUpTo = (s) => open.filter((o) => rooms[o.room].stage <= s);

  addRoom('doors', -1, 0);
  const keys = [];
  for (let s = 0; s < m.locks; s++) {
    // Grow this stage's region. Always keep one door free for the lock, and make at least one painting room.
    const target = range(m.roomsPerStage);
    let painted = false;
    for (let k = 0; (k < target || !painted) && k < 32; k++) {
      const here = open.filter((o) => rooms[o.room].stage === s);
      if (!here.length) break;
      const o = rng.pick(here);
      take(o);
      let kind = rng.next() < m.doorRoomChance ? 'doors' : 'paintings';
      if (!painted && k >= target - 1) kind = 'paintings';
      if (!openUpTo(s).length) kind = 'doors';
      link(o, kind, s);
      if (kind === 'paintings') painted = true;
    }

    // Hide key s in a painting room of this stage (prefer one that has no key yet).
    const reachable = rooms.map((_, i) => i).filter((i) => rooms[i].kind === 'paintings' && rooms[i].stage <= s);
    const newest = reachable.filter((i) => rooms[i].stage === s);
    const withFree = (newest.length ? newest : reachable).filter((i) => rooms[i].paintings.some((p) => p.key === null));
    const untouched = withFree.filter((i) => rooms[i].paintings.every((p) => p.key === null));
    const at = rng.pick(untouched.length ? untouched : withFree);
    rng.pick(rooms[at].paintings.filter((p) => p.key === null)).key = s;

    // Lock a door that is reachable now. The last lock is the exit.
    const o = rng.pick(openUpTo(s));
    take(o);
    rooms[o.room].doors[o.door].lock = s;
    keys.push({ room: o.room, at, door: null });
    if (s === m.locks - 1) rooms[o.room].doors[o.door].to = EXIT;
    else link(o, 'doors', s + 1);
  }
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
  const reserved = doorArt.length >= m.locks + m.startDoors ? doorArt.slice(0, m.locks) : [];
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
  return { seed: seed >>> 0, ambience: ambience.length ? rng.pick(ambience) : null, rooms: out, keys };
}

export function seedFromUrl() {
  const s = new URLSearchParams(location.search).get('seed');
  if (s !== null && /^\d+$/.test(s)) return Number(s) >>> 0;
  return randomSeed();
}
