const STALE_MS = 15 * 60 * 1000;
// first key present wins
const WINDOWS = {
  claude5h: ['claude_gpt_session', 'session'],
  claude7d: ['claude_gpt_weekly', 'weekly'],
  gemini5h: ['gemini_session'],
  gemini7d: ['gemini_weekly'],
  argon7d: ['gemini_4_argon_weekly', 'argon_weekly'],
};

const pct = q => q.remainingPercentage ?? (q.total ? (100 * (q.remaining ?? q.total - (q.used ?? 0))) / q.total : null);

export function normalizeQuota(cache, now = Date.now()) {
  const quotas = cache?.quotas ?? {};
  const out = { plan: cache?.plan ?? null, fetchedAt: cache?.fetchedAt ?? null };
  for (const [name, keys] of Object.entries(WINDOWS)) {
    const q = keys.map(k => quotas[k]).find(Boolean);
    out[name] = q && pct(q) != null ? { remainingPct: pct(q), resetAt: q.resetAt ?? null } : null;
  }
  out.stale = !out.fetchedAt || now - Date.parse(out.fetchedAt) > STALE_MS;
  return out;
}

const stripProvider = m => (m ?? '').replace(/^[^/]+\//, '');
const INTERNAL = new Set(['connection-test', 'model-sync']); // OmniRoute's own health probes, not traffic

export async function fetchOmni(cfg, fetchImpl = fetch, now = Date.now()) {
  const get = async path => {
    const res = await fetchImpl(cfg.omniUrl + path, {
      headers: { authorization: `Bearer ${cfg.omniKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return res.json();
  };
  try {
    const [prov, limits, combos, calls] = await Promise.all([
      get('/api/providers'), get('/api/usage/provider-limits'), get('/api/combos'), get('/api/usage/call-logs?limit=100'),
    ]);
    return {
      ok: true,
      fetchedAt: new Date(now).toISOString(),
      accounts: prov.connections
        .filter(c => c.provider === 'antigravity')
        .sort((a, b) => a.priority - b.priority)
        .map(c => ({
          id: c.id, email: c.email || c.name, priority: c.priority, active: !!c.isActive,
          status: c.testStatus, rateLimitedUntil: c.rateLimitedUntil ?? null, lastUsedAt: c.lastUsedAt ?? null,
          lastError: c.lastError ?? null, lastErrorAt: c.lastErrorAt ?? null,
          quota: normalizeQuota(limits.caches?.[c.id], now),
        })),
      combos: combos.combos
        .filter(c => !c.isHidden)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map(c => ({ name: c.name, strategy: c.strategy, steps: c.models.map(m => ({ id: m.id, model: stripProvider(m.model) })) })),
      calls: calls.filter(c => !INTERNAL.has(c.model)).map(c => ({
        id: c.id, ts: c.timestamp, model: c.model, account: c.account, connectionId: c.connectionId,
        combo: c.comboName ?? null, step: c.comboStepId ?? null, status: c.status, ms: c.duration, ttft: c.ttft ?? null,
        tin: c.tokens?.in ?? 0, tout: c.tokens?.out ?? 0, tcache: c.tokens?.cacheRead ?? 0, treason: c.tokens?.reasoning ?? 0,
        error: c.error ?? null,
      })),
    };
  } catch (e) {
    return { ok: false, error: e.cause?.message ? `${e.message}: ${e.cause.message}` : e.message };
  }
}
