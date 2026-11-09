import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyStatus, parseTrackerXlsx, summarizeHandoff, fetchDora } from '../src/dora.js';

function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content, store = false] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const data = store ? raw : deflateRawSync(raw);
    const method = store ? 0 : 8;

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }
  const cdBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

function buildSampleXlsx() {
  const sharedStrings = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <si><t>Company</t></si>
  <si><t>Role</t></si>
  <si><t>Status</t></si>
  <si><t>Applied</t></si>
  <si><r><t>Application email sent — </t></r><r><t>employer receipt pending</t></r></si>
  <si><t>Replied</t></si>
  <si><t>Application recorded — activation pending; parked by user</t></si>
  <si><t>Rejected</t></si>
  <si><t>Interview invited — prerecorded; not started</t></si>
  <si><t>Action required: 2 professional references &amp; check</t></si>
</sst>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet state="visible" name="Dashboard" sheetId="1" r:id="rId1"/>
    <sheet r:id="rId2" sheetId="2" name="Developer Applications"/>
    <sheet name="Technical VA Applications" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
  <Relationship Target="/xl/worksheets/sheet2.xml" Id="rId2"/>
  <Relationship Id="rId3" Target="worksheets/sheet3.xml"/>
</Relationships>`;

  const sheet1 = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Job Application Dashboard</t></is></c></row></sheetData></worksheet>`;

  const sheet2 = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="K1" t="s"><v>2</v></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>Acme Corp</t></is></c><c r="K2" t="s"><v>3</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Beta Systems</t></is></c><c r="K3" t="s"><v>4</v></c></row>
    <row r="4"><c r="A4" t="inlineStr"><is><t>Gamma Labs</t></is></c><c r="K4" t="s"><v>5</v></c></row>
    <row r="5"><c r="A5" t="inlineStr"><is><t>Delta Park</t></is></c><c r="K5" t="s"><v>6</v></c></row>
    <row r="6"><c r="A6" t="inlineStr"><is><t>Epsilon Ltd</t></is></c><c r="K6" t="s"><v>7</v></c></row>
    <row r="7"><c r="A7" t="inlineStr"><is><t>   </t></is></c></row>
  </sheetData></worksheet>`;

  const sheet3 = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>Zeta Ops</t></is></c><c r="C2" t="s"><v>3</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Eta Support</t></is></c><c r="C3" t="s"><v>8</v></c></row>
    <row r="4"><c r="A4" t="inlineStr"><is><t>Theta Desk</t></is></c><c r="C4" t="s"><v>9</v></c></row>
  </sheetData></worksheet>`;

  return makeZip([
    ['xl/sharedStrings.xml', sharedStrings],
    ['xl/workbook.xml', workbook, true],
    ['xl/_rels/workbook.xml.rels', rels],
    ['xl/worksheets/sheet1.xml', sheet1],
    ['xl/worksheets/sheet2.xml', sheet2],
    ['xl/worksheets/sheet3.xml', sheet3],
  ]);
}

test('classifyStatus maps Dora tracker phrasings into exact buckets', () => {
  assert.equal(classifyStatus('Applied'), 'awaiting');
  assert.equal(classifyStatus('Applied — assessment completed; awaiting review'), 'awaiting');
  assert.equal(classifyStatus('Application email sent — employer receipt pending'), 'awaiting');
  assert.equal(classifyStatus('Careers form submitted — generic acknowledgment; terms unconfirmed'), 'awaiting');
  assert.equal(classifyStatus('Replied'), 'action');
  assert.equal(classifyStatus('Action required: 2 professional references requested Nov 1'), 'action');
  assert.equal(classifyStatus('Interview invited — prerecorded; not started'), 'interview');
  assert.equal(classifyStatus('Offer received'), 'offer');
  assert.equal(classifyStatus('Application recorded — activation pending; parked by user'), 'hold');
  assert.equal(classifyStatus('Rejected'), 'rejected');
  assert.equal(classifyStatus('Rejected — 8 Nov 2026; interview completed'), 'rejected');
  assert.equal(classifyStatus('Withdrawn after offer discussion'), 'rejected');
  assert.equal(classifyStatus(''), 'hold');
});

test('parseTrackerXlsx aggregates application tabs and resolves Status column dynamically', () => {
  const tracker = parseTrackerXlsx(buildSampleXlsx());
  assert.equal(tracker.total, 8);
  assert.deepEqual(tracker.lanes, [
    { name: 'Developer', total: 5, awaiting: 2, action: 1, interview: 0, offer: 0, hold: 1, rejected: 1 },
    { name: 'Technical VA', total: 3, awaiting: 1, action: 1, interview: 1, offer: 0, hold: 0, rejected: 0 },
  ]);
  assert.deepEqual(tracker.totals, { total: 8, awaiting: 3, action: 2, interview: 1, offer: 0, hold: 1, rejected: 1 });
});

