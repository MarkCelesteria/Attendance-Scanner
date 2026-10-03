import { state } from './state.js';
import { $, colToIndex, indexToCol, toast } from './utils.js';
import { readForm, saveConfig, clearLocalSettings, encodeShareCode, decodeShareCode } from './config.js';
import { downloadRoster } from './roster.js';
import { clearAllStores } from './db.js';
import { stopScanner } from './scanner.js';
import { stopScheduler } from './scheduler.js';
import { renderRosterMeta } from './ui.js';
import { refreshPending } from './sync.js';
import { clearRecent } from './history.js';
import { showDashboard } from './dashboard.js';

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

function addSessionRow(name = '', col = '', supName = '', supCol = '', start = '', end = '') {
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
  supColEl.placeholder = 'Z'; supColEl.autocomplete = 'off';
  supColEl.setAttribute('aria-label', 'Timekeeper column letter for this session');

  const scheduleWrap = document.createElement('div');
  scheduleWrap.className = 'schedule-fields filter-time-row';

  const startField = document.createElement('div');
  startField.className = 'filter-time-field';
  const startInner = document.createElement('div');
  startInner.className = 'filter-time-field-inner';
  const startLabel = document.createElement('span');
  startLabel.className = 'filter-time-label'; startLabel.textContent = 'Start';
  const startEl = document.createElement('input');
  startEl.type = 'time'; startEl.className = 's-start'; startEl.value = start;
  startEl.setAttribute('aria-label', 'Session start time');
  startInner.append(startLabel, startEl);
  startField.appendChild(startInner);

  const divider = document.createElement('span');
  divider.className = 'filter-time-divider';
  divider.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="currentColor"><path d="m560-240-56-58 142-142H160v-80h486L504-662l56-58 240 240-240 240Z"/></svg>';

  const endField = document.createElement('div');
  endField.className = 'filter-time-field';
  const endInner = document.createElement('div');
  endInner.className = 'filter-time-field-inner';
  const endLabel = document.createElement('span');
  endLabel.className = 'filter-time-label'; endLabel.textContent = 'End';
  const endEl = document.createElement('input');
  endEl.type = 'time'; endEl.className = 's-end'; endEl.value = end;
  endEl.setAttribute('aria-label', 'Session end time');
  endInner.append(endLabel, endEl);
  endField.appendChild(endInner);

  scheduleWrap.append(startField, divider, endField);

  row.append(nameEl, colEl, del, supNameEl, supColEl, scheduleWrap);
  $('session-rows').appendChild(row);
  updateRemoveButtons();
  return nameEl;
}

function buildSessionRows(list) {
  $('session-rows').textContent = '';
  (list && list.length ? list : [{ name: '', col: 'E' }]).forEach((s) =>
    addSessionRow(s.name, s.col, s.supName || '', s.supCol || '', s.start || '', s.end || ''));
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
  $('cfg-camera-idle-on').addEventListener('change', (e) => {
    $('camera-idle-wrap').hidden = !e.target.checked;
    if (e.target.checked) $('cfg-camera-idle').value = '60000';
  });
  $('cfg-bigscans-on').addEventListener('change', (e) => { $('bigscans-options').hidden = !e.target.checked; });
  $('cfg-schedule-on').addEventListener('change', (e) => { $('session-rows').classList.toggle('show-schedule', e.target.checked); });
}

function updatePolicyLabel() {
  const earliest = $('cfg-policy-earliest').checked;
  $('cfg-policy-label').firstChild.textContent = earliest ? 'Keep earliest scan' : 'Keep latest scan';
  $('cfg-policy-hint').textContent = earliest
    ? 'If a student is scanned twice in one session, the first time is kept.'
    : 'If a student is scanned twice in one session, the most recent time is kept.';
}

