// Game state: maze position, inventory, flashlight, hover/glow, room transitions, ghosts + hidden health, dark rooms
// (light switch, ceiling light, screamer rooms), lever rooms, HUD state.
// Produces a frame description for Renderer.
import { CONFIG } from './config.js';
import { EXIT } from './world.js';
import { settings } from './settings.js';
import { clueId } from './assets.js';

const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const pickText = (arr) => arr[(Math.random() * arr.length) | 0];
const between = ([a, b]) => a + Math.random() * (b - a);
const perLevel = (arr, level) => (arr?.length ? arr[Math.min(level, arr.length) - 1] : 0);
const now = () => performance.now();
const rad = (deg) => (deg * Math.PI) / 180;

// Painting pose = how far it moved from where it hangs: rotation `ang` (radians, clockwise on screen) around the
// pivot (px, py) (scene px, unmoved coords), then shifted by (dx, dy). toWorld/toLocal map points through it.
const toWorld = (P, x, y) => {
  const c = Math.cos(P.ang), s = Math.sin(P.ang), qx = x - P.px, qy = y - P.py;
  return [P.px + P.dx + c * qx - s * qy, P.py + P.dy + s * qx + c * qy];
};
const toLocal = (P, x, y) => {
  const c = Math.cos(P.ang), s = Math.sin(P.ang), qx = x - P.px - P.dx, qy = y - P.py - P.dy;
  return [P.px + c * qx + s * qy, P.py - s * qx + c * qy];
};
// Torn poster ("rip", see makeRip): its tear field at q = point in the art's box (0..1), without the shader's noise
// (FS_ITEM tearField): 0 at the rip's start point, ~1 at the far corner. Paper below the threshold is gone.
const tearAt = (R, qx, qy) => Math.hypot((qx - R.sx) * R.aspect, qy - R.sy) / R.dmax;
const tearOf = (R) => R.reach * (1 - R.hp / R.max); // threshold after the scratches so far
// What is hidden behind a painting or poster: the sprite id of the item, or null.
// lootId = things you take (key, pills); hiddenId adds the lever clue painted on the wall (assets.js clueId), which
// stays where it is.
const lootId = (e) => (e.key !== undefined ? (e.key === 0 ? 'master_key' : 'key') : e.pill ? 'health' : null);
const hiddenId = (e) => lootId(e) ?? (e.clue ? clueId(e.clue) : null);

const TEXT = {
  locked: ["It's locked.", 'The door is locked.', "It won't open."],
  lockedHint: ['Locked. You have a key, but not for this door.'],
  unlock: ['The key turns. The door opens.'],
  unlockMaster: ['The key turns. There is no way back.'],
  lootFound: ['Something was hidden behind the painting.', 'There is something behind it.'],
  posterLoot: ['Something was hidden under the poster.', 'There is something under the paper.'],
  clueFound: ['Arrows are painted on the wall behind it.', 'Someone painted arrows on the wall.'],
  clueUnder: ['There are arrows painted under the poster.', 'Someone painted arrows under the paper.'],
  posterNothing: ['Nothing under it.', 'Only bare wall underneath.'],
  torn: ['There is nothing left to tear.', 'Only scraps are left.'],
  nothing: ['Nothing behind it.', 'Only dust behind the frame.', 'Nothing.'],
  fell: ['The painting crashes to the floor.', 'It falls and cracks.'],
  searched: ['You already looked behind this one.'],
  lootLeft: ['Something is still there, on the wall.'],
  keyTaken: ['You take the key.'],
  masterTaken: ['You take the key. It is heavy, and gold.'],
  pillTaken: ['You take the pills.'],
  healed: ['You swallow a pill. You feel better.'],
  leverWrong: ['Nothing happens. The levers snap back up.', 'The door does not budge. The levers spring back.'],
  leverRight: ['Something clicks inside the door.', 'The levers lock in place. The door opens.'],
  leversStuck: ["The levers won't move any more."],
  dark: ["It's too dark to see anything.", 'There must be a light switch somewhere.', 'You feel along the wall.'],
  level: (n) => `Level ${n}`,
};

export const floorLineY = () => CONFIG.sceneH * CONFIG.room.floorLine;

// Flashlight flicker when the room comes back (deterministic, cheap). Epilepsy mode: a plain fade.
function flickerIn(t) {
  if (t >= 1) return 1;
  if (settings.epilepsy) return Math.min(1, t * 1.6);
  const on = t > 0.75 || Math.sin(t * 61) + Math.sin(t * 157) < 0.7;
  return (on ? 1 : 0.15) * Math.min(1, t * 1.6);
}

// A light dying: flickers for ghost.lampOffS seconds after t = 0, then off. Used for the flashlight and, when a ghost
// comes, the ceiling light of a lit dark room.
function dying(t) {
  if (t >= CONFIG.ghost.lampOffS) return 0;
  if (settings.epilepsy) return 1 - t / CONFIG.ghost.lampOffS; // a plain fade out
  return Math.sin(t * 97) + Math.sin(t * 41) > 0 ? 1 : 0.12;
}

// A screamer image filling the screen: flashing, jittering and pulsing in size. t = seconds since it appeared.
// Epilepsy mode: shown steady, slowly growing, with no flashing or jitter.
function screamerOverlay(img, t, holdS) {
  const sc = CONFIG.screamer, W = CONFIG.sceneW, H = CONFIG.sceneH;
  if (settings.epilepsy) {
    if (!img) return null;
    const h = H * (1.05 + 0.08 * Math.min(1, t / holdS)), w = (h * (img.naturalWidth || 1)) / (img.naturalHeight || 1);
    return { img, rect: [(W - w) / 2, (H - h) / 2, w, h] };
  }
  if (!img || !((t * sc.flashHz) % 1 < 0.7 || t > holdS * 0.6)) return null;
  const h = H * (1.05 + 0.12 * Math.abs(Math.sin(t * 23)));
  const w = (h * (img.naturalWidth || 1)) / (img.naturalHeight || 1);
  const jx = Math.sin(t * 71) * 25, jy = Math.cos(t * 53) * 18;
  return { img, rect: [(W - w) / 2 + jx, (H - h) / 2 + jy, w, h] };
}

export class Game {
  constructor({ db, assets }) {
    this.db = db;
    this.assets = assets;
    const W = CONFIG.sceneW, H = CONFIG.sceneH;
    this.light = { x: W / 2, y: H / 2, tx: W / 2, ty: H / 2 };
    this.hover = null; // item object | 'back' | null
    this.time = 0;
    this.exposure = 0;
    this.phase = 'in'; // 'in' | 'idle' | 'out' | 'wait' (black between rooms) | 'end' (level card) | 'dead' (screamer)
    this.phaseT = 0;
    this.next = null;  // room index to enter after 'out', or EXIT
    this.world = null;
    this.roomIndex = 0;
    this.room = null;  // { spec, template, bg, items: [...] }
    this.msg = null;   // { text, t }
    this.onRoomChange = null; // (game) => void
    this.onWorldEnd = null;   // (game) => void   called after the "Level N" card: start the next level
    this.onSfx = null;        // (role, delay?) => void   role = key of CONFIG.sfx
    this.onDeath = null;      // (game) => void   called after the screamer: back to the main menu
    this.lastPointer = null;
    // Ghosts. health is hidden (only heard through the heartbeat) and carries over between levels.
    this.health = 1;
    this.pills = 0;       // pills held. Like health, they carry over between levels (main resets both on death)
    this.ghost = null;    // ghost in the current room: { id, sprite, s, x, y, random, t, alpha, cued }
    this.lamp = 1;        // flashlight: 1 on, 0 off (a ghost or a dark room kills it). Multiplies exposure.
    this.lampT = null;    // seconds since the flashlight started dying in this room, or null while it works
    this.ceiling = 0;     // ceiling light of a lit dark room: 0 off .. 1 on
    this.switchT = null;  // seconds since this room's light switch was turned on (Infinity: it already was), or null
    this.jump = null;     // screamer-room jumpscare: { img, t } (t < 0 while it waits for the light), or null
    this.spawnAt = null;  // performance.now() ms when a random ghost appears in this room, or null
    this.fakeAt = null;   // performance.now() ms of the next false alarm in this room, or null (see falseAlarm)
    this.fake = null;     // false alarm running: { t, offS }, or null
    this.wait = 0;        // seconds the screen stays black between rooms after the current door (phase 'wait')
    this.screamer = null; // image shown while dead
  }

