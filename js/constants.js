export const LS_CONFIG   = 'attendance.config.v1';
export const LS_ACTIVE   = 'attendance.activeSession.v1';
export const LS_ROSTER_T = 'attendance.rosterUpdated.v1';
export const LS_THEME    = 'attendance.theme.v1';

export const DB_NAME = 'attendance-db';
export const DB_VER  = 1;

export const SCAN_FPS         = 8;
export const SCAN_COOLDOWN_MS = 2500;
export const FLASH_MS         = 1600;
export const RESULT_DISPLAY_MS = 20000;
export const SYNC_INTERVAL_MS = 15000;
export const SYNC_BATCH_SIZE  = 100;
export const SYNC_PROFILES = {
  safe:     { threshold: 10,  idleMs: 45000,   label: 'Safe',     dailyCap: 3600   },
  standard: { threshold: 15,  idleMs: 90000,   label: 'Standard', dailyCap: 5400   },
  large:    { threshold: 30,  idleMs: 180000,  label: 'Large',    dailyCap: 10800  },
  extreme:  { threshold: 60,  idleMs: 360000,  label: 'Extreme',  dailyCap: 21600  },
  colossal: { threshold: 300, idleMs: 1200000, label: 'Colossal', dailyCap: 108000 },
};