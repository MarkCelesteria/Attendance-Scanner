/**
 * ============================================================================
 * Attendance Sheet — Google Apps Script Web App
 * ----------------------------------------------------------------------------
 * Paste this whole file into the Apps Script editor attached to your Sheet
 * (Extensions → Apps Script), replacing Code.gs. Then Deploy → New deployment
 * → Web app → Execute as: Me, Who has access: Anyone.
 *
 * Endpoints
 *   GET  ?idCol=A&nameCol=B&programCol=C&yearCol=D&firstRow=2[&sheet=Tab][&key=…]
 *        → { ok, count, students: [{id, name, program, year}, …] }
 *   POST body (JSON, sent as text/plain to avoid CORS preflight):
 *        { key, config:{sheet,idCol,startCol,sessions[],firstRow},
 *          entries:[{qid,id,session,ts(ms epoch)}, …] }
 *        → { ok, results:[{qid,status}] }
 *        status: written | duplicate | not_found | bad_session
 *
 * The script is stateless: column layout and session names come from the app
 * with every request, so one script works for any sheet layout.
 * ============================================================================
 */

const SETTINGS = {
  // true  = a second scan for the same student + session replaces the first timestamp
  // false = the FIRST timestamp is kept; later scans are reported as "duplicate"
  OVERWRITE_EXISTING: false,

  // Format written into the cell (uses the spreadsheet's own time zone).
  TIMESTAMP_FORMAT: 'yyyy-MM-dd HH:mm:ss',

  // Max time to wait if two devices sync at the same moment.
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
    const read = (col) => sheet.getRange(firstRow, col, n, 1).getValues();   // 4 bulk reads, not n×4
    const ids = read(idCol), names = read(nameCol), progs = read(progCol), years = read(yearCol);

    const students = [];
    for (let i = 0; i < n; i++) {
      const id = String(ids[i][0]).trim();
      if (!id) continue;                                   // skip blank rows
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

    // Serialise writers so two phones syncing at once cannot clobber each other.
    lock.waitLock(SETTINGS.LOCK_WAIT_MS);

    const sheet = getSheet_(cfg.sheet);
    const firstRow = toInt_(cfg.firstRow, 2);
    const idCol = colIndex_(cfg.idCol);
    const startCol = colIndex_(cfg.startCol);
    const width = sessions.length;
    const tz = sheet.getParent().getSpreadsheetTimeZone();

    // Label the timestamp columns (only fills EMPTY header cells).
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

    // Build ID -> row offset map ONCE (first occurrence wins). This guarantees we
    // only ever update the existing student row and never create a new one.
    const idVals = sheet.getRange(firstRow, idCol, n, 1).getValues();
    const rowOf = new Map();
    for (let i = 0; i < n; i++) {
      const k = norm_(idVals[i][0]);
      if (k && !rowOf.has(k)) rowOf.set(k, i);
    }

    // Read the whole timestamp block, edit in memory, write it back in ONE call.
    const block = sheet.getRange(firstRow, startCol, n, width);
    const values = block.getValues();
    let dirty = false;
    const results = [];

    for (const en of entries) {
      const col = sessions.indexOf(en.session);
      if (col < 0) { results.push({ qid: en.qid, status: 'bad_session' }); continue; }

      const row = rowOf.get(norm_(en.id));
      if (row === undefined) { results.push({ qid: en.qid, status: 'not_found' }); continue; }

      const existing = values[row][col];
      if (existing !== '' && existing !== null && !SETTINGS.OVERWRITE_EXISTING) {
        results.push({ qid: en.qid, status: 'duplicate' });
        continue;
      }

      // Use the time the student was SCANNED (en.ts), not the time we synced.
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

const norm_ = (v) => String(v == null ? '' : v).trim().toUpperCase();
const toInt_ = (v, dflt) => { const n = parseInt(v, 10); return n >= 1 ? n : dflt; };
const message_ = (err) => String((err && err.message) || err);

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
