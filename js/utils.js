/** Small, dependency-free helpers. */

export const $ = (id) => document.getElementById(id);

/** IDs are compared trimmed + upper-cased so "s001 " matches "S001". */
export const normalizeId = (v) => String(v == null ? '' : v).trim().toUpperCase();

/** "A" -> 1, "Z" -> 26, "AA" -> 27 */
export const colToIndex = (letters) =>
  letters.toUpperCase().split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

/** 1 -> "A", 27 -> "AA" */
export function indexToCol(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const pad2 = (n) => String(n).padStart(2, '0');
export const clockTime = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

let toastTimer;
export function toast(msg, ms = 3500) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
