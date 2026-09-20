/**
 * IndexedDB layer.
 *   roster : keyPath "key" (normalised ID)  — the downloaded student list
 *   queue  : keyPath "qid" (auto-increment) — scans waiting to be uploaded
 * Scan-time lookups use the in-memory Map (state.roster) hydrated from here,
 * which keeps them far below 5 ms even with 5,000+ students.
 */
import { DB_NAME, DB_VER } from './constants.js';

let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('roster')) db.createObjectStore('roster', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('queue'))  db.createObjectStore('queue',  { keyPath: 'qid', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }
  return dbPromise;
}

const reqToPromise = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

/** Replace the whole roster in ONE transaction (all-or-nothing). */
export async function saveRoster(list) {
  const db = await openDB();
  const t = db.transaction('roster', 'readwrite');
  const store = t.objectStore('roster');
  store.clear();
  for (const s of list) store.put(s);
  await txDone(t);
}

/** @returns {Promise<Map>} normalised ID -> student */
export async function loadRoster() {
  const db = await openDB();
  const all = await reqToPromise(db.transaction('roster').objectStore('roster').getAll());
  return new Map(all.map((s) => [s.key, s]));
}

export async function enqueueScan(entry) {
  const db = await openDB();
  const t = db.transaction('queue', 'readwrite');
  t.objectStore('queue').add(entry);
  await txDone(t);
}

export async function queueCount() {
  const db = await openDB();
  return reqToPromise(db.transaction('queue').objectStore('queue').count());
}

/** Oldest-first slice of the queue (IDB iterates by ascending key). */
export async function peekQueue(limit) {
  const db = await openDB();
  return reqToPromise(db.transaction('queue').objectStore('queue').getAll(null, limit));
}

export async function removeFromQueue(qids) {
  if (!qids.length) return;
  const db = await openDB();
  const t = db.transaction('queue', 'readwrite');
  const store = t.objectStore('queue');
  for (const q of qids) store.delete(q);
  await txDone(t);
}

export async function clearAllStores() {
  const db = await openDB();
  const t = db.transaction(['roster', 'queue'], 'readwrite');
  t.objectStore('roster').clear();
  t.objectStore('queue').clear();
  await txDone(t);
}
