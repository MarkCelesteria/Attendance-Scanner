/** Storage keys and tunables. Change scanner/sync behaviour here. */

export const LS_CONFIG   = 'attendance.config.v1';        // saved setup
export const LS_ACTIVE   = 'attendance.activeSession.v1'; // last selected session
export const LS_ROSTER_T = 'attendance.rosterUpdated.v1'; // ISO time of last roster download

export const DB_NAME = 'attendance-db';
export const DB_VER  = 1;

export const SCAN_FPS         = 8;    // 15–20 is the sweet spot for low-end phones
export const SCAN_COOLDOWN_MS = 2500;  // ignore the SAME code re-detected within this window
export const FLASH_MS         = 1600;  // how long the green flood lasts before the calm state
export const SYNC_INTERVAL_MS = 15000; // periodic retry while online
export const SYNC_BATCH_SIZE  = 100;   // entries per POST
