# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated: Node 24 built-ins only (`node:http`, `node:sqlite`, `fetch`). Plain HTML/CSS/vanilla ES modules, no build step, no CDN. The user asked for ponytail/YAGNI and zero bloat.

## Users

One developer (Matt) runs a personal agent stack on Windows 11: Hermes Desktop on OmniRoute, 10 Antigravity Pro accounts, sub-agents, and a cloud agent (Dora). Mission Control stays **always on, on a second monitor, in a dim room during night sessions**, and he glances at it while working.

## Product Purpose

A glance tells him whether the agent stack is healthy, what it's doing right now, and how much quota runway is left. Today those answers are scattered across the OmniRoute dashboard, Hermes Desktop, memory files, and Dora's Google Sheet. Success means a glance of a few seconds answers it, with no clicking.

## Positioning

It unifies his own live sources: OmniRoute's management API, Hermes `state.db`, and the Hermes memory files. No vendor dashboard can join these, because none of them sees the others.

## Operating Context

- It's peripheral-vision use. State changes have to be noticeable without staring.
- It sits beside Hermes Desktop and editors, in long sessions in a dim room.
- Data refreshes every 3–5s from localhost. Quota windows are 5h ("session") and 7d ("weekly") per account, across Claude/GPT, Gemini, and Argon groups.
- Routing combos: agy-brain (Opus → Sonnet → Argon → Flash) and agy-fast (Flash → Sonnet → Opus → Argon).

## Capabilities and Constraints

- It's read-only. It never writes to OmniRoute, Hermes, memories, or Drive.
- Localhost only, with no auth. The OmniRoute key never reaches the browser.
- The Dora job tracker is **not connected in v1**. Its panel says so honestly.
- Account count changes upstream (it moved from 10 to 9 during the build), so layouts can't hardcode it.

## Brand Commitments

- **Anti-references (from the user):** generic AI purple gradients; fake or hardcoded numbers; bloated cards that make it hard to scan 10 accounts, ~5 sub-agents, and the Dora queue at a glance.

## Evidence on Hand

All numbers are live from local sources. Never show synthetic data in the shipped UI. Test fixtures are redacted captures of real API responses.

## Product Principles

1. Every number is live and traceable to a source, and a stale source says so.
2. Density over decoration: all accounts and sessions are visible at once without scrolling.
3. Quiet when healthy and loud only on change or danger.
4. Honest absence: missing data shows "—" or "not connected", never a guess.

## Accessibility & Inclusion

Long dim-room sessions call for low glare, no pure white on large areas, and text contrast of at least 4.5:1. Respect `prefers-reduced-motion`. State never relies on hue alone; pair it with a glyph or text.
