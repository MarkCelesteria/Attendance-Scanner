import { state } from './state.js';
import { $, clockTime, normalizeId } from './utils.js';
import { latestQueue } from './db.js';

const LS_RECENT = 'attendance.recent.v1';
const MAX_ROWS = 5;

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(LS_RECENT)) || []; } catch { return []; }
}

export function addRecent(entries) {
  if (!entries.length) return;
  const added = entries.map((e) => ({ id: e.id, ts: e.ts }));
  const merged = [...added, ...loadRecent()].sort((a, b) => b.ts - a.ts).slice(0, MAX_ROWS);
  try { localStorage.setItem(LS_RECENT, JSON.stringify(merged)); } catch { /* storage full: skip */ }
}

export function clearRecent() {
  localStorage.removeItem(LS_RECENT);
}

function programLabel(id) {
  const s = state.roster.get(normalizeId(id));
  if (!s) return '—';
  return [s.year, s.program, s.college].filter(Boolean).join(' - ') || '—';
}
function fill(listId, rows, emptyText) {
  const list = $(listId);
  if (!list) return;
  list.textContent = '';
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'tbl-empty';
    empty.textContent = emptyText;
    list.appendChild(empty);
    return;
  }
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'tbl-row';
    const main = document.createElement('span');
    main.className = 'tbl-row-main';
    main.textContent = `${r.id} · ${programLabel(r.id)}`;
    const time = document.createElement('span');
    time.className = 'tbl-row-time';
    time.textContent = clockTime(new Date(r.ts));
    row.append(main, time);
    list.appendChild(row);
  }
}

export async function renderTables() {
  let pending = [];
  try { pending = await latestQueue(MAX_ROWS); } catch { /* ignore */ }
  fill('tbl-pending', pending, 'Nothing waiting');
  fill('tbl-recent', loadRecent(), 'Nothing synced yet');
  const badge = $('pending-badge');
  if (badge) badge.textContent = String(state.pending);
  const more = state.pending - pending.length;
  const note = $('pending-more');
  if (note) note.textContent = more > 0 ? `+${more} more waiting` : '';
}