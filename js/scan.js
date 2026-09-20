/** What happens when an ID arrives (camera or keyboard). Must stay fast. */
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
  // The camera fires ~15x/sec while a code is in view: swallow repeats of the same code.
  if (source === 'camera' && key === state.lastKey && now - state.lastTime < SCAN_COOLDOWN_MS) {
    state.lastTime = now;   // extend the window while the code stays in view
    return;
  }
  state.lastKey = key; state.lastTime = now;

  const t0 = performance.now();
  const student = state.roster.get(key);            // O(1) Map lookup
  const ms = performance.now() - t0;

  if (!student) {
    showResult('error', null, String(raw).trim());
    beep('error');
    return;
  }

  showResult('ok', student, `Lookup ${ms.toFixed(2)} ms`);
  beep('ok');

  // Queue for upload; the UI has already updated so the operator can scan the next person.
  enqueueScan({ id: student.id, session: state.activeSession, ts: now })
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
