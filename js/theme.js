import { LS_THEME } from './constants.js';

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

export function initTheme() {
  const pref = loadThemePref();
  applyTheme(pref);

  media.addEventListener('change', () => {
    if (loadThemePref() === 'device') applyTheme('device');
  });

  const buttons = [...document.querySelectorAll('.theme-opt')];
  buttons.forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.value === pref));
    b.addEventListener('click', () => {
      buttons.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      setTheme(b.dataset.value);
    });
  });
}