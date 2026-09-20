/** Single shared mutable state object for the whole app. */
export const state = {
  config: null,          // saved setup object (see config.js readForm)
  roster: new Map(),     // normalised ID -> {key,id,name,program,year}; hydrated from IndexedDB
  activeSession: null,   // session name currently selected
  scanner: null,         // Html5Qrcode instance
  scanning: false,
  resumeScanOnShow: false,
  syncing: false,
  syncFailed: false,
  pending: 0,            // number of queued, unsynced scans
  lastKey: '',           // last accepted ID (for camera cooldown)
  lastTime: 0,
  flashTimer: null,
  wakeLock: null,
  audioCtx: null,
};
