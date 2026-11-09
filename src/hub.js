import { fetchOmni } from './omniroute.js';
import { readHermes } from './hermes.js';

const notConnected = () => ({ ok: false, error: 'not connected' });
const EVERY = { omni: 5000, hermes: 3000, dora: 600000 };

export function createHub(cfg, adapters = {}) {
  const run = {
    omni: adapters.omni ?? (() => fetchOmni(cfg)),
    hermes: adapters.hermes ?? (() => readHermes(cfg)),
    dora: adapters.dora ?? notConnected,
  };
  const data = {}, sources = {}, sigs = {}, subs = new Set(), timers = [];
  for (const k of Object.keys(run)) { data[k] = null; sources[k] = { ok: false, at: null, error: 'pending' }; }

  async function poll(name) {
    let r;
    try { r = await run[name](); } catch (e) { r = { ok: false, error: e.message }; }
    const { ok, error, fetchedAt, ...rest } = r;
    const prev = sources[name];
    if (ok) { data[name] = rest; sources[name] = { ok: true, at: Date.now(), error: null }; }
    else {
      // keep last good data; partial payloads (e.g. memories on db failure) still refresh
      if (Object.keys(rest).length) data[name] = { ...data[name], ...rest };
      sources[name] = { ok: false, at: prev.at, error: error || 'unknown error' };
    }
    const sig = JSON.stringify([data[name], sources[name].ok, sources[name].error]);
    if (sig === sigs[name]) return;
    sigs[name] = sig;
    const patch = { source: name, data: data[name], status: sources[name] };
    for (const fn of subs) fn(patch);
  }

  return {
    poll,
    pollAll: () => Promise.all(Object.keys(run).map(poll)),
    snapshot: () => ({ ...data, sources }),
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    start() {
      for (const [name, ms] of Object.entries(EVERY)) {
        poll(name);
        let busy = false;
        timers.push(setInterval(async () => {
          if (busy) return; // never overlap slow polls
          busy = true;
          try { await poll(name); } finally { busy = false; }
        }, ms));
      }
    },
    stop() { timers.splice(0).forEach(clearInterval); },
  };
}
