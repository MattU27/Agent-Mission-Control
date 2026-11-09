import * as P from './panels.js';

let snap = { omni: null, hermes: null, dora: null, sources: {} };
const seen = new Set();

function renderAll() {
  P.almanac(document.getElementById('almanac'), snap);
  P.tide(document.getElementById('tide'), snap);
  P.routes(document.getElementById('routes'), snap);
  P.log(document.getElementById('log'), snap, seen);
  P.sessions(document.getElementById('sessions'), snap);
  P.ledger(document.getElementById('ledger'), snap);
  P.memory(document.getElementById('memory'), snap);
  P.dora(document.getElementById('dora'), snap);
  P.sources(snap);
}

async function loadSnapshot() {
  try {
    snap = await (await fetch('/api/snapshot', { cache: 'no-store' })).json();
    renderAll();
  } catch { P.serverDown(); }
}

function connect() {
  const es = new EventSource('/api/stream');
  es.addEventListener('patch', e => {
    const { source, data, status } = JSON.parse(e.data);
    snap[source] = data;
    snap.sources = { ...snap.sources, [source]: status };
    renderAll();
  });
  es.onopen = loadSnapshot; // also resyncs after a reconnect
  es.onerror = () => P.serverDown();
}

loadSnapshot();
connect();
setInterval(renderAll, 15000); // keep countdowns and "ago" labels honest between patches
addEventListener('resize', renderAll); // row-fitting panels depend on height
