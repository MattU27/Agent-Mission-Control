import { shortModel, band, fmtDur, nextHighWater, callsPerMin, stepHits, shortAccount, todayTokens, fmtNum, localDay, clock, refillIn, sessionWhen } from './lib.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const set = (el, html) => { if (el.__h !== html) { el.innerHTML = html; el.__h = html; } };
const ago = ms => (ms == null ? '—' : `${fmtDur(Date.now() - ms)} ago`);
const WINDOWS = [
  ['claude5h', 'Claude', '5h'], ['claude7d', 'Claude', '7d'],
  ['gemini5h', 'Gemini', '5h'], ['gemini7d', 'Gemini', '7d'], ['argon7d', 'Argon', '7d'],
];
const BAND_WORD = { deep: 'plenty', mid: 'falling', shoal: 'low', dry: 'exhausted', none: 'no data' };

export function serverDown() {
  const el = document.getElementById('almanac');
  el.querySelector('.lamp')?.classList.replace('on', 'off');
  const s = el.querySelector('.srv');
  if (s) s.textContent = 'Mission Control server unreachable — retrying';
}

export function sources(snap) {
  for (const el of document.querySelectorAll('.src')) {
    const s = snap.sources?.[el.dataset.src];
    if (!s) continue;
    el.classList.toggle('bad', !s.ok);
    el.textContent = s.ok ? '' : s.error === 'not connected' ? 'not connected' : `offline · last good ${s.at ? clock(s.at) : 'never'}`;
    el.title = s.error ?? '';
  }
}

export function almanac(el, snap) {
  const o = snap.omni, h = snap.hermes, up = snap.sources?.omni?.ok;
  const running = h?.sessions?.filter(s => s.state === 'running').length ?? 0;
  const subs = h?.sessions?.filter(s => s.state === 'running' && s.parentId).length ?? 0;
  const t = todayTokens(h?.tokensByDay ?? [], localDay());
  const hw = o ? nextHighWater(o.accounts) : null;
  const winName = Object.fromEntries(WINDOWS.map(([k, g, p]) => [k, `${g} ${p}`]));
  const active = o?.accounts.filter(a => a.active).length ?? 0;
  set(el, `
    <div class="mark"><span class="lamp ${up ? 'on' : 'off'}" aria-hidden="true"></span><b>Mission Control</b></div>
    <dl class="cell"><dt>Gateway</dt><dd class="srv">${up ? `OmniRoute up <small>${active}/${o.accounts.length} accounts routing</small>` : '<span class="haz">OmniRoute unreachable</span>'}</dd></dl>
    <dl class="cell"><dt>Turns underway</dt><dd>${running}${subs ? ` <small>${subs} sub-agent${subs > 1 ? 's' : ''}</small>` : ''}</dd></dl>
    <dl class="cell"><dt>Calls / min</dt><dd>${o ? callsPerMin(o.calls) : '—'} <small>5-min avg</small></dd></dl>
    <dl class="cell"><dt>Tokens today</dt><dd>${fmtNum(t.in + t.out)} <small>${fmtNum(t.cacheRead)} cached</small></dd></dl>
    <dl class="cell wide"><dt>Next high water</dt><dd>${hw ? `${fmtDur(Date.parse(hw.resetAt) - Date.now())} <small>${esc(shortAccount(hw.account))} · ${winName[hw.window]} at ${Math.round(hw.remainingPct)}%</small>` : '<small>all windows full</small>'}</dd></dl>
    <dl class="cell"><dt>Local</dt><dd class="clock">${clock(Date.now())}</dd></dl>`);
}

function gauge(q, label) {
  const b = band(q?.remainingPct);
  if (b === 'none') return `<div class="gauge" data-band="none" aria-label="${label}: no data"><span class="tank"></span><span class="read">—</span></div>`;
  const pct = Math.max(0, Math.min(100, q.remainingPct));
  const ms = refillIn(q);
  const reset = ms ? fmtDur(ms) : '';
  return `<div class="gauge" data-band="${b}" style="--lvl:${pct.toFixed(1)}%" role="img" aria-label="${label}: ${Math.round(pct)}% remaining, ${BAND_WORD[b]}${reset ? `, refills in ${reset}` : ''}">
    <span class="tank"><span class="water"></span></span><span class="read"><span class="pct">${Math.round(pct)}<small>%</small></span><span class="rst">${reset ? `refill ${reset}` : ''}</span></span></div>`;
}

const omniWait = snap => (snap.sources?.omni?.ok === false && snap.sources.omni.error !== 'pending'
  ? `<p class="empty"><span class="haz">OmniRoute unreachable.</span> Is the john-agentic-omniroute container running?</p>`
  : '<p class="empty">Waiting for OmniRoute…</p>');

