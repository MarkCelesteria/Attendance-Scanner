import { LS_THEME, LS_CLOCK_FORMAT } from './constants.js';
import { $ } from './utils.js';
import { state } from './state.js';
import { renderRosterMeta } from './ui.js';
import { scheduleTick } from './dashboard.js';

const VALID = ['light', 'dark', 'device'];
const media = window.matchMedia('(prefers-color-scheme: dark)');

export function loadThemePref() {
  const v = localStorage.getItem(LS_THEME);
  return VALID.includes(v) ? v : 'device';
}

function resolve(pref) {
  return pref === 'device' ? (media.matches ? 'dark' : 'light') : pref;
}

export function applyTheme(pref) {
  document.documentElement.setAttribute('data-theme', resolve(pref));
}

export function setTheme(pref) {
  localStorage.setItem(LS_THEME, pref);
  applyTheme(pref);
}

function positionThumb(btn) {
  const thumb = document.querySelector('.theme-seg-thumb');
  if (!thumb || !btn) return;
  thumb.style.width = `${btn.offsetWidth}px`;
  thumb.style.transform = `translateX(${btn.offsetLeft - 2}px)`;
}

let getActiveThemeBtn = () => null;

export function refreshThemeThumb() {
  positionThumb(getActiveThemeBtn());
}

export function initTheme() {
  const pref = loadThemePref();
  applyTheme(pref);

  media.addEventListener('change', () => {
    if (loadThemePref() === 'device') applyTheme('device');
  });

  const buttons = [...document.querySelectorAll('.theme-opt')];
  getActiveThemeBtn = () => buttons.find((b) => b.dataset.value === loadThemePref());

  buttons.forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.value === pref));
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      setTheme(b.dataset.value);
      positionThumb(b);
    });
  });

  window.addEventListener('resize', refreshThemeThumb);

  const clockToggle = $('cfg-clock-24');
  clockToggle.checked = localStorage.getItem(LS_CLOCK_FORMAT) === '24';
  clockToggle.addEventListener('change', (e) => {
    localStorage.setItem(LS_CLOCK_FORMAT, e.target.checked ? '24' : '12');
    if (state.config) { scheduleTick(); renderRosterMeta(); }
  });
}