test('parseTrackerXlsx rejects corrupt buffers cleanly', () => {
  assert.throws(() => parseTrackerXlsx(Buffer.from('not-a-zip')), /invalid xlsx/i);
});

test('summarizeHandoff matches Inbox tasks against Outbox results and ignores folders', () => {
  const inbox = [
    { id: 'f0', name: 'Archive', mimeType: 'application/vnd.google-apps.folder', modifiedTime: '2026-11-10T00:00:00Z' },
    { id: 'f1', name: 'TASK-001-hermes-test.md', mimeType: 'text/markdown', modifiedTime: '2026-11-09T03:34:32.525Z' },
  ];
  const outbox = [
    { id: 'o1', name: 'TASK-001-hermes-test-result.md', mimeType: 'text/markdown', modifiedTime: '2026-11-09T20:44:28.695Z' },
  ];
  const done = summarizeHandoff(inbox, outbox);
  assert.equal(done.inboxCount, 1);
  assert.equal(done.outboxCount, 1);
  assert.equal(done.pendingCount, 0);
  assert.deepEqual(done.latest, {
    id: 'TASK-001',
    state: 'answered',
    name: 'TASK-001-hermes-test-result.md',
    modifiedTime: '2026-11-09T20:44:28.695Z',
  });

  const queued = summarizeHandoff(
    [...inbox, { id: 'f2', name: 'TASK-002-review-spec.md', mimeType: 'text/markdown', modifiedTime: '2026-11-10T01:00:00Z' }],
    outbox,
  );
  assert.equal(queued.pendingCount, 1);
  assert.equal(queued.pending[0].id, 'TASK-002');
  assert.equal(queued.latest.id, 'TASK-002');
  assert.equal(queued.latest.state, 'pending');
});

test('summarizeHandoff re-flags task as pending if Inbox file was updated after Outbox result', () => {
  const h = summarizeHandoff(
    [{ id: 'f1', name: 'TASK-001-hermes-test.md', mimeType: 'text/markdown', modifiedTime: '2026-11-10T02:00:00Z' }],
    [{ id: 'o1', name: 'TASK-001-hermes-test-result.md', mimeType: 'text/markdown', modifiedTime: '2026-11-09T20:44:28.695Z' }],
  );
  assert.equal(h.pendingCount, 1);
  assert.equal(h.latest.state, 'pending');
});

test('fetchDora runs readonly gdrive commands, cleans up scratch xlsx, and handles errors', async () => {
  const scratchDir = mkdtempSync(join(tmpdir(), 'amc-dora-'));
  const bin = join(scratchDir, 'fake-gdrive.cmd');
  writeFileSync(bin, '@echo off\r\n');
  const xlsx = buildSampleXlsx();
  const calls = [];

  const cfg = {
    gdriveBin: bin,
    scratchDir,
    doraSheetId: 'sheet-123',
    doraInboxId: 'inbox-456',
    doraOutboxId: 'outbox-789',
  };

  const okRes = await fetchDora(cfg, async (exe, args) => {
    assert.equal(exe, bin);
    assert.equal(args[0], 'readonly', 'must only invoke gdrive readonly subcommands');
    calls.push(args);
    if (args[1] === 'export') {
      assert.ok(args[3].startsWith(scratchDir), 'temp xlsx must live in scratchDir');
      writeFileSync(args[3], xlsx);
      return '';
    }
    if (args[2] === 'inbox-456') return JSON.stringify([{ id: '1', name: 'TASK-001.md', mimeType: 'text/markdown', modifiedTime: '2026-11-09T03:00:00Z' }]);
    if (args[2] === 'outbox-789') return JSON.stringify([{ id: '2', name: 'TASK-001-result.md', mimeType: 'text/markdown', modifiedTime: '2026-11-09T04:00:00Z' }]);
    throw new Error('unexpected args');
  });

  assert.equal(okRes.ok, true);
  assert.equal(okRes.tracker.total, 8);
  assert.equal(okRes.handoff.pendingCount, 0);
  assert.equal(calls.length, 3);
  assert.deepEqual(readdirSync(scratchDir).filter(f => f.endsWith('.xlsx')), [], 'temp xlsx must be removed');

  const failRes = await fetchDora(cfg, async (_exe, args) => {
    if (args[1] === 'export') writeFileSync(args[3], xlsx);
    throw new Error('oauth token expired');
  });
  assert.equal(failRes.ok, false);
  assert.match(failRes.error, /oauth token expired/);
  assert.deepEqual(readdirSync(scratchDir).filter(f => f.endsWith('.xlsx')), [], 'temp xlsx must be removed even on error');

  const missingBin = await fetchDora({ ...cfg, gdriveBin: join(scratchDir, 'missing.cmd') });
  assert.equal(missingBin.ok, false);
  assert.equal(missingBin.error, 'not connected');
  assert.ok(existsSync(scratchDir));
});

