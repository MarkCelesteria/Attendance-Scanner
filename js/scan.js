import { SCAN_COOLDOWN_MS } from './constants.js';
import { state } from './state.js';
import { $, normalizeId, toast } from './utils.js';
import { enqueueScan } from './db.js';
import { beep } from './audio.js';
import { showResult } from './ui.js';
import { refreshPending, syncNow } from './sync.js';

export function handleId(raw, source) {
  const key = normalizeId(raw);
  if (!key) return;

  const now = Date.now();
  if (source === 'camera' && key === state.lastKey && now - state.lastTime < SCAN_COOLDOWN_MS) {
    state.lastTime = now;
    return;
  }
  state.lastKey = key; state.lastTime = now;

  const student = state.roster.get(key);

  if (!student) {
    showResult('error', null, String(raw).trim());
    beep('error');
    return;
  }

  showResult('ok', student, '');
  beep('ok');

  enqueueScan({ id: student.id, session: state.activeSession, ts: now, sheet: student.sheet || '' })
    .then(refreshPending)
    .then(syncNow)
    .catch(() => toast('Could not save this scan on the device. Storage may be full.', 6000));
}

export const onCameraCode = (text) => handleId(text, 'camera');

export function onManualSubmit(ev) {
  ev.preventDefault();
  const input = $('manual-id');
  handleId(input.value, 'manual');
  input.value = '';
  input.focus();
}
