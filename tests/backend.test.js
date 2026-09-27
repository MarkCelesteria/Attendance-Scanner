/**
 * Runs the Apps Script backend (backend/apps-script/Code.gs) against an
 * in-memory fake of SpreadsheetApp. No dependencies:  node tests/backend.test.js
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../backend/apps-script/Code.gs', import.meta.url), 'utf8');

// Row 1 = headers, then students. 8 columns wide (A–H).
const pad = (r) => { r = r.slice(); while (r.length < 8) r.push(''); return r; };

const gridA = [
  ['ID', 'Name', 'Program', 'Year'],
  ['s001', 'Ann', 'BSCS', 2],
  ['S002', 'Bob', 'BSIT', 3],
  ['', ' ', '', ''],            // blank row must be skipped
  ['S003', 'Cy', 'BSCS', 1],
].map(pad);

// A second tab, same layout, one different student plus a duplicate ID (for the admin-merge test).
const gridB = [
  ['ID', 'Name', 'Program', 'Year'],
  ['S004', 'Dee', 'BSIT', 2],
  ['S001', '', '', ''],          // same student as gridA row 2 — admin should merge these into one row
].map(pad);

function makeSheet(name, grid) {
  return {
    getName: () => name,
    getLastRow: () => grid.length,
    getParent: () => ({ getSpreadsheetTimeZone: () => 'UTC' }),
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => grid[r - 1 + i].slice(c - 1, c - 1 + nc)),
      setValues: (v) => v.forEach((row, i) => row.forEach((x, j) => { grid[r - 1 + i][c - 1 + j] = x; })),
      getMergedRanges: () => [],   // no merged/divider rows in these fixtures
    }),
  };
}

const sheetA = makeSheet('SheetA', gridA);
const sheetB = makeSheet('SheetB', gridB);
const sheetsByName = { SheetA: sheetA, SheetB: sheetB };

const scriptProps = { ADMIN_KEY: 'admin123' };   // ACCESS_KEY left unset: authorize_() allows any key

const ctx = vm.createContext({
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheets: () => [sheetA, sheetB],           // getSheets()[0] = the "first tab" fallback
      getSheetByName: (n) => sheetsByName[n],
    }),
    flush() {},
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => scriptProps[k] || null }) },
  Utilities: { formatDate: (d) => d.toISOString() },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
});
vm.runInContext(src, ctx);

const get  = (p) => JSON.parse(ctx.doGet({ parameter: p }).t);
const post = (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).t);

// --- doGet: single sheet (unchanged behavior) -----------------------------
const roster = get({ idCol: 'A', nameCol: 'B', programCol: 'C', yearCol: 'D', firstRow: '2' });
assert.equal(roster.ok, true);
assert.equal(roster.count, 3, 'blank rows are skipped');
assert.deepEqual(roster.students[0], { id: 's001', name: 'Ann', program: 'BSCS', year: '2', sheet: 'SheetA' });
assert.equal(get({ idCol: '1', nameCol: 'B', programCol: 'C', yearCol: 'D' }).ok, false, 'bad column letter is rejected');

// --- doGet: multiple sheets combined into one roster ----------------------
const combined = get({
  idCol: 'A', nameCol: 'B', programCol: 'C', yearCol: 'D', firstRow: '2',
  sheets: JSON.stringify(['SheetA', 'SheetB']),
});
assert.equal(combined.ok, true);
assert.equal(combined.count, 5, '3 from SheetA + 2 from SheetB (duplicate ID included, not deduped here)');
assert.ok(combined.students.some((s) => s.sheet === 'SheetA' && s.id === 's001'));
assert.ok(combined.students.some((s) => s.sheet === 'SheetB' && s.id === 'S004'));

// --- doPost: backward compatible, no `sheet` on entries → first tab -------
const now = Date.now();
const res = post({
  config: { idCol: 'A', startCol: 'E', sessions: ['Morning In', 'Morning Out'], firstRow: 2 },
  entries: [
    { qid: 1, id: 'S001',  session: 'Morning In',  ts: now },   // written (case-insensitive match)
    { qid: 2, id: 's001 ', session: 'Morning In',  ts: now },   // duplicate: first timestamp kept
    { qid: 3, id: 'S002',  session: 'Morning Out', ts: now },   // written to the second column
    { qid: 4, id: 'NOPE',  session: 'Morning In',  ts: now },   // unknown student
    { qid: 5, id: 'S003',  session: 'Bad',         ts: now },   // unknown session
  ],
});
assert.deepEqual(res.results.map((r) => r.status), ['written', 'duplicate', 'written', 'not_found', 'bad_session']);
assert.equal(gridA.length, 5, 'no rows were added');
assert.deepEqual(gridA[0].slice(4, 6), ['Morning In', 'Morning Out'], 'empty headers are labelled');
assert.ok(gridA[1][4], 'S001 has a Morning In timestamp on SheetA');
assert.ok(gridA[2][5], 'S002 has a Morning Out timestamp on SheetA');
assert.equal(gridA[4][4] + gridA[4][5], '', 'S003 untouched');
assert.equal(gridB[0][4], '', 'untagged entries never touch SheetB');

// --- doPost: entries tagged with `sheet` route to the correct tab --------
const res2 = post({
  config: { idCol: 'A', startCol: 'E', sessions: ['Morning In', 'Morning Out'], firstRow: 2 },
  entries: [
    { qid: 6, id: 'S004', session: 'Morning In', ts: now, sheet: 'SheetB' },
  ],
});
assert.deepEqual(res2.results.map((r) => r.status), ['written']);
assert.ok(gridB[1][4], 'S004 has a Morning In timestamp on SheetB');
assert.equal(gridB[0][4], 'Morning In', 'SheetB gets its own header, independent of SheetA');
assert.equal(gridA[1][4] === gridA[2][4], false, "SheetA's own rows weren't touched by this SheetB-tagged write");

// --- admin (action=admin): combines tabs and merges duplicate IDs ---------
const admin = get({
  action: 'admin', adminKey: 'admin123',
  idCol: 'A', nameCol: 'B', programCol: 'C', yearCol: 'D', firstRow: '2',
  sheets: JSON.stringify(['SheetA', 'SheetB']),
  sessions: JSON.stringify([{ name: 'Morning In', col: 'E' }, { name: 'Morning Out', col: 'F' }]),
});
assert.equal(admin.ok, true);
const s001Rows = admin.students.filter((s) => s.id.toUpperCase() === 'S001');
assert.equal(s001Rows.length, 1, 'S001 appears once even though it exists on both tabs');
assert.equal(s001Rows[0].name, 'Ann', "blank name from SheetB's duplicate row doesn't overwrite SheetA's");
assert.ok(s001Rows[0].sessions['Morning In'], 'merged row keeps the recorded Morning In time');
assert.equal(admin.students.some((s) => s.id === 'S004'), true, 'SheetB-only student is present');

console.log('backend tests passed');