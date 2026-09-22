/** First-time / edit setup screen. */
import { state } from './state.js';
import { $, colToIndex, indexToCol, toast } from './utils.js';
import { readForm, saveConfig, clearLocalSettings } from './config.js';
import { downloadRoster } from './roster.js';
import { clearAllStores } from './db.js';
import { stopScanner } from './scanner.js';
import { renderRosterMeta } from './ui.js';
import { refreshPending } from './sync.js';
import { clearRecent } from './history.js';
import { showDashboard } from './dashboard.js';

/** Column letter after the highest one already used (for the "+" button). */
function nextColumn() {
  const used = [...document.querySelectorAll('#session-rows .s-col, #cfg-id, #cfg-name, #cfg-program, #cfg-year, #cfg-college, #cfg-gender')]
    .map((el) => el.value.trim())
    .filter((v) => /^[A-Za-z]{1,3}$/.test(v))
    .map(colToIndex);
  return indexToCol((used.length ? Math.max(...used) : 4) + 1);
}

function updateRemoveButtons() {
  const rows = document.querySelectorAll('#session-rows .session-row');
  rows.forEach((r) => { r.querySelector('.row-del').disabled = rows.length < 2; });
}

function addSessionRow(name = '', col = '', supName = '', supCol = '') {
  const row = document.createElement('div');
  row.className = 'session-row';

  const nameEl = document.createElement('input');
  nameEl.type = 'text'; nameEl.className = 's-name'; nameEl.value = name;
  nameEl.placeholder = 'e.g. Morning In'; nameEl.autocomplete = 'off';
  nameEl.setAttribute('aria-label', 'Session name');

  const colEl = document.createElement('input');
  colEl.type = 'text'; colEl.className = 's-col'; colEl.value = col; colEl.maxLength = 3;
  colEl.placeholder = 'E'; colEl.autocomplete = 'off';
  colEl.setAttribute('aria-label', 'Column letter');

  const del = document.createElement('button');
  del.type = 'button'; del.className = 'row-del'; del.textContent = '×';
  del.setAttribute('aria-label', 'Remove this session');

  const supNameEl = document.createElement('input');
  supNameEl.type = 'text'; supNameEl.className = 'sup-name'; supNameEl.value = supName;
  supNameEl.placeholder = 'Timekeeper for this session'; supNameEl.autocomplete = 'off';
  supNameEl.setAttribute('aria-label', 'Timekeeper name for this session');

  const supColEl = document.createElement('input');
  supColEl.type = 'text'; supColEl.className = 'sup-col'; supColEl.value = supCol; supColEl.maxLength = 3;
  supColEl.placeholder = 'Column'; supColEl.autocomplete = 'off';
  supColEl.setAttribute('aria-label', 'Timekeeper column letter for this session');

  row.append(nameEl, colEl, del, supNameEl, supColEl);
  $('session-rows').appendChild(row);
  updateRemoveButtons();
  return nameEl;
}

function buildSessionRows(list) {
  $('session-rows').textContent = '';
  (list && list.length ? list : [{ name: '', col: 'E' }]).forEach((s) => addSessionRow(s.name, s.col, s.supName || '', s.supCol || ''));
}

export function initSessionEditor() {
  $('btn-add-session').addEventListener('click', () => addSessionRow('', nextColumn()).focus());
  $('session-rows').addEventListener('click', (e) => {
    const b = e.target.closest('.row-del');
    if (b && !b.disabled) { b.closest('.session-row').remove(); updateRemoveButtons(); }
  });
}

function updateSuperVisibility() {
  const on = $('cfg-super-on').checked;
  $('super-options').hidden = !on;
  const perSession = on && $('cfg-super-per-session').checked;
  $('single-super').hidden = perSession;
  $('super-hint').hidden = !perSession;
  $('session-rows').classList.toggle('show-sup', perSession);
}

