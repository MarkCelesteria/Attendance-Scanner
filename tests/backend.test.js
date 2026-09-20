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
const grid = [
  ['ID', 'Name', 'Program', 'Year'],
  ['s001', 'Ann', 'BSCS', 2],
  ['S002', 'Bob', 'BSIT', 3],
  ['', ' ', '', ''],            // blank row must be skipped
  ['S003', 'Cy', 'BSCS', 1],
].map(pad);

const sheet = {
  getLastRow: () => grid.length,
  getParent: () => ({ getSpreadsheetTimeZone: () => 'UTC' }),
  getRange: (r, c, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => grid[r - 1 + i].slice(c - 1, c - 1 + nc)),
    setValues: (v) => v.forEach((row, i) => row.forEach((x, j) => { grid[r - 1 + i][c - 1 + j] = x; })),
  }),
};

const ctx = vm.createContext({
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheets: () => [sheet], getSheetByName: () => sheet }), flush() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  Utilities: { formatDate: (d) => d.toISOString() },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
});
vm.runInContext(src, ctx);

const get  = (p) => JSON.parse(ctx.doGet({ parameter: p }).t);
const post = (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).t);

// --- doGet ---------------------------------------------------------------
const roster = get({ idCol: 'A', nameCol: 'B', programCol: 'C', yearCol: 'D', firstRow: '2' });
assert.equal(roster.ok, true);
assert.equal(roster.count, 3, 'blank rows are skipped');
assert.deepEqual(roster.students[0], { id: 's001', name: 'Ann', program: 'BSCS', year: '2' });
assert.equal(get({ idCol: '1', nameCol: 'B', programCol: 'C', yearCol: 'D' }).ok, false, 'bad column letter is rejected');

// --- doPost --------------------------------------------------------------
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
assert.equal(grid.length, 5, 'no rows were added');
assert.deepEqual(grid[0].slice(4, 6), ['Morning In', 'Morning Out'], 'empty headers are labelled');
assert.ok(grid[1][4], 'S001 has a Morning In timestamp');
assert.ok(grid[2][5], 'S002 has a Morning Out timestamp');
assert.equal(grid[4][4] + grid[4][5], '', 'S003 untouched');

console.log('backend tests passed');