export function tide(el, snap) {
  const o = snap.omni;
  if (!o) return set(el, omniWait(snap));
  if (!o.accounts.length) return set(el, '<p class="empty">No Antigravity accounts connected in OmniRoute.</p>');
  const lastCall = o.calls.find(c => c.status < 400);
  const rows = o.accounts.map(a => {
    const live = lastCall?.connectionId === a.id;
    const note = !a.active ? (a.lastError ?? 'disabled') : a.rateLimitedUntil && Date.parse(a.rateLimitedUntil) > Date.now()
      ? `cooling down · ${fmtDur(Date.parse(a.rateLimitedUntil) - Date.now())}` : a.quota.plan ?? '';
    const bad = !a.active || (a.rateLimitedUntil && Date.parse(a.rateLimitedUntil) > Date.now());
    const sounded = a.quota.fetchedAt ? Date.parse(a.quota.fetchedAt) : null;
    return `<tr class="${a.active ? '' : 'off'}">
      <td class="pri num">${a.priority}</td>
      <td class="who"><span class="line"><span class="buoy ${live ? '' : 'idle'}" title="${live ? 'served the latest call' : ''}"></span><span class="name">${esc(shortAccount(a.email))}</span></span>
        <span class="note ${bad ? 'haz' : ''}" title="${esc(note)}">${esc(note)}</span></td>
      ${WINDOWS.map(([k, g, p]) => `<td class="w">${gauge(a.quota[k], `${g} ${p}`)}</td>`).join('')}
      <td class="sounded ${a.quota.stale ? 'stale' : ''}" title="quota last fetched">${sounded ? ago(sounded) : 'never'}</td>
    </tr>`;
  }).join('');
  set(el, `<table class="tt">
    <thead><tr><th></th><th class="acct">Account</th>${WINDOWS.map(([, g, p]) => `<th class="w"><span class="grp">${g}</span>${p}</th>`).join('')}<th style="text-align:right">Sounded</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="legend"><span><i style="background:var(--deep)"></i>≥50% plenty</span><span><i style="background:var(--mid)"></i>20–50% falling</span><span><i style="background:var(--shoal)"></i>&lt;20% low</span><span><i style="background:repeating-linear-gradient(135deg,var(--hazard) 0 2px,transparent 2px 5px)"></i>exhausted</span><span>refill = time to quota reset</span><span><span class="buoy"></span>served the latest call</span></div>`);
}

export function routes(el, snap) {
  const o = snap.omni;
  if (!o) return set(el, '<p class="empty">Waiting for OmniRoute…</p>');
  set(el, o.combos.map(c => {
    const hits = stepHits(c, o.calls);
    const total = hits.reduce((s, h) => s + h.hits, 0);
    return `<div class="route"><div class="rname">${esc(c.name)}<small>${total} call${total === 1 ? '' : 's'}</small></div>
      <ol class="stations" aria-label="${esc(c.name)} fallback order">${hits.map(h => `
        <li class="station ${h.hits ? 'hot' : ''} ${h.latest ? 'latest' : ''}" style="list-style:none">
          <div class="m">${esc(shortModel(h.model))}</div>
          <div class="h">${h.hits ? `${h.hits} hit${h.hits > 1 ? 's' : ''}` : 'standby'}${h.errors ? `<span class="haz">${h.errors} err</span>` : ''}</div>
        </li>`).join('')}</ol></div>`;
  }).join('') || '<p class="empty">No combos defined.</p>');
}

export function log(el, snap, seen) {
  const o = snap.omni;
  if (!o) return set(el, '<p class="empty">Waiting for OmniRoute…</p>');
  const fit = Math.max(3, Math.floor((el.clientHeight - 22) / 27)); // whole rows only, never a half-cut line
  const calls = o.calls.slice(0, fit);
  const max = Math.max(1, ...calls.map(c => c.ms || 0));
  const first = seen.size === 0;
  const head = '<div class="call call-head"><span>Time</span><span>Model</span><span>Account / error</span><span style="text-align:right">In → out</span><span style="text-align:right">TTFT / total</span><span></span></div>';
  set(el, head + (calls.map(c => {
    const fresh = !first && !seen.has(c.id);
    seen.add(c.id);
    const err = c.status >= 400;
    return `<div class="call ${err ? 'err' : ''} ${fresh ? 'new' : ''}" title="${esc(c.error ?? '')}">
      <span class="t">${clock(Date.parse(c.ts))}</span>
      <span class="m">${esc(shortModel(c.model))}</span>
      <span class="acct">${err ? `${c.status} ${esc((c.error ?? 'upstream error').replace(/^\[\d+\]:\s*/, '').replace(/^Antigravity upstream error \(\d+\):\s*/, ''))}` : esc(shortAccount(c.account))}</span>
      <span class="tok">${fmtNum(c.tin)}<small> → </small>${fmtNum(c.tout)}</span>
      <span class="ms">${c.ttft ? `${(c.ttft / 1000).toFixed(1)}s<small> / </small>` : ''}${((c.ms || 0) / 1000).toFixed(1)}s</span>
      <span class="bar" aria-hidden="true"><span class="tot" style="width:${(100 * (c.ms || 0)) / max}%"></span><span class="ttft" style="width:${(100 * (c.ttft || 0)) / max}%"></span></span>
    </div>`;
  }).join('') || '<p class="empty">No calls yet.</p>'));
}

