# Agent Mission Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A localhost, read-only, live dashboard over OmniRoute, Hermes state/memories, and Dora's job tracker.

**Architecture:** A single Node 24 process with zero npm dependencies. Source adapters poll into one in-memory snapshot, which is served as JSON plus SSE diffs. A static vanilla-JS frontend renders the panels.

**Tech Stack:** Node 24 (`node:http`, `node:sqlite`, `fetch`, `fs.watch`, `node:test`), HTML/CSS/ES modules, inline SVG.

**Spec:** `docs/superpowers/specs/2026-11-09-agent-mission-control-design.md`

## Global Constraints
- Node >= 24. `package.json` has **no** `dependencies` or `devDependencies`.
- Bind `127.0.0.1` only. Default port `4747` (env `AMC_PORT`).
- Read-only everywhere. `state.db` is opened with `new DatabaseSync(path, { readOnly: true })`. HTTP calls to OmniRoute use GET only.
- `HERMES_OMNIROUTE_KEY` is read server-side from `E:/CData/AppData/hermes/.env`. It never goes in any response body.
- Paths come from env, with defaults: `HERMES_HOME=E:/CData/AppData/hermes`, `OMNIROUTE_URL=http://127.0.0.1:20128`.
- Display times in the local zone (UTC+8). Hermes stores epoch seconds and OmniRoute stores ISO UTC.

## Review Focus
1. OmniRoute is down or returns 401: its panels show "offline · last good HH:MM", and the Hermes panels keep updating. *(test in Task 2 and Task 4)*
2. Quota caches with only legacy per-model keys, bare `session`/`weekly`, or `argon_weekly` vs `gemini_4_argon_weekly` should normalize without crashing. Cells with no data render "—". A `fetchedAt` older than 15 min is flagged stale. *(Task 2)*
3. `state.db` is busy or mid-checkpoint: the read retries once and otherwise keeps the last snapshot, never throwing to the client. *(Task 3)*
4. The browser sleeps or the server restarts: EventSource reconnects and re-fetches the full `/api/snapshot`. *(Task 4)*
5. A memory file contains `§` inside an entry, or is empty. Split only on `\n§\n`, and an empty file gives zero entries. *(Task 3)*

---

### Task 1: Skeleton server
**Files:** create `package.json`, `server.js`, `src/config.js`, `public/index.html`, `test/server.test.js`, `.gitignore`
**Interfaces — Produces:** `loadConfig(env = process.env) -> { port, hermesHome, omniUrl, omniKey }` (parses `.env` lines `KEY=value`). `createServer(snapshotHub) -> http.Server` with routes `GET /` (static from `public/`), `GET /api/health -> {ok:true}`. Unknown paths return 404, and path traversal returns 403.
- [ ] `git init`. Write tests: health returns 200 `{ok:true}`; `/../server.js` returns 403; `loadConfig` reads the key from a temp `.env` and the value never appears in `JSON.stringify(createServer)` output paths.
- [ ] Run `node --test`: expect FAIL.
- [ ] Implement. `npm start` runs `node server.js`.
- [ ] Run `node --test`: expect PASS. Commit `feat: skeleton server`.

### Task 2: OmniRoute adapter
**Files:** create `src/omniroute.js`, `test/omniroute.test.js`, `test/fixtures/omni-*.json` (captured live, emails replaced with `acct1@x` …)
**Interfaces — Produces:**
- `fetchOmni(cfg) -> { ok, error?, accounts, combos, calls, fetchedAt }`
- `normalizeQuota(cache) -> { claude5h, claude7d, gemini5h, gemini7d, argon7d, plan, fetchedAt, stale }`. Each window is `{ remainingPct, resetAt } | null`. Key priority: `claude_gpt_session` → `session`; `gemini_4_argon_weekly` → `argon_weekly`. `stale = now - fetchedAt > 15 min`.
- `accounts[]: { id, email, priority, active, status, rateLimitedUntil, lastUsedAt, quota }`. Filter to `provider === 'antigravity'` and sort by priority.
- `calls[]: { id, ts, model, account, connectionId, combo, status, ms, ttft, tin, tout, tcache, treason, active }`
- [ ] Tests: the fixture with full windows maps correct pcts and resets; a legacy-only cache gives all-null windows; bare `session` maps to `claude5h`; an old `fetchedAt` gives `stale:true`; a fetch rejection or 401 gives `{ok:false,error}`.
- [ ] Fail, then implement (parallel `Promise.all` over `/api/providers`, `/api/usage/provider-limits`, `/api/combos`, `/api/usage/call-logs?limit=100`; 5s `AbortSignal.timeout`), then pass. Commit.

