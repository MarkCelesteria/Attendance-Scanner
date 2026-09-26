const SETTINGS = {
  DEFAULT_TIME_POLICY: 'earliest',
  TIMESTAMP_FORMAT: 'yyyy-MM-dd HH:mm:ss',
  LOCK_WAIT_MS: 30000,
};

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === 'admin') return handleAdmin_(p);
    authorize_(p.key);

    const firstRow = toInt_(p.firstRow, 2);
    const idCol = colIndex_(p.idCol), nameCol = colIndex_(p.nameCol);
    const progCol = optCol_(p.programCol), yearCol = optCol_(p.yearCol);
    const collegeCol = optCol_(p.collegeCol), genderCol = optCol_(p.genderCol);

    const students = [];
    getSheetNames_(p).forEach((name) => {
      const sheet = getSheet_(name);
      const lastRow = sheet.getLastRow();
      if (lastRow < firstRow) return;

      const n = lastRow - firstRow + 1;
      const used = [idCol, nameCol, progCol, yearCol, collegeCol, genderCol].filter(Boolean);
      const minCol = Math.min.apply(null, used), maxCol = Math.max.apply(null, used);
      const block = sheet.getRange(firstRow, minCol, n, maxCol - minCol + 1).getValues();
      const at = (i, col) => (col ? String(block[i][col - minCol]).trim() : '');
      const skip = dividerRows_(sheet, firstRow, n, idCol);

      for (let i = 0; i < n; i++) {
        if (skip.has(i)) continue;
        const id = at(i, idCol);
        if (!id) continue;
        students.push({
          id: id, name: at(i, nameCol), program: at(i, progCol), year: at(i, yearCol),
          college: at(i, collegeCol), gender: at(i, genderCol), sheet: sheet.getName(),
        });
      }
    });

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

    const sessionInfo = new Map();
    if (typeof sessions[0] === 'string') {
      const startCol = colIndex_(cfg.startCol);
      sessions.forEach((name, i) => sessionInfo.set(name, { col: startCol + i, supCol: 0, supName: '' }));
    } else {
      sessions.forEach((s) => sessionInfo.set(s.name, {
        col: colIndex_(s.col),
        supCol: s.supCol ? colIndex_(s.supCol) : 0,
        supName: s.supName || '',
      }));
    }

    lock.waitLock(SETTINGS.LOCK_WAIT_MS);

    const firstRow = toInt_(cfg.firstRow, 2);
    const idCol = colIndex_(cfg.idCol);
    const policy = (cfg.timePolicy === 'latest' || cfg.timePolicy === 'earliest')
      ? cfg.timePolicy : SETTINGS.DEFAULT_TIME_POLICY;

    const bySheet = new Map();
    entries.forEach((en) => {
      const key = en.sheet || cfg.sheet || '';
      if (!bySheet.has(key)) bySheet.set(key, []);
      bySheet.get(key).push(en);
    });

    const results = [];
    bySheet.forEach((sheetEntries, sheetName) => {
      writeToSheet_(sheetName, sheetEntries, { sessionInfo, firstRow, idCol, policy }, results);
    });

    return json_({ ok: true, results: results });
  } catch (err) {
    return json_({ ok: false, error: message_(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {  }
  }
}

function writeToSheet_(sheetName, entries, ctx, results) {
  const { sessionInfo, firstRow, idCol, policy } = ctx;
  const sheet = getSheet_(sheetName);
  const tz = sheet.getParent().getSpreadsheetTimeZone();

  const headerRow = firstRow - 1;
  if (headerRow >= 1) {
    const supColCounts = new Map();
    sessionInfo.forEach((info) => { if (info.supCol) supColCounts.set(info.supCol, (supColCounts.get(info.supCol) || 0) + 1); });
    const headerLabels = new Map();
    sessionInfo.forEach((info, name) => {
      if (!headerLabels.has(info.col)) headerLabels.set(info.col, name);
      if (info.supCol && !headerLabels.has(info.supCol)) {
        headerLabels.set(info.supCol, supColCounts.get(info.supCol) > 1 ? 'Timekeeper' : name + ' Timekeeper');
      }
    });
    let widest = 1;
    headerLabels.forEach((_, col) => { if (col > widest) widest = col; });
    const header = sheet.getRange(headerRow, 1, 1, widest).getValues()[0];
    headerLabels.forEach((label, col) => {
      if (header[col - 1] === '') sheet.getRange(headerRow, col, 1, 1).setValues([[label]]);
    });
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < firstRow) {
    entries.forEach((en) => results.push({ qid: en.qid, status: 'not_found' }));
    return;
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
  const noteCol = (ci) => { if (ci && usedCols.indexOf(ci) < 0) usedCols.push(ci); };
  entries.forEach((en) => {
    const info = sessionInfo.get(en.session);
    if (!info) return;
    noteCol(info.col);
    noteCol(info.supCol);
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

  entries.forEach((en) => {
    const info = sessionInfo.get(en.session);
    if (!info) { results.push({ qid: en.qid, status: 'bad_session' }); return; }

    const row = rowOf.get(norm_(en.id));
    if (row === undefined) { results.push({ qid: en.qid, status: 'not_found' }); return; }

    const run = runOf(info.col), k = info.col - run.start;
    const existing = run.values[row][k];
    if (existing !== '' && existing !== null) {
      const oldSec = Math.floor(existingMs_(existing, tz) / 1000);
      const newSec = Math.floor(Number(en.ts) / 1000);
      const replace = !isNaN(oldSec) && (policy === 'latest' ? newSec > oldSec : newSec < oldSec);
      if (!replace) { results.push({ qid: en.qid, status: 'duplicate' }); return; }
    }

    run.values[row][k] = Utilities.formatDate(new Date(Number(en.ts)), tz, SETTINGS.TIMESTAMP_FORMAT);
    run.dirty = true;

    if (info.supCol) {
      const srun = runOf(info.supCol), sk = info.supCol - srun.start;
      srun.values[row][sk] = info.supName;
      srun.dirty = true;
    }

    results.push({ qid: en.qid, status: 'written' });
  });

  runs.forEach((run) => { if (run.dirty) run.range.setValues(run.values); });
}

function authorize_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty('ACCESS_KEY');
  if (expected && String(provided || '') !== expected) throw new Error('Invalid access key.');
}

function authorizeAdmin_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!expected) throw new Error('Admin access is not set up: add an ADMIN_KEY script property first.');
  if (String(provided || '') !== expected) throw new Error('Invalid admin key.');
}

function optCol_(v) {
  const s = String(v || '').trim();
  return s && s.toLowerCase() !== 'none' ? colIndex_(s) : 0;
}

function handleAdmin_(p) {
  try {
    authorizeAdmin_(p.adminKey);

    const firstRow = toInt_(p.firstRow, 2);
    const idCol = colIndex_(p.idCol), nameCol = colIndex_(p.nameCol);
    const progCol = optCol_(p.programCol), yearCol = optCol_(p.yearCol);
    const collegeCol = optCol_(p.collegeCol), genderCol = optCol_(p.genderCol);

    let sessions = [];
    try { sessions = JSON.parse(p.sessions || '[]'); } catch (e) { sessions = []; }
    if (!Array.isArray(sessions)) sessions = [];
    const sessionCols = sessions
      .filter((s) => s && s.name && s.col)
      .map((s) => ({ name: String(s.name), col: colIndex_(s.col) }));

    const students = [];
    getSheetNames_(p).forEach((name) => {
      const sheet = getSheet_(name);
      const lastRow = sheet.getLastRow();
      if (lastRow < firstRow) return;

      const n = lastRow - firstRow + 1;
      const used = [idCol, nameCol, progCol, yearCol, collegeCol, genderCol]
        .concat(sessionCols.map((s) => s.col))
        .filter(Boolean);
      const minCol = Math.min.apply(null, used), maxCol = Math.max.apply(null, used);
      const block = sheet.getRange(firstRow, minCol, n, maxCol - minCol + 1).getValues();
      const tz = sheet.getParent().getSpreadsheetTimeZone();
      const at = (i, col) => {
        if (!col) return '';
        const v = block[i][col - minCol];
        if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm');
        return String(v).trim();
      };
      const skip = dividerRows_(sheet, firstRow, n, idCol);

      for (let i = 0; i < n; i++) {
        if (skip.has(i)) continue;
        const id = at(i, idCol);
        if (!id) continue;
        const row = {
          id: id, name: at(i, nameCol), program: at(i, progCol), year: at(i, yearCol),
          college: at(i, collegeCol), gender: at(i, genderCol), sheet: sheet.getName(), sessions: {},
        };
        sessionCols.forEach((s) => { row.sessions[s.name] = at(i, s.col); });
        students.push(row);
      }
    });

    return json_({ ok: true, count: students.length, sessions: sessionCols.map((s) => s.name), students: students });
  } catch (err) {
    return json_({ ok: false, error: message_(err) });
  }
}

function getSheetNames_(p) {
  if (p.sheets) {
    try {
      const arr = JSON.parse(p.sheets);
      if (Array.isArray(arr) && arr.length) return arr;
    } catch (e) { /* fall through */ }
  }
  return [p.sheet || ''];
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