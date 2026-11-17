// Release build (zero deps):
//   1. validates every asset path in data/*.json exists with EXACT case (itch.io hosting is case-sensitive, Windows isn't)
//   2. copies runtime files into dist/web/ (asset folders filtered to web formats only)
//   3. zips dist/web/ into dist/casa-fantasma-web.zip with index.html at the zip root (itch.io HTML5 upload)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'web');
const ZIP = path.join(DIST, 'casa-fantasma-web.zip');
const INCLUDE = ['index.html', 'src', 'data', 'assets'];
const WEB_EXT = new Set(['.html', '.js', '.json', '.css', '.webp', '.png', '.jpg', '.jpeg', '.svg', '.ogg', '.mp3', '.m4a', '.wav', '.woff2', '.glb', '.wasm']);

let errors = 0;

// --- 1. validate referenced paths (exact case)
function existsExactCase(rel) {
  let dir = ROOT;
  for (const seg of rel.split('/')) {
    if (!fs.existsSync(dir) || !fs.readdirSync(dir).includes(seg)) return false;
    dir = path.join(dir, seg);
  }
  return true;
}
function collectSrc(obj, out = []) {
  if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) k === 'src' && typeof v === 'string' ? out.push(v) : collectSrc(v, out);
  return out;
}
for (const f of fs.readdirSync(path.join(ROOT, 'data')).filter((f) => f.endsWith('.json'))) {
  for (const src of collectSrc(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')))) {
    if (!existsExactCase(src)) {
      console.error(`✗ data/${f}: "${src}" not found (check exact upper/lower case)`);
      errors++;
    }
  }
}
if (errors) process.exit(1);

// --- 2. copy
fs.rmSync(DIST, { recursive: true, force: true });
const files = [];
const skipped = [];
function copy(rel) {
  const src = path.join(ROOT, rel);
  if (fs.statSync(src).isDirectory()) {
    for (const e of fs.readdirSync(src)) copy(rel + '/' + e);
    return;
  }
  if (!WEB_EXT.has(path.extname(rel).toLowerCase())) return skipped.push(rel);
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  files.push(rel);
}
INCLUDE.forEach(copy);
if (skipped.length) console.warn(`skipped non-web files:\n  ${skipped.join('\n  ')}`);

// --- 3. zip
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
const locals = [];
const central = [];
let offset = 0;
for (const rel of files) {
  const data = fs.readFileSync(path.join(OUT, rel));
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const store = deflated.length >= data.length;
  const body = store ? data : deflated;
  const name = Buffer.from(rel, 'utf8');
  const crc = crc32(data);
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(store ? 0 : 8, 8);
  h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12); h.writeUInt32LE(crc, 14);
  h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(store ? 0 : 8, 10);
  c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16);
  c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28);
  c.writeUInt32LE(offset, 42);
  locals.push(h, name, body);
  central.push(c, name);
  offset += h.length + name.length + body.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.writeFileSync(ZIP, Buffer.concat([...locals, cd, end]));

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`✓ ${files.length} files -> ${path.relative(ROOT, OUT)}`);
console.log(`✓ ${path.relative(ROOT, ZIP)} (${kb(fs.statSync(ZIP).size)})`);
