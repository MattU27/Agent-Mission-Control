import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readHermes, parseMemory } from '../src/hermes.js';

const NOW = 1794198000; // 2026-11-09T04:20:00Z = 12:20 UTC+8
const day = s => s; // readability

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'amc-h-'));
  const db = new DatabaseSync(join(home, 'state.db'));
  db.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, model TEXT, parent_session_id TEXT,
      started_at REAL NOT NULL, ended_at REAL, message_count INTEGER DEFAULT 0, tool_call_count INTEGER DEFAULT 0,
      input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cache_read_tokens INTEGER DEFAULT 0,
      reasoning_tokens INTEGER DEFAULT 0, title TEXT, last_activity_at REAL, last_activity_description TEXT,
      archived INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE session_model_usage (session_id TEXT NOT NULL, model TEXT NOT NULL, task TEXT NOT NULL DEFAULT '',
      api_call_count INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0, reasoning_tokens INTEGER NOT NULL DEFAULT 0, first_seen REAL, last_seen REAL);
    CREATE TABLE session_turn_leases (conversation_id TEXT PRIMARY KEY, holder TEXT NOT NULL, acquired_at REAL NOT NULL, expires_at REAL NOT NULL);
  `);
  const ins = db.prepare(`INSERT INTO sessions (id, source, model, parent_session_id, started_at, ended_at, input_tokens, output_tokens, title, last_activity_at, last_activity_description)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  ins.run('p1', 'local', 'agy-brain', null, NOW - 600, null, 1000, 50, 'Parent', NOW - 5, 'tool running: terminal');
  ins.run('c1', 'subagent', 'agy-fast', 'p1', NOW - 500, NOW - 100, 200, 10, 'Child', NOW - 100, '');
  ins.run('idle', 'gui', 'agy-brain', null, NOW - 9000, null, 5, 5, 'Idle', NOW - 9000, '');
  ins.run('old', 'local', 'agy-brain', null, NOW - 86400 * 30, NOW - 86400 * 30, 1, 1, 'Ancient', null, null);
  db.prepare('INSERT INTO session_turn_leases VALUES (?,?,?,?)').run('p1', 'pid=1', NOW - 30, NOW + 600);
  db.prepare('INSERT INTO session_turn_leases VALUES (?,?,?,?)').run('idle', 'pid=2', NOW - 900, NOW - 300); // expired
  const u = db.prepare('INSERT INTO session_model_usage (session_id, model, api_call_count, input_tokens, output_tokens, cache_read_tokens, reasoning_tokens, first_seen) VALUES (?,?,?,?,?,?,?,?)');
  // 2026-11-08T17:00Z = 2026-11-09 01:00 UTC+8 → local day 2026-11-09
  u.run('p1', 'agy-brain', 3, 1000, 50, 900, 7, Date.parse('2026-11-08T17:00:00Z') / 1000);
  // 2026-11-08T15:00Z = 2026-11-08 23:00 UTC+8 → local day 2026-11-08
  u.run('c1', 'agy-fast', 2, 200, 10, 100, 3, Date.parse('2026-11-08T15:00:00Z') / 1000);
  u.run('c1', 'agy-fast', 1, 5, 5, 0, 0, Date.parse('2026-11-08T15:30:00Z') / 1000);
  db.close();
  mkdirSync(join(home, 'memories'));
  writeFileSync(join(home, 'memories', 'MEMORY.md'), 'Entry one\n§\nEntry § two');
  writeFileSync(join(home, 'memories', 'USER.md'), '');
  writeFileSync(join(home, 'config.yaml'), 'memory:\n  memory_char_limit: 2200   # x\n  user_char_limit: 1375\n');
  return home;
}

test('readHermes derives running/idle/ended and parent links', () => {
  const r = readHermes({ hermesHome: makeHome() }, NOW);
  assert.equal(r.ok, true);
  const by = Object.fromEntries(r.sessions.map(s => [s.id, s]));
  assert.equal(by.p1.state, 'running');
  assert.equal(by.idle.state, 'idle');
  assert.equal(by.c1.state, 'ended');
  assert.equal(by.c1.parentId, 'p1');
  assert.equal(by.p1.activity, 'tool running: terminal');
  assert.deepEqual(by.p1.tokens, { in: 1000, out: 50, cacheRead: 0, reasoning: 0 });
  assert.equal(by.p1.startedAt, NOW - 600);
});

test('readHermes buckets tokens by local (UTC+8) day and model, last 7 days', () => {
  const r = readHermes({ hermesHome: makeHome() }, NOW);
  const rows = r.tokensByDay.map(d => `${d.day}|${d.model}|${d.in}|${d.calls}`).sort();
  assert.deepEqual(rows, ['2026-11-08|agy-fast|205|3', '2026-11-09|agy-brain|1000|3']);
});

test('readHermes reads memories with limits from config.yaml', () => {
  const r = readHermes({ hermesHome: makeHome() }, NOW);
  assert.deepEqual(r.memories.memory.entries, ['Entry one', 'Entry § two']);
  assert.equal(r.memories.memory.limit, 2200);
  assert.equal(r.memories.user.limit, 1375);
  assert.deepEqual(r.memories.user.entries, []);
});

test('parseMemory splits only on newline-§-newline and counts chars', () => {
  const m = parseMemory('a\n§\nb § c\r\n§\r\nd', 100);
  assert.deepEqual(m.entries, ['a', 'b § c', 'd']);
  assert.equal(m.chars, 'a\n§\nb § c\r\n§\r\nd'.length);
  assert.equal(m.limit, 100);
  assert.deepEqual(parseMemory('   ', 10).entries, []);
});

test('hidden sessions do not crowd visible ones out of the recent-50 window', () => {
  const home = makeHome();
  const db = new DatabaseSync(join(home, 'state.db'));
  const ins = db.prepare('INSERT INTO sessions (id, source, started_at, ended_at, hidden) VALUES (?,?,?,?,1)');
  for (let i = 0; i < 60; i++) ins.run(`h${i}`, 'subagent', NOW - 50 + i, NOW - 40 + i);
  db.close();
  const r = readHermes({ hermesHome: home }, NOW);
  assert.ok(r.sessions.some(s => s.id === 'c1'), 'visible ended session c1 must still be listed');
  assert.ok(!r.sessions.some(s => s.id.startsWith('h')));
});

test('readHermes on missing db returns not ok without throwing', () => {
  const home = mkdtempSync(join(tmpdir(), 'amc-h-'));
  const r = readHermes({ hermesHome: home }, NOW);
  assert.equal(r.ok, false);
  assert.ok(r.error);
});
