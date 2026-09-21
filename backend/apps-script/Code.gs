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
    const optCol = (v) => {
      const s = String(v || '').trim();
      return s && s.toLowerCase() !== 'none' ? colIndex_(s) : 0;
    };
    const progCol = optCol(p.programCol), yearCol = optCol(p.yearCol);
    const collegeCol = optCol(p.collegeCol), genderCol = optCol(p.genderCol);

    const lastRow = sheet.getLastRow();
    if (lastRow < firstRow) return json_({ ok: true, count: 0, students: [] });

    const n = lastRow - firstRow + 1;
    const used = [idCol, nameCol, progCol, yearCol, collegeCol, genderCol].filter(Boolean);
    const minCol = Math.min.apply(null, used), maxCol = Math.max.apply(null, used);
    const block = sheet.getRange(firstRow, minCol, n, maxCol - minCol + 1).getValues();
    const at = (i, col) => (col ? String(block[i][col - minCol]).trim() : '');

    const skip = dividerRows_(sheet, firstRow, n, idCol);

    const students = [];
    for (let i = 0; i < n; i++) {
      if (skip.has(i)) continue;
      const id = at(i, idCol);
      if (!id) continue;
      students.push({
        id: id,
        name: at(i, nameCol),
        program: at(i, progCol),
        year: at(i, yearCol),
        college: at(i, collegeCol),
        gender: at(i, genderCol),
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
      let widest = 1;
      colOfSession.forEach((ci) => { if (ci > widest) widest = ci; });
      const header = sheet.getRange(headerRow, 1, 1, widest).getValues()[0];
      colOfSession.forEach((ci, name) => {
        if (header[ci - 1] === '') sheet.getRange(headerRow, ci, 1, 1).setValues([[name]]);
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

    const usedCols = [];
    entries.forEach((en) => {
      const ci = colOfSession.get(en.session);
      if (ci !== undefined && usedCols.indexOf(ci) < 0) usedCols.push(ci);
    });
    usedCols.sort((a, b) => a - b);
    const runs = [];
    usedCols.forEach((ci) => {
      const last = runs[runs.length - 1];
      if (last && ci === last.end + 1) last.end = ci; else runs.push({ start: ci, end: ci });
    });
    runs.forEach((run) => {
      run.range = sheet.getRange(firstRow, run.start, n, run.end - run.start + 1);
      run.values = run.range.getValues();
      run.dirty = false;
    });
    const runOf = (ci) => runs.filter((r) => ci >= r.start && ci <= r.end)[0];

    const results = [];
    const policy = (cfg.timePolicy === 'latest' || cfg.timePolicy === 'earliest')
      ? cfg.timePolicy : SETTINGS.DEFAULT_TIME_POLICY;

    for (const en of entries) {
      const ci = colOfSession.get(en.session);
      if (ci === undefined) { results.push({ qid: en.qid, status: 'bad_session' }); continue; }

      const row = rowOf.get(norm_(en.id));
      if (row === undefined) { results.push({ qid: en.qid, status: 'not_found' }); continue; }

      const run = runOf(ci), k = ci - run.start;
      const existing = run.values[row][k];
      if (existing !== '' && existing !== null) {
        const oldSec = Math.floor(existingMs_(existing, tz) / 1000);
        const newSec = Math.floor(Number(en.ts) / 1000);
        const replace = !isNaN(oldSec) && (policy === 'latest' ? newSec > oldSec : newSec < oldSec);
        if (!replace) { results.push({ qid: en.qid, status: 'duplicate' }); continue; }
      }

      run.values[row][k] = Utilities.formatDate(new Date(Number(en.ts)), tz, SETTINGS.TIMESTAMP_FORMAT);
      run.dirty = true;
      results.push({ qid: en.qid, status: 'written' });
    }

    runs.forEach((run) => { if (run.dirty) run.range.setValues(run.values); });
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
  sheet.getRange(firstRow, idCol, n, 1).getMergedRanges().forEach((m) => {
    if (m.getNumColumns() < 2) return;
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