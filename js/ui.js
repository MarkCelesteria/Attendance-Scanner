/** Pure rendering: session buttons, sync pill, roster line, result card. */
import { LS_ACTIVE, LS_ROSTER_T, FLASH_MS } from './constants.js';
import { state } from './state.js';
import { $, clockTime } from './utils.js';

export function renderSessions() {
  const group = $('session-group');
  group.textContent = '';

  state.config.sessions.forEach(({ name, col }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'session-btn';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(name === state.activeSession));
    const n = document.createElement('span'); n.className = 's-name'; n.textContent = name;
    const c = document.createElement('span'); c.className = 's-col'; c.textContent = `Column ${col}`;
    b.append(n, c);
    b.addEventListener('click', () => {
      state.activeSession = name;
      localStorage.setItem(LS_ACTIVE, name);
      group.querySelectorAll('.session-btn').forEach((el) => el.setAttribute('aria-checked', String(el === b)));
    });
    group.appendChild(b);
  });
}

export function renderRosterMeta() {
  const t = localStorage.getItem(LS_ROSTER_T);
  const when = t ? new Date(t).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'never';
  $('roster-meta').textContent = `${state.roster.size} students · updated ${when}`;
}

/** "Cloud Synced" / "Syncing... (X remaining)" / "Offline - X pending" */
export function renderSyncPill() {
  const pill = $('sync-pill'), text = $('sync-text');
  if (!pill) return;
  let cls, msg;
  if (!navigator.onLine) {
    cls = 'pill-offline';  msg = `Offline - ${state.pending} pending`;
  } else if (state.syncing) {
    cls = 'pill-syncing';  msg = `Syncing... (${state.pending} remaining)`;
  } else if (state.pending > 0) {
    cls = state.syncFailed ? 'pill-offline' : 'pill-syncing';
    msg = state.syncFailed ? `Sync failed - ${state.pending} pending` : `Syncing... (${state.pending} remaining)`;
  } else {
    cls = 'pill-synced';   msg = 'Cloud Synced';
  }
  pill.className = `pill ${cls}`;
  text.textContent = msg;
}

export function resetResultCard() {
  $('result').className = 'result is-idle';
  $('result-status').textContent = 'Ready for the next scan';
  $('result-name').textContent = '';
  $('result-foot').textContent = '';
}

/** kind: 'ok' | 'error'. Green flood for FLASH_MS, then a calm "last scanned" look. */
export function showResult(kind, student, extra) {
  const r = $('result');
  clearTimeout(state.flashTimer);
  r.className = 'result';
  void r.offsetWidth;   // re-trigger the CSS animation

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
    state.flashTimer = setTimeout(() => { r.classList.remove('is-ok'); r.classList.add('is-last'); }, FLASH_MS);
  } else {
    r.classList.add('is-error');
    $('result-status').textContent = 'ID not found in roster';
    $('result-name').textContent = extra;   // the code that was read
    $('result-foot').textContent = 'Nothing was recorded. Check the ID or refresh the roster.';
    state.flashTimer = setTimeout(resetResultCard, 3000);
  }
}
