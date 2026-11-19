// Asset loading + sprite preprocessing (padding to POT for mipmaps, alpha hit mask).
import { CONFIG } from './config.js';

export async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export async function loadDB() {
  const [items, rooms, surfaces, ghosts] = await Promise.all(
    ['data/items.json', 'data/rooms.json', 'data/surfaces.json', 'data/ghosts.json'].map(loadJSON));
  return { items, rooms, surfaces, ghosts };
}

export async function loadImage(url) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new Error(`failed to load image ${url}`);
  }
  return img;
}

const pot = (n) => 2 ** Math.ceil(Math.log2(n));
const isPot = (n) => n > 0 && (n & (n - 1)) === 0;

// Sprite = image centered in a transparent power-of-two canvas (WebGL1 mipmaps need POT).
// Mip levels are what make the cheap shadow blur + glow possible (texture2D bias).
export function makeSprite(img) {
  const pad = CONFIG.spritePad;
  const w = img.naturalWidth ?? img.width, h = img.naturalHeight ?? img.height; // an <img> or a canvas
  const tw = pot(w + pad * 2), th = pot(h + pad * 2);
  const ox = (tw - w) >> 1, oy = (th - h) >> 1;
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, ox, oy);
  const px = ctx.getImageData(ox, oy, w, h).data;
  const mask = new Uint8Array(w * h);
  // box = tight bounds of the visible pixels [x0, y0, x1, y1) in native px (art often has a transparent margin).
  const box = [w, h, 0, 0];
  for (let i = 0; i < mask.length; i++) {
    if (px[i * 4 + 3] < CONFIG.hitAlpha) continue;
    mask[i] = 1;
    const x = i % w, y = (i / w) | 0;
    box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x + 1); box[3] = Math.max(box[3], y + 1);
  }
  if (box[2] <= box[0]) box.splice(0, 4, 0, 0, w, h);
  return { canvas, w, h, tw, th, ox, oy, mask, box };
}

// Lever clue (world.js `clue`): the combination as a row of arrows daubed on the wall in paint, up = 0, down = 1,
// left -> right. Drawn here instead of being art, one sprite per combination ("clue:0110..."). Native px: one arrow
// cell is 36 x 70 (CONFIG.levers.clue.scale scales it in the room).
export const clueId = (bits) => `clue:${bits.join('')}`;

