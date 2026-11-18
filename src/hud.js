// HUD drawn into a small 2D canvas the size of the PS1 framebuffer, then composited by the renderer with
// nearest filtering. Text uses a built-in 5x7 pixel font (uppercase only), so no font files are needed.
// `version` bumps whenever the canvas changes, so the renderer only re-uploads the texture then.
import { CONFIG } from './config.js';

// 5x7 glyphs, rows top -> bottom, '1' = ink.
const GLYPHS = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110', D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110', J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 10001 01010 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111', 3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
  '.': '00000 00000 00000 00000 00000 01100 01100', ',': '00000 00000 00000 00000 01100 00100 01000',
  "'": '00100 00100 01000 00000 00000 00000 00000', '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00010 00100 00000 00100', '-': '00000 00000 00000 11111 00000 00000 00000',
  ':': '00000 01100 01100 00000 01100 01100 00000', '/': '00001 00001 00010 00100 01000 10000 10000',
};
const FONT = Object.fromEntries(Object.entries(GLYPHS).map(([c, s]) => [c, s.split(' ')]));
const ADV = 6, LINE = 9;

const KEY_ICON = ['01110000', '10001111', '10001011', '01110000'];

export function textWidth(s, scale = 1) {
  return Math.max(0, s.length * ADV - 1) * scale;
}

export class Hud {
  constructor(sprites) {
    this.sprites = sprites; // Map id -> sprite (for key thumbnails)
    this.w = CONFIG.ps1.width;
    this.h = Math.round((this.w * CONFIG.sceneH) / CONFIG.sceneW);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d');
    this.version = 0;
    this.sig = '';
  }

  // Scene px -> HUD px
  sx(x) { return Math.round((x * this.w) / CONFIG.sceneW); }
  sy(y) { return Math.round((y * this.h) / CONFIG.sceneH); }

  text(s, x, y, color, scale = 1) {
    const c = this.ctx;
    s = s.toUpperCase();
    for (const pass of [0, 1]) {
      c.fillStyle = pass ? color : '#000';
      const o = pass ? 0 : scale; // 1-px drop shadow keeps text readable on lit areas
      for (let i = 0; i < s.length; i++) {
        const g = FONT[s[i]];
        if (!g) continue;
        for (let r = 0; r < 7; r++)
          for (let k = 0; k < 5; k++)
            if (g[r][k] === '1') c.fillRect(x + (i * ADV + k) * scale + o, y + r * scale + o, scale, scale);
      }
    }
  }

