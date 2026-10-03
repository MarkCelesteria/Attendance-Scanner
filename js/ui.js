import { LS_ACTIVE, LS_ROSTER_T, FLASH_MS, RESULT_DISPLAY_MS } from './constants.js';
import { state } from './state.js';
import { $, clockTime, toast } from './utils.js';
import { isSessionOpen, hasWindow, formatWindow } from './scheduler.js';

const RESET_MS = RESULT_DISPLAY_MS;
let idleClockTimer = null;

function switchToSession(name, btn, group) {
  state.activeSession = name;
  localStorage.setItem(LS_ACTIVE, name);
  group.querySelectorAll('.session-btn').forEach((el) => el.setAttribute('aria-checked', String(el === btn)));
}

function askSessionKey() {
  return new Promise((resolve) => {
    const modal = $('session-key-modal');
    const input = $('session-key-input');
    const err = $('session-key-error');
    const confirmBtn = $('btn-session-key-confirm');
    const cancelBtn = $('btn-session-key-cancel');

    err.hidden = true;
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
      if (input.value.trim() !== (state.config.accessKey || '')) {
        err.textContent = 'Incorrect access key.';
        err.hidden = false;
        input.value = '';
        input.focus();
        return;
      }
      cleanup();
      modal.close();
      resolve(true);
    };
    const onCancel = () => { cleanup(); if (modal.open) modal.close(); resolve(false); };
    const onKeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); onConfirm(); } };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKeydown);
    modal.addEventListener('close', onCancel);
  });
}

export function renderSessions() {
  const group = $('session-group');
  group.textContent = '';

  state.config.sessions.forEach((session) => {
    const { name, col } = session;
    const open = isSessionOpen(session);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'session-btn' + (open ? '' : ' is-locked');
    b.dataset.name = name;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(name === state.activeSession));
    const n = document.createElement('span'); n.className = 's-name'; n.textContent = name;
    const c = document.createElement('span'); c.className = 's-col';
    c.textContent = hasWindow(session) ? formatWindow(session) : `Column ${col}`;
    b.append(n, c);
    b.addEventListener('click', async () => {
      if (name === state.activeSession) return;
      if (!isSessionOpen(session)) {
        toast(`"${name}" opens at ${session.start} and closes at ${session.end}.`, 4000);
        return;
      }
      if (state.config.sessionLockEnabled && state.config.accessKey) {
        const ok = await askSessionKey();
        if (!ok) return;
      }
      switchToSession(name, b, group);
    });
    group.appendChild(b);
  });
}

export function autoSwitchSession(name) {
  state.activeSession = name;
  localStorage.setItem(LS_ACTIVE, name);
  const group = $('session-group');
  if (group) group.querySelectorAll('.session-btn').forEach((el) => el.setAttribute('aria-checked', String(el.dataset.name === name)));
}

export function renderScheduleLock(locked, session) {
  state.scheduleLocked = locked;
  const r = $('result');
  const cameraBtn = $('btn-camera');
  const manualInput = $('manual-id');
  const manualBtn = document.querySelector('#manual-form button[type="submit"]');

  cameraBtn.disabled = locked;
  manualInput.disabled = locked;
  if (manualBtn) manualBtn.disabled = locked;

  if (locked) {
    clearTimeout(state.flashTimer);
    r.className = 'result is-locked';
    $('locked-sub').textContent = session
      ? `"${session.name}" opens at ${session.start} and closes at ${session.end}.`
      : 'No session is open right now.';
  } else if (r.classList.contains('is-locked')) {
    resetResultCard();
  }
}

export function renderRosterMeta() {
  const t = localStorage.getItem(LS_ROSTER_T);
  const when = t ? new Date(t).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'never';
  $('roster-meta').textContent = `${state.roster.size} students · updated ${when}`;
}

export function renderSyncPill() {
  const pill = $('sync-pill'), text = $('sync-text');
  if (!pill) return;
  let cls, msg;
  if (!navigator.onLine) {
    cls = 'pill-offline';  msg = `Offline - ${state.pending} pending`;
  } else if (state.authFailed) {
    cls = 'pill-offline';  msg = `Access key changed - ${state.pending} pending`;
  } else if (state.syncing) {
    cls = 'pill-syncing';  msg = `Syncing... (${state.pending} remaining)`;
  } else if (state.pending > 0) {
    if (state.syncFailed) { cls = 'pill-offline'; msg = `Sync failed - ${state.pending} pending`; }
    else { cls = 'pill-waiting'; msg = `Waiting to sync - ${state.pending} pending`; }
  } else {
    cls = 'pill-synced';   msg = 'Cloud Synced';
  }
  pill.className = `pill ${cls}`;
  text.textContent = msg;

  const latencyEl = $('sync-latency');
  if (latencyEl) {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (cls === 'pill-synced' && conn && conn.rtt != null) {
      latencyEl.textContent = ` · ${conn.rtt}ms`;
      latencyEl.hidden = false;
    } else {
      latencyEl.hidden = true;
    }
  }
}

