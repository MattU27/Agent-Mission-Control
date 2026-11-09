import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import { createServer, listenErrorMessage } from '../server.js';

test('listenErrorMessage explains a busy port and how to pick another', () => {
  const msg = listenErrorMessage(Object.assign(new Error('x'), { code: 'EADDRINUSE' }), 4747);
  assert.match(msg, /4747 is already in use/);
  assert.match(msg, /AMC_PORT=/);
  assert.match(listenErrorMessage(Object.assign(new Error('denied'), { code: 'EACCES' }), 80), /denied/);
});

const fakeHub = { snapshot: () => ({ ok: 1 }), subscribe: () => () => {} };

async function withServer(fn) {
  const srv = createServer(fakeHub);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base); } finally { srv.close(); }
}

test('GET /api/health returns ok', () => withServer(async base => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
}));

test('GET / serves index.html', () => withServer(async base => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
}));

test('path traversal is refused', () => withServer(async base => {
  const res = await fetch(`${base}/%2e%2e/server.js`);
  assert.ok([403, 404].includes(res.status), `got ${res.status}`);
  assert.doesNotMatch(await res.text(), /createServer/);
}));

test('unknown path is 404', () => withServer(async base => {
  assert.equal((await fetch(`${base}/nope.txt`)).status, 404);
}));

test('loadConfig reads key from HERMES_HOME/.env and applies defaults', () => {
  const home = mkdtempSync(join(tmpdir(), 'amc-'));
  writeFileSync(join(home, '.env'), 'FOO=1\nHERMES_OMNIROUTE_KEY="sk-test-123"\r\n');
  const cfg = loadConfig({ HERMES_HOME: home });
  assert.equal(cfg.omniKey, 'sk-test-123');
  assert.equal(cfg.port, 4747);
  assert.equal(cfg.omniUrl, 'http://127.0.0.1:20128');
  assert.equal(cfg.hermesHome, home);
});

test('loadConfig env var overrides .env and missing .env is fine', () => {
  const home = mkdtempSync(join(tmpdir(), 'amc-'));
  const cfg = loadConfig({ HERMES_HOME: home, HERMES_OMNIROUTE_KEY: 'k2', AMC_PORT: '5000' });
  assert.equal(cfg.omniKey, 'k2');
  assert.equal(cfg.port, 5000);
});