  setWorld(world) {
    this.world = world;
    // Progress: keys held (key indices), doors unlocked ("room:item"), paintings moved ("room:item"), items taken
    // from behind paintings ("room:item" of the painting), and each moved painting's resting pose.
    this.keys = [];
    this.unlocked = new Set();
    this.searched = new Set();
    this.taken = new Set();
    this.poses = new Map(); // uid -> { kind: 'tilt' | 'fall', side, px, py, dx, dy, ang, crack? }
    this.rips = new Map();  // uid -> torn poster state (see makeRip)
    this.visited = new Set();
    this.lingering = new Map(); // room -> { id, x, y, goneAt }: random ghosts you escaped, still there for a while
    this.lit = new Set();       // dark rooms whose light switch is on
    this.leverPos = new Map();  // lever room -> [0 | 1 per lever] (0 = up, 1 = down), kept when you leave the room
    this.leverHold = 0;         // seconds left before the levers snap back up after a wrong try
    this.ghost = null;
    this.msg = null;
    this.enterRoom(0);
  }

  enterRoom(i) {
    // Escaping a random ghost: it stays behind in that room for a random while.
    if (this.ghost?.random && this.roomIndex !== i) {
      const { id, x, y } = this.ghost;
      this.lingering.set(this.roomIndex, { id, x, y, goneAt: now() + between(CONFIG.ghost.lingerS) * 1000 });
    }
    this.roomIndex = i;
    this.visited.add(i);
    const spec = this.world.rooms[i];
    const template = this.db.rooms[spec.template] ?? { slots: [] };
    const floorY = floorLineY();
    const items = spec.items.map((e, idx) => {
      const slot = template.slots.find((s) => s.id === e.slot);
      const def = this.db.items[e.item];
      const sprite = this.assets.sprites.get(e.item);
      const s = (def.scale ?? 1) * (slot.scale ?? 1);
      const h = sprite.h * s;
      const onFloor = slot.anchor === 'floor';
      // Floor items stand on the wall/floor line; wall items are pushed up so they never reach the floor.
      const cy = onFloor ? floorY - h / 2 : Math.min(slot.y, floorY - CONFIG.room.wallMargin - h / 2);
      const x0 = slot.x - (sprite.w * s) / 2;
      const y0 = cy - h / 2;
      const it = {
        e, uid: `${i}:${idx}`, id: e.item, def, sprite, s, cx: slot.x, cy, x0, y0,
        depth: def.depth ?? 8, glow: 0, shake: 0,
        // Glow + shadow are cut at the sprite's bottom edge for floor items (no halo spilling onto the floor).
        clip: onFloor ? (sprite.oy + sprite.h) / sprite.th : 2,
        rect: [x0 - sprite.ox * s, y0 - sprite.oy * s, sprite.tw * s, sprite.th * s],
        pose: this.poses.get(`${i}:${idx}`) ?? null, // moved painting: its resting pose (see toWorld)
        anim: null,  // { t, landed } while a painting is slipping/falling
        crack: 0,    // 0..1 cracks drawn on a fallen painting
      };
      if (it.pose?.kind === 'fall') it.crack = 1;
      if (e.lever !== undefined) {
        it.lever = e.lever; // index into leverPos
        it.leverT = 0;      // shown position: 0 up .. 1 down (animates toward leverPos, see update)
        it.leverFast = false;
      }
      if (def.kind === 'poster') {
        it.rip = this.rips.get(it.uid) ?? null; // null until first scratched
        it.tear = it.rip ? tearOf(it.rip) : 0;  // shown tear threshold (animates toward tearOf)
      }
      return it;
    });
    // Items behind moved paintings / scratched posters, not taken yet (drawn behind them, tapped to take).
    const loot = items.filter((it) => (it.pose || it.rip) && !this.taken.has(it.uid))
      .map((it) => (it.rip ? this.makePosterLoot(it) : this.makeLoot(it))).filter(Boolean);
    const sf = this.db.surfaces;
    const bg = {
      wall: this.assets.surfaces.get(spec.wall), wallTile: sf.walls[spec.wall]?.tile ?? 512,
      floor: this.assets.surfaces.get(spec.floor), floorTile: sf.floors[spec.floor]?.tile ?? 512,
    };
    this.room = { spec, template, bg: spec.kind === 'ghost' ? null : bg, items, loot };
    // Lever room: levers start up the first time; afterwards they are where you left them.
    const leverDoor = items.find((it) => it.e.levers);
    if (leverDoor && !this.leverPos.has(i)) this.leverPos.set(i, leverDoor.e.levers.map(() => 0));
    this.leverHold = 0;
    for (const it of items) if (it.lever !== undefined) it.leverT = this.leverPos.get(i)[it.lever];
    this.room.sw = spec.dark ? this.makeSwitch(spec, items) : null;
    this.markExplored();
    this.hover = null;
    this.phase = 'in';
    this.phaseT = 0;
    this.exposure = 0;

    // Dark rooms kill the flashlight on the way in (same cue as a ghost room), unless their light is already on.
    this.ghost = null;
    this.jump = null;
    this.lamp = 1;
    this.lampT = null;
    this.switchT = spec.dark && this.lit.has(i) ? Infinity : null;
    this.ceiling = this.switchT === null ? 0 : 1;
    if (spec.dark) this.killLamp(this.switchT === null);
    // Ghost rooms always hold their ghost; other rooms may still hold a random ghost you escaped from.
    const linger = this.lingering.get(i);
    if (linger && linger.goneAt <= now()) this.lingering.delete(i);
    if (spec.kind === 'ghost') this.summon(spec.ghost, false);
    else if (linger && linger.goneAt > now()) this.summon(linger, true);
    // Random ghost: exponential waiting time, so it can come at any moment (from level ghost.randomPerMin > 0).
    const perMin = perLevel(CONFIG.ghost.randomPerMin, this.world.level ?? 1);
    this.spawnAt = !this.ghost && i !== 0 && spec.kind !== 'ghost' && perMin > 0
      ? now() + (CONFIG.ghost.graceS - Math.log(1 - Math.random()) * (60 / perMin)) * 1000
      : null;
    this.fake = null;
    this.fakeAt = !this.ghost && i !== 0 && spec.kind !== 'ghost' ? this.nextFalseAlarm(CONFIG.falseAlarm.graceS) : null;
    this.onRoomChange?.(this);
  }

