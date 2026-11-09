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

export function stepHits(combo, calls) {
  const mine = calls.filter(c => c.combo === combo.name);
  const latest = mine.reduce((a, c) => (!a || c.ts > a.ts ? c : a), null);
  return combo.steps.map(s => {
    const on = mine.filter(c => c.model === s.model);
    return { model: s.model, hits: on.length, errors: on.filter(c => c.status >= 400).length, latest: latest?.model === s.model };
  });
}

export function todayTokens(rows, day) {
  const t = { in: 0, out: 0, cacheRead: 0 };
  for (const r of rows) if (r.day === day) { t.in += r.in; t.out += r.out; t.cacheRead += r.cacheRead; }
  return t;
}

export const fmtNum = n => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));

export const localDay = (ms = Date.now()) => new Date(ms + 8 * 3600e3).toISOString().slice(0, 10); // UTC+8

export const clock = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' });
