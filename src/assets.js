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
  return out;
}
