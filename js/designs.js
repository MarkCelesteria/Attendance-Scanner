import { LS_DESIGN } from './constants.js';
import { $, toast } from './utils.js';
import { refreshThemeThumb } from './theme.js';
import { onDisplayPrefs } from './display.js';
import { initDesignPicker } from './designpicker.js';

export const DESIGNS = [
  { id: 'classic',   label: 'Classic',   group: 'basic',   dir: 'css/',           color: { light: '#14213D', dark: '#14213D' } },
  { id: 'ledger',    label: 'Ledger',    group: 'basic',   dir: 'css/ledger/',    color: { light: '#FFFFFF', dark: '#0E0E0F' } },
  { id: 'mono',      label: 'Mono',      group: 'basic',   dir: 'css/mono/',      color: { light: '#F7F6F2', dark: '#0D0D0D' } },
  { id: 'paper',     label: 'Paper',     group: 'basic',   dir: 'css/paper/',     color: { light: '#F3EEE3', dark: '#16130F' } },
  { id: 'clay',      label: 'Clay',      group: 'basic',   dir: 'css/clay/',      color: { light: '#F2E9DC', dark: '#1B1612' } },
  { id: 'tech',      label: 'Tech',      group: 'tech',    dir: 'css/tech/',      color: { light: '#E9EFF6', dark: '#060A11' } },
  { id: 'lab',       label: 'Lab',       group: 'tech',    dir: 'css/lab/',       color: { light: '#E4EEF0', dark: '#0C1820' } },
  { id: 'nature',    label: 'Nature',    group: 'nature',  dir: 'css/nature/',    color: { light: '#EAF3EA', dark: '#08120D' } },
  { id: 'ocean',     label: 'Ocean',     group: 'nature',  dir: 'css/ocean/',     color: { light: '#03141E', dark: '#03141E' } },
  { id: 'storm',     label: 'Storm',     group: 'nature',  dir: 'css/storm/',     color: { light: '#0C1218', dark: '#0C1218' } },
  { id: 'city',      label: 'City',      group: 'nature',  dir: 'css/city/',      color: { light: '#86CCFF', dark: '#040920' } },
  { id: 'fantasy',   label: 'Fantasy',   group: 'fun',     dir: 'css/fantasy/',   color: { light: '#6FB2EE', dark: '#0A0E2E' } },
  { id: 'space',     label: 'Space',     group: 'fun',     dir: 'css/space/',     color: { light: '#05060F', dark: '#05060F' } },
  { id: 'retro',     label: 'Retro',     group: 'fun',     dir: 'css/retro/',     color: { light: '#F1EDFF', dark: '#0F0A24' } },
  { id: 'party',     label: 'Party',     group: 'fun',     dir: 'css/party/',     color: { light: '#FFF1E2', dark: '#FFF1E2' } },
  { id: 'cny',       label: 'New Year',  group: 'holiday', dir: 'css/cny/',       color: { light: '#C8102E', dark: '#14030A' } },
  { id: 'valentine', label: 'Valentine', group: 'holiday', dir: 'css/valentine/', color: { light: '#1A0611', dark: '#1A0611' } },
  { id: 'halloween', label: 'Halloween', group: 'holiday', dir: 'css/halloween/', color: { light: '#0B0420', dark: '#0B0420' } },
  { id: 'christmas', label: 'Christmas', group: 'holiday', dir: 'css/christmas/', color: { light: '#06101F', dark: '#06101F' } },
];

const GROUPS = [
  { id: 'basic',  label: 'Clean' },
  { id: 'tech',   label: 'Tech & Science' },
  { id: 'nature', label: 'Nature & Places' },
  { id: 'fun',    label: 'Fantasy & Fun' },
  { id: 'holiday',label: 'Holidays & Events' },
];

const FILES = ['base', 'components', 'setup', 'dashboard'];
const DEFAULT_ID = 'classic';
const root = document.documentElement;
let swapToken = 0;
let picker = null;

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
  if (picker) picker.sync();
}

function enforceLock(cfg) {
  const lockedId = cfg && cfg.locked && cfg.lockDesign && find(cfg.design) ? cfg.design : null;
  const select = $('cfg-design');
  const note = $('design-lock-note');
  select.disabled = !!lockedId;
  if (note) note.hidden = !lockedId;
  const target = lockedId || loadDesignPref();
  select.value = target;
  if (picker) picker.sync();
  applyDesign(target);
}

export function initDesign() {
  const select = $('cfg-design');
  GROUPS.forEach((g) => {
    const list = DESIGNS.filter((d) => (d.group || 'basic') === g.id);
    if (!list.length) return;
    const og = document.createElement('optgroup');
    og.label = g.label;
    list.forEach((d) => og.appendChild(new Option(d.label, d.id)));
    select.appendChild(og);
  });

  const current = root.getAttribute('data-design');
  if (find(current)) { select.value = current; syncMeta(); }
  else { select.value = loadDesignPref(); applyDesign(select.value); }

  picker = initDesignPicker(select, DESIGNS);

  onDisplayPrefs(enforceLock);
  new MutationObserver(syncMeta).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  select.addEventListener('change', () => setDesign(select.value, select));
}