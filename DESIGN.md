# Agent Mission Control — Design System

## Thesis & Operating Context
Quota is a tide: it drains with consumption and refills on an astronomical schedule. The surface reads like a night nautical chart and tide almanac rather than a SaaS grid of KPI cards, refusing generic AI purple gradients, card wrappers, and decorative chrome. Mission Control operates always-on on a dedicated secondary monitor in a dim room during nocturnal coding sessions. It is engineered for peripheral-vision glance-reading in under three seconds: dark and tranquil when healthy, noticeable on state changes, and loud only on danger or runway exhaustion, requiring zero clicking or manual inspection.

## Color Tokens & State Semantics

| Token | OKLCH Value | Role |
|---|---|---|
| `--ground` | `oklch(0.175 0.032 248)` | Chart-navy base canvas / primary viewport background |
| `--ground-2` | `oklch(0.205 0.034 246)` | Almanac header strip background |
| `--basin` | `oklch(0.145 0.03 250)` | Recessed bed for empty gauge tanks, tracks, and latency bar gutters |
| `--rule` | `oklch(0.31 0.035 242)` | Primary structural grid borders and major panel dividers |
| `--rule-soft` | `oklch(0.25 0.033 244)` | Subdued internal row borders and column sub-dividers |
| `--ink` | `oklch(0.93 0.016 225)` | High-contrast primary text, headings, and active values |
| `--ink-2` | `oklch(0.80 0.028 228)` | Secondary text, subtitles, units, and ended session states |
| `--ink-3` | `oklch(0.72 0.032 232)` | Tertiary muted text, uppercase table headers, hints, empty states |
| `--deep` | `oklch(0.50 0.095 238)` | Depth band ≥50% ("plenty"): deep teal water fill, hot combo stations |
| `--mid` | `oklch(0.58 0.085 196)` | Depth band 20–50% ("falling"): cyan water fill, latency total bar, memory fill |
| `--shoal` | `oklch(0.68 0.105 62)` | Depth band 1–20% ("low"): warm sandy amber water fill and warning text |
| `--waterline` | `oklch(0.88 0.05 210)` | Wave crest indicator line (2px water top) and TTFT latency bar overlay |
| `--buoy` | `oklch(0.84 0.15 88)` | Live/current position indicator amber: latest call dot, active station, running session pulse |
| `--hazard` | `oklch(0.72 0.19 345)` | Chart magenta for errors and exhaustion: <1% dry hatch, 4xx/5xx errors, offline lamp |
| `--light` | `oklch(0.80 0.14 160)` | Gateway status indicator green: OmniRoute online and actively routing |

### State Semantics
- **Depth bands (remaining quota thresholds):**
  - `≥50%` (`deep` / "plenty"): Deep teal fill (`--deep`), bright waterline (`--waterline`).
  - `20–50%` (`mid` / "falling"): Mid cyan fill (`--mid`), bright waterline (`--waterline`).
  - `1–20%` (`shoal` / "low"): Warm sandy amber fill (`--shoal`), buoy amber waterline (`--buoy`), shoal percentage text.
  - `<1%` (`dry` / "exhausted"): Repeating diagonal 135° magenta stripes (`oklch(0.72 0.19 345 / 0.45)`), magenta border, magenta text.
- **Buoy amber (`--buoy`):** Exclusively signifies live / current position — marks the account that served the latest call, the latest active route fallback station, and pulsing status on active running sessions.
- **Hazard magenta (`--hazard`):** Reserved strictly for errors and runway exhaustion — upstream 4xx/5xx failures, dry/exhausted quota accounts, offline gateway lamp, and memory stores ≥90% full.
- **Light green (`--light`):** Gateway up only — lit when OmniRoute proxy is operational and routing traffic.

## Typography
- **UI Stack (`--f-ui`):** `Bahnschrift, "DIN Alternate", "Segoe UI Variable Text", system-ui, sans-serif` set with tabular numerals (`font-variant-numeric: tabular-nums; line-height: 1.35;`). Base root size: `15px`.
- **Data Stack (`--f-data`):** `Consolas, "Cascadia Mono", ui-monospace, monospace` used exclusively for the gateway soundings call log (`.log-body`).
- **Type Scale (rem values in CSS):**
  - `1.6rem`: Almanac local clock (`.almanac .clock`, weight 300).
  - `1.15rem`: Almanac metric values (`.almanac dd`), tide gauge percentage (`.gauge .pct`, weight 700).
  - `1.05rem`: Almanac header brand title (`.almanac .mark b`, weight 700).
  - `0.85rem`: Memory labels/counts (`.mem .name`, `.mem .n`), Dora notice body (`.dora p`), empty states (`.empty`).
  - `0.82rem`: Gateway call log monospace data (`.log-body`), almanac secondary metrics (`.almanac dd small`).
  - `0.8rem`: Panel titles (`h2`, uppercase 600), hints (`.hint`), source indicators (`.src`), gauge reset timing (`.gauge .rst`), legend, route subtitles, station metrics, session activity & metadata (`.sess .act`, `.sess .meta`), pagination notice (`.more`), memory preview entries (`.mem .entries`).
  - `0.75rem`: Almanac uppercase category labels (`dt`), uppercase table headers (`.tt th`, `.lt th`, `.call-head`).

