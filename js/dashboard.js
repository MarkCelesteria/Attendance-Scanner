import { LS_ACTIVE } from './constants.js';
import { state } from './state.js';
import { $ } from './utils.js';
import { renderSessions, renderRosterMeta, resetResultCard, renderScheduleLock, autoSwitchSession } from './ui.js';
import { refreshPending, syncNow } from './sync.js';
import { renderAdminButton } from './admin.js';
import { startScheduler, activeWindowedSession, isSessionOpen } from './scheduler.js';
import { stopScanner } from './scanner.js';

export function scheduleTick() {
  const sessions = state.config.sessions;
  if (!state.adminUnlocked) {
    const openNow = activeWindowedSession(sessions);
    if (openNow && openNow.name !== state.activeSession) autoSwitchSession(openNow.name);
  }

  const current = sessions.find((s) => s.name === state.activeSession);
  const locked = !state.adminUnlocked && !!(current && !isSessionOpen(current));
  if (locked && state.scanning) stopScanner();

  renderSessions();
  renderScheduleLock(locked, current);
}

export function showDashboard() {
  $('view-setup').hidden = true;
  $('view-dashboard').hidden = false;

  const stored = localStorage.getItem(LS_ACTIVE);
  const names = state.config.sessions.map((s) => s.name);
  state.activeSession = names.includes(stored) ? stored : names[0];

  renderSessions();
  renderRosterMeta();
  renderAdminButton();
  resetResultCard();
  refreshPending().then(syncNow);
  startScheduler(scheduleTick);
}