/**
 * WANDERER — dev server
 * --------------------
 * A dependency-free static server. ES modules need to be served over http
 * (browsers refuse `file://` module graphs), and .js must go out as
 * `text/javascript` or Chrome blocks the import.
 *
 *   node server.mjs [port]
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const HOST = '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    // never serve anything outside the project root
    const target = resolve(join(ROOT, normalize(pathname)));
    if (!target.startsWith(ROOT + sep) && target !== ROOT) {
      res.writeHead(403).end('forbidden');
      return;
    }

    let info;
    try { info = await stat(target); } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('404 not found'); return; }
    if (info.isDirectory()) {
      res.writeHead(302, { location: pathname.replace(/\/?$/, '/index.html') }).end();
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': MIME[extname(target).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-cache',
      'cross-origin-opener-policy': 'same-origin',
    });
    res.end(body);
  } catch (err) {
    console.error('[server]', err);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('internal error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`WANDERER dev server  →  http://localhost:${PORT}/`);
  console.log(`serving ${ROOT}`);
});
