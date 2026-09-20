/** Switching to the scanner dashboard. */
import { LS_ACTIVE } from './constants.js';
import { state } from './state.js';
import { $ } from './utils.js';
import { renderSessions, renderRosterMeta, resetResultCard } from './ui.js';
import { refreshPending, syncNow } from './sync.js';

export function showDashboard() {
  $('view-setup').hidden = true;
  $('view-dashboard').hidden = false;

  const stored = localStorage.getItem(LS_ACTIVE);
  state.activeSession = state.config.sessions.includes(stored) ? stored : state.config.sessions[0];

  renderSessions();
  renderRosterMeta();
  resetResultCard();
  refreshPending().then(syncNow);
}