function fillFormFromConfig(c) {
  $('cfg-url').value = c.scriptUrl || '';
  $('cfg-id').value = c.idCol || '';            $('cfg-name').value = c.nameCol || '';
  $('cfg-program').value = c.programCol || '';  $('cfg-year').value = c.yearCol || '';
  $('cfg-college').value = c.collegeCol || '';  $('cfg-gender').value = c.genderCol || '';
  $('cfg-sheet-on').checked = c.sheetNames && c.sheetNames.length > 0;
  $('cfg-sheet').value = (c.sheetNames || []).join(', ');
  $('cfg-sheet').hidden = !(c.sheetNames && c.sheetNames.length);
  $('cfg-row-on').checked = c.firstRow !== 2;
  $('cfg-row').value = c.firstRow || 2;
  $('cfg-row').hidden = c.firstRow === 2;
  $('cfg-policy-earliest').checked = (c.timePolicy || 'earliest') === 'earliest';
  updatePolicyLabel();
  $('cfg-super-on').checked = (c.timekeeperMode || 'off') !== 'off';
  $('cfg-super-per-session').checked = c.timekeeperMode === 'per-session';
  $('cfg-super-name').value = c.timekeeperName || '';
  $('cfg-super-col').value = c.timekeeperMode === 'single' && c.sessions && c.sessions[0] ? c.sessions[0].supCol || '' : '';
  $('cfg-admin-on').checked = c.adminEnabled !== false;
  $('cfg-session-lock-on').checked = c.sessionLockEnabled !== false;
  $('cfg-undo-lock-on').checked = c.undoLockEnabled !== false;
  $('cfg-sound-on').checked = c.soundOnScan !== false;
  $('cfg-camera-idle-on').checked = c.cameraIdleMs > 0;
  $('cfg-camera-idle').value = String(c.cameraIdleMs || 60000);
  $('camera-idle-wrap').hidden = !(c.cameraIdleMs > 0);
  $('cfg-bigscans-on').checked = !!c.bigScansEnabled;
  $('cfg-bigscans-profile').value = c.syncProfile || 'standard';
  $('bigscans-options').hidden = !c.bigScansEnabled;
  $('cfg-restrict-share-on').checked = !!c.restrictShare;
  const hasSchedule = (c.sessions || []).some((s) => s.start && s.end);
  $('cfg-schedule-on').checked = hasSchedule;
  $('session-rows').classList.toggle('show-schedule', hasSchedule);
  buildSessionRows(c.sessions);
  updateSuperVisibility();
}

export function showSetup(isEditing) {
  if (isEditing && state.config && state.config.locked) { beginJoinFlow(state.config); return; }
  stopScanner();
  stopScheduler();
  $('view-dashboard').hidden = true;
  $('view-setup').hidden = false;
  $('btn-setup-cancel').hidden = !isEditing;
  $('btn-copy-setup-code').hidden = !isEditing;
  $('btn-reset').hidden = !isEditing;
  $('setup-error').hidden = true;

  const c = state.config;
  if (c) { fillFormFromConfig(c); }
  else { buildSessionRows(null); updateSuperVisibility(); }
}

async function downloadWithKeyRetry(cfg, reportError) {
  let keyErrorMsg = '';
  for (;;) {
    try { await downloadRoster(cfg); return true; }
    catch (e) {
      if (e.code !== 'bad_key') { reportError(e.message); return false; }
      const key = await askSetupKey(keyErrorMsg);
      if (key === null) { reportError('An access key is required to save this setup.'); return false; }
      cfg.accessKey = key;
      keyErrorMsg = 'Incorrect access key.';
    }
  }
}

function namesNeeded(cfg) {
  if (cfg.timekeeperMode === 'per-session') return cfg.sessions.map((s) => s.name);
  if (cfg.timekeeperMode === 'single') return ['__single__'];
  return [];
}

