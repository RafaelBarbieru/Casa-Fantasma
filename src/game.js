// Game state: maze position, inventory, flashlight, hover/glow, room transitions, ghosts + hidden health, dark rooms
// (light switch, ceiling light, screamer rooms), lever rooms (plain + wired), crooked painting rooms, trapdoor
// rooms, windows + weather (gusts, thunder, faces), HUD state.
// Produces a frame description for Renderer.
import { CONFIG, atLevel } from './config.js';
import { EXIT } from './world.js';
import { settings } from './settings.js';
import { clueId, CORD, TRAP } from './assets.js';
import { L } from './i18n.js';

const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const pickText = (arr) => arr[(Math.random() * arr.length) | 0];
const between = ([a, b]) => a + Math.random() * (b - a);
// Per-level tunables: Game.lv(value) (CONFIG.atLevel at the current world's level).
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
// Crooked room painting: its lean (radians, clockwise) at hang position p (0 straight, 1 right, 2 left).
const hangAngle = (p) => rad(CONFIG.crooked.tiltDeg) * [0, 1, -1][p];

// Player-facing text: src/locales/*.js `game` (i18n.js).
const TEXT = () => L().game;

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

// Lightning brightness 0..1, t = seconds since the thunder: a few hard flashes, then it fades. Epilepsy mode: one soft
// swell and fade, no flashing.
function lightning(t) {
  if (settings.epilepsy) return t < 0.25 ? 0.45 * (t / 0.25) : 0.45 * Math.exp(-(t - 0.25) * 4);
  if (t < 0.06) return 1;
  if (t < 0.13) return 0.1;
  if (t < 0.24) return 0.85;
  if (t < 0.3) return 0.2;
  if (t < 0.36) return 0.6;
  return 0.6 * Math.exp(-(t - 0.36) * 6);
}
const LIGHTNING_S = 1.5; // after this lightning() is ~0

