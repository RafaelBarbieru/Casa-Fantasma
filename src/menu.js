// Menus: main (after the start overlay), pause (Esc / HUD pause button), Options (from either) and How to play (main
// only). Drawn into the HUD canvas with the HUD's pixel font, so they go through the same PS1 framebuffer + colour
// reduction as the game, over the dimmed room. Input: pointer (move/down/up/tap in scene px) and keyboard (key()).
// Sounds: CONFIG.sfx uiSelect when an option gets pointed at / selected with the keys, uiSubmit when one is clicked.
import { CONFIG } from './config.js';
import { textWidth } from './hud.js';
import { settings, saveSettings } from './settings.js';
import { TUTORIAL, PANEL } from './tutorial.js';

const C = {
  title: '#c9b48a', titleShadow: '#4a0d08', head: '#8a3a2a', idle: '#7d7462', hot: '#e8dcc0', body: '#a89c84',
  mark: '#b0301f', segOn: '#c9b48a', segIdle: '#8f8571', segOff: '#2a2520', hint: '#6d6455',
};
const SEGS = 20, SEG_W = 6;               // slider: 20 blocks, 5% each
const LX = 110, CX = 230, ROW_X0 = 96, ROW_X1 = 392; // options rows: label x, control x, hit area (HUD px)
const TEXT_X = 26, PARA = 6;              // How to play: text column left edge and gap between paragraphs (HUD px)
const TEXT_W = PANEL.x - 12 - TEXT_X;     // ...and its wrap width (the picture panel is on the right)

const button = (id, label, y, extra) => ({ id, kind: 'button', label, y, ...extra });

export class Menu {
  // Callbacks: onStart() START, onResume() RESUME, onQuit() QUIT, onSfx(role), onChange() a setting changed (apply
  // volumes; this saves them). art = { wall, floor } images for the tutorial pictures.
  constructor({ w, h, art, onStart, onResume, onQuit, onSfx, onChange }) {
    Object.assign(this, { w, h, art, onStart, onResume, onQuit, onSfx, onChange });
    this.open = false;
    this.page = 'main'; // 'main' | 'pause' | 'options' | 'tutorial'
    this.from = 'main'; // page that Options / How to play go back to
    this.tut = 0;       // How to play page index
    this.sel = null;    // id of the highlighted option
    this.drag = null;   // id of the slider being dragged
  }

  // page: 'main' or 'pause'. Keyboard players land on the first option of the pause menu (they just pressed Esc).
  show(page = 'main') {
    this.open = true;
    this.page = this.from = page;
    this.sel = page === 'pause' ? 'resume' : null;
    this.drag = null;
  }

  // --- layout + hit testing (HUD px) ---------------------------------------
  // Every widget on the current page; y = top of its text.
  layout() {
    switch (this.page) {
      case 'main': return [button('start', 'START', 140), button('tutorial', 'HOW TO PLAY', 166), button('options', 'OPTIONS', 192)];
      case 'pause': return [
        button('resume', 'RESUME', 140), button('options', 'OPTIONS', 166),
        button('quit', 'QUIT', 192, { hint: 'BACK TO THE MAIN MENU. THIS RUN WILL BE LOST.' }),
      ];
      case 'options': return [
        { kind: 'header', label: 'AUDIO', y: 58 },
        { id: 'master', kind: 'slider', label: 'MASTER', y: 76 },
        { id: 'ambience', kind: 'slider', label: 'AMBIENCE', y: 94 },
        { id: 'sfx', kind: 'slider', label: 'SFX', y: 112 },
        { kind: 'header', label: 'GAME', y: 140 },
        { id: 'epilepsy', kind: 'toggle', label: 'EPILEPSY MODE', y: 158, hint: 'NO FLICKERING OR FLASHING LIGHTS' },
        button('back', 'BACK', 200),
      ];
      case 'tutorial': return [
        this.tut > 0 && button('prev', '<', 236, { x: 150 }),
        button('back', 'BACK', 236),
        this.tut < TUTORIAL.length - 1 && button('next', '>', 236, { x: 330 }),
      ].filter(Boolean);
    }
    return [];
  }

  items() { return this.layout().filter((it) => it.id); }

  rect(it) {
    if (it.kind === 'button') {
      const tw = textWidth(it.label, 2), cx = it.x ?? this.w / 2;
      return [Math.round(cx - tw / 2) - 14, it.y - 4, tw + 28, 22];
    }
    return [ROW_X0, it.y - 5, ROW_X1 - ROW_X0, 17];
  }

