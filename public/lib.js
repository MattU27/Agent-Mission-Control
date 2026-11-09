// Pure display helpers shared by panels; tested in test/lib.test.js.

const MODEL_NAMES = [
  [/claude-opus-(\d+)-(\d+)/, (_, a, b) => `Opus ${a}.${b}`],
  [/claude-sonnet-(\d+)-(\d+)/, (_, a, b) => `Sonnet ${a}.${b}`],
  [/gemini-(\d+(?:\.\d+)?)-argon/, (_, v) => `Argon ${v}`],
  [/gemini-(\d+(?:\.\d+)?)-flash/, (_, v) => `Flash ${v}`],
];

export function shortModel(m) {
  if (!m) return '—';
  for (const [re, fn] of MODEL_NAMES) { const x = m.match(re); if (x) return fn(...x); }
  return m.replace(/^[^/]+\//, '');
}

export function band(pct) {
  if (pct == null) return 'none';
  if (pct >= 50) return 'deep';
  if (pct >= 20) return 'mid';
  if (pct >= 1) return 'shoal';
  return 'dry';
}

export function fmtDur(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
}

export const shortAccount = e => (e ? e.split('@')[0] : '—');

// ms until a drawn-down window refills; null when full, unknown, or already past
export function refillIn(q, now = Date.now()) {
  if (!q?.resetAt || q.remainingPct == null || q.remainingPct >= 99.5) return null;
  const ms = Date.parse(q.resetAt) - now;
  return ms > 0 ? ms : null;
}

export function sessionWhen(s, now = Date.now()) {
  if (s.state === 'running') return 'now';
  if (s.state === 'ended') return s.endedAt ? `${fmtDur(now - s.endedAt * 1000)} ago` : 'ended';
  const t = s.lastActivityAt ?? s.startedAt;
  return t ? `idle ${fmtDur(now - t * 1000)}` : 'idle';
}

export function nextHighWater(accounts, now = Date.now()) {
  let best = null;
  for (const a of accounts) {
    if (!a.active) continue;
    for (const [window, q] of Object.entries(a.quota ?? {})) {
      if (!q || typeof q !== 'object' || q.remainingPct == null || q.remainingPct >= 99.5 || !q.resetAt) continue;
      const t = Date.parse(q.resetAt);
      if (t > now && (!best || t < Date.parse(best.resetAt))) best = { account: a.email, window, resetAt: q.resetAt, remainingPct: q.remainingPct };
    }
  }
  return best;
}

export function callsPerMin(calls, now = Date.now()) {
  return Math.round(calls.filter(c => now - Date.parse(c.ts) <= 300e3).length / 5);
}

const bareModel = m => (m ?? '').replace(/^[^/]+\//, '');

export function stepHits(combo, calls) {
  const mine = calls.filter(c => c.combo === combo.name);
  const latest = mine.reduce((a, c) => (!a || c.ts > a.ts ? c : a), null);
  return combo.steps.map(s => {
    const on = mine.filter(c => bareModel(c.model) === s.model);
    return { model: s.model, hits: on.length, errors: on.filter(c => c.status >= 400).length, latest: bareModel(latest?.model) === s.model };
  });
}

// whole-route totals: includes calls that failed before reaching any step (logged with the combo name or no model)
export function comboTotals(combo, calls) {
  const steps = new Set(combo.steps.map(s => s.model));
  const mine = calls.filter(c => c.combo === combo.name);
  return {
    calls: mine.length,
    errors: mine.filter(c => c.status >= 400).length,
    unrouted: mine.filter(c => !steps.has(bareModel(c.model))).length,
  };
}

export function entriesLabel(entries) {
  const n = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`;
  if (!entries.length) return n;
  return `${n} · ${entries.map(e => e.split(/\s+/).slice(0, 3).join(' ').replace(/[:,.(]+$/, '')).join(' · ')}`;
}

export function rowState(a, now = Date.now()) {
  if (!a.active) return 'off';
  return a.rateLimitedUntil && Date.parse(a.rateLimitedUntil) > now ? 'cooling' : '';
}

export function todayTokens(rows, day) {
  const t = { in: 0, out: 0, cacheRead: 0 };
  for (const r of rows) if (r.day === day) { t.in += r.in; t.out += r.out; t.cacheRead += r.cacheRead; }
  return t;
}

export const fmtNum = n => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

export const localDay = (ms = Date.now()) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10); // UTC+8

export const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' });

export function handoffSummary(h) {
  const counts = `Inbox ${h?.inboxCount ?? 0} · Outbox ${h?.outboxCount ?? 0}`;
  if (h?.pendingCount > 0) {
    const ids = (h.pending ?? []).slice(0, 2).map(p => p.id).join(', ');
    return { live: true, status: `${h.pendingCount} pending in Inbox${ids ? ` · ${ids}` : ''}`, counts };
  }
  if (h?.latest) {
    const where = h.latest.state === 'answered' ? 'result in Outbox' : 'in Inbox';
    return { live: false, status: `${h.latest.id} · ${where}`, counts };
  }
  return { live: false, status: 'No handoff files', counts };
}
