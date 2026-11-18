// Audio sources -> web audio (zero npm deps, needs ffmpeg + ffprobe on PATH, or set FFMPEG / FFPROBE env vars).
//   node tools/audio.mjs [--force]
// audio-src/**/*.wav|ogg|mp3|flac  ->  assets/audio/**/<name>.ogg (Opus) + <name>.m4a (AAC fallback for older Safari)
// Also writes assets/audio/index.json (every sound name), so the game can find sounds by prefix ("sfx/painting").
// Incremental: skips files whose outputs are newer than the source. Deletes outputs whose source is gone.
// Outputs are generated (gitignored). Runtime picks one format per device (src/audio.js), so players download one copy.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC = path.join(ROOT, 'audio-src');
const OUT = path.join(ROOT, 'assets', 'audio');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const force = process.argv.includes('--force');

// Bitrates by channel count. Opus is transparent much lower than AAC.
const RATES = {
  1: { opus: '64k', aac: '96k' },
  2: { opus: '112k', aac: '160k' },
};

// Sources whose name matches are always encoded mono (UI clicks gain nothing from stereo). Everything is 48 kHz.
const MONO = /(^|\/)ui_/;

const walk = (dir, rel = '') =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name), rel + e.name + '/') : [rel + e.name])
    : [];

const SRC_EXT = /\.(wav|ogg|mp3|flac)$/i;
const sources = walk(SRC).filter((f) => SRC_EXT.test(f));
const expected = new Set();
const names = new Map(); // name -> source rel (two sources with one name would overwrite each other)
const jobs = [];
for (const rel of sources) {
  const base = rel.replace(SRC_EXT, '');
  if (names.has(base)) {
    console.warn(`! audio-src/${rel}: ignored, audio-src/${names.get(base)} already makes ${base}`);
    continue;
  }
  names.set(base, rel);
  if (base !== base.toLowerCase() || /\s/.test(base))
    console.warn(`! audio-src/${rel}: prefer lowercase names without spaces (web paths are case-sensitive)`);
  const src = path.join(SRC, rel);
  const outs = { ogg: path.join(OUT, base + '.ogg'), m4a: path.join(OUT, base + '.m4a') };
  expected.add(path.normalize(outs.ogg));
  expected.add(path.normalize(outs.m4a));
  const srcTime = fs.statSync(src).mtimeMs;
  const fresh = (f) => fs.existsSync(f) && fs.statSync(f).mtimeMs >= srcTime;
  if (force || !fresh(outs.ogg) || !fresh(outs.m4a)) jobs.push({ rel, src, outs });
}

// Remove orphans (source deleted/renamed).
for (const rel of walk(OUT)) {
  const f = path.normalize(path.join(OUT, rel));
  if (/\.(ogg|m4a)$/i.test(rel) && !expected.has(f)) {
    fs.rmSync(f);
    console.log(`- removed orphan assets/audio/${rel}`);
  }
}

// Sound index for the runtime (only rewritten when it changes, so it doesn't look modified on every run).
const indexFile = path.join(OUT, 'index.json');
const index = JSON.stringify([...names.keys()].sort(), null, 1) + '\n';
fs.mkdirSync(OUT, { recursive: true });
if (!fs.existsSync(indexFile) || fs.readFileSync(indexFile, 'utf8') !== index) fs.writeFileSync(indexFile, index);

if (!jobs.length) {
  console.log(`✓ audio up to date (${sources.length} source${sources.length === 1 ? '' : 's'})`);
  process.exit(0);
}

if (spawnSync(FFMPEG, ['-version']).error) {
  console.error(`✗ ffmpeg not found. Install it (e.g. "winget install Gyan.FFmpeg") or set the FFMPEG env var.`);
  process.exit(1);
}

function channels(src) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', src], { encoding: 'utf8' });
  const n = parseInt(r.stdout, 10);
  return n === 1 ? 1 : 2; // >2 channels get downmixed to stereo below
}

const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim()))));
  });

async function encode({ rel, src, outs }) {
  const ch = MONO.test(rel) ? 1 : channels(src);
  const r = RATES[ch];
  fs.mkdirSync(path.dirname(outs.ogg), { recursive: true });
  const common = ['-y', '-v', 'error', '-i', src, '-map', '0:a:0', '-map_metadata', '-1', '-ac', String(ch), '-ar', '48000'];
  await run([...common, '-c:a', 'libopus', '-b:a', r.opus, '-vbr', 'on', '-application', 'audio', outs.ogg]);
  await run([...common, '-c:a', 'aac', '-b:a', r.aac, '-movflags', '+faststart', outs.m4a]);
  const kb = (f) => (fs.statSync(f).size / 1024).toFixed(1);
  console.log(`✓ ${rel}  ${ch === 1 ? 'mono' : 'stereo'}  ogg ${kb(outs.ogg)} KB  m4a ${kb(outs.m4a)} KB`);
}

let failed = 0;
const queue = jobs.slice();
await Promise.all(
  Array.from({ length: Math.min(queue.length, Math.max(1, os.cpus().length - 1)) }, async () => {
    for (let j; (j = queue.shift()); ) {
      try {
        await encode(j);
      } catch (e) {
        failed++;
        console.error(`✗ ${j.rel}: ${e.message}`);
      }
    }
  }),
);
process.exit(failed ? 1 : 0);