  at(p) {
    const x = (p.x * this.w) / CONFIG.sceneW, y = (p.y * this.h) / CONFIG.sceneH;
    return this.items().find((it) => {
      const [rx, ry, rw, rh] = this.rect(it);
      return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
    }) ?? null;
  }

  setSlider(id, p) {
    const x = (p.x * this.w) / CONFIG.sceneW;
    const v = Math.round(Math.max(0, Math.min(1, (x - CX) / (SEGS * SEG_W))) * SEGS) / SEGS;
    if (v !== settings[id]) {
      settings[id] = v;
      this.onChange();
    }
  }

  select(id, sound) {
    if (id === this.sel) return;
    this.sel = id;
    if (id && sound) this.onSfx('uiSelect');
  }

  // --- pointer -----------------------------------------------------------------
  // Touch has no hover: an option is only highlighted while the finger is on it, without the select sound.
  move(p, kind) {
    if (this.drag) return this.setSlider(this.drag, p);
    this.select(this.at(p)?.id ?? null, kind !== 'touch');
  }

  down(p, kind) {
    const it = this.at(p);
    this.select(it?.id ?? null, kind !== 'touch');
    if (it?.kind === 'slider') {
      this.drag = it.id;
      this.setSlider(it.id, p);
    }
  }

  up() {
    if (!this.drag) return;
    this.drag = null;
    saveSettings();
    this.onSfx('uiSubmit'); // also lets you hear the new volume
  }

  tap(p) {
    const it = this.at(p);
    if (it && it.kind !== 'slider') this.activate(it);
  }

  activate(it) {
    this.onSfx('uiSubmit');
    switch (it.id) {
      case 'start': this.open = false; return this.onStart();
      case 'resume': this.open = false; return this.onResume();
      case 'quit': return this.onQuit();
      case 'options': return this.go('options');
      case 'tutorial': this.tut = 0; return this.go('tutorial');
      case 'back': return this.go(this.from, this.page === 'tutorial' ? 'tutorial' : 'options');
      case 'prev': case 'next': return this.flip(it.id === 'next' ? 1 : -1);
    }
    if (it.kind === 'toggle') {
      settings[it.id] = !settings[it.id];
      saveSettings();
      this.onChange();
    }
  }

  // How to play: turn the page. Keeps the arrow selected while there is another page that way, else BACK.
  flip(d) {
    const t = Math.max(0, Math.min(TUTORIAL.length - 1, this.tut + d));
    if (t === this.tut) return;
    this.tut = t;
    if (!this.items().some((it) => it.id === this.sel)) this.sel = 'back';
  }

  // focus: the option to highlight on arrival (the one that led away from this page), else the first one.
  go(page, focus) {
    this.page = page;
    this.drag = null;
    const items = this.items();
    this.sel = items.some((it) => it.id === focus) ? focus : items[0].id;
  }

  // --- keyboard: arrows / WASD move + adjust (turn pages in How to play), Enter / Space activate, Escape / Backspace
  // go back (or resume, in the pause menu). true = handled.
  key(e) {
    const items = this.items(), i = items.findIndex((it) => it.id === this.sel), cur = items[i];
    const k = e.code;
    const vert = { ArrowDown: 1, KeyS: 1, ArrowUp: -1, KeyW: -1 }[k];
    const horiz = { ArrowRight: 1, KeyD: 1, ArrowLeft: -1, KeyA: -1 }[k];
    if (vert && this.page === 'tutorial') return true; // one row of buttons: left/right only
    if (vert) {
      this.select(items[i < 0 ? 0 : (i + vert + items.length) % items.length].id, true);
    } else if (horiz && this.page === 'tutorial') {
      if (this.tut + horiz >= 0 && this.tut + horiz < TUTORIAL.length) {
        this.onSfx('uiSelect');
        this.flip(horiz);
      }
    } else if (horiz && cur?.kind === 'slider') {
      const v = Math.round(Math.max(0, Math.min(1, settings[cur.id] + horiz / SEGS)) * SEGS) / SEGS;
      if (v !== settings[cur.id]) {
        settings[cur.id] = v;
        saveSettings();
        this.onChange();
        this.onSfx('uiSelect');
      }
    } else if (horiz && cur?.kind === 'toggle') {
      this.activate(cur);
    } else if (k === 'Enter' || k === 'NumpadEnter' || k === 'Space') {
      if (cur && cur.kind !== 'slider' && !e.repeat) this.activate(cur);
    } else if (k === 'Escape' || k === 'Backspace') {
      if (e.repeat) return true;
      if (this.page === 'options' || this.page === 'tutorial') this.activate({ id: 'back' });
      else if (this.page === 'pause') this.activate({ id: 'resume' });
    } else return false;
    return true;
  }

