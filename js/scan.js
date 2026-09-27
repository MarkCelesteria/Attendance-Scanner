import { SCAN_COOLDOWN_MS, RESULT_DISPLAY_MS } from './constants.js';
import { state } from './state.js';
import { $, normalizeId, toast } from './utils.js';
import { enqueueScan } from './db.js';
import { beep } from './audio.js';
import { showResult, resetResultCard } from './ui.js';
import { refreshPending, syncNow } from './sync.js';

export function commitPendingScan() {
  if (!state.pendingScan) return;
  clearTimeout(state.pendingTimer);
  const entry = state.pendingScan;
  state.pendingScan = null;
  enqueueScan(entry)
    .then(refreshPending)
    .then(syncNow)
    .catch(() => toast('Could not save this scan on the device. Storage may be full.', 6000));
}

function undoPendingScan() {
  if (!state.pendingScan) return;
  clearTimeout(state.pendingTimer);
  state.pendingScan = null;
  clearTimeout(state.flashTimer);
  resetResultCard();
  state.lastKey = ''; state.lastTime = 0;
}

function resumePendingScan() {
  if (!state.pendingScan) return;
  state.pendingTimer = setTimeout(commitPendingScan, RESULT_DISPLAY_MS);
}

export function handleId(raw, source) {
  const key = normalizeId(raw);
  if (!key) return;

  const now = Date.now();
  if (source === 'camera' && key === state.lastKey && now - state.lastTime < SCAN_COOLDOWN_MS) {
    state.lastTime = now;
    return;
  }
  state.lastKey = key; state.lastTime = now;

  commitPendingScan();

  const student = state.roster.get(key);

  if (!student) {
    showResult('error', null, String(raw).trim());
    beep('error');
    return;
  }

  showResult('ok', student, '', undoPendingScan, resumePendingScan);
  beep('ok');

  state.pendingScan = { id: student.id, session: state.activeSession, ts: now, sheet: student.sheet || '' };
  state.pendingTimer = setTimeout(commitPendingScan, RESULT_DISPLAY_MS);
}

export const onCameraCode = (text) => handleId(text, 'camera');

export function onManualSubmit(ev) {
  ev.preventDefault();
  const input = $('manual-id');
  handleId(input.value, 'manual');
  input.value = '';
  input.focus();
}