export function sessions(el, snap) {
  const h = snap.hermes;
  if (!h?.sessions) return set(el, '<p class="empty">Waiting for Hermes state.db…</p>');
  const byParent = new Map();
  for (const s of h.sessions) if (s.parentId) byParent.set(s.parentId, [...(byParent.get(s.parentId) ?? []), s]);
  // nest by parent at any depth; a child whose parent is absent becomes a root
  const ids = new Set(h.sessions.map(s => s.id));
  const roots = h.sessions.filter(s => !s.parentId || !ids.has(s.parentId));
  const walk = (s, depth) => [row(s, depth), ...(byParent.get(s.id) ?? []).flatMap(c => walk(c, depth + 1))];
  const row = (s, depth) => {
    const tok = s.tokens.in + s.tokens.out;
    const when = sessionWhen(s);
    return `<div class="sess ${s.state}" style="padding-left:${Math.min(depth, 3) * 20}px">
      <span class="st" role="img" aria-label="${s.state}"></span>
      <span class="ttl" title="${esc(s.title)}">${esc((s.title ?? 'Untitled').replace(/^Subagent:\s*/, ''))}${s.state !== 'ended' && s.activity ? `<span class="act">${esc(s.activity)}</span>` : ''}</span>
      <span class="meta">${esc(s.model ?? '')} · ${fmtNum(tok)} · ${when}</span></div>`;
  };
  const out = roots.flatMap(r => walk(r, 0));
  const fit = Math.max(3, Math.floor((el.clientHeight - 24) / 28));
  const shown = out.length > fit ? out.slice(0, fit - 1) : out;
  set(el, (shown.join('') || '<p class="empty">No sessions recorded.</p>') + (out.length > shown.length ? `<p class="more">+ ${out.length - shown.length} older</p>` : ''));
}

export function ledger(el, snap) {
  const rows = (snap.hermes?.tokensByDay ?? []).filter(r => r.day === localDay()).sort((a, b) => b.in - a.in).slice(0, 4);
  if (!rows.length) return set(el, '<p class="empty">No Hermes usage today.</p>');
  set(el, `<table class="lt"><thead><tr><th>Model</th><th>Calls</th><th>In</th><th>Out</th><th>Cached</th><th>Reasoning</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(r.model)}</td><td>${r.calls}</td><td>${fmtNum(r.in)}</td><td>${fmtNum(r.out)}</td><td>${fmtNum(r.cacheRead)}</td><td>${fmtNum(r.reasoning)}</td></tr>`).join('')}
  </tbody></table>`);
}

export function memory(el, snap) {
  const m = snap.hermes?.memories;
  if (!m) return set(el, '<p class="empty">Waiting for Hermes…</p>');
  const line = (name, x) => {
    const pct = Math.min(100, (100 * x.chars) / x.limit);
    return `<div class="mem"><span class="name">${name}</span><span class="fill ${pct >= 90 ? 'full' : ''}" role="img" aria-label="${name} ${Math.round(pct)}% of limit"><i style="width:${pct}%"></i></span>
      <span class="n">${x.chars.toLocaleString()} / ${x.limit.toLocaleString()}</span>
      <span class="entries" title="${esc(x.entries.join('\n\n'))}">${x.entries.length} entr${x.entries.length === 1 ? 'y' : 'ies'} · ${esc(x.entries.map(e => e.split(/\s+/).slice(0, 3).join(' ').replace(/[:,.(]+$/, '')).join(' · '))}</span></div>`;
  };
  set(el, line('Agent', m.memory) + line('User', m.user));
}

const WARN = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 3.6v4.2M7 9.6v.9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

export function dora(el, snap) {
  const s = snap.sources?.dora;
  if (s?.ok) return set(el, '<p class="empty">Connected.</p>');
  set(el, `<div class="dora-state">${WARN}Job tracker not connected</div>
    <p>Dora's Google Sheet isn't readable from this PC yet, so no job counts are shown.</p>
    <p>Connect via the Hermes google-workspace OAuth (read-only) or Google Drive for Desktop.</p>`);
}
