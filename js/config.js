/** Saved setup (localStorage) and setup-form validation. */
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
  return c;
}

export function saveConfig(cfg) {
  localStorage.setItem(LS_CONFIG, JSON.stringify(cfg));
}

export function clearLocalSettings() {
  [LS_CONFIG, LS_ACTIVE, LS_ROSTER_T].forEach((k) => localStorage.removeItem(k));
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

  // One row per session: name on the left, sheet column on the right.
  const rows = [...document.querySelectorAll('#session-rows .session-row')];
  if (!rows.length) throw new Error('Add at least one session.');
  const sessions = rows.map((row, i) => {
    const n = i + 1;
    const name = row.querySelector('.s-name').value.trim();
    const col = row.querySelector('.s-col').value.trim().toUpperCase();
    if (!name) throw new Error(`Session ${n}: enter a name, or remove the row with ×.`);
    if (!colRe.test(col)) throw new Error(`Session ${n} (${name}): enter a column letter like E or AB.`);
    return { name, col };
  });

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
  const sheetName = $('cfg-sheet-on').checked ? val('cfg-sheet') : '';

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

  return { scriptUrl, accessKey: val('cfg-key'), sessions, ...infoCols, sheetName, firstRow,
    timePolicy: $('cfg-policy-earliest').checked ? 'earliest' : 'latest', timekeeperMode, timekeeperName };
}
