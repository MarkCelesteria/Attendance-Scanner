/** First-time / edit setup screen. */
import { state } from './state.js';
import { $, colToIndex, indexToCol, toast } from './utils.js';
import { readForm, saveConfig, clearLocalSettings } from './config.js';
import { downloadRoster } from './roster.js';
import { clearAllStores } from './db.js';
import { stopScanner } from './scanner.js';
import { renderRosterMeta } from './ui.js';
import { refreshPending } from './sync.js';
import { clearRecent } from './history.js';
import { showDashboard } from './dashboard.js';

/** Live "Timestamps use columns E–H" preview under the column inputs. */
export function renderMappingPreview() {
  const n = $('cfg-sessions').value.split(',').map((s) => s.trim()).filter(Boolean).length;
  const start = $('cfg-start').value.trim();
  const el = $('mapping-preview');
  if (!/^[A-Za-z]{1,3}$/.test(start) || !n) { el.textContent = ''; return; }
  const a = colToIndex(start);
  el.textContent = n === 1
    ? `Timestamps will be written to column ${start.toUpperCase()}.`
    : `${n} sessions will use columns ${start.toUpperCase()}–${indexToCol(a + n - 1)}, in the order listed.`;
}

export function showSetup(isEditing) {
  stopScanner();
  $('view-dashboard').hidden = true;
  $('view-setup').hidden = false;
  $('btn-setup-cancel').hidden = !isEditing;
  $('btn-reset').hidden = !isEditing;
  $('setup-error').hidden = true;

  const c = state.config;
  if (c) {
    $('cfg-url').value = c.scriptUrl;       $('cfg-key').value = c.accessKey || '';
    $('cfg-sessions').value = c.sessions.join(', ');
    $('cfg-id').value = c.idCol;            $('cfg-name').value = c.nameCol;
    $('cfg-program').value = c.programCol;  $('cfg-year').value = c.yearCol;
    $('cfg-start').value = c.startCol;
    $('cfg-sheet').value = c.sheetName || ''; $('cfg-row').value = c.firstRow;
    $('cfg-policy').value = c.timePolicy || 'earliest';
  }
  renderMappingPreview();
}

export async function onSetupSubmit(ev) {
  ev.preventDefault();
  const errEl = $('setup-error');
  errEl.hidden = true;

  let cfg;
  try { cfg = readForm(); } catch (e) { errEl.textContent = e.message; errEl.hidden = false; return; }

  const btn = $('btn-setup-save');
  btn.disabled = true;
  btn.textContent = 'Downloading roster…';
  try {
    await downloadRoster(cfg);   // only save the config if the sheet is reachable
    state.config = cfg;
    saveConfig(cfg);
    showDashboard();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save and download roster';
  }
}

export async function onReset() {
  await refreshPending();
  const warn = state.pending
    ? `${state.pending} scan(s) have not been uploaded yet and will be lost. Reset anyway?`
    : 'Remove the saved setup and roster from this device?';
  if (!confirm(warn)) return;
  clearLocalSettings();
  await clearAllStores();
  clearRecent();
  state.config = null; state.roster = new Map(); state.pending = 0;
  $('setup-form').reset();
  showSetup(false);
}

export async function onRefreshRoster() {
  if (!navigator.onLine) { toast('You are offline. Roster refresh needs internet.'); return; }
  const btn = $('btn-refresh');
  btn.classList.add('is-spinning'); btn.disabled = true;
  try { await downloadRoster(state.config); renderRosterMeta(); toast(`Roster updated: ${state.roster.size} students`); }
  catch (e) { toast(e.message, 5000); }
  finally { btn.classList.remove('is-spinning'); btn.disabled = false; }
}