function openJoinModal(cfg) {
  return new Promise((resolve) => {
    const modal = $('join-setup-modal');
    const wrap = $('join-names');
    const err = $('join-setup-error');
    const confirmBtn = $('btn-join-confirm');
    const cancelBtn = $('btn-join-cancel');
    const resetBtn = $('btn-join-reset');
    err.hidden = true;
    wrap.textContent = '';

    const needed = namesNeeded(cfg);
    const inputs = [];
    if (!needed.length) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'No extra info needed from you — just confirm to continue.';
      wrap.appendChild(p);
    }
    needed.forEach((label) => {
      const row = document.createElement('div');
      row.className = 'join-row';
      const lbl = document.createElement('label');
      lbl.textContent = label === '__single__' ? "Timekeeper's name" : `Timekeeper for "${label}"`;
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = 'Enter name';
      inp.value = label === '__single__'
        ? (cfg.timekeeperName || '')
        : ((cfg.sessions.find((x) => x.name === label) || {}).supName || '');
      row.append(lbl, inp);
      wrap.appendChild(row);
      inputs.push({ key: label, el: inp });
    });

    modal.showModal();

    const cleanup = () => {
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      resetBtn.removeEventListener('click', onResetClick);
      modal.removeEventListener('close', onCancel);
    };
    const onConfirm = () => {
      for (const { el } of inputs) {
        if (!el.value.trim()) { err.textContent = 'Enter a name for every field.'; err.hidden = false; return; }
      }
      cleanup(); modal.close();
      const result = { ...cfg };
      if (inputs.length && inputs[0].key === '__single__') {
        result.timekeeperName = inputs[0].el.value.trim();
        result.sessions = result.sessions.map((s) => ({ ...s, supName: result.timekeeperName }));
      } else if (inputs.length) {
        result.sessions = result.sessions.map((s) => {
          const found = inputs.find((i) => i.key === s.name);
          return found ? { ...s, supName: found.el.value.trim() } : s;
        });
      }
      resolve(result);
    };
    const onCancel = () => { cleanup(); if (modal.open) modal.close(); resolve(null); };
    const onResetClick = async () => { cleanup(); if (modal.open) modal.close(); await onReset(); resolve(null); };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    resetBtn.addEventListener('click', onResetClick);
    modal.addEventListener('close', onCancel);
  });
}

async function beginJoinFlow(cfg) {
  stopScanner();
  const result = await openJoinModal(cfg);
  if (!result) return;
  result.accessKey = '';
  const ok = await downloadWithKeyRetry(result, (msg) => toast(msg, 6000));
  if (!ok) return;
  state.config = result;
  state.authFailed = false;
  saveConfig(result);
  toast('Setup applied.');
  showDashboard();
}

export async function onCopySetupCode() {
  if (!state.config) return;
  const code = encodeShareCode(state.config);
  try {
    const { copyText } = await import('./utils.js');
    await copyText(code);
    toast('Setup code copied. Share it with whoever needs the same setup.');
  } catch {
    toast('Could not copy automatically.', 5000);
  }
}

export function onApplySetupCode() {
  const errEl = $('setup-error');
  errEl.hidden = true;
  const raw = $('cfg-share-code').value.trim();
  if (!raw) return;

  let cfg;
  try { cfg = decodeShareCode(raw); }
  catch (e) { errEl.textContent = e.message; errEl.hidden = false; return; }

  $('cfg-share-code').value = '';

  if (cfg.locked) { beginJoinFlow(cfg); return; }

  fillFormFromConfig(cfg);
  toast('Setup applied. You\'ll be asked for the access key when you save, if the sheet needs one.');
}

function askSetupKey(initialError) {
  return new Promise((resolve) => {
    const modal = $('setup-key-modal');
    const input = $('setup-key-input');
    const err = $('setup-key-error');
    const confirmBtn = $('btn-setup-key-confirm');
    const cancelBtn = $('btn-setup-key-cancel');

    if (initialError) { err.textContent = initialError; err.hidden = false; } else { err.hidden = true; }
    input.value = '';
    modal.showModal();
    input.focus();

    const cleanup = () => {
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKeydown);
      modal.removeEventListener('close', onCancel);
    };
    const onConfirm = () => {
      const v = input.value.trim();
      if (!v) { err.textContent = 'Enter the access key.'; err.hidden = false; return; }
      cleanup(); modal.close(); resolve(v);
    };
    const onCancel = () => { cleanup(); if (modal.open) modal.close(); resolve(null); };
    const onKeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); onConfirm(); } };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeydown);
    modal.addEventListener('close', onCancel);
  });
}

export async function onSetupSubmit(ev) {
  ev.preventDefault();
  const errEl = $('setup-error');
  errEl.hidden = true;

  let cfg;
  try { cfg = readForm(); } catch (e) { errEl.textContent = e.message; errEl.hidden = false; return; }

  cfg.accessKey = '';

  const btn = $('btn-setup-save');
  btn.disabled = true;
  btn.textContent = 'Downloading roster…';

  try {
    const ok = await downloadWithKeyRetry(cfg, (msg) => { errEl.textContent = msg; errEl.hidden = false; });
    if (!ok) return;
    state.config = cfg;
    state.authFailed = false;
    saveConfig(cfg);
    showDashboard();
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
  state.config = null; state.roster = new Map(); state.pending = 0; state.adminUnlocked = false;
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
