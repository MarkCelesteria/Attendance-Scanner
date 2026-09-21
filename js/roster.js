/** Roster download (Apps Script doGet) into IndexedDB + memory. */
import { LS_ROSTER_T } from './constants.js';
import { state } from './state.js';
import { normalizeId } from './utils.js';
import { saveRoster, loadRoster } from './db.js';

/** Fetch students, replace the local roster, refresh the in-memory Map. */
export async function downloadRoster(cfg) {
  const q = new URLSearchParams({
    idCol: cfg.idCol, nameCol: cfg.nameCol, programCol: cfg.programCol || '', yearCol: cfg.yearCol || '',
    collegeCol: cfg.collegeCol || '', genderCol: cfg.genderCol || '',
    firstRow: String(cfg.firstRow), sheet: cfg.sheetName || '', key: cfg.accessKey || '',
  });
  const url = cfg.scriptUrl + (cfg.scriptUrl.includes('?') ? '&' : '?') + q.toString();

  let res;
  try { res = await fetch(url, { method: 'GET', redirect: 'follow' }); }
  catch { throw new Error('Could not reach the script. Check your internet connection and the URL.'); }

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('The script did not return data. Deploy it as a Web App with access set to "Anyone".'); }
  if (!data.ok) {
    if (/Invalid column letter: ""/.test(data.error || '')) {
      throw new Error('Your Apps Script is out of date. Paste the newest Code.gs, then Deploy → Manage deployments → Edit → New version.');
    }
    throw new Error(data.error || 'The script reported an error.');
  }

  const list = data.students.map((s) => ({
    key: normalizeId(s.id), id: String(s.id).trim(),
    name: String(s.name || '').trim(), program: String(s.program || '').trim(), year: String(s.year || '').trim(),
    college: String(s.college || '').trim(), gender: String(s.gender || '').trim(),
  })).filter((s) => s.key);

  await saveRoster(list);
  state.roster = await loadRoster();
  localStorage.setItem(LS_ROSTER_T, new Date().toISOString());
}
