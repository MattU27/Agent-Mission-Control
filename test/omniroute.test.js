import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeQuota, fetchOmni } from '../src/omniroute.js';

const fx = name => JSON.parse(readFileSync(new URL(`./fixtures/omni-${name}.json`, import.meta.url)));
const limits = fx('limits').caches;
const NOW = Date.parse('2026-11-09T04:21:00Z');

test('normalizeQuota maps full Pro windows', () => {
  const q = normalizeQuota(limits['e865a941-fef9-4a90-a016-64e1b4c24eda'], NOW);
  assert.equal(Math.round(q.claude5h.remainingPct), 25);
  assert.equal(q.claude5h.resetAt, '2026-11-09T07:45:20.000Z');
  assert.equal(Math.round(q.claude7d.remainingPct), 62);
  assert.equal(Math.round(q.gemini5h.remainingPct), 95);
  assert.equal(Math.round(q.argon7d.remainingPct), 100);
  assert.equal(q.plan, 'Pro');
  assert.equal(q.stale, false);
});

test('normalizeQuota prefers gemini_4_argon_weekly over argon_weekly', () => {
  const q = normalizeQuota({ fetchedAt: new Date(NOW).toISOString(), quotas: {
    argon_weekly: { remainingPercentage: 50, resetAt: 'a' },
    gemini_4_argon_weekly: { remainingPercentage: 9, resetAt: 'b' } } }, NOW);
  assert.deepEqual(q.argon7d, { remainingPct: 9, resetAt: 'b' });
});

test('legacy-only cache yields null windows and stale flag', () => {
  const q = normalizeQuota(limits['149a5346-f03d-4ac6-8757-7711eb0aca11'], NOW);
  for (const k of ['claude5h', 'claude7d', 'gemini5h', 'gemini7d', 'argon7d']) assert.equal(q[k], null, k);
  assert.equal(q.stale, true);
});

test('bare session/weekly map to claude windows using remaining/total', () => {
  const q = normalizeQuota(limits['1f9f9e47-92f8-47e4-8822-1b50899cca5d'], NOW);
  assert.equal(q.claude5h.remainingPct, 100);
  assert.equal(q.claude7d.remainingPct, 74);
});

test('missing cache yields all-null, stale', () => {
  const q = normalizeQuota(undefined, NOW);
  assert.equal(q.claude5h, null);
  assert.equal(q.stale, true);
});

function fakeFetch(map) {
  return async (url, opts) => {
    assert.match(opts.headers.authorization, /^Bearer k$/);
    const path = new URL(url).pathname;
    if (!(path in map)) return new Response('nope', { status: 404 });
    const v = map[path];
    return v instanceof Response ? v : Response.json(v);
  };
}
const ALL = { '/api/providers': fx('providers'), '/api/usage/provider-limits': fx('limits'), '/api/combos': fx('combos'), '/api/usage/call-logs': fx('calls') };
const cfg = { omniUrl: 'http://omni', omniKey: 'k' };

test('fetchOmni returns 10 antigravity accounts sorted by priority', async () => {
  const r = await fetchOmni(cfg, fakeFetch(ALL), NOW);
  assert.equal(r.ok, true);
  assert.equal(r.accounts.length, 10);
  assert.deepEqual(r.accounts.map(a => a.priority), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const a = r.accounts.find(a => a.id.startsWith('e865a941'));
  assert.equal(Math.round(a.quota.claude5h.remainingPct), 25);
  assert.equal(typeof a.active, 'boolean');
  const off = r.accounts.find(a => !a.active);
  assert.match(off.lastError, /forbidden/);
});

test('fetchOmni maps combos and calls', async () => {
  const r = await fetchOmni(cfg, fakeFetch(ALL), NOW);
  assert.deepEqual(r.combos.map(c => c.name), ['agy-fast', 'agy-brain']);
  assert.equal(r.combos[1].steps[0].model, 'claude-opus-5-5-high');
  assert.equal(r.combos[1].steps.length, 4);
  const c = r.calls[0];
  for (const k of ['id', 'ts', 'model', 'account', 'connectionId', 'combo', 'step', 'status', 'ms', 'ttft', 'tin', 'tout', 'tcache', 'treason', 'error']) assert.ok(k in c, k);
  assert.ok(r.calls.some(c => c.status === 403 && c.error));
});

test('fetchOmni reports 401 as not ok without throwing', async () => {
  const r = await fetchOmni(cfg, fakeFetch({ ...ALL, '/api/providers': new Response('{}', { status: 401 }) }), NOW);
  assert.equal(r.ok, false);
  assert.match(r.error, /401/);
});

test('fetchOmni reports network failure as not ok', async () => {
  const r = await fetchOmni(cfg, async () => { throw new TypeError('fetch failed'); }, NOW);
  assert.equal(r.ok, false);
  assert.match(r.error, /fetch failed/);
});
