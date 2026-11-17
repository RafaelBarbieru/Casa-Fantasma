// Game state: maze position, inventory, flashlight, hover/glow, room transitions, ghosts + hidden health, HUD state.
// Produces a frame description for Renderer.
import { CONFIG } from './config.js';
import { EXIT } from './world.js';

const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
const pickText = (arr) => arr[(Math.random() * arr.length) | 0];
const between = ([a, b]) => a + Math.random() * (b - a);
const perLevel = (arr, level) => (arr?.length ? arr[Math.min(level, arr.length) - 1] : 0);
const now = () => performance.now();

const TEXT = {
  locked: ["It's locked.", 'The door is locked.', "It won't open."],
  lockedHint: ['Locked. You have a key, but not for this door.'],
  unlock: ['The key turns. The door opens.'],
  unlockMaster: ['The key turns. There is no way back.'],
  keyFound: ['There is a key behind the painting.', 'A key was hidden behind the painting.'],
  nothing: ['Nothing behind it.', 'Only dust behind the frame.', 'Nothing.'],
  searched: ['You already looked behind this one.'],
  pillFound: ['There is a bottle of pills behind the painting.', 'Pills, hidden behind the frame.'],
  healed: ['You swallow a pill. You feel better.'],
  level: (n) => `Level ${n}`,
};

export const floorLineY = () => CONFIG.sceneH * CONFIG.room.floorLine;