  // Word-wrap to maxW px at scale 1.
  wrap(s, maxW) {
    const lines = [];
    let line = '';
    for (const word of s.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (textWidth(t) > maxW && line) {
        lines.push(line);
        line = word;
      } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }

  // state = { message, chars, keys:[{ door: doorArtId, master }], back, backHover, pills: count, pillHover, title,
  //           health: 0..1 | null (hidden), pulse: 0..1 heartbeat thump }
  // Redraws only when something visible changed (callers quantize health/pulse so that is not every frame).
  update(st) {
    const sig = JSON.stringify([st.message, st.chars, st.keys, st.back, st.backHover, st.pills, st.pillHover, st.title,
      st.health, st.pulse]);
    if (sig === this.sig) return;
    this.sig = sig;
    this.version++;
    const c = this.ctx, W = this.w, H = this.h;
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = true;

    if (st.health !== null && st.health !== undefined) this.health(st.health, st.pulse ?? 0);

    // Keys held: pixel key + a thumbnail of the door it opens.
    let x = 8;
    for (const { door, master } of st.keys) {
      const th = 22, sp = this.sprites.get(door);
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillRect(x - 2, 6, 12 + 2 + Math.round((th * (sp?.w ?? 10)) / (sp?.h ?? 16)) + 4, th + 4);
      c.fillStyle = master ? '#c9a227' : '#8f948f'; // the master key is gold, side-door keys are iron
      KEY_ICON.forEach((row, r) => [...row].forEach((b, k) => b === '1' && c.fillRect(x + k, 14 + r, 1, 1)));
      if (sp) {
        const tw = Math.round((th * sp.w) / sp.h);
        c.drawImage(sp.canvas, sp.ox, sp.oy, sp.w, sp.h, x + 10, 8, tw, th);
        x += 10 + tw + 10;
      } else x += 20;
    }

    // Pills held (top right): the pill art + count. Tapping it takes one (Game.hit -> 'pill').
    const pillSp = this.sprites.get('health');
    if (st.pills > 0 && pillSp) {
      const p = CONFIG.hud.pills, cx = this.sx(p.x), cy = this.sy(p.y), sz = 22;
      const label = 'x' + st.pills, lw = textWidth(label);
      const x0 = cx - ((sz + 3 + lw) >> 1);
      c.fillStyle = st.pillHover ? 'rgba(60,48,30,0.8)' : 'rgba(0,0,0,0.55)';
      c.fillRect(x0 - 3, cy - (sz >> 1) - 2, sz + 3 + lw + 6, sz + 4);
      c.drawImage(pillSp.canvas, pillSp.ox, pillSp.oy, pillSp.w, pillSp.h, x0, cy - (sz >> 1), sz, sz);
      this.text(label, x0 + sz + 3, cy - 3, st.pillHover ? '#e8dcc0' : '#a89c84');
      if (st.pillHover) this.text('USE', cx - (textWidth('USE') >> 1), cy + (sz >> 1) + 4, '#e8dcc0');
    }

    // Back arrow (a down chevron) at the bottom.
    if (st.back) {
      const b = CONFIG.hud.back;
      const cx = this.sx(b.x), cy = this.sy(b.y);
      c.fillStyle = st.backHover ? '#e8dcc0' : '#6d6455';
      for (let r = 0; r < 7; r++) {
        c.fillRect(cx - 7 + r, cy - 4 + r, 2, 1);
        c.fillRect(cx + 5 - r, cy - 4 + r, 2, 1);
      }
      if (st.backHover) this.text('BACK', cx - (textWidth('BACK') >> 1), cy - 15, '#e8dcc0');
    }

    if (st.message) {
      const shown = st.message.slice(0, st.chars);
      const lines = this.wrap(st.message.toUpperCase(), W - 60);
      // Lay out the full message (so lines don't reflow while typing), then reveal `chars` characters.
      const boxH = lines.length * LINE + 8, y0 = H - 40 - boxH;
      const boxW = Math.max(...lines.map((l) => textWidth(l))) + 16;
      c.fillStyle = 'rgba(0,0,0,0.7)';
      c.fillRect((W - boxW) >> 1, y0, boxW, boxH);
      let left = shown.length;
      lines.forEach((l, i) => {
        const part = l.slice(0, Math.max(0, left));
        left -= l.length + 1;
        this.text(part, (W - textWidth(l)) >> 1, y0 + 4 + i * LINE, '#d8cdb4');
      });
    }

    if (st.title) {
      const s = 2;
      this.text(st.title, (W - textWidth(st.title, s)) >> 1, (H >> 1) - 7, '#c9b48a', s);
    }
  }

  // Red vignette (low health only) + the heart at the bottom left, drained from the top down to `h`.
  health(h, pulse) {
    const c = this.ctx, W = this.w, H = this.h, cfg = CONFIG.healthHud;
    const low = Math.max(0, Math.min(1, 1 - h / CONFIG.heartbeat.start)); // 0 at the heartbeat's start -> 1 at death
    const a = low * (cfg.vignette + cfg.vignetteBeat * pulse);
    if (a > 0.004) {
      const d = Math.hypot(W, H) / 2;
      const g = c.createRadialGradient(W / 2, H / 2, d * (0.75 - 0.3 * low), W / 2, H / 2, d);
      g.addColorStop(0, 'rgba(110,0,0,0)');
      g.addColorStop(1, `rgba(110,0,0,${Math.min(1, a).toFixed(3)})`);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }

    const sp = this.sprites.get('heart');
    if (!sp) return;
    const [bx0, by0, bx1, by1] = sp.box, bw = bx1 - bx0, bh = by1 - by0;
    const k = (cfg.size * (1 + cfg.beatScale * pulse)) / bh; // native px -> HUD px
    const dw = Math.round(bw * k), dh = Math.round(bh * k);
    const x0 = this.sx(cfg.x) - (dw >> 1), y0 = this.sy(cfg.y) - (dh >> 1);
    // Rows above `cut` (dest px from the top) are lost health.
    const cut = Math.round(dh * (1 - Math.max(0, Math.min(1, h))));
    const src = (y) => sp.oy + by0 + (y / dh) * bh; // dest row -> source row
    c.drawImage(this.drainedHeart(sp), 0, 0, bw, bh, x0, y0, dw, dh);
    if (cut < dh) {
      const sy0 = src(cut), sxx = sp.ox + bx0;
      c.drawImage(sp.canvas, sxx, sy0, bw, sp.oy + by1 - sy0, x0, y0 + cut, dw, dh - cut);
      if (pulse > 0) {
        // Flush of blood on each thump.
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.45 * pulse;
        c.drawImage(sp.canvas, sxx, sy0, bw, sp.oy + by1 - sy0, x0, y0 + cut, dw, dh - cut);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
      }
    }
  }

  // The heart's tight box, greyed and darkened (built once).
  drainedHeart(sp) {
    if (this._drained?.sp === sp) return this._drained.canvas;
    const [bx0, by0, bx1, by1] = sp.box, w = bx1 - bx0, h = by1 - by0;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d');
    c.drawImage(sp.canvas, sp.ox + bx0, sp.oy + by0, w, h, 0, 0, w, h);
    const img = c.getImageData(0, 0, w, h), px = img.data, b = CONFIG.healthHud.drained;
    for (let i = 0; i < px.length; i += 4) {
      const g = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) * b;
      px[i] = g * 1.15; px[i + 1] = g; px[i + 2] = g; // a hint of warmth so it still reads as flesh
    }
    c.putImageData(img, 0, 0);
    this._drained = { sp, canvas: cv };
    return cv;
  }
}
