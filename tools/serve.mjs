// Zero-dependency static dev server.
//   node tools/serve.mjs [--lan] [--port=5173] [--dir=dist/web]
// --lan binds 0.0.0.0 so phones/tablets on the same Wi-Fi can open it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const arg = (k) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const lan = args.includes('--lan');
const port = Number(arg('port')) || 5173;
const base = path.resolve(ROOT, arg('dir') || '.');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm',
};

http
  .createServer((req, res) => {
    let p;
    try {
      p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = path.resolve(base, '.' + p);
    if (file !== base && !file.startsWith(base + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) file = path.join(file, 'index.html');
      fs.stat(file, (err2, st2) => {
        if (err2 || !st2.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 ' + p);
          return;
        }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Content-Length': st2.size,
          'Cache-Control': 'no-store',
        });
        fs.createReadStream(file).pipe(res);
      });
    });
  })
  .listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
    console.log(`Serving ${path.relative(ROOT, base) || '.'}`);
    console.log(`  http://localhost:${port}/`);
    if (lan)
      for (const list of Object.values(os.networkInterfaces()))
        for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  http://${a.address}:${port}/`);
    console.log('  add ?debug for the debug overlay, ?seed=123 for a fixed world');
  });
