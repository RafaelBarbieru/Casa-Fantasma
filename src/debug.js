// Debug overlay. Toggle with ` (backquote) or start with ?debug in the URL.
// Keys while visible: N = new random world (same level), L = skip to the next level, K = take every key,
// B = jump back to the start room, A = play a random ambience one-shot, G = random ghost now, H = full health,
// D = lose 20% health, P = get a pill.
import { CONFIG } from './config.js';

export class Debug {
  constructor({ game, renderer, regenerate, nextLevel, playRandomAmbience }) {
    this.nextLevel = nextLevel;
    this.game = game;
    this.r = renderer;
    this.regenerate = regenerate;
    this.playRandomAmbience = playRandomAmbience;
    this.on = new URLSearchParams(location.search).has('debug');
    this.frames = 0;
    this.fps = 0;
    this.acc = 0;
    this.el = document.createElement('div');
    this.el.id = 'debug';
    this.markers = document.createElement('div');
    this.markers.id = 'debug-markers';
    document.body.append(this.markers, this.el);
    addEventListener('keydown', (e) => {
      if (e.key === '`') { this.on = !this.on; this.refresh(); return; }
      if (!this.on) return;
      const g = this.game, k = e.key.toLowerCase();
      if (k === 'n') this.regenerate();
      if (k === 'l') this.nextLevel();
      if (k === 'a') console.info('[casa] ambience one-shot', this.playRandomAmbience?.());
      if (k === 'k') {
        g.keys = g.world.keys.map((_, i) => i).filter((i) => !g.unlocked.has(this.lockUid(i)));
        this.refresh();
      }
      if (k === 'b') g.enterRoom(0);
      if (k === 'g') g.spawnRandomGhost();
      if (k === 'h') g.health = 1;
      if (k === 'd') g.health = Math.max(0.01, g.health - 0.2);
      if (k === 'p') g.pills++;
    });
    this.refresh();
  }

  // "room:item" uid of the door that key i opens.
  lockUid(i) {
    const k = this.game.world.keys[i];
    return `${k.room}:${this.game.world.rooms[k.room].items.findIndex((it) => it.lock === i)}`;
  }

  tick(dt, rendered) {
    if (rendered) this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.fps = Math.round(this.frames / this.acc);
      this.frames = 0;
      this.acc = 0;
      if (this.on) this._text();
    }
  }

  _text() {
    const g = this.game, v = this.r.view, s = g.room?.spec, w = g.world;
    const lines = [
      `level ${w.level}  seed ${w.seed}`,
      `room ${g.roomIndex}/${w.rooms.length - 1}  ${s?.kind}  stage ${s?.stage}  back -> ${s?.parent}`,
      `layout ${s?.template}  ${s?.wall} + ${s?.floor}`,
      `health ${(g.health * 100).toFixed(0)}%  ghost ${g.ghost ? g.ghost.id + (g.ghost.random ? ' (random)' : ' (room)') : '-'}` +
        `  next random ghost ${g.spawnAt === null ? '-' : ((g.spawnAt - performance.now()) / 1000).toFixed(0) + ' s'}`,
    ];
    for (const it of s?.items ?? []) {
      let t = `  ${it.item} @ ${it.slot}`;
      if (it.to !== undefined) t += it.to < 0 ? ' -> EXIT' : ` -> room ${it.to}`;
      if (it.lock !== undefined) t += ` [lock ${it.lock}]`;
      if (it.key !== undefined) t += ` {key ${it.key}}`;
      if (it.pill) t += ' {pill}';
      if (g.room.items.find((x) => x.e === it)?.explored) t += '  (explored)';
      lines.push(t);
    }
    w.keys.forEach((k, i) => lines.push(`  ${i ? 'key ' + i : 'MASTER'}: in room ${k.at}, opens ${k.door} in room ${k.room}`));
    lines.push(
      `held [${g.keys.join(', ')}]  pills ${g.pills}  (level has ${w.rooms.reduce((n, r) => n + r.items.filter((it) => it.pill).length, 0)},` +
        ` in rooms ${w.rooms.flatMap((r, i) => (r.items.some((it) => it.pill) ? [i] : [])).join(', ') || '-'})`,
      `ambience ${w.ambience}`,
      `render ${this.fps} fps (on demand)`,
      `buffer ${v.bw}x${v.bh} dpr ${v.dpr.toFixed(2)}`,
      '[`] hide  [N] new world  [L] next level  [K] all keys  [B] start room  [A] one-shot',
      '[G] ghost  [H] heal  [D] -20% health  [P] +1 pill',
    );
    this.el.textContent = lines.join('\n');
  }

  refresh() {
    this.el.style.display = this.markers.style.display = this.on ? '' : 'none';
    if (!this.on || !this.game.room) return;
    this._text();
    this.markers.textContent = '';
    const used = new Set(this.game.room.spec.items.map((it) => it.slot));
    for (const slot of this.game.room.template.slots) {
      const p = this.r.sceneToCss(slot.x, slot.anchor === 'floor' ? CONFIG.sceneH * CONFIG.room.floorLine : slot.y);
      const m = document.createElement('div');
      m.className = 'slot' + (used.has(slot.id) ? ' used' : '');
      m.style.left = p.x + 'px';
      m.style.top = p.y + 'px';
      m.textContent = slot.id;
      this.markers.append(m);
    }
  }
}