// Flashlight flicker when the room comes back (deterministic, cheap).
function flickerIn(t) {
  if (t >= 1) return 1;
  const on = t > 0.75 || Math.sin(t * 61) + Math.sin(t * 157) < 0.7;
  return (on ? 1 : 0.15) * Math.min(1, t * 1.6);
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
    this.phase = 'in'; // 'in' | 'idle' | 'out' | 'end' (level card) | 'dead' (screamer)
    this.phaseT = 0;
    this.next = null;  // room index to enter after 'out', or EXIT
    this.world = null;
    this.roomIndex = 0;
    this.room = null;  // { spec, template, bg, items: [...] }
    this.msg = null;   // { text, t }
    this.onRoomChange = null; // (game) => void
    this.onWorldEnd = null;   // (game) => void   called after the "Level N" card: start the next level
    this.onSfx = null;        // (role, delay?) => void   role = key of CONFIG.sfx
    this.onDeath = null;      // (game) => void   called after the screamer: restart
    this.lastPointer = null;
    // Ghosts. health is hidden (only heard through the heartbeat) and carries over between levels.
    this.health = 1;
    this.pills = 0;       // pills held. Like health, they carry over between levels (main resets both on death)
    this.ghost = null;    // ghost in the current room: { id, sprite, s, x, y, random, t, alpha, cued }
    this.lamp = 1;        // flashlight: 1 on, 0 off (a ghost kills it). Multiplies exposure.
    this.spawnAt = null;  // performance.now() ms when a random ghost appears in this room, or null
    this.screamer = null; // image shown while dead
  }

  setWorld(world) {
    this.world = world;
    // Progress: keys held (key indices), doors unlocked ("room:item"), paintings searched ("room:item").
    this.keys = [];
    this.unlocked = new Set();
    this.searched = new Set();
    this.visited = new Set();
    this.lingering = new Map(); // room -> { id, x, y, goneAt }: random ghosts you escaped, still there for a while
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
      return {
        e, uid: `${i}:${idx}`, id: e.item, def, sprite, s, cx: slot.x, cy, x0, y0,
        depth: def.depth ?? 8, glow: 0, shake: 0,
        // Glow + shadow are cut at the sprite's bottom edge for floor items (no halo spilling onto the floor).
        clip: onFloor ? (sprite.oy + sprite.h) / sprite.th : 2,
        rect: [x0 - sprite.ox * s, y0 - sprite.oy * s, sprite.tw * s, sprite.th * s],
      };
    });
    const sf = this.db.surfaces;
    const bg = {
      wall: this.assets.surfaces.get(spec.wall), wallTile: sf.walls[spec.wall]?.tile ?? 512,
      floor: this.assets.surfaces.get(spec.floor), floorTile: sf.floors[spec.floor]?.tile ?? 512,
    };
    this.room = { spec, template, bg: spec.kind === 'ghost' ? null : bg, items };
    this.markExplored();
    this.hover = null;
    this.phase = 'in';
    this.phaseT = 0;
    this.exposure = 0;

    // Ghost rooms always hold their ghost; other rooms may still hold a random ghost you escaped from.
    this.ghost = null;
    this.lamp = 1;
    const linger = this.lingering.get(i);
    if (linger && linger.goneAt <= now()) this.lingering.delete(i);
    if (spec.kind === 'ghost') this.summon(spec.ghost, false);
    else if (linger && linger.goneAt > now()) this.summon(linger, true);
    // Random ghost: exponential waiting time, so it can come at any moment (from level ghost.randomPerMin > 0).
    const perMin = perLevel(CONFIG.ghost.randomPerMin, this.world.level ?? 1);
    this.spawnAt = !this.ghost && i !== 0 && spec.kind !== 'ghost' && perMin > 0
      ? now() + (CONFIG.ghost.graceS - Math.log(1 - Math.random()) * (60 / perMin)) * 1000
      : null;
    this.onRoomChange?.(this);
  }

  // A ghost appears in the current room: the flashlight dies, then the ghost fades in (see update()).
  summon({ id, x, y }, random) {
    const def = this.db.ghosts.ghosts[id];
    this.ghost = { id, x, y, random, sprite: this.assets.sprites.get(id), s: def?.scale ?? 3, t: 0, alpha: 0, cued: false };
    this.spawnAt = null;
    if (this.hover !== 'back') this.hover = null;
    this.onSfx?.('flashlight');
    this.onRoomChange?.(this);
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
    this.msg = null;
    this.hover = null;
    const imgs = [...this.assets.screamers.values()];
    this.screamer = imgs[(Math.random() * imgs.length) | 0] ?? null;
    this.onSfx?.('screamer');
  }

  // True when nothing is left to find in room r and everything behind it: every painting searched, and every
  // door opened and leading to an explored room. A locked door not yet opened, or the master door, counts as
  // something left. The rooms form a tree, so this terminates; levels are small, so no caching is needed.
  isExplored(r) {
    if (this.world.rooms[r].kind === 'ghost') return this.visited.has(r); // nothing to find, once you know
    return this.world.rooms[r].items.every((e, idx) => {
      const uid = `${r}:${idx}`;
      if (e.to === undefined) return this.searched.has(uid);
      if (e.to === EXIT || (e.lock !== undefined && !this.unlocked.has(uid))) return false;
      return this.isExplored(e.to);
    });
  }

  // Item.explored drives the dull glow. Only taps in this room can change it, so it is refreshed on entry and
  // after a painting is searched.
  markExplored() {
    for (const it of this.room.items) {
      const e = it.e;
      it.explored = e.to === undefined ? this.searched.has(it.uid)
        : e.to !== EXIT && (e.lock === undefined || this.unlocked.has(it.uid)) && this.isExplored(e.to);
    }
  }

  say(text) {
    this.msg = { text, t: 0 };
  }

  go(target) {
    this.next = target;
    this.phase = 'out';
    this.phaseT = 0;
    this.hover = null;
  }

  // --- input -------------------------------------------------------------
  pointerMove(p, kind) {
    this.light.tx = p.x;
    this.light.ty = p.y;
    this.lastPointer = { p, kind };
    const h = this.phase === 'idle' ? this.hit(p, kind) : null;
    // With a ghost in the room nothing glows: you have to remember where the doors were.
    this.hover = this.ghost && h !== 'back' && h !== 'pill' ? null : h;
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
    if (this.phase !== 'idle') return;
    const h = this.hit(p, kind);
    if (!h) return;
    if (h === 'back') {
      this.onSfx?.('door');
      return void this.go(this.room.spec.parent);
    }
    if (h === 'pill') return void this.usePill();
    const e = h.e;
    if (e.to !== undefined) {
      // Door
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
      this.go(e.to);
      return;
    }
    // Painting
    this.onSfx?.('painting');
    if (this.searched.has(h.uid)) {
      this.say(pickText(e.key !== undefined || e.pill ? TEXT.searched : TEXT.nothing));
      return;
    }
    this.searched.add(h.uid);
    this.markExplored();
    if (e.key !== undefined) {
      this.keys.push(e.key);
      this.say(pickText(TEXT.keyFound));
      this.onSfx?.('item', CONFIG.itemSfxDelayS);
    } else if (e.pill) {
      this.pills++;
      this.say(pickText(TEXT.pillFound));
      this.onSfx?.('item', CONFIG.itemSfxDelayS);
    } else {
      this.say(pickText(TEXT.nothing));
    }
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
    const sp = it.sprite;
    const lx = Math.floor((x - it.x0) / it.s), ly = Math.floor((y - it.y0) / it.s);
    return lx >= 0 && ly >= 0 && lx < sp.w && ly < sp.h && sp.mask[ly * sp.w + lx] === 1;
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

  // Returns the item under p (topmost = last drawn), 'back', 'pill' (the HUD pill icon), or null.
  hit(p, kind) {
    if (!this.room) return null;
    const pl = CONFIG.hud.pills;
    if (this.pills > 0 && Math.abs(p.x - pl.x) <= pl.w / 2 && Math.abs(p.y - pl.y) <= pl.h / 2) return 'pill';
    const b = CONFIG.hud.back;
    if (this.room.spec.parent >= 0 && Math.abs(p.x - b.x) <= b.w / 2 && Math.abs(p.y - b.y) <= b.h / 2) return 'back';
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
        } else this.enterRoom(this.next);
      }
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

    // Ghosts: random appearance, flashlight dying, fade-in, health drain.
    const gc = CONFIG.ghost;
    if (!this.ghost && this.spawnAt !== null && this.phase === 'idle' && now() >= this.spawnAt) this.spawnRandomGhost();
    if (this.ghost && this.phase !== 'end') {
      const G = this.ghost;
      G.t += dt;
      this.lamp = G.t < gc.lampOffS ? (Math.sin(G.t * 97) + Math.sin(G.t * 41) > 0 ? 1 : 0.12) : 0;
      G.alpha = Math.min(1, Math.max(0, (G.t - gc.fadeDelayS) / gc.fadeInS));
      if (!G.cued && G.t >= gc.fadeDelayS) {
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

    const g = CONFIG.glow;
    for (const it of this.room.items) {
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
    };
  }

  frame() {
    const L = this.light, f = CONFIG.flashlight, sh = CONFIG.shadow, g = CONFIG.glow;
    if (this.phase === 'dead') {
      // Screamer: flashing on/off, jittering and pulsing in size.
      const t = this.phaseT, sc = CONFIG.screamer;
      const on = (t * sc.flashHz) % 1 < 0.7 || t > sc.holdS * 0.6;
      const size = CONFIG.sceneH * (1.05 + 0.12 * Math.abs(Math.sin(t * 23)));
      const jx = Math.sin(t * 71) * 25, jy = Math.cos(t * 53) * 18;
      return {
        light: { x: L.x, y: L.y, r: f.radius, exposure: 0 },
        bg: null,
        items: [],
        overlay: this.screamer && on
          ? { img: this.screamer, rect: [(CONFIG.sceneW - size) / 2 + jx, (CONFIG.sceneH - size) / 2 + jy, size, size] }
          : null,
      };
    }
    const srcX = L.x + f.handOffset[0], srcY = L.y + f.handOffset[1];
    const items = this.phase === 'end' ? [] : this.room.items.map((it) => {
      let dx = (it.cx - srcX) * it.depth * sh.perDepth;
      let dy = (it.cy - srcY) * it.depth * sh.perDepth;
      const len = Math.hypot(dx, dy);
      if (len > sh.maxOffset) { dx *= sh.maxOffset / len; dy *= sh.maxOffset / len; }
      const st = it.explored ? { ...g, ...g.explored } : g;
      const glowA = it.glow * st.strength * (1 - st.pulse + st.pulse * Math.sin(this.time * 4));
      const rect = it.shake > 0
        ? [it.rect[0] + Math.sin(it.shake * 40) * 10 * it.shake, it.rect[1], it.rect[2], it.rect[3]]
        : it.rect;
      return {
        sprite: it.sprite,
        rect,
        shadow: [dx / it.rect[2], dy / it.rect[3], sh.blurBias + it.depth * sh.blurPerDepth, sh.strength],
        glow: [st.color[0], st.color[1], st.color[2], glowA],
        glowP: [g.bias, st.brighten],
        clip: it.clip,
      };
    });
    const G = this.ghost;
    if (G && G.alpha > 0 && this.phase !== 'end') {
      // Self-lit and additive: the art's black background adds nothing, only the face shows.
      const sp = G.sprite, s = G.s, d = CONFIG.ghost.drift;
      const cx = G.x + Math.sin(this.time * 0.7) * d, cy = G.y + Math.sin(this.time * 1.1) * d * 0.6;
      items.push({
        sprite: sp,
        rect: [cx - (sp.w * s) / 2 - sp.ox * s, cy - (sp.h * s) / 2 - sp.oy * s, sp.tw * s, sp.th * s],
        shadow: [0, 0, 0, 0], glow: [0, 0, 0, 0], glowP: [0, 0], clip: 2,
        fx: [1, G.alpha * (0.85 + 0.15 * Math.sin(this.time * 9)), CONFIG.ghost.gain, 1],
      });
    }
    return {
      light: { x: L.x, y: L.y, r: f.radius, exposure: this.exposure * this.lamp },
      bg: this.phase === 'end' ? null : this.room.bg,
      items,
    };
  }
}