export function initAdvancedToggles() {
  $('cfg-super-on').addEventListener('change', updateSuperVisibility);
  $('cfg-super-per-session').addEventListener('change', updateSuperVisibility);
  $('cfg-sheet-on').addEventListener('change', (e) => { $('cfg-sheet').hidden = !e.target.checked; });
  $('cfg-row-on').addEventListener('change', (e) => {
    $('cfg-row').hidden = !e.target.checked;
    if (!e.target.checked) $('cfg-row').value = 2;
  });
  $('cfg-policy-earliest').addEventListener('change', updatePolicyLabel);
}

function updatePolicyLabel() {
  const earliest = $('cfg-policy-earliest').checked;
  $('cfg-policy-label').firstChild.textContent = earliest ? 'Keep earliest scan' : 'Keep latest scan';
  $('cfg-policy-hint').textContent = earliest
    ? 'If a student is scanned twice in one session, the first time is kept.'
    : 'If a student is scanned twice in one session, the most recent time is kept.';
}

export function showSetup(isEditing) {
  stopScanner();
  $('view-dashboard').hidden = true;
  $('view-setup').hidden = false;
  $('btn-setup-cancel').hidden = !isEditing;
  $('btn-reset').hidden = !isEditing;
  $('setup-error').hidden = true;

  const c = state.config;
  if (c) {
    $('cfg-url').value = c.scriptUrl;       $('cfg-key').value = c.accessKey || '';
    $('cfg-id').value = c.idCol;            $('cfg-name').value = c.nameCol;
    $('cfg-program').value = c.programCol || '';  $('cfg-year').value = c.yearCol || '';
    $('cfg-college').value = c.collegeCol || '';  $('cfg-gender').value = c.genderCol || '';
    $('cfg-sheet-on').checked = !!c.sheetName;
    $('cfg-sheet').value = c.sheetName || '';
    $('cfg-sheet').hidden = !c.sheetName;
    $('cfg-row-on').checked = c.firstRow !== 2;
    $('cfg-row').value = c.firstRow || 2;
    $('cfg-row').hidden = c.firstRow === 2;
    $('cfg-policy-earliest').checked = (c.timePolicy || 'earliest') === 'earliest';
    updatePolicyLabel();
    $('cfg-super-on').checked = (c.timekeeperMode || 'off') !== 'off';
    $('cfg-super-per-session').checked = c.timekeeperMode === 'per-session';
    $('cfg-super-name').value = c.timekeeperName || '';
    $('cfg-super-col').value = c.timekeeperMode === 'single' && c.sessions[0] ? c.sessions[0].supCol || '' : '';
  }
  buildSessionRows(c ? c.sessions : null);
  updateSuperVisibility();
}

export async function onSetupSubmit(ev) {
  ev.preventDefault();
  const errEl = $('setup-error');
  errEl.hidden = true;

  let cfg;
  try { cfg = readForm(); } catch (e) { errEl.textContent = e.message; errEl.hidden = false; return; }

  const btn = $('btn-setup-save');
  btn.disabled = true;
  btn.textContent = 'Downloading roster…';
  try {
    await downloadRoster(cfg);   // only save the config if the sheet is reachable
    state.config = cfg;
    saveConfig(cfg);
    showDashboard();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save and download roster';
  }
}

export async function onReset() {
  await refreshPending();
  const warn = state.pending
    ? `${state.pending} scan(s) have not been uploaded yet and will be lost. Reset anyway?`
    : 'Remove the saved setup and roster from this device?';
  if (!confirm(warn)) return;
  clearLocalSettings();
  await clearAllStores();
  clearRecent();
  state.config = null; state.roster = new Map(); state.pending = 0;
  $('setup-form').reset();
  showSetup(false);
}

export async function onRefreshRoster() {
  if (!navigator.onLine) { toast('You are offline. Roster refresh needs internet.'); return; }
  const btn = $('btn-refresh');
  btn.classList.add('is-spinning'); btn.disabled = true;
  try { await downloadRoster(state.config); renderRosterMeta(); toast(`Roster updated: ${state.roster.size} students`); }
  catch (e) { toast(e.message, 5000); }
  finally { btn.classList.remove('is-spinning'); btn.disabled = false; }
}
