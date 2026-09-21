import { state } from './state.js';
import { $, clockTime, normalizeId } from './utils.js';
import { latestQueue } from './db.js';

const LS_RECENT = 'attendance.recent.v1';
const MAX_ROWS = 10;

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
  return [s.year, s.program].filter(Boolean).join(' - ') || '—';
}

function fill(tbodyId, rows, emptyText) {
  const body = $(tbodyId);
  if (!body) return;
  body.textContent = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3; td.className = 'empty'; td.textContent = emptyText;
    tr.appendChild(td); body.appendChild(tr);
    return;
  }
  for (const r of rows) {
    const tr = document.createElement('tr');
    const id = document.createElement('td'); id.textContent = r.id;
    const prog = document.createElement('td'); prog.textContent = programLabel(r.id);
    const time = document.createElement('td'); time.textContent = clockTime(new Date(r.ts));
    tr.append(id, prog, time); body.appendChild(tr);
  }
}

export async function renderTables() {
  let pending = [];
  try { pending = await latestQueue(MAX_ROWS); } catch { /* ignore */ }
  fill('tbl-pending', pending, 'Nothing waiting');
  fill('tbl-recent', loadRecent(), 'Nothing synced yet');
  const more = state.pending - pending.length;
  const note = $('pending-more');
  if (note) note.textContent = more > 0 ? `+${more} more waiting` : '';
}