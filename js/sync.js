/** Background sync: upload queued scans to Apps Script (doPost) in batches. */
import { SYNC_BATCH_SIZE } from './constants.js';
import { state } from './state.js';
import { toast } from './utils.js';
import { queueCount, peekQueue, removeFromQueue } from './db.js';
import { renderSyncPill } from './ui.js';
import { addRecent, renderTables } from './history.js';

export async function refreshPending() {
  try { state.pending = await queueCount(); } catch { /* ignore */ }
  renderSyncPill();
  renderTables();
}

/**
 * Safe to call repeatedly: state.syncing prevents overlapping runs.
 * An entry leaves the queue only after the script acknowledges it.
 */
export async function syncNow() {
  if (state.syncing || !navigator.onLine || !state.config) return;
  state.syncing = true; state.syncFailed = false;
  let skipped = 0;

  try {
    let batch;
    while ((batch = await peekQueue(SYNC_BATCH_SIZE)).length) {
      renderSyncPill();
      const results = await postBatch(batch);
      const acked = results.map((r) => r.qid);
      if (!acked.length) throw new Error('No entries acknowledged');   // avoid a hot loop
      skipped += results.filter((r) => r.status === 'not_found' || r.status === 'bad_session').length;
      const done = new Set(results.filter((r) => r.status === 'written' || r.status === 'duplicate').map((r) => r.qid));
      addRecent(batch.filter((e) => done.has(e.qid)));
      await removeFromQueue(acked);
      await refreshPending();
    }
  } catch (e) {
    state.syncFailed = true;
    console.warn('Sync failed:', e);
  } finally {
    state.syncing = false;
    await refreshPending();
  }
  if (skipped) toast(`${skipped} scan(s) were skipped: ID or session not found on the sheet.`, 6000);
}

async function postBatch(batch) {
  const c = state.config;
  const payload = {
    key: c.accessKey || '',
    // The script is stateless: it learns the layout from every request.
    config: { sheet: c.sheetName || '', idCol: c.idCol, startCol: c.startCol, sessions: c.sessions, firstRow: c.firstRow, timePolicy: c.timePolicy || 'earliest' },
    entries: batch.map((e) => ({ qid: e.qid, id: e.id, session: e.session, ts: e.ts })),
  };
  // "text/plain" keeps this a CORS "simple request" (no preflight, which Apps Script can't answer).
  const res = await fetch(c.scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  const data = JSON.parse(await res.text());
  if (!data.ok) throw new Error(data.error || 'Script error');
  return data.results || [];
}
