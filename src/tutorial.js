// How to play (main menu): one entry per page = id (its title + paragraphs are src/locales/*.js tutorial[id]) and a
// picture drawn into a framed panel on the right
// with the game's own art (sprites by id from data/items.json + ghosts.json, a wall and floor texture). Everything is
// drawn into the HUD canvas, so it gets the same PS1 colour reduction as the game.
import { KEY_ICON } from './hud.js';
import { CONFIG } from './config.js';
import { TRAP } from './assets.js';
import { L } from './i18n.js';

export const PANEL = { x: 300, y: 44, w: 152, h: 160 }; // HUD px

// --- drawing helpers. k = { c: 2D context, hud, sprites, wall, floor, P: PANEL } ---------------------------------
// A sprite's visible (tight) box, `h` HUD px tall, centred on (cx, cy). o: { rot, pivot:[x,y], glow, blur, alpha, comp }
function sprite(k, id, cx, cy, h, o = {}) {
  const sp = k.sprites.get(id);
  if (!sp) return;
  const c = k.c, [x0, y0, x1, y1] = sp.box, bw = x1 - x0, bh = y1 - y0, w = (bw * h) / bh;
  c.save();
  if (o.rot) {
    const [px, py] = o.pivot;
    c.translate(px, py);
    c.rotate(o.rot);
    c.translate(-px, -py);
  }
  if (o.alpha !== undefined) c.globalAlpha = o.alpha;
  if (o.comp) c.globalCompositeOperation = o.comp;
  if (o.glow) {
    c.shadowColor = o.glow;
    c.shadowBlur = o.blur ?? 8;
  }
  c.drawImage(sp.canvas, sp.ox + x0, sp.oy + y0, bw, bh, cx - w / 2, cy - h / 2, w, h);
  c.restore();
}

const widthOf = (k, id, h) => {
  const sp = k.sprites.get(id);
  return sp ? ((sp.box[2] - sp.box[0]) * h) / (sp.box[3] - sp.box[1]) : h;
};

// Only the glow of a sprite, not the sprite (the light switch in the dark): the shadow is cast from far off-panel.
function glowOnly(k, id, cx, cy, h, color, blur) {
  const sp = k.sprites.get(id);
  if (!sp) return;
  const c = k.c, [x0, y0, x1, y1] = sp.box, bw = x1 - x0, bh = y1 - y0, w = (bw * h) / bh, far = 4000;
  c.save();
  c.shadowColor = color;
  c.shadowBlur = blur;
  c.shadowOffsetX = far;
  c.drawImage(sp.canvas, sp.ox + x0, sp.oy + y0, bw, bh, cx - w / 2 - far, cy - h / 2, w, h);
  c.restore();
}

// Wall above, floor below a floor line `floorAt` px below the panel top (default: like the game, 78%). Returns its y.
function room(k, h = k.P.h, floorAt = Math.round(h * 0.78)) {
  const { c, P } = k, fy = P.y + floorAt;
  const fill = (img, tile, y0, y1) => {
    if (!img) return void ((c.fillStyle = '#2a2520'), c.fillRect(P.x, y0, P.w, y1 - y0));
    const pat = c.createPattern(img, 'repeat');
    pat.setTransform?.(new DOMMatrix().translate(P.x, y0).scale(tile / img.naturalWidth));
    c.fillStyle = pat;
    c.fillRect(P.x, y0, P.w, y1 - y0);
  };
  fill(k.wall, 64, P.y, fy);
  fill(k.floor, 80, fy, P.y + h);
  const g = c.createLinearGradient(0, fy - 8, 0, fy + 4); // seam where wall meets floor
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.65, 'rgba(0,0,0,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(P.x, fy - 8, P.w, 12);
  return fy;
}

