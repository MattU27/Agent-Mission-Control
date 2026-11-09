import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SESSIONS_SQL = `
  SELECT s.id, s.title, s.source, s.model, s.parent_session_id AS parentId,
         s.started_at AS startedAt, s.ended_at AS endedAt, s.last_activity_at AS lastActivityAt,
         s.last_activity_description AS activity, s.tool_call_count AS toolCalls,
         s.input_tokens AS tin, s.output_tokens AS tout, s.cache_read_tokens AS tcache, s.reasoning_tokens AS treason,
         EXISTS (SELECT 1 FROM session_turn_leases l WHERE l.conversation_id = s.id AND l.expires_at > :now) AS leased
  FROM sessions s
  WHERE s.hidden = 0 AND (s.ended_at IS NULL OR s.id IN (SELECT id FROM sessions ORDER BY started_at DESC LIMIT 50))
  ORDER BY COALESCE(s.last_activity_at, s.started_at) DESC`;

const TOKENS_SQL = `
  SELECT date(u.first_seen + :off, 'unixepoch') AS day, u.model,
         SUM(u.input_tokens) AS "in", SUM(u.output_tokens) AS out, SUM(u.cache_read_tokens) AS cacheRead,
         SUM(u.reasoning_tokens) AS reasoning, SUM(u.api_call_count) AS calls
  FROM session_model_usage u
  WHERE u.first_seen >= :since
  GROUP BY day, u.model ORDER BY day, u.model`;

export function parseMemory(text, limit) {
  return { entries: text.split(/\r?\n§\r?\n/).map(s => s.trim()).filter(Boolean), chars: text.length, limit };
}

function readText(file) {
  try { return readFileSync(file, 'utf8'); } catch { return ''; }
}

function readMemories(home) {
  const cfg = readText(join(home, 'config.yaml'));
  const lim = (key, dflt) => Number(cfg.match(new RegExp(`^\\s*${key}:\\s*(\\d+)`, 'm'))?.[1] ?? dflt);
  return {
    memory: parseMemory(readText(join(home, 'memories', 'MEMORY.md')), lim('memory_char_limit', 2200)),
    user: parseMemory(readText(join(home, 'memories', 'USER.md')), lim('user_char_limit', 1375)),
  };
}

function query(file, now, offSec) {
  // readOnly: never take a write lock on Hermes' live WAL db
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 500');
    const sessions = db.prepare(SESSIONS_SQL).all({ now }).map(r => ({
      id: r.id, title: r.title, source: r.source, model: r.model, parentId: r.parentId,
      startedAt: r.startedAt, endedAt: r.endedAt, lastActivityAt: r.lastActivityAt, activity: r.activity || '',
      toolCalls: r.toolCalls, state: r.leased ? 'running' : r.endedAt == null ? 'idle' : 'ended',
      tokens: { in: r.tin, out: r.tout, cacheRead: r.tcache, reasoning: r.treason },
    }));
    const tokensByDay = db.prepare(TOKENS_SQL).all({ off: offSec, since: now - 7 * 86400 }).map(r => ({ ...r }));
    return { sessions, tokensByDay };
  } finally { db.close(); }
}

export function readHermes(cfg, now = Date.now() / 1000) {
  const file = join(cfg.hermesHome, 'state.db');
  const offSec = (cfg.tzOffsetMin ?? 480) * 60; // display zone: UTC+8
  const memories = readMemories(cfg.hermesHome);
  if (!existsSync(file)) return { ok: false, error: `state.db not found at ${file}`, memories };
  for (let attempt = 0; ; attempt++) {
    try {
      return { ok: true, ...query(file, now, offSec), memories };
    } catch (e) {
      if (attempt >= 1) return { ok: false, error: e.message, memories };
    }
  }
}
