// Debug overlay. Toggle with ` (backquote) or start with ?debug in the URL.
// Keys while visible: N = new random world, S = skip to next room.
export class Debug {
  constructor({ game, renderer, regenerate }) {
    this.game = game;
    this.r = renderer;
    this.regenerate = regenerate;
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
      if (e.key === 'n' || e.key === 'N') this.regenerate();
      if (e.key === 's' || e.key === 'S') {
        const g = this.game;
        g.enterRoom((g.roomIndex + 1) % g.world.rooms.length);
      }
    });
    this.refresh();
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
    const g = this.game, v = this.r.view, s = g.room?.spec;
    this.el.textContent =
      `seed ${g.world.seed}\n` +
      `room ${g.roomIndex + 1}/${g.world.rooms.length}  ${s?.template}\n` +
      `item ${s?.item} @ ${s?.slot}\n` +
      `render ${this.fps} fps (on demand)\n` +
      `buffer ${v.bw}x${v.bh} dpr ${v.dpr.toFixed(2)}\n` +
      `[\`] hide  [N] new world  [S] skip`;
  }

  refresh() {
    this.el.style.display = this.markers.style.display = this.on ? '' : 'none';
    if (!this.on || !this.game.room) return;
    this._text();
    this.markers.textContent = '';
    for (const slot of this.game.room.template.slots) {
      const p = this.r.sceneToCss(slot.x, slot.y);
      const m = document.createElement('div');
      m.className = 'slot' + (slot.id === this.game.room.spec.slot ? ' used' : '');
      m.style.left = p.x + 'px';
      m.style.top = p.y + 'px';
      m.textContent = slot.id;
      this.markers.append(m);
    }
  }
}
