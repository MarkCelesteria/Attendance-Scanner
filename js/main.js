/** Entry point: wire events, restore saved state, choose the first view. */
import { SYNC_INTERVAL_MS } from './constants.js';
import { state } from './state.js';
import { $ } from './utils.js';
import { loadConfig } from './config.js';
import { loadRoster } from './db.js';
import { renderSyncPill } from './ui.js';
import { syncNow } from './sync.js';
import { startScanner, stopScanner } from './scanner.js';
import { onCameraCode, onManualSubmit } from './scan.js';
import { showDashboard } from './dashboard.js';
import { showSetup, renderMappingPreview, onSetupSubmit, onReset, onRefreshRoster } from './setup.js';

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
  }
}

function bindEvents() {
  $('setup-form').addEventListener('submit', onSetupSubmit);
  ['cfg-sessions', 'cfg-start'].forEach((id) => $(id).addEventListener('input', renderMappingPreview));
  $('btn-setup-cancel').addEventListener('click', showDashboard);
  $('btn-reset').addEventListener('click', onReset);

  $('btn-settings').addEventListener('click', () => showSetup(true));
  $('btn-refresh').addEventListener('click', onRefreshRoster);
  $('btn-camera').addEventListener('click', () => (state.scanning ? stopScanner() : startScanner(onCameraCode)));
  $('manual-form').addEventListener('submit', onManualSubmit);

  // Connectivity: sync as soon as we're back online; update the pill immediately when we drop.
  window.addEventListener('online',  () => { renderSyncPill(); syncNow(); });
  window.addEventListener('offline', renderSyncPill);
  setInterval(syncNow, SYNC_INTERVAL_MS);

  // Free the camera when the tab is hidden; resume when it returns.
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      state.resumeScanOnShow = state.scanning;
      await stopScanner();
    } else {
      if (state.resumeScanOnShow && !$('view-dashboard').hidden) startScanner(onCameraCode);
      state.resumeScanOnShow = false;
      syncNow();
    }
  });
}

async function init() {
  registerServiceWorker();
  bindEvents();
  state.config = loadConfig();
  try { state.roster = await loadRoster(); } catch (e) { console.warn('Roster load failed', e); }

  if (state.config) showDashboard();
  else showSetup(false);
}

init();
