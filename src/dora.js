import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const BUCKETS = ['awaiting', 'action', 'interview', 'offer', 'hold', 'rejected'];
const FOLDER_MIME = 'application/vnd.google-apps.folder';

const decodeXml = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&(quot|apos|lt|gt|amp);/g, (_, e) => ({ quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' })[e]);

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : null;
};

function colIdx(ref) {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function unzipXml(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('invalid xlsx archive');
  const minPos = Math.max(0, buf.length - 65558);
  let eocd = buf.length - 22;
  while (eocd >= minPos && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < minPos) throw new Error('invalid xlsx archive: missing central directory');

  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) throw new Error('invalid xlsx archive: corrupt entry');
    const method = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOff = buf.readUInt32LE(pos + 42);
    const name = buf.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    if (name.endsWith('.xml') || name.endsWith('.rels')) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compSize);
      files[name] = (method === 8 ? inflateRawSync(raw) : raw).toString('utf8');
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function parseRows(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r');
      if (!ref) continue;
      const type = attr(cm[1], 't') || '';
      const body = cm[2] || '';
      let val = '';
      if (type === 's') {
        const idx = body.match(/<v>(\d+)<\/v>/)?.[1];
        val = idx != null ? (shared[Number(idx)] ?? '') : '';
      } else if (type === 'inlineStr') {
        val = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t => decodeXml(t[1])).join('');
      } else {
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        val = v != null ? decodeXml(v) : '';
      }
      row[colIdx(ref)] = val;
    }
    if (row.some(v => String(v ?? '').trim() !== '')) rows.push(row);
  }
  return rows;
}

export function classifyStatus(raw) {
  const s = String(raw ?? '').trim();
  if (/\b(rejected|declined|closed|withdrawn)\b/i.test(s)) return 'rejected';
  if (/\boffer\b/i.test(s)) return 'offer';
  if (/\binterview\b/i.test(s)) return 'interview';
  if (/\b(action required|replied|response received|shortlist)\b/i.test(s)) return 'action';
  if (/\b(parked|hold|held|skipped|draft|conditional|not submitted)\b/i.test(s)) return 'hold';
  if (/\b(applied|sent|submitted)\b/i.test(s)) return 'awaiting';
  return 'hold';
}

export function parseTrackerXlsx(buf) {
  const files = unzipXml(buf);
  const wb = files['xl/workbook.xml'] || '';
  const relsXml = files['xl/_rels/workbook.xml.rels'] || '';

  const shared = [];
  if (files['xl/sharedStrings.xml']) {
    for (const m of files['xl/sharedStrings.xml'].matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      shared.push([...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t => decodeXml(t[1])).join(''));
    }
  }

  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attr(m[1], 'Id');
    const target = attr(m[1], 'Target');
    if (id && target) rels[id] = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^xl\//, '')}`;
  }

  const emptyCounts = () => ({ total: 0, awaiting: 0, action: 0, interview: 0, offer: 0, hold: 0, rejected: 0 });
  const totals = emptyCounts();
  const lanes = [];

  for (const m of wb.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const name = attr(m[1], 'name') || '';
    const rId = attr(m[1], 'r:id');
    if (!/applications$/i.test(name)) continue;
    const sheetXml = files[rels[rId]];
    if (!sheetXml) continue;

    const rows = parseRows(sheetXml, shared);
    const header = rows[0] || [];
    const statusCol = header.findIndex(h => /^status$/i.test(String(h ?? '').trim()));
    const col = statusCol >= 0 ? statusCol : 10;

    const counts = emptyCounts();
    for (const row of rows.slice(1)) {
      const bucket = classifyStatus(row[col]);
      counts[bucket]++;
      counts.total++;
      totals[bucket]++;
      totals.total++;
    }
    lanes.push({ name: name.replace(/\s+Applications$/i, ''), ...counts });
  }

  return { total: totals.total, totals, lanes };
}

function taskId(name = '') {
  const m = name.match(/\b(TASK-\d+)\b/i);
  if (m) return m[1].toUpperCase();
  return name.replace(/\.[^.]+$/, '').replace(/-(result|response|reply|out)$/i, '');
}