export function makeClueSprite(bits) {
  const W = 36, H = 70, GAP = 14, DRIP = 26, [r, g, b] = CONFIG.levers.clue.paint;
  const canvas = document.createElement('canvas');
  canvas.width = bits.length * W + (bits.length - 1) * GAP;
  canvas.height = H + DRIP;
  const ctx = canvas.getContext('2d');
  const j = (a) => (Math.random() - 0.5) * a; // brush jitter
  ctx.lineCap = ctx.lineJoin = 'round';
  // A stroke = a few slightly offset passes of a thick brush, so the edges come out uneven.
  const stroke = (pts, width) => {
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(${r},${g},${b},${k ? 0.55 : 0.9})`;
      ctx.lineWidth = width * (k ? 0.7 + Math.random() * 0.4 : 1);
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + j(3), y + j(3)) : ctx.moveTo(x + j(2), y + j(2))));
      ctx.stroke();
    }
  };
  const drip = (x, y) => {
    const len = 6 + Math.random() * (DRIP - 8);
    ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
    ctx.fillRect(x - 1.5, y, 3, len);
    ctx.beginPath();
    ctx.arc(x, y + len, 2.5, 0, Math.PI * 2);
    ctx.fill();
  };
  bits.forEach((down, i) => {
    const cx = i * (W + GAP) + W / 2, t = 8, bt = H - 6; // shaft ends (top, bottom)
    const tip = down ? bt : t, tail = down ? t : bt, dir = down ? -1 : 1; // dir: from the tip toward the tail
    stroke([[cx, tail], [cx + j(4), (tip + tail) / 2], [cx, tip]], 8);
    stroke([[cx - W / 2 + 4, tip + dir * 22], [cx, tip], [cx + W / 2 - 4, tip + dir * 22]], 8);
    // Paint runs down from the lowest points.
    drip(cx + j(4), bt - 2);
    if (down) for (const sx of [-1, 1]) if (Math.random() < 0.5) drip(cx + sx * (W / 2 - 5), t + 18);
  });
  return makeSprite(canvas);
}

// Adds the clue sprites a world needs to `sprites` (once per combination).
export function addClueSprites(world, sprites) {
  for (const r of world.rooms) for (const it of r.items)
    if (it.clue && !sprites.has(clueId(it.clue))) sprites.set(clueId(it.clue), makeClueSprite(it.clue));
}

// Window extras, drawn here from the window art's size (no art files): 'window_sky' = the night behind the glass,
// 'window_face' = a head-and-shoulders silhouette standing outside (storms, see CONFIG.weather.faceChance). Both are
// the window's native size, so they share its rect. The game draws them self-lit: the face is black, so it only shows
// against the sky when lightning brightens it (except its eyes, faintly).
function addWindowSprites(sprites) {
  const win = sprites.get('window');
  if (!win) return;
  const [bx0, by0, bx1, by1] = win.box, W = bx1 - bx0, H = by1 - by0, inset = 4;
  const canvas = () => {
    const c = document.createElement('canvas');
    c.width = win.w;
    c.height = win.h;
    return [c, c.getContext('2d')];
  };
  // Sky: a dark blue gradient, a little lighter low down (the horizon), inside the frame's outer edge.
  const [sky, s] = canvas();
  const grad = s.createLinearGradient(0, by0, 0, by1);
  grad.addColorStop(0, 'rgb(12,16,30)');
  grad.addColorStop(1, 'rgb(30,36,52)');
  s.fillStyle = grad;
  s.fillRect(bx0 + inset, by0 + inset, W - 2 * inset, H - 2 * inset);
  sprites.set('window_sky', makeSprite(sky));
  // Face: head (tilted a little), long hair hanging past it, neck and shoulders down to the sill.
  const [face, f] = canvas();
  const cx = bx0 + W * 0.52, hy = by0 + H * 0.36;
  f.fillStyle = f.strokeStyle = 'rgb(3,3,5)';
  f.beginPath();
  f.ellipse(cx, hy, W * 0.19, H * 0.16, 0.12, 0, Math.PI * 2);
  f.fill();
  f.fillRect(cx - W * 0.07, hy, W * 0.14, H * 0.28);
  f.beginPath();
  f.moveTo(bx0 + W * 0.04, by1);
  f.quadraticCurveTo(bx0 + W * 0.06, by0 + H * 0.64, cx - W * 0.12, by0 + H * 0.6);
  f.lineTo(cx + W * 0.12, by0 + H * 0.6);
  f.quadraticCurveTo(bx1 - W * 0.06, by0 + H * 0.64, bx1 - W * 0.04, by1);
  f.closePath();
  f.fill();
  f.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1, a = 0.1 + (i / 9) * 0.08, x = cx + side * W * (0.13 + a * 0.4);
    f.beginPath();
    f.moveTo(cx + side * W * 0.08, hy - H * 0.13);
    f.quadraticCurveTo(x + side * 6, hy, x + side * (2 + (i % 3) * 3), hy + H * (0.16 + a));
    f.stroke();
  }
  f.fillStyle = 'rgb(95,95,88)'; // eyes
  for (const dx of [-0.07, 0.07]) {
    f.beginPath();
    f.arc(cx + W * dx, hy + H * 0.01 + dx * 8, 2.5, 0, Math.PI * 2);
    f.fill();
  }
  sprites.set('window_face', makeSprite(face));
}

// Cords tying wired levers / crooked paintings together (game.js makeCords): 'cord:wire' and 'cord:rope', one sagging
// span each (CONFIG.cords). CORD = its end points in native px: the game stretches and turns the sprite so they land
// on the two things it ties, so its sag and thickness grow with the span.
export const CORD = { x0: 6, x1: 250, y: 8 };

function addCordSprites(sprites) {
  for (const [id, k] of [['cord:wire', 'wire'], ['cord:rope', 'rope']]) {
    const C = CONFIG.cords[k], canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = CORD.y + C.sag + C.width + 6;
    const c = canvas.getContext('2d');
    // Quadratic sag: the control point sits twice as low as the curve's lowest point.
    const curve = (dy) => {
      c.beginPath();
      c.moveTo(CORD.x0, CORD.y + dy);
      c.quadraticCurveTo(128, CORD.y + 2 * C.sag + dy, CORD.x1, CORD.y + dy);
      c.stroke();
    };
    c.lineCap = 'round';
    c.strokeStyle = `rgb(${C.color.join(',')})`;
    c.lineWidth = C.width;
    curve(0);
    c.strokeStyle = `rgba(${C.shine.join(',')},0.7)`; // a thin highlight along the top edge
    c.lineWidth = Math.max(1, C.width / 3);
    curve(-C.width / 4);
    // Knots / clamps at both ends.
    c.fillStyle = `rgb(${C.color.join(',')})`;
    for (const x of [CORD.x0, CORD.x1]) {
      c.beginPath();
      c.arc(x, CORD.y, C.width * 0.9, 0, Math.PI * 2);
      c.fill();
    }
    sprites.set(id, makeSprite(canvas));
  }
}

// Trapdoor of a trapdoor room (world.js 8.): the art (data/items.json "trapdoor", a flat top-down texture) is laid
// on the floor in perspective. 'trapdoor' = the shut hatch; 'trapdoor_open' = the dark hole with the lid standing up
// behind it (the same texture, in shadow). Both have the same canvas size, so they share a rect.
// TRAP = native px of those canvases: size, the hatch's far/near edges and their half widths, the hole's centre height.
export const TRAP = { w: 320, h: 240, top: 150, bottom: 232, topHalf: 100, bottomHalf: 134, holeY: 191 };

function addTrapSprites(sprites) {
  const art = sprites.get('trapdoor');
  if (!art) return;
  const T = TRAP, cx = T.w / 2, tw = art.w, th = art.h;
  const canvas = () => {
    const c = document.createElement('canvas');
    c.width = T.w;
    c.height = T.h;
    return [c, c.getContext('2d')];
  };
  // The texture squeezed into a trapezoid from row y0 (half width h0) to row y1 (half width h1), one screen row at a
  // time. vAt(t) = texture row (0..1) at the share t of the way down; `flip` mirrors it top to bottom.
  const warp = (c, y0, y1, h0, h1, vAt, flip = false) => {
    for (let y = y0; y < y1; y++) {
      const t0 = (y - y0) / (y1 - y0), t1 = (y + 1 - y0) / (y1 - y0), half = h0 + (h1 - h0) * (t0 + t1) / 2;
      let v0 = vAt(t0), v1 = vAt(t1);
      if (flip) [v0, v1] = [1 - v1, 1 - v0];
      c.drawImage(art.canvas, art.ox, art.oy + v0 * th, tw, Math.max(1, (v1 - v0) * th), cx - half, y, half * 2, 1);
    }
  };
  // On the floor, depth goes as 1 / width: the far rows of the texture get squeezed (perspective-correct v).
  const floorV = (t) => {
    const half = T.topHalf + (T.bottomHalf - T.topHalf) * t;
    return (1 / T.topHalf - 1 / half) / (1 / T.topHalf - 1 / T.bottomHalf);
  };
  const hatch = (c, inset = 0) => {
    c.beginPath();
    c.moveTo(cx - T.topHalf + inset, T.top + inset);
    c.lineTo(cx + T.topHalf - inset, T.top + inset);
    c.lineTo(cx + T.bottomHalf - inset, T.bottom - inset);
    c.lineTo(cx - T.bottomHalf + inset, T.bottom - inset);
    c.closePath();
  };

  // Shut: the texture on the floor, with a dark gap all around it.
  const [shut, s] = canvas();
  warp(s, T.top, T.bottom, T.topHalf, T.bottomHalf, floorV);
  s.strokeStyle = 'rgb(14,10,7)';
  s.lineWidth = 3;
  hatch(s, 1);
  s.stroke();
  sprites.set('trapdoor', makeSprite(shut));

  // Open: the lid swung up against the far edge (its underside, in shadow), then the black shaft in front of it.
  const [open, o] = canvas();
  const lidTop = 26, lidHalf = T.topHalf - 6;
  warp(o, lidTop, T.top, lidHalf, T.topHalf, (t) => t, true);
  o.fillStyle = 'rgba(0,0,0,0.5)';
  o.beginPath();
  o.moveTo(cx - T.topHalf, T.top);
  o.lineTo(cx - lidHalf, lidTop);
  o.lineTo(cx + lidHalf, lidTop);
  o.lineTo(cx + T.topHalf, T.top);
  o.closePath();
  o.fill();
  o.fillStyle = 'rgb(14,10,7)';
  hatch(o);
  o.fill();
  const g = o.createLinearGradient(0, T.top, 0, T.bottom); // the far wall of the shaft is lit a little
  g.addColorStop(0, 'rgb(34,27,21)');
  g.addColorStop(0.35, 'rgb(6,5,4)');
  g.addColorStop(1, 'rgb(2,2,2)');
  o.fillStyle = g;
  hatch(o, 5);
  o.fill();
  sprites.set('trapdoor_open', makeSprite(open));
}

// Loads everything referenced by the db. Fine while the game is tiny; switch to per-room loading later.
export async function loadAssets(db, onProgress = () => {}) {
  const jobs = [];
  // Wall/floor textures tile (REPEAT + mipmaps), so they must be power-of-two sized.
  for (const group of ['walls', 'floors'])
    for (const [id, t] of Object.entries(db.surfaces[group])) jobs.push(['surface', id, t.src]);
  for (const [id, it] of Object.entries(db.items)) jobs.push(['item', id, it.src]);
  for (const [id, g] of Object.entries(db.ghosts.ghosts)) jobs.push(['item', id, g.src]);
  for (const [id, g] of Object.entries(db.ghosts.screamers)) jobs.push(['screamer', id, g.src]);
  const out = { surfaces: new Map(), sprites: new Map(), screamers: new Map() };
  let done = 0;
  await Promise.all(
    jobs.map(async ([kind, id, src]) => {
      const img = await loadImage(src);
      if (kind === 'surface') {
        if (!isPot(img.naturalWidth) || !isPot(img.naturalHeight))
          console.warn(`[casa] ${src} is ${img.naturalWidth}x${img.naturalHeight}; tiling textures must be power-of-two (256, 512...)`);
        out.surfaces.set(id, img);
      } else if (kind === 'screamer') out.screamers.set(id, img);
      else out.sprites.set(id, makeSprite(img));
      onProgress(++done / jobs.length);
    }),
  );
  addWindowSprites(out.sprites);
  addCordSprites(out.sprites);
  addTrapSprites(out.sprites);
  return out;
}
