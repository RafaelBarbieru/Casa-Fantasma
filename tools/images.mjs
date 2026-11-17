// Image sources -> web images (zero npm deps, needs ffmpeg with libwebp on PATH, or set the FFMPEG env var).
//   node tools/images.mjs [--force]
// art-src/**/*.png|jpg|jpeg  ->  assets/**/<name>.webp  (lossy, QUALITY, alpha preserved)
// art-src/**/*.webp          ->  assets/**/<name>.webp  (copied as-is: already web-ready)
// Incremental by mtime; deletes generated .webp whose source is gone. assets/ is generated (gitignored),
// except assets/audio/ which tools/audio.mjs owns. Run by predev/prebuild and by serve.mjs on file changes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC = path.join(ROOT, 'art-src');
const OUT = path.join(ROOT, 'assets');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const QUALITY = 90; // libwebp lossy 0-100. Pre-rendered art: 90 is visually clean and ~8x smaller than PNG.
const force = process.argv.includes('--force');

const walk = (dir, rel = '') =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name), rel + e.name + '/') : [rel + e.name])
    : [];

const sources = walk(SRC).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
const expected = new Map(); // out path -> source rel (detects png+webp with the same name)
const jobs = [];
for (const rel of sources) {
  const base = rel.replace(/\.[^.]+$/, '');
  if (base !== base.toLowerCase() || /\s/.test(base))
    console.warn(`! art-src/${rel}: prefer lowercase names without spaces (web paths are case-sensitive)`);
  const src = path.join(SRC, rel);
  const out = path.normalize(path.join(OUT, base + '.webp'));
  if (expected.has(out)) {
    console.warn(`! art-src/${rel}: ignored, art-src/${expected.get(out)} already makes assets/${base}.webp`);
    continue;
  }
  expected.set(out, rel);
  const fresh = fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs;
  if (force || !fresh) jobs.push({ rel, src, out, copy: /\.webp$/i.test(rel) });
}

// Remove orphans (source deleted/renamed). Never touch assets/audio/.
for (const rel of walk(OUT)) {
  if (rel.startsWith('audio/') || !/\.webp$/i.test(rel)) continue;
  const f = path.normalize(path.join(OUT, rel));
  if (!expected.has(f)) {
    fs.rmSync(f);
    console.log(`- removed orphan assets/${rel}`);
  }
}

if (!jobs.length) {
  console.log(`✓ images up to date (${expected.size} source${expected.size === 1 ? '' : 's'})`);
  process.exit(0);
}

if (jobs.some((j) => !j.copy)) {
  const probe = spawnSync(FFMPEG, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (probe.error) {
    console.error(`✗ ffmpeg not found. Install it (e.g. "winget install Gyan.FFmpeg") or set the FFMPEG env var.`);
    process.exit(1);
  }
  if (!/\blibwebp\b/.test(probe.stdout)) {
    console.error(`✗ this ffmpeg has no libwebp encoder. Install a full build (e.g. "winget install Gyan.FFmpeg").`);
    process.exit(1);
  }
}

const run = (argv) =>
  new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim()))));
  });

async function convert({ rel, src, out, copy }) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (copy) {
    fs.copyFileSync(src, out);
    console.log(`✓ art-src/${rel}  copied`);
    return;
  }
  // RGBA input reaches libwebp as bgra, so alpha survives (fully opaque images drop it, which is fine).
  // Write to a temp name first so a failed encode never leaves a half-written file the game could load.
  const tmp = out + '.tmp.webp';
  await run(['-y', '-v', 'error', '-i', src, '-frames:v', '1', '-map_metadata', '-1',
    '-c:v', 'libwebp', '-lossless', '0', '-quality', String(QUALITY), '-compression_level', '6', tmp]);
  fs.renameSync(tmp, out);
  const kb = (f) => (fs.statSync(f).size / 1024).toFixed(1);
  console.log(`✓ art-src/${rel}  ${kb(src)} KB -> ${kb(out)} KB`);
}

let failed = 0;
const queue = jobs.slice();
await Promise.all(
  Array.from({ length: Math.min(queue.length, Math.max(1, os.cpus().length - 1)) }, async () => {
    for (let j; (j = queue.shift()); ) {
      try {
        await convert(j);
      } catch (e) {
        failed++;
        fs.rmSync(j.out + '.tmp.webp', { force: true });
        console.error(`✗ art-src/${j.rel}: ${e.message}`);
      }
    }
  }),
);
process.exit(failed ? 1 : 0);