  // The game was paused for ms: push the wall-clock timers (random ghost, lingering ghosts) back by as much.
  shiftClock(ms) {
    if (this.spawnAt !== null) this.spawnAt += ms;
    if (this.fakeAt !== null) this.fakeAt += ms;
    for (const l of this.lingering.values()) l.goneAt += ms;
  }

  // performance.now() ms of the earliest wall-clock event in this room (random ghost, false alarm), or null.
  // main.js wakes the sleeping loop then.
  nextTimer() {
    const t = [this.spawnAt, this.fakeAt].filter((x) => x !== null);
    return t.length ? Math.min(...t) : null;
  }

  // A random ghost comes within ms, if one can come in this room at all (the ambience going silent may call it).
  hurryGhost(ms) {
    if (this.spawnAt !== null) this.spawnAt = Math.min(this.spawnAt, now() + ms);
  }

  // When the next false alarm comes: exponential waiting time (CONFIG.falseAlarm.perMin), at least graceS from now.
  nextFalseAlarm(graceS) {
    const perMin = perLevel(CONFIG.falseAlarm.perMin, this.world.level ?? 1);
    return perMin > 0 ? now() + (graceS - Math.log(1 - Math.random()) * (60 / perMin)) * 1000 : null;
  }

  // False alarm: the light flickers and dies exactly as when a ghost comes (same sound), stays off a moment, then
  // flickers back on and nothing happens. Hover is suppressed while it runs, like with a ghost. Also the debug F key.
  falseAlarm() {
    const F = CONFIG.falseAlarm;
    this.fake = { t: 0, offS: between(F.darkS) };
    this.fakeAt = this.nextFalseAlarm(F.graceS + CONFIG.ghost.lampOffS + this.fake.offS + F.backS);
    if (this.hover !== 'back' && this.hover !== 'pill') this.hover = null;
    this.onSfx?.('flashlight');
  }

  // True when a false alarm can start now: a light is on (flashlight, or a lit dark room's ceiling light) and
  // nothing else is going on.
  canFalseAlarm() {
    return this.phase === 'idle' && !this.fake && !this.ghost && !this.jump && !this.inDark()
      && (this.lampT === null || this.ceiling > 0);
  }

  // Light multiplier of a running false alarm (1 = no effect).
  fakeLight() {
    if (!this.fake) return 1;
    const off = CONFIG.ghost.lampOffS, { t, offS } = this.fake;
    if (t < off) return dying(t);
    if (t < off + offS) return 0;
    return flickerIn((t - off - offS) / CONFIG.falseAlarm.backS);
  }

  // The flashlight flickers and dies (see dying()). sfx: play the flashlight sound; otherwise it is simply off.
  killLamp(sfx) {
    if (this.lampT !== null) return;
    this.lampT = sfx ? 0 : Infinity;
    this.lamp = sfx ? 1 : 0;
    if (sfx) this.onSfx?.('flashlight');
  }

  // A ghost appears in the current room: the flashlight (and a ceiling light) dies, then the ghost fades in (see update()).
  summon({ id, x, y }, random) {
    const def = this.db.ghosts.ghosts[id];
    const gc = CONFIG.ghost;
    this.ghost = {
      id, x, y, random, sprite: this.assets.sprites.get(id), s: def?.scale ?? 3, t: 0, alpha: 0, cued: false,
      delay: between(gc.fadeDelayS), fadeIn: between(gc.fadeInS), // rolled per appearance (see CONFIG.ghost)
    };
    this.spawnAt = null;
    this.fake = null;
    this.fakeAt = null;
    if (this.hover !== 'back') this.hover = null;
    if (this.lampT === null) this.killLamp(true);
    else if (this.ceiling > 0) this.onSfx?.('flashlight'); // the ceiling light goes out instead
    this.onRoomChange?.(this);
  }

  // Light switch of a dark room: somewhere on the wall, clear of the room's doors and paintings. spec.dark.switchAt
  // (seeded) picks one of the free spots, so the switch is always in the same place. Same shape as a room item.
  makeSwitch(spec, items) {
    const sprite = this.assets.sprites.get('light_switch');
    if (!sprite) return null;
    const D = CONFIG.darkRooms, def = this.db.items.light_switch ?? {}, s = def.scale ?? 1;
    const w = sprite.w * s, h = sprite.h * s, m = D.switchMargin, edge = 120;
    const boxes = items.map((it) => [it.x0, it.y0, it.x0 + it.sprite.w * it.s, it.y0 + it.sprite.h * it.s]);
    const free = (x, y) => boxes.every(([x0, y0, x1, y1]) =>
      x + w / 2 + m <= x0 || x - w / 2 - m >= x1 || y + h / 2 + m <= y0 || y - h / 2 - m >= y1);
    let spots = [];
    for (const y of D.switchY) {
      for (let x = edge; x <= CONFIG.sceneW - edge; x += 10) if (free(x, y)) spots.push([x, y]);
      if (spots.length) break;
    }
    const u = spec.dark.switchAt;
    const [cx, cy] = spots.length ? spots[Math.min(spots.length - 1, Math.floor(u * spots.length))]
      : [edge + u * (CONFIG.sceneW - 2 * edge), D.switchY[0]];
    const x0 = cx - w / 2, y0 = cy - h / 2;
    return {
      lightSwitch: true, id: 'light_switch', sprite, s, cx, cy, x0, y0, depth: def.depth ?? 1, glow: 0, shake: 0, clip: 2,
      rect: [x0 - sprite.ox * s, y0 - sprite.oy * s, sprite.tw * s, sprite.th * s],
    };
  }

  // True while the current room is dark and its light is still off: only the switch (and the HUD) can be used.
  inDark() {
    return !!this.room?.spec.dark && !this.lit.has(this.roomIndex);
  }

  // The light switch is tapped: the ceiling light flickers on (the flashlight stays dead). In a screamer room a
  // screamer jumps out right after.
  turnOnLight() {
    this.lit.add(this.roomIndex);
    this.switchT = 0;
    this.hover = null;
    this.onSfx?.('lightSwitch');
    if (this.room.spec.dark.screamer) this.jump = { img: this.pickScreamer(), t: -CONFIG.darkRooms.screamerDelayS };
    this.markExplored();
    // Things under a resting pointer can glow now.
    if (this.lastPointer) this.pointerMove(this.lastPointer.p, this.lastPointer.kind);
    this.onRoomChange?.(this);
  }

  pickScreamer() {
    const imgs = [...this.assets.screamers.values()];
    return imgs[(Math.random() * imgs.length) | 0] ?? null;
  }

  // Random ghost now (also the debug G key). Not in the first room of a level.
  spawnRandomGhost() {
    if (this.ghost || this.roomIndex === 0 || this.phase === 'dead') return;
    const ids = Object.keys(this.db.ghosts.ghosts);
    this.summon({ id: ids[(Math.random() * ids.length) | 0], x: 360 + Math.random() * 1200, y: 380 + Math.random() * 240 }, true);
  }

  die() {
    this.health = 0;
    this.phase = 'dead';
    this.phaseT = 0;
    this.ghost = null;
    this.spawnAt = null;
    this.fake = null;
    this.fakeAt = null;
    this.msg = null;
    this.hover = null;
    this.jump = null;
    this.screamer = this.pickScreamer();
    this.onSfx?.('screamer');
  }

