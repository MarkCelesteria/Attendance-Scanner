const SETTINGS = {
  DEFAULT_TIME_POLICY: 'earliest',
  TIMESTAMP_FORMAT: 'yyyy-MM-dd HH:mm:ss',
  LOCK_WAIT_MS: 30000,
};

/* ============================ GET: roster ================================= */

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    authorize_(p.key);

    const sheet = getSheet_(p.sheet);
    const firstRow = toInt_(p.firstRow, 2);
    const idCol = colIndex_(p.idCol), nameCol = colIndex_(p.nameCol);
    const progCol = colIndex_(p.programCol), yearCol = colIndex_(p.yearCol);

    const lastRow = sheet.getLastRow();
    if (lastRow < firstRow) return json_({ ok: true, count: 0, students: [] });

    const n = lastRow - firstRow + 1;
    const read = (col) => sheet.getRange(firstRow, col, n, 1).getValues(); 
    const ids = read(idCol), names = read(nameCol), progs = read(progCol), years = read(yearCol);

    const skip = dividerRows_(sheet, firstRow, n, idCol);  

    const students = [];
    for (let i = 0; i < n; i++) {
      if (skip.has(i)) continue;                       
      const id = String(ids[i][0]).trim();
      if (!id) continue;                       
      students.push({
        id: id,
        name: String(names[i][0]).trim(),
        program: String(progs[i][0]).trim(),
        year: String(years[i][0]).trim(),
      });
    }
    return json_({ ok: true, count: students.length, students: students });
  } catch (err) {
    return json_({ ok: false, error: message_(err) });
  }
}

/* ========================== POST: attendance batch ======================== */

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

    lock.waitLock(SETTINGS.LOCK_WAIT_MS);

    const sheet = getSheet_(cfg.sheet);
    const firstRow = toInt_(cfg.firstRow, 2);
    const idCol = colIndex_(cfg.idCol);
    const startCol = colIndex_(cfg.startCol);
    const width = sessions.length;
    const tz = sheet.getParent().getSpreadsheetTimeZone();

    const headerRow = firstRow - 1;
    if (headerRow >= 1) {
      const hdr = sheet.getRange(headerRow, startCol, 1, width);
      const cur = hdr.getValues()[0];
      let changed = false;
      for (let c = 0; c < width; c++) if (cur[c] === '') { cur[c] = sessions[c]; changed = true; }
      if (changed) hdr.setValues([cur]);
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

    const block = sheet.getRange(firstRow, startCol, n, width);
    const values = block.getValues();
    let dirty = false;
    const results = [];

    const policy = (cfg.timePolicy === 'latest' || cfg.timePolicy === 'earliest')
      ? cfg.timePolicy : SETTINGS.DEFAULT_TIME_POLICY;

    for (const en of entries) {
      const col = sessions.indexOf(en.session);
      if (col < 0) { results.push({ qid: en.qid, status: 'bad_session' }); continue; }

      const row = rowOf.get(norm_(en.id));
      if (row === undefined) { results.push({ qid: en.qid, status: 'not_found' }); continue; }

      const existing = values[row][col];
      if (existing !== '' && existing !== null) {
        const oldSec = Math.floor(existingMs_(existing, tz) / 1000);
        const newSec = Math.floor(Number(en.ts) / 1000);
        const replace = !isNaN(oldSec) && (policy === 'latest' ? newSec > oldSec : newSec < oldSec);
        if (!replace) { results.push({ qid: en.qid, status: 'duplicate' }); continue; }
      }

      values[row][col] = Utilities.formatDate(new Date(Number(en.ts)), tz, SETTINGS.TIMESTAMP_FORMAT);
      dirty = true;
      results.push({ qid: en.qid, status: 'written' });
    }

    if (dirty) block.setValues(values);
    SpreadsheetApp.flush();
    return json_({ ok: true, results: results });
  } catch (err) {
    return json_({ ok: false, error: message_(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) { /* lock was never acquired */ }
  }
}

/* ================================ Helpers ================================= */

/** Optional shared secret. Set Project Settings → Script properties → ACCESS_KEY. */
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

/** "A" → 1, "AB" → 28. Throws on anything that is not 1–3 letters. */
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
    if (m.getNumColumns() < 2) return;                                // ignore vertical-only merges
    if (idCol < m.getColumn() || idCol > m.getLastColumn()) return;   // must cover the ID column
    for (let r = m.getRow(); r <= m.getLastRow(); r++) skip.add(r - firstRow);
  });
  return skip;
}

function existingMs_(v, tz) {
  if (v instanceof Date) return v.getTime();
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    try { return Utilities.parseDate(s, tz, 'yyyy-MM-dd HH:mm:ss').getTime(); } catch (e) { /* fall through */ }
  }
  return NaN;
}

const norm_ = (v) => String(v == null ? '' : v).trim().toUpperCase();
const toInt_ = (v, dflt) => { const n = parseInt(v, 10); return n >= 1 ? n : dflt; };
const message_ = (err) => String((err && err.message) || err);

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
