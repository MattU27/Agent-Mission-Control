import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub } from '../src/hub.js';
import { createServer } from '../server.js';

const cfg = { omniKey: 'sk-secret-xyz' };

function adapters() {
  const state = { omni: { ok: true, accounts: [1], key: 'n/a' }, hermes: { ok: true, sessions: [] } };
  return {
    state,
    omni: async () => state.omni,
    hermes: () => state.hermes,
    dora: () => ({ ok: false, error: 'not connected' }),
  };
}

test('snapshot has data and per-source status after poll', async () => {
  const a = adapters();
  const hub = createHub(cfg, a);
  await hub.pollAll();
  const s = hub.snapshot();
  assert.deepEqual(s.omni, { accounts: [1], key: 'n/a' });
  assert.equal(s.sources.omni.ok, true);
  assert.equal(typeof s.sources.omni.at, 'number');
  assert.equal(s.sources.dora.ok, false);
  assert.equal(s.sources.dora.error, 'not connected');
});

test('failing source keeps last good data and flags not ok', async () => {
  const a = adapters();
  const hub = createHub(cfg, a);
  await hub.pollAll();
  const goodAt = hub.snapshot().sources.omni.at;
  a.state.omni = { ok: false, error: 'HTTP 401' };
  await hub.poll('omni');
  const s = hub.snapshot();
  assert.deepEqual(s.omni.accounts, [1]);
  assert.equal(s.sources.omni.ok, false);
  assert.equal(s.sources.omni.error, 'HTTP 401');
  assert.equal(s.sources.omni.at, goodAt);
});

test('patches emit only on change', async () => {
  const a = adapters();
  const hub = createHub(cfg, a);
  const got = [];
  hub.subscribe(p => got.push(p));
  await hub.poll('hermes');
  await hub.poll('hermes');
  assert.equal(got.length, 1);
  assert.equal(got[0].source, 'hermes');
  a.state.hermes = { ok: true, sessions: [{ id: 'x' }] };
  await hub.poll('hermes');
  assert.equal(got.length, 2);
  assert.deepEqual(got[1].data.sessions, [{ id: 'x' }]);
  assert.equal(got[1].status.ok, true);
});

test('a throwing subscriber cannot reject the poll or starve other subscribers', async () => {
  const hub = createHub(cfg, adapters());
  const got = [];
  hub.subscribe(() => { throw new Error('socket gone'); });
  hub.subscribe(p => got.push(p.source));
  await hub.poll('hermes'); // must not reject
  assert.deepEqual(got, ['hermes']);
});

test('adapter that throws is contained', async () => {
  const hub = createHub(cfg, { ...adapters(), hermes: () => { throw new Error('boom'); } });
  await hub.poll('hermes');
  assert.equal(hub.snapshot().sources.hermes.error, 'boom');
});

test('snapshot and stream never contain the OmniRoute key', async () => {
  const hub = createHub(cfg, adapters());
  await hub.pollAll();
  assert.doesNotMatch(JSON.stringify(hub.snapshot()), /sk-secret-xyz/);
  const srv = createServer(hub);
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const snap = await (await fetch(`${base}/api/snapshot`)).text();
    assert.doesNotMatch(snap, /sk-secret-xyz/);
    const ac = new AbortController();
    const res = await fetch(`${base}/api/stream`, { signal: ac.signal });
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const reader = res.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /retry:/);
    ac.abort();
  } finally { srv.closeAllConnections(); srv.close(); }
});
