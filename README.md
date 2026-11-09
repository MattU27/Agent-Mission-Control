# Agent Mission Control

A read-only, live, localhost dashboard for the agent stack:

- **OmniRoute:** per-account quota tides (5h/7d), combo routes, and the call log.
- **Hermes:** running sessions and sub-agents, tokens by model, and memory budget.
- **Dora:** job tracker. Not connected in v1.

Zero dependencies. It needs Node ≥ 24 (it uses the built-in `node:sqlite`).

```bash
npm start          # → http://127.0.0.1:4747
npm test           # node --test
```

Config comes from env vars, with defaults:

| Var | Default |
|---|---|
| `HERMES_HOME` | `E:/CData/AppData/hermes` (state.db, memories/, config.yaml, .env) |
| `OMNIROUTE_URL` | `http://127.0.0.1:20128` |
| `HERMES_OMNIROUTE_KEY` | read from `$HERMES_HOME/.env` (server-side only) |
| `AMC_PORT` | `4747` |

Polling: OmniRoute every 5s, Hermes every 3s, both pushed to the browser over SSE. If a source fails, its panels show `offline · last good HH:MM` and the other panels keep updating.
