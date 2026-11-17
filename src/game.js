// Game state: current room, flashlight, hover/glow, room transitions. Produces a frame description for Renderer.
import { CONFIG } from './config.js';

const approach = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

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
    this.hover = false;
    this.glow = 0;
    this.time = 0;
    this.exposure = 0;
    this.phase = 'in'; // 'in' | 'idle' | 'out'
    this.phaseT = 0;
    this.world = null;
    this.roomIndex = 0;
    this.room = null; // { spec, template, bg, item }
    this.onRoomChange = null; // (game) => void
    this.onWorldEnd = null;   // (game) => void   called after the last room's item is taken
    this.onItemClick = null;  // (game) => void   item clicked/tapped (sfx hook)
    this.lastPointer = null;
  }

  setWorld(world) {
    this.world = world;
    this.enterRoom(0);
  }

  enterRoom(i) {
    this.roomIndex = i;
    const spec = this.world.rooms[i];
    const template = this.db.rooms[spec.template];
    const slot = template.slots.find((s) => s.id === spec.slot);
    const def = this.db.items[spec.item];
    const sprite = this.assets.sprites.get(spec.item);
    const s = (def.scale ?? 1) * (slot.scale ?? 1);
    const x0 = slot.x - (sprite.w * s) / 2;
    const y0 = slot.y - (sprite.h * s) / 2;
    this.room = {
      spec,
      template,
      bg: this.assets.rooms.get(spec.template),
      item: {
        id: spec.item, def, sprite, s, cx: slot.x, cy: slot.y, x0, y0,
        depth: def.depth ?? 8,
        rect: [x0 - sprite.ox * s, y0 - sprite.oy * s, sprite.tw * s, sprite.th * s],
      },
    };
    this.hover = false;
    this.glow = 0;
    this.phase = 'in';
    this.phaseT = 0;
    this.exposure = 0;
    this.onRoomChange?.(this);
  }

  // --- input -------------------------------------------------------------
  pointerMove(p, kind) {
    this.light.tx = p.x;
    this.light.ty = p.y;
    this.lastPointer = { p, kind };
    this.hover = this.phase === 'idle' && this.hit(p, kind);
  }

  pointerDown(p, kind) {
    this.pointerMove(p, kind);
  }

  pointerLeave() {
    this.hover = false;
    this.lastPointer = null;
  }

  tap(p, kind) {
    this.pointerMove(p, kind);
    if (this.phase !== 'idle' || !this.hit(p, kind)) return;
    // TODO: hook item interaction / inventory here.
    this.onItemClick?.(this);
    this.phase = 'out';
    this.phaseT = 0;
    this.hover = false;
  }

  _maskAt(it, x, y) {
    const sp = it.sprite;
    const lx = Math.floor((x - it.x0) / it.s), ly = Math.floor((y - it.y0) / it.s);
    return lx >= 0 && ly >= 0 && lx < sp.w && ly < sp.h && sp.mask[ly * sp.w + lx] === 1;
  }

  hit(p, kind) {
    const it = this.room?.item;
    if (!it) return false;
    if (this._maskAt(it, p.x, p.y)) return true;
    if (kind !== 'touch') return false;
    const r = CONFIG.touchSlop;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      if (this._maskAt(it, p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r)) return true;
    }
    return false;
  }

  // --- simulation ----------------------------------------------------------
  // Returns true while something is animating (main loop keeps rendering).
  update(dt) {
    this.time += dt;
    const L = this.light, f = CONFIG.flashlight;
    L.x = approach(L.x, L.tx, f.follow, dt);
    L.y = approach(L.y, L.ty, f.follow, dt);
    let busy = Math.abs(L.x - L.tx) + Math.abs(L.y - L.ty) > 0.25;
    if (!busy) { L.x = L.tx; L.y = L.ty; }

    if (this.phase === 'out') {
      this.phaseT += dt / CONFIG.transition.outS;
      this.exposure = 1 - Math.min(1, this.phaseT) ** 2;
      if (this.phaseT >= 1) {
        const next = this.roomIndex + 1;
        if (next < this.world.rooms.length) this.enterRoom(next);
        else this.onWorldEnd?.(this);
      }
      busy = true;
    } else if (this.phase === 'in') {
      this.phaseT += dt / CONFIG.transition.inS;
      this.exposure = flickerIn(this.phaseT);
      if (this.phaseT >= 1) {
        this.phase = 'idle';
        this.exposure = 1;
        // Re-evaluate hover in case the pointer is already resting on the new item.
        if (this.lastPointer) this.hover = this.hit(this.lastPointer.p, this.lastPointer.kind);
      }
      busy = true;
    }

    const g = CONFIG.glow;
    const target = this.hover ? 1 : 0;
    this.glow = approach(this.glow, target, g.rate, dt);
    if (Math.abs(this.glow - target) < 0.002) this.glow = target;
    if (this.glow > 0) busy = true; // pulsing

    return busy;
  }

  frame() {
    const L = this.light, f = CONFIG.flashlight, sh = CONFIG.shadow, g = CONFIG.glow;
    const it = this.room.item;
    const srcX = L.x + f.handOffset[0], srcY = L.y + f.handOffset[1];
    let dx = (it.cx - srcX) * it.depth * sh.perDepth;
    let dy = (it.cy - srcY) * it.depth * sh.perDepth;
    const len = Math.hypot(dx, dy);
    if (len > sh.maxOffset) { dx *= sh.maxOffset / len; dy *= sh.maxOffset / len; }
    const glowA = this.glow * g.strength * (1 - g.pulse + g.pulse * Math.sin(this.time * 4));
    return {
      light: { x: L.x, y: L.y, r: f.radius, exposure: this.exposure },
      bg: this.room.bg,
      items: [{
        sprite: it.sprite,
        rect: it.rect,
        shadow: [dx / it.rect[2], dy / it.rect[3], sh.blurBias + it.depth * sh.blurPerDepth, sh.strength],
        glow: [g.color[0], g.color[1], g.color[2], glowA],
        glowP: [g.bias, g.brighten],
      }],
    };
  }
}
