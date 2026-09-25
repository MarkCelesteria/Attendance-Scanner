import { handleId } from './scan.js';

const MAX_INTERVAL_MS = 50;
const MIN_LENGTH = 3;

let buffer = '';
let lastTime = 0;

function isEditable(el) {
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

function onKeydown(e) {
  if (isEditable(document.activeElement)) return;

  const now = Date.now();
  if (now - lastTime > MAX_INTERVAL_MS) buffer = '';
  lastTime = now;

  if (e.key === 'Enter' || e.key === 'Tab') {
    if (buffer.length >= MIN_LENGTH) {
      e.preventDefault();
      handleId(buffer, 'hardware');
    }
    buffer = '';
    return;
  }

  if (e.key.length === 1) buffer += e.key;
}

export function initHardwareScanner() {
  document.addEventListener('keydown', onKeydown);
}