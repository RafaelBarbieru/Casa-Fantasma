// Menus: main (after the start overlay), pause (Esc / HUD pause button), Options (from either), How to play (main
// only) and the run's stats (after dying or getting out; MAIN MENU goes to main). Drawn into the HUD canvas with the HUD's pixel font, so they go through the same PS1 framebuffer + colour
// reduction as the game, over the dimmed room. Input: pointer (move/down/up/tap in scene px) and keyboard (key()).
// Sounds: CONFIG.sfx uiSelect when an option gets pointed at / selected with the keys, uiSubmit when one is clicked.
import { CONFIG } from './config.js';
import { textWidth } from './hud.js';
import { settings, saveSettings } from './settings.js';
import { TUTORIAL, PANEL } from './tutorial.js';
import { L, cycleLang } from './i18n.js';

const C = {
  title: '#c9b48a', titleShadow: '#4a0d08', head: '#8a3a2a', idle: '#7d7462', hot: '#e8dcc0', body: '#a89c84',
  mark: '#b0301f', segOn: '#c9b48a', segIdle: '#8f8571', segOff: '#2a2520', hint: '#6d6455',
};
const SEGS = 20, SEG_W = 6;               // slider: 20 blocks, 5% each
const LX = 110, CX = 230, ROW_X0 = 96, ROW_X1 = 392; // options rows: label x, control x, hit area (HUD px)
const TEXT_X = 26, PARA = 6;              // How to play: text column left edge and gap between paragraphs (HUD px)
const TEXT_W = PANEL.x - 12 - TEXT_X;     // ...and its wrap width (the picture panel is on the right)
const LINE_H = 11;                        // ...and its line pitch (room for accents above capitals)

const STATS_LX = 60, STATS_VX = 270;    // stats screen: label and value columns (HUD px)

const button = (id, label, y, extra) => ({ id, kind: 'button', label, y, ...extra });

// The stats screen's verdict on the pills you took (grams; held = pills still in your pocket, died = true if dead).
// The lines are src/locales/*.js menu.jokes.
export function pillJoke(grams, held, died) {
  const J = L().menu.jokes;
  if (!grams && died && held) return J.diedHolding(held);
  if (!grams) return J.none;
  if (grams <= 2) return J.few;
  if (grams <= 5) return J.dose;
  if (grams <= 9) return J.many;
  return J.lots;
}

export class Menu {
  // Callbacks: onStart() START, onResume() RESUME, onQuit() QUIT, onSfx(role), onChange() a setting changed (apply
  // volumes; this saves them). art = { wall, floor } images for the tutorial pictures.
  constructor({ w, h, art, onStart, onResume, onQuit, onSfx, onChange }) {
    Object.assign(this, { w, h, art, onStart, onResume, onQuit, onSfx, onChange });
    this.open = false;
    this.page = 'main'; // 'main' | 'pause' | 'options' | 'tutorial' | 'stats'
    this.stats = null;  // stats page: { escaped, level, levels, ms, ghosts, grams, held } (see main toMainMenu)
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

  // The end-of-run stats; its MAIN MENU button leads to the main menu.
  showStats(stats) {
    this.show('main');
    this.page = 'stats';
    this.stats = stats;
    this.sel = 'menu';
  }

  // --- layout + hit testing (HUD px) ---------------------------------------
  // Every widget on the current page; y = top of its text.
  // Labels come from the current locale (src/locales/*.js menu).
  layout() {
    const T = L().menu;
    switch (this.page) {
      case 'main': return [button('start', T.start, 140), button('tutorial', T.howToPlay, 166), button('options', T.options, 192)];
      case 'pause': return [
        button('resume', T.resume, 140), button('options', T.options, 166),
        button('quit', T.quit, 192, { hint: T.quitHint }),
      ];
      case 'options': return [
        { kind: 'header', label: T.audio, y: 58 },
        { id: 'master', kind: 'slider', label: T.master, y: 76 },
        { id: 'ambience', kind: 'slider', label: T.ambience, y: 94 },
        { id: 'sfx', kind: 'slider', label: T.sfx, y: 112 },
        { kind: 'header', label: T.game, y: 140 },
        { id: 'epilepsy', kind: 'toggle', label: T.epilepsy, y: 158, hint: T.epilepsyHint },
        { id: 'lang', kind: 'choice', label: T.language, y: 176 },
        button('back', T.back, 206),
      ];
      case 'tutorial': return [
        this.tut > 0 && button('prev', '<', 236, { x: 150 }),
        button('back', T.back, 236),
        this.tut < TUTORIAL.length - 1 && button('next', '>', 236, { x: 330 }),
      ].filter(Boolean);
      case 'stats': return [button('menu', T.mainMenu, 222)];
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
      case 'menu': return this.go('main', 'start');
      case 'options': return this.go('options');
      case 'tutorial': this.tut = 0; return this.go('tutorial');
      case 'back': return this.go(this.from, this.page === 'tutorial' ? 'tutorial' : 'options');
      case 'prev': case 'next': return this.flip(it.id === 'next' ? 1 : -1);
    }
    if (it.kind === 'toggle') {
      settings[it.id] = !settings[it.id];
      saveSettings();
      this.onChange();
    } else if (it.kind === 'choice') this.cycle(it, 1);
  }

  // Options > Language: the next (d = 1) or previous (d = -1) locale.
  cycle(it, d) {
    settings[it.id] = cycleLang(d);
    saveSettings();
    this.onChange();
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
    } else if (horiz && cur?.kind === 'choice') {
      this.onSfx('uiSelect');
      this.cycle(cur, horiz);
    } else if (k === 'Enter' || k === 'NumpadEnter' || k === 'Space') {
      if (cur && cur.kind !== 'slider' && !e.repeat) this.activate(cur);
    } else if (k === 'Escape' || k === 'Backspace') {
      if (e.repeat) return true;
      if (this.page === 'options' || this.page === 'tutorial') this.activate({ id: 'back' });
      else if (this.page === 'stats') this.activate({ id: 'menu' });
      else if (this.page === 'pause') this.activate({ id: 'resume' });
    } else return false;
    return true;
  }

