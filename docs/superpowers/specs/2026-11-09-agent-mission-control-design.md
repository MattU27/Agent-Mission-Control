# Agent Mission Control — Design

## Intent
One local screen that answers, at a glance: **Is my agent stack healthy, what is it doing right now, and how much runway is left?**
Today that answer is spread across the OmniRoute dashboard, Hermes Desktop, memory files, and a Google Sheet that Dora maintains.

## Goals
- Live quota runway for each Antigravity Pro account: the 5h ("session") and 7d ("weekly") windows, with reset countdowns.
- Live view of the routing combos agy-brain and agy-fast: which step and account is serving each request right now.
- Live call stream: model, account, tokens in/out/cache/reasoning, latency, TTFT, status.
- Hermes sessions: what's running now, the parent→sub-agent tree, and tokens per day per model.
- Memory budget: MEMORY.md and USER.md entries against their char limits (2200 / 1375).
- Dora pipeline: job tracker counts by status, plus pending consent and interview items. *(Needs Drive access — see open decision.)*

## Non-goals
- Writes of any kind. No changes to OmniRoute settings, Hermes state, memories, or the job sheet.
- Multiple users, auth, or remote access. It's localhost only.
- Rebuilding the OmniRoute dashboard. Mission Control links out to it for deep dives.

## Anti-goals
- A generic "AI SaaS dashboard" look (gradient cards, glassmorphism, hero numbers with no context).
- Secrets reaching the browser: the OmniRoute key and OAuth tokens stay server-side.
- Locking or corrupting a live DB.

## Grounded data sources (verified 2026-11-09)
| Source | Access | Key facts |
|---|---|---|
| OmniRoute `127.0.0.1:20128` | HTTP REST with `Authorization: Bearer $HERMES_OMNIROUTE_KEY` (from `E:/CData/AppData/hermes/.env`, scope `manage`) | `/api/providers` returns 12 connections (10 `antigravity`). `/api/usage/provider-limits` returns `{caches:{<connId>:{plan,fetchedAt,quotas:{claude_gpt_session, claude_gpt_weekly, gemini_session, gemini_weekly, gemini_4_argon_weekly\|argon_weekly, …}}}}`, where each quota is `{used,total:1000,remainingPercentage,resetAt}`. Some caches carry only legacy per-model keys or bare `session`/`weekly` keys. `/api/combos` gives the ordered model chains. `/api/usage/call-logs?limit=N` gives rich rows (`tokens.{in,out,cacheRead,reasoning}`, `duration`, `connectionId`, `comboName`, `active`). |
| OmniRoute SQLite | WAL, on a Docker volume (not host-mounted), and the container has no sqlite3 binary | **Not used.** The API covers everything. |
| Hermes `E:/CData/AppData/hermes/state.db` | SQLite WAL, opened read-only with `node:sqlite` | `sessions` (epoch-second REALs; token columns; `parent_session_id`; `source`; `last_activity_description`), `session_model_usage` (per model/task tokens), `session_turn_leases` (live turn when `expires_at > now`), `async_delegations`. |
| Hermes memories | `memories/MEMORY.md`, `USER.md`, with entries split on `\n§\n` | Limits come from `config.yaml` (`memory_char_limit` 2200, `user_char_limit` 1375). |
| Dora Drive | Folder `<DORA_DRIVE_FOLDER_ID>`; Sheet `<JOB_TRACKER_SHEET_ID>` (tabs `Applications`, `Technical VA Applications`; 19 cols A:S; Status col K) | **There's no local access yet**: no Drive for Desktop, no gws or rclone, no `google_token.json`. |

## How it gets made (my calls, ponytail)
- **Backend:** one Node 24 process with **zero npm dependencies**. It uses `node:http`, `node:sqlite` (built in and verified working), global `fetch`, and `fs.watch`. Server-Sent Events push live updates. It binds `127.0.0.1:4747`.
- **Frontend:** static HTML, CSS, and vanilla ES modules served by the same process. There's no build step, no framework, and no CDN, so it works offline.
- **Live model:** server-side pollers refresh an in-memory snapshot. Intervals: call-logs and state.db every 3s, providers and limits every 30s, memories on file change, Drive every 10 min. A failing source marks only its own panel as stale/offline and keeps its last good data.
- **Tests:** `node --test`, using fixtures captured from the live API (emails redacted) and a temporary SQLite DB built with the real schema subset.

## UI direction (impeccable, Operate mode)
- **Metaphor:** a flight-ops instrument panel, not a card grid. Dense, aligned, tabular numerals, and calm until something needs attention.
- **Layout (1440–1920 wide, single screen, no page scroll on 1080p):**
  1. **Status strip:** gateway up/down, live turns, calls/min, tokens today, and the soonest quota reset.
  2. **Runway matrix (hero):** 10 account rows × 5 window columns (Claude 5h · Claude 7d · Gemini 5h · Gemini 7d · Argon 7d). Each cell is a thin horizontal gauge plus a reset countdown. Rows are ordered by priority. The account that served the most recent call gets a live marker. Cooling-down or errored accounts are dimmed and show the reason.
  3. **Combo relay:** agy-brain and agy-fast drawn as 4-step chains. Each step lights up when calls land on it, and fallbacks are visible as hops.
  4. **Call stream:** a monospace ticker with the newest call on top and in-flight calls pulsing.
  5. **Sessions:** a running/idle/ended tree of parent → sub-agents with live activity text, plus a 7-day tokens-per-model sparkline.
  6. **Memory budget and Dora pipeline:** compact side panels.
- **Color:** OKLCH near-black neutrals with a slight warm tint, and one signal hue for "attention". Green is used only for a healthy gateway, and red only for exhausted or errored. Remaining-quota hue steps at 50% / 20% / 0%.
- **Motion:** only for state changes (a new call slides in, a gauge eases, a live pulse). It honors `prefers-reduced-motion`.
- **Fonts:** decided at build after the impeccable craft-floor read. They'll be self-hosted woff2 or a system stack, never a CDN.

## Open decision (the user's)
**Dora data access.** Options:
- (a) Hermes google-workspace OAuth, read-only scopes. This is a one-time consent you'd need to do.
- (b) Install Google Drive for Desktop.
- (c) Ship v1 without Dora (the panel shows "not connected") and add it later.

## Left to the builder
Exact fonts and spacing scale, the copy for empty/offline states, the sparkline implementation (inline SVG), and the port if 4747 is taken.