  // The item hidden behind painting `it` (a key or pills), placed on the wall near the top of the painting on the
  // `side` (-1 left, 1 right) that swings down. Same shape as a room item, plus `painting`. null if nothing is hidden.
  makeLoot(it, side = it.pose?.side ?? 1) {
    const id = hiddenId(it.e);
    const sprite = id && this.assets.sprites.get(id);
    if (!sprite) return null;
    const P = CONFIG.paintings, s = this.lootScale(it, id), b = sprite.box;
    const pw = it.sprite.w * it.s, lw = (b[2] - b[0]) * s, lh = (b[3] - b[1]) * s;
    // Centre of the visible part of the art: as far to the side as fits inside the painting, but not past 30%.
    const off = Math.max(0, Math.min(pw * 0.3, pw / 2 - lw / 2 - P.lootTop));
    return this.placeLoot(it, id, it.cx + side * off, it.y0 + P.lootTop + lh / 2);
  }

  // Loot item `id` with its visible box centred on (vx, vy), hidden behind room item `it` (stored as .painting,
  // whether it is a painting or a poster).
  placeLoot(it, id, vx, vy) {
    const sprite = this.assets.sprites.get(id), s = this.lootScale(it, id), b = sprite.box;
    const lw = (b[2] - b[0]) * s, lh = (b[3] - b[1]) * s;
    // Sprite origin so the visible box lands centred on (vx, vy).
    const x0 = vx - ((b[0] + b[2]) / 2) * s, y0 = vy - ((b[1] + b[3]) / 2) * s;
    const clue = !!it.e.clue && !lootId(it.e); // painted on the wall: no shadow, can't be taken
    return {
      painting: it, id, sprite, s, cx: vx, cy: vy, x0, y0, clue, glow: 0, shake: 0,
      depth: clue ? 0 : this.db.items[id]?.depth ?? 3,
      clip: 2, box: [vx - lw / 2, vy - lh / 2, vx + lw / 2, vy + lh / 2],
      rect: [x0 - sprite.ox * s, y0 - sprite.oy * s, sprite.tw * s, sprite.th * s],
    };
  }

  // Scale of hidden item `id` behind room item `it`. The lever clue shrinks to fit inside the painting/poster.
  lootScale(it, id) {
    if (!it.e.clue || lootId(it.e)) return this.db.items[id]?.scale ?? 1;
    const C = CONFIG.levers.clue, b = this.assets.sprites.get(id).box, pb = it.sprite.box;
    return Math.min(C.scale, (C.fit[0] * (pb[2] - pb[0]) * it.s) / (b[2] - b[0]), (C.fit[1] * (pb[3] - pb[1]) * it.s) / (b[3] - b[1]));
  }

