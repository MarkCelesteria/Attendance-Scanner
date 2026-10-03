import { LS_CONFIG, LS_ACTIVE, LS_ROSTER_T } from './constants.js';
import { $, colToIndex, indexToCol } from './utils.js';

export function loadConfig() {
  let c;
  try { c = JSON.parse(localStorage.getItem(LS_CONFIG)); } catch { return null; }
  if (!c) return null;
  if (Array.isArray(c.sessions) && typeof c.sessions[0] === 'string') {
    const start = colToIndex(c.startCol || 'E');
    c.sessions = c.sessions.map((name, i) => ({ name, col: indexToCol(start + i) }));
    delete c.startCol;
    saveConfig(c);
  }
  if (!Array.isArray(c.sheetNames)) {
    c.sheetNames = c.sheetName ? [c.sheetName] : [];
    delete c.sheetName;
    saveConfig(c);
  }
  return c;
}

export function saveConfig(cfg) {
  localStorage.setItem(LS_CONFIG, JSON.stringify(cfg));
}

export function clearLocalSettings() {
  [LS_CONFIG, LS_ACTIVE, LS_ROSTER_T].forEach((k) => localStorage.removeItem(k));
}

export function encodeShareCode(cfg) {
  const { accessKey, ...shareable } = cfg;
  if (cfg.restrictShare) shareable.locked = true;
  return btoa(unescape(encodeURIComponent(JSON.stringify(shareable))));
}

export function decodeShareCode(code) {
  let cfg;
  try { cfg = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); }
  catch { throw new Error('Not a valid setup code.'); }
  if (!cfg || typeof cfg !== 'object' || !cfg.scriptUrl || !Array.isArray(cfg.sessions)) {
    throw new Error('Not a valid setup code.');
  }
  return cfg;
}