export function resetResultCard() {
  clearInterval(idleClockTimer);
  $('result').className = 'result is-idle';
  $('result-status').textContent = 'Ready for the next scan';
  $('result-name').textContent = '';
  $('result-foot').textContent = '';
  $('btn-result-undo').hidden = true;
  const clockEl = $('idle-clock');
  const tick = () => { clockEl.textContent = clockTime(); };
  tick();
  idleClockTimer = setInterval(tick, 1000);
}

function fadeToIdle() {
  const r = $('result');
  r.style.opacity = '0';
  setTimeout(() => {
    resetResultCard();
    requestAnimationFrame(() => { r.style.opacity = '1'; });
  }, 300);
}

function startResultTimer() {
  const r = $('result');
  state.flashTimer = setTimeout(() => {
    r.classList.remove('is-ok'); r.classList.add('is-last');
    state.flashTimer = setTimeout(fadeToIdle, RESET_MS - FLASH_MS);
  }, FLASH_MS);
}

function confirmUndo(onUndo, onResume, needsKey) {
  const modal = $('undo-confirm-modal');
  const confirmBtn = $('btn-undo-confirm');
  const cancelBtn = $('btn-undo-cancel');
  const keyWrap = $('undo-key-wrap');
  const keyInput = $('undo-key-input');
  const keyErr = $('undo-key-error');

  clearTimeout(state.flashTimer);
  clearTimeout(state.pendingTimer);

  keyWrap.hidden = !needsKey;
  keyErr.hidden = true;
  keyInput.value = '';

  const cleanup = () => {
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
    keyInput.removeEventListener('keydown', onKeydown);
    modal.removeEventListener('close', onCancel);
  };
  const onConfirm = () => {
    if (needsKey && keyInput.value.trim() !== (state.config.accessKey || '')) {
      keyErr.textContent = 'Incorrect access key.';
      keyErr.hidden = false;
      keyInput.value = '';
      keyInput.focus();
      return;
    }
    cleanup(); modal.close(); onUndo();
  };
  const onCancel = () => {
    cleanup();
    if (modal.open) modal.close();
    startResultTimer();
    if (onResume) onResume();
  };
  const onKeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); onConfirm(); } };

  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
  if (needsKey) keyInput.addEventListener('keydown', onKeydown);
  modal.addEventListener('close', onCancel);
  modal.showModal();
  if (needsKey) keyInput.focus();
}

export function showResult(kind, student, extra, onUndo, onResume) {
  const r = $('result');
  clearTimeout(state.flashTimer);
  clearInterval(idleClockTimer);
  r.className = 'result';
  void r.offsetWidth;
  const undoBtn = $('btn-result-undo');

  if (kind === 'ok') {
    r.classList.add('is-ok');
    $('result-status').textContent = `Recorded at ${clockTime()}`;
    $('result-name').textContent = student.name || '(no name)';
    $('result-id').textContent = student.id;
    const cfg = state.config;
    const field = (key, col, value) => { $('fld-' + key).hidden = !col; $('result-' + key).textContent = value || '—'; };
    field('program', cfg.programCol, student.program);
    field('year', cfg.yearCol, student.year);
    field('college', cfg.collegeCol, student.college);
    field('gender', cfg.genderCol, student.gender);
    $('result-foot').textContent = extra || '';
    undoBtn.hidden = false;
    undoBtn.onclick = onUndo ? () => {
      const needsKey = !!(state.config.undoLockEnabled !== false && state.config.accessKey);
      confirmUndo(onUndo, onResume, needsKey);
    } : null;
    startResultTimer();
  } else {
    undoBtn.hidden = true;
    undoBtn.onclick = null;
    r.classList.add('is-error');
    $('result-status').textContent = 'ID not found in roster';
    $('result-name').textContent = extra;
    $('result-foot').textContent = 'Nothing was recorded. Check the ID or refresh the roster.';
    state.flashTimer = setTimeout(fadeToIdle, 3000);
  }
}