  // A poster's tear state, rolled on its first scratch (Math.random, like the paintings' poses):
  //   hp / max      scratches left / total (CONFIG.posters.scratches)
  //   sx, sy        where the rip starts, on the edge of the art's box (box coords 0..1)
  //   aspect, dmax  box w/h; distance from the start to the farthest corner (normalises the tear field to ~0..1)
  //   reach         tear threshold once destroyed (1 - leftover, or more so the loot is always uncovered by then)
  //   lu, lv, need  hidden item centre (box coords) and the threshold at which it is fully uncovered
  //   seed          shape of the jagged edge
  makeRip(it) {
    const C = CONFIG.posters, b = it.sprite.box, aspect = (b[2] - b[0]) / (b[3] - b[1]);
    const max = C.scratches[0] + Math.floor(Math.random() * (C.scratches[1] - C.scratches[0] + 1));
    const t = Math.random(), edge = (Math.random() * 4) | 0;
    const [sx, sy] = [[t, 0], [1, t], [t, 1], [0, t]][edge];
    const dmax = Math.max(...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => Math.hypot((x - sx) * aspect, y - sy)));
    const R = { hp: max, max, sx, sy, aspect, dmax, reach: 1 - C.leftover, seed: Math.random() * 100, lu: 0.5, lv: 0.5, need: 0 };
    const id = hiddenId(it.e), ls = id && this.assets.sprites.get(id);
    if (ls) {
      // Loot size in box units, then the spot (on a grid inside the poster) whose uncovering threshold is closest to a
      // random share of the tear. The noise can push the edge jagged/2 further, so that is added as a margin.
      const s = this.lootScale(it, id), lb = ls.box;
      const lw = ((lb[2] - lb[0]) * s) / ((b[2] - b[0]) * it.s), lh = ((lb[3] - lb[1]) * s) / ((b[3] - b[1]) * it.s);
      const span = (size, i) => (size >= 0.92 ? 0.5 : 0.04 + size / 2 + (i / 6) * (0.92 - size));
      const needAt = (u, v) => C.jagged / 2 + 0.02 + Math.max(...[[-1, -1], [1, -1], [-1, 1], [1, 1]]
        .map(([a, c]) => tearAt(R, u + (a * lw) / 2, v + (c * lh) / 2)));
      const target = between(C.lootAt) * R.reach;
      let best = null;
      for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
        const u = span(lw, i), v = span(lh, j), need = needAt(u, v);
        if (!best || Math.abs(need - target) < Math.abs(best.need - target)) best = { u, v, need };
      }
      Object.assign(R, { lu: best.u, lv: best.v, need: best.need, reach: Math.max(R.reach, best.need) });
    }
    return R;
  }

  // The item hidden under a scratched poster, at its spot from makeRip. null if nothing is hidden.
  makePosterLoot(it) {
    const id = hiddenId(it.e), R = it.rip, b = it.sprite.box;
    if (!id || !this.assets.sprites.get(id)) return null;
    const vx = it.x0 + (b[0] + R.lu * (b[2] - b[0])) * it.s, vy = it.y0 + (b[1] + R.lv * (b[3] - b[1])) * it.s;
    return this.placeLoot(it, id, vx, vy);
  }

  // Tap on a poster: one scratch tears a piece off. The last one destroys it (dull glow, a few scraps stay).
  scratchPoster(it) {
    if (!it.rip) {
      it.rip = this.makeRip(it);
      this.rips.set(it.uid, it.rip);
      const loot = this.makePosterLoot(it);
      if (loot) this.room.loot.push(loot);
    }
    const R = it.rip, hidden = lootId(it.e) && !this.taken.has(it.uid), clue = !!it.e.clue;
    if (R.hp <= 0) return void this.say(pickText(hidden ? TEXT.lootLeft : TEXT.torn));
    const covered = tearOf(R) < R.need;
    R.hp--;
    it.shake = Math.max(it.shake, CONFIG.posters.shake);
    if (R.hp === 0) {
      this.searched.add(it.uid);
      this.markExplored();
      this.onSfx?.('posterTear');
    } else this.onSfx?.('posterScratch');
    if ((hidden || clue) && covered && tearOf(R) >= R.need) this.say(pickText(clue ? TEXT.clueUnder : TEXT.posterLoot));
    else if (R.hp === 0 && !hidden && !clue) this.say(pickText(TEXT.posterNothing));
  }

  // True while the item hidden under poster `it` is still (partly) covered by paper.
  coveredLoot(it) {
    return !!it.rip && it.tear < it.rip.need - 1e-3;
  }

  // Resting pose for a painting that slips off one nail: it hangs from the top corner opposite `side` and swings
  // down on `side`, then slides down until the loot (if any) is uncovered. null if it would end up on the floor.
  tiltPose(it, side, loot) {
    const P = CONFIG.paintings, w = it.sprite.w * it.s, h = it.sprite.h * it.s;
    const pose = { kind: 'tilt', side, px: it.cx - side * w * 0.42, py: it.y0, dx: 0, dy: 0, ang: side * rad(between(P.tiltDeg)) };
    // Every loot corner must end up above the painting's top edge (local y < top - margin). Its local y drops by
    // cos(ang) per px the painting slides down, so the slide needed is linear.
    let need = P.minDrop;
    if (loot) {
      const [x0, y0, x1, y1] = loot.box;
      for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
        const ly = toLocal(pose, x, y)[1];
        need = Math.max(need, (ly - (it.y0 - P.lootMargin)) / Math.cos(pose.ang));
      }
    }
    pose.dy = need;
    const x0 = it.x0, y0 = it.y0, x1 = x0 + w, y1 = y0 + h;
    const lowest = Math.max(...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => toWorld(pose, x, y)[1]));
    return lowest > floorLineY() - 8 ? null : pose;
  }

  // Resting pose for a painting that falls: slightly turned, its lowest corner just below the floor line.
  fallPose(it, side) {
    const P = CONFIG.paintings, w = it.sprite.w * it.s, h = it.sprite.h * it.s;
    const ang = side * rad(between(P.fallDeg)), c = Math.cos(ang), sn = Math.abs(Math.sin(ang));
    return {
      kind: 'fall', side, px: it.cx, py: it.cy, ang,
      dx: (Math.random() - 0.5) * 50,
      dy: floorLineY() + P.floorSink - it.cy - (c * h) / 2 - (sn * w) / 2,
      // Impact point (texture uv) toward the lower corner that hits first, and a seed for the crack pattern.
      crack: [
        (it.sprite.ox + it.sprite.w * (0.5 + side * (0.15 + Math.random() * 0.2))) / it.sprite.tw,
        (it.sprite.oy + it.sprite.h * (0.55 + Math.random() * 0.3)) / it.sprite.th,
        Math.random() * 100,
      ],
    };
  }

  // Tap on a painting that still hangs: it slips (or falls), uncovering whatever is behind it.
  movePainting(it) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const loot = this.makeLoot(it, side);
    let pose = Math.random() < CONFIG.paintings.fallChance ? null : this.tiltPose(it, side, loot);
    if (!pose) pose = this.fallPose(it, side);
    this.poses.set(it.uid, pose);
    it.pose = pose;
    it.anim = { t: 0, landed: false };
    if (loot) this.room.loot.push(loot);
    this.searched.add(it.uid);
    this.markExplored();
    if (pose.kind === 'fall') this.onSfx?.('fall', CONFIG.paintings.fallSfxDelayS);
    else this.onSfx?.('painting');
    // Sometimes a face is waiting behind an empty painting: a quick screamer (no damage), like a screamer room's.
    if (!loot && Math.random() < perLevel(CONFIG.paintings.screamerChance, this.world.level ?? 1)) {
      this.jump = { img: this.pickScreamer(), t: -CONFIG.paintings.screamerDelayS };
      this.hover = null;
      return;
    }
    this.say(pickText(loot?.clue ? TEXT.clueFound : loot ? TEXT.lootFound : pose.kind === 'fall' ? TEXT.fell : TEXT.nothing));
  }

  // True when the current room is a lever room whose door has been opened (its levers stay put from then on).
  leversSolved() {
    const d = this.room.items.find((it) => it.e.levers);
    return !!d && this.unlocked.has(d.uid);
  }

  // Tap on a lever: it flips up or down. Once the door has been opened they are stuck.
  pullLever(it) {
    if (this.leverHold > 0) return;
    if (this.leversSolved()) return void this.say(pickText(TEXT.leversStuck));
    this.leverPos.get(this.roomIndex)[it.lever] ^= 1;
    this.onSfx?.('lever');
  }

  // Tap on a lever door that is still shut: true (and it stays open from now on) when the levers match its
  // combination. Otherwise the door jolts and, after a moment, every lever snaps back up.
  tryLevers(door) {
    const pos = this.leverPos.get(this.roomIndex);
    if (door.e.levers.every((v, i) => v === pos[i])) {
      this.unlocked.add(door.uid);
      this.onSfx?.('leverSuccess');
      this.say(pickText(TEXT.leverRight));
      return true;
    }
    pos.fill(0);
    this.leverHold = CONFIG.levers.resetDelayS;
    for (const it of this.room.items) if (it.lever !== undefined) it.leverFast = true;
    door.shake = 1;
    this.onSfx?.('leverFail');
    this.say(pickText(TEXT.leverWrong));
    return false;
  }

  // The handle of lever `it`, as a room-item-like object for frame(): it turns over its axis from up to down, so it
  // moves along the base's slot on a cosine and looks bigger halfway, where it points at you.
  leverHandle(it) {
    const hs = this.assets.sprites.get('lever_handle');
    if (!hs) return null;
    const C = CONFIG.levers, def = this.db.items.lever_handle ?? {}, b = it.sprite.box, hb = hs.box;
    const th = Math.PI * it.leverT;
    const bx = it.x0 + ((b[0] + b[2]) / 2) * it.s, by = it.y0 + ((b[1] + b[3]) / 2) * it.s;
    const cx = bx, cy = by - C.travel * (b[3] - b[1]) * it.s * Math.cos(th);
    const s = (def.scale ?? it.s) * (1 + C.bulge * Math.sin(th));
    const x0 = cx - ((hb[0] + hb[2]) / 2) * s, y0 = cy - ((hb[1] + hb[3]) / 2) * s;
    return {
      sprite: hs, s, cx, cy, x0, y0, depth: def.depth ?? 4, glow: 0, shake: it.shake, clip: 2, explored: false,
      rect: [x0 - hs.ox * s, y0 - hs.oy * s, hs.tw * s, hs.th * s],
    };
  }

  // Tap on an uncovered key or pills.
  takeLoot(loot) {
    const e = loot.painting.e;
    this.taken.add(loot.painting.uid);
    this.room.loot = this.room.loot.filter((l) => l !== loot);
    if (this.hover === loot) this.hover = null;
    if (e.key !== undefined) {
      this.keys.push(e.key);
      this.say(pickText(e.key === 0 ? TEXT.masterTaken : TEXT.keyTaken));
    } else {
      this.pills++;
      this.say(pickText(TEXT.pillTaken));
    }
    this.onSfx?.('item');
    this.markExplored();
  }

  // Pose of a painting at time t of its animation. Slipping: slides down fast, swings past its rest angle and
  // settles. Falling: accelerates down to the floor, then a small bounce.
  animPose(it) {
    const P = CONFIG.paintings, R = it.pose, t = it.anim.t;
    if (R.kind === 'tilt') {
      const p = Math.min(1, t / P.tiltS), slide = 1 - (1 - Math.min(1, p * 2.5)) ** 3;
      return { ...R, dy: R.dy * slide, ang: R.ang * (1 - Math.exp(-6 * p) * Math.cos(11 * p)) };
    }
    if (t < P.fallS) {
      const p = t / P.fallS;
      return { ...R, dx: R.dx * p, dy: R.dy * p * p, ang: R.ang * p };
    }
    const q = Math.min(1, (t - P.fallS) / P.bounceS), b = Math.sin(Math.PI * q) * (1 - q);
    return { ...R, dy: R.dy - P.bounce * b, ang: R.ang * (1 + 0.3 * b) };
  }

  // Current pose (animated or resting), or null for an item that never moved.
  poseOf(it) {
    return it.pose ? (it.anim ? this.animPose(it) : it.pose) : null;
  }

  // True when nothing is left to find in room r and everything behind it: every painting searched, and every
  // door opened and leading to an explored room. A locked door not yet opened, or the master door, counts as
  // something left. The rooms form a tree, so this terminates; levels are small, so no caching is needed.
  isExplored(r) {
    if (this.world.rooms[r].kind === 'ghost') return this.visited.has(r); // nothing to find, once you know
    if (this.world.rooms[r].dark && !this.lit.has(r)) return false;
    return this.world.rooms[r].items.every((e, idx) => {
      const uid = `${r}:${idx}`;
      if (e.lever !== undefined) return true; // the lever door says whether this room is done
      if (e.to === undefined) return this.searched.has(uid) && (!lootId(e) || this.taken.has(uid));
      if (e.to === EXIT || ((e.lock !== undefined || e.levers) && !this.unlocked.has(uid))) return false;
      return this.isExplored(e.to);
    });
  }

  // Item.explored drives the dull glow. Only taps in this room can change it, so it is refreshed on entry and
  // after a painting is searched.
  markExplored() {
    const leversDone = this.leversSolved();
    for (const it of this.room.items) {
      const e = it.e;
      it.explored = e.lever !== undefined ? leversDone
        : e.to === undefined ? this.searched.has(it.uid)
        : e.to !== EXIT && ((e.lock === undefined && !e.levers) || this.unlocked.has(it.uid)) && this.isExplored(e.to);
    }
  }

  say(text) {
    this.msg = { text, t: 0 };
  }

  // door: leaving through a door (not back, not the master door), which sometimes keeps the screen black a while.
  go(target, door = false) {
    this.next = target;
    this.phase = 'out';
    this.phaseT = 0;
    this.hover = null;
    const tr = CONFIG.transition;
    this.wait = door && target !== EXIT && Math.random() < perLevel(tr.waitChance, this.world.level ?? 1) ? between(tr.waitS) : 0;
  }

  // --- input -------------------------------------------------------------
  pointerMove(p, kind) {
    this.light.tx = p.x;
    this.light.ty = p.y;
    this.lastPointer = { p, kind };
    const h = this.phase === 'idle' && !this.jump ? this.hit(p, kind) : null;
    // With a ghost in the room nothing glows: you have to remember where the doors were.
    this.hover = (this.ghost || this.fake) && h !== 'back' && h !== 'pill' ? null : h;
  }

  pointerDown(p, kind) {
    this.pointerMove(p, kind);
  }

  pointerLeave() {
    this.hover = null;
    this.lastPointer = null;
  }

  tap(p, kind) {
    this.pointerMove(p, kind);
    if (this.phase === 'end') return void this.onWorldEnd?.(this);
    if (this.phase === 'dead') return;
    if (this.phase !== 'idle' || this.jump) return;
    const h = this.hit(p, kind);
    if (!h) {
      if (this.inDark() && !this.msg) this.say(pickText(TEXT.dark));
      return;
    }
    if (h === 'back') return void this.back();
    if (h === 'pill') return void this.usePill();
    if (h.lightSwitch) return void this.turnOnLight();
    if (h.painting) return void this.takeLoot(h);
    const e = h.e;
    if (h.lever !== undefined) return void this.pullLever(h);
    if (h.def.kind === 'poster') return void this.scratchPoster(h);
    if (e.to !== undefined) {
      // Door
      if (e.levers && !this.unlocked.has(h.uid) && (this.leverHold > 0 || !this.tryLevers(h))) return;
      if (e.lock !== undefined && !this.unlocked.has(h.uid)) {
        if (!this.keys.includes(e.lock)) {
          h.shake = 1;
          this.onSfx?.('locked');
          this.say(pickText(this.keys.length ? TEXT.lockedHint : TEXT.locked));
          return;
        }
        this.keys = this.keys.filter((k) => k !== e.lock);
        this.unlocked.add(h.uid);
        // The master door ends the level: no way back, the next level is a new world.
        this.say(pickText(e.to === EXIT ? TEXT.unlockMaster : TEXT.unlock));
      }
      this.onSfx?.(e.to === EXIT ? 'levelEnd' : 'door');
      this.go(e.to, true);
      return;
    }
    // Painting: the first tap moves it; after that it only reminds you.
    if (!h.pose) return void this.movePainting(h);
    if (h.anim) return;
    this.say(pickText(lootId(e) && !this.taken.has(h.uid) ? TEXT.lootLeft : TEXT.searched));
  }

  // Go back to the parent room (back arrow or the Space key). Same guards as a tap; false if not possible.
  back() {
    if (this.phase !== 'idle' || this.jump || !this.room || this.room.spec.parent < 0) return false;
    this.onSfx?.('door');
    this.go(this.room.spec.parent);
    return true;
  }

  // Take a pill: heals a fixed share of FULL health, capped at full. Always consumed, even at full health
  // (health is hidden, so the game never tells you it was not needed).
  usePill() {
    if (this.pills <= 0) return;
    this.pills--;
    this.health = Math.min(1, this.health + CONFIG.pills.heal);
    this.say(pickText(TEXT.healed));
    this.onSfx?.('healed');
  }

  _maskAt(it, x, y) {
    const sp = it.sprite, P = this.poseOf(it);
    if (P) [x, y] = toLocal(P, x, y);
    const lx = Math.floor((x - it.x0) / it.s), ly = Math.floor((y - it.y0) / it.s);
    if (!(lx >= 0 && ly >= 0 && lx < sp.w && ly < sp.h && sp.mask[ly * sp.w + lx] === 1)) return false;
    // Torn-away paper is not there any more.
    if (it.tear > 0) {
      const b = sp.box;
      return tearAt(it.rip, (lx + 0.5 - b[0]) / (b[2] - b[0]), (ly + 0.5 - b[1]) / (b[3] - b[1])) >= it.tear;
    }
    return true;
  }

  _hitItem(it, p, kind) {
    if (this._maskAt(it, p.x, p.y)) return true;
    if (kind !== 'touch') return false;
    const r = CONFIG.touchSlop;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      if (this._maskAt(it, p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r)) return true;
    }
    return false;
  }

  // Returns the item under p (topmost = last drawn), uncovered loot (has .painting; checked before the paintings, as
  // it is small and a slipped painting may still touch it), the light switch of an unlit dark room (.lightSwitch),
  // 'back', 'pill' (the HUD pill icon), or null.
  hit(p, kind) {
    if (!this.room) return null;
    const pl = CONFIG.hud.pills;
    if (this.pills > 0 && Math.abs(p.x - pl.x) <= pl.w / 2 && Math.abs(p.y - pl.y) <= pl.h / 2) return 'pill';
    const b = CONFIG.hud.back;
    if (this.room.spec.parent >= 0 && Math.abs(p.x - b.x) <= b.w / 2 && Math.abs(p.y - b.y) <= b.h / 2) return 'back';
    // In the dark only the light switch can be found; once it is on, the switch is just part of the wall.
    if (this.inDark()) return this.room.sw && this._hitItem(this.room.sw, p, kind) ? this.room.sw : null;
    for (const l of this.room.loot) if (!l.clue && !l.painting.anim && !this.coveredLoot(l.painting) && this._hitItem(l, p, kind)) return l;
    const items = this.room.items;
    for (let i = items.length - 1; i >= 0; i--) if (this._hitItem(items[i], p, kind)) return items[i];
    return null;
  }

  // --- simulation ----------------------------------------------------------
  // Returns true while something is animating (main loop keeps rendering).
  update(dt) {
    this.time += dt;
    const L = this.light, f = CONFIG.flashlight, tr = CONFIG.transition;
    L.x = approach(L.x, L.tx, f.follow, dt);
    L.y = approach(L.y, L.ty, f.follow, dt);
    let busy = Math.abs(L.x - L.tx) + Math.abs(L.y - L.ty) > 0.25;
    if (!busy) { L.x = L.tx; L.y = L.ty; }

    if (this.phase === 'out') {
      const win = this.next === EXIT;
      this.phaseT += dt / (win ? tr.winOutS : tr.outS);
      this.exposure = 1 - Math.min(1, this.phaseT) ** 2;
      if (this.phaseT >= 1) {
        if (win) {
          this.phase = 'end';
          this.phaseT = 0;
          this.exposure = 0;
          this.msg = null;
        } else if (this.wait > 0) {
          this.phase = 'wait';
          this.phaseT = 0;
          this.exposure = 0;
          this.onSfx?.('doorWait');
        } else this.enterRoom(this.next);
      }
      busy = true;
    } else if (this.phase === 'wait') {
      // Black between rooms, a little longer than usual (see go()).
      this.phaseT += dt;
      if (this.phaseT >= this.wait) this.enterRoom(this.next);
      busy = true;
    } else if (this.phase === 'in') {
      this.phaseT += dt / tr.inS;
      this.exposure = flickerIn(this.phaseT);
      if (this.phaseT >= 1) {
        this.phase = 'idle';
        this.exposure = 1;
        // Re-evaluate hover in case the pointer is already resting on something.
        if (this.lastPointer) this.hover = this.hit(this.lastPointer.p, this.lastPointer.kind);
      }
      busy = true;
    } else if (this.phase === 'end') {
      this.phaseT += dt;
      if (this.phaseT >= tr.winHoldS) this.onWorldEnd?.(this);
      busy = true;
    } else if (this.phase === 'dead') {
      this.phaseT += dt;
      if (this.phaseT >= CONFIG.screamer.holdS) this.onDeath?.(this);
      return true;
    }

    // Flashlight dying (ghost or dark room), ceiling light coming on (dark room) and going out (ghost).
    const gc = CONFIG.ghost, D = CONFIG.darkRooms;
    if (this.lampT !== null && this.lampT < gc.lampOffS) {
      this.lampT += dt;
      this.lamp = dying(this.lampT);
      busy = true;
    }
    if (this.switchT !== null) {
      if (this.switchT < D.onS) {
        this.switchT += dt;
        busy = true;
      }
      this.ceiling = flickerIn(this.switchT / D.onS) * (this.ghost ? dying(this.ghost.t) : 1);
    }
    if (this.jump) {
      const J = this.jump, was = J.t;
      J.t += dt;
      if (was < 0 && J.t >= 0) this.onSfx?.('screamerShort');
      if (J.t >= D.screamerS) {
        this.jump = null;
        if (this.lastPointer) this.pointerMove(this.lastPointer.p, this.lastPointer.kind);
      }
      busy = true;
    }

    // Ghosts: random appearance, fade-in, health drain.
    if (!this.ghost && this.spawnAt !== null && this.phase === 'idle' && now() >= this.spawnAt) this.spawnRandomGhost();
    // False alarms: only while a light is on and nothing else is going on; otherwise tried again a bit later.
    if (this.fakeAt !== null && !this.fake && this.phase === 'idle' && now() >= this.fakeAt) {
      if (this.canFalseAlarm()) this.falseAlarm();
      else this.fakeAt = this.nextFalseAlarm(CONFIG.falseAlarm.graceS);
    }
    if (this.fake) {
      this.fake.t += dt;
      if (this.fake.t >= CONFIG.ghost.lampOffS + this.fake.offS + CONFIG.falseAlarm.backS) {
        this.fake = null;
        if (this.lastPointer && this.phase === 'idle') this.pointerMove(this.lastPointer.p, this.lastPointer.kind);
      }
      busy = true;
    }
    if (this.ghost && this.phase !== 'end' && this.phase !== 'wait') {
      const G = this.ghost;
      G.t += dt;
      G.alpha = Math.min(1, Math.max(0, (G.t - G.delay) / G.fadeIn));
      if (!G.cued && G.t >= G.delay) {
        G.cued = true;
        this.onSfx?.('ghostSpotted');
      }
      this.health -= gc.drainPerS * dt;
      if (this.health <= 0) {
        this.die();
        return true;
      }
      busy = true;
    } else if (gc.regenPerS > 0 && this.health < 1 && this.phase !== 'end') {
      this.health = Math.min(1, this.health + gc.regenPerS * dt);
      busy = true;
    }

    const P = CONFIG.paintings;
    for (const it of this.room.items) {
      if (!it.anim) continue;
      it.anim.t += dt;
      busy = true;
      if (it.pose.kind === 'fall' && !it.anim.landed && it.anim.t >= P.fallS) {
        it.anim.landed = true; // impact: it cracks and shakes
        it.crack = 1;
        it.shake = 1;
      }
      if (it.anim.t >= (it.pose.kind === 'fall' ? P.fallS + P.bounceS : P.tiltS)) {
        it.anim = null;
        // The loot becomes tappable now: refresh hover under a resting pointer.
        if (this.lastPointer && this.phase === 'idle') this.pointerMove(this.lastPointer.p, this.lastPointer.kind);
      }
    }

    // Levers: each handle turns toward its position (after a wrong try: waits, then all snap up fast).
    if (this.leverHold > 0) {
      this.leverHold -= dt;
      busy = true;
    } else {
      const pos = this.leverPos.get(this.roomIndex);
      for (const it of this.room.items) {
        if (it.lever === undefined) continue;
        const target = pos[it.lever];
        if (it.leverT === target) { it.leverFast = false; continue; }
        const step = dt / (it.leverFast ? CONFIG.levers.resetS : CONFIG.levers.pullS);
        it.leverT = target > it.leverT ? Math.min(target, it.leverT + step) : Math.max(target, it.leverT - step);
        busy = true;
      }
    }

    // Posters: each scratch tears its piece off quickly. Once the loot is uncovered it can be hovered.
    for (const it of this.room.items) {
      if (!it.rip) continue;
      const target = tearOf(it.rip);
      if (it.tear === target) continue;
      const was = this.coveredLoot(it);
      it.tear = approach(it.tear, target, 4 / CONFIG.posters.tearS, dt);
      if (target - it.tear < 0.002) it.tear = target;
      if (was && !this.coveredLoot(it) && this.lastPointer && this.phase === 'idle') this.pointerMove(this.lastPointer.p, this.lastPointer.kind);
      busy = true;
    }

    const g = CONFIG.glow;
    const glowing = [...this.room.items, ...this.room.loot];
    if (this.room.sw) glowing.push(this.room.sw);
    for (const it of glowing) {
      const target = this.hover === it ? 1 : 0;
      it.glow = approach(it.glow, target, g.rate, dt);
      if (Math.abs(it.glow - target) < 0.002) it.glow = target;
      if (it.glow > 0) busy = true; // pulsing
      if (it.shake > 0) {
        it.shake = Math.max(0, it.shake - dt / CONFIG.lockedShakeS);
        busy = true;
      }
    }

    if (this.msg) {
      const m = this.msg, h = CONFIG.hud;
      m.t += dt;
      if (m.t > m.text.length / h.textCps + h.messageS) this.msg = null;
      busy = true;
    }
    return busy;
  }

  // HUD state (see Hud.update).
  hudState() {
    const m = this.msg;
    return {
      message: m?.text ?? null,
      chars: m ? Math.min(m.text.length, Math.floor(m.t * CONFIG.hud.textCps)) : 0,
      keys: this.phase === 'dead' ? [] : this.keys.map((k) => ({ door: this.world.keys[k].door, master: k === 0 })),
      back: this.phase !== 'end' && this.phase !== 'dead' && this.room.spec.parent >= 0,
      backHover: this.hover === 'back',
      pills: this.phase === 'dead' || this.phase === 'end' ? 0 : this.pills,
      pillHover: this.hover === 'pill',
      title: this.phase === 'end' ? TEXT.level(this.world.level + 1) : null,
      level: this.phase === 'end' || this.phase === 'dead' ? null : this.world.level,
      // Quantized so the HUD is not redrawn for invisible changes while a ghost drains it.
      health: this.phase === 'dead' || this.phase === 'end' ? null : Math.round(Math.max(0, this.health) * 200) / 200,
    };
  }

  frame() {
    const L = this.light, f = CONFIG.flashlight, sh = CONFIG.shadow, g = CONFIG.glow;
    // Screamers (death, or a screamer room's jumpscare) show over black, so the flashing is image vs black. Over the
    // lit room the "off" frames showed a bright room instead and the flashing barely read.
    const scream = this.phase === 'dead' ? screamerOverlay(this.screamer, this.phaseT, CONFIG.screamer.holdS)
      : this.jump && this.jump.t >= 0 ? screamerOverlay(this.jump.img, this.jump.t, CONFIG.darkRooms.screamerS)
      : undefined;
    if (scream !== undefined) {
      return { light: { x: L.x, y: L.y, r: f.radius, exposure: 0 }, bg: null, items: [], overlay: scream };
    }
    // Shadows fall away from whichever light is stronger: the flashlight (held low right) or the ceiling light.
    const fk = this.fakeLight(); // a false alarm dims whichever light is on
    const D = CONFIG.darkRooms, ceil = this.exposure * this.ceiling * fk, flash = this.exposure * this.lamp * fk;
    const [srcX, srcY] = ceil > flash ? [D.light.x, D.light.y] : [L.x + f.handOffset[0], L.y + f.handOffset[1]];
    const P = CONFIG.paintings;
    const draw = (it) => {
      const pose = this.poseOf(it);
      const [cx, cy] = pose ? toWorld(pose, it.cx, it.cy) : [it.cx, it.cy];
      let dx = (cx - srcX) * it.depth * sh.perDepth;
      let dy = (cy - srcY) * it.depth * sh.perDepth;
      const len = Math.hypot(dx, dy);
      if (len > sh.maxOffset) { dx *= sh.maxOffset / len; dy *= sh.maxOffset / len; }
      // The shadow offset is in texture space, so a rotated sprite needs it turned back.
      if (pose) {
        const c = Math.cos(pose.ang), s = Math.sin(pose.ang);
        [dx, dy] = [c * dx + s * dy, -s * dx + c * dy];
      }
      const st = it.explored ? { ...g, ...g.explored } : g;
      const glowA = it.glow * st.strength * (1 - st.pulse + st.pulse * Math.sin(this.time * 4));
      const shakeX = it.shake > 0 ? Math.sin(it.shake * 40) * 10 * it.shake : 0;
      const rect = pose || shakeX
        ? [it.rect[0] + shakeX + (pose?.dx ?? 0), it.rect[1] + (pose?.dy ?? 0), it.rect[2], it.rect[3]]
        : it.rect;
      const out = {
        sprite: it.sprite,
        rect,
        shadow: [dx / it.rect[2], dy / it.rect[3], sh.blurBias + it.depth * sh.blurPerDepth, sh.strength],
        glow: [st.color[0], st.color[1], st.color[2], glowA],
        glowP: [g.bias, st.brighten],
        clip: it.clip,
      };
      // Moved painting: shifted rect, rotated around the shifted pivot.
      if (pose) out.rot = [pose.ang, pose.px + pose.dx + shakeX, pose.py + pose.dy];
      if (it.tear > 0) {
        const R = it.rip, sp = it.sprite, b = sp.box, C = CONFIG.posters;
        out.tear = [[R.sx, R.sy, it.tear, R.seed], [(sp.ox + b[0]) / sp.tw, (sp.oy + b[1]) / sp.th, (b[2] - b[0]) / sp.tw, (b[3] - b[1]) / sp.th],
          [R.aspect, R.dmax, C.jagged, C.rim]];
      }
      if (it.crack > 0) {
        out.crack = [pose.crack[0], pose.crack[1], it.crack, pose.crack[2]];
        out.fx = [0, 1, P.fallenGain, 0];
      }
      return out;
    };
    const items = [];
    if (this.phase !== 'end') {
      // The switch is lit like everything else, so in the dark only its hover glow gives it away.
      if (this.room.sw) items.push(draw(this.room.sw));
      // Loot hangs on the wall behind its painting, so it is drawn first.
      for (const l of this.room.loot) items.push(draw(l));
      for (const it of this.room.items) {
        items.push(draw(it));
        const handle = it.lever !== undefined && this.leverHandle(it); // on top of its base
        if (handle) items.push(draw(handle));
      }
    }
    const G = this.ghost;
    if (G && G.alpha > 0 && this.phase !== 'end' && this.phase !== 'wait') {
      // Self-lit and additive: the art's black background adds nothing, only the face shows.
      const sp = G.sprite, s = G.s, d = CONFIG.ghost.drift;
      const cx = G.x + Math.sin(this.time * 0.7) * d, cy = G.y + Math.sin(this.time * 1.1) * d * 0.6;
      items.push({
        sprite: sp,
        rect: [cx - (sp.w * s) / 2 - sp.ox * s, cy - (sp.h * s) / 2 - sp.oy * s, sp.tw * s, sp.th * s],
        shadow: [0, 0, 0, 0], glow: [0, 0, 0, 0], glowP: [0, 0], clip: 2,
        fx: [1, G.alpha * (settings.epilepsy ? 0.9 : 0.85 + 0.15 * Math.sin(this.time * 9)), CONFIG.ghost.gain, 1],
      });
    }
    const lt = D.light;
    return {
      light: { x: L.x, y: L.y, r: f.radius, exposure: flash, room: [lt.x, lt.y, lt.reach, ceil] },
      bg: this.phase === 'end' ? null : this.room.bg,
      items,
      overlay: null,
    };
  }
}