export function readForm() {
  const val = (id) => $(id).value.trim();
  const colRe = /^[A-Za-z]{1,3}$/;

  const scriptUrl = val('cfg-url');
  if (!/^https:\/\//i.test(scriptUrl)) throw new Error('Enter the full Web App URL (it starts with https://).');

  const infoDefs = [
    ['idCol', 'cfg-id', 'Student ID', true],
    ['nameCol', 'cfg-name', 'Name', true],
    ['programCol', 'cfg-program', 'Program', false],
    ['yearCol', 'cfg-year', 'Year level', false],
    ['collegeCol', 'cfg-college', 'College', false],
    ['genderCol', 'cfg-gender', 'Gender', false],
  ];
  const infoCols = {};
  const infoUsed = new Map();   // column index -> label
  for (const [key, id, label, required] of infoDefs) {
    const v = val(id);
    if (!v) {
      if (required) throw new Error(`${label} column is required.`);
      infoCols[key] = '';
      continue;
    }
    if (!colRe.test(v)) throw new Error(`${label}: enter a column letter like A or AB.`);
    const letters = v.toUpperCase();
    const idx = colToIndex(letters);
    if (infoUsed.has(idx)) throw new Error(`${label} and ${infoUsed.get(idx)} both use column ${letters}.`);
    infoUsed.set(idx, label);
    infoCols[key] = letters;
  }

  const rows = [...document.querySelectorAll('#session-rows .session-row')];
  if (!rows.length) throw new Error('Add at least one session.');
  const sessions = rows.map((row, i) => {
    const n = i + 1;
    const name = row.querySelector('.s-name').value.trim();
    const col = row.querySelector('.s-col').value.trim().toUpperCase();
    if (!name) throw new Error(`Session ${n}: enter a name, or remove the row with ×.`);
    if (!colRe.test(col)) throw new Error(`Session ${n} (${name}): enter a column letter like E or AB.`);
    const s = { name, col };
    const start = row.querySelector('.s-start').value;
    const end = row.querySelector('.s-end').value;
    if (start || end) {
      if (!start || !end) throw new Error(`Session ${n} (${name}): set both a start and end time, or leave both blank.`);
      if (start >= end) throw new Error(`Session ${n} (${name}): the end time must be after the start time.`);
      s.start = start; s.end = end;
    }
    return s;
  });

  const timed = sessions.filter((s) => s.start);
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (timed[i].start < timed[j].end && timed[j].start < timed[i].end) {
        throw new Error(`"${timed[i].name}" and "${timed[j].name}" have overlapping time windows.`);
      }
    }
  }

  const seenNames = new Set(), seenCols = new Set();
  for (const s of sessions) {
    if (seenNames.has(s.name.toLowerCase())) throw new Error(`Session name "${s.name}" is used twice.`);
    seenNames.add(s.name.toLowerCase());
    if (seenCols.has(s.col)) throw new Error(`Column ${s.col} is used by more than one session.`);
    seenCols.add(s.col);
    const clash = infoUsed.get(colToIndex(s.col));
    if (clash) throw new Error(`Session "${s.name}" uses column ${s.col}, which is the ${clash} column.`);
  }

  const rowOn = $('cfg-row-on').checked;
  let firstRow = 2;
  if (rowOn) {
    firstRow = parseInt(val('cfg-row'), 10);
    if (!(firstRow >= 1)) throw new Error('First student row must be 1 or higher.');
  }
  const sheetNames = $('cfg-sheet-on').checked
    ? val('cfg-sheet').split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const seenSheets = new Set();
  for (const name of sheetNames) {
    const key = name.toLowerCase();
    if (seenSheets.has(key)) throw new Error(`Sheet tab "${name}" is listed twice.`);
    seenSheets.add(key);
  }

  const superOn = $('cfg-super-on').checked;
  let timekeeperMode = 'off', timekeeperName = '';
  if (superOn) {
    const perSession = $('cfg-super-per-session').checked;
    timekeeperMode = perSession ? 'per-session' : 'single';
    if (perSession) {
      rows.forEach((row, i) => {
        const n = i + 1, label = sessions[i].name;
        const supName = row.querySelector('.sup-name').value.trim();
        const supCol = row.querySelector('.sup-col').value.trim().toUpperCase();
        if (!supName) throw new Error(`Session ${n} (${label}): enter the timekeeper's name, or turn off "Different timekeeper per session".`);
        if (!colRe.test(supCol)) throw new Error(`Session ${n} (${label}): enter a timekeeper column letter.`);
        if (seenCols.has(supCol)) throw new Error(`Column ${supCol} is used more than once.`);
        seenCols.add(supCol);
        const clash = infoUsed.get(colToIndex(supCol));
        if (clash) throw new Error(`Session "${label}"'s timekeeper column ${supCol} is the ${clash} column.`);
        sessions[i].supName = supName;
        sessions[i].supCol = supCol;
      });
    } else {
      timekeeperName = val('cfg-super-name');
      if (!timekeeperName) throw new Error("Enter the timekeeper's name, or turn off timekeeper tracking.");
      const supCol = val('cfg-super-col').toUpperCase();
      if (!colRe.test(supCol)) throw new Error('Timekeeper column: enter a column letter like K or AB.');
      if (seenCols.has(supCol)) throw new Error(`Column ${supCol} is used more than once.`);
      seenCols.add(supCol);
      const clash = infoUsed.get(colToIndex(supCol));
      if (clash) throw new Error(`The timekeeper column ${supCol} is the ${clash} column.`);
      sessions.forEach((s) => { s.supName = timekeeperName; s.supCol = supCol; });
    }
  }

  const cameraIdleMs = $('cfg-camera-idle-on').checked ? parseInt($('cfg-camera-idle').value, 10) : 0;

  return { scriptUrl, sessions, ...infoCols, sheetNames, firstRow,
    timePolicy: $('cfg-policy-earliest').checked ? 'earliest' : 'latest', timekeeperMode, timekeeperName,
    adminEnabled: $('cfg-admin-on').checked, sessionLockEnabled: $('cfg-session-lock-on').checked,
    soundOnScan: $('cfg-sound-on').checked, cameraIdleMs, undoLockEnabled: $('cfg-undo-lock-on').checked,
    bigScansEnabled: $('cfg-bigscans-on').checked, syncProfile: $('cfg-bigscans-profile').value,
    restrictShare: $('cfg-restrict-share-on').checked };
}
