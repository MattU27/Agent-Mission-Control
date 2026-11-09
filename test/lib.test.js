import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortModel, band, fmtDur, nextHighWater, callsPerMin, stepHits, shortAccount, todayTokens, refillIn, sessionWhen, comboTotals, entriesLabel, rowState, handoffSummary } from '../public/lib.js';

test('comboTotals counts every call tagged with the combo, incl. ones that never reached a step', () => {
  const combo = { name: 'agy-brain', steps: [{ model: 'claude-opus-5-5-high' }, { model: 'claude-sonnet-5-5-high' }] };
  const calls = [
    { combo: 'agy-brain', model: 'claude-opus-5-5-high', status: 200 },
    { combo: 'agy-brain', model: 'antigravity/claude-sonnet-5-5-high', status: 429 },
    { combo: 'agy-brain', model: 'agy-brain', status: 400 },   // failed at gateway before routing
    { combo: 'agy-brain', model: null, status: 503 },
    { combo: 'agy-fast', model: 'claude-opus-5-5-high', status: 500 },
  ];
  assert.deepEqual(comboTotals(combo, calls), { calls: 4, errors: 3, unrouted: 2 });
});

test('stepHits matches provider-prefixed call models', () => {
  const combo = { name: 'agy-brain', steps: [{ model: 'claude-opus-5-5-high' }] };
  const r = stepHits(combo, [{ combo: 'agy-brain', model: 'antigravity/claude-opus-5-5-high', status: 200, ts: 'a' }]);
  assert.equal(r[0].hits, 1);
});

test('entriesLabel has no trailing separator when empty', () => {
  assert.equal(entriesLabel([]), '0 entries');
  assert.equal(entriesLabel(['Developer on Windows 11, prefers']), '1 entry · Developer on Windows');
  assert.equal(entriesLabel(['A: x', 'B c d e']), '2 entries · A: x · B c d');
});

test('rowState: disabled → off, rate-limited → cooling, else normal', () => {
  const now = Date.parse('2026-11-09T05:00:00Z');
  assert.equal(rowState({ active: false }, now), 'off');
  assert.equal(rowState({ active: true, rateLimitedUntil: '2026-11-09T05:10:00Z' }, now), 'cooling');
  assert.equal(rowState({ active: true, rateLimitedUntil: '2026-11-09T04:50:00Z' }, now), '');
  assert.equal(rowState({ active: true, rateLimitedUntil: null }, now), '');
});

test('refillIn only counts future resets of drawn-down windows', () => {
  const now = Date.parse('2026-11-09T04:30:00Z');
  assert.equal(refillIn({ remainingPct: 40, resetAt: '2026-11-09T05:30:00Z' }, now), 3600e3);
  assert.equal(refillIn({ remainingPct: 40, resetAt: '2026-11-09T04:00:00Z' }, now), null); // already elapsed
  assert.equal(refillIn({ remainingPct: 100, resetAt: '2026-11-09T05:30:00Z' }, now), null); // full
  assert.equal(refillIn({ remainingPct: 40, resetAt: null }, now), null);
});

test('sessionWhen never renders epoch-zero ages', () => {
  const now = 1794198000e3;
  assert.equal(sessionWhen({ state: 'running' }, now), 'now');
  assert.equal(sessionWhen({ state: 'ended', endedAt: 1794198000 - 600 }, now), '10m ago');
  assert.equal(sessionWhen({ state: 'idle', lastActivityAt: null, startedAt: 1794198000 - 7200 }, now), 'idle 2h 0m');
  assert.equal(sessionWhen({ state: 'idle', lastActivityAt: null, startedAt: null }, now), 'idle');
  assert.equal(sessionWhen({ state: 'ended', endedAt: null }, now), 'ended');
});

test('shortModel names the real models', () => {
  assert.equal(shortModel('antigravity/claude-opus-5-5-high'), 'Opus 5.5');
  assert.equal(shortModel('claude-sonnet-5-5-high'), 'Sonnet 5.5');
  assert.equal(shortModel('gemini-4-argon-high'), 'Argon 4');
  assert.equal(shortModel('gemini-3.8-flash-high'), 'Flash 3.8');
  assert.equal(shortModel('weird-model'), 'weird-model');
  assert.equal(shortModel(null), '—');
});

test('band thresholds at 50 / 20 / 0', () => {
  assert.equal(band(100), 'deep');
  assert.equal(band(50), 'deep');
  assert.equal(band(49.9), 'mid');
  assert.equal(band(20), 'mid');
  assert.equal(band(19.9), 'shoal');
  assert.equal(band(0.4), 'dry');
  assert.equal(band(null), 'none');
});

