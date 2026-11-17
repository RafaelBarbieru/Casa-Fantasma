// Asset loading + sprite preprocessing (padding to POT for mipmaps, alpha hit mask).
import { CONFIG } from './config.js';

export async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

export async function loadDB() {
  const [items, rooms] = await Promise.all([loadJSON('data/items.json'), loadJSON('data/rooms.json')]);
  return { items, rooms };
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

// Sprite = image centered in a transparent power-of-two canvas (WebGL1 mipmaps need POT).
// Mip levels are what make the cheap shadow blur + glow possible (texture2D bias).
export function makeSprite(img) {
  const pad = CONFIG.spritePad;
  const w = img.naturalWidth, h = img.naturalHeight;
  const tw = pot(w + pad * 2), th = pot(h + pad * 2);
  const ox = (tw - w) >> 1, oy = (th - h) >> 1;
  const canvas = document.createElement('canvas');
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, ox, oy);
  const px = ctx.getImageData(ox, oy, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = px[i * 4 + 3] >= CONFIG.hitAlpha ? 1 : 0;
  return { canvas, w, h, tw, th, ox, oy, mask };
}

// Loads everything referenced by the db. Fine while the game is tiny; switch to per-room loading later.
export async function loadAssets(db, onProgress = () => {}) {
  const jobs = [];
  for (const [id, r] of Object.entries(db.rooms)) jobs.push(['room', id, r.src]);
  for (const [id, it] of Object.entries(db.items)) jobs.push(['item', id, it.src]);
  const out = { rooms: new Map(), sprites: new Map() };
  let done = 0;
  await Promise.all(
    jobs.map(async ([kind, id, src]) => {
      const img = await loadImage(src);
      if (kind === 'room') out.rooms.set(id, img);
      else out.sprites.set(id, makeSprite(img));
      onProgress(++done / jobs.length);
    }),
  );
  return out;
}
