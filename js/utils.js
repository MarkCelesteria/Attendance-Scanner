let toastTimer;

export const $ = (id) => document.getElementById(id);

export async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('Copy was blocked');
}
export const normalizeId = (v) => String(v == null ? '' : v).trim().toUpperCase();
export const colToIndex = (letters) =>
  letters.toUpperCase().split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

export function indexToCol(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

import { LS_CLOCK_FORMAT } from './constants.js';

export const isHour12 = () => localStorage.getItem(LS_CLOCK_FORMAT) !== '24';

const pad2 = (n) => String(n).padStart(2, '0');
export function clockTime(d = new Date(), hour12 = isHour12()) {
  if (hour12) {
    let h = d.getHours() % 12; if (h === 0) h = 12;
    const ampm = d.getHours() < 12 ? 'AM' : 'PM';
    return `${h}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${ampm}`;
  }
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatHM(hhmm, hour12 = isHour12()) {
  if (!hhmm) return hhmm;
  const [hStr, mStr] = hhmm.split(':');
  if (!hour12) return `${hStr}:${mStr}`;
  let h = Number(hStr) % 12; if (h === 0) h = 12;
  const ampm = Number(hStr) < 12 ? 'AM' : 'PM';
  return `${h}:${mStr} ${ampm}`;
}

export function formatDateTime(d, hour12 = isHour12()) {
  const datePart = d.toLocaleDateString();
  let timePart;
  if (hour12) {
    let h = d.getHours() % 12; if (h === 0) h = 12;
    const ampm = d.getHours() < 12 ? 'AM' : 'PM';
    timePart = `${h}:${pad2(d.getMinutes())} ${ampm}`;
  } else {
    timePart = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  return `${datePart} ${timePart}`;
}

export function toast(msg, ms = 3500) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