test('fmtDur compacts durations', () => {
  assert.equal(fmtDur(0), '0m');
  assert.equal(fmtDur(59e3), '0m');
  assert.equal(fmtDur(3 * 3600e3 + 12 * 60e3), '3h 12m');
  assert.equal(fmtDur(6 * 86400e3 + 5 * 3600e3), '6d 5h');
  assert.equal(fmtDur(-5), '0m');
});

test('shortAccount keeps the local part', () => {
  assert.equal(shortAccount('someone.long@gmail.com'), 'someone.long');
  assert.equal(shortAccount(null), '—');
});

const NOW = Date.parse('2026-11-09T04:30:00Z');
const acct = (email, q, active = true) => ({ email, active, quota: q });
const w = (remainingPct, resetAt) => ({ remainingPct, resetAt });

test('nextHighWater picks soonest future reset of a drawn-down window, active accounts only', () => {
  const accounts = [
    acct('a@x', { claude5h: w(100, '2026-11-09T05:00:00Z'), gemini5h: w(80, '2026-11-09T07:00:00Z') }),
    acct('b@x', { claude5h: w(25, '2026-11-09T06:00:00Z'), claude7d: w(10, '2026-11-09T04:00:00Z') }),
    acct('c@x', { claude5h: w(1, '2026-11-09T04:40:00Z') }, false),
  ];
  assert.deepEqual(nextHighWater(accounts, NOW), { account: 'b@x', window: 'claude5h', resetAt: '2026-11-09T06:00:00Z', remainingPct: 25 });
  assert.equal(nextHighWater([], NOW), null);
});

test('callsPerMin averages the last 5 minutes', () => {
  const calls = [0, 30, 100, 200, 290, 400].map(s => ({ ts: new Date(NOW - s * 1000).toISOString() }));
  assert.equal(callsPerMin(calls, NOW), 1);
  assert.equal(callsPerMin([], NOW), 0);
});

test('stepHits counts calls and errors per combo step by model', () => {
  const combo = { name: 'agy-brain', steps: [{ model: 'claude-opus-5-5-high' }, { model: 'claude-sonnet-5-5-high' }] };
  const calls = [
    { combo: 'agy-brain', model: 'claude-opus-5-5-high', status: 200, ts: '2026-11-09T04:29:00Z' },
    { combo: 'agy-brain', model: 'claude-opus-5-5-high', status: 403, ts: '2026-11-09T04:28:00Z' },
    { combo: 'agy-brain', model: 'claude-sonnet-5-5-high', status: 200, ts: '2026-11-09T04:27:00Z' },
    { combo: 'agy-fast', model: 'claude-opus-5-5-high', status: 200, ts: '2026-11-09T04:26:00Z' },
  ];
  assert.deepEqual(stepHits(combo, calls), [
    { model: 'claude-opus-5-5-high', hits: 2, errors: 1, latest: true },
    { model: 'claude-sonnet-5-5-high', hits: 1, errors: 0, latest: false },
  ]);
});

test('todayTokens sums in/out/cache for the given local day', () => {
  const rows = [
    { day: '2026-11-09', in: 10, out: 2, cacheRead: 100 },
    { day: '2026-11-09', in: 5, out: 1, cacheRead: 0 },
    { day: '2026-11-08', in: 999, out: 999, cacheRead: 999 },
  ];
  assert.deepEqual(todayTokens(rows, '2026-11-09'), { in: 15, out: 3, cacheRead: 100 });
});

test('handoffSummary describes pending, answered, and idle Drive queues', () => {
  assert.deepEqual(
    handoffSummary({ inboxCount: 2, outboxCount: 1, pendingCount: 1, pending: [{ id: 'TASK-002' }], latest: { id: 'TASK-002', state: 'pending' } }),
    { live: true, status: '1 pending in Inbox · TASK-002', counts: 'Inbox 2 · Outbox 1' },
  );
  assert.deepEqual(
    handoffSummary({ inboxCount: 1, outboxCount: 1, pendingCount: 0, pending: [], latest: { id: 'TASK-001', state: 'answered' } }),
    { live: false, status: 'TASK-001 · result in Outbox', counts: 'Inbox 1 · Outbox 1' },
  );
  assert.deepEqual(
    handoffSummary({ inboxCount: 0, outboxCount: 0, pendingCount: 0, pending: [], latest: null }),
    { live: false, status: 'No handoff files', counts: 'Inbox 0 · Outbox 0' },
  );
});