## Spacing Scale
- `--s1: 4px`: Micro padding, border gaps, subtle vertical offsets.
- `--s2: 8px`: Compact gaps, table cell padding, status badge margins.
- `--s3: 12px`: Standard panel element gap, route station gaps, header margins.
- `--s4: 16px`: Panel vertical padding.
- `--s5: 24px`: Panel horizontal padding, session tree child step indentation.

## Signature Component: The Tide Gauge
A slim vertical fluid gauge (`.gauge`, height `clamp(30px, calc(5.4vh - 22px), 46px); min-width: 86px;`) representing remaining quota runway:
- **Tank (`.tank`):** 16px wide recessed column (`background: var(--basin)`, border `1px solid var(--rule)`). Includes 20% and 50% contour marks via background linear gradients (`oklch(0.45 0.04 240 / 0.7)`).
- **Water Column (`.water`):** Fills from the floor (`inset: auto 0 0 0; height: var(--lvl, 0%)`) with color mapped to depth band (`--deep`, `--mid`, `--shoal`).
- **Waterline:** 2px wave line across the liquid surface (`.water::before`, `var(--waterline)`, switches to `var(--buoy)` on shoal).
- **Reading (`.read`):** Set beside the tank; displays bold tabular percentage (`.pct`, e.g. `87%`) stacked over reset countdown (`.rst`, e.g. `refill 2h 15m`).
- **Exhausted State (`[data-band="dry"]`):** Hatched diagonal 135° magenta striping across the tank with magenta border and percentage read.

## Other Components
- **Almanac Strip (`.almanac`):** Top full-width bar (min-height 66px / 58px compact) on `var(--ground-2)`. Displays gateway status lamp (`.lamp.on` / `.lamp.off`), turns underway with sub-agent counts, 5-min rolling calls/min, total daily tokens with cache reads, next high water account & reset window, and Shanghai local clock.
- **Route Stations (`.route`, `.stations`):** Horizontal 4-station fallback pipeline (`Opus` → `Sonnet` → `Argon` → `Flash`) connected by a 2px track. Stations show model, hits, errors; hot stations highlight in deep teal, latest active station in buoy amber.
- **Soundings Rows (`.call`, `.bar`):** Monospace gateway call log. Each row displays timestamp, model, account or upstream error, token transfer (`In → out`), duration (`TTFT / total`), and proportional latency bar (dark teal total duration with light teal TTFT overlay).
- **Session Tree (`.sess`):** Hierarchical agent execution tree with indentation (`depth * 20px`). Displays session title, active sub-agent action in buoy amber, model, token tally, recency, and pulsing status dot for running turns.
- **Memory Bars (`.mem`):** Dual capacity meters for Agent and User persistent notes against limit. Displays character count, bar track (`var(--basin)`) with fill (`var(--mid)` turning `var(--hazard)` when ≥90%), and preview snippet of entries.
- **Dora Pipeline (`.dora`):** Honest un-mocked missing connection notice with hazard warning icon, explaining the Dora Google Sheet tracker is unlinked in v1 with instructions to connect via OAuth or Drive.

## Motion & Transitions
- **Easing:** Smooth decelerated cubic bezier curve (`--ease: cubic-bezier(0.16, 1, 0.3, 1)`).
- **Animated Properties:**
  - Water level adjustments: `height 1.2s var(--ease)`, `background-color 0.6s var(--ease)`.
  - New call row entry: `animation: rise 0.8s var(--ease)` (translateY(-6px) entry with buoy amber flash fade).
  - Running session status: `animation: pulse 1.6s ease-in-out infinite` (buoy amber expanding box-shadow pulse).
  - Memory bar width transitions: `width 1s var(--ease)`.
- **Accessibility:** Under `@media (prefers-reduced-motion: reduce)`, all transitions and animations are strictly disabled (`animation: none !important; transition: none !important;`).

## Rules & Anti-Patterns
- **No cards:** The layout uses continuous nautical chart panels and tables framed by hairline border rules (`var(--rule)` / `var(--rule-soft)`), avoiding container bloat and detached card islands.
- **No decorative shadows:** Zero ambient drop shadows or elevation glows; visual depth is established purely through tonal layering (`--ground`, `--ground-2`, `--basin`).
- **No decorative gradients:** Gradients are reserved strictly for technical data indicators (gauge contour marks and dry hatched warning), never background styling.
- **No purple:** Rejects generic AI purple aesthetics; the palette adheres strictly to nautical cartography (navy ground, deep teal, shoal sand, buoy amber, chart magenta).
- **No fake numbers:** Every value is live and traceable to local sources (OmniRoute, Hermes SQLite, memory files); missing data displays honest "—" or "not connected".
- **Whole-row fitting:** Call logs and session trees calculate container capacity dynamically in JavaScript to render whole rows only, eliminating half-cut lines.
- **Single-screen fit:** Viewport fits entirely without page scrolling at target 1920×1080 and 1440×900 resolutions using adaptive compact variables (`--foot: 190px` / `174px`).
