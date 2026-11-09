import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = join(fileURLToPath(new URL('.', import.meta.url)), 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json',
};

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

function stream(req, res, hub) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  res.write('retry: 2000\n\n');
  const off = hub.subscribe(patch => res.write(`event: patch\ndata: ${JSON.stringify(patch)}\n\n`));
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => { off(); clearInterval(ping); });
}

async function serveStatic(pathname, res) {
  let rel;
  try { rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname); } catch { return json(res, 400, { error: 'bad path' }); }
  const file = normalize(join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + sep)) return json(res, 403, { error: 'forbidden' });
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch { json(res, 404, { error: 'not found' }); }
}

export function createServer(hub) {
  return http.createServer((req, res) => {
    if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/api/health') return json(res, 200, { ok: true });
    if (pathname === '/api/snapshot') return json(res, 200, hub.snapshot());
    if (pathname === '/api/stream') return stream(req, res, hub);
    serveStatic(pathname, res);
  });
}

export function listenErrorMessage(err, port) {
  return err.code === 'EADDRINUSE'
    ? `Port ${port} is already in use — Mission Control may already be running at http://127.0.0.1:${port}.\nTo run another instance, pick a free port, e.g.:  AMC_PORT=4748 npm start`
    : `Mission Control could not listen on 127.0.0.1:${port}: ${err.message}`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const { loadConfig } = await import('./src/config.js');
  const { createHub } = await import('./src/hub.js');
  const cfg = loadConfig();
  const hub = createHub(cfg);
  const server = createServer(hub);
  server.on('error', err => { console.error(listenErrorMessage(err, cfg.port)); process.exit(1); });
  server.listen(cfg.port, '127.0.0.1', () => {
    hub.start(); // only poll once we actually own the port
    console.log(`Mission Control → http://127.0.0.1:${cfg.port}`);
  });
}