### Task 3: Hermes adapter
**Files:** create `src/hermes.js`, `test/hermes.test.js`
**Interfaces — Produces:**
- `readHermes(cfg) -> { ok, error?, sessions, tokensByDay, memories }`
- `sessions[]: { id, title, source, model, parentId, startedAt, endedAt, lastActivityAt, activity, state: 'running'|'idle'|'ended', tokens:{in,out,cacheRead,reasoning}, toolCalls }`. Last 50 sessions plus all open ones. `running` means an unexpired `session_turn_leases` row exists.
- `tokensByDay[]: { day, model, in, out, cacheRead, reasoning, calls }` for the last 7 days, from `session_model_usage`, with the day in local time.
- `parseMemory(text, limit) -> { entries: string[], chars, limit }`. Limits come from `config.yaml` keys `memory_char_limit` and `user_char_limit` (regex read, no YAML dependency).
- [ ] Tests: build a temp DB with the minimal real columns (sessions, session_model_usage, session_turn_leases). Check the parent/child link, running vs idle vs ended, and the day bucketing in UTC+8. `parseMemory` keeps a `§` that sits inside an entry; empty text gives `[]`. A locked/missing DB gives `{ok:false}` with no throw.
- [ ] Fail, then implement (new read-only connection per poll, closed after use), then pass. Commit.

### Task 4: Live hub + SSE
**Files:** create `src/hub.js`, `test/hub.test.js`. Modify `server.js`.
**Interfaces — Produces:** `createHub(cfg, {omni, hermes, dora}) -> { snapshot(), subscribe(fn) -> unsubscribe, start(), stop() }`. Routes: `GET /api/snapshot` returns the full snapshot `{ omni, hermes, dora, sources:{ omni:{ok,at,error}, hermes:{…}, dora:{…} } }`. `GET /api/stream` is SSE: `event: patch` with `{source, data}` whenever a source's JSON changes, plus a `: ping` every 15s.
- [ ] Tests (with injected fake adapters): a failing source keeps its last good data and sets `ok:false`; an unchanged poll emits no patch; the snapshot never contains `cfg.omniKey`.
- [ ] Fail, then implement (intervals per spec; memories via `fs.watch` with a 200ms debounce), then pass. Commit.

### Task 5: Design system + shell
**Files:** create `PRODUCT.md`, `DESIGN.md` (impeccable init), `public/styles.css`, `public/app.js`. Modify `public/index.html`.
- [ ] Run impeccable `context`/`init` (Operate mode), then read `reference/craft-floor.md`.
- [ ] Define tokens: OKLCH palette, type scale, tabular nums, spacing, and gauge thresholds (50/20/0). Pick fonts, self-hosted under `public/fonts/` or a system stack.
- [ ] `app.js`: fetch `/api/snapshot`, then `EventSource('/api/stream')`, applying patches through `render(source, data)`. On `error`, reconnect and refetch the snapshot. Lay out the status strip and the empty panel grid.
- [ ] Verify in the browser at 1440×900 and 1920×1080 (screenshot), with no console errors. Commit.

### Task 6: Panels
**Files:** create `public/panels/{status,runway,combos,calls,sessions,memory}.js` (each exports `render(el, snapshot)`). Modify `app.js`.
- [ ] Runway matrix: gauges, reset countdowns (ticked client-side every 1s), the live-account marker, the dimmed cooling/errored state, and the stale badge.
- [ ] Combo relay: step hit counts and the latest hop, from the last 100 calls (`combo` + `connectionId`).
- [ ] Call stream: the newest 30 calls with in-flight pulse.
- [ ] Sessions tree plus a 7-day per-model SVG sparkline. Memory budget bars and entry previews.
- [ ] Verify against live data: numbers match `curl /api/usage/provider-limits` for 2 spot-checked accounts and `sqlite3` totals for 1 session. Stop OmniRoute's network (or point `OMNIROUTE_URL` at a dead port) and confirm only the Omni panels go offline. Commit.

### Task 7: Dora panel *(scope set by the user's decision)*
**Files:** create `src/dora.js`, `test/dora.test.js`, `public/panels/dora.js`
**Interfaces — Produces:** `readDora(cfg) -> { ok, error?, counts:{<Status>:n}, attention:[{company, role, status, next, followUp, interview}] }`. It reads `Applications!A1:S` and `Technical VA Applications!A1:S` (read-only scope), and puts consent holds, items due within 48h, and interviews in `attention`.
- [ ] Tests with fixture rows: status counts and `M/d/yyyy` parsing in Asia/Manila.
- [ ] If the user chose (c), `readDora` returns `{ok:false,error:'not connected'}` and the panel shows how to connect. Commit.

### Task 8: Final verification
- [ ] `node --test` all green. Run impeccable `audit` then `polish` on `public/`. Confirm `npm start` works from a cold shell. Write a README with run steps (≤20 lines). Commit.