// How shut the shutters are, 0 (open, folded flat) .. 1, t = seconds since the gust began: they swing in faster and
// faster, hit at slamAtS, spring back a little and settle.
function shutK(t) {
  const W = CONFIG.weather, start = W.slamAtS - W.swingS;
  if (t <= start) return 0;
  if (t < W.slamAtS) return ((t - start) / W.swingS) ** 2;
  const q = (t - W.slamAtS) / W.bounceS;
  return q >= 1 ? 1 : 1 - W.bounce * Math.sin(Math.PI * q) * (1 - q);
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
    // Weather (world.weather, CONFIG.weather). Windows are this.room.windows.
    this.gustAt = null;   // performance.now() ms of the next gust in this room (windy, open windows), or null
    this.gust = null;     // gust running: { t, slammed }, or null
    this.thunderAt = null; // performance.now() ms of the next thunder (storm), or null
    this.storm = null;    // lightning running: { t }, or null
    this.face = null;     // a face outside a window: { win: index into room.windows, t }, or null
    this.screamer = null; // image shown while dead
    // This run's stats for the end screen (main resets them per run and sets `at` on START): at = performance.now()
    // when it began (pauses push it forward, see shiftClock), ghosts = ghosts escaped, grams = pills taken (1 g each).
    this.run = { at: now(), ghosts: 0, grams: 0 };
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
    this.hangPos = new Map();   // crooked room -> [0 | 1 | 2 per painting] (straight, right, left), kept like leverPos
    this.shut = new Set();      // rooms whose window shutters the wind has slammed shut
    this.gust = null;
    this.ghost = null;
    this.msg = null;
    this.enterRoom(0);
  }

  enterRoom(i) {
    // Leaving a room with a ghost in it (ghost room, random or lingering one) counts as escaping it.
    if (this.ghost && this.roomIndex !== i) this.run.ghosts++;
    // Escaping a random ghost: it stays behind in that room for a random while.
    if (this.ghost?.random && this.roomIndex !== i) {
      const { id, x, y } = this.ghost;
      this.lingering.set(this.roomIndex, { id, x, y, goneAt: now() + between(CONFIG.ghost.lingerS) * 1000 });
    }
    // Leaving while a gust blows: it still slams that room's shutters behind you.
    if (this.gust && this.roomIndex !== i) this.shut.add(this.roomIndex);
    this.roomIndex = i;
    this.visited.add(i);
    const spec = this.world.rooms[i];
    const template = this.db.rooms[spec.template] ?? { slots: [] };
    const floorY = floorLineY();
    const items = spec.items.map((e, idx) => {
      const slot = template.slots.find((s) => s.id === e.slot);
      const def = this.db.items[e.item];
      const open = e.trap && this.unlocked.has(`${i}:${idx}`);
      const sprite = this.assets.sprites.get(open ? 'trapdoor_open' : e.item);
      let s = (def.scale ?? 1) * (slot.scale ?? 1);
      // Crooked room paintings are shrunk into one box, so tilted neighbours never overlap.
      if (e.hang !== undefined) {
        const b = sprite.box, F = CONFIG.crooked.fit;
        s = Math.min(s, F[0] / (b[2] - b[0]), F[1] / (b[3] - b[1]));
      }
      const h = sprite.h * s;
      const onFloor = slot.anchor === 'floor' && !e.trap;
      // Floor items stand on the wall/floor line; wall items are pushed up so they never reach the floor. A trapdoor
      // lies on the floor: its hole's centre traps.drop below the line.
      const cy = e.trap ? floorY + CONFIG.traps.drop - (TRAP.holeY - sprite.h / 2) * s
        : onFloor ? floorY - h / 2 : Math.min(slot.y, floorY - CONFIG.room.wallMargin - h / 2);
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
      if (e.hang !== undefined) {
        it.hang = e.hang;  // index into hangPos
        it.swing = null;   // { from, t } while it swings to its next position (see hangPose)
      }
      if (def.kind === 'poster') {
        it.rip = this.rips.get(it.uid) ?? null; // null until first scratched
        it.tear = it.rip ? tearOf(it.rip) : 0;  // shown tear threshold (animates toward tearOf)
      }
      return it;
    });
    // Items behind moved paintings / scratched posters, not taken yet (drawn behind them, tapped to take).
    const loot = items.filter((it) => (it.pose || it.rip || (it.e.trap && this.unlocked.has(it.uid))) && !this.taken.has(it.uid))
      .map((it) => (it.rip ? this.makePosterLoot(it) : it.e.trap ? this.makeTrapLoot(it) : this.makeLoot(it))).filter(Boolean);
    const sf = this.db.surfaces;
    const bg = {
      wall: this.assets.surfaces.get(spec.wall), wallTile: sf.walls[spec.wall]?.tile ?? 512,
      floor: this.assets.surfaces.get(spec.floor), floorTile: sf.floors[spec.floor]?.tile ?? 512,
    };
    this.room = { spec, template, bg: spec.kind === 'ghost' ? null : bg, items, loot };
    // Lever room: levers start up the first time; afterwards they are where you left them.
    const leverDoor = items.find((it) => it.e.levers);
    if (leverDoor && !this.leverPos.has(i)) this.leverPos.set(i, leverDoor.e.linked?.slice() ?? leverDoor.e.levers.map(() => 0));
    // Crooked room: the paintings start crooked (world.js scramble), then stay as you left them.
    const hangDoor = items.find((it) => it.e.crooked);
    if (hangDoor && !this.hangPos.has(i)) this.hangPos.set(i, hangDoor.e.crooked.slice());
    this.room.cords = this.makeCords(items);
    this.leverHold = 0;
    for (const it of items) if (it.lever !== undefined) it.leverT = this.leverPos.get(i)[it.lever];
    this.room.windows = (spec.windows ?? []).map((w) => this.makeWindow(w, this.shut.has(i))).filter(Boolean);
    this.room.sw = spec.dark ? this.makeSwitch(spec, [...items, ...this.room.windows]) : null;
    this.markExplored();
    if (!spec.dark || this.lit.has(i)) this.introPuzzle();
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
    // Random ghost: it can come at any moment (from level ghost.randomPerMin > 0), likelier the longer you stay.
    this.spawnAt = !this.ghost && i !== 0 && spec.kind !== 'ghost' ? this.nextRandomGhost() : null;
    this.fake = null;
    this.fakeAt = !this.ghost && i !== 0 && spec.kind !== 'ghost' ? this.nextFalseAlarm(CONFIG.falseAlarm.graceS) : null;
    // Weather: gusts only where a window is still open; thunder anywhere.
    const W = CONFIG.weather, sky = this.world.weather;
    this.gust = null;
    this.storm = null;
    this.face = null;
    this.gustAt = sky === 'windy' && this.outsideOpen() ? this.nextWeather(W.gustPerMin, W.gustGraceS) : null;
    this.thunderAt = sky === 'storm' ? this.nextWeather(W.thunderPerMin, W.thunderGraceS) : null;
    this.onRoomChange?.(this);
  }

  // The last level of the run (CONFIG.levels): its master door ends the game.
  isLastLevel() {
    return (this.world?.level ?? 1) >= CONFIG.levels;
  }

  // A per-level tunable (list or single value, see CONFIG.atLevel) at the current level.
  lv(v) {
    return atLevel(v, this.world?.level ?? 1) ?? 0;
  }

  // The game was paused for ms: push the wall-clock timers (random ghost, lingering ghosts) back by as much.
  shiftClock(ms) {
    if (this.spawnAt !== null) this.spawnAt += ms;
    if (this.fakeAt !== null) this.fakeAt += ms;
    if (this.gustAt !== null) this.gustAt += ms;
    if (this.thunderAt !== null) this.thunderAt += ms;
    for (const l of this.lingering.values()) l.goneAt += ms;
    this.run.at += ms;
  }

  // performance.now() ms of the earliest wall-clock event in this room (random ghost, false alarm, gust, thunder), or
  // null. main.js wakes the sleeping loop then.
  nextTimer() {
    const t = [this.spawnAt, this.fakeAt, this.gustAt, this.thunderAt].filter((x) => x !== null);
    return t.length ? Math.min(...t) : null;
  }

  // A random ghost comes within ms, if one can come in this room at all (the ambience going silent may call it).
  hurryGhost(ms) {
    if (this.spawnAt !== null) this.spawnAt = Math.min(this.spawnAt, now() + ms);
  }

  // When a random ghost comes in a room entered now, or null. The rate starts at randomPerMin and rises by
  // rampPerMin per minute after graceS (hazard r + k*t): solve r*t + k*t²/2 = E, E ~ Exp(1).
  nextRandomGhost() {
    const G = CONFIG.ghost, r = this.lv(G.randomPerMin), k = r > 0 ? this.lv(G.rampPerMin) : 0;
    if (r <= 0) return null;
    const E = -Math.log(1 - Math.random());
    const min = k > 0 ? (Math.sqrt(r * r + 2 * k * E) - r) / k : E / r;
    return now() + (G.graceS + min * 60) * 1000;
  }

  // When the next false alarm comes: exponential waiting time (CONFIG.falseAlarm.perMin), at least graceS from now.
  nextFalseAlarm(graceS) {
    const perMin = this.lv(CONFIG.falseAlarm.perMin);
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

  // When the next gust or thunder comes: exponential waiting time (perMin per level), at least graceS from now.
  nextWeather(perMinList, graceS) {
    const perMin = this.lv(perMinList);
    return perMin > 0 ? now() + (graceS - Math.log(1 - Math.random()) * (60 / perMin)) * 1000 : null;
  }

  // A window of the current room, centred on (x, y) (world.js), pushed up off the floor like a painting. Same shape as
  // a room item (it never glows or reacts to taps), plus close = how shut its shutters are (0..1).
  makeWindow({ x, y }, shut) {
    const sprite = this.assets.sprites.get('window');
    if (!sprite) return null;
    const def = this.db.items.window ?? {}, s = def.scale ?? 1, w = sprite.w * s, h = sprite.h * s;
    const cy = Math.min(y, floorLineY() - CONFIG.room.wallMargin - h / 2), x0 = x - w / 2, y0 = cy - h / 2;
    return {
      win: true, id: 'window', sprite, s, cx: x, cy, x0, y0, depth: def.depth ?? 2, glow: 0, shake: 0, clip: 2,
      explored: false, close: shut ? 1 : 0,
      rect: [x0 - sprite.ox * s, y0 - sprite.oy * s, sprite.tw * s, sprite.th * s],
    };
  }

  // The two shutters of window `w` as room-item-like objects for frame(), each half the frame's width when shut. They
  // hang on the frame's outer edges and grow toward the middle with w.close (the right one is mirrored: negative
  // rect width). None while open.
  shutters(w) {
    const ds = this.assets.sprites.get('window_door');
    if (!ds || w.close < 0.01) return [];
    const b = w.sprite.box, db = ds.box, def = this.db.items.window_door ?? {};
    const left = w.x0 + b[0] * w.s, right = w.x0 + b[2] * w.s, top = w.y0 + b[1] * w.s, h = (b[3] - b[1]) * w.s;
    const sx = ((right - left) / 2 / (db[2] - db[0])) * w.close, sy = h / (db[3] - db[1]);
    return [[left, 1], [right, -1]].map(([hinge, dir]) => {
      const x = hinge - (ds.ox + db[0]) * sx * dir, y = top - (ds.oy + db[1]) * sy;
      const half = ((db[2] - db[0]) * sx) / 2;
      return {
        sprite: ds, s: sy, cx: hinge + dir * half, cy: top + h / 2, depth: def.depth ?? 0, glow: 0, shake: w.shake,
        clip: 2, explored: false, rect: [x, y, ds.tw * sx * dir, ds.th * sy],
      };
    });
  }

  // True when the current room has a window whose shutters are open: outside sounds are clear (main.js).
  outsideOpen() {
    return !!this.room?.windows.length && !this.shut.has(this.roomIndex);
  }

  // True when a gust or thunder can start now (otherwise it is tried again a bit later).
  canWeather() {
    return this.phase === 'idle' && !this.jump && !this.gust && !this.storm;
  }

  // A gust of wind: slamAtS seconds into its sound the shutters of every window here slam shut (see update()). Also
  // the debug W key.
  windGust() {
    if (!this.outsideOpen() || this.gust) return;
    this.gust = { t: 0, slammed: false };
    this.gustAt = null; // the windows will be shut: no more gusts here
    this.onSfx?.('windGust');
    this.onSfx?.('windowClose', CONFIG.weather.slamAtS); // sample-accurate, even if the frame rate stutters
  }

  // Thunder: the lightning lights the room through its open windows, and sometimes a face is outside one of them.
  // Stay escapeS seconds more and a screamer jumps out. Also the debug T key (Shift+T: always a face).
  thunder(forceFace = false) {
    const W = CONFIG.weather;
    this.storm = { t: 0 };
    this.thunderAt = this.world.weather === 'storm' ? this.nextWeather(W.thunderPerMin, W.thunderGraceS) : null;
    this.onSfx?.('thunder');
    const open = this.outsideOpen() ? this.room.windows : [];
    if (open.length && !this.face && !this.ghost && (forceFace || Math.random() < this.lv(W.faceChance)))
      this.face = { win: (Math.random() * open.length) | 0, t: 0 };
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
    this.introPuzzle();
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
    this.gustAt = null;
    this.thunderAt = null;
    this.storm = null;
    this.face = null;
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
    if (R.hp <= 0) return void this.say(pickText(hidden ? TEXT().lootLeft : TEXT().torn));
    const covered = tearOf(R) < R.need;
    R.hp--;
    it.shake = Math.max(it.shake, CONFIG.posters.shake);
    if (R.hp === 0) {
      this.searched.add(it.uid);
      this.markExplored();
      this.onSfx?.('posterTear');
    } else this.onSfx?.('posterScratch');
    if ((hidden || clue) && covered && tearOf(R) >= R.need) this.say(pickText(clue ? TEXT().clueUnder : TEXT().posterLoot));
    else if (R.hp === 0 && !hidden && !clue) this.say(pickText(TEXT().posterNothing));
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
    this.say(pickText(loot?.clue ? TEXT().clueFound : loot ? TEXT().lootFound : pose.kind === 'fall' ? TEXT().fell : TEXT().nothing));
  }

  // The current room's puzzle door (lever room or crooked room), or undefined.
  puzzleDoor(items = this.room.items) {
    return items.find((it) => it.e.levers || it.e.crooked);
  }

  // True when the current room is a puzzle room whose door has been opened (its levers or paintings stay put).
  puzzleSolved() {
    const d = this.puzzleDoor();
    return !!d && this.unlocked.has(d.uid);
  }

  // Wired lever and crooked rooms say what they are when you first see them (entering, or switching the light on),
  // so they are not mistaken for a lever room whose clue you haven't found.
  introPuzzle() {
    const d = this.puzzleDoor();
    if (!d || this.unlocked.has(d.uid)) return;
    if (d.e.trap) this.say(pickText(d.e.linked ? TEXT().trapWired : d.e.crooked ? TEXT().trapCrooked : TEXT().trapLevers));
    else if (d.e.linked) this.say(pickText(TEXT().linkedIntro));
    else if (d.e.crooked) this.say(pickText(TEXT().crookedIntro));
  }

  // A wired lever or crooked room puzzle was just solved: its door unlocks (or its trapdoor opens) by itself.
  solvePuzzle(text, delayS) {
    const d = this.puzzleDoor();
    this.onSfx?.('leverSuccess', delayS);
    if (d.e.trap) return void this.openTrap(d, delayS);
    this.unlocked.add(d.uid);
    this.say(pickText(text));
    this.markExplored();
  }

  // A trapdoor room's puzzle is solved: the trapdoor bangs open, showing what lies inside (or nothing).
  openTrap(it, delayS = 0) {
    this.unlocked.add(it.uid);
    this.searched.add(it.uid);
    it.sprite = this.assets.sprites.get('trapdoor_open') ?? it.sprite; // same size as the shut one: same rect
    it.shake = 1;
    const loot = this.makeTrapLoot(it);
    if (loot) this.room.loot.push(loot);
    this.onSfx?.('door', delayS);
    this.say(pickText(loot ? TEXT().trapLoot : TEXT().trapEmpty));
    this.markExplored();
    if (this.lastPointer) this.pointerMove(this.lastPointer.p, this.lastPointer.kind); // the loot can glow now
  }

  // What lies in an open trapdoor (key, gold key or pills), on the bottom of its hole. null if nothing.
  makeTrapLoot(it) {
    const id = lootId(it.e);
    if (!id || !this.assets.sprites.get(id)) return null;
    return this.placeLoot(it, id, it.cx, it.y0 + TRAP.holeY * it.s);
  }

  // Tap on a trapdoor: shut, it says what opens it (plain levers: it is how you try them, like a lever door); open,
  // it says what is (still) inside.
  tapTrap(it) {
    const e = it.e;
    if (this.unlocked.has(it.uid)) {
      return void this.say(pickText(lootId(e) && !this.taken.has(it.uid) ? TEXT().trapLootLeft : TEXT().trapNothing));
    }
    if (e.crooked) return void this.puzzleShut(it, TEXT().crookedShut);
    if (this.leverHold <= 0) this.tryLevers(it);
  }

  // Tap on a wired lever or crooked room door before its puzzle is solved.
  puzzleShut(door, text) {
    door.shake = 1;
    this.onSfx?.('locked');
    this.say(pickText(text));
  }

  // Tap on a lever: it flips up or down (wired levers flip their neighbours too). Once the door has been opened
  // they are stuck.
  pullLever(it) {
    if (this.leverHold > 0) return;
    if (this.puzzleSolved()) return void this.say(pickText(TEXT().leversStuck));
    const pos = this.leverPos.get(this.roomIndex), d = this.puzzleDoor(), span = d?.e.linked ? 1 : 0;
    for (let k = it.lever - span; k <= it.lever + span; k++) if (k >= 0 && k < pos.length) pos[k] ^= 1;
    this.onSfx?.('lever');
    if (span && d.e.levers.every((v, k) => v === pos[k])) this.solvePuzzle(TEXT().linkedRight, CONFIG.levers.pullS);
  }

  // The nail a crooked room painting hangs from (scene px): top middle of its art.
  nailOf(it) {
    return [it.cx, it.y0 + it.sprite.box[1] * it.s + 6];
  }

  // Pose of a crooked room painting (see toWorld): it leans around its nail by its position; while it swings to
  // the next one it overshoots a little and settles, like a slipped painting.
  hangPose(it) {
    const to = hangAngle(this.hangPos.get(this.roomIndex)[it.hang]), sw = it.swing;
    const p = sw ? Math.min(1, sw.t / CONFIG.crooked.turnS) : 1;
    const ang = sw ? sw.from + (to - sw.from) * (1 - Math.exp(-6 * p) * Math.cos(11 * p)) : to;
    const [px, py] = this.nailOf(it);
    return { kind: 'hang', side: 1, px, py, dx: 0, dy: 0, ang };
  }

  // Tap on a crooked room painting: it and the paintings next to it (tied by the cord) turn one step. Once they
  // all hang straight, the door opens and they stay put.
  turnPainting(it) {
    if (this.puzzleSolved()) return void this.say(pickText(TEXT().crookedStuck));
    const pos = this.hangPos.get(this.roomIndex);
    for (const o of this.room.items) {
      if (o.hang === undefined || Math.abs(o.hang - it.hang) > 1) continue;
      o.swing = { from: this.hangPose(o).ang, t: 0 }; // from where it is shown now (it may still be swinging)
      pos[o.hang] = (pos[o.hang] + 1) % 3;
    }
    this.onSfx?.('painting');
    if (pos.every((v) => v === 0)) this.solvePuzzle(TEXT().crookedRight, CONFIG.crooked.turnS * 0.6);
  }

  // The cords tying a wired lever room's levers, or a crooked room's paintings, to their neighbours: one sagging
  // cord (assets.js addCordSprites, stretched and turned) per pair, as room-item-like objects for frame(). Drawn
  // behind the items, never hit. [] in other rooms.
  makeCords(items) {
    const door = this.puzzleDoor(items);
    if (!door || !(door.e.linked || door.e.crooked)) return [];
    const wire = !!door.e.linked, sp = this.assets.sprites.get(wire ? 'cord:wire' : 'cord:rope');
    if (!sp) return [];
    const at = (it) => {
      if (!wire) return this.nailOf(it);
      const b = it.sprite.box; // lever plate: middle, a little above its bottom edge
      return [it.x0 + ((b[0] + b[2]) / 2) * it.s, it.y0 + (b[3] - CONFIG.cords.leverDrop * (b[3] - b[1])) * it.s];
    };
    const row = items.filter((it) => (wire ? it.e.lever : it.e.hang) !== undefined)
      .sort((a, b) => (wire ? a.e.lever - b.e.lever : a.e.hang - b.e.hang));
    return row.slice(1).map((it, k) => {
      const [ax, ay] = at(row[k]), [bx, by] = at(it), len = Math.hypot(bx - ax, by - ay);
      const s = len / (CORD.x1 - CORD.x0), x0 = ax - CORD.x0 * s, y0 = ay - CORD.y * s;
      return {
        sprite: sp, s, cx: ax + len / 2, cy: ay + (sp.h / 2 - CORD.y) * s, x0, y0, depth: 1, glow: 0, shake: 0, clip: 2,
        explored: false, rect: [x0 - sp.ox * s, y0 - sp.oy * s, sp.tw * s, sp.th * s],
        pose: { kind: 'cord', px: ax, py: ay, dx: 0, dy: 0, ang: Math.atan2(by - ay, bx - ax) },
      };
    });
  }

  // Tap on a lever door that is still shut: true (and it stays open from now on) when the levers match its
  // combination. Otherwise the door jolts and, after a moment, every lever snaps back up. Wired levers open the
  // door by themselves, so trying it only says it is shut.
  tryLevers(door) {
    if (door.e.linked) {
      this.puzzleShut(door, TEXT().linkedShut);
      return false;
    }
    const pos = this.leverPos.get(this.roomIndex);
    if (door.e.levers.every((v, i) => v === pos[i])) {
      this.onSfx?.('leverSuccess');
      if (door.e.trap) {
        this.openTrap(door);
        return true;
      }
      this.unlocked.add(door.uid);
      this.say(pickText(TEXT().leverRight));
      return true;
    }
    pos.fill(0);
    this.leverHold = CONFIG.levers.resetDelayS;
    for (const it of this.room.items) if (it.lever !== undefined) it.leverFast = true;
    door.shake = 1;
    this.onSfx?.('leverFail');
    this.say(pickText(door.e.trap ? TEXT().trapWrong : TEXT().leverWrong));
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
      this.say(pickText(e.key === 0 ? TEXT().masterTaken : TEXT().keyTaken));
    } else {
      this.pills++;
      this.say(pickText(TEXT().pillTaken));
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
    if (it.hang !== undefined) return this.hangPose(it);
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
      if (e.lever !== undefined || e.hang !== undefined) return true; // the puzzle door says whether this room is done
      if (e.to === undefined) return this.searched.has(uid) && (!lootId(e) || this.taken.has(uid));
      if (e.to === EXIT || ((e.lock !== undefined || e.levers || e.crooked) && !this.unlocked.has(uid))) return false;
      return this.isExplored(e.to);
    });
  }

  // Item.explored drives the dull glow. Only taps in this room can change it, so it is refreshed on entry and
  // after a painting is searched.
  markExplored() {
    const solved = this.puzzleSolved();
    for (const it of this.room.items) {
      const e = it.e;
      it.explored = e.lever !== undefined || e.hang !== undefined ? solved
        : e.to === undefined ? this.searched.has(it.uid)
        : e.to !== EXIT && ((e.lock === undefined && !e.levers && !e.crooked) || this.unlocked.has(it.uid)) && this.isExplored(e.to);
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
    this.wait = door && target !== EXIT && Math.random() < this.lv(tr.waitChance) ? between(tr.waitS) : 0;
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
      if (this.inDark() && !this.msg) this.say(pickText(TEXT().dark));
      return;
    }
    if (h === 'back') return void this.back();
    if (h === 'pill') return void this.usePill();
    if (h.lightSwitch) return void this.turnOnLight();
    if (h.painting) return void this.takeLoot(h);
    const e = h.e;
    if (h.lever !== undefined) return void this.pullLever(h);
    if (h.hang !== undefined) return void this.turnPainting(h);
    if (e.trap) return void this.tapTrap(h);
    if (h.def.kind === 'poster') return void this.scratchPoster(h);
    if (e.to !== undefined) {
      // Door
      if (e.levers && !this.unlocked.has(h.uid) && (this.leverHold > 0 || !this.tryLevers(h))) return;
      if (e.crooked && !this.unlocked.has(h.uid)) return void this.puzzleShut(h, TEXT().crookedShut);
      if (e.lock !== undefined && !this.unlocked.has(h.uid)) {
        if (!this.keys.includes(e.lock)) {
          h.shake = 1;
          this.onSfx?.('locked');
          this.say(pickText(this.keys.length ? TEXT().lockedHint : TEXT().locked));
          return;
        }
        this.keys = this.keys.filter((k) => k !== e.lock);
        this.unlocked.add(h.uid);
        // The master door ends the level: no way back, the next level is a new world.
        this.say(pickText(e.to === EXIT ? TEXT().unlockMaster : TEXT().unlock));
      }
      this.onSfx?.(e.to === EXIT ? 'levelEnd' : 'door');
      this.go(e.to, true);
      return;
    }
    // Painting: the first tap moves it; after that it only reminds you.
    if (!h.pose) return void this.movePainting(h);
    if (h.anim) return;
    this.say(pickText(lootId(e) && !this.taken.has(h.uid) ? TEXT().lootLeft : TEXT().searched));
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
    this.run.grams++;
    this.health = Math.min(1, this.health + CONFIG.pills.heal);
    this.say(pickText(TEXT().healed));
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
          if (this.ghost) this.run.ghosts++; // got out through the master door with a ghost behind you
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
    // Weather: gusts slam the shutters, thunder flashes lightning, a face outside waits for you to leave.
    if (this.phase === 'idle') {
      if (this.gustAt !== null && now() >= this.gustAt) {
        if (this.canWeather()) this.windGust();
        else this.gustAt = now() + 2000;
      }
      if (this.thunderAt !== null && now() >= this.thunderAt) {
        if (this.canWeather()) this.thunder();
        else this.thunderAt = now() + 2000;
      }
    }
    if (this.gust) {
      const Gu = this.gust, W = CONFIG.weather;
      Gu.t += dt;
      const k = shutK(Gu.t);
      for (const w of this.room.windows) w.close = k;
      if (!Gu.slammed && Gu.t >= W.slamAtS) {
        Gu.slammed = true; // the bang (sfx windowClose was scheduled for this moment)
        this.shut.add(this.roomIndex);
        for (const w of this.room.windows) w.shake = 0.6;
        this.onRoomChange?.(this); // main.js: muffle the outside now
      }
      if (Gu.t >= W.slamAtS + W.bounceS) this.gust = null;
      busy = true;
    }
    if (this.storm) {
      this.storm.t += dt;
      if (this.storm.t >= LIGHTNING_S) this.storm = null;
      busy = true;
    }
    if (this.face) {
      this.face.t += dt;
      // Still here (not on the way out through a door or back): the face jumps in.
      if (this.face.t >= CONFIG.weather.escapeS && this.phase === 'idle' && !this.jump) {
        this.face = null;
        this.jump = { img: this.pickScreamer(), t: -1e-3 };
        this.hover = null;
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

    // Crooked room paintings swinging to their next position.
    for (const it of this.room.items) {
      if (!it.swing) continue;
      it.swing.t += dt;
      if (it.swing.t >= CONFIG.crooked.turnS) it.swing = null;
      busy = true;
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
    const glowing = [...this.room.items, ...this.room.loot, ...this.room.windows];
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
      title: this.phase === 'end' ? (this.isLastLevel() ? TEXT().escaped : TEXT().level(this.world.level + 1)) : null,
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
    // Windows: sky (self-lit, brighter in lightning), the face if one is out there, shutters, then the frame on top.
    const Wn = CONFIG.windows, bolt = this.storm ? lightning(this.storm.t) : 0;
    const windows = this.phase === 'end' ? [] : this.room.windows;
    const skyGain = this.exposure * (Wn.sky + bolt * Wn.lightning.sky);
    windows.forEach((w, i) => {
      const shakeX = w.shake > 0 ? Math.sin(w.shake * 40) * 10 * w.shake : 0;
      const plain = (id) => {
        const sp = this.assets.sprites.get(id);
        if (sp) items.push({ sprite: sp, rect: [w.rect[0] + shakeX, w.rect[1], w.rect[2], w.rect[3]],
          shadow: [0, 0, 0, 0], glow: [0, 0, 0, 0], glowP: [0, 0], clip: 2, fx: [1, 1, skyGain, 0] });
      };
      plain('window_sky');
      if (this.face?.win === i) plain('window_face');
      for (const sh of this.shutters(w)) items.push(draw(sh));
      items.push(draw(w));
    });
    if (this.phase !== 'end') {
      // The switch is lit like everything else, so in the dark only its hover glow gives it away.
      if (this.room.sw) items.push(draw(this.room.sw));
      // Loot hangs on the wall behind its painting, so it is drawn first (but in front of an open trapdoor's hole).
      for (const l of this.room.loot) if (!l.painting.e.trap) items.push(draw(l));
      for (const c of this.room.cords) items.push(draw(c)); // behind the levers / paintings they tie together
      for (const it of this.room.items) {
        items.push(draw(it));
        const handle = it.lever !== undefined && this.leverHandle(it); // on top of its base
        if (handle) items.push(draw(handle));
      }
      for (const l of this.room.loot) if (l.painting.e.trap) items.push(draw(l));
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
    // Window light: moonlight through the open part of each window (the shutters block it), whiter and much brighter
    // in a lightning flash. One colour for both windows, weighted by moonlight vs lightning.
    const moon = Wn.light.amount, flashA = bolt * Wn.lightning.amount, mix = flashA / (moon + flashA);
    const winColor = Wn.light.color.map((c, k) => c + (Wn.lightning.color[k] - c) * mix);
    const winLights = windows.slice(0, 2).map((w) => [w.cx, w.cy + Wn.light.drop,
      Wn.light.reach * (1 + (Wn.lightning.reach - 1) * bolt), this.exposure * (1 - w.close) * (moon + flashA)]);
    return {
      light: { x: L.x, y: L.y, r: f.radius, exposure: flash, room: [lt.x, lt.y, lt.reach, ceil], windows: winLights, winColor },
      bg: this.phase === 'end' ? null : this.room.bg,
      items,
      overlay: null,
    };
  }
}