// Darkness everywhere except a flashlight pool at (cx, cy).
function beam(k, cx, cy, r, ambient = 0.08, h = k.P.h) {
  const { c, P } = k, g = c.createRadialGradient(cx, cy, r * 0.25, cx, cy, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${1 - ambient})`);
  c.fillStyle = g;
  c.fillRect(P.x, P.y, P.w, h);
}

const WARM = 'rgba(255,214,140,1)', DULL = 'rgba(140,158,180,0.8)';

// The pointer (a small pixel arrow), tip at (x, y).
const ARROW = ['1', '11', '121', '1221', '12221', '122221', '1222111', '11211', '00121', '00011'];
function pointer(c, x, y) {
  ARROW.forEach((row, r) => [...row].forEach((b, i) => {
    if (b === '0') return;
    c.fillStyle = b === '1' ? '#000' : '#e8dcc0';
    c.fillRect(x + i, y + r, 1, 1);
  }));
}

// The in-game "key held" chip (top left of the HUD): key icon + a thumbnail of the door it opens.
function keyChip(k, x, y, door, master) {
  const { c } = k, sp = k.sprites.get(door), th = 22, tw = sp ? Math.round(widthOf(k, door, th)) : 10;
  c.fillStyle = 'rgba(0,0,0,0.7)';
  c.fillRect(x - 2, y - 2, 12 + 2 + tw + 4, th + 4);
  c.fillStyle = master ? '#c9a227' : '#8f948f';
  KEY_ICON.forEach((row, r) => [...row].forEach((b, i) => b === '1' && c.fillRect(x + i, y + 8 + r, 1, 1)));
  if (sp) sprite(k, door, x + 10 + tw / 2, y + th / 2, th);
}

// A lever (data/items.json "lever_base" + "lever_handle"), base `h` HUD px tall, centred on (cx, cy), handle up or
// down. The handle keeps the game's size ratio to the base and sits CONFIG.levers.travel from the middle.
function lever(k, cx, cy, h, down, o = {}) {
  const base = k.sprites.get('lever_base'), hs = k.sprites.get('lever_handle');
  if (!base) return;
  sprite(k, 'lever_base', cx, cy, h, o);
  if (!hs) return;
  const hh = (h * (hs.box[3] - hs.box[1])) / (base.box[3] - base.box[1]);
  sprite(k, 'lever_handle', cx, cy + (down ? 1 : -1) * CONFIG.levers.travel * h, hh);
}

// A sagging cord from (x0, y0) to (x1, y1), its middle `sag` px below the straight line (like assets.js cords).
function cord(c, x0, y0, x1, y1, sag, color, width) {
  c.save();
  c.strokeStyle = color;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + 2 * sag, x1, y1);
  c.stroke();
  c.restore();
}

const rgb = (a) => `rgb(${a.join(',')})`;

// --- the pages ------------------------------------------------------------------------------------------------
export const TUTORIAL = [
  {
    id: 'house',
    draw(k) {
      const { P } = k, fy = room(k), cx = P.x + P.w / 2;
      sprite(k, 'door07', cx, fy - 44, 88, { glow: WARM, blur: 10 });
      beam(k, cx, fy - 44, 95);
      keyChip(k, P.x + 8, P.y + 8, 'door07', true);
    },
  },
  {
    id: 'controls',
    draw(k) {
      const { c, P, hud } = k, h = 108, fy = room(k, h, 86), x1 = P.x + P.w * 0.3, x2 = P.x + P.w * 0.7;
      sprite(k, 'door03', x1, fy - 31, 62, { glow: WARM, blur: 9 });
      sprite(k, 'door05', x2, fy - 31, 62, { glow: DULL, blur: 7 });
      beam(k, P.x + P.w / 2, fy - 34, 110, 0.15, h);
      pointer(c, x1 + 2, fy - 30);
      // Key hints under the room: the back chevron + SPACE, the pause button + ESC.
      const y = P.y + h + 12;
      c.fillStyle = '#e8dcc0';
      for (let r = 0; r < 7; r++) {
        c.fillRect(P.x + 14 + r, y + r, 2, 1);
        c.fillRect(P.x + 26 - r, y + r, 2, 1);
      }
      hud.text(L().tutorial.controls.backKey, P.x + 40, y, '#a89c84');
      const py = y + 18;
      c.fillRect(P.x + 16, py - 1, 3, 9);
      c.fillRect(P.x + 22, py - 1, 3, 9);
      hud.text(L().tutorial.controls.pauseKey, P.x + 40, py, '#a89c84');
    },
  },
  {
    id: 'paintings',
    draw(k) {
      room(k);
      const { c, P } = k, h = 66, w = widthOf(k, 'painting02', h);
      const left = P.x + P.w / 2 - w / 2 - 6, top = P.y + 26;
      sprite(k, 'key', left + w - 14, top + 18, 24, { glow: WARM, blur: 8 }); // uncovered behind the right side
      // Hangs from the left nail, the right side swung down.
      sprite(k, 'painting02', left + w / 2, top + 8 + h / 2, h, { rot: 0.38, pivot: [left + 3, top + 8] });
      beam(k, left + w - 18, top + 30, 95, 0.1);
      c.fillStyle = '#1a1612';
      c.fillRect(left + 2, top + 7, 2, 2); // the nail
      pointer(c, left + w - 12, top + 22);
    },
  },
  {
    id: 'posters',
    draw(k) {
      const { c, P } = k, h = 96, sp = k.sprites.get('poster01');
      room(k);
      const w = Math.round(widthOf(k, 'poster01', h)), x0 = Math.round(P.x + (P.w - w) / 2), y0 = P.y + 14;
      sprite(k, 'health', x0 + w * 0.72, y0 + h * 0.22, 26, { glow: WARM, blur: 8 });
      if (sp) {
        // The poster with its top right torn away along a ragged line, with a pale paper rim.
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        const pc = cv.getContext('2d'), [bx0, by0, bx1, by1] = sp.box;
        pc.drawImage(sp.canvas, sp.ox + bx0, sp.oy + by0, bx1 - bx0, by1 - by0, 0, 0, w, h);
        const tear = [[0.42, 0], [0.47, 0.08], [0.44, 0.15], [0.52, 0.22], [0.5, 0.3], [0.6, 0.36], [0.66, 0.44],
          [0.75, 0.45], [0.82, 0.53], [0.9, 0.52], [1, 0.6]].map(([u, v]) => [u * w, v * h]);
        pc.beginPath();
        tear.forEach(([x, y], i) => (i ? pc.lineTo(x, y) : pc.moveTo(x, y)));
        pc.lineTo(w, 0);
        pc.closePath();
        pc.globalCompositeOperation = 'destination-out';
        pc.fill();
        pc.globalCompositeOperation = 'source-atop';
        pc.strokeStyle = '#80765e';
        pc.lineWidth = 3;
        pc.beginPath();
        tear.forEach(([x, y], i) => (i ? pc.lineTo(x, y) : pc.moveTo(x, y)));
        pc.stroke();
        c.drawImage(cv, x0, y0);
      }
      beam(k, x0 + w * 0.65, y0 + h * 0.3, 100, 0.1);
      pointer(c, x0 + w * 0.72 + 4, y0 + h * 0.22 + 4);
    },
  },
  {
    id: 'dark',
    draw(k) {
      const { c, P } = k, fy = room(k);
      sprite(k, 'door02', P.x + 34, fy - 40, 80);
      c.fillStyle = 'rgba(0,0,0,0.86)';
      c.fillRect(P.x, P.y, P.w, P.h);
      const sx = P.x + P.w * 0.68, sy = P.y + 62;
      glowOnly(k, 'light_switch', sx, sy, 22, 'rgba(255,214,140,0.7)', 12);
      sprite(k, 'light_switch', sx, sy, 22, { alpha: 0.12 });
      pointer(c, sx + 2, sy + 2);
    },
  },
  {
    id: 'levers',
    draw(k) {
      // A door on the left, the levers set up, down, down, down, up; the pointer on the last (glowing) one.
      const { c, P } = k, fy = room(k), ly = fy - 58, combo = [0, 1, 1, 1, 0], lx = (i) => P.x + 52 + i * 22;
      sprite(k, 'door09', P.x + 21, fy - 36, 72);
      combo.forEach((down, i) => lever(k, lx(i), ly, 20, down, i === 4 ? { glow: WARM, blur: 7 } : {}));
      beam(k, lx(2), ly, 85, 0.12);
      pointer(c, lx(4) + 2, ly + 3);
    },
  },
  {
    id: 'wired',
    draw(k) {
      // The same room, but a cable sags between each pair of levers; they are mixed up, the pointer on the middle one.
      const { c, P } = k, fy = room(k), ly = fy - 58, pos = [1, 0, 0, 1, 0], lx = (i) => P.x + 52 + i * 22;
      const wy = ly + 10 - CONFIG.cords.leverDrop * 20; // CONFIG.cords: a little above the plate's bottom edge
      sprite(k, 'door09', P.x + 21, fy - 36, 72);
      for (let i = 0; i < 4; i++) cord(c, lx(i), wy, lx(i + 1), wy, 4, rgb(CONFIG.cords.wire.color), 2);
      pos.forEach((down, i) => lever(k, lx(i), ly, 20, down, i === 2 ? { glow: WARM, blur: 7 } : {}));
      beam(k, lx(2), ly, 85, 0.12);
      pointer(c, lx(2) + 2, ly + 3);
    },
  },
  {
    id: 'crooked',
    draw(k) {
      // A door on the left, three paintings hanging from one nail each, leaning, tied by a cord between the nails.
      const { c, P } = k, fy = room(k), ny = P.y + 34, h = 24;
      const art = [['painting01', 0.2], ['painting05', 0], ['painting06', -0.2]], x = (i) => P.x + 64 + i * 34;
      sprite(k, 'door04', P.x + 21, fy - 36, 72);
      for (let i = 0; i < 2; i++) cord(c, x(i), ny, x(i + 1), ny, 3, rgb(CONFIG.cords.rope.color), 1.5);
      art.forEach(([id, rot], i) => {
        sprite(k, id, x(i), ny + 2 + h / 2, h, { rot, pivot: [x(i), ny], ...(i === 0 ? { glow: WARM, blur: 7 } : {}) });
        c.fillStyle = '#1a1612';
        c.fillRect(x(i) - 1, ny - 1, 2, 2); // the nail
      });
      beam(k, x(1), ny + 14, 90, 0.12);
      pointer(c, x(0) + 2, ny + 14);
    },
  },
  {
    id: 'trapdoors',
    draw(k) {
      // No door: levers on the wall, and on the floor the open trapdoor (assets.js TRAP) with the gold key inside.
      const { c, P } = k, fy = room(k), tx = P.x + 52, h = 54, sp = k.sprites.get('trapdoor_open');
      const ly = fy - 62, lx = (i) => P.x + 86 + i * 18;
      [1, 0, 1, 1].forEach((down, i) => lever(k, lx(i), ly, 17, down));
      const holeY = fy + 18; // the hole's centre, below the floor line
      if (sp) {
        // The sprite is drawn by its tight box, so shift it until TRAP.holeY lands on holeY.
        const [, by0, , by1] = sp.box, f = h / (by1 - by0);
        sprite(k, 'trapdoor_open', tx, holeY - (TRAP.holeY - (by0 + by1) / 2) * f, h);
        sprite(k, 'master_key', tx, holeY, 15, { glow: WARM, blur: 8 });
      }
      beam(k, tx + 10, fy, 90, 0.12);
      pointer(c, tx + 3, holeY + 2);
    },
  },
  {
    id: 'ghosts',
    draw(k) {
      const { c, P } = k;
      c.fillStyle = '#000';
      c.fillRect(P.x, P.y, P.w, P.h);
      // The ghost art is very dark on an opaque black background: added on top, three times, like the game's gain.
      for (let i = 0; i < 3; i++) sprite(k, 'ghost01', P.x + P.w / 2, P.y + P.h / 2, 120, { comp: 'lighter' });
    },
  },
  {
    id: 'health',
    draw(k) {
      const { c, P, hud } = k;
      room(k);
      beam(k, P.x + P.w / 2, P.y + P.h / 2, 90, 0.25);
      const v = c.createRadialGradient(P.x + P.w / 2, P.y + P.h / 2, 40, P.x + P.w / 2, P.y + P.h / 2, 110);
      v.addColorStop(0, 'rgba(110,0,0,0)');
      v.addColorStop(1, 'rgba(110,0,0,0.6)');
      c.fillStyle = v;
      c.fillRect(P.x, P.y, P.w, P.h);
      // Heart at 40%: the lost top part grey (Hud.drainedHeart), the rest red.
      const sp = k.sprites.get('heart');
      if (sp) {
        const [bx0, by0, bx1, by1] = sp.box, bw = bx1 - bx0, bh = by1 - by0, dh = 64, dw = Math.round((bw * dh) / bh);
        const x0 = P.x + 18, y0 = P.y + P.h - dh - 14, cut = Math.round(dh * 0.6), sy0 = sp.oy + by0 + (cut / dh) * bh;
        c.drawImage(hud.drainedHeart(sp), 0, 0, bw, bh, x0, y0, dw, dh);
        c.drawImage(sp.canvas, sp.ox + bx0, sy0, bw, sp.oy + by1 - sy0, x0, y0 + cut, dw, dh - cut);
      }
      // Pills held: the HUD chip (pill art + count).
      const px = P.x + P.w - 62, py = P.y + 12;
      c.fillStyle = 'rgba(0,0,0,0.7)';
      c.fillRect(px - 3, py - 2, 22 + 3 + 11 + 6, 26);
      sprite(k, 'health', px + 11, py + 11, 22);
      hud.text('x2', px + 25, py + 8, '#a89c84');
      pointer(c, px + 14, py + 14);
    },
  },
];