  // --- drawing -----------------------------------------------------------------
  // Redraws the HUD canvas only when something visible changed (bumps hud.version).
  draw(hud) {
    const sig = 'menu' + JSON.stringify([this.page, this.sel, this.tut, settings, this.page === 'stats' && this.stats]);
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

    const T = L().menu;
    const center = (s, y, color, scale, shadow) => hud.text(s, (W - textWidth(s, scale)) >> 1, y, color, scale, shadow);
    if (this.page === 'main') center(T.title, 60, C.title, 3, C.titleShadow);
    else if (this.page === 'pause') center(T.paused, 60, C.title, 3, C.titleShadow);
    else if (this.page === 'options') center(T.options, 22, C.title, 2, C.titleShadow);
    else if (this.page === 'stats') {
      const S = this.stats, sec = Math.round(S.ms / 1000);
      center(S.escaped ? T.gotOut : T.died, 34, C.title, 3, C.titleShadow);
      const rows = [
        [T.time, T.timeValue(Math.floor(sec / 60), String(sec % 60).padStart(2, '0'))],
        [T.level, T.levelValue(S.level, S.levels)],
        [T.ghosts, String(S.ghosts)],
        [T.pills, T.grams(S.grams)],
      ];
      // Values start at STATS_VX, or further right when a (translated) label is longer.
      const vx = Math.max(STATS_VX, STATS_LX + Math.max(...rows.map(([l]) => textWidth(l, 2))) + 18);
      rows.forEach(([label, value], i) => {
        const y = 84 + i * 24;
        hud.text(label, STATS_LX, y, C.idle, 2);
        hud.text(value, vx, y, C.hot, 2);
      });
      center(`(${pillJoke(S.grams, S.held, !S.escaped)})`, 84 + 3 * 24 + 22, C.body, 1);
    }
    else if (this.page === 'tutorial') {
      const page = TUTORIAL[this.tut], P = PANEL, words = L().tutorial[page.id];
      center(words.title, 18, C.title, 2, C.titleShadow);
      let y = P.y;
      for (const p of words.text) {
        for (const line of hud.wrap(p.toUpperCase(), TEXT_W)) {
          hud.text(line, TEXT_X, y, C.body);
          y += LINE_H;
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
        hud.text(`< ${on ? T.on : T.off} >`, CX, it.y, on ? (hot ? C.hot : C.segOn) : (hot ? C.segIdle : C.hint));
      } else if (it.kind === 'choice') {
        hud.text(`< ${L().name} >`, CX, it.y, hot ? C.hot : C.segOn);
      }
    }

    const hint = this.layout().find((it) => it.id === this.sel)?.hint;
    if (hint) center(hint, H - 30, C.hint, 1);
  }
}
