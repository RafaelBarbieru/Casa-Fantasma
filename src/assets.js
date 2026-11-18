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
  return out;
}