export function summarizeHandoff(inboxRaw = [], outboxRaw = []) {
  const clean = list => (Array.isArray(list) ? list : list?.files ?? [])
    .filter(f => f && f.mimeType !== FOLDER_MIME)
    .sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''));

  const inbox = clean(inboxRaw);
  const outbox = clean(outboxRaw);

  const outByKey = new Map();
  for (const f of outbox) {
    const key = taskId(f.name).toLowerCase();
    if (!outByKey.has(key)) outByKey.set(key, f);
  }

  const pending = inbox.filter(f => {
    const out = outByKey.get(taskId(f.name).toLowerCase());
    if (!out) return true;
    return Boolean(f.modifiedTime && out.modifiedTime && Date.parse(f.modifiedTime) > Date.parse(out.modifiedTime));
  });

  let latest = null;
  if (pending.length) {
    latest = { id: taskId(pending[0].name), state: 'pending', name: pending[0].name, modifiedTime: pending[0].modifiedTime ?? null };
  } else {
    const tagged = [...outbox.map(f => ({ f, state: 'answered' })), ...inbox.map(f => ({ f, state: 'inbox' }))]
      .sort((a, b) => (b.f.modifiedTime ?? '').localeCompare(a.f.modifiedTime ?? ''));
    if (tagged.length) {
      const top = tagged[0];
      latest = { id: taskId(top.f.name), state: top.state, name: top.f.name, modifiedTime: top.f.modifiedTime ?? null };
    }
  }

  return {
    inboxCount: inbox.length,
    outboxCount: outbox.length,
    pendingCount: pending.length,
    pending: pending.slice(0, 5).map(f => ({ id: taskId(f.name), name: f.name, modifiedTime: f.modifiedTime ?? null })),
    latest,
  };
}

function runCli(bin, args) {
  if ([bin, ...args].some(a => /[\r\n\0]/.test(String(a)))) return Promise.reject(new Error('invalid cli argument'));
  const opts = { windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 };
  return new Promise((resolve, reject) => {
    const cb = (err, stdout, stderr) => (err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout));
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)) {
      const q = s => `"${String(s).replace(/"/g, '""')}"`;
      const cmdLine = `"${[bin, ...args].map(q).join(' ')}"`;
      execFile(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmdLine], { ...opts, windowsVerbatimArguments: true }, cb);
    } else {
      execFile(bin, args, opts, cb);
    }
  });
}

export async function fetchDora(cfg, execImpl = runCli) {
  if (execImpl === runCli && (!cfg.gdriveBin || !existsSync(cfg.gdriveBin))) {
    return { ok: false, error: 'not connected' };
  }
  for (const id of [cfg.doraSheetId, cfg.doraInboxId, cfg.doraOutboxId]) {
    if (!id || !/^[\w-]+$/.test(id)) return { ok: false, error: 'invalid Dora Drive ID' };
  }
  mkdirSync(cfg.scratchDir, { recursive: true });
  const tmpFile = join(cfg.scratchDir, `amc-dora-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.xlsx`);
  try {
    const [, inboxOut, outboxOut] = await Promise.all([
      execImpl(cfg.gdriveBin, ['readonly', 'export', cfg.doraSheetId, tmpFile, '--format', 'xlsx']),
      execImpl(cfg.gdriveBin, ['readonly', 'ls', cfg.doraInboxId, '--json']),
      execImpl(cfg.gdriveBin, ['readonly', 'ls', cfg.doraOutboxId, '--json']),
    ]);
    const tracker = parseTrackerXlsx(readFileSync(tmpFile));
    const handoff = summarizeHandoff(JSON.parse(inboxOut || '[]'), JSON.parse(outboxOut || '[]'));
    return { ok: true, fetchedAt: new Date().toISOString(), tracker, handoff };
  } catch (e) {
    return { ok: false, error: e.message || 'dora poll failed' };
  } finally {
    rmSync(tmpFile, { force: true });
  }
}

