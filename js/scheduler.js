const CHECK_MS = 15000;
let timer = null;

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function hasWindow(session) {
  return !!(session.start && session.end);
}

export function windowState(session, now = new Date()) {
  if (!hasWindow(session)) return 'none';
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(session.start), end = toMinutes(session.end);
  if (cur < start) return 'before';
  if (cur >= end) return 'after';
  return 'active';
}

export function isSessionOpen(session, now = new Date()) {
  const s = windowState(session, now);
  return s === 'none' || s === 'active';
}

export function activeWindowedSession(sessions, now = new Date()) {
  return sessions.find((s) => hasWindow(s) && windowState(s, now) === 'active') || null;
}

import { formatHM } from './utils.js';

export function formatWindow(session) {
  return `${formatHM(session.start)}\u2013${formatHM(session.end)}`;
}

export function startScheduler(tick) {
  stopScheduler();
  tick();
  timer = setInterval(tick, CHECK_MS);
}

export function stopScheduler() {
  clearInterval(timer);
  timer = null;
}