  // --- drawing -----------------------------------------------------------------
  // Redraws the HUD canvas only when something visible changed (bumps hud.version).
  draw(hud) {
    const sig = 'menu' + JSON.stringify([this.page, this.sel, this.tut, settings]);
    if (sig === hud.sig) return;
    hud.sig = sig;
    hud.version++;
    const c = hud.ctx, W = this.w, H = this.h;
    c.clearRect(0, 0, W, H);
    // Dim the room behind, darker at the edges (and more behind the tutorial's text).
    c.fillStyle = this.page === 'tutorial' ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.55)';
    c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.75)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    const center = (s, y, color, scale, shadow) => hud.text(s, (W - textWidth(s, scale)) >> 1, y, color, scale, shadow);
    if (this.page === 'main') center('CASA FANTASMA', 60, C.title, 3, C.titleShadow);
    else if (this.page === 'pause') center('PAUSED', 60, C.title, 3, C.titleShadow);
    else if (this.page === 'options') center('OPTIONS', 22, C.title, 2, C.titleShadow);
    else if (this.page === 'tutorial') {
      const page = TUTORIAL[this.tut], P = PANEL;
      center(page.title, 18, C.title, 2, C.titleShadow);
      let y = P.y;
      for (const p of page.text) {
        for (const line of hud.wrap(p.toUpperCase(), TEXT_W)) {
          hud.text(line, TEXT_X, y, C.body);
          y += 10;
        }
        y += PARA;
      }
      // The picture: clipped to its panel, framed.
      c.save();
      c.beginPath();
      c.rect(P.x, P.y, P.w, P.h);
      c.clip();
      c.fillStyle = '#000';
      c.fillRect(P.x, P.y, P.w, P.h);
      page.draw({ c, hud, sprites: hud.sprites, wall: this.art?.wall, floor: this.art?.floor, P });
      c.restore();
      c.strokeStyle = '#3a332b';
      c.lineWidth = 1;
      c.strokeRect(P.x - 0.5, P.y - 0.5, P.w + 1, P.h + 1);
      center(`${this.tut + 1}/${TUTORIAL.length}`, 220, C.hint, 1);
    }

    for (const it of this.layout()) {
      const hot = it.id && it.id === this.sel;
      if (it.kind === 'header') {
        hud.text(it.label, LX - 14, it.y, C.head);
        c.fillStyle = C.head;
        c.fillRect(LX - 14, it.y + 9, ROW_X1 - LX + 4, 1);
        continue;
      }
      if (it.kind === 'button') {
        const tw = textWidth(it.label, 2), x = Math.round((it.x ?? W / 2) - tw / 2);
        hud.text(it.label, x, it.y, hot ? C.hot : C.idle, 2);
        if (hot && it.label.length > 1) hud.text('>', x - 14, it.y, C.mark, 2);
        continue;
      }
      hud.text(it.label, LX, it.y, hot ? C.hot : C.idle);
      if (hot) hud.text('>', LX - 10, it.y, C.mark);
      if (it.kind === 'slider') {
        const v = settings[it.id], on = Math.round(v * SEGS);
        for (let i = 0; i < SEGS; i++) {
          c.fillStyle = i < on ? (hot ? C.segOn : C.segIdle) : C.segOff;
          c.fillRect(CX + i * SEG_W, it.y, SEG_W - 1, 7);
        }
        hud.text(Math.round(v * 100) + '%', CX + SEGS * SEG_W + 8, it.y, hot ? C.hot : C.idle);
      } else if (it.kind === 'toggle') {
        const on = settings[it.id];
        hud.text(on ? '< ON >' : '< OFF >', CX, it.y, on ? (hot ? C.hot : C.segOn) : (hot ? C.segIdle : C.hint));
      }
    }

    const hint = this.layout().find((it) => it.id === this.sel)?.hint;
    if (hint) center(hint, H - 30, C.hint, 1);
  }
}
