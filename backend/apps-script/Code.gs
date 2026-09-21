const SETTINGS = {
  DEFAULT_TIME_POLICY: 'earliest',
  TIMESTAMP_FORMAT: 'yyyy-MM-dd HH:mm:ss',
  LOCK_WAIT_MS: 30000,
};

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    authorize_(p.key);

    const sheet = getSheet_(p.sheet);
    const firstRow = toInt_(p.firstRow, 2);
    const idCol = colIndex_(p.idCol), nameCol = colIndex_(p.nameCol);
    const optCol = (v) => (String(v || '').trim() ? colIndex_(v) : 0);
    const progCol = optCol(p.programCol), yearCol = optCol(p.yearCol);
    const collegeCol = optCol(p.collegeCol), genderCol = optCol(p.genderCol);

    const lastRow = sheet.getLastRow();
    if (lastRow < firstRow) return json_({ ok: true, count: 0, students: [] });

    const n = lastRow - firstRow + 1;
    const read = (col) => (col ? sheet.getRange(firstRow, col, n, 1).getValues() : null);
    const ids = read(idCol), names = read(nameCol), progs = read(progCol), years = read(yearCol);
    const colleges = read(collegeCol), genders = read(genderCol);
    const cell = (grid, i) => (grid ? String(grid[i][0]).trim() : '');

    const skip = dividerRows_(sheet, firstRow, n, idCol);

    const students = [];
    for (let i = 0; i < n; i++) {
      if (skip.has(i)) continue;
      const id = String(ids[i][0]).trim();
      if (!id) continue;
      students.push({
        id: id,
        name: cell(names, i),
        program: cell(progs, i),
        year: cell(years, i),
        college: cell(colleges, i),
        gender: cell(genders, i),
      });
    }
    return json_({ ok: true, count: students.length, students: students });
  } catch (err) {
    return json_({ ok: false, error: message_(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    authorize_(body.key);

    const cfg = body.config || {};
    const sessions = cfg.sessions;
    if (!Array.isArray(sessions) || !sessions.length) throw new Error('config.sessions is required.');
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!entries.length) return json_({ ok: true, results: [] });

    const colOfSession = new Map();
    if (typeof sessions[0] === 'string') {
      const startCol = colIndex_(cfg.startCol);
      sessions.forEach((name, i) => colOfSession.set(name, startCol + i));
    } else {
      sessions.forEach((s) => colOfSession.set(s.name, colIndex_(s.col)));
    }

    lock.waitLock(SETTINGS.LOCK_WAIT_MS);

    const sheet = getSheet_(cfg.sheet);
    const firstRow = toInt_(cfg.firstRow, 2);
    const idCol = colIndex_(cfg.idCol);
    const tz = sheet.getParent().getSpreadsheetTimeZone();

    const headerRow = firstRow - 1;
    if (headerRow >= 1) {
      colOfSession.forEach((ci, name) => {
        const cell = sheet.getRange(headerRow, ci, 1, 1);
        if (cell.getValues()[0][0] === '') cell.setValues([[name]]);
      });
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < firstRow) {
      return json_({ ok: true, results: entries.map((en) => ({ qid: en.qid, status: 'not_found' })) });
    }
    const n = lastRow - firstRow + 1;

    const idVals = sheet.getRange(firstRow, idCol, n, 1).getValues();
    const skip = dividerRows_(sheet, firstRow, n, idCol);
    const rowOf = new Map();
    for (let i = 0; i < n; i++) {
      const k = norm_(idVals[i][0]);
      if (k && !rowOf.has(k) && !skip.has(i)) rowOf.set(k, i);
    }

    const colCache = new Map();
    const columnOf = (ci) => {
      if (!colCache.has(ci)) {
        const range = sheet.getRange(firstRow, ci, n, 1);
        colCache.set(ci, { range: range, values: range.getValues(), dirty: false });
      }
      return colCache.get(ci);
    };

    const results = [];
    const policy = (cfg.timePolicy === 'latest' || cfg.timePolicy === 'earliest')
      ? cfg.timePolicy : SETTINGS.DEFAULT_TIME_POLICY;

    for (const en of entries) {
      const ci = colOfSession.get(en.session);
      if (ci === undefined) { results.push({ qid: en.qid, status: 'bad_session' }); continue; }

      const row = rowOf.get(norm_(en.id));
      if (row === undefined) { results.push({ qid: en.qid, status: 'not_found' }); continue; }

      const cd = columnOf(ci);
      const existing = cd.values[row][0];
      if (existing !== '' && existing !== null) {
        const oldSec = Math.floor(existingMs_(existing, tz) / 1000);
        const newSec = Math.floor(Number(en.ts) / 1000);
        const replace = !isNaN(oldSec) && (policy === 'latest' ? newSec > oldSec : newSec < oldSec);
        if (!replace) { results.push({ qid: en.qid, status: 'duplicate' }); continue; }
      }

      cd.values[row][0] = Utilities.formatDate(new Date(Number(en.ts)), tz, SETTINGS.TIMESTAMP_FORMAT);
      cd.dirty = true;
      results.push({ qid: en.qid, status: 'written' });
    }

    colCache.forEach((cd) => { if (cd.dirty) cd.range.setValues(cd.values); });
    SpreadsheetApp.flush();
    return json_({ ok: true, results: results });
  } catch (err) {
    return json_({ ok: false, error: message_(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {  }
  }
}

function authorize_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  if (expected && String(provided || '') !== expected) throw new Error('Invalid access key.');
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!name) return ss.getSheets()[0];
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet tab "' + name + '" was not found.');
  return sheet;
}

function colIndex_(letters) {
  const s = String(letters || '').trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(s)) throw new Error('Invalid column letter: "' + letters + '".');
  let n = 0;
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

function dividerRows_(sheet, firstRow, n, idCol) {
  const skip = new Set();
  const lastCol = Math.max(sheet.getLastColumn(), idCol);
  sheet.getRange(firstRow, 1, n, lastCol).getMergedRanges().forEach((m) => {
    if (m.getNumColumns() < 2) return;
    if (idCol < m.getColumn() || idCol > m.getLastColumn()) return;
    for (let r = m.getRow(); r <= m.getLastRow(); r++) skip.add(r - firstRow);
  });
  return skip;
}

function existingMs_(v, tz) {
  if (v instanceof Date) return v.getTime();
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    try { return Utilities.parseDate(s, tz, 'yyyy-MM-dd HH:mm:ss').getTime(); } catch (e) {  }
  }
  return NaN;
}

const norm_ = (v) => String(v == null ? '' : v).trim().toUpperCase();
const toInt_ = (v, dflt) => { const n = parseInt(v, 10); return n >= 1 ? n : dflt; };
const message_ = (err) => String((err && err.message) || err);

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}