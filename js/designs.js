import { LS_DESIGN } from './constants.js';
import { $, toast } from './utils.js';
import { refreshThemeThumb } from './theme.js';

export const DESIGNS = [
  { id: 'classic', label: 'Classic', dir: 'css/',        color: { light: '#14213D', dark: '#14213D' } },
  { id: 'ledger',  label: 'Ledger',  dir: 'css/ledger/', color: { light: '#FFFFFF', dark: '#0E0E0F' } },
];

const FILES = ['base', 'components', 'setup', 'dashboard'];
const DEFAULT_ID = 'classic';
const root = document.documentElement;
let swapToken = 0;

const find = (id) => DESIGNS.find((d) => d.id === id);

export function loadDesignPref() {
  const v = localStorage.getItem(LS_DESIGN);
  return find(v) ? v : DEFAULT_ID;
}

function syncMeta() {
  const d = find(root.getAttribute('data-design')) || find(DEFAULT_ID);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', root.getAttribute('data-theme') === 'dark' ? d.color.dark : d.color.light);
}

function loadSheet(href, file) {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.designCss = file;
    link.onload = () => resolve(link);
    link.onerror = () => { link.remove(); reject(new Error('Failed: ' + href)); };
    const all = document.querySelectorAll('link[data-design-css]');
    const last = all[all.length - 1];
    if (last) last.after(link); else document.head.appendChild(link);
  });
}

/** @returns {Promise<boolean|null>} true = applied, false = failed, null = superseded by a newer switch */
async function applyDesign(id) {
  if (root.getAttribute('data-design') === id) return true;
  const d = find(id);
  if (!d) return false;
  const token = ++swapToken;
  let fresh;
  try {
    fresh = await Promise.all(FILES.map((f) => loadSheet(d.dir + f + '.css', f)));
  } catch (e) {
    if (token !== swapToken) return null;
    toast('Could not load that design. Check your connection and try again.', 5000);
    return false;
  }
  if (token !== swapToken) return null;
  document.querySelectorAll('link[data-design-css]').forEach((l) => { if (!fresh.includes(l)) l.remove(); });
  root.setAttribute('data-design', id);
  syncMeta();
  refreshThemeThumb();
  return true;
}

async function setDesign(id, select) {
  const ok = await applyDesign(id);
  if (ok === null) return;
  if (ok) localStorage.setItem(LS_DESIGN, id);
  else select.value = root.getAttribute('data-design') || DEFAULT_ID;
}

export function initDesign() {
  const pref = loadDesignPref();
  const select = $('cfg-design');
  DESIGNS.forEach((d) => select.add(new Option(d.label, d.id)));
  select.value = pref;

  if (root.getAttribute('data-design') !== pref) applyDesign(pref);
  else syncMeta();

  new MutationObserver(syncMeta).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  select.addEventListener('change', () => setDesign(select.value, select));
}