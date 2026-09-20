/** Saved setup (localStorage) and setup-form validation. */
import { LS_CONFIG, LS_ACTIVE, LS_ROSTER_T } from './constants.js';
import { $, colToIndex, indexToCol } from './utils.js';

export function loadConfig() {
  try { return JSON.parse(localStorage.getItem(LS_CONFIG)) || null; } catch { return null; }
}

export function saveConfig(cfg) {
  localStorage.setItem(LS_CONFIG, JSON.stringify(cfg));
}

/** Remove every localStorage key this app owns. */
export function clearLocalSettings() {
  [LS_CONFIG, LS_ACTIVE, LS_ROSTER_T].forEach((k) => localStorage.removeItem(k));
}

/** Read + validate the setup form. Throws Error(message) on invalid input. */
export function readForm() {
  const val = (id) => $(id).value.trim();
  const colRe = /^[A-Za-z]{1,3}$/;

  const scriptUrl = val('cfg-url');
  if (!/^https:\/\//i.test(scriptUrl)) throw new Error('Enter the full Web App URL (it starts with https://).');

  const sessions = val('cfg-sessions').split(',').map((s) => s.trim()).filter(Boolean);
  if (!sessions.length) throw new Error('Enter at least one session name.');
  if (new Set(sessions.map((s) => s.toLowerCase())).size !== sessions.length) {
    throw new Error('Session names must be unique.');
  }

  const cols = {
    idCol: val('cfg-id'), nameCol: val('cfg-name'), programCol: val('cfg-program'),
    yearCol: val('cfg-year'), startCol: val('cfg-start'),
  };
  for (const [k, v] of Object.entries(cols)) {
    if (!colRe.test(v)) throw new Error('Column letters must be 1–3 letters, like A or AB.');
    cols[k] = v.toUpperCase();
  }

  // Timestamp columns must not overwrite the student info columns.
  const first = colToIndex(cols.startCol);
  const last = first + sessions.length - 1;
  for (const k of ['idCol', 'nameCol', 'programCol', 'yearCol']) {
    const idx = colToIndex(cols[k]);
    if (idx >= first && idx <= last) {
      throw new Error(`Timestamp columns ${cols.startCol}–${indexToCol(last)} overlap the ${cols[k]} info column.`);
    }
  }

  const firstRow = parseInt(val('cfg-row'), 10);
  if (!(firstRow >= 1)) throw new Error('First student row must be 1 or higher.');

  return { scriptUrl, accessKey: val('cfg-key'), sessions, ...cols, sheetName: val('cfg-sheet'), firstRow };
